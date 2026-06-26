import type { CSSProperties } from 'react'
import { palette } from '@/lib/design-tokens'

/**
 * Palette mapping for the canonical v1 status names. Any
 * unknown / custom status falls back to `palette.textMuted`
 * (a neutral grey) so the dot renders readably without
 * inventing a colour for a status the palette wasn't designed
 * around.
 */
const colorByStatus: Record<string, string> = {
  open: palette.statusOpen,
  in_progress: palette.statusInProgress,
  blocked: palette.statusBlocked,
  closed: palette.statusClosed,
  deferred: palette.statusDeferred,
}

export interface StatusDotProps {
  /**
   * Any status string — the canonical v1 names get their
   * palette colour, custom / unknown statuses fall back to the
   * neutral muted colour. See [`StatusPill`] for the prop
   * contract.
   */
  status: string
  size?: number
  className?: string
  'data-testid'?: string
}

export function StatusDot({
  status,
  size = 8,
  className,
  ...rest
}: StatusDotProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: 9999,
    backgroundColor: colorByStatus[status] ?? palette.textMuted,
    display: 'inline-block',
    flexShrink: 0,
  }
  return (
    <span
      style={style}
      aria-label={status}
      role="img"
      className={className}
      {...rest}
    />
  )
}

export default StatusDot
