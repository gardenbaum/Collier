/**
 * First-run / bd-init flow panel.
 *
 * Triggered by the parent (App.tsx, Wave 8) when `commands.detectBd(cwd)`
 * succeeds with `jsonl_path === null` and `backend === "unknown"`
 * (no `.beads/` directory exists). The panel offers two actions:
 *
 *   - Initialize: invokes `commands.runBdCommand(["init"], repoPath)`,
 *     refetches via `detectBd`, then notifies the parent via
 *     `onInitialized()` if the workspace is now usable. On failure
 *     (non-zero exit) the stderr is shown in a Sonner toast.
 *   - Cancel:     invokes `onCancel()` so the parent can return to
 *     the repo-selection gate (T9).
 *
 * Styling: Bauhaus + Swiss — hard edges, design tokens only.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { commands } from '@/lib/tauri-bindings'
import { logger } from '@/lib/logger'
import { colors, space, type } from '@/lib/design-tokens'
import { Button } from '@/components/ui/button'

export interface BdInitFlowProps {
  /** Absolute path to the repository to initialize. */
  repoPath: string
  /** Called when `bd init` succeeds AND the post-init `detectBd` reports a jsonl path. */
  onInitialized: () => void
  /** Called when the user wants to abort and return to repo selection. */
  onCancel: () => void
}

/**
 * Extracts a human-readable error message from a `BdError`.
 * Falls back to the type name so we never show `undefined` to the user.
 */
function formatBdError(error: unknown): string {
  if (error && typeof error === 'object' && 'type' in error) {
    const e = error as { type: string; stderr?: string; message?: string }
    if (e.type === 'NonZeroExit' && typeof e.stderr === 'string') {
      return (
        e.stderr.trim() ||
        `bd exited with code ${(error as { code?: number }).code ?? '?'}`
      )
    }
    if (typeof e.message === 'string') {
      return e.message
    }
    return e.type
  }
  return String(error)
}

export function BdInitFlow({
  repoPath,
  onInitialized,
  onCancel,
}: BdInitFlowProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isRunning, setIsRunning] = useState(false)

  const handleInitialize = async () => {
    setIsRunning(true)
    try {
      const result = await commands.runBdCommand(['init'], repoPath)
      if (result.status === 'error') {
        toast.error(`bd init failed: ${formatBdError(result.error)}`)
        return
      }

      // Refetch detectBd; only proceed to the next gate if the workspace
      // is now initialized.
      const detect = await commands.detectBd(repoPath)
      const hasJsonl = detect.status === 'ok' && detect.data.jsonl_path !== null

      if (!hasJsonl) {
        toast.error('bd init succeeded but workspace is still empty')
        return
      }

      // Invalidate the beads query namespace so any listening views refetch.
      await queryClient.invalidateQueries({ queryKey: ['beads'] })
      onInitialized()
    } catch (err) {
      logger.error('bd init crashed', { err })
      toast.error(`bd init failed: ${formatBdError(err)}`)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <section
      aria-label={t('beads.bootstrap.noBeadsWorkspace')}
      className="flex flex-col"
      style={{
        gap: space[4],
        padding: space[4],
        backgroundColor: colors.mono9,
        color: colors.mono0,
        borderRadius: 0,
      }}
    >
      <header className="flex flex-col" style={{ gap: space[2] }}>
        <h2
          className="font-bold"
          style={{
            fontSize: type.fontSize.xl,
            lineHeight: type.lineHeight.tight,
          }}
        >
          {t('beads.bootstrap.noBeadsWorkspace')}
        </h2>
        <p
          style={{
            fontSize: type.fontSize.base,
            lineHeight: type.lineHeight.normal,
          }}
        >
          {`This repository has no .beads/ workspace. Initialize Beads at ${repoPath}?`}
        </p>
      </header>

      <footer className="flex flex-row" style={{ gap: space[4] }}>
        <Button
          variant="default"
          onClick={handleInitialize}
          disabled={isRunning}
        >
          {t('beads.bootstrap.initButton')}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={isRunning}>
          {t('beads.common.cancel')}
        </Button>
      </footer>
    </section>
  )
}
