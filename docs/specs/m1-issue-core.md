# M1 — Issue Core

**Goal:** Complete the main issue view into a polished, fast, fully-interactive core —
Beadbox parity for day-to-day issue work — building on M0's green Xvfb E2E harness.
Every card extends the E2E suite; the milestone PR auto-merges once CI (incl. e2e) is green.

## Requirements

### R1 — Table & sortable columns

Issue list renders explicit columns (id, title, status, priority, type, assignee) with
badges/icons. Column headers sort the list (status, priority, type, assignee, id; asc/desc toggle).

- **E2E:** clicking a sort header reorders the rendered rows deterministically.

### R2 — Filter sidebar

Filter the list by status, priority, type, assignee, and label. Multiple filters combine (AND);
active filters are visible and clearable. Reuse the existing FilterSidebar / Labels panel.

- **E2E:** applying a status filter reduces the visible rows to only matching issues; clearing restores them.

### R3 — Inline editing

Change an issue's status, priority, and assignee directly (from the row and/or detail), persisted
via `bd update`. Optimistic UI, then reconcile with the file-watcher. Never write `.beads/` directly.

- **E2E:** change a row's status inline; assert it persists (a re-query / watcher update shows the new status).

### R4 — Detail panel completeness

Issue detail shows description, labels, dependencies (as navigable links), comments, and metadata
(created/updated, assignee, priority, type). Description is editable (via `bd update`).

- **E2E:** open an issue's detail; assert description, dependencies, and metadata render.

## Acceptance (milestone)

- `bun run check:all` green; coverage thresholds (≥60% branches) hold or improve.
- The Xvfb **e2e** job green with the new R1–R4 flows added to the smoke/spec suite.
- One PR to `main`, **auto-merged** once all checks pass.

## Cards (bounded, dependency-ordered, dir: on feat/m1-issue-core)

1. **m1-table** (R1) — columns + sortable headers + E2E sort flow.
2. **m1-filters** (R2, dep: table) — filter sidebar wired to the list + E2E filter flow.
3. **m1-inline-edit** (R3, dep: filters) — inline status/priority/assignee via bd update + E2E.
4. **m1-detail** (R4, dep: inline-edit) — detail-panel completeness + E2E.
5. **m1-finalize** (lead, dep: detail) — check:all green, push, open PR, **enable auto-merge** (or poll checks then merge) + delete branch.

## Per-card contract

Cite docs/CONSTITUTION.md + this spec. One bounded concern. Gate-aware (no `!`, no empty `()=>{}`,
interface-not-type, `T[]`, `import type`). Add unit + E2E tests. `bun run check:all` exits 0.
Commit + `git push origin feat/m1-issue-core` after each logical step (push early so progress lands).
Only m1-finalize opens/merges the PR. Use absolute `/cli/bin/gh`; `bd` for Beads ops.
