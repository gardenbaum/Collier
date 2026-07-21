import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { listen } from '@tauri-apps/api/event'
import { toast } from 'sonner'
import { useWorkspaceStore } from '@/store/workspace-store'

// Hoist a stable logger mock so tests can assert on the
// `.catch` reject path (`logger.error('Failed to setup ...')`).
// The factory below exposes these same instances to the
// source under test (via `vi.mock('@/lib/logger', ...)`).
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  },
}))
vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

import { useBeadsInvalidation } from './useBeadsInvalidation'

// Helper: capture the listener callback registered via listen()
type ListenerCallback = (event: { payload: unknown }) => void
let registeredCallback: ListenerCallback | null = null
let registeredEventName: string | null = null

const mockedListen = vi.mocked(listen)
const mockedToast = vi.mocked(toast)
const mockedLoggerError = vi.mocked(mockLogger.error)

/** Asserts the listen() callback was registered and returns it. */
function capturedCallback(): ListenerCallback {
  if (registeredCallback === null) {
    throw new Error('listen() callback was not registered yet')
  }
  return registeredCallback
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderWithClient(qc: QueryClient) {
  return renderHook(() => useBeadsInvalidation(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  registeredCallback = null
  registeredEventName = null
  // Capture the registered callback so tests can simulate an emit
  mockedListen.mockImplementation((eventName, handler) => {
    registeredEventName = eventName
    registeredCallback = handler as ListenerCallback
    return Promise.resolve(() => {
      registeredCallback = null
      registeredEventName = null
    })
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useBeadsInvalidation (R10 toast-only path)', () => {
  it('listens to the beads-data-changed tauri event', async () => {
    const qc = makeQueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    renderWithClient(qc)

    // Let the microtask from listen() resolve
    await act(async () => {
      await Promise.resolve()
    })

    expect(registeredEventName).toBe('beads-data-changed')
    expect(registeredCallback).not.toBeNull()
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('does NOT invalidate the beads query when the watcher event fires (R10 split)', async () => {
    // R10 moved the broad query invalidation off the
    // beads-data-changed event. The watcher event now only
    // surfaces a toast; per-issue cache patches come through
    // `useBeadsRealtimeSync` instead.
    const qc = makeQueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    useWorkspaceStore.setState({ repoPath: '/tmp/repo' })

    renderWithClient(qc)

    await act(async () => {
      await Promise.resolve()
    })

    expect(registeredCallback).not.toBeNull()

    await act(async () => {
      capturedCallback()({ payload: { repo_path: '/tmp/repo', timestamp: 1 } })
    })

    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('shows a "data refreshed" toast when the watcher event fires', async () => {
    const qc = makeQueryClient()
    useWorkspaceStore.setState({ repoPath: '/tmp/repo' })

    renderWithClient(qc)

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      capturedCallback()({ payload: { repo_path: '/tmp/repo', timestamp: 1 } })
    })

    expect(mockedToast.info).toHaveBeenCalled()
  })

  it('debounces the toast to at most one per second', async () => {
    const qc = makeQueryClient()
    useWorkspaceStore.setState({ repoPath: '/tmp/repo' })

    renderWithClient(qc)

    await act(async () => {
      await Promise.resolve()
    })

    // Fire the event three times in rapid succession
    await act(async () => {
      capturedCallback()({ payload: { repo_path: '/tmp/repo', timestamp: 1 } })
      capturedCallback()({ payload: { repo_path: '/tmp/repo', timestamp: 2 } })
      capturedCallback()({ payload: { repo_path: '/tmp/repo', timestamp: 3 } })
    })

    // Only one toast fired despite three events
    expect(mockedToast.info).toHaveBeenCalledTimes(1)

    // Advance past the 1s debounce window
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    // A new event after the debounce window should fire another toast
    await act(async () => {
      capturedCallback()({ payload: { repo_path: '/tmp/repo', timestamp: 4 } })
    })

    expect(mockedToast.info).toHaveBeenCalledTimes(2)
  })

  it('drops events whose repo_path does not match the active workspace', async () => {
    const qc = makeQueryClient()
    useWorkspaceStore.setState({ repoPath: '/tmp/active' })

    renderWithClient(qc)

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      // Mismatched repo: toast must NOT fire (and no broad
      // invalidation would either — both gated on the same
      // filter).
      capturedCallback()({
        payload: { repo_path: '/tmp/other', timestamp: 1 },
      })
    })

    expect(mockedToast.info).not.toHaveBeenCalled()
  })

  it('cancels the listener on unmount', async () => {
    const qc = makeQueryClient()
    const unlisten = vi.fn()
    mockedListen.mockImplementationOnce((eventName, handler) => {
      registeredEventName = eventName
      registeredCallback = handler as ListenerCallback
      return Promise.resolve(unlisten)
    })

    const { unmount } = renderWithClient(qc)

    await act(async () => {
      await Promise.resolve()
    })

    unmount()

    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('invalidates the beads query on window focus (safety net)', async () => {
    // Window focus is the one place that still triggers a
    // broad query invalidation: external editors and sibling
    // shells don't go through Collier's IPC, so the only
    // signal we get on return is the focus event.
    const qc = makeQueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    renderWithClient(qc)

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['beads'] })
  })

  it('logs an error via logger when listen() rejects', async () => {
    // listen() returns a Promise — if the Tauri IPC channel
    // refuses to register the listener (e.g. destroyed before
    // the promise resolves, or the runtime is unavailable),
    // the `.catch` handler surfaces the failure through
    // `logger.error` so the user sees diagnostics in the
    // advanced-prefs log file rather than a silent dead
    // hook.
    mockedListen.mockImplementationOnce(() =>
      Promise.reject(new Error('IPC channel unavailable'))
    )

    renderWithClient(makeQueryClient())

    // Two microtask hops: the .then's first .then() inside
    // listen's promise chain runs, then the rejection
    // propagates to .catch().
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockedLoggerError).toHaveBeenCalledWith(
      'Failed to setup beads-data-changed listener',
      expect.objectContaining({ error: expect.any(Error) })
    )
  })

  it('calls unlistenFn immediately when listen() resolves after unmount', async () => {
    // Race: the user closes the window between the time the
    // effect fires `listen(...)` and the time the runtime
    // returns the unlisten handle. The cleanup sets
    // `isMounted = false`; the late `.then(unlistenFn => ...)`
    // branch sees `!isMounted` and tears the listener down
    // synchronously instead of stashing a now-dead handle.
    //
    // This also exercises the cleanup's `if (unlisten)` ELSE
    // branch — at unmount time, `unlisten` was still null
    // (the listen promise hadn't resolved yet), so the
    // `unlisten()` call inside the cleanup is correctly
    // skipped rather than throwing on a null deref.
    let resolveListen: ((unlisten: () => void) => void) | null = null
    mockedListen.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveListen = resolve
        })
    )

    const { unmount } = renderWithClient(makeQueryClient())

    // Let the effect fire and the listen promise register.
    await act(async () => {
      await Promise.resolve()
    })

    unmount()

    // Now resolve the listen promise AFTER unmount. The
    // effect's `.then` callback sees `isMounted === false`
    // and must invoke the unlisten handle immediately.
    const unlisten = vi.fn()
    await act(async () => {
      resolveListen?.(unlisten)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(unlisten).toHaveBeenCalledTimes(1)
    // Sanity: the cleanup ran before resolution, so the
    // captured callback was already torn down. A second
    // resolution (e.g. from a stale IPC event) would have
    // nowhere to fire.
    expect(registeredCallback).toBeNull()
  })
})
