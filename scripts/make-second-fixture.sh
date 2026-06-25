#!/usr/bin/env bash
# scripts/make-second-fixture.sh -- minimal second Beads fixture for the
# M4 workspace-switcher E2E.
#
# Usage:
#   scripts/make-second-fixture.sh <target_dir>
#
# Creates a fresh Beads workspace at <target_dir> (init'd via
# `bd init --quiet`) and seeds a SMALL, KNOWN dataset whose issue
# titles are distinct from the main fixture so the workspace-switch
# E2E can assert the list reloaded to a different workspace's
# issues. Contract:
#
#   - exactly 5 issues, one of which has the unique title
#     "M4 second workspace alpha" so the r9 spec can search by
#     title (not by hash-derived ID — IDs are non-deterministic
#     across `bd init` runs).
#   - all 5 issues are `open` so the list view shows every row
#     immediately after a switch.
#   - no epics, no dependencies — keeps the fixture minimal.
#
# The script writes `.second-fixture-ids.json` (parallel to the
# main fixture's `.fixture-ids.json`) for any test that wants
# explicit id references. r9-workspace-switch.spec.ts currently
# only needs the unique title to assert reload.

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

git init -q
bd init --quiet >/dev/null

create() {
  local title="$1"
  shift
  bd create --title "$title" --silent "$@"
}

# The first title is the contract — the r9 spec greps for it to
# confirm the second workspace's list rendered after a switch.
ALPHA=$(create "M4 second workspace alpha" --type task --priority 1)
BETA=$(create "M4 second workspace beta" --type task --priority 2)
GAMMA=$(create "M4 second workspace gamma" --type task --priority 3)
DELTA=$(create "M4 second workspace delta" --type task --priority 3)
EPSILON=$(create "M4 second workspace epsilon" --type bug --priority 1)

cat >"$TARGET_DIR/.second-fixture-ids.json" <<JSON
{
  "ALPHA": "$ALPHA",
  "BETA": "$BETA",
  "GAMMA": "$GAMMA",
  "DELTA": "$DELTA",
  "EPSILON": "$EPSILON"
}
JSON

echo "Second fixture created at $TARGET_DIR"
echo "  issues: 5 (all open, 4 task + 1 bug)"
echo "  ids:    $TARGET_DIR/.second-fixture-ids.json"