#!/usr/bin/env bash
# scripts/make-fixture.sh -- deterministic Beads fixture (M0 spec R2).
#
# Usage:
#   scripts/make-fixture.sh <target_dir>
#
# Creates a fresh Beads workspace at <target_dir> (init'd via
# `bd init --quiet`) and seeds a KNOWN dataset satisfying the M0
# acceptance criteria:
#   - >=20 issues across ALL statuses (open, in_progress, blocked,
#     deferred, closed)
#   - >=2 epics, each with >=1 parent-child child
#   - >=3 dependency edges, including one multi-hop *blocked chain*
#     (each link carries an open blocker, so `bd ready` excludes it)
#   - several labels across issues
#   - at least one `bd ready` item and one blocked item
#
# **ID contract (NON-DETERMINISTIC):**
# Beads hashes issue IDs from the repo prefix + creation order + a
# per-repo random component. Identical inputs on a freshly-init'd
# repo therefore produce DIFFERENT IDs every time. This script
# captures every created ID as it goes and writes a stable mapping
# to `$TARGET_DIR/.fixture-ids.json` so downstream consumers
# (Rust integration tests, E2E smoke tests) can reference issues by
# their *role* (e.g. `EPIC_AUTH`, `TASK_OPT`) without re-discovering
# them from `bd list`.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <target_dir>" >&2
  exit 64
fi

TARGET_DIR="$1"

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

# Create one issue, print its ID on stdout. `--silent` returns just
# the ID so we can capture it without parsing JSON.
create() {
  local title="$1"
  shift
  bd create --title "$title" --silent "$@"
}

# Set an issue's status.
set_status() {
  bd update --quiet --status "$2" "$1" >/dev/null
}

# Wire `blocker` blocks `blocked`.
add_blocker() {
  bd dep "$1" --blocks "$2" --quiet >/dev/null
}

# Two epics (acceptance: >=2 epics, each with >=1 parent-child child).
EPIC_AUTH=$(create "Auth epic" --type epic --priority 1 --labels epic,security)
EPIC_PERF=$(create "Perf epic" --type epic --priority 2 --labels epic,performance)

# Epic children
TASK_LOGIN=$(create "Login form" --type task --priority 2 --labels auth,frontend --parent "$EPIC_AUTH")
TASK_OAUTH=$(create "OAuth setup" --type task --priority 1 --labels auth,backend --parent "$EPIC_AUTH")
TASK_PWRESET=$(create "Password reset" --type task --priority 3 --labels auth,backend --parent "$EPIC_AUTH")
TASK_CACHE=$(create "Profile cache" --type task --priority 2 --labels perf,cache --parent "$EPIC_PERF")
TASK_OPT=$(create "Optimize queries" --type task --priority 1 --labels perf,backend --parent "$EPIC_PERF")

# Standalone (acceptance: >=20 total).
# 2 epics + 5 children + 18 standalones = 25 issues.
TASK_MIGRATE=$(create "Migrate DB" --type task --priority 1 --labels backend,tech-debt)
TASK_LOG=$(create "Add structured logging" --type task --priority 3 --labels infra)
TASK_DOCS=$(create "Update user docs" --type chore --priority 4 --labels docs)
TASK_NAV=$(create "Fix nav bug" --type bug --priority 2 --labels bug,frontend)
TASK_TESTS=$(create "Write integration tests" --type task --priority 1 --labels testing)
TASK_DEBT=$(create "Tech debt cleanup" --type chore --priority 4 --labels tech-debt)
TASK_REFAC=$(create "Refactor auth layer" --type task --priority 2 --labels refactor,auth)
TASK_AUDIT=$(create "Security audit" --type task --priority 1 --labels security)
TASK_BUG1=$(create "Fix bug #1" --type bug --priority 3 --labels bug)
TASK_BUG2=$(create "Fix bug #2" --type bug --priority 2 --labels bug)
TASK_FEAT=$(create "Add dark mode toggle" --type feature --priority 3 --labels frontend,feature)
TASK_INV=$(create "Investigate crash" --type task --priority 1 --labels bug,investigation)
TASK_CI=$(create "Setup CI pipeline" --type chore --priority 2 --labels infra,docs)
TASK_UX=$(create "Improve UX" --type task --priority 4 --labels frontend)
TASK_DARK=$(create "Dark mode polish" --type task --priority 3 --labels frontend)
TASK_DEPS=$(create "Audit dependencies" --type chore --priority 2 --labels security)
TASK_BUILD=$(create "Optimize build" --type chore --priority 4 --labels perf,infra)
TASK_BUG3=$(create "Fix bug #3" --type bug --priority 2 --labels bug)

