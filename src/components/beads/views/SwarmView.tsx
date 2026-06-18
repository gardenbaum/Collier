/**
 * SwarmView — read-only list of swarm molecules.
 *
 * v1 ships as a `Coming in v1.1` empty state with a copyable
 * `bd swarm list --json` command. v2 will split into the two planned
 * sections (active swarms with current step + all swarms with metadata)
 * once the bd JSON shape stabilizes.
 */
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'

export interface SwarmViewProps {
  /** Repository root (unused for v1). */
  cwd: string
}

const CLI_COMMAND = 'bd swarm list --json'

export function SwarmView({ cwd: _cwd }: SwarmViewProps) {
  const { t } = useTranslation()
  const { copied, copy } = useCopyToClipboard()

  const onCopy = () => {
    void copy(CLI_COMMAND)
  }

  return (
    <section
      data-testid="swarm-view"
      className="flex h-full flex-col gap-3 p-4 text-mono-1"
    >
      <header className="flex items-center justify-between">
        <h2 className="m-0 text-lg font-bold">
          {t('beads.views.swarm.title', 'Swarms')}
        </h2>
      </header>
      <div
        data-testid="swarm-empty"
        className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
      >
        <p className="m-0 max-w-md text-sm text-mono-2">
          {t(
            'beads.views.swarm.comingSoon',
            'Coming in v1.1 — use the CLI for now'
          )}
        </p>
        <div className="flex items-center gap-2">
          <code
            data-testid="swarm-cli-command"
            className="border border-mono-3 bg-mono-9 px-3 py-1 font-mono text-xs text-mono-0"
          >
            {CLI_COMMAND}
          </code>
          <Button
            type="button"
            data-testid="swarm-copy-command"
            onClick={onCopy}
            variant="outline"
            size="sm"
          >
            {copied
              ? t('beads.views.swarm.copied', 'Copied!')
              : t('beads.views.swarm.copyCommand', 'Copy CLI command')}
          </Button>
        </div>
      </div>
    </section>
  )
}

export default SwarmView
