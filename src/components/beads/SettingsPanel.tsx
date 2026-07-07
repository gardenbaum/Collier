/**
 * SettingsPanel — small dialog that edits beads-specific preferences.
 *
 * The two fields exposed are:
 *   - `bd_path`              — optional override for the `bd`
 *                              executable path. Empty string clears
 *                              the override (reverts to `PATH`).
 *   - `default_timeout_secs` — optional override for the runner's
 *                              per-command timeout. Range 1-60,
 *                              inclusive. Empty string clears the
 *                              override (reverts to the 10s
 *                              default).
 *
 * Reads the current values via `commands.loadPreferences()` and
 * persists via `commands.savePreferences(...)`. The local
 * `useState` mirrors the inputs; we don't call savePreferences
 * on every keystroke — only when the user clicks "Save".
 *
 * Styling: Bauhaus + Swiss, mono only, hard edges. The brand
 * colour is reserved for destructive actions and the P0 priority
 * badge per AC-14; the panel is informational and stays on the
 * mono scale. `design-tokens` is the single source of truth.
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import { commands, type AppPreferences } from '@/lib/tauri-bindings'
import { colors, space, type } from '@/lib/design-tokens'
import { inputStyle } from '@/lib/form-styles'
import { logger } from '@/lib/logger'
import { useDialogA11y } from '@/hooks/useDialogA11y'

export interface SettingsPanelProps {
  /**
   * Whether the panel is open. The parent controls visibility so
   * the panel can be embedded in any layout (e.g. a tab inside the
   * existing Preferences dialog).
   */
  open: boolean
  /** Called when the user dismisses the panel without saving. */
  onClose: () => void
  /**
   * Called after a successful save with the updated preferences.
   * The parent can use this to invalidate the `['preferences']`
   * TanStack Query cache if it owns one.
   */
  onSaved?: (prefs: AppPreferences) => void
}

interface FormState {
  bdPath: string
  timeoutSecs: string
}

const DEFAULT_FORM_STATE: FormState = {
  bdPath: '',
  timeoutSecs: '',
}

function prefsToForm(prefs: AppPreferences | null | undefined): FormState {
  if (!prefs) return DEFAULT_FORM_STATE
  return {
    bdPath: prefs.bd_path ?? '',
    timeoutSecs:
      prefs.default_timeout_secs !== null &&
      prefs.default_timeout_secs !== undefined
        ? String(prefs.default_timeout_secs)
        : '',
  }
}

function formToPrefs(base: AppPreferences, form: FormState): AppPreferences {
  const trimmedPath = form.bdPath.trim()
  const trimmedTimeout = form.timeoutSecs.trim()
  return {
    ...base,
    bd_path: trimmedPath.length > 0 ? trimmedPath : null,
    default_timeout_secs:
      trimmedTimeout.length > 0 ? Number.parseInt(trimmedTimeout, 10) : null,
  }
}

