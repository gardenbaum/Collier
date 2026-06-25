# M4 — Real-time sync polish

**Goal:** Replace the catch-all `beads-data-changed` invalidation with a
**targeted** per-issue event stream so external mutations (`bd update …`
from a sibling shell, an editor save that rewrites `.beads/issues.jsonl`,
or a sync hook) flow into the active view in **≤ ~1 s** without a manual
refresh and without triggering a full-list re-render.

M4's first card (the multi-workspace switcher, R9) shipped on
`feat/m4-workspace`. This is the second card: M4 R10.

## Why "targeted" matters today

The current Rust watcher (see `src-tauri/src/beads/watcher.rs` →
`BeadsDataChangedPayload`) fires a single `beads-data-changed` event
on every JSONL touch. The React layer (`useBeadsInvalidation`) reacts
by invalidating the **entire** `['beads']` query-key namespace, which
triggers TanStack Query to refetch **every** active beads query
(`['beads','list',…]`, `['beads','show',cwd,id]`,
`['beads','comments',cwd,id]`, `['beads','history',cwd,id]`, …).
For a workspace with N mounted detail drawers and a list of M rows,
that's N + 1 refetches per external mutation — even though exactly
one issue changed.

The `InlineIssueEdit` `onSuccess` handler even calls this out
explicitly (`src/components/beads/issues/InlineIssueEdit.tsx` line
~268): "the watcher will fire beads-data-changed within ~1 s and
TanStack will refetch every list variant." The card replaces that
generic invalidation with per-issue cache patches.

## Requirements

### R10 — Per-issue real-time sync

- **Snapshot diff on the Rust side.** The watcher keeps an in-memory
  baseline of every issue ID it has seen (populated lazily on the
  first event for a repo). On every JSONL change after that, it
  re-reads `.beads/*.jsonl`, diffs against the baseline, and emits
  one or more of:
  - `beads-issue-created` — payload `{ repo_path, issue }` (full
    `Issue` so the React side can populate list + show caches
    without an extra round trip).
  - `beads-issue-updated` — payload `{ repo_path, issue }` (same
    shape; the React side overwrites the cached row).
  - `beads-issue-deleted` — payload `{ repo_path, issue_id }` (the
    React side removes the row from list caches and drops the
    matching `['beads','show',cwd,id]` query).
  - `beads-data-reset` — payload `{ repo_path, count }`. Emitted
    once when the watcher first sees a repo (no baseline yet); the
    React side falls back to a broad `['beads']` invalidation for
    that single event so the existing queries settle without us
    having to back-fill every cache variant. After the first
    baseline, this event is **never** re-emitted unless the repo
    changes.
- **The existing `beads-data-changed` event keeps firing** for
  backward compatibility (R3 / inline-edit code paths still rely
  on it for the "Data refreshed" toast), but the React side no
  longer triggers a broad query invalidation off it — it only
  surfaces the toast. All real UI updates flow through the
  targeted events.
- **End-to-end latency target:** the row's rendered
  `data-issue-status` reflects the new value within **≤ ~1 s** of
  the external `bd update` write. Measured at the E2E layer with a
  1.5 s upper-bound `waitUntil` so the assertion isn't flaky on
  CI cold-start.
- **No full-list re-render.** The targeted events patch the
  matching row in every cached list variant and the matching
  detail query (if mounted). Unrelated rows MUST NOT re-render.
  This is asserted in the unit tests via a render-counter spy
  on `IssueListView`.

The diff engine is a pure function over `(old_snapshot, new_issues)`
so the bulk of the logic is unit-testable without spinning up a
`notify` watcher.

### Out of scope (for this card)

- **Comments / history / dep-graph reactivity.** The targeted
  events cover the list + show queries because that's the surface
  an external `bd update` lands on. Comments / history / dep-graph
  are refetched lazily by TanStack on the next mount or window
  focus; that's the same contract as before R10.
- **Optimistic UI for external mutations.** If a user runs `bd
  update` from a sibling shell, the GUI catches up via R10 — but
  this card does NOT add an "unsaved local change" warning. Out of
  scope; would belong on a separate card if a user ever asks for
  it.

## Acceptance (this card)

- `bun run check:all` green; coverage thresholds (≥60% branches)
  hold or improve.
- E2E spec `tests/e2e/r10-realtime-sync.spec.ts` passes under the
  existing Xvfb job:
  - opens the fixture workspace,
  - shells out to `bd update <id> --status=<alt>` from the test
    process (NOT through the UI),
  - asserts the rendered row's `data-issue-status` attribute
    updates within 1.5 s without any user interaction.
- The Xvfb E2E job stays green for every spec in the suite
  (regression guard against the targeted-event handler stomping
  on the existing inline-edit optimistic flow).

## Cards (bounded, dependency-ordered, dir: on feat/m4-workspace)

This card (R10) is the only card on the milestone branch for the
real-time-sync work. It satisfies the milestone's "real-time sync
polish" acceptance criterion in one shot because the diff engine
+ the cache patcher + the E2E test fit comfortably in a single
budget. The R9 card already shipped the multi-workspace switcher
on the same branch.

## Per-card contract

Cite `docs/CONSTITUTION.md` + this spec. One bounded concern.
Gate-aware (no `!`, no empty `()=>{}`, `interface` not `type`,
`T[]`, `import type`). Add unit + E2E tests. `bun run
check:all` exits 0. Commit + `git push origin
feat/m4-workspace` after each logical step (push early so
progress lands). Only the milestone's _finalize_ card opens/merges
the PR. Use absolute `/cli/bin/gh`; `bd` for Beads ops.

## Fixture data contract

No new fixture. The existing 25-issue fixture from
`scripts/make-fixture.sh` covers R10's contract: the E2E spec
picks an arbitrary open row, runs `bd update <id> --status=closed`
against it, and waits for the row's status pill to flip within
1.5 s. The unit tests on the diff engine use a hand-rolled
`Vec<Issue>` fixture with two known IDs and one mutated title.