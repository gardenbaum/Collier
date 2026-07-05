/**
 * KeyboardNavRow — the `<li>` wrapper shared by every flat issue list
 * (`IssueSummaryRow`, `SearchView`'s `SearchRow`).
 *
 * Why this exists
 * ---------------
 * `IssueSummaryRow` and `SearchView.SearchRow` were byte-identical
 * apart from the `data-testid` (`blocked-row` / `ready-row` /
 * `search-result-row`) and got flagged by `bun run jscpd` as an
 * 11-line / 52-token clone pair. The fragment they both carried was
 * the M5 keyboard-navigation contract:
 *
 *   - `data-testid`        — view-specific (the hook does not read it)
 *   - `data-kbd-nav="row"` — opts the element into the vim-nav hook
 *   - `data-row-id`        — moves with the cursor (used by j/k/Enter)
 *   - `data-issue-id`      — stable across re-renders (used by Enter)
 *   - `data-row-selected`  — "true" / "false" (used by tests + e2e)
 *   - `aria-selected`      — screen-reader hint
 *   - the `rowStyle` + `rowSelectedStyle` spread (from
 *     `./issue-summary-styles`)
 *
 * Drift between the two implementations would silently break the M5
 * cursor, so the contract now lives in one place.
 *
 * Scope
 * -----
 * This wrapper only handles the `<li>` shell + nav attributes + the
 * default row visual. It does NOT cover `IssueListView` (which uses
 * `<div role="row">` with gridcell children) or `EpicView` (which
 * uses `<li role="treeitem">` with `aria-level`/`aria-expanded` and a
 * measure ref). Those stay as-is — folding them in would balloon the
 * prop surface and is a separate refactor.
 *
 * See also
 *   - `../../hooks/use-keyboard-navigation` — the hook whose
 *     `[data-kbd-nav="row"][data-row-id]` selector this attribute set
 *     satisfies.
 *   - `./IssueSummaryRow` — one of the two call sites.
 *   - `./SearchView` — the other call site (the inline `SearchRow`).
 *   - `./issue-summary-styles` — source of `rowStyle` /
 *     `rowSelectedStyle`.
 */
import type { CSSProperties, ReactNode } from 'react'
import { rowStyle, rowSelectedStyle } from './issue-summary-styles'

export interface KeyboardNavRowProps {
  /**
   * The full `data-testid` for the row. The hook ignores this — it
   * only reads `data-kbd-nav` + `data-row-id` — but the per-view test
   * suites (`BlockedView.test.tsx`, `ReadyView.test.tsx`,
   * `SearchView.test.tsx`) pin against it.
   */
  testid: string
  /**
   * The issue id this row represents. Emitted as both `data-row-id`
   * and `data-issue-id`: the former moves with the cursor (the hook's
   * selector), the latter is stable and lets Enter find the issue
   * even after the cursor has moved off.
   */
  rowId: string
  /**
   * When true, the row gets the keyboard-selection visual (the
   * `rowSelectedStyle` overlay) and `aria-selected="true"`.
   */
  isSelected: boolean
  /** Row content (badges, title, action button, etc.). */
  children: ReactNode
  /**
   * Optional style override. Merged AFTER the default `rowStyle` /
   * `rowSelectedStyle` spread, so callers can override individual
   * properties (e.g. add a hover state) without losing the base.
   */
  style?: CSSProperties
}

export function KeyboardNavRow({
  testid,
  rowId,
  isSelected,
  children,
  style,
}: KeyboardNavRowProps) {
  return (
    <li
      data-testid={testid}
      data-kbd-nav="row"
      data-row-id={rowId}
      data-issue-id={rowId}
      data-row-selected={isSelected ? 'true' : 'false'}
      aria-selected={isSelected}
      style={{
        ...rowStyle,
        ...(isSelected ? rowSelectedStyle : null),
        ...style,
      }}
    >
      {children}
    </li>
  )
}
