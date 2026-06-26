/**
 * Virtualised-row sizing constants for the Epic tree view.
 *
 * Lives in a sibling file (rather than EpicView.tsx) because the
 * `react-refresh/only-export-components` lint rule requires
 * component files to export only React components — exporting
 * helpers + constants alongside the component triggers a
 * warning. Splitting the sizing math out keeps the HMR boundary
 * clean AND makes the math reusable from the unit test (which
 * imports `estimateRowHeight` directly).
 *
 * ponytail: the numbers are tuned against the visual layout in
 * EpicView.tsx's `epicRowStyle` (padding `space[3]` top/bottom
 * = 8px each) + a 1px border-bottom + ~55px of header content
 * (chevron + status pill + priority dot + title + id + progress
 * bar). If the header layout changes, re-measure in the browser
 * and update `COLLAPSED_ROW_HEIGHT` so the virtualizer's scrollbar
 * stays honest.
 *
 *   COLLAPSED_ROW_HEIGHT: the header alone (~72px including
 *     padding + border). Matches the actual rendered height for
 *     an epic with 0 children or an epic the user has collapsed.
 *   CHILD_ROW_HEIGHT:     the height of one child row (~32px,
 *     matches `childRowStyle`'s padding `space[2]` top/bottom).
 *   CHILD_GAP:            the 2px gap between children rows
 *     (matches `childrenListStyle`'s `gap: 2`).
 *   ROW_OVERSCAN:         virtualizer overscan on each side of
 *     the viewport. Matches IssueListView's 5.
 *   DEFAULT_CONTAINER_HEIGHT: the scroll container's pixel height
 *     when EpicView is mounted without an explicit prop. 600px
 *     fits a typical Tauri webview with the page header + sidebar
 *     + footer chrome.
 */
export const COLLAPSED_ROW_HEIGHT = 72
export const CHILD_ROW_HEIGHT = 32
export const CHILD_GAP = 2
export const ROW_OVERSCAN = 5
export const DEFAULT_CONTAINER_HEIGHT = 600

/**
 * Pure height estimator. Exported so the unit test can verify
 * the math without rendering. Production callers close over the
 * live `childrenByParent` map so the estimate reflects the
 * current data; the virtualizer measures actual heights on first
 * paint and `measure()` after toggle invalidates the cache.
 *
 * expandedHeight = COLLAPSED + (nChildren * CHILD_ROW) + ((nChildren - 1) * CHILD_GAP) + 4
 *
 * The trailing `+4` accounts for the children list's
 * `paddingBlockStart: space[1]` (4px). With 0 children the
 * children block is omitted entirely (no padding contribution).
 */
export function estimateRowHeight(
  isExpanded: boolean,
  childCount: number
): number {
  if (!isExpanded) return COLLAPSED_ROW_HEIGHT
  if (childCount === 0) return COLLAPSED_ROW_HEIGHT
  const childrenBlock =
    childCount * CHILD_ROW_HEIGHT + (childCount - 1) * CHILD_GAP
  return COLLAPSED_ROW_HEIGHT + childrenBlock + 4
}
