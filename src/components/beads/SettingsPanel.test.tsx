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
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { SettingsPanel } from './SettingsPanel'

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
})
