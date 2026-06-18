/**
 * GeneralPane — Collier's "General" preferences page.
 *
 * v1.0 ships with one persistent setting: the Quick Pane keyboard
 * shortcut. The old `exampleText` / `exampleToggle` demo placeholders
 * are gone — they were never persisted to disk and only served to
 * show off the SettingsSection wrapper.
 */
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ShortcutPicker } from '../ShortcutPicker'
import { SettingsField, SettingsSection } from '../shared/SettingsComponents'
import { usePreferences, useSavePreferences } from '@/services/preferences'
import { commands } from '@/lib/tauri-bindings'
import { logger } from '@/lib/logger'
import { Button } from '@/components/ui/button'

export function GeneralPane() {
  const { t } = useTranslation()
  const { data: preferences } = usePreferences()
  const savePreferences = useSavePreferences()

  // Get the default shortcut from the backend
  const { data: defaultShortcut } = useQuery({
    queryKey: ['default-quick-pane-shortcut'],
    queryFn: async () => {
      return await commands.getDefaultQuickPaneShortcut()
    },
    staleTime: Infinity, // Never refetch - this is a constant
  })

  const handleShortcutChange = async (newShortcut: string | null) => {
    if (!preferences) return

    // Capture old shortcut for rollback if save fails
    const oldShortcut = preferences.quick_pane_shortcut

    logger.info('Updating quick pane shortcut', { oldShortcut, newShortcut })

    // First, try to register the new shortcut
    const result = await commands.updateQuickPaneShortcut(newShortcut)
    if (result.status === 'error') {
      logger.error('Failed to register shortcut', { error: result.error })
      toast.error(t('toast.error.shortcutFailed'), {
        description: result.error,
      })
      return
    }

    // If registration succeeded, try to save the preference
    try {
      await savePreferences.mutateAsync({
        ...preferences,
        quick_pane_shortcut: newShortcut,
      })
      toast.success(t('toast.success.shortcutUpdated'))
    } catch (error) {
      // Roll back the registration if save failed
      logger.error('Save failed after registration, rolling back', { error })
      await commands.updateQuickPaneShortcut(oldShortcut)
      toast.error(t('toast.error.shortcutSaveFailed'))
    }
  }

  const handleResetToDefaults = async () => {
    if (!preferences) return
    const oldShortcut = preferences.quick_pane_shortcut
    try {
      // Unregister the OS-level shortcut first so prefs and OS state
      // stay in sync — otherwise the user's custom shortcut would keep
      // firing until the next app restart when the null pref is read
      // back in.
      const unregisterResult = await commands.updateQuickPaneShortcut(null)
      if (unregisterResult.status === 'error') {
        logger.error('Failed to unregister shortcut on reset', {
          error: unregisterResult.error,
        })
        toast.error(t('toast.error.shortcutFailed'), {
          description: unregisterResult.error,
        })
        return
      }
      await savePreferences.mutateAsync({
        ...preferences,
        theme: 'system',
        language: null,
        quick_pane_shortcut: null,
        recent_repos: [],
        bd_path: null,
        default_timeout_secs: null,
      })
      toast.success(
        t('preferences.common.resetToDefaultsSuccess', 'Reset to defaults')
      )
    } catch (error) {
      // Best-effort rollback: re-register the old OS shortcut so the
      // user's "back to my custom shortcut" mental model holds.
      await commands.updateQuickPaneShortcut(oldShortcut)
      logger.error('Failed to reset preferences', { error })
      toast.error(
        t(
          'preferences.common.resetToDefaultsError',
          'Failed to reset preferences'
        )
      )
    }
  }

  return (
    <div className="space-y-6">
      <SettingsSection title={t('preferences.general.keyboardShortcuts')}>
        <SettingsField
          label={t('preferences.general.quickPaneShortcut')}
          description={t('preferences.general.quickPaneShortcutDescription')}
        >
          <ShortcutPicker
            value={preferences?.quick_pane_shortcut ?? null}
            // Fallback matches DEFAULT_QUICK_PANE_SHORTCUT in src-tauri/src/lib.rs
            defaultValue={defaultShortcut ?? 'CommandOrControl+Shift+.'}
            onChange={handleShortcutChange}
            disabled={!preferences || savePreferences.isPending}
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection
        title={t('preferences.common.dangerZone', 'Danger zone')}
      >
        <SettingsField
          label={t(
            'preferences.common.resetToDefaults',
            'Reset to defaults'
          )}
          description={t(
            'preferences.common.resetToDefaultsDescription',
            'Reset theme, language, shortcuts, and bd path to defaults.'
          )}
        >
          <Button
            type="button"
            variant="destructive"
            onClick={handleResetToDefaults}
            disabled={!preferences || savePreferences.isPending}
            data-testid="reset-to-defaults"
          >
            {t('preferences.common.resetToDefaults', 'Reset to defaults')}
          </Button>
        </SettingsField>
      </SettingsSection>
    </div>
  )
}
