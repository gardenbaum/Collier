/**
 * WorktreeListView — read-only list of worktrees.
 *
 * bd 1.0.5 has no `worktree` subcommand; v1 ships as a `Coming in
 * v1.1` empty state with a copyable `bd branch --json` command
 * (closest existing subcommand — `git worktree list` style info
 * for v2 once `bd worktree` ships).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export interface WorktreeListViewProps {
  /** Repository root (unused for v1). */
  cwd: string
}

const CLI_COMMAND = 'bd branch --json'

export function WorktreeListView({ cwd: _cwd }: WorktreeListViewProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(CLI_COMMAND)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Best-effort.
    }
  }

  return (
    <section
      data-testid="worktree-view"
      className="flex h-full flex-col gap-3 p-4 text-mono-1"
    >
      <header>
        <h2 className="m-0 text-lg font-bold">
          {t('beads.views.worktree.title', 'Worktrees')}
        </h2>
      </header>
      <div
        data-testid="worktree-empty"
        className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
      >
        <p className="m-0 max-w-md text-sm text-mono-2">
          {t(
            'beads.views.worktree.comingSoon',
            'Coming in v1.1 — use the CLI for now'
          )}
        </p>
        <div className="flex items-center gap-2">
          <code
            data-testid="worktree-cli-command"
            className="border border-mono-3 bg-mono-9 px-3 py-1 font-mono text-xs text-mono-0"
          >
            {CLI_COMMAND}
          </code>
          <Button
            type="button"
            data-testid="worktree-copy-command"
            onClick={onCopy}
            variant="outline"
            size="sm"
          >
            {copied
              ? t('beads.views.worktree.copied', 'Copied!')
              : t('beads.views.worktree.copyCommand', 'Copy CLI command')}
          </Button>
        </div>
      </div>
    </section>
  )
}

export default WorktreeListView
