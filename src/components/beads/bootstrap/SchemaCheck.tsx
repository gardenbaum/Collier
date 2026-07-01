/**
 * SchemaCheck — full-screen blocking modal shown when the detected Beads
 * workspace uses a schema version other than 1.
 *
 * On mount, calls `commands.detectBd(cwd)` and checks `schema_version`.
 * If the value is an integer ≠ 1 the modal renders and blocks the rest
 * of the app. The user can either:
 *   - Open Collier Releases to get a newer version
 *   - Click "Quit" to close the app
 *
 * If `schema_version === 1` (or `null`) the component calls `onPass()`
 * silently and renders nothing.
 *
 * Styled per the Bauhaus + Swiss system: hard edges (`radius: 0`),
 * `space[4]` (16px) padding, mono scale colors.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
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

export interface SchemaCheckProps {
  /** Absolute path to the Beads workspace directory. */
  cwd: string
  /**
   * Called silently when `schema_version === 1` (or `null`).
   * The parent uses this to advance the bootstrap flow.
   */
  onPass: () => void
}

const RELEASES_URL = 'https://github.com/gardenbaum/Collier/releases'
const SUPPORTED_SCHEMA = 1

export function SchemaCheck({ cwd, onPass }: SchemaCheckProps) {
  const { t } = useTranslation()
  const [schemaVersion, setSchemaVersion] = useState<number | null>(null)

  useEffect(() => {
    commands.detectBd(cwd).then(res => {
      if (res.status === 'ok') {
        const { schema_version } = res.data
        if (schema_version !== null && schema_version !== SUPPORTED_SCHEMA) {
          setSchemaVersion(schema_version)
        } else {
          onPass()
        }
      } else {
        logger.warn('detectBd returned error during schema check', {
          error: res.error,
        })
        onPass()
      }
    })
  }, [cwd, onPass])

  const handleQuit = async () => {
    try {
      await getCurrentWindow().close()
    } catch (err) {
      logger.error('Failed to close window', { err })
    }
  }

  const open = schemaVersion !== null

  if (!open) return null

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
            data-testid="schema-check-title"
          >
            {t('beads.bootstrap.unsupportedSchema', {
              version: schemaVersion,
            })}
          </DialogTitle>
          <DialogDescription
            className="text-sm"
            style={{ color: colors.mono3 }}
          >
            Beads schema version {schemaVersion} detected. Collier supports
            schema 1. Please update Collier.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-3 sm:justify-end">
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="collier-releases-link"
            className={cn(
              'inline-flex items-center gap-2 border-2 px-4 py-2 text-sm font-medium',
              'transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2'
            )}
            style={{
              backgroundColor: colors.mono9,
              color: colors.mono0,
              borderColor: colors.mono0,
              borderRadius: 0,
              textDecoration: 'none',
            }}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            <span>Open Collier Releases</span>
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
