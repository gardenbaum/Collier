import type { CSSProperties } from 'react'
import type { IssueStatus } from '@/lib/bindings'
import { colors, radius, space, type } from '@/lib/design-tokens'

export interface StatusPillProps {
  /** One of the 5 IssueStatus variants from bindings.ts. */
  status: IssueStatus
}

// ponytail: IssueStatus is a string literal in bindings.ts; a single map keyed
// by status keeps the colour→status relationship in one place. Walk a mono
// scale only — the orange brand colour is reserved for destructive + P0
// per AC-14, so status badges never reach for it.
const statusDotColor: Record<IssueStatus, string> = {
  open: colors.mono3,
  in_progress: colors.mono0,
  blocked: colors.mono0,
  closed: colors.mono6,
  deferred: colors.mono5,
}

const statusLabel: Record<IssueStatus, string> = {
  open: 'open',
  in_progress: 'in progress',
  blocked: 'blocked',
  closed: 'closed',
  deferred: 'deferred',
}

/**
 * Rectangular status pill — 4px tall visually, hard-edged (radius 0),
 * mono background with a leading dot in the status colour.
 *
 * Uses `data-testid="status-pill"` and `data-status={status}` for QA selectors.
 * Mono only — the brand colour is reserved for destructive + P0 per AC-14.
 */
export function StatusPill({ status }: StatusPillProps) {
  const dotStyle: CSSProperties = {
    width: 6,
    height: 6,
    backgroundColor: statusDotColor[status],
    borderRadius: radius.sm,
    flexShrink: 0,
  }

  const pillStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space[1],
    paddingInline: space[2],
    paddingBlock: space[1],
    backgroundColor: colors.mono8,
    borderRadius: radius.sm,
    fontFamily: type.fontFamily.sans,
    fontSize: type.fontSize.xs,
    fontWeight: type.fontWeight.medium,
    lineHeight: type.lineHeight.tight,
    color: colors.mono0,
  }

  return (
    <span data-testid="status-pill" data-status={status} style={pillStyle}>
      <span style={dotStyle} aria-hidden="true" />
      {statusLabel[status]}
    </span>
  )
}

export default StatusPill
