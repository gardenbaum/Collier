/**
 * Render an `IssuePriority` value as the human-readable "Pn" form.
 *
 * Accepts both shapes the wire data can take:
 *   - the bare integer 0..4 emitted by Rust's `#[repr(u8)] Serialize_repr`
 *     (this is what `bd list --json` actually returns at runtime)
 *   - the variant-name string union 'P0'..'P4' produced by the specta
 *     TS type generator (this is what `IssuePriority` is declared as)
 *
 * Falls back to `String(p)` when the input is none of those (e.g. an
 * out-of-range integer, NaN, or a non-P-prefixed string) so the DOM
 * always renders something rather than crashing the `<option>` map.
 *
 * Lives in its own file so the sibling component module
 * (`InlineIssueEdit.tsx`) stays components-only and keeps the
 * `react-refresh/only-export-components` lint happy.
 *
 * @internal — exported for unit-testing the defensive fallbacks.
 *             Production callers in `InlinePriorityEdit` only feed
 *             it values from `ALL_PRIORITIES` (string form) or
 *             `issue.priority` (bare integer form, via `priorityToValue`).
 */
import type { IssuePriority } from '@/lib/bindings'

export const priorityToLabel = (p: IssuePriority): string => {
  // ponytail: in practice the wire value is the bare integer 0..4;
  // when a specta-only string union slips through, map it back.
  if (typeof p === 'string' && p.startsWith('P')) {
    const n = Number.parseInt(p.slice(1), 10)
    if (Number.isFinite(n) && n >= 0 && n <= 4) return `P${n}`
    return p
  }
  const n = Number(p)
  if (Number.isFinite(n) && n >= 0 && n <= 4) return `P${n}`
  return String(p)
}
