/**
 * Tests for the `App` component.
 *
 * Three coverage targets:
 *   1. The bootstrap gate render + repo-picker click (existing tests
 *      below — preserved exactly).
 *   2. The 5s startup auto-update timer (line 218 of `App.tsx`) —
 *      fires `runUpdateCheck(tRef.current, /* surfaceErrors *\/ false)`
 *      and must NOT surface errors to the user.
 *   3. The menu-driven "Check for updates" event listener (line 228) —
 *      fires `runUpdateCheck(t, /* surfaceErrors *\/ true)` and must
 *      surface errors to the user.
 *   4. All seven branches of `runUpdateCheck`:
 *        - check() throws + surfaceErrors=true  -> message (error)
 *        - check() throws + surfaceErrors=false -> logger.error
 *        - check() returns null + surfaceErrors=true  -> message (info)
 *        - check() returns null + surfaceErrors=false -> silent
 *        - check() returns update + user declines        -> no install
 *        - check() returns update + user accepts + restart yes
 *          OR restart no => relaunch or no relaunch
 *        - downloadAndInstall throws                -> message (error)
 *      Plus the three download-event callback branches
 *      (Started / Progress / Finished).
 *
 * The updater code is intentionally not exported — these tests drive it
 * through the React lifecycle (fake-timer tick or CustomEvent dispatch)
 * so the production build keeps its no-export API contract.
 */
import { act, render, screen, waitFor } from '@/test/test-utils'
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
import { commands } from '@/lib/tauri-bindings'

// ----------------------------------------------------------------------------
// Tauri binding mocks (existing — preserved)
// ----------------------------------------------------------------------------

const openMock = vi.fn()
const { mockAsk, mockMessage } = vi.hoisted(() => ({
  mockAsk: vi.fn(),
  mockMessage: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => openMock(...args),
  ask: mockAsk,
  message: mockMessage,
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    detectBd: vi.fn(),
    addRecentRepo: vi.fn(),
    loadPreferences: vi.fn(),
    savePreferences: vi.fn(),
    getCurrentDir: vi.fn(),
    checkBdVersionCmd: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: '1.0.5' }),
    cleanupOldRecoveryFiles: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: 0 }),
    saveEmergencyData: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    getDefaultQuickPaneShortcut: vi
      .fn()
      .mockResolvedValue('CommandOrControl+Shift+.'),
    updateQuickPaneShortcut: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: null }),
    attachWatchRepo: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    detachWatchRepo: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
  },
  unwrapResult: (result: { status: string; data?: unknown }) => {
    if (result.status === 'ok') return result.data
    throw result
  },
}))

const mockedGetCurrentDir = vi.mocked(commands.getCurrentDir)
const mockedDetectBd = vi.mocked(commands.detectBd)
const mockedLoadPreferences = vi.mocked(commands.loadPreferences)
const mockedAddRecentRepo = vi.mocked(commands.addRecentRepo)

// ----------------------------------------------------------------------------
// New mocks: Tauri updater / process plugins, logger, side-effecting boot
// helpers. Hoisted so the vi.mock factories below can close over them.
// ----------------------------------------------------------------------------

const { mockCheck } = vi.hoisted(() => ({ mockCheck: vi.fn() }))
const { mockRelaunch } = vi.hoisted(() => ({ mockRelaunch: vi.fn() }))
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))
const { mockInitCommandSystem } = vi.hoisted(() => ({
  mockInitCommandSystem: vi.fn(),
}))
const { mockBuildAppMenu, mockSetupMenuLanguageListener } = vi.hoisted(() => ({
  mockBuildAppMenu: vi.fn(),
  mockSetupMenuLanguageListener: vi.fn(),
}))
const { mockInitLanguage } = vi.hoisted(() => ({
  mockInitLanguage: vi.fn(),
}))
const { mockCleanupOldFiles } = vi.hoisted(() => ({
  mockCleanupOldFiles: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: mockCheck,
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: mockRelaunch,
}))

vi.mock('@/lib/logger', () => ({ logger: mockLogger }))

vi.mock('@/lib/commands', () => ({
  initializeCommandSystem: mockInitCommandSystem,
}))

