/**
 * Tests for the beads SettingsPanel.
 *
 * Contract: when `open={true}`, the panel loads preferences via
 * `commands.loadPreferences()`, renders the two fields (`bd_path`
 * and `default_timeout_secs`), and persists changes via
 * `commands.savePreferences(...)`. When `open={false}`, the
 * panel renders nothing. Invalid timeout values (out of range)
 * are rejected client-side; the panel surfaces the error inline
 * without calling `savePreferences`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { SettingsPanel } from './SettingsPanel'
import { logger } from '@/lib/logger'
import type { AppPreferences } from '@/lib/tauri-bindings'

const { mockLoadPreferences, mockSavePreferences } = vi.hoisted(() => ({
  mockLoadPreferences: vi.fn(),
  mockSavePreferences: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    loadPreferences: mockLoadPreferences,
    savePreferences: mockSavePreferences,
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const basePrefs = {
  theme: 'system',
  quick_pane_shortcut: null,
  language: null,
  recent_repos: [],
  bd_path: null,
  default_timeout_secs: null,
}

const onClose = vi.fn()
const onSaved = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadPreferences.mockResolvedValue({ status: 'ok', data: basePrefs })
  mockSavePreferences.mockResolvedValue({ status: 'ok', data: null })
})

describe('SettingsPanel', () => {
  it('renders nothing when open is false', () => {
    render(<SettingsPanel open={false} onClose={onClose} />)

    expect(screen.queryByTestId('settings-panel')).not.toBeInTheDocument()
  })

  it('loads preferences on open and prefills the two fields', async () => {
    mockLoadPreferences.mockResolvedValue({
      status: 'ok',
      data: {
        ...basePrefs,
        bd_path: '/opt/bd/bin/bd',
        default_timeout_secs: 30,
      },
    })

    render(<SettingsPanel open={true} onClose={onClose} onSaved={onSaved} />)

    await waitFor(() => {
      expect(mockLoadPreferences).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByTestId('settings-bd-path')).toHaveValue('/opt/bd/bin/bd')
    // The timeout input is type="number", so .value is a number,
    // not a string. toHaveValue matches the input's typed value.
    expect(screen.getByTestId('settings-timeout')).toHaveValue(30)
  })

  it('saves the updated values when the user submits a valid form', async () => {
    const user = userEvent.setup()
    render(<SettingsPanel open={true} onClose={onClose} onSaved={onSaved} />)

    await waitFor(() => {
      expect(screen.getByTestId('settings-bd-path')).toBeInTheDocument()
    })

    await user.clear(screen.getByTestId('settings-bd-path'))
    await user.type(screen.getByTestId('settings-bd-path'), '/custom/bd')
    await user.clear(screen.getByTestId('settings-timeout'))
    await user.type(screen.getByTestId('settings-timeout'), '15')
    await user.click(screen.getByTestId('settings-save'))

    await waitFor(() => {
      expect(mockSavePreferences).toHaveBeenCalledTimes(1)
    })

    const saved = mockSavePreferences.mock.calls[0]?.[0] as {
      bd_path: string | null
      default_timeout_secs: number | null
    }
    expect(saved.bd_path).toBe('/custom/bd')
    expect(saved.default_timeout_secs).toBe(15)
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('persists null overrides when both fields are cleared', async () => {
    mockLoadPreferences.mockResolvedValue({
      status: 'ok',
      data: { ...basePrefs, bd_path: '/old/bd', default_timeout_secs: 30 },
    })
    const user = userEvent.setup()
    render(<SettingsPanel open={true} onClose={onClose} onSaved={onSaved} />)

    await waitFor(() => {
      expect(screen.getByTestId('settings-bd-path')).toHaveValue('/old/bd')
    })

    await user.clear(screen.getByTestId('settings-bd-path'))
    await user.clear(screen.getByTestId('settings-timeout'))
    await user.click(screen.getByTestId('settings-save'))

    await waitFor(() => {
      expect(mockSavePreferences).toHaveBeenCalledTimes(1)
    })

    const saved = mockSavePreferences.mock.calls[0]?.[0] as {
      bd_path: string | null
      default_timeout_secs: number | null
    }
    expect(saved.bd_path).toBeNull()
    expect(saved.default_timeout_secs).toBeNull()
  })

  it('rejects out-of-range timeout values without calling savePreferences', async () => {
    const user = userEvent.setup()
    render(<SettingsPanel open={true} onClose={onClose} onSaved={onSaved} />)

    await waitFor(() => {
      expect(screen.getByTestId('settings-timeout')).toBeInTheDocument()
    })

    // 100 is outside the documented 1-60 range; the panel should
    // surface the validation error inline and never call
    // savePreferences.
    await user.clear(screen.getByTestId('settings-timeout'))
    await user.type(screen.getByTestId('settings-timeout'), '100')
    await user.click(screen.getByTestId('settings-save'))

    expect(mockSavePreferences).not.toHaveBeenCalled()
    expect(screen.getByTestId('settings-error').textContent).toMatch(
      /between 1 and 60/i
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not use the brand colour in the rendered output (AC-14)', async () => {
    const { container } = render(
      <SettingsPanel open={true} onClose={onClose} />
    )

    await waitFor(() => {
      expect(screen.getByTestId('settings-bd-path')).toBeInTheDocument()
    })

    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })

  it('prefills empty inputs and saves null when both stored overrides are null', async () => {
    // basePrefs already has bd_path=null and default_timeout_secs=null;
    // this exercises the `?? ''` fallback (line 67) and the
    // `!== null && !== undefined` ternary's else branch (lines 69-72).
    // The runtime check on `saved.default_timeout_secs === null`
    // confirms the ternary returned the empty-string branch, which
    // formToPrefs then converts to null on submit.
    mockLoadPreferences.mockResolvedValue({ status: 'ok', data: basePrefs })

    const user = userEvent.setup()
    render(<SettingsPanel open={true} onClose={onClose} onSaved={onSaved} />)

    await waitFor(() => {
      expect(mockLoadPreferences).toHaveBeenCalledTimes(1)
    })

    // bd_path is a text input, so the empty string renders cleanly.
    expect(screen.getByTestId('settings-bd-path')).toHaveValue('')
    // The timeout input is type="number" — React renders value=""
    // and the DOM normalizes empty number values to null.
    expect(
      (screen.getByTestId('settings-timeout') as HTMLInputElement).value
    ).toBeFalsy()

    // Submit without changes; save should be called with both
    // overrides as null.
    await user.click(screen.getByTestId('settings-save'))

    await waitFor(() => {
      expect(mockSavePreferences).toHaveBeenCalledTimes(1)
    })
    const saved = mockSavePreferences.mock.calls[0]?.[0] as {
      bd_path: string | null
      default_timeout_secs: number | null
    }
    expect(saved.bd_path).toBeNull()
    expect(saved.default_timeout_secs).toBeNull()
  })

  it('falls back to the empty form when loadPreferences resolves with null data', async () => {
    // Defensive branch in `prefsToForm` (line 65): if `data` is
    // null/undefined, the helper returns DEFAULT_FORM_STATE instead
    // of throwing. The panel renders with the loading state because
    // `prefs === null` triggers `isLoading` — the save button is
    // disabled so we can't verify via save.
    mockLoadPreferences.mockResolvedValue({
      status: 'ok',
      data: null as unknown as AppPreferences,
    })

    render(<SettingsPanel open={true} onClose={onClose} />)

    await waitFor(() => {
      expect(mockLoadPreferences).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByTestId('settings-bd-path')).toHaveValue('')
    expect(
      (screen.getByTestId('settings-timeout') as HTMLInputElement).value
    ).toBeFalsy()
  })

  it('surfaces an inline error when loadPreferences resolves with status: error', async () => {
    mockLoadPreferences.mockResolvedValue({
      status: 'error',
      error: 'disk on fire',
    })

    render(<SettingsPanel open={true} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByTestId('settings-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('settings-error').textContent).toMatch(
      /Failed to load preferences: disk on fire/
    )
  })

  it('surfaces a generic error and logs when loadPreferences throws', async () => {
    mockLoadPreferences.mockRejectedValue(new Error('boom'))

    render(<SettingsPanel open={true} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByTestId('settings-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('settings-error').textContent).toMatch(
      /Failed to load preferences\./
    )
    expect(logger.error).toHaveBeenCalledWith(
      'loadPreferences threw',
      expect.objectContaining({ err: expect.any(Error) })
    )
  })

  it('does not apply stale load results after the panel unmounts mid-load', async () => {
    // Covers the `if (cancelled) return` branch in the .then
    // resolver (line 108). We start the load, close the panel
    // before the promise settles, then resolve — the .then sees
    // `cancelled === true` and returns early without surfacing an
    // error or updating state.
    const resolveLoad =
      vi.fn<(value: { status: 'ok'; data: AppPreferences }) => void>()
    mockLoadPreferences.mockImplementation(
      () =>
        new Promise<{ status: 'ok'; data: AppPreferences }>(resolve => {
          resolveLoad.mockImplementation(() =>
            resolve({ status: 'ok', data: basePrefs })
          )
        })
    )

    const { rerender } = render(<SettingsPanel open={true} onClose={onClose} />)
    await waitFor(() => {
      expect(mockLoadPreferences).toHaveBeenCalledTimes(1)
    })

    // Close the panel — cleanup sets `cancelled = true` for the
    // in-flight load.
    rerender(<SettingsPanel open={false} onClose={onClose} />)

    // Resolve the load — the .then sees `cancelled === true` and
    // returns early (line 108).
    resolveLoad({ status: 'ok', data: basePrefs })

    await waitFor(() => {
      expect(mockLoadPreferences).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByTestId('settings-error')).not.toBeInTheDocument()
  })

  it('does not surface a load error after the panel unmounts mid-rejection', async () => {
    // Covers the `if (cancelled) return` branch in the .catch
    // resolver (line 118). The promise rejects after the panel
    // unmounts — the .catch fires but sees `cancelled === true`
    // and returns early without calling logger.error or setError.
    const rejectLoad = vi.fn<(err: Error) => void>()
    mockLoadPreferences.mockImplementation(
      () =>
        new Promise<{ status: 'ok'; data: AppPreferences }>((_, reject) => {
          rejectLoad.mockImplementation(reject)
        })
    )

    const { rerender } = render(<SettingsPanel open={true} onClose={onClose} />)
    await waitFor(() => {
      expect(mockLoadPreferences).toHaveBeenCalledTimes(1)
    })

    // Close the panel — cleanup sets `cancelled = true` for the
    // in-flight load.
    rerender(<SettingsPanel open={false} onClose={onClose} />)

    // Reject the load — the .catch sees `cancelled === true` and
    // returns early (line 118). No error surfaces, no log.
    rejectLoad(new Error('boom'))

    await waitFor(() => {
      expect(mockLoadPreferences).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByTestId('settings-error')).not.toBeInTheDocument()
    expect(logger.error).not.toHaveBeenCalledWith(
      'loadPreferences threw',
      expect.anything()
    )
  })

  it('shows Saving… and disables the submit button while a save is in flight', async () => {
    // Mock savePreferences with a promise that never resolves so
    // `isSaving` stays true. This exercises the `Saving…` ternary
    // branch (line 255), the disabled-during-save buttons, and the
    // `if (isSaving || prefs === null) return` guard when the user
    // double-clicks save (line 145).
    mockSavePreferences.mockReturnValue(new Promise<never>(() => undefined))

    const user = userEvent.setup()
    render(<SettingsPanel open={true} onClose={onClose} onSaved={onSaved} />)

    await waitFor(() => {
      expect(screen.getByTestId('settings-save')).toBeInTheDocument()
    })

    // First click: starts the save, sets isSaving=true.
    await user.click(screen.getByTestId('settings-save'))

    // Mid-save: button now reads 'Saving…' and is disabled.
    await waitFor(() => {
      expect(screen.getByTestId('settings-save')).toHaveTextContent('Saving…')
    })
    expect(screen.getByTestId('settings-save')).toBeDisabled()
    expect(screen.getByTestId('settings-cancel')).toBeDisabled()

    // Second click: handleSubmit's early-return guard fires because
    // `isSaving` is already true — savePreferences is NOT called
    // again.
    await user.click(screen.getByTestId('settings-save'))
    expect(mockSavePreferences).toHaveBeenCalledTimes(1)
  })

  it('surfaces an inline error when savePreferences resolves with status: error', async () => {
    mockSavePreferences.mockResolvedValue({
      status: 'error',
      error: 'permission denied',
    })

    const user = userEvent.setup()
    render(<SettingsPanel open={true} onClose={onClose} onSaved={onSaved} />)

    await waitFor(() => {
      expect(screen.getByTestId('settings-bd-path')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('settings-save'))

    await waitFor(() => {
      expect(screen.getByTestId('settings-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('settings-error').textContent).toMatch(
      /Failed to save preferences: permission denied/
    )
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('surfaces a generic error and logs when savePreferences throws', async () => {
    mockSavePreferences.mockRejectedValueOnce(new Error('boom'))

    const user = userEvent.setup()
    render(<SettingsPanel open={true} onClose={onClose} onSaved={onSaved} />)

    await waitFor(() => {
      expect(screen.getByTestId('settings-bd-path')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('settings-save'))

    await waitFor(() => {
      expect(screen.getByTestId('settings-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('settings-error').textContent).toMatch(
      /Failed to save preferences\./
    )
    expect(logger.error).toHaveBeenCalledWith(
      'savePreferences threw',
      expect.objectContaining({ err: expect.any(Error) })
    )
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not save if the form is submitted before preferences have loaded', async () => {
    // Covers the `prefs === null` branch of
    // `if (isSaving || prefs === null) return` (line 145). The save
    // button is disabled while `prefs === null`, but the form can
    // still receive a submit event (e.g. via fireEvent.submit, or a
    // future automation that bypasses the disabled state). The guard
    // must hold the line: we never call savePreferences without a
    // loaded prefs.
    mockLoadPreferences.mockReturnValue(new Promise<never>(() => undefined))

    render(<SettingsPanel open={true} onClose={onClose} onSaved={onSaved} />)

    await waitFor(() => {
      expect(mockLoadPreferences).toHaveBeenCalledTimes(1)
    })

    // prefs is still null because we haven't resolved the load.
    // Submit the form directly — handleSubmit's guard must catch
    // this.
    fireEvent.submit(screen.getByTestId('settings-form'))

    // Drain microtasks; no save call should have been made.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mockSavePreferences).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
