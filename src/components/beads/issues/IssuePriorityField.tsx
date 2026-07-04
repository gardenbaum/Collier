/**
 * IssuePriorityField — radio-button group for a Beads issue priority.
 *
 * Why this exists
 * ---------------
 * `IssueCreateForm` and `IssueUpdatePanel` both render a
 * `<div role="radiogroup">` over the closed `IssuePriority` enum
 * (P0..P4). The markup was byte-identical apart from the
 * `data-testid` prefix, the `aria-label`, and the styling
 * classNames — flagged by `bun run jscpd` as a 16-line clone pair.
 *
 * This component factors out the inner radiogroup so each parent
 * can drop its local copy. The parent supplies the `<Field>`
 * wrapper (each form has its own styling conventions for that) and
 * the classNames for the selected/unselected button states.
 *
 * Contract
 * --------
 *   - `value` is the controlled current selection.
 *   - `onChange` fires with the new value typed as
 *     `IssuePriority`; the parent doesn't need to cast.
 *   - `testIdPrefix` is concatenated with the priority (e.g.
 *     `"create-priority"` + `"P1"` → `"create-priority-P1"`) so
 *     existing tests keep working unchanged.
 *
 * `PRIORITIES` lives in `./beads-enums` (closed v1 Beads enum).
 */
import type { IssuePriority } from '@/lib/bindings'
import { PRIORITIES } from './beads-enums'

export interface IssuePriorityFieldProps {
  /** Controlled current selection. */
  value: IssuePriority
  /** Fires with the new value typed as `IssuePriority`. */
  onChange: (value: IssuePriority) => void
  /** Prefix for per-priority `data-testid` (e.g. `"create-priority"`). */
  testIdPrefix: string
  /** `aria-label` for the radiogroup wrapper. */
  ariaLabel: string
  /** Class for an unselected priority button. */
  buttonClassName: string
  /** Class for the currently-selected priority button. */
  buttonSelectedClassName: string
}

export function IssuePriorityField({
  value,
  onChange,
  testIdPrefix,
  ariaLabel,
  buttonClassName,
  buttonSelectedClassName,
}: IssuePriorityFieldProps): React.JSX.Element {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={ariaLabel}>
      {PRIORITIES.map(p => {
        const selected = p === value
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={selected}
            data-testid={`${testIdPrefix}-${p}`}
            onClick={() => onChange(p)}
            className={selected ? buttonSelectedClassName : buttonClassName}
          >
            {p}
          </button>
        )
      })}
    </div>
  )
}
