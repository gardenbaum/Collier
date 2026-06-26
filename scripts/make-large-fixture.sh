#!/usr/bin/env bash
# scripts/make-large-fixture.sh -- large Beads fixture for the M6
# performance pass + the corresponding E2E spec.
#
# Usage:
#   scripts/make-large-fixture.sh <target_dir> [issue_count]
#
# Creates a fresh Beads workspace at <target_dir> and seeds >=1000
# issues using `bd import` (one JSONL round-trip, sub-second) so the
# M6 perf spec (tests/e2e/m6-perf-large-backlog.spec.ts) can drive
# the GUI with a backlog that would be impractical to seed one
# `bd create` call at a time (~17s per 50 issues -> 6 minutes for
# 1000). The script mirrors the contract of scripts/make-fixture.sh
# (writes `.fixture-ids.json` for downstream consumers, prints a
# summary on stdout) but is intentionally kept separate so the
# default 25-issue fixture stays cheap for the other 12+ E2E specs.
#
# Layout:
#   - <count> epics evenly spaced (every Nth issue is type=epic so
#     a 1200-issue fixture has ~120 epics; EpicView can virtualise
#     past the 200-row spec ceiling)
#   - 4 children per epic (parent-child) so the epic tree renders
#     a non-trivial subtree even at scale
#   - The remainder are standalones (task/bug/feature/chore) with
#     a wide status distribution so every filter chip has data
#   - A small set of cross-issue blocks dependencies + a 3-hop
#     blocked chain so the dep graph stays interesting
#
# ID contract: matches make-fixture.sh -- Beads hashes IDs from the
# repo prefix + creation order + a per-repo random component, so
# the IDs are NON-DETERMINISTIC across invocations. The script
# captures every created ID as it goes and writes a stable mapping
# to `$TARGET_DIR/.fixture-ids.json` so the E2E spec can reference
# issues by their *role* (e.g. `EPIC_AUTH`) without re-discovering
# them from `bd list`.
#
# Default issue count is 1200 so the perf spec exercises ~100
# rows above the spec ceiling (1000) without requiring the script
# to take more wall-clock than the test budget allows.

set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: $0 <target_dir> [issue_count]" >&2
  exit 64
fi

TARGET_DIR="$1"
ISSUE_COUNT="${2:-1200}"

if [[ ! "$ISSUE_COUNT" =~ ^[0-9]+$ || "$ISSUE_COUNT" -lt 1000 ]]; then
  echo "error: issue_count must be an integer >= 1000 (got '$ISSUE_COUNT')" >&2
  exit 1
fi

if [[ -d "$TARGET_DIR" && -n "$(ls -A "$TARGET_DIR" 2>/dev/null || true)" ]]; then
  echo "error: target dir '$TARGET_DIR' is not empty" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

# Bootstrap: git + bd. `bd init` needs a git repo (it auto-commits
# issues via Dolt); --quiet suppresses the Claude/Code integration
# prompts that would otherwise hang a headless run.
git init -q
bd init --quiet >/dev/null

# Build the JSONL payload for `bd import`. We allocate counts so the
# total hits ISSUE_COUNT exactly:
#   - EPICS:        ISSUE_COUNT / 10 (every 10th issue is an epic)
#   - CHILDREN:     4 children per epic
#   - STANDALONES:  the remainder
# 1200 -> 120 epics, 480 children, 600 standalones. The 4:1 child
# ratio gives EpicView 480 children total -- a meaningful "many"
# for the virtualizer assertion below.
EPICS=$((ISSUE_COUNT / 10))
CHILDREN=$((EPICS * 4))
STANDALONES=$((ISSUE_COUNT - EPICS - CHILDREN))

echo "Building JSONL payload: $EPICS epics + $CHILDREN children + $STANDALONES standalones = $ISSUE_COUNT issues..."

# Generate the JSONL via Python. We deliberately skip the parent
# field on import (bd import silently drops it -- see the
# confirmation in the bash comments below); we wire parent-child
# via `bd dep add --file` after import so the dependency graph
# stays the single source of truth (per docs/CONSTITUTION.md §3,
# `bd` is the only writer to `.beads/`).
PAYLOAD_FILE="$(mktemp -t make-large-fixture-XXXXXX.jsonl)"
python3 - "$EPICS" "$CHILDREN" "$STANDALONES" >"$PAYLOAD_FILE" <<'PYEOF'
import json
import sys

epics = int(sys.argv[1])
children = int(sys.argv[2])
standalones = int(sys.argv[3])

# Status distribution: every status gets a slice so the filter
# chips in the sidebar all have data. 40% closed (the typical
# "lots of history" case), 20% in_progress (active work), 15%
# blocked (live blockers), 10% deferred, 15% open (still triage).
# Distribute deterministically by index modulo.
STATUSES = ["closed", "closed", "closed", "closed",
            "in_progress", "in_progress",
            "blocked",
            "deferred",
            "open", "open", "open"]
