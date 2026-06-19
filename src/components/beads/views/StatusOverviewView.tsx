/**
 * StatusOverviewView — read-only repo health summary.
 *
 * v1 ships as an empty state (no bd status JSON yet). v2 will run
 * `bd status --json`, `bd count --by-priority --json`, and
 * `bd count --by-type --json` in parallel and render them as a
 * metric card grid (see `StatusMetrics` below — kept ready for v1.1).
 */
import { BarChart3 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/atoms'
import { palette } from '@/lib/design-tokens'

export interface StatusOverviewViewProps {
  /** Repository root (unused for v1). */
  cwd: string
}

export function StatusOverviewView({ cwd: _cwd }: StatusOverviewViewProps) {
  return (
    <section data-testid="status-view" className="flex h-full flex-col">
      <div
        data-testid="status-empty"
        className="flex flex-1 items-center justify-center"
      >
        <EmptyState
          icon={BarChart3}
          title="No data yet"
          body="Metrics appear once you create issues."
        />
      </div>
    </section>
  )
}

export interface StatusStats {
  open: number
  in_progress: number
  blocked: number
  closed: number
}

interface StatusMetricsProps {
  stats: StatusStats
}

export function StatusMetrics({ stats }: StatusMetricsProps) {
  const metrics: { label: string; value: number; color: string }[] = [
    { label: 'Open', value: stats.open, color: palette.statusOpen },
    {
      label: 'In progress',
      value: stats.in_progress,
      color: palette.statusInProgress,
    },
    { label: 'Blocked', value: stats.blocked, color: palette.statusBlocked },
    { label: 'Closed', value: stats.closed, color: palette.statusClosed },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 p-6">
      {metrics.map(m => (
        <Card
          key={m.label}
          className="p-4 bg-[color:var(--card)] border-[color:var(--border)]"
        >
          <div className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--muted-foreground)] font-semibold">
            {m.label}
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span
              className="text-[32px] font-semibold"
              style={{ color: m.color }}
            >
              {m.value}
            </span>
            <span className="text-[12px] text-[color:var(--muted-foreground)] font-mono">
              issues
            </span>
          </div>
        </Card>
      ))}
    </div>
  )
}

export default StatusOverviewView
