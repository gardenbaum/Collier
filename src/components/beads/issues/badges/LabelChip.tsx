import type { CSSProperties, MouseEvent } from 'react'
import { X } from 'lucide-react'
import { space, type } from '@/lib/design-tokens'

export interface LabelChipProps {
  /** Label text shown in the chip. Rendered verbatim — caller passes an already-i18n'd string. */
  label: string
  /** Optional remove handler. When provided, renders an X button that calls it on click. */
  onRemove?: () => void
}

/**
 * Soft label tag — 1px translucent border on a slightly translucent
 * dark background, 4px radius (radius.xs). Renders a small X on the
 * right when `onRemove` is provided (otherwise just text).
 *
 * Uses `data-testid="label-chip"` for QA selectors. Accent is reserved
 * for destructive actions and P0 priority per AC-14 — labels stay on
 * the mono scale.
 */
export function LabelChip({ label, onRemove }: LabelChipProps) {
  const chipStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space[1],
    height: 20,
    paddingInline: space[2],
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    fontFamily: type.fontFamily.sans,
    fontSize: type.fontSize.xs,
    fontWeight: type.fontWeight.medium,
    lineHeight: type.lineHeight.tight,
    color: '#fafafa',
  }

  const buttonStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 12,
    height: 12,
    padding: 0,
    margin: 0,
    background: 'transparent',
    border: 0,
    color: '#fafafa',
    cursor: 'pointer',
  }

  const handleRemove = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    onRemove?.()
  }

  return (
    <span data-testid="label-chip" data-label={label} style={chipStyle}>
      <span>{label}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove label ${label}`}
          onClick={handleRemove}
          style={buttonStyle}
        >
          <X size={10} aria-hidden="true" />
        </button>
      )}
    </span>
  )
}