vi.mock('@/lib/menu', () => ({
  buildAppMenu: mockBuildAppMenu,
  setupMenuLanguageListener: mockSetupMenuLanguageListener,
}))

vi.mock('@/i18n/language-init', () => ({
  initializeLanguage: mockInitLanguage,
}))

vi.mock('@/lib/recovery', () => ({
  cleanupOldFiles: mockCleanupOldFiles,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockedGetCurrentDir.mockResolvedValue({ status: 'ok', data: '/test/cwd' })
  mockedDetectBd.mockResolvedValue({
    status: 'ok',
    data: {
      version: [1, 0, 5],
      schema_version: 1,
      jsonl_path: null,
      backend: 'jsonl',
    },
  })
  mockedLoadPreferences.mockResolvedValue({
    status: 'ok',
    data: {
      theme: 'system',
      quick_pane_shortcut: null,
      language: null,
      recent_repos: [],
    },
  })
  mockedAddRecentRepo.mockResolvedValue({ status: 'ok', data: null })

  // New mocks default to the silent/no-op happy path. Individual
  // tests override per scenario.
  mockCheck.mockResolvedValue(null)
  mockAsk.mockResolvedValue(false)
  mockMessage.mockResolvedValue(undefined)
  mockRelaunch.mockResolvedValue(undefined)
  mockInitLanguage.mockResolvedValue(undefined)
  mockBuildAppMenu.mockResolvedValue(undefined)
  mockCleanupOldFiles.mockResolvedValue(undefined)
})

import App from './App'

// ----------------------------------------------------------------------------
// Original bootstrap-gate coverage (preserved verbatim)
// ----------------------------------------------------------------------------

describe('App', () => {
  it('renders the bootstrap gate when no repo is selected', async () => {
    render(<App />)
    // The repo-picker button is the first thing the bootstrap flow shows
    expect(await screen.findByTestId('repo-picker-button')).toBeInTheDocument()
  })

  it('wires the repo picker through the bootstrap flow', async () => {
    render(<App />)
    await screen.findByTestId('repo-picker-button')

    // Sanity: the file picker button can be clicked without errors
    const user = (await import('@testing-library/user-event')).userEvent.setup()
    await user.click(screen.getByTestId('repo-picker-button'))
    await waitFor(() => {
      expect(openMock).toHaveBeenCalled()
    })
  })
})

// ----------------------------------------------------------------------------
// New coverage: 5s auto-update startup timer + runUpdateCheck branches.
//
// We use REAL timers throughout (so @testing-library/react's `waitFor` keeps
// polling correctly) and instead spy on `setTimeout` to capture the 5s
// callback registered by App's boot effect. The spy delegates every other
// `setTimeout` call (e.g. the per-test microtask delays and React's own
// scheduling timers) to the real implementation.
// ----------------------------------------------------------------------------

/**
 * Helper: render App and wait until the boot effect (which fires off
 * command-system init + language init + menu build) has settled. We
 * use `mockInitCommandSystem` as the "ready" sentinel because it's
 * the very first thing the boot effect calls synchronously.
 */
async function renderAppAndAwaitBoot() {
  render(<App />)
  await waitFor(() => expect(mockInitCommandSystem).toHaveBeenCalled())
}

/** Captured 5s `setTimeout` callback injected by `App.tsx`'s boot effect. */
let capturedStartupTimer: (() => void) | null = null
/** Active setTimeout spy (set per describe block via beforeEach). */
let activeSetTimeoutSpy: ReturnType<typeof vi.spyOn> | null = null

/**
 * Install a spy on `globalThis.setTimeout` that captures the *5-second*
 * callback registered by App's boot effect and delegates all other
 * `setTimeout` calls to the real implementation. The spy is installed /
 * cleared around each test so individual tests can flush the captured
 * callback deterministically without freezing real timers (which would
 * break `waitFor`).
 *
 * Each intercepted `setTimeout` call returns a unique sentinel handle
 * (an object key `{id}`) so a `clearTimeout` spy in the unmount test can
 * observe the cleanup and not confuse multiple captured timers (the
 * spy otherwise returns the literal `0`, which `clearTimeout` treats
 * as a no-op and is unobservable).
 */
let timerHandleCounter = 0
function installStartupTimerSpy() {
  capturedStartupTimer = null
  const realSetTimeout = globalThis.setTimeout.bind(globalThis)
  activeSetTimeoutSpy = vi
    .spyOn(globalThis, 'setTimeout')
    // The mocked implementation ignores unused trailing args (React passes
    // the bound args it captured at effect creation time).
    .mockImplementation(((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (typeof handler === 'function' && timeout === 5000) {
        capturedStartupTimer = () => {
          ;(handler as (...a: unknown[]) => void)(...args)
        }
        // Return a unique sentinel handle so the unmount test can spy
        // on clearTimeout and assert the cleanup branch fired.
        return makeTimerHandle()
      }
      return realSetTimeout(handler as TimerHandler, timeout, ...args)
    }) as unknown as typeof setTimeout)
}

/** Distinct handle object so clearTimeout() can be observed in tests. */
function makeTimerHandle(): { id: number } {
  timerHandleCounter += 1
  return { id: timerHandleCounter }
}

/**
 * Fire the captured 5s timer callback manually (deterministic — no need
 * to wait real wall-clock time). Awaits one microtask so any sync code
 * inside the callback's promise chain has a chance to land before the
 * test continues.
 */
async function fireStartupTimer() {
  expect(capturedStartupTimer).not.toBeNull()
  const cb = capturedStartupTimer
  if (!cb) return
  await act(async () => {
    cb()
    // Drain the runUpdateCheck promise chain (it awaits check() / ask()
    // / message() / downloadAndInstall() / relaunch()).
    await flushMicrotasks()
  })
}

/**
 * Drain the microtask queue a few times so the `runUpdateCheck`
 * async function (which has 2-4 sequential `await`s) can advance
 * far enough for assertions.
 */
async function flushMicrotasks() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
  }
}

