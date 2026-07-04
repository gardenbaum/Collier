/**
 * BdNotInPath — full-screen blocking modal shown when `bd` is not on PATH.
 *
 * On mount, calls `commands.checkBdVersionCmd()`. If the result is
 * `Result.error { type: "BdNotInPath" }`, the modal renders and blocks
 * the rest of the app shell. The user can either:
 *   - Install `bd` and click "Recheck" to re-probe
 *   - Click "Quit" to close the app
 *
 * Styled per the Bauhaus + Swiss system: hard edges (`radius: 0`),
 * `space[4]` (16px) padding, mono scale colors. Accent (`#c2410c`) is
 * used only on the destructive "Quit" button.
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { commands } from '@/lib/tauri-bindings'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { colors, space } from '@/lib/design-tokens'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { QuitButton } from './QuitButton'

const INSTALL_COMMAND = 'brew install beads'

type ProbeState = 'missing' | 'present'

function interpretCheckResult(
  result: Awaited<ReturnType<typeof commands.checkBdVersionCmd>>
): ProbeState {
  if (result.status === 'ok') return 'present'
  if (result.error.type === 'BdNotInPath') return 'missing'
  logger.warn('bd check returned unexpected error', { error: result.error })
  return 'missing'
}

export function BdNotInPath() {
  const { t } = useTranslation()
  const [state, setState] = useState<ProbeState | null>(null)
  const [isRechecking, setIsRechecking] = useState(false)

  // Initial probe — runs once on mount. The promise callbacks are the
  // only places that mutate `state`, so the effect body itself never
  // calls setState synchronously.
  useEffect(() => {
    let cancelled = false
    commands
      .checkBdVersionCmd()
      .then(result => {
        if (cancelled) return
        setState(interpretCheckResult(result))
      })
      .catch(err => {
        if (cancelled) return
        logger.error('bd check threw', { err })
        setState('missing')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleRecheck = useCallback(async () => {
    setIsRechecking(true)
    try {
      const result = await commands.checkBdVersionCmd()
      setState(interpretCheckResult(result))
    } catch (err) {
      logger.error('bd check threw', { err })
      setState('missing')
    } finally {
      setIsRechecking(false)
    }
  }, [])

  const handleCopy = useCallback(async () => {
    try {
      await writeText(INSTALL_COMMAND)
    } catch (err) {
      logger.error('Failed to copy install command', { err })
    }
  }, [])

  const open = state === 'missing'

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={event => event.preventDefault()}
        onPointerDownOutside={event => event.preventDefault()}
        onInteractOutside={event => event.preventDefault()}
        className={cn('max-w-2xl gap-6 p-8', 'border-2', 'rounded-none')}
        style={{
          borderColor: colors.mono0,
          padding: space[8],
          borderRadius: 0,
        }}
      >
        <DialogHeader className="gap-3">
          <DialogTitle
            className="text-2xl font-bold"
            style={{ color: colors.mono0 }}
          >
            {t('beads.bootstrap.bdNotInPath')}
          </DialogTitle>
          <DialogDescription
            className="text-sm"
            style={{ color: colors.mono3 }}
          >
            {t('beads.bootstrap.installInstructions')}
          </DialogDescription>
        </DialogHeader>

        <div
          data-testid="install-command-block"
          className="flex items-stretch gap-0 border-2"
          style={{
            backgroundColor: colors.mono9,
            borderColor: colors.mono0,
            borderRadius: 0,
          }}
        >
          <pre
            data-testid="install-command"
            className="m-0 flex-1 overflow-x-auto p-4 font-mono text-sm"
            style={{
              backgroundColor: colors.mono9,
              color: colors.mono0,
              borderRadius: 0,
            }}
          >
            {INSTALL_COMMAND}
          </pre>
          <Button
            type="button"
            onClick={handleCopy}
            variant="outline"
            aria-label="Copy install command"
            className="border-0 border-l-2 px-4"
            style={{
              backgroundColor: colors.mono9,
              color: colors.mono0,
              borderLeftColor: colors.mono0,
              borderRadius: 0,
            }}
          >
            <Copy className="size-4" aria-hidden="true" />
            <span>{t('beads.bootstrap.copy', 'Copy')}</span>
          </Button>
        </div>

        <DialogFooter className="gap-3 sm:justify-end">
          <Button
            type="button"
            onClick={handleRecheck}
            variant="outline"
            disabled={isRechecking}
            className="border-2"
            style={{
              backgroundColor: colors.mono9,
              color: colors.mono0,
              borderColor: colors.mono0,
              borderRadius: 0,
            }}
          >
            {isRechecking
              ? t('beads.bootstrap.rechecking', 'Rechecking…')
              : t('beads.bootstrap.recheck', 'Recheck')}
          </Button>
          <QuitButton />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
