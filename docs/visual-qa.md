# Visual QA Plan

This document describes the visual regression baseline strategy for
the beads namespace. It is **documentation only** — no Playwright
tests are shipped yet. The plan records which surfaces need a baseline
screenshot, which tooling to use when the infrastructure lands, and
when to run the check.

## Why this document exists

The beads UI is intentionally strict about visual design: hard
edges, mono scale, design tokens, no `border-radius`, no
`shadow`, and the brand colour (`#c2410c`) reserved for
destructive actions and the P0 priority badge only. A pixel-level
regression check is the cheapest way to catch a token change that
quietly breaks the system.

## Components needing a baseline screenshot

### Bootstrap gates (5)

- `RepoSelection` (T9) — no recent repos
- `RepoSelection` (T9) — at least one recent repo
- `BdNotInPath` (T10) — blocking modal open
- `BdInitFlow` (T11) — initial render
- `BdInitFlow` (T11) — error state (toast visible)

### Issue list and detail (Wave 2 + 3)

- `IssueListView` — loading skeleton
- `IssueListView` — empty state
- `IssueListView` — error state
- `IssueListView` — populated (1000 issues, scrollable)
- `IssueDetailView` — Overview tab
- `IssueDetailView` — Comments tab
- `IssueDetailView` — Dependencies tab
- `IssueDetailView` — History tab

### Mutations

- `IssueCreateForm` (T21)
- `IssueUpdatePanel` (T22)
- `IssueActions` (T23) — open issue
- `IssueActions` (T23) — closed issue (Reopen button visible)
- `IssueActions` (T23) — delete confirmation panel expanded
- `CycleWarning` (T32)

### Dependencies

- `DependencyListView` — grouped by type (blocks, parent-child, related)
- `DependencyTreeView` — depth 3
- `DependencyListView` — empty (no deps)

### Badges (4 components)

- `StatusPill` (5 statuses)
- `PriorityDot` (5 priorities; P0 uses the brand colour)
- `TypeIcon` (7 types)
- `LabelChip` (with and without close button)

### Wave 6 read-only views

- `MoleculeView` (T37)
- `EpicsList` (T38)
- `SwarmView` (T39)
- `WorktreesView` (T40)
- `SyncStatus` (T41)
- `StatusOverview` (T42)

### Wave 7

- `RawCommandPanel` (T43)
- `QuickPane` (T44)
- `OutputRenderer` (T45)

### Wave 8 (this batch + polish)

- `EmptyStates` (T47) — all three variants
- `ErrorToasts` (T48) — toast with Retry action
- `SettingsPanel` (T50) — closed and open states

## Tooling

- **Playwright** (to be added when the suite is built; the
  template does not ship it). Pin a specific version in
  `package.json` to keep baselines stable.
- **Screenshot baseline** lives under
  `.omo/visual-baseline/`, one PNG per surface. Filename matches
  the `data-testid` of the rendered surface (e.g.
  `settings-panel.png`).
- **Diff threshold**: `<0.1%` pixel difference for pass. The
  threshold absorbs font-rendering jitter on macOS (Inter's hint
  table can shift anti-aliasing by 1px between runs) without
  hiding real regressions.
- **Per-platform baselines**: macOS, Windows, Linux. The
  mono+hard-edges aesthetic minimises cross-platform drift, but
  font metrics differ enough to warrant one baseline per OS.

## Scripts (to be added when the suite is built)

- `bun run test:visual` — runs the suite; diffs every screenshot
  against the matching baseline. Exits non-zero on any diff
  above the threshold.
- `bun run test:visual:update` — regenerates baselines. **Always
  explicit** (per AGENTS.md rule 9 — no unsolicited commits, no
  silent baseline rewrites). A PR that updates a baseline must
  include a justification in the description.

## When to run

- Before each release tag.
- After any change to `src/lib/design-tokens.ts` or to a
  `tailwind.config.*` that touches the design system layer.
- After a Lucide upgrade — the icon SVG paths change between
  versions and visual baselines will need a re-baseline (see T20
  learnings for the `CheckSquare` → `SquareCheck` rename story).

## Out of scope (for the document-only phase)

- Playwright installation, E2E user-flow tests, interaction
  recording — those land in a separate task once the suite is
  green and the baseline coverage is real.
- A11y visual diffs (axe-core / pa11y). The component contracts
  already encode `role` and `aria-label` attributes; a separate
  a11y suite is the right place to enforce those.