# Status distribution -- covers all 5 statuses.
#   closed:      8  (Login form, Update user docs, Fix nav bug,
#                       Fix bug #1, Fix bug #2, Investigate crash,
#                       Setup CI pipeline, Fix bug #3)
#   in_progress: 3  (OAuth setup, Write integration tests, Audit deps)
#   deferred:    2  (Tech debt cleanup, Improve UX)
#   blocked:     2  (Optimize queries, Refactor auth layer -- set below)
#   open:        10  (rest: epics + remaining children + standalones)
set_status "$TASK_LOGIN" closed
set_status "$TASK_DOCS" closed
set_status "$TASK_NAV" closed
set_status "$TASK_BUG1" closed
set_status "$TASK_BUG2" closed
set_status "$TASK_INV" closed
set_status "$TASK_CI" closed
set_status "$TASK_BUG3" closed
set_status "$TASK_OAUTH" in_progress
set_status "$TASK_TESTS" in_progress
set_status "$TASK_DEPS" in_progress
set_status "$TASK_DEBT" deferred
set_status "$TASK_UX" deferred

# Dependencies (acceptance: >=3 edges, incl. one blocked chain).
#   chain A: MIGRATE (open) -> OPT -> CACHE
#   edge B:  REFAC  -> LOGIN   (TASK_LOGIN's blocks deps: REFAC)
#   edge C:  INV    -> BUG1    (TASK_BUG1's blocks dep: INV)
#   edge D:  OAUTH  -> LOGIN   (TASK_LOGIN's blocks deps: OAUTH)
#
# ponytail: `add_blocker <blocker> <blocked>` mirrors `bd dep <from>
# --blocks <to>` — the first arg is the blocker (the upstream task),
# the second is the dependent (the downstream task). The R4
# spec asserts that TASK_LOGIN's Deps tab renders rows pointing
# at TASK_REFAC and TASK_OAUTH; for those rows to appear, TASK_LOGIN
# must depend on REFAC and OAUTH, which means REFAC and OAUTH
# must be the blockers. The previous fixture had the args swapped
# (LOGIN blocking REFAC/OAUTH instead), so TASK_LOGIN's
# `bd show --json` `dependencies` array contained only the
# parent_child entry for EPIC_AUTH — the spec's
# `deps-section-blocks` selector never appeared in the DOM and
# `waitForDisplayed` timed out after 5 s.
add_blocker "$TASK_MIGRATE" "$TASK_OPT"
add_blocker "$TASK_OPT" "$TASK_CACHE"
add_blocker "$TASK_REFAC" "$TASK_LOGIN"
add_blocker "$TASK_INV" "$TASK_BUG1"
add_blocker "$TASK_OAUTH" "$TASK_LOGIN"

# Explicit status=blocked.
set_status "$TASK_OPT" blocked
set_status "$TASK_REFAC" blocked

# Descriptions (M1 R4). A couple of issues get real prose so the
# E2E spec for the detail panel can assert on deterministic text.
# TASK_LOGIN also has 2 deps (REFAC + OAUTH), so the same issue
# covers description + dependencies + metadata in one drawer open.
# TASK_BUG1 also has 1 dep (INV) for a second deterministic pick.
bd update --quiet --description "Replace the legacy login form with the new email-first flow. Includes captcha fallback and audit-log wiring." "$TASK_LOGIN" >/dev/null
bd update --quiet --description "Reproduce the cache-invalidation bug on rapid refresh; document steps in the linked ticket." "$TASK_BUG1" >/dev/null

# Persist ID mapping for downstream consumers.
cat >"$TARGET_DIR/.fixture-ids.json" <<JSON
{
  "EPIC_AUTH": "$EPIC_AUTH",
  "EPIC_PERF": "$EPIC_PERF",
  "TASK_LOGIN": "$TASK_LOGIN",
  "TASK_OAUTH": "$TASK_OAUTH",
  "TASK_PWRESET": "$TASK_PWRESET",
  "TASK_CACHE": "$TASK_CACHE",
  "TASK_OPT": "$TASK_OPT",
  "TASK_MIGRATE": "$TASK_MIGRATE",
  "TASK_LOG": "$TASK_LOG",
  "TASK_DOCS": "$TASK_DOCS",
  "TASK_NAV": "$TASK_NAV",
  "TASK_TESTS": "$TASK_TESTS",
  "TASK_DEBT": "$TASK_DEBT",
  "TASK_REFAC": "$TASK_REFAC",
  "TASK_AUDIT": "$TASK_AUDIT",
  "TASK_BUG1": "$TASK_BUG1",
  "TASK_BUG2": "$TASK_BUG2",
  "TASK_FEAT": "$TASK_FEAT",
  "TASK_INV": "$TASK_INV",
  "TASK_CI": "$TASK_CI",
  "TASK_UX": "$TASK_UX",
  "TASK_DARK": "$TASK_DARK",
  "TASK_DEPS": "$TASK_DEPS",
  "TASK_BUILD": "$TASK_BUILD",
  "TASK_BUG3": "$TASK_BUG3"
}
JSON

echo "Fixture created at $TARGET_DIR"
echo "  issues:    25 (2 epics + 5 epic children + 18 standalone)"
echo "  statuses:  open(10) in_progress(3) blocked(2) deferred(2) closed(8)"
echo "  edges:     5 dependency edges incl. 2-hop blocked chain (MIGRATE -> OPT -> CACHE)"
echo "  desc:      TASK_LOGIN + TASK_BUG1 carry deterministic prose for R4 E2E"
echo "  ids:       $TARGET_DIR/.fixture-ids.json"
