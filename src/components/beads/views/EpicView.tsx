/**
 * EpicView — read-only list of all epics.
 *
 * v1 ships as an empty state (the bd 1.0.5 CLI doesn't expose a stable
 * JSON shape for epics yet). v2 will parse the real output and render
 * the full table (T38 follow-up).
 */
import { Mountain } from 'lucide-react'
import { EmptyState } from '@/components/atoms'

export interface EpicViewProps {
  /** Repository root (unused for v1 — kept for the v2 signature). */
  cwd: string
}

export function EpicView({ cwd: _cwd }: EpicViewProps) {
  return (
    <section data-testid="epic-view" className="flex h-full flex-col">
      <div
        data-testid="epic-empty"
        className="flex flex-1 items-center justify-center"
      >
        <EmptyState
          icon={Mountain}
          title="No epics yet"
          body="Group related issues into milestones."
        />
      </div>
    </section>
  )
}

export default EpicView
