# M3 — Dependency Graph

**Goal:** A graph view of every issue in the active workspace, with the
dependency edges that connect them. Build on M0–M2's foundation;
this milestone ships the "visual structure" view of the data layer —
complementary to the list / detail / epic / status views, not a
replacement.

The plan's deferred task T29 (`DependencyGraphView`) has been waiting
for a graph-viz library choice. M3 lands that decision and the
feature itself.

## Graph-viz library choice

Evaluated two libraries, mindful of the Tauri bundle (see
`docs/developer/bundle-optimization.md`):

| Library | Approx bundle cost | Pan/zoom | Custom nodes | License |
|---|---|---|---|---|
| `@xyflow/react` (React Flow) | ~150–200 KB min+gz, ships its own React renderer + d3-style internals | Built-in | Yes (React components) | MIT |
| `dagre` + hand-rolled SVG + ~50 lines of pointer-events pan/zoom | ~30 KB min+gz, one pure-JS layout dep | Hand-rolled | Yes (SVG primitives) | MIT / similar |

**Choice: dagre + SVG + hand-rolled pan/zoom.**

Why:

1. **Tauri bundle.** Collier's Rust binary is already ~25 MB; the
   webview bundle is the smaller of the two costs but still
   ships to every user. `@xyflow/react` would add ~5–7× more
   than `dagre` for a feature the user spends maybe 10% of
   their time in.
2. **Determinism over polish.** A dependency graph for ≤ ~500
   nodes (the realistic Beads workspace size per the
   constitution's "lists >200 rows" rule) is well-served by a
   straightforward DAG layout — no need for a full node-graph
   editor with custom edges, minimaps, or selection rectangles.
3. **No new React surface.** SVG is a stable DOM contract;
   tests can `querySelector('[data-testid="graph-node"]')` the
   same way they target `data-testid="epic-row"` today. The
   component stays inside the existing Bauhaus styling system
   (inline styles + design tokens), not a foreign React tree.

The pan/zoom math is ~50 lines (mouse drag → viewport translate,
wheel → viewport scale), no library needed.

If `@xyflow/react` ever becomes the right call (e.g. users want
to drag-edit edges, the graph becomes the primary view, or the
workspace routinely crosses 1k issues), the wrapper component's
prop signature stays the same; only the SVG renderer swaps.

## Requirements

### R7 — Dependency graph view

Render a directed graph for the active workspace:

- **Nodes:** every issue in `bd list --all` (so the closed ones
  are visible — same `--all` contract the M2 status view uses).
- **Edges:** the full dependency set, with these distinct
  visualizations per `DependencyType`:
  - `blocks` → solid arrow
  - `parent_child` → solid arrow into the parent epic
  - `related`, `tracks`, `discovered_from`, `caused_by`,
    `validates`, `supersedes`, `conditional_blocks`, `waits_for`
    → dashed arrow, de-emphasised colour
- **Blocked nodes highlighted:** any node whose status is
  `blocked` (i.e. has an open blocker — bd sets this
  automatically) gets a visible accent border + fill tint.
- **Pan / zoom:** pointer drag pans the viewport; wheel zooms
  around the cursor. `data-pan-x`, `data-pan-y`,
  `data-zoom` attributes expose the current transform so
  tests can assert without measuring pixels.
- **Click a node → open detail.** Calls the same
  `onOpenIssue(id)` callback the other views use; the parent
  router opens the issue drawer.

The Rust side exposes a single `bd_graph` command that returns
`{ nodes, edges }` in one shot (one `bd list --all` + N parallel
`bd show` calls) — the React side never fans out N queries.

**E2E:** switch to the Graph view; assert nodes + edges render;
assert at least one blocked node is highlighted; click a node
and assert the detail drawer mounts.

## Acceptance (milestone)

- `bun run check:all` green; coverage thresholds (≥60% branches)
  hold or improve.
- The Xvfb **e2e** job green with the new R7 flow added to the
  spec suite.
- One PR to `main`, **auto-merged** once all checks pass.

## Cards (bounded, dependency-ordered, dir: on feat/m3-depgraph)

1. **m3-rust-graph** — Rust `bd_graph` command + specta types
   + integration test on the fixture shape. (Foundation; no
   UI.)
2. **m3-graph-view** — `DepGraphView` React component
   (dagre + SVG + pan/zoom), wired into `ViewsRouter` +
   sidebar + workspace store. Unit tests for layout / blocked
   detection / click-through. E2E spec extending the existing
   `tests/e2e` harness.
3. **m3-finalize** — `check:all` green, push, open PR,
   enable auto-merge (or poll checks then merge) + delete
   branch.

## Per-card contract

Cite `docs/CONSTITUTION.md` + this spec. One bounded concern.
Gate-aware (no `!`, no empty `()=>{}`, `interface` not `type`,
`T[]`, `import type`). Add unit + E2E tests. `bun run
check:all` exits 0. Commit + `git push origin
feat/m3-depgraph` after each logical step (push early so
progress lands). Only `m3-finalize` opens/merges the PR. Use
absolute `/cli/bin/gh`; `bd` for Beads ops.

## Fixture data contract

The fixture from `scripts/make-fixture.sh` (25 issues, 5 dep
edges, 4 parent-child edges, 2 blocked statuses) covers the
R7 contract. The E2E spec asserts the graph view mounts and
renders ≥ 20 nodes + ≥ 5 dependency arrows + ≥ 1 blocked
highlight — exact numbers come from the fixture so a future
fixture change surfaces as an explicit spec update.
