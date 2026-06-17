/**
 * Tests for the BdNotInPath bootstrap modal.
 *
 * Contract: when `commands.checkBdVersionCmd()` returns
 * `Result.error` of variant `BdNotInPath`, the modal renders blocking
 * the app. It offers two actions:
 *   - "Recheck" — re-invokes the command (in case the user installed `bd` mid-session)
 *   - "Quit"    — closes the Tauri window
 *
 * The install command itself is exposed via a copy button.
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'

// React 19 + Vitest: silence "act() not configured" warnings.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// Hoisted mocks — must be declared before the import of the SUT.
const { mockCheckBdVersionCmd, mockWriteText, mockClose } = vi.hoisted(() => ({
  mockCheckBdVersionCmd: vi.fn(),
  mockWriteText: vi.fn(),
  mockClose: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    checkBdVersionCmd: mockCheckBdVersionCmd,
  },
}))

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: mockWriteText,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    close: mockClose,
  }),
}))

// Logger noise reduction
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Lazy import so the mocks above are wired before the SUT is evaluated.
const importSut = () => import('./BdNotInPath')

beforeEach(() => {
  vi.clearAllMocks()
  mockWriteText.mockResolvedValue(undefined)
  mockClose.mockResolvedValue(undefined)
})

describe('BdNotInPath modal', () => {
  it('renders when bd is not in PATH', async () => {
    mockCheckBdVersionCmd.mockResolvedValue({
      status: 'error',
      error: { type: 'BdNotInPath' },
    })

    const { BdNotInPath } = await importSut()
    render(<BdNotInPath />)

    await waitFor(() => {
      expect(mockCheckBdVersionCmd).toHaveBeenCalledTimes(1)
    })

    // Title and body
    expect(screen.getByText('bd CLI not found in PATH')).toBeInTheDocument()
    expect(
      screen.getByText('Install with: `brew install beads`')
    ).toBeInTheDocument()

    // Action buttons
    expect(screen.getByRole('button', { name: /recheck/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /quit/i })).toBeInTheDocument()
  })

  it('does not render the blocking modal when bd is found', async () => {
    mockCheckBdVersionCmd.mockResolvedValue({
      status: 'ok',
      data: '1.0.5',
    })

    const { BdNotInPath } = await importSut()
    render(<BdNotInPath />)

    await waitFor(() => {
      expect(mockCheckBdVersionCmd).toHaveBeenCalledTimes(1)
    })

    // The blocking content is absent when bd is present
    expect(
      screen.queryByText('bd CLI not found in PATH')
    ).not.toBeInTheDocument()
  })

  it('recheck button re-invokes the check', async () => {
    // First call: not in path. Second call: still not in path (so the modal stays).
    mockCheckBdVersionCmd.mockResolvedValue({
      status: 'error',
      error: { type: 'BdNotInPath' },
    })

    const { BdNotInPath } = await importSut()
    const user = userEvent.setup()
    render(<BdNotInPath />)

    const recheck = await screen.findByRole('button', { name: /recheck/i })
    expect(mockCheckBdVersionCmd).toHaveBeenCalledTimes(1)

    await user.click(recheck)

    await waitFor(() => {
      expect(mockCheckBdVersionCmd).toHaveBeenCalledTimes(2)
    })
  })

  it('quit button closes the current window', async () => {
    mockCheckBdVersionCmd.mockResolvedValue({
      status: 'error',
      error: { type: 'BdNotInPath' },
    })

    const { BdNotInPath } = await importSut()
    const user = userEvent.setup()
    render(<BdNotInPath />)

    const quit = await screen.findByRole('button', { name: /quit/i })

    await user.click(quit)

    await waitFor(() => {
      expect(mockClose).toHaveBeenCalledTimes(1)
    })
  })

  it('copy button writes the install command to the clipboard', async () => {
    mockCheckBdVersionCmd.mockResolvedValue({
      status: 'error',
      error: { type: 'BdNotInPath' },
    })

    const { BdNotInPath } = await importSut()
    const user = userEvent.setup()
    render(<BdNotInPath />)

    // Use findBy to wait for the post-mount render.
    const copy = await screen.findByRole('button', { name: /copy/i })

    await user.click(copy)

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledTimes(1)
    })

    // The argument is the install command itself (no markdown backticks).
    const callArg = (mockWriteText as Mock).mock.calls[0]?.[0]
    expect(callArg).toBe('brew install beads')
  })

  it('hides the modal after a successful recheck', async () => {
    // First call: not in path. Second call: ok.
    mockCheckBdVersionCmd
      .mockResolvedValueOnce({
        status: 'error',
        error: { type: 'BdNotInPath' },
      })
      .mockResolvedValueOnce({ status: 'ok', data: '1.0.5' })

    const { BdNotInPath } = await importSut()
    const user = userEvent.setup()
    render(<BdNotInPath />)

    const recheck = await screen.findByRole('button', { name: /recheck/i })

    await user.click(recheck)

    await waitFor(() => {
      expect(
        screen.queryByText('bd CLI not found in PATH')
      ).not.toBeInTheDocument()
    })

    expect(mockCheckBdVersionCmd).toHaveBeenCalledTimes(2)
  })
})