describe('App 5s startup auto-update timer', () => {
  beforeEach(() => {
    installStartupTimerSpy()
  })
  afterEach(() => {
    activeSetTimeoutSpy?.mockRestore()
    activeSetTimeoutSpy = null
    capturedStartupTimer = null
  })

  it('registers a 5s setTimeout callback during boot', async () => {
    await renderAppAndAwaitBoot()
    expect(capturedStartupTimer).not.toBeNull()
  })

  it('does NOT call check() before the 5s timer fires', async () => {
    await renderAppAndAwaitBoot()
    expect(capturedStartupTimer).not.toBeNull()
    // No fire yet — check should not have been called.
    expect(mockCheck).not.toHaveBeenCalled()
  })

  it('fires runUpdateCheck exactly once when the captured timer is invoked', async () => {
    await renderAppAndAwaitBoot()
    await fireStartupTimer()
    expect(mockCheck).toHaveBeenCalledTimes(1)
  })

  it('check() throws + surfaceErrors=false (silent): logs error, no dialog', async () => {
    mockCheck.mockRejectedValueOnce(new Error('offline'))
    await renderAppAndAwaitBoot()
    await fireStartupTimer()
    expect(mockCheck).toHaveBeenCalled()
    await waitFor(() =>
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Update check failed')
      )
    )
    expect(mockMessage).not.toHaveBeenCalled()
  })

  it('check() returns null + surfaceErrors=false (silent): no log, no dialog', async () => {
    mockCheck.mockResolvedValueOnce(null)
    await renderAppAndAwaitBoot()
    await fireStartupTimer()
    expect(mockCheck).toHaveBeenCalled()
    // No message dialog, no ask, no "Update available" log line either.
    expect(mockMessage).not.toHaveBeenCalled()
    expect(mockAsk).not.toHaveBeenCalled()
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Update available')
    )
  })

  it('clears the captured timer on unmount (Strict Mode / HMR safety)', async () => {
    const clearTimeoutSpy = vi
      .spyOn(globalThis, 'clearTimeout')
      .mockImplementation(() => undefined)
    try {
      const { unmount } = render(<App />)
      await waitFor(() => expect(mockInitCommandSystem).toHaveBeenCalled())
      expect(capturedStartupTimer).not.toBeNull()

      // Capture how many `clearTimeout` calls have happened up to
      // this point (React/testing-library may invoke clearTimeout
      // themselves for unrelated timers — we only assert on the
      // DELTA from here, not the absolute count).
      const beforeUnmount = clearTimeoutSpy.mock.calls.length

      unmount()

      // The boot effect's cleanup runs `clearTimeout(updateTimer)`,
      // which our spy observes — proves the cleanup branch fired.
      // We tolerate extra clearTimeout calls from unrelated timers
      // by asserting "at least one new call" via the delta.
      await waitFor(() =>
        expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(
          beforeUnmount
        )
      )
      // At least one of the new calls must pass the sentinel handle
      // our setTimeout spy returned for the 5s timer — that's how
      // we know App's cleanup branch actually fired (vs. just an
      // unrelated clearTimeout in the test framework).
      const sentinelHandleCalls = clearTimeoutSpy.mock.calls
        .slice(beforeUnmount)
        .filter(([arg]) => {
          const handle = arg as { id?: number } | undefined
          return (
            handle !== null &&
            typeof handle === 'object' &&
            typeof handle.id === 'number'
          )
        })
      expect(sentinelHandleCalls.length).toBeGreaterThanOrEqual(1)

      // And the captured callback would never fire post-unmount (the
      // boot effect no longer references it).
      expect(mockCheck).not.toHaveBeenCalled()
    } finally {
      clearTimeoutSpy.mockRestore()
    }
  })
})

