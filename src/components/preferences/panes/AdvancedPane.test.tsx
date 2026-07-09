/**
 * Tests for the `AdvancedPane` component.
 *
 * The pane is small but its real behaviour is the
 * `<Switch> <-> setDiagnosticLogging IPC`, the
 * `appLocalDataDir/join/openPath` chain for revealing the daily
 * log file, and the `commands.cleanupOldRecoveryFiles` success /
 * error / exception contract:
 *
 *   - the Switch disables itself while a mutation is in flight,
 *   - the mutation optimistically updates the cache and mirrors
 *     the flag into the in-process Logger,
 *   - the log-file button flips into a busy label while we wait
 *     on `openPath`, then surfaces a toast if the OS rejects the
 *     path,
 *   - the recovery-file button reports the deleted count via
 *     toast description, distinguishes between a structured
 *     Result<error> (silent aside from the toast) and a thrown
 *     exception (toast + logger.error).
 *
 * That contract is what would silently corrupt diagnostic capture
 * or recovery cleanup if it ever broke - so these tests focus
 * there. The Switch's keyboard handlers and the SettingsSection
 * chrome are exercised elsewhere; here we mock them down to
 * callbacks / data-testids so each test can assert on the side
 * effects (mocked commands, mocked toasts, mocked logger) rather
 * than the underlying primitives.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { AdvancedPane } from './AdvancedPane'

// ponytail: hoist the mock references so the vi.mock factories
// below can close over the same fns the test body asserts on.
const { mockCommands } = vi.hoisted(() => ({
  mockCommands: {
    isDiagnosticLoggingEnabled: vi.fn(),
    setDiagnosticLogging: vi.fn(),
    cleanupOldRecoveryFiles: vi.fn(),
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
    setDiagnosticLogging: vi.fn(),
  },
}))

const { mockOpenPath } = vi.hoisted(() => ({
  mockOpenPath: vi.fn(),
}))

const { mockAppLocalDataDir, mockJoin } = vi.hoisted(() => ({
  mockAppLocalDataDir: vi.fn(),
  mockJoin: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: mockCommands,
}))

vi.mock('sonner', () => ({
  toast: mockToast,
}))

vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: mockOpenPath,
}))

vi.mock('@tauri-apps/api/path', () => ({
  appLocalDataDir: mockAppLocalDataDir,
  join: mockJoin,
}))

// Stable "today" date used to assert the daily log filename. We
// freeze the clock so the slice() in the component pins the same
// YYYY-MM-DD across the test run.
const FROZEN_TODAY = '2026-07-09'

beforeEach(() => {
  vi.clearAllMocks()
  // Default: backend mocks resolve successfully and the daily
  // log lives at <APPLOCALDATA>/logs/collier-2026-07-09.log.
  // Individual tests override per scenario.
  mockCommands.isDiagnosticLoggingEnabled.mockResolvedValue({
    status: 'ok',
    data: false,
  })
  mockCommands.setDiagnosticLogging.mockResolvedValue({
    status: 'ok',
    data: null,
  })
  mockCommands.cleanupOldRecoveryFiles.mockResolvedValue({
    status: 'ok',
    data: 0,
  })
  mockAppLocalDataDir.mockResolvedValue(
    '/Users/me/Library/Application Support/Collier'
  )
  mockJoin.mockImplementation(async (...segments: string[]) =>
    segments.filter(segment => segment.length > 0).join('/')
  )
  mockOpenPath.mockResolvedValue(undefined)
  // Freeze the wall clock so new Date().toISOString().slice(0,10)
  // inside the component returns our fixture date. We fake only
  // Date (not setTimeout/setInterval) and pin the time here; the
  // user-event advances the (real) microtask queue on its own,
  // so the rest of the timer surface stays real.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${FROZEN_TODAY}T12:00:00.000Z`))
})

// ponytail: helper that wires up the most common "data loaded"
// state and freezes the JS clock so the daily log filename is
// deterministic. Returns the live userEvent instance.
function setupLoaded(initialDiagnosticLogging = false) {
  mockCommands.isDiagnosticLoggingEnabled.mockResolvedValue({
    status: 'ok',
    data: initialDiagnosticLogging,
  })
  const user = userEvent.setup()
  render(<AdvancedPane />)
  return { user }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('AdvancedPane', () => {
  describe('render path', () => {
    it('renders the diagnostic-logging switch in the disabled (off) state by default', async () => {
      setupLoaded(false)
      const toggle = await screen.findByTestId('advanced-diagnostic-logging')
      expect(toggle).toHaveAttribute('data-state', 'unchecked')
      // The Switch from @radix-ui/react-switch renders with role="switch".
      expect(toggle).toHaveAttribute('role', 'switch')
      // The accompanying label switches on the resolved query value -
      // we land on the "Disabled" fallback string for the i18n key
      // 'common.disabled' in en.json.
      expect(screen.getByText('Disabled')).toBeInTheDocument()
    })

    it('reflects the loaded isDiagnosticLoggingEnabled value (true => Enabled label, checked state)', async () => {
      setupLoaded(true)
      const toggle = await screen.findByTestId('advanced-diagnostic-logging')
      await waitFor(() =>
        expect(toggle).toHaveAttribute('data-state', 'checked')
      )
      expect(screen.getByText('Enabled')).toBeInTheDocument()
    })

    it('renders the "Open log file" and "Clear recovery files" buttons', () => {
      setupLoaded(false)
      // The button labels are stable translations of
      // preferences.advanced.openLogFile and
      // preferences.advanced.clearRecoveryFiles in en.json.
      expect(
        screen.getByRole('button', { name: 'Open log file' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Clear recovery files' })
      ).toBeInTheDocument()
    })

    it('renders the Advanced section title from the i18n catalogue', () => {
      setupLoaded(false)
      // en.json maps preferences.advanced.title to
      // "Example Advanced Settings" (the translation key wins
      // over the i18n fallback string when both are present).
      expect(
        screen.getByRole('heading', {
          name: 'Example Advanced Settings',
          level: 3,
        })
      ).toBeInTheDocument()
    })
  })

  describe('diagnostic logging switch', () => {
    it('clicking the switch from off->on fires setDiagnosticLogging(true)', async () => {
      const { user } = setupLoaded(false)
      const toggle = await screen.findByTestId('advanced-diagnostic-logging')

      await user.click(toggle)

      await waitFor(() =>
        expect(mockCommands.setDiagnosticLogging).toHaveBeenCalledWith(true)
      )
      // On success: optimistic cache + logger mirror - this is the
      // whole reason the in-process Logger exists, so we prove it
      // here rather than rely on the IPC alone.
      expect(mockLogger.setDiagnosticLogging).toHaveBeenCalledWith(true)
      expect(mockToast.error).not.toHaveBeenCalled()
    })

    it('clicking the switch from on->off fires setDiagnosticLogging(false) and mirrors into the logger', async () => {
      const { user } = setupLoaded(true)
      const toggle = await screen.findByTestId('advanced-diagnostic-logging')
      await waitFor(() =>
        expect(toggle).toHaveAttribute('data-state', 'checked')
      )

      await user.click(toggle)

      await waitFor(() =>
        expect(mockCommands.setDiagnosticLogging).toHaveBeenCalledWith(false)
      )
      expect(mockLogger.setDiagnosticLogging).toHaveBeenCalledWith(false)
    })

    it('disables the switch while the mutation is in flight', async () => {
      // Never-resolving mock keeps the mutation pending so we can
      // observe the disabled state without racing the success path.
      mockCommands.setDiagnosticLogging.mockReturnValue(
        new Promise(() => undefined)
      )
      const { user } = setupLoaded(false)
      const toggle = await screen.findByTestId('advanced-diagnostic-logging')

      await user.click(toggle)

      await waitFor(() => expect(toggle).toBeDisabled())
      expect(mockCommands.setDiagnosticLogging).toHaveBeenCalledWith(true)
    })

    it('toasts and logs when the backend returns a string error', async () => {
      mockCommands.setDiagnosticLogging.mockResolvedValue({
        status: 'error',
        error: 'permission denied',
      })
      const { user } = setupLoaded(false)
      const toggle = await screen.findByTestId('advanced-diagnostic-logging')

      await user.click(toggle)

      await waitFor(() =>
        expect(mockToast.error).toHaveBeenCalledWith(
          'Failed to update diagnostic logging'
        )
      )
      // The mutationFn throws an Error(message) built from
      // r.error - that Error is what the onError handler sees, so
      // logger.error receives the message string (not the raw
      // payload).
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to set diagnostic logging',
        expect.objectContaining({ error: expect.any(Error) })
      )
      // No optimistic update - the cache must NOT be flipped when
      // the IPC rejects.
      expect(mockLogger.setDiagnosticLogging).not.toHaveBeenCalled()
    })

    it('JSON-stringifies non-string error payloads before logging', async () => {
      // The mutationFn picks `r.error` for strings and
      // `JSON.stringify(r.error)` for everything else - this guards
      // the contract that downstream logger.error / blob
      // serialisation always sees a string-shaped payload.
      mockCommands.setDiagnosticLogging.mockResolvedValue({
        status: 'error',
        error: { code: 'E_BUSY', detail: 'log file open in another process' },
      })
      const { user } = setupLoaded(false)
      const toggle = await screen.findByTestId('advanced-diagnostic-logging')

      await user.click(toggle)

      await waitFor(() =>
        expect(mockToast.error).toHaveBeenCalledWith(
          'Failed to update diagnostic logging'
        )
      )
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to set diagnostic logging',
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('E_BUSY'),
          }),
        })
      )
      expect(mockLogger.setDiagnosticLogging).not.toHaveBeenCalled()
    })
  })

  describe('open log file button', () => {
    it('happy path: resolves appLocalDataDir/join/openPath and reveals the daily log', async () => {
      const { user } = setupLoaded(false)

      await user.click(screen.getByRole('button', { name: 'Open log file' }))

      // appLocalDataDir is awaited first, then join stitches
      // <dir>/logs/collier-YYYY-MM-DD.log together, then openPath
      // reveals it in the OS file explorer.
      await waitFor(() => expect(mockAppLocalDataDir).toHaveBeenCalled())
      expect(mockJoin).toHaveBeenCalledWith(
        '/Users/me/Library/Application Support/Collier',
        'logs',
        `collier-${FROZEN_TODAY}.log`
      )
      expect(mockOpenPath).toHaveBeenCalledWith(
        `/Users/me/Library/Application Support/Collier/logs/collier-${FROZEN_TODAY}.log`
      )
      // No error toast on the happy path.
      expect(mockToast.error).not.toHaveBeenCalled()
      expect(mockLogger.error).not.toHaveBeenCalled()
      // The button returns to its idle label after the await chain
      // settles - the finally branch must reset isOpening so the
      // user can click again.
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Open log file' })
        ).not.toBeDisabled()
      )
    })

    it('shows the "Opening…" busy label while openPath is in flight, then drops back to "Open log file"', async () => {
      // Never-resolving openPath so we can observe the busy label
      // snapshot without racing the success path.
      mockOpenPath.mockReturnValue(new Promise(() => undefined))
      const { user } = setupLoaded(false)

      await user.click(screen.getByRole('button', { name: 'Open log file' }))

      // The busy label comes from the i18n key 'common.opening'
      // -> "Opening…". We grab the button by name (which scopes the
      // matcher to the current label) and verify the disabled bit.
      const busy = await screen.findByRole('button', { name: 'Opening…' })
      expect(busy).toBeDisabled()
    })

    it('toasts with the error description and logs when openPath rejects', async () => {
      const openerError = new Error('no application is associated')
      mockOpenPath.mockRejectedValue(openerError)
      const { user } = setupLoaded(false)

      await user.click(screen.getByRole('button', { name: 'Open log file' }))

      await waitFor(() =>
        expect(mockToast.error).toHaveBeenCalledWith(
          'Could not open log file',
          expect.objectContaining({
            description: expect.stringContaining(
              'no application is associated'
            ),
          })
        )
      )
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to open log file',
        expect.objectContaining({ error: openerError })
      )
      // The finally branch must still reset isOpening so the user
      // can retry after the OS dialog failure.
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Open log file' })
        ).not.toBeDisabled()
      )
    })
  })

  describe('clear recovery files button', () => {
    it('happy path: success toast carries the deleted count in the description', async () => {
      mockCommands.cleanupOldRecoveryFiles.mockResolvedValue({
        status: 'ok',
        data: 5,
      })
      const { user } = setupLoaded(false)

      await user.click(
        screen.getByRole('button', { name: 'Clear recovery files' })
      )

      await waitFor(() =>
        expect(mockCommands.cleanupOldRecoveryFiles).toHaveBeenCalled()
      )
      // The success toast pulls its label from
      // preferences.advanced.clearRecoveryFilesSuccess ->
      // "Recovery files cleared", and the description substitute
      // is "{{count}} file(s) removed" from clearRecoveryFilesCount.
      expect(mockToast.success).toHaveBeenCalledWith('Recovery files cleared', {
        description: '5 file(s) removed',
      })
      expect(mockToast.error).not.toHaveBeenCalled()
      expect(mockLogger.error).not.toHaveBeenCalled()
      // The button drops back to its idle label after finally
      // resets isClearing.
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Clear recovery files' })
        ).not.toBeDisabled()
      )
    })

    it('status=error path: toast.error without a logger.error (no exception)', async () => {
      mockCommands.cleanupOldRecoveryFiles.mockResolvedValue({
        status: 'error',
        error: 'nothing to clean',
      })
      const { user } = setupLoaded(false)

      await user.click(
        screen.getByRole('button', { name: 'Clear recovery files' })
      )

      await waitFor(() =>
        expect(mockCommands.cleanupOldRecoveryFiles).toHaveBeenCalled()
      )
      expect(mockToast.error).toHaveBeenCalledWith(
        'Failed to clear recovery files'
      )
      // The early-return path does NOT touch the logger - only
      // thrown exceptions (the catch branch) get logged, since
      // there is nothing to diagnose about a structured Result error
      // beyond the user-facing toast.
      expect(mockLogger.error).not.toHaveBeenCalled()
      expect(mockToast.success).not.toHaveBeenCalled()
    })

    it('exception path: commands.cleanupOldRecoveryFiles throws -> toast.error + logger.error', async () => {
      const ipcError = new Error('IPC channel closed')
      mockCommands.cleanupOldRecoveryFiles.mockRejectedValue(ipcError)
      const { user } = setupLoaded(false)

      await user.click(
        screen.getByRole('button', { name: 'Clear recovery files' })
      )

      await waitFor(() =>
        expect(mockToast.error).toHaveBeenCalledWith(
          'Failed to clear recovery files'
        )
      )
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to clear recovery files',
        expect.objectContaining({ error: ipcError })
      )
      expect(mockToast.success).not.toHaveBeenCalled()
      // finally still resets isClearing so the button is
      // clickable again even though the IPC blew up.
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Clear recovery files' })
        ).not.toBeDisabled()
      )
    })

    it('shows the "Clearing…" busy label while the IPC is in flight', async () => {
      mockCommands.cleanupOldRecoveryFiles.mockReturnValue(
        new Promise(() => undefined)
      )
      const { user } = setupLoaded(false)

      await user.click(
        screen.getByRole('button', { name: 'Clear recovery files' })
      )

      // The busy label comes from the i18n key 'common.clearing'
      // -> "Clearing…". We scope the match by name so we observe
      // the live button, not the idle one.
      const busy = await screen.findByRole('button', { name: 'Clearing…' })
      expect(busy).toBeDisabled()
    })
  })
})
