import { StatusDot } from '@/components/atoms'

export interface StatusPillProps {
  /**
   * Any status string — the canonical v1 names
   * (`open`, `in_progress`, `blocked`, `deferred`, `closed`) get
   * their palette color, custom statuses fall back to a neutral
   * dot. The type is `string` because the bd wire format allows
   * user-defined statuses via `bd config set status.custom` (see
   * `docs/CONSTITUTION.md §3`).
   */
  status: string
}

export function StatusPill({ status }: StatusPillProps) {
  return (
    <StatusDot status={status} data-testid="status-pill" data-status={status} />
  )
}