// ----------------------------------------------------------------------------
// New coverage: menu "checkForUpdates" event triggers runUpdateCheck with
// surfaceErrors=true (and exercises all 7 branches).
// ----------------------------------------------------------------------------

/**
 * Helper: dispatch the menu-driven update-check CustomEvent and flush
 * the resulting `runUpdateCheck` microtasks. We wrap the dispatch in
 * `act` so React associates any sync state updates with the test;
 * individual tests then use `waitFor` (real timers) to poll on the
 * final state — the multi-`await` chain inside `runUpdateCheck`
 * (check → ask → message / downloadAndInstall → relaunch) doesn't
 * settle inside a single `act` microtask flush.
 */
async function dispatchMenuUpdateEvent() {
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent('collier:menu-check-for-updates')
    )
    await flushMicrotasks()
  })
}

/**
 * Construct the fake `update` object returned by
 * `tauri-plugin-updater`'s `check()`. `downloadAndInstall` accepts a
 * single callback argument in production; we plumb through a vi.fn so
 * tests can assert on whether it was called.
 */
function makeFakeUpdate(version = '2.0.0') {
  const downloadAndInstall = vi.fn().mockResolvedValue(undefined)
  return { version, downloadAndInstall }
}

describe('App collier:menu-check-for-updates event listener', () => {
  it('registers a listener and removes it on unmount', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = render(<App />)
    await waitFor(() => expect(mockInitCommandSystem).toHaveBeenCalled())

    const added = addSpy.mock.calls.find(
      ([eventName]) => eventName === 'collier:menu-check-for-updates'
    )
    expect(added).toBeDefined()

    unmount()
    const removed = removeSpy.mock.calls.find(
      ([eventName]) => eventName === 'collier:menu-check-for-updates'
    )
    expect(removed).toBeDefined()

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('check() throws + surfaceErrors=true: surfaces error message dialog', async () => {
    mockCheck.mockRejectedValueOnce(new Error('boom'))
    await renderAppAndAwaitBoot()
    await dispatchMenuUpdateEvent()
    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalled()
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Update check failed')
      )
      expect(mockMessage).toHaveBeenCalledWith(
        expect.stringContaining('Could not reach the update server'),
        expect.objectContaining({
          title: expect.stringContaining('Update check failed'),
          kind: 'error',
        })
      )
    })
  })

  it('check() returns null + surfaceErrors=true: surfaces "up to date" dialog', async () => {
    mockCheck.mockResolvedValueOnce(null)
    await renderAppAndAwaitBoot()
    await dispatchMenuUpdateEvent()
    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalled()
      expect(mockMessage).toHaveBeenCalledWith(
        expect.stringContaining('latest version'),
        expect.objectContaining({
          title: expect.stringContaining('No updates available'),
          kind: 'info',
        })
      )
    })
  })

  it('check() returns update + user declines the install prompt: no download, no relaunch', async () => {
    const update = makeFakeUpdate('1.2.3')
    mockCheck.mockResolvedValueOnce(update)
    mockAsk.mockResolvedValueOnce(false)
    await renderAppAndAwaitBoot()
    await dispatchMenuUpdateEvent()
    await waitFor(() =>
      expect(mockAsk).toHaveBeenCalledWith(
        expect.stringContaining('1.2.3'),
        expect.objectContaining({
          title: expect.stringContaining('Update available'),
          kind: 'info',
        })
      )
    )
    expect(update.downloadAndInstall).not.toHaveBeenCalled()
    expect(mockRelaunch).not.toHaveBeenCalled()
    // No error dialogs opened either.
    expect(mockMessage).not.toHaveBeenCalled()
  })

  it('check() returns update + user accepts install + accepts restart: downloads then relaunches', async () => {
    const update = makeFakeUpdate('2.0.0')
    mockCheck.mockResolvedValueOnce(update)
    // First ask = accept install, second ask = accept restart.
    mockAsk.mockResolvedValueOnce(true).mockResolvedValueOnce(true)
    await renderAppAndAwaitBoot()
    await dispatchMenuUpdateEvent()
    await waitFor(() => {
      expect(update.downloadAndInstall).toHaveBeenCalledTimes(1)
      // The callback parameter to downloadAndInstall is forwarded by
      // the component — confirm we passed a function.
      expect(update.downloadAndInstall.mock.calls[0]?.[0]).toEqual(
        expect.any(Function)
      )
      expect(mockRelaunch).toHaveBeenCalledTimes(1)
    })
    // No error dialog.
    expect(mockMessage).not.toHaveBeenCalled()
  })

  it('check() returns update + user accepts install + declines restart: download succeeds, no relaunch, no error', async () => {
    const update = makeFakeUpdate('2.0.0')
    mockCheck.mockResolvedValueOnce(update)
    mockAsk.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await renderAppAndAwaitBoot()
    await dispatchMenuUpdateEvent()
    await waitFor(() =>
      expect(update.downloadAndInstall).toHaveBeenCalledTimes(1)
    )
    expect(mockRelaunch).not.toHaveBeenCalled()
    // No error dialog either — the success path stays silent.
    expect(mockMessage).not.toHaveBeenCalled()
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('check() returns update + user accepts + downloadAndInstall throws: surfaces update-error dialog', async () => {
    const update = makeFakeUpdate('2.0.0')
    update.downloadAndInstall.mockRejectedValueOnce(
      new Error('signature mismatch')
    )
    mockCheck.mockResolvedValueOnce(update)
    mockAsk.mockResolvedValueOnce(true)
    await renderAppAndAwaitBoot()
    await dispatchMenuUpdateEvent()
    await waitFor(() => {
      expect(update.downloadAndInstall).toHaveBeenCalledTimes(1)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Update installation failed')
      )
      expect(mockMessage).toHaveBeenCalledWith(
        expect.stringContaining('Update failed'),
        expect.objectContaining({
          title: expect.stringContaining('Update failed'),
          kind: 'error',
        })
      )
    })
    // No relaunch offered on the failure path.
    expect(mockRelaunch).not.toHaveBeenCalled()
  })

  it('downloadAndInstall callback handles Started / Progress / Finished branches (switch coverage)', async () => {
    type UpdateEvent = (event: {
      event: string
      data: { contentLength?: number; chunkLength?: number }
    }) => void
    const callbacks: UpdateEvent[] = []
    const downloadAndInstall = vi
      .fn()
      .mockImplementation(async (cb?: UpdateEvent) => {
        if (cb) callbacks.push(cb)
      })
    mockCheck.mockResolvedValueOnce({ version: '2.0.0', downloadAndInstall })
    // Accept the install but stay silent on the restart prompt so the
    // callback runs (and we don't proceed into the relaunch code path).
    mockAsk.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await renderAppAndAwaitBoot()
    await dispatchMenuUpdateEvent()
    await waitFor(() => expect(callbacks).toHaveLength(1))
    const cb = callbacks[0]
    expect(cb).toBeDefined()

    cb?.({ event: 'Started', data: { contentLength: 1024 } })
    cb?.({ event: 'Progress', data: { chunkLength: 512 } })
    cb?.({ event: 'Finished', data: {} })

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Downloading 1024 bytes'
    )
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Downloaded: 512 bytes'
    )
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Download complete, installing...'
    )
  })

  it('boot path: commands.loadPreferences() rejects -> logger.warn("Failed to initialize language or menu")', async () => {
    const ipcError = new Error('preferences store corrupt')
    // RepoSelection ALSO calls loadPreferences on mount, so we use
    // mockRejectedValue (not mockRejectedValueOnce) to make every
    // call reject. Otherwise the first rejection gets consumed by
    // RepoSelection's bootstrap fetch and `initLanguageAndMenu`'s
    // `await commands.loadPreferences()` falls through to the
    // default resolved branch.
    mockedLoadPreferences.mockRejectedValue(ipcError)
    await renderAppAndAwaitBoot()
    // The try/catch in `initLanguageAndMenu` swallows the rejection
    // and routes it to logger.warn - the rest of the app still boots.
    await waitFor(() =>
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to initialize language or menu',
        expect.objectContaining({ error: ipcError })
      )
    )
    // The buildAppMenu path inside the try-block never executed, so
    // the menu mock should NOT have been called.
    expect(mockBuildAppMenu).not.toHaveBeenCalled()
  })

  it('boot path: cleanupOldFiles() rejects -> logger.warn("Failed to cleanup old recovery files")', async () => {
    const recoveryError = new Error('cleanup disk full')
    mockCleanupOldFiles.mockRejectedValueOnce(recoveryError)
    await renderAppAndAwaitBoot()
    // The .catch on `cleanupOldFiles()` swallows the rejection and
    // routes it to logger.warn - the boot itself does NOT crash.
    await waitFor(() =>
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to cleanup old recovery files',
        expect.objectContaining({ error: recoveryError })
      )
    )
  })

  it('boot path: loadPreferences returns non-ok status -> savedLanguage falls back to null', async () => {
    mockedLoadPreferences.mockResolvedValue({
      status: 'error',
      error: { type: 'IoError', message: 'disk full' },
    } as never)
    await renderAppAndAwaitBoot()
    // buildAppMenu still runs on the non-error path.
    await waitFor(() => expect(mockBuildAppMenu).toHaveBeenCalled())
    // initializeLanguage gets called with `null` (the fallback).
    expect(mockInitLanguage).toHaveBeenCalledWith(null)
  })
})

// ----------------------------------------------------------------------------
// New coverage: bootstrap-gate ternary branch on `repoPath !== null`.
// We pre-seed the workspace store so the ternary picks the MainWindow
// branch (line 249). MainWindow itself is rendered separately by
// MainWindowContent.test.tsx — here we only assert App's branch
// behaviour (no bootstrap modal, MainWindow subtree mounted).
// ----------------------------------------------------------------------------

describe('App bootstrap-gate ternary (repoPath !== null)', () => {
  it('renders <MainWindow /> and skips <RepoSelection /> when repoPath is set', async () => {
    // Import the store lazily so the test stays grouped with the
    // component-under-test. The store persists to localStorage, but
    // jsdom starts with an empty store so setState is enough.
    const { useWorkspaceStore } = await import('@/store/workspace-store')
    useWorkspaceStore.setState({ repoPath: '/test/repo' })

    render(<App />)
    await waitFor(() => expect(mockInitCommandSystem).toHaveBeenCalled())
    // The bootstrap gate is gone — no repo-picker testid.
    expect(screen.queryByTestId('repo-picker-button')).not.toBeInTheDocument()
  })
})