export function SettingsPanel({ open, onClose, onSaved }: SettingsPanelProps) {
  const [prefs, setPrefs] = useState<AppPreferences | null>(null)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM_STATE)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  // `isLoading` is derived: the panel is loading when it's open
  // but we haven't yet populated `prefs`. After mount-while-open
  // this is always `false`; the small async window where it's
  // `true` is when `prefs === null` AND `open === true`. Avoids a
  // `setState` call synchronously inside the effect body.
  const isLoading = open && prefs === null

  // Load + reseed the form whenever the panel is opened. We
  // intentionally do NOT re-load on every render — the cost of an
  // IPC round-trip is not worth the freshness.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    commands
      .loadPreferences()
      .then(result => {
        if (cancelled) return
        if (result.status === 'ok') {
          setPrefs(result.data)
          setForm(prefsToForm(result.data))
          setError(null)
        } else {
          setError(`Failed to load preferences: ${String(result.error)}`)
        }
      })
      .catch(err => {
        if (cancelled) return
        logger.error('loadPreferences threw', { err })
        setError('Failed to load preferences.')
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // M5 a11y: focus trap + restoration. The hook is gated on
  // `open` so the trigger-snapshot / focus-restore only happens
  // when the panel is actually mounted. When the panel closes
  // (open → false → unmount), the hook's cleanup restores focus
  // to whatever element opened the settings dialog.
  const panelRef = useRef<HTMLFormElement>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)
  useDialogA11y({
    panelRef,
    initialFocusRef: firstFieldRef,
    onClose,
    enabled: open,
  })

  if (!open) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (isSaving || prefs === null) return

    const timeoutValue = form.timeoutSecs.trim()
    if (timeoutValue.length > 0) {
      const parsed = Number.parseInt(timeoutValue, 10)
      if (Number.isNaN(parsed) || parsed < 1 || parsed > 60) {
        setError('Timeout must be a number between 1 and 60.')
        return
      }
    }

    setError(null)
    setIsSaving(true)
    try {
      const next = formToPrefs(prefs, form)
      const result = await commands.savePreferences(next)
      if (result.status === 'error') {
        setError(`Failed to save preferences: ${result.error}`)
        return
      }
      setPrefs(next)
      onSaved?.(next)
      onClose()
    } catch (err) {
      logger.error('savePreferences threw', { err })
      setError('Failed to save preferences.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      data-testid="settings-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Beads settings"
      style={overlayStyle}
    >
      <form
        ref={panelRef}
        data-testid="settings-form"
        onSubmit={handleSubmit}
        style={panelStyle}
        noValidate
      >
        <h2 style={headingStyle}>Beads settings</h2>

        <label style={fieldLabelStyle} htmlFor="settings-bd-path">
          bd path override
        </label>
        <input
          ref={firstFieldRef}
          id="settings-bd-path"
          data-testid="settings-bd-path"
          type="text"
          value={form.bdPath}
          onChange={e => setForm(f => ({ ...f, bdPath: e.target.value }))}
          placeholder="/usr/local/bin/bd"
          disabled={isLoading || isSaving}
          style={inputStyle}
          autoComplete="off"
          spellCheck={false}
        />
        <p style={helperStyle}>
          Leave empty to use <code>bd</code> from <code>PATH</code>.
        </p>

        <label style={fieldLabelStyle} htmlFor="settings-timeout">
          Default timeout (seconds)
        </label>
        <input
          id="settings-timeout"
          data-testid="settings-timeout"
          type="number"
          inputMode="numeric"
          min={1}
          max={60}
          value={form.timeoutSecs}
          onChange={e => setForm(f => ({ ...f, timeoutSecs: e.target.value }))}
          placeholder="10"
          disabled={isLoading || isSaving}
          style={inputStyle}
        />
        <p style={helperStyle}>
          Range 1-60. Leave empty to use the built-in 10s default.
        </p>

        {error ? (
          <div data-testid="settings-error" role="alert" style={errorStyle}>
            {error}
          </div>
        ) : null}

        <div style={actionsStyle}>
          <button
            type="button"
            data-testid="settings-cancel"
            onClick={onClose}
            disabled={isSaving}
            style={secondaryButtonStyle}
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid="settings-save"
            disabled={isLoading || isSaving || prefs === null}
            style={primaryButtonStyle}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(10, 10, 10, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
  padding: space[6],
  backgroundColor: colors.mono9,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono0,
  minWidth: 360,
  maxWidth: 560,
  fontFamily: type.fontFamily.sans,
  color: colors.mono0,
}

const headingStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.lg,
  fontWeight: type.fontWeight.bold,
  lineHeight: type.lineHeight.tight,
  margin: 0,
  marginBottom: space[2],
}

const fieldLabelStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.medium,
  color: colors.mono0,
  margin: 0,
}

const helperStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  color: colors.mono5,
  margin: 0,
  marginBottom: space[2],
}

const errorStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[3],
  paddingBlock: space[2],
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: space[2],
  marginTop: space[3],
}

const primaryButtonStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.medium,
  color: colors.mono9,
  backgroundColor: colors.mono0,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono0,
  paddingInline: space[3],
  paddingBlock: space[1],
  cursor: 'pointer',
}

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  color: colors.mono0,
  backgroundColor: colors.mono8,
}
