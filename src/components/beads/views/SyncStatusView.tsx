/**
 * SyncStatusView — read-only sync status (Dolt vs version control).
 *
 * v1 ships as an empty state. v2 will issue both `bd vc status` and
 * `bd dolt status` in parallel and render each as a JSON card.
 */
import { Cloud } from 'lucide-react'
import { EmptyState } from '@/components/atoms'

export interface SyncStatusViewProps {
  /** Repository root (unused for v1). */
  cwd: string
}

export function SyncStatusView({ cwd: _cwd }: SyncStatusViewProps) {
  return (
    <section data-testid="sync-view" className="flex h-full flex-col">
      <div
        data-testid="sync-empty"
        className="flex flex-1 items-center justify-center"
      >
        <EmptyState
          icon={Cloud}
          title="Not yet synced"
          body="Run `bd sync` to push local state."
        />
      </div>
    </section>
  )
}
