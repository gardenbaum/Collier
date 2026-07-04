/**
 * QuitButton — bootstrap-gate "Quit" action.
 *
 * Stylized per the Bauhaus + Swiss system (hard edges, accent color);
 * always used in the footer of a blocking bootstrap modal
 * (BdNotInPath / SchemaCheck / VersionCheck). Clicking closes the
 * current Tauri window. Failures are logged via `logger.error`
 * (mirrors the inline `handleQuit` it replaces).
 *
 * Co-located next to its consumers — this is a small bootstrap-only
 * primitive, not a generic UI atom. If a second call site outside
 * `components/beads/bootstrap/` adopts it, promote to `@/components/ui/`.
 */
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Button } from '@/components/ui/button'
import { colors } from '@/lib/design-tokens'
import { logger } from '@/lib/logger'

export function QuitButton() {
  const { t } = useTranslation()

  const handleClick = useCallback(async () => {
    try {
      await getCurrentWindow().close()
    } catch (err) {
      logger.error('Failed to close window', { err })
    }
  }, [])

  return (
    <Button
      type="button"
      onClick={handleClick}
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
  )
}
