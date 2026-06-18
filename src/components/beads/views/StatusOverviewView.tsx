/**
 * StatusOverviewView — read-only repo health summary.
 *
 * v1 ships as a `Coming in v1.1` empty state with copyable CLI
 * commands. v2 runs `bd status --json`, `bd count --by-priority --json`,
 * and `bd count --by-type --json` in parallel and renders them as a
 * card grid.
 */
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useCopyAndFlag } from '@/hooks/useCopyAndFlag'

export interface StatusOverviewViewProps {
  /** Repository root (unused for v1). */
  cwd: string
}

const CLI_COMMANDS = [
  'bd status --json',
  'bd count --by-priority --json',
  'bd count --by-type --json',
] as const

export function StatusOverviewView({ cwd: _cwd }: StatusOverviewViewProps) {
  const { t } = useTranslation()
  const { flag, copy } = useCopyAndFlag<number>()

  const onCopy = (idx: number) => {
    const cmd = CLI_COMMANDS[idx]
    if (cmd) void copy(cmd, idx)
  }

  return (
    <section
      data-testid="status-view"
      className="flex h-full flex-col gap-3 p-4 text-mono-1"
    >
      <header>
        <h2 className="m-0 text-lg font-bold">
          {t('beads.views.status.title', 'Status overview')}
        </h2>
      </header>
      <div
        data-testid="status-empty"
        className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
      >
        <p className="m-0 max-w-md text-sm text-mono-2">
          {t(
            'beads.views.status.comingSoon',
            'Coming in v1.1 — use the CLI for now'
          )}
        </p>
        <div className="flex flex-col gap-2">
          {CLI_COMMANDS.map((cmd, idx) => (
            <div
              key={cmd}
              className="flex items-center gap-2"
              data-testid={`status-cli-row-${idx}`}
            >
              <code className="border border-mono-3 bg-mono-9 px-3 py-1 font-mono text-xs text-mono-0">
                {cmd}
              </code>
              <Button
                type="button"
                data-testid={`status-copy-command-${idx}`}
                onClick={() => onCopy(idx)}
                variant="outline"
                size="sm"
              >
                {flag === idx
                  ? t('beads.views.status.copied', 'Copied!')
                  : t('beads.views.status.copyCommand', 'Copy CLI command')}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default StatusOverviewView