# Priorities cycle through P0..P4 so the priority sort column is
# non-trivial at scale.
PRIORITIES = [0, 1, 2, 3, 4]
TYPES_STANDALONE = ["task", "bug", "feature", "chore"]

idx = 0

# Epics first (so we can use their IDs as parent for children).
# Title includes the role so downstream consumers can grep.
for i in range(epics):
    status = STATUSES[i % len(STATUSES)]
    priority = PRIORITIES[i % len(PRIORITIES)]
    obj = {
        "title": f"perf-epic-{i:04d}",
        "issue_type": "epic",
        "priority": priority,
        "status": status,
        "labels": ["perf", "epic"],
    }
    print(json.dumps(obj))
    idx += 1

# Standalones next (placed BEFORE children in the file so the
# subsequent parent-child wiring step can rely on the first EPICS
# IDs being the epic IDs -- the import preserves creation order
# in its `ids` response).
for i in range(standalones):
    status = STATUSES[(idx + i) % len(STATUSES)]
    priority = PRIORITIES[(idx + i) % len(PRIORITIES)]
    itype = TYPES_STANDALONE[(idx + i) % len(TYPES_STANDALONE)]
    obj = {
        "title": f"perf-standalone-{i:05d}",
        "issue_type": itype,
        "priority": priority,
        "status": status,
        "labels": ["perf", itype],
    }
    print(json.dumps(obj))
    idx += 1

# Children last (their IDs come AFTER the epics + standalones in
# the import response, so we know the first EPICS IDs are the
# epic IDs and we map child i to epic i % EPICS).
for i in range(children):
    status = STATUSES[(idx + i) % len(STATUSES)]
    priority = PRIORITIES[(idx + i) % len(PRIORITIES)]
    obj = {
        "title": f"perf-child-{i:05d}",
        "issue_type": "task",
        "priority": priority,
        "status": status,
        "labels": ["perf", "child"],
    }
    print(json.dumps(obj))
    idx += 1

assert idx == epics + standalones + children, f"BUG: index drift ({idx} != {epics + standalones + children})"
PYEOF

# Import. `--dolt-auto-commit=off` skips a Dolt commit per import
# (the default `off` already does, but be explicit so a future
# config change can't silently re-introduce per-issue commits and
# balloon the wall-clock). `--json` so we can capture the IDs.
IMPORT_RESULT="$(bd import "$PAYLOAD_FILE" --dolt-auto-commit=off --json)"
echo "bd import done."

# Pull IDs out in creation order. The import returns the IDs in
# the same order they appeared in the JSONL (confirmed by the M6
# spike in this commit's PR description). The first $EPICS are the
# epics, the next $STANDALONES are standalones, and the last
# $CHILDREN are children.
ALL_IDS="$(python3 -c "
import json
result = json.loads('''$IMPORT_RESULT''')
ids = result['ids']
epics = $EPICS
standalones = $STANDALONES
children = $CHILDREN
assert len(ids) == epics + standalones + children, f\"BUG: id count {len(ids)} != {epics + standalones + children}\"
print('\n'.join(ids))
")"

# Split ALL_IDS into three files for the next step.
#
# We persist ALL_IDS to a tmp file ONCE and then split it with sed,
# because the original `echo "$ALL_IDS" | tail -n "+N" | head -n M`
# pipeline races under `set -euo pipefail`: head exits after M lines
# and closes its stdin, which causes tail's next write to SIGPIPE
# (exit 141). Whether that surfaces as a script-level error is
# timing-dependent — locally the 1200-line seed always finished
# before head exited, but on a CI runner the same script failed
# with "tail: write error: Broken pipe". The single-file sed
# approach sidesteps the race entirely.
EPIC_IDS_FILE="$(mktemp -t make-large-fixture-epics-XXXXXX.txt)"
STANDALONE_IDS_FILE="$(mktemp -t make-large-fixture-standalones-XXXXXX.txt)"
CHILD_IDS_FILE="$(mktemp -t make-large-fixture-children-XXXXXX.txt)"
ALL_IDS_FILE="$(mktemp -t make-large-fixture-all-XXXXXX.txt)"
printf '%s\n' "$ALL_IDS" >"$ALL_IDS_FILE"
sed -n "1,${EPICS}p" "$ALL_IDS_FILE" >"$EPIC_IDS_FILE"
sed -n "$((EPICS + 1)),$((EPICS + STANDALONES))p" "$ALL_IDS_FILE" >"$STANDALONE_IDS_FILE"
sed -n "$((EPICS + STANDALONES + 1)),\$p" "$ALL_IDS_FILE" >"$CHILD_IDS_FILE"
rm -f "$ALL_IDS_FILE"

