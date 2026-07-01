import type { CSSProperties } from 'react'
import type { IssuePriority } from '@/lib/bindings'
import { palette } from '@/lib/design-tokens'

const colorByPriority: Record<IssuePriority, string> = {
  P0: palette.danger,
  P1: palette.textPrimary,
  P2: palette.textSecondary,
  P3: palette.textMuted,
  P4: palette.textDisabled,
}

export interface PriorityBadgeProps {
  priority: IssuePriority
  className?: string
  'data-testid'?: string
}

const style: CSSProperties = {
  fontFamily: '"SF Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.04em',
  userSelect: 'none',
}

export function PriorityBadge({
  priority,
  className,
  ...rest
}: PriorityBadgeProps) {
  return (
    <span
      style={{ ...style, color: colorByPriority[priority] }}
      aria-label={priority}
      className={className}
      {...rest}
    >
      {priority}
    </span>
  )
}
