/**
 * VersionCheck — blocking modal shown when the installed `bd` version
 * is outside the supported range (1.x).
 *
 * On mount, calls `commands.detectBd(cwd)`. If the returned `version`
 * is non-null and `version[0] !== 1` (i.e. not in 1.x), the modal blocks
 * the rest of the app. The user can either:
 *   - Click "Update Beads" to open the releases page in a new tab
 *   - Click "Quit" to close the app
 *
 * If `version` is null (bd not installed/initialized) or is 1.x, the
 * component calls `onPass()` silently and renders nothing.
 *
 * Styled per the Bauhaus + Swiss system: hard edges (`radius: 0`),
 * `space[4]` (16px) padding, mono scale colors. Accent (`#c2410c`) is
 * used only on the destructive "Quit" button.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { commands } from '@/lib/tauri-bindings'
import type { BdInfo } from '@/lib/bindings'
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

const RELEASES_URL = 'https://github.com/gastownhall/beads/releases'

export interface VersionCheckProps {
  /** Working directory to pass to `detectBd`. */
  cwd: string
  /** Called when the version is supported (or undetectable). */
  onPass: () => void
}

/**
 * Mirrors `is_supported_version` in `src-tauri/src/beads/detect.rs`:
 * version.0 == 1  (i.e. any 1.x.y, not 0.x or 2.x+)
 */
function isSupportedVersion(version: [number, number, number] | null): boolean {
  if (version === null) return true
  return version[0] === 1
}

type CheckState = 'checking' | 'unsupported' | 'supported'

function interpretCheckResult(info: BdInfo): CheckState {
  if (!isSupportedVersion(info.version)) {
    return 'unsupported'
  }
  return 'supported'
}

export function VersionCheck({ cwd, onPass }: VersionCheckProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<CheckState>('checking')
  const [bdInfo, setBdInfo] = useState<BdInfo | null>(null)

  // Initial probe — runs once on mount. The promise callbacks are the
  // only places that mutate `state`, so the effect body itself never
  // calls setState synchronously (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false
    commands
      .detectBd(cwd)
      .then(result => {
        if (cancelled) return
        if (result.status === 'error') {
          // BdNotInPath or other error — treat as "can't detect, pass through"
          logger.debug('detectBd error during version check', {
            error: result.error,
            cwd,
          })
          setState('supported')
          onPass()
          return
        }
        const info = result.data
        setBdInfo(info)
        const next = interpretCheckResult(info)
        setState(next)
        if (next === 'supported') {
          onPass()
        }
      })
      .catch(err => {
        if (cancelled) return
        logger.error('detectBd threw during version check', { err, cwd })
        // Defensive: treat a throw as "pass through"
        setState('supported')
        onPass()
      })
    return () => {
      cancelled = true
    }
  }, [cwd, onPass])

  const open = state === 'unsupported'
  const version = bdInfo?.version ?? [0, 0, 0]
  const [major, minor, patch] = version
  const versionStr = `${major}.${minor}.${patch}`

  const handleQuit = async () => {
    try {
      await getCurrentWindow().close()
    } catch (err) {
      logger.error('Failed to close window', { err })
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        data-testid="version-check-modal"
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
            {t('beads.bootstrap.unsupportedVersion', { version: versionStr })}
          </DialogTitle>
          <DialogDescription
            className="text-sm"
            style={{ color: colors.mono3 }}
          >
            {`Beads ${versionStr} is outside the supported range 1.0–2.0`}
          </DialogDescription>
        </DialogHeader>

        <div
          data-testid="version-check-body"
          className="text-sm"
          style={{ color: colors.mono2 }}
        />

        <DialogFooter className="gap-3 sm:justify-end">
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="update-beads-link"
            className={cn(
              'inline-flex items-center gap-2 border-2 px-4 py-2 text-sm font-medium transition-colors',
              'hover:bg-mono-8',
              'no-underline'
            )}
            style={{
              backgroundColor: colors.mono9,
              color: colors.mono0,
              borderColor: colors.mono0,
              borderRadius: 0,
            }}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            <span>Update Beads</span>
          </a>
          <Button
            type="button"
            onClick={handleQuit}
            className="border-2"
            style={{
              backgroundColor: colors.accent,
              color: colors.mono9,
              borderColor: colors.accent,
              borderRadius: 0,
            }}
          >
            <X className="size-4" aria-hidden="true" />
            <span>{t('beads.bootstrap.quit', 'Quit')}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