# Wire parent-child via `bd dep add --file` (bulk JSONL import).
# `bd import` silently drops the `parent` field on import (verified
# in the spike for this card), so we add the edges afterwards.
# This is consistent with the M6 perf card's perf budget: a single
# subprocess bulk-wires all 480 edges in < 5s instead of ~480
# individual `bd dep add` calls (~3 minutes).
DEP_FILE="$(mktemp -t make-large-fixture-deps-XXXXXX.jsonl)"
python3 - "$EPIC_IDS_FILE" "$CHILD_IDS_FILE" "$CHILDREN" "$EPICS" >"$DEP_FILE" <<'PYEOF'
import sys

epic_path, child_path, n_children, n_epics = sys.argv[1:5]
n_children = int(n_children)
n_epics = int(n_epics)

with open(epic_path) as ef, open(child_path) as cf:
    epic_ids = [line.strip() for line in ef if line.strip()]
    child_ids = [line.strip() for line in cf if line.strip()]

assert len(epic_ids) == n_epics, f"BUG: epic count {len(epic_ids)} != {n_epics}"
assert len(child_ids) == n_children, f"BUG: child count {len(child_ids)} != {n_children}"

import json

# Children were created in batches of 4 per epic (in order),
# so child i belongs to epic floor(i / 4) % n_epics. Round-robin
# across epics keeps every epic with a non-empty subtree even
# if the standalones/children counts drift in a future revision.
for i, child_id in enumerate(child_ids):
    parent_id = epic_ids[(i // 4) % n_epics]
    obj = {"from": child_id, "to": parent_id, "type": "parent-child"}
    print(json.dumps(obj))
PYEOF

bd dep add --file "$DEP_FILE" >/dev/null
echo "Wired $CHILDREN parent-child edges."

# A handful of extra cross-issue `blocks` dependencies (including
# a 3-hop blocked chain) so the dependency graph stays
# non-trivial. We use standalones so the epic tree isn't
# contaminated with extra edges.
BLOCK_FILE="$(mktemp -t make-large-fixture-blocks-XXXXXX.jsonl)"
python3 - "$STANDALONE_IDS_FILE" >"$BLOCK_FILE" <<'PYEOF'
import json
import sys

with open(sys.argv[1]) as f:
    sids = [line.strip() for line in f if line.strip()]

assert len(sids) >= 30, f"BUG: need >= 30 standalones for blocks wiring, got {len(sids)}"

# 3-hop blocked chain (chain A: sids[0] -> sids[1] -> sids[2])
# plus 27 additional one-off `blocks` edges so the dependency
# graph has ~30 entries -- enough to make the dep graph view
# non-empty at scale without making the wire-up the bottleneck.
chain = [(sids[0], sids[1]), (sids[1], sids[2])]
others = [(sids[3 + 2 * i], sids[4 + 2 * i]) for i in range(27) if 5 + 2 * i < len(sids)]
for upstream, downstream in chain + others:
    obj = {"from": upstream, "to": downstream, "type": "blocks"}
    print(json.dumps(obj))
PYEOF

bd dep add --file "$BLOCK_FILE" >/dev/null
echo "Wired cross-issue blocks dependencies."

# Persist ID mapping for downstream consumers. We only surface
# role -> ID for the first few epics + standalones (enough for
# the E2E spec to navigate deterministically); the full ID list
# can always be re-derived via `bd list --json --all`.
FIRST_EPIC_ID="$(echo "$ALL_IDS" | head -n 1)"
FIRST_STANDALONE_ID="$(echo "$ALL_IDS" | sed -n "$((EPICS + 1))p")"
FIRST_CHILD_ID="$(echo "$ALL_IDS" | sed -n "$((EPICS + STANDALONES + 1))p")"
LAST_EPIC_ID="$(echo "$ALL_IDS" | sed -n "${EPICS}p")"
LAST_CHILD_ID="$(echo "$ALL_IDS" | tail -n 1)"

cat >"$TARGET_DIR/.fixture-ids.json" <<JSON
{
  "ISSUE_COUNT": $ISSUE_COUNT,
  "EPICS": $EPICS,
  "CHILDREN": $CHILDREN,
  "STANDALONES": $STANDALONES,
  "EPIC_FIRST": "$FIRST_EPIC_ID",
  "EPIC_LAST": "$LAST_EPIC_ID",
  "CHILD_FIRST": "$FIRST_CHILD_ID",
  "CHILD_LAST": "$LAST_CHILD_ID",
  "STANDALONE_FIRST": "$FIRST_STANDALONE_ID"
}
JSON

# Cleanup tmp files.
rm -f "$PAYLOAD_FILE" "$EPIC_IDS_FILE" "$STANDALONE_IDS_FILE" "$CHILD_IDS_FILE" "$DEP_FILE" "$BLOCK_FILE"

echo "Fixture created at $TARGET_DIR"
echo "  issues:    $ISSUE_COUNT ($EPICS epics + $CHILDREN children + $STANDALONES standalones)"
echo "  statuses:  closed(40%) in_progress(20%) blocked(15%) deferred(10%) open(15%)"
echo "  edges:     $CHILDREN parent-child + 29 cross-issue blocks incl. 2-hop blocked chain"
echo "  ids:       $TARGET_DIR/.fixture-ids.json"