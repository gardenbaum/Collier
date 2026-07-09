/**
 * Tests for the `GeneralPane` component.
 *
 * The pane is small but its real behaviour is the
 * `commands.updateQuickPaneShortcut` <-> `savePreferences` dance:
 *   - try to register the OS shortcut first,
 *   - only persist if registration succeeded,
 *   - roll back the OS registration if persistence fails,
 *   - mirror that same contract on "reset to defaults".
 *
 * That rollback contract is what would silently corrupt a user's
 * shortcut if it ever broke - so these tests focus there. The
 * ShortcutPicker's keyboard-capture loop has its own coverage; here
 * we mock it down to an `onChange` trigger so each test can assert on
 * the side effects (mocked commands, mocked toasts) rather than the
 * capture mechanics.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { GeneralPane } from './GeneralPane'

// ponytail: hoist the mock references so the vi.mock factories
// below can close over the same fns the test body asserts on.
const { mockCommands } = vi.hoisted(() => ({
  mockCommands: {
    updateQuickPaneShortcut: vi.fn(),
    getDefaultQuickPaneShortcut: vi.fn(),
    savePreferences: vi.fn(),
    loadPreferences: vi.fn(),
  },
}))

const { mockToast } = vi.hoisted(() => ({
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// usePreferences + useSavePreferences live in the preferences
// service. We mock them here so each test can drive the component
// with a controlled fixture (loaded / loading / pending) instead of
// spinning up the real TanStack Query hooks.
const mockUsePreferences = vi.fn()
const mockUseSavePreferences = vi.fn()

// Stable preferences fixture used by most render-path tests.
const stablePreferences = {
  theme: 'system',
  quick_pane_shortcut: 'CommandOrControl+Shift+P',
  language: 'en',
  recent_repos: [],
  bd_path: null,
  default_timeout_secs: null,
}

vi.mock('@/lib/tauri-bindings', () => ({
  commands: mockCommands,
}))

vi.mock('sonner', () => ({
  toast: mockToast,
}))

vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}))

vi.mock('@/services/preferences', () => ({
  usePreferences: () => mockUsePreferences(),
  useSavePreferences: () => mockUseSavePreferences(),
}))

// Replace ShortcutPicker with a thin stub that exposes `onChange`
// through two buttons (Set = non-null value, Reset = null). The real
// component's keyboard capture is exercised by its own tests; here
// we only care about how GeneralPane reacts to the callback.
vi.mock('../ShortcutPicker', () => ({
  ShortcutPicker: ({
    value,
    defaultValue,
    onChange,
    disabled,
  }: {
    value: string | null
    defaultValue: string
    onChange: (shortcut: string | null) => void
    disabled?: boolean
  }) => (
    <div
      data-testid="shortcut-picker"
      data-value={value ?? ''}
      data-default-value={defaultValue}
      data-disabled={disabled ? 'true' : 'false'}
    >
      <button
        type="button"
        data-testid="shortcut-picker-set"
        onClick={() => onChange('CommandOrControl+Alt+K')}
      >
        set
      </button>
      <button
        type="button"
        data-testid="shortcut-picker-reset"
        onClick={() => onChange(null)}
      >
        reset
      </button>
    </div>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  // Default: backend mocks resolve successfully. Individual tests
  // override per scenario.
  mockCommands.updateQuickPaneShortcut.mockResolvedValue({
    status: 'ok',
    data: null,
  })
  mockCommands.getDefaultQuickPaneShortcut.mockResolvedValue(
    'CommandOrControl+Shift+.'
  )
})

// ponytail: helper that wires up the most common "data loaded +
// save ready" state. Returns the live userEvent instance.
function setupLoaded(preferences = stablePreferences) {
  const saveMutation = {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }
  mockUsePreferences.mockReturnValue({
    data: preferences,
    isLoading: false,
  })
  mockUseSavePreferences.mockReturnValue(saveMutation)
  const user = userEvent.setup()
  render(<GeneralPane />)
  return { user, saveMutation }
}

describe('GeneralPane', () => {
  describe('render path', () => {
    it('renders the ShortcutPicker with the loaded quick_pane_shortcut', () => {
      setupLoaded()
      const picker = screen.getByTestId('shortcut-picker')
      expect(picker).toHaveAttribute('data-value', 'CommandOrControl+Shift+P')
    })

    it('renders the "Reset to defaults" button with data-testid', () => {
      setupLoaded()
      const button = screen.getByTestId('reset-to-defaults')
      expect(button).toBeInTheDocument()
      // The button text comes from the i18n catalogue and falls back
      // to the second-arg default when the key is missing.
      expect(button).toHaveTextContent('Reset to defaults')
    })

    it('disables both controls while preferences are still loading', () => {
      mockUsePreferences.mockReturnValue({
        data: undefined,
        isLoading: true,
      })
      mockUseSavePreferences.mockReturnValue({
        mutateAsync: vi.fn().mockResolvedValue(undefined),
        isPending: false,
      })
      render(<GeneralPane />)
      const picker = screen.getByTestId('shortcut-picker')
      expect(picker).toHaveAttribute('data-disabled', 'true')
      expect(screen.getByTestId('reset-to-defaults')).toBeDisabled()
    })

    it('disables both controls while savePreferences.isPending is true', () => {
      mockUsePreferences.mockReturnValue({
        data: stablePreferences,
        isLoading: false,
      })
      mockUseSavePreferences.mockReturnValue({
        mutateAsync: vi.fn().mockResolvedValue(undefined),
        isPending: true,
      })
      render(<GeneralPane />)
      const picker = screen.getByTestId('shortcut-picker')
      expect(picker).toHaveAttribute('data-disabled', 'true')
      expect(screen.getByTestId('reset-to-defaults')).toBeDisabled()
    })

    it('falls back to the "CommandOrControl+Shift+." placeholder when getDefaultQuickPaneShortcut has not resolved', () => {
      // Never resolve - the queryFn promise stays pending, so the
      // pane sees `defaultShortcut === undefined` and substitutes the
      // hard-coded fallback that mirrors DEFAULT_QUICK_PANE_SHORTCUT
      // in src-tauri/src/lib.rs.
      mockCommands.getDefaultQuickPaneShortcut.mockReturnValue(
        new Promise<void>(() => undefined)
      )
      setupLoaded()
      expect(screen.getByTestId('shortcut-picker')).toHaveAttribute(
        'data-default-value',
        'CommandOrControl+Shift+.'
      )
    })

    it('falls through handleShortcutChange silently when preferences are not loaded', async () => {
      // The disabled prop blocks UI clicks while prefs are loading,
      // but handleShortcutChange also has an explicit guard so a
      // race (props change after click) cannot register an OS
      // shortcut with no preferences to fall back to.
      mockUsePreferences.mockReturnValue({
        data: undefined,
        isLoading: true,
      })
      const saveMutation = {
        mutateAsync: vi.fn().mockResolvedValue(undefined),
        isPending: false,
      }
      mockUseSavePreferences.mockReturnValue(saveMutation)
      const user = userEvent.setup()
      render(<GeneralPane />)
      await user.click(screen.getByTestId('shortcut-picker-set'))
      // Guard returned early - no OS call, no save.
      expect(mockCommands.updateQuickPaneShortcut).not.toHaveBeenCalled()
      expect(saveMutation.mutateAsync).not.toHaveBeenCalled()
      expect(mockToast.success).not.toHaveBeenCalled()
      expect(mockToast.error).not.toHaveBeenCalled()
    })

    it('passes the resolved backend default shortcut through to ShortcutPicker', async () => {
      mockCommands.getDefaultQuickPaneShortcut.mockResolvedValue(
        'CommandOrControl+Alt+X'
      )
      setupLoaded()
      // The useQuery inside GeneralPane resolves asynchronously;
      // wait for the ShortcutPicker's defaultValue prop to reflect
      // the backend response rather than the synchronous fallback.
      await waitFor(() =>
        expect(screen.getByTestId('shortcut-picker')).toHaveAttribute(
          'data-default-value',
          'CommandOrControl+Alt+X'
        )
      )
    })
  })

  describe('shortcut update', () => {
    it('happy path: registers the new shortcut, saves the merged prefs, toasts success', async () => {
      const { user, saveMutation } = setupLoaded()
      mockCommands.updateQuickPaneShortcut.mockResolvedValue({
        status: 'ok',
        data: null,
      })

      await user.click(screen.getByTestId('shortcut-picker-set'))

      await waitFor(() => {
        expect(mockCommands.updateQuickPaneShortcut).toHaveBeenCalledWith(
          'CommandOrControl+Alt+K'
        )
      })
      expect(saveMutation.mutateAsync).toHaveBeenCalledWith({
        ...stablePreferences,
        quick_pane_shortcut: 'CommandOrControl+Alt+K',
      })
      // 'toast.success.shortcutUpdated' is missing from en.json so
      // react-i18next returns the key as-is - that's the value the
      // pane hands to toast.success().
      expect(mockToast.success).toHaveBeenCalledWith(
        'toast.success.shortcutUpdated'
      )
      expect(mockToast.error).not.toHaveBeenCalled()
    })

    it('OS registration failure: toasts error and does NOT save preferences', async () => {
      const { user, saveMutation } = setupLoaded()
      mockCommands.updateQuickPaneShortcut.mockResolvedValue({
        status: 'error',
        error: 'registration conflict',
      })

      await user.click(screen.getByTestId('shortcut-picker-set'))

      await waitFor(() => {
        expect(mockCommands.updateQuickPaneShortcut).toHaveBeenCalledWith(
          'CommandOrControl+Alt+K'
        )
      })
      // The whole point of this test: the OS-level change failed,
      // so the persisted prefs must NOT be touched (no partial state).
      expect(saveMutation.mutateAsync).not.toHaveBeenCalled()
      // The toast is shown with the backend's error string as the
      // description so the user knows why their shortcut didn't stick.
      expect(mockToast.error).toHaveBeenCalledWith(
        'Failed to register shortcut',
        { description: 'registration conflict' }
      )
      // No rollback call - there's nothing to roll back to (the OS
      // binding never changed).
      expect(mockCommands.updateQuickPaneShortcut).toHaveBeenCalledTimes(1)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to register shortcut',
        expect.objectContaining({ error: 'registration conflict' })
      )
    })

    it('save failure triggers rollback: re-registers the old shortcut, toasts error, logs error', async () => {
      const { user, saveMutation } = setupLoaded()
      const saveError = new Error('disk full')
      saveMutation.mutateAsync.mockRejectedValue(saveError)
      mockCommands.updateQuickPaneShortcut.mockResolvedValue({
        status: 'ok',
        data: null,
      })

      await user.click(screen.getByTestId('shortcut-picker-set'))

      // Two calls: (1) set the new shortcut, (2) restore the old one.
      await waitFor(() => {
        expect(mockCommands.updateQuickPaneShortcut).toHaveBeenCalledTimes(2)
      })
      const calls = mockCommands.updateQuickPaneShortcut.mock.calls
      expect(calls[0]?.[0]).toBe('CommandOrControl+Alt+K')
      expect(calls[1]?.[0]).toBe('CommandOrControl+Shift+P')
      expect(mockToast.error).toHaveBeenCalledWith(
        'toast.error.shortcutSaveFailed'
      )
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Save failed after registration, rolling back',
        expect.objectContaining({ error: saveError })
      )
      expect(mockToast.success).not.toHaveBeenCalled()
    })
  })

  describe('reset to defaults', () => {
    it('happy path: unregisters the OS shortcut first, then saves the fully-defaulted prefs', async () => {
      const { user, saveMutation } = setupLoaded()
      mockCommands.updateQuickPaneShortcut.mockResolvedValue({
        status: 'ok',
        data: null,
      })

      await user.click(screen.getByTestId('reset-to-defaults'))

      await waitFor(() => {
        expect(mockCommands.updateQuickPaneShortcut).toHaveBeenCalledWith(null)
      })
      // Reset writes the FULL default fixture - theme + language +
      // shortcut + recent_repos + bd_path + default_timeout_secs -
      // so the on-disk preferences stay coherent with the cleared
      // OS binding.
      expect(saveMutation.mutateAsync).toHaveBeenCalledWith({
        ...stablePreferences,
        theme: 'system',
        language: null,
        quick_pane_shortcut: null,
        recent_repos: [],
        bd_path: null,
        default_timeout_secs: null,
      })
      // 'preferences.common.resetToDefaultsSuccess' resolves to the
      // 'Reset to defaults' translation in en.json.
      expect(mockToast.success).toHaveBeenCalledWith('Reset to defaults')
      expect(mockToast.error).not.toHaveBeenCalled()
    })

    it('unregister failure short-circuits the reset: toasts error and does NOT call savePreferences', async () => {
      const { user, saveMutation } = setupLoaded()
      mockCommands.updateQuickPaneShortcut.mockResolvedValue({
        status: 'error',
        error: 'unregister blocked',
      })

      await user.click(screen.getByTestId('reset-to-defaults'))

      await waitFor(() => {
        expect(mockCommands.updateQuickPaneShortcut).toHaveBeenCalledWith(null)
      })
      // Save must NOT fire - otherwise we'd half-reset: prefs
      // nullified on disk while the OS still routes the old key.
      expect(saveMutation.mutateAsync).not.toHaveBeenCalled()
      expect(mockToast.error).toHaveBeenCalledWith(
        'Failed to register shortcut',
        { description: 'unregister blocked' }
      )
      // Only the one unregister attempt - no rollback needed.
      expect(mockCommands.updateQuickPaneShortcut).toHaveBeenCalledTimes(1)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to unregister shortcut on reset',
        expect.objectContaining({ error: 'unregister blocked' })
      )
    })

    it('save failure triggers best-effort rollback: re-registers the old shortcut, toasts error, logs error', async () => {
      const { user, saveMutation } = setupLoaded()
      const saveError = new Error('io error')
      saveMutation.mutateAsync.mockRejectedValue(saveError)
      mockCommands.updateQuickPaneShortcut.mockResolvedValue({
        status: 'ok',
        data: null,
      })

      await user.click(screen.getByTestId('reset-to-defaults'))

      await waitFor(() => {
        expect(mockCommands.updateQuickPaneShortcut).toHaveBeenCalledTimes(2)
      })
      const calls = mockCommands.updateQuickPaneShortcut.mock.calls
      expect(calls[0]?.[0]).toBeNull()
      expect(calls[1]?.[0]).toBe('CommandOrControl+Shift+P')
      expect(mockToast.error).toHaveBeenCalledWith(
        'Failed to reset preferences'
      )
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to reset preferences',
        expect.objectContaining({ error: saveError })
      )
      expect(mockToast.success).not.toHaveBeenCalled()
    })
  })
})
