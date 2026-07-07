/**
 * CycleWarning — informational banner shown after `bd dep add`
 * returns an error indicating the new edge would close a cycle
 * (the `bd` CLI 1.0.5 itself rejects cycle-creating adds with a
 * non-zero exit and a "cycle" message in stderr; this banner
 * surfaces that to the user).
 *
 * ponytail: the warning is INFORMATIONAL, not destructive. The
 * destructive styling reserved for AC-14 stays on the Delete
 * button in `IssueActions`. This banner uses the high-contrast
 * mono pairing (`mono0` text on `mono9` background, `mono3`
 * border) — same surface as every other informational strip in
 * the deps module.
 *
 * State: controlled component — the parent owns visibility and
 * dismisses by setting the banner hidden. No internal state.
 */
import type { CSSProperties } from 'react'
import { colors, space, type } from '@/lib/design-tokens'
import { iconButtonStyle } from '@/lib/form-styles'

export interface CycleWarningProps {
  /** The cycle description to display (e.g. "A → B → C → A"). */
  message: string
  /** Fired when the user clicks the dismiss `[X]`. */
  onDismiss: () => void
}

export function CycleWarning({ message, onDismiss }: CycleWarningProps) {
  return (
    <div data-testid="cycle-warning" role="status" style={containerStyle}>
      <span style={textStyle}>
        <span style={labelStyle}>Cycle detected:</span> {message}
      </span>
      <button
        type="button"
        data-testid="cycle-warning-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss cycle warning"
        style={iconButtonStyle}
      >
        ×
      </button>
    </div>
  )
}

const containerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[3],
  backgroundColor: colors.mono9,
  color: colors.mono0,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[3],
  paddingBlock: space[2],
}

const textStyle: CSSProperties = {
  flex: 1,
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  color: colors.mono0,
}

const labelStyle: CSSProperties = {
  fontWeight: type.fontWeight.bold,
  color: colors.mono0,
}
