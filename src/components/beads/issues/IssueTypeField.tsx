/**
 * IssueTypeField — single-select dropdown for a Beads issue type.
 *
 * Why this exists
 * ---------------
 * `IssueCreateForm` and `IssueUpdatePanel` both render a `<select>`
 * over the closed `IssueType` enum. The markup was byte-identical
 * apart from the `data-testid` and the styling className, and both
 * parents re-declared the same 7-element `ISSUE_TYPES` literal —
 * flagged by `bun run jscpd` as a 13-line / 116-token clone pair.
 *
 * This component factors out the inner `<select>` so each parent
 * can drop its local copy. The parent supplies the `<Field>`
 * wrapper (each form has its own styling conventions for that) and
 * the className for the `<select>`. The `data-testid` stays under
 * the parent's control so existing tests (`create-type`,
 * `update-type`) keep working unchanged.
 *
 * Contract
 * --------
 *   - `value` is the controlled current selection.
 *   - `onChange` fires with the new value already typed as
 *     `IssueType`; the parent doesn't need to cast.
 *
 * `ISSUE_TYPES` lives in `./beads-enums` (closed v1 Beads enum).
 */
import type { IssueType } from '@/lib/bindings'
import { ISSUE_TYPES } from './beads-enums'

export interface IssueTypeFieldProps {
  /** Controlled current selection. */
  value: IssueType
  /** Fires with the new value typed as `IssueType`. */
  onChange: (value: IssueType) => void
  /** `data-testid` for the underlying `<select>` (e.g. `"create-type"`). */
  testId: string
  /** Class for the `<select>` element (parent owns its styling). */
  selectClassName: string
}

export function IssueTypeField({
  value,
  onChange,
  testId,
  selectClassName,
}: IssueTypeFieldProps): React.JSX.Element {
  return (
    <select
      data-testid={testId}
      value={value}
      onChange={e => onChange(e.target.value as IssueType)}
      className={selectClassName}
    >
      {ISSUE_TYPES.map(t => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  )
}
