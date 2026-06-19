import { StatusDot } from '@/components/atoms'
import type { IssueStatus } from '@/lib/bindings'

export interface StatusPillProps {
  /** One of the 5 IssueStatus variants from bindings.ts. */
  status: IssueStatus
}

export function StatusPill({ status }: StatusPillProps) {
  return (
    <StatusDot status={status} data-testid="status-pill" data-status={status} />
  )
}

export default StatusPill
