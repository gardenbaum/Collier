# M5 — Accessibility

**Goal:** Make Collier keyboard- and screen-reader-operable across the
data surfaces (issue table, epic tree, dialogs/drawers, filter controls),
building on M5's vim-style keyboard navigation. Every interactive
control exposes a programmatic name; the issue table is a real ARIA
grid (not a `<div>` masquerading as one); the epic tree is a real ARIA
tree (not a styled `<ul>`); every dialog/drawer is a real modal with
focus trap + restoration; the keyboard cursor and the focused element
stay in sync.

This card ships a single set of accessibility primitives that all
downstream UI cards compose against. Scope is deliberately the
user-visible affordances (the things a screen-reader user hits on first
contact); cosmetic focus rings and high-contrast palettes are
deliberately deferred to a follow-up visual-qa card so this milestone
stays bounded.

## Requirements

### R-Grid — Issue table is an ARIA grid

`<IssueListView>` exposes the columnar table as a real `role="grid"`:

- The scrolling container carries `role="grid"` plus `aria-rowcount`,
  `aria-colcount`, and `aria-label`.
- Each row is `role="row"` (NOT `role="button"`) and carries
  `aria-rowindex`, `aria-selected`, and an accessible name assembled
  from the row's id + title + status.
- Each cell is `role="gridcell"` (not a `<span>`). Sortable cells
  carry `aria-sort` on the parent `role="columnheader"` cell.
- The sortable headers keep their inner `<button>` so they remain
  keyboard-activatable, but the `aria-sort` lives on the
  `role="columnheader"` (per ARIA 1.2, aria-sort belongs to the column
  header, not the button).
- Roving `tabindex`: only the cursor row carries `tabindex=0`; every
  other row carries `tabindex=-1`. Tab lands once inside the grid; j/k
  (already wired by the M5 vim-nav hook) move the cursor; Enter opens
  the focused row.
- Filter chips at the top of the grid expose their action with
  `aria-label` and the row count.

E2E: a screen-reader (or a test) can query the active sort direction
via `aria-sort` on `[data-testid="sort-header-id-column"]`. Unit: a
rendered list with 3 issues exposes `role="grid"`, three `role="row"`
elements, and `aria-sort="ascending"` on the active header.

### R-Tree — Epic tree is an ARIA tree

`<EpicView>` exposes the collapsible hierarchy as a real `role="tree"`:

- The outer `<ul>` is upgraded to `role="tree"`.
- Each `<li>` row is `role="treeitem"` and carries
  `aria-expanded` (epic rows only), `aria-level`, `aria-posinset`,
  `aria-setsize`, and `aria-selected`.
- The chevron is a nested `role="button"` (children of a treeitem must
  be presentational nodes or interactive children — putting the expand
  control on the treeitem itself is forbidden because chevron click
  must not trigger row activation).
- The `<ul>` of children is `role="group"` (the ARIA tree's required
  child-container role).

Unit: rendered epic tree exposes `role="tree"`; collapsed epic row has
`aria-expanded="false"` and its child group is absent from the DOM.

### R-Dialogs — Modal dialogs are real modals

`<IssueDetailDrawer>`, `<SettingsPanel>`, `<IssueCreateForm>`, and
`<IssueUpdatePanel>` are all modal dialogs. The following invariants hold:

- `role="dialog"` + `aria-modal="true"` on the inner panel
  (overlay click-targets are presentational wrappers).
- `aria-labelledby` points at the dialog's `<h1>` heading so the dialog
  announces its title to AT, OR `aria-label` matches the heading text.
- Initial focus moves to the first interactive element (or a sensible
  default — the close button for read-only drawers, the first field
  for forms).
- Focus is trapped: Tab and Shift+Tab cycle within the dialog's
  focusables (IssueDetailDrawer already does this; the two form dialogs
  need it added).
- Escape closes the dialog. Click-on-overlay closes the dialog.
- On close, focus restores to the element that opened the dialog
  (IssueDetailDrawer already does this; the two form dialogs need it
  added).

Unit: `<IssueCreateForm>` opens with focus on `data-testid="create-title"`,
Escape blurs focus back to a caller-supplied ref, Tab from the last
field wraps to the first.

### R-Filters — Toggle controls expose pressed state

The sidebar's filter chips are toggle buttons, not navigation links:

- Each chip carries `aria-pressed` mirroring `data-active`.
- Each assignee/label toggle button (the ones in the
  Assignees/Labels lists) carries `aria-pressed` too.
- The "Clear all" button carries `aria-label="Clear all filters"` so
  screen readers don't read the × icon.

Unit: rendering the sidebar with one active status chip exposes
`aria-pressed="true"` on that chip and `aria-pressed="false"` on the
others.

### R-Keyboard — Cursor focus stays in sync with keyboard nav

When the M5 vim-nav hook moves the keyboard cursor via j/k:

- If the cursor lands on a row that is not currently focused,
  programmatically focus the cursor row (so screen-reader users hear
  the announcement when the row changes).
- Conversely, when the user tabs into the grid, the cursor moves to
  the focused row.
- Escape clears the cursor AND restores focus to the grid container
  (so subsequent Tab leaves the grid entirely — not into a now-empty
  row).

Unit: dispatching `j` twice on the issue list lands focus on the row
matching `selectedRowId` after a microtask flush.

## Acceptance (milestone)

- `bun run check:all` green; coverage thresholds (≥60% branches) hold or improve.
- Xvfb E2E job green; new `m5-accessibility` spec added alongside
  the existing `m5-keyboard-nav` spec.
- One PR to `main` per the milestone finalize card; auto-merge
  after CI green.

## Per-card contract

Cite docs/CONSTITUTION.md + this spec. One bounded concern. Gate-aware
(no `!`, no empty `()=>{}`, interface-not-type, `T[]`, `import type`).
Add unit + E2E tests. `bun run check:all` exits 0.

Commit + `git push origin feat/m5-keyboard` after each logical step
(push early so progress lands). Only the milestone's finalize card
opens the PR.

## Out of scope

- Visual focus rings (Bauhaus palette review; follow-up).
- High-contrast / dark-mode palette audit (follow-up).
- Live-region announcements on virtualized row changes (would require
  TanStack Virtual's rangeExtractor integration; deferred).
- Issue-detail internals (R-Detail above covers the dialog chrome,
  not every text field's accessible description).
- Keybinding discoverability overlay (a help sheet triggered by `?`
  is a separate card).
