/**
 * EpicView — read-only list of all epics.
 *
 * v1 ships as a `Coming in v1.1` empty state with a copyable
 * `bd epic status --json` command. The plan called for a sortable
 * table (id, title, total children, open, closed, % complete) but
 * the bd 1.0.5 CLI only exposes `bd epic status` without a stable
 * JSON shape. v2 will parse the real output and render the table
 * (T38 follow-up).
 *
 * The "Copy CLI command" button is the affordance that keeps the
 * surface useful: a user who needs epic status TODAY can paste the
 * suggested command in the Quick Pane (`Cmd+Shift+.`) and get
 * immediate JSON output.
 */
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'

export interface EpicViewProps {
  /** Repository root (unused for v1 — kept for the v2 signature). */
  cwd: string
}

const CLI_COMMAND = 'bd epic status --json'

export function EpicView({ cwd: _cwd }: EpicViewProps) {
  const { t } = useTranslation()
  const { copied, copy } = useCopyToClipboard()

  const onCopy = () => {
    void copy(CLI_COMMAND)
  }

  return (
    <section
      data-testid="epic-view"
      className="flex h-full flex-col gap-3 p-4 text-mono-1"
    >
      <header className="flex items-center justify-between">
        <h2 className="m-0 text-lg font-bold">
          {t('beads.views.epic.title', 'Epics')}
        </h2>
      </header>
      <div
        data-testid="epic-empty"
        className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
      >
        <p className="m-0 max-w-md text-sm text-mono-2">
          {t(
            'beads.views.epic.comingSoon',
            'Coming in v1.1 — use the CLI for now'
          )}
        </p>
        <div className="flex items-center gap-2">
          <code
            data-testid="epic-cli-command"
            className="border border-mono-3 bg-mono-9 px-3 py-1 font-mono text-xs text-mono-0"
          >
            {CLI_COMMAND}
          </code>
          <Button
            type="button"
            data-testid="epic-copy-command"
            onClick={onCopy}
            variant="outline"
            size="sm"
          >
            {copied
              ? t('beads.views.epic.copied', 'Copied!')
              : t('beads.views.epic.copyCommand', 'Copy CLI command')}
          </Button>
        </div>
      </div>
    </section>
  )
}

export default EpicView
