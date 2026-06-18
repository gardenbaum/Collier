/**
 * SyncStatusView — read-only sync status (Dolt vs version control).
 *
 * v1 ships as a `Coming in v1.1` empty state with copyable CLI
 * commands (`bd vc status --json`, `bd dolt status --json`). v2 will
 * issue both in parallel and render each as a JSON card.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export interface SyncStatusViewProps {
  /** Repository root (unused for v1). */
  cwd: string
}

const CLI_COMMANDS = ['bd vc status --json', 'bd dolt status --json'] as const

export function SyncStatusView({ cwd: _cwd }: SyncStatusViewProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState<number | null>(null)

  const onCopy = async (idx: number) => {
    try {
      await navigator.clipboard.writeText(CLI_COMMANDS[idx] ?? '')
      setCopied(idx)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      // Best-effort.
    }
  }

  return (
    <section
      data-testid="sync-view"
      className="flex h-full flex-col gap-3 p-4 text-mono-1"
    >
      <header>
        <h2 className="m-0 text-lg font-bold">
          {t('beads.views.sync.title', 'Sync status')}
        </h2>
      </header>
      <div
        data-testid="sync-empty"
        className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
      >
        <p className="m-0 max-w-md text-sm text-mono-2">
          {t(
            'beads.views.sync.comingSoon',
            'Coming in v1.1 — use the CLI for now'
          )}
        </p>
        <div className="flex flex-col gap-2">
          {CLI_COMMANDS.map((cmd, idx) => (
            <div
              key={cmd}
              className="flex items-center gap-2"
              data-testid={`sync-cli-row-${idx}`}
            >
              <code className="border border-mono-3 bg-mono-9 px-3 py-1 font-mono text-xs text-mono-0">
                {cmd}
              </code>
              <Button
                type="button"
                data-testid={`sync-copy-command-${idx}`}
                onClick={() => onCopy(idx)}
                variant="outline"
                size="sm"
              >
                {copied === idx
                  ? t('beads.views.sync.copied', 'Copied!')
                  : t('beads.views.sync.copyCommand', 'Copy CLI command')}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default SyncStatusView
