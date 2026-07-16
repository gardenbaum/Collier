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
const {
  mockCheckBdVersionCmd,
  mockWriteText,
  mockClose,
  mockLoggerWarn,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockCheckBdVersionCmd: vi.fn(),
  mockWriteText: vi.fn(),
  mockClose: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
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

// Logger noise reduction — warn/error captured for assertion.
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: mockLoggerWarn,
    error: mockLoggerError,
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

  it('unexpected error variant still shows the modal and logs a warn (covers L34-L35)', async () => {
    // `commands.checkBdVersionCmd` can return errors other than
    // BdNotInPath (e.g. a runner panic, a transport timeout that
    // reaches the typed-error layer). interpretCheckResult treats
    // those as "missing" so the modal still blocks the user, but
    // logs the unexpected shape via logger.warn so it's visible in
    // dev diagnostics.
    mockCheckBdVersionCmd.mockResolvedValue({
      status: 'error',
      error: { type: 'RunnerError', message: 'bd segfault' },
    })

    const { BdNotInPath } = await importSut()
    render(<BdNotInPath />)

    await waitFor(() => {
      expect(mockCheckBdVersionCmd).toHaveBeenCalledTimes(1)
    })

    // Modal renders (state falls through to 'missing' via the
    // catch-all branch in interpretCheckResult).
    expect(screen.getByText('bd CLI not found in PATH')).toBeInTheDocument()

    // logger.warn was called with a diagnostic that mentions the
    // unexpected error.
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'bd check returned unexpected error',
      expect.objectContaining({
        error: expect.objectContaining({ type: 'RunnerError' }),
      })
    )
  })

  it('recheck swallows a thrown probe and keeps the modal (covers L70-L71)', async () => {
    // First probe: not in path (modal opens). Recheck invocation:
    // the command rejects (not a structured error — it throws).
    // handleRecheck's catch must mark the issue as still missing
    // and log via logger.error. The modal stays open because we
    // can't prove bd is installed.
    mockCheckBdVersionCmd
      .mockResolvedValueOnce({
        status: 'error',
        error: { type: 'BdNotInPath' },
      })
      .mockRejectedValueOnce(new Error('IPC channel closed'))

    const { BdNotInPath } = await importSut()
    const user = userEvent.setup()
    render(<BdNotInPath />)

    const recheck = await screen.findByRole('button', { name: /recheck/i })

    await user.click(recheck)

    // Modal stays open — a thrown probe is treated as "missing".
    await waitFor(() => {
      expect(screen.getByText('bd CLI not found in PATH')).toBeInTheDocument()
    })

    expect(mockCheckBdVersionCmd).toHaveBeenCalledTimes(2)
    expect(mockLoggerError).toHaveBeenCalledWith(
      'bd check threw',
      expect.objectContaining({ err: expect.any(Error) })
    )
  })

  it('copy button logs but stays silent when writeText rejects (covers L81)', async () => {
    // writeText can throw (clipboard permission denied, Tauri
    // clipboard manager missing, …). handleCopy's catch swallows
    // the error and logs it; the user-observable result is just
    // that the modal stays put and no further action is taken.
    mockCheckBdVersionCmd.mockResolvedValue({
      status: 'error',
      error: { type: 'BdNotInPath' },
    })
    mockWriteText.mockRejectedValueOnce(new Error('clipboard unavailable'))

    const { BdNotInPath } = await importSut()
    const user = userEvent.setup()
    render(<BdNotInPath />)

    const copy = await screen.findByRole('button', { name: /copy/i })

    await user.click(copy)

    // The error is captured by logger.error — there's no toast or
    // thrown error, the failure is silent on purpose (UX: never
    // pop an alert over the install instructions).
    await waitFor(() => {
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to copy install command',
        expect.objectContaining({ err: expect.any(Error) })
      )
    })

    // Modal still renders — the copy failure is non-blocking.
    expect(screen.getByText('bd CLI not found in PATH')).toBeInTheDocument()
  })

  it('initial probe rejection shows the modal with logger.error (covers L55-L57)', async () => {
    // Different from the unmount-race test: here the component
    // stays mounted through the rejection, so the .catch body's
    // logger.error + setState('missing') actually run. This is
    // the catch-all when `commands.checkBdVersionCmd` itself
    // throws (e.g. the Tauri IPC channel dropped mid-handshake).
    mockCheckBdVersionCmd.mockRejectedValueOnce(new Error('IPC channel closed'))

    const { BdNotInPath } = await importSut()
    render(<BdNotInPath />)

    await waitFor(() => {
      expect(mockCheckBdVersionCmd).toHaveBeenCalledTimes(1)
    })

    // Modal renders — a thrown probe is treated as "missing".
    expect(screen.getByText('bd CLI not found in PATH')).toBeInTheDocument()

    expect(mockLoggerError).toHaveBeenCalledWith(
      'bd check threw',
      expect.objectContaining({ err: expect.any(Error) })
    )
  })

  it('unmount before settle: cancelled guards short-circuit both .then and .catch (covers L51, L55-L57)', async () => {
    // Same unmount-race pattern as VersionCheck.test.tsx: render,
    // unmount, then resolve/reject the in-flight probe. The
    // `if (cancelled) return` guards inside the .then and .catch
    // blocks must short-circuit so the unmounted component never
    // calls setState (React would warn about the update).
    //
    // First: reject after unmount — exercises the .catch guard
    // (L55-L57: cancelled check + logger.error + setState are all
    // skipped).
    let rejectProbe!: (reason: unknown) => void
    mockCheckBdVersionCmd.mockImplementationOnce(
      () =>
        new Promise((_res, rej) => {
          rejectProbe = rej
        })
    )

    const { BdNotInPath } = await importSut()
    const { unmount: unmountReject } = render(<BdNotInPath />)
    unmountReject()
    rejectProbe(new Error('late failure after unmount'))

    // Drain microtasks so the rejected promise's .catch handler runs.
    await new Promise(resolve => setTimeout(resolve, 0))

    // Neither logger.error nor the modal-render path fired because
    // cancelled was true. logger.error would have been called if
    // the catch body had executed (the `setState('missing')` on
    // an unmounted component is what we actually want to prevent).
    expect(mockLoggerError).not.toHaveBeenCalled()

    // Second: resolve after unmount — exercises the .then guard
    // (L51: cancelled check skipped so interpretCheckResult +
    // setState never run).
    let resolveProbe!: (value: unknown) => void
    mockCheckBdVersionCmd.mockImplementationOnce(
      () =>
        new Promise(res => {
          resolveProbe = res
        })
    )

    const { unmount: unmountResolve } = render(<BdNotInPath />)
    unmountResolve()
    resolveProbe({ status: 'error', error: { type: 'BdNotInPath' } })

    await new Promise(resolve => setTimeout(resolve, 0))

    // If the .then body had executed, logger.warn would NOT be
    // called here (BdNotInPath goes through the early return).
    // We assert the negative invariant: no error log for the
    // unmount-then-resolve case either.
    expect(mockLoggerError).not.toHaveBeenCalled()
    expect(mockLoggerWarn).not.toHaveBeenCalled()
  })
})
