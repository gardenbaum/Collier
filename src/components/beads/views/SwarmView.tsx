/**
 * SwarmView — read-only list of swarm molecules.
 *
 * v1 ships as an empty state. v2 will split into the two planned
 * sections (active swarms with current step + all swarms with metadata)
 * once the bd JSON shape stabilizes.
 */
import { Users } from 'lucide-react'
import { EmptyState } from '@/components/atoms'

export interface SwarmViewProps {
  /** Repository root (unused for v1). */
  cwd: string
}

export function SwarmView({ cwd: _cwd }: SwarmViewProps) {
  return (
    <section data-testid="swarm-view" className="flex h-full flex-col">
      <div
        data-testid="swarm-empty"
        className="flex flex-1 items-center justify-center"
      >
        <EmptyState
          icon={Users}
          title="No swarm activity"
          body="Multi-agent sessions will appear here."
        />
      </div>
    </section>
  )
}

export default SwarmView
