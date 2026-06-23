/**
 * AdvancedPane — Collier's "Advanced" preferences page.
 *
 * v1.0 ships three real settings:
 *   - "Enable diagnostic logging" — per-session toggle. Backed by
 *     a Rust `AtomicBool` (`DIAGNOSTIC_LOGGING_ENABLED` in
 *     `diagnostic_log.rs`) that the `writeLogLine` command reads
 *     before touching the disk. The frontend flips it via
 *     `commands.setDiagnosticLogging`, then mirrors the value in
 *     the `Logger` class so we can skip the IPC round-trip when
 *     the flag is off.
 *   - "Open log file" — uses @tauri-apps/plugin-opener to reveal
 *     <APPLOCALDATA>/logs/collier-YYYY-MM-DD.log in the OS file
 *     explorer
 *   - "Clear recovery files" — runs the `cleanupOldRecoveryFiles`
 *     IPC and surfaces the deleted count via toast
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { openPath } from '@tauri-apps/plugin-opener'
import { appLocalDataDir, join } from '@tauri-apps/api/path'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { commands } from '@/lib/tauri-bindings'
import { logger } from '@/lib/logger'
import { SettingsField, SettingsSection } from '../shared/SettingsComponents'

const DIAGNOSTIC_LOGGING_KEY = ['diagnostic-logging-enabled'] as const

export function AdvancedPane() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isOpening, setIsOpening] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  // Authoritative source for the toggle. The Rust side owns the
  // flag; we cache it in TanStack so the switch reflects the real
  // value across window reloads (where `useState(false)` would lie).
  const { data: diagnosticLogging = false } = useQuery({
    queryKey: DIAGNOSTIC_LOGGING_KEY,
    queryFn: async () => {
      const r = await commands.isDiagnosticLoggingEnabled()
      return r.status === 'ok' && r.data
    },
    staleTime: Infinity,
  })

  // The mutation both fires the Rust IPC and updates the cache so
  // the UI updates without a refetch round-trip.
  const toggleMutation = useMutation({
    mutationFn: async (next: boolean) => {
      const r = await commands.setDiagnosticLogging(next)
      if (r.status === 'error') {
        throw new Error(
          typeof r.error === 'string' ? r.error : JSON.stringify(r.error)
        )
      }
      return next
    },
    onSuccess: next => {
      queryClient.setQueryData(DIAGNOSTIC_LOGGING_KEY, next)
      logger.setDiagnosticLogging(next)
    },
    onError: error => {
      logger.error('Failed to set diagnostic logging', { error })
      toast.error(
        t(
          'preferences.advanced.diagnosticLoggingError',
          'Failed to update diagnostic logging'
        )
      )
    },
  })

  const handleOpenLog = async () => {
    setIsOpening(true)
    try {
      const dir = await appLocalDataDir()
      const today = new Date().toISOString().slice(0, 10)
      const logPath = await join(dir, 'logs', `collier-${today}.log`)
      await openPath(logPath)
    } catch (error) {
      logger.error('Failed to open log file', { error })
      toast.error(
        t('preferences.advanced.openLogFileError', 'Could not open log file'),
        { description: String(error) }
      )
    } finally {
      setIsOpening(false)
    }
  }

  const handleClearRecovery = async () => {
    setIsClearing(true)
    try {
      const result = await commands.cleanupOldRecoveryFiles()
      if (result.status === 'error') {
        toast.error(
          t(
            'preferences.advanced.clearRecoveryFilesError',
            'Failed to clear recovery files'
          )
        )
        return
      }
      const count = result.data
      toast.success(
        t(
          'preferences.advanced.clearRecoveryFilesSuccess',
          'Recovery files cleared'
        ),
        {
          description: t(
            'preferences.advanced.clearRecoveryFilesCount',
            '{{count}} file(s) removed',
            { count }
          ),
        }
      )
    } catch (error) {
      logger.error('Failed to clear recovery files', { error })
      toast.error(
        t(
          'preferences.advanced.clearRecoveryFilesError',
          'Failed to clear recovery files'
        )
      )
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="space-y-6">
      <SettingsSection title={t('preferences.advanced.title', 'Advanced')}>
        <SettingsField
          label={t(
            'preferences.advanced.diagnosticLogging',
            'Enable diagnostic logging'
          )}
          description={t(
            'preferences.advanced.diagnosticLoggingDescription',
            'Per-session toggle. Resets when the app restarts.'
          )}
        >
          <div className="flex items-center space-x-2">
            <Switch
              id="diagnostic-logging"
              checked={diagnosticLogging}
              onCheckedChange={next => toggleMutation.mutate(next)}
              disabled={toggleMutation.isPending}
              data-testid="advanced-diagnostic-logging"
            />
            <Label htmlFor="diagnostic-logging" className="text-sm">
              {diagnosticLogging
                ? t('common.enabled', 'Enabled')
                : t('common.disabled', 'Disabled')}
            </Label>
          </div>
        </SettingsField>

        <SettingsField
          label={t('preferences.advanced.openLogFile', 'Open log file')}
          description={t(
            'preferences.advanced.openLogFileDescription',
            "Reveal the current day's log file in your file explorer."
          )}
        >
          <Button
            type="button"
            variant="outline"
            onClick={handleOpenLog}
            disabled={isOpening}
          >
            {isOpening
              ? t('common.opening', 'Opening…')
              : t('preferences.advanced.openLogFile', 'Open log file')}
          </Button>
        </SettingsField>

        <SettingsField
          label={t(
            'preferences.advanced.clearRecoveryFiles',
            'Clear recovery files'
          )}
          description={t(
            'preferences.advanced.clearRecoveryFilesDescription',
            'Removes recovery files older than 7 days. Useful after a clean session.'
          )}
        >
          <Button
            type="button"
            variant="outline"
            onClick={handleClearRecovery}
            disabled={isClearing}
          >
            {isClearing
              ? t('common.clearing', 'Clearing…')
              : t(
                  'preferences.advanced.clearRecoveryFiles',
                  'Clear recovery files'
                )}
          </Button>
        </SettingsField>
      </SettingsSection>
    </div>
  )
}
