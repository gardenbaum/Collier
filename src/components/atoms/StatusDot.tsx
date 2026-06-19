import type { CSSProperties } from 'react'
import type { IssueStatus } from '@/lib/bindings'
import { palette } from '@/lib/design-tokens'

const colorByStatus: Record<IssueStatus, string> = {
  open: palette.statusOpen,
  in_progress: palette.statusInProgress,
  blocked: palette.statusBlocked,
  closed: palette.statusClosed,
  deferred: palette.statusDeferred,
}

export interface StatusDotProps {
  status: IssueStatus
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
    backgroundColor: colorByStatus[status],
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
