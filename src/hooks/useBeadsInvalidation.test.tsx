import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { listen } from '@tauri-apps/api/event'
import { toast } from 'sonner'
import { useWorkspaceStore } from '@/store/workspace-store'
// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

// Mock logger to keep test output clean
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { useBeadsInvalidation } from './useBeadsInvalidation'

// Helper: capture the listener callback registered via listen()
type ListenerCallback = (event: { payload: unknown }) => void
let registeredCallback: ListenerCallback | null = null
let registeredEventName: string | null = null

const mockedListen = vi.mocked(listen)
const mockedToast = vi.mocked(toast)

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

describe('useBeadsInvalidation', () => {
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

  it('invalidates the beads query when the event fires', async () => {
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

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['beads'] })
  })

  it('shows a "data refreshed" toast on invalidation', async () => {
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

  it('invalidates the beads query on window focus', async () => {
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
})
