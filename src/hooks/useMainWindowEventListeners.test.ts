/**
 * Tests for `useMainWindowEventListeners`.
 *
 * The hook composes:
 *   - the keyboard shortcuts hook (covered separately in
 *     `use-keyboard-shortcuts.test.ts`); we just assert it is
 *     invoked with the command context here.
 *   - a `quick-pane-submit` Tauri event listener that writes the
 *     payload text into `useUIStore.lastQuickPaneEntry`.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { listen } from '@tauri-apps/api/event'
import { useUIStore } from '@/store/ui-store'

const { mockUseCommandContext, mockUseKeyboardShortcuts } = vi.hoisted(() => ({
  mockUseCommandContext: vi.fn(),
  mockUseKeyboardShortcuts: vi.fn(),
}))

vi.mock('./use-command-context', () => ({
  useCommandContext: () => mockUseCommandContext(),
}))

vi.mock('./use-keyboard-shortcuts', () => ({
  useKeyboardShortcuts: (ctx: unknown) => mockUseKeyboardShortcuts(ctx),
}))

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}))

import { useMainWindowEventListeners } from './useMainWindowEventListeners'

type ListenerCallback = (event: { payload: unknown }) => void
let registeredCallback: ListenerCallback | null = null
let registeredEventName: string | null = null

const mockedListen = vi.mocked(listen)

beforeEach(() => {
  vi.clearAllMocks()
  registeredCallback = null
  registeredEventName = null
  useUIStore.setState({ lastQuickPaneEntry: null })
  mockUseCommandContext.mockReturnValue({
    openPreferences: vi.fn(),
    showToast: vi.fn(),
  })
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

describe('useMainWindowEventListeners', () => {
  it('forwards the command context to the keyboard shortcuts hook', () => {
    const ctx = { openPreferences: vi.fn(), showToast: vi.fn() }
    mockUseCommandContext.mockReturnValue(ctx)

    renderHook(() => useMainWindowEventListeners())

    expect(mockUseKeyboardShortcuts).toHaveBeenCalledTimes(1)
    expect(mockUseKeyboardShortcuts).toHaveBeenCalledWith(ctx)
  })

  it('subscribes to the quick-pane-submit Tauri event on mount', async () => {
    renderHook(() => useMainWindowEventListeners())

    await act(async () => {
      await Promise.resolve()
    })

    expect(registeredEventName).toBe('quick-pane-submit')
    expect(registeredCallback).not.toBeNull()
  })

  it('writes the payload text into the UI store when the event fires', async () => {
    renderHook(() => useMainWindowEventListeners())

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      if (!registeredCallback) throw new Error('listener was not registered')
      registeredCallback({ payload: { text: 'bd ready foo' } })
    })

    expect(useUIStore.getState().lastQuickPaneEntry).toBe('bd ready foo')
  })

  it('overwrites the previous entry on subsequent events', async () => {
    renderHook(() => useMainWindowEventListeners())

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      if (!registeredCallback) throw new Error('listener was not registered')
      registeredCallback({ payload: { text: 'first' } })
      registeredCallback({ payload: { text: 'second' } })
    })

    expect(useUIStore.getState().lastQuickPaneEntry).toBe('second')
  })

  it('detaches the listener on unmount', async () => {
    const unlisten = vi.fn()
    mockedListen.mockImplementationOnce((eventName, handler) => {
      registeredEventName = eventName
      registeredCallback = handler as ListenerCallback
      return Promise.resolve(unlisten)
    })

    const { unmount } = renderHook(() => useMainWindowEventListeners())

    await act(async () => {
      await Promise.resolve()
    })

    unmount()

    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('cancels a late-resolving listen() promise if the component unmounted first', async () => {
    let resolveListen: ((fn: () => void) => void) | null = null
    const unlisten = vi.fn()
    mockedListen.mockImplementationOnce(() => {
      return new Promise(resolve => {
        resolveListen = resolve
      })
    })

    const { unmount } = renderHook(() => useMainWindowEventListeners())

    unmount()

    await act(async () => {
      if (!resolveListen) throw new Error('listen() was not invoked')
      resolveListen(unlisten)
    })

    // The cleanup runs because isMounted was flipped to false while we
    // were awaiting the listen() promise, so the late-resolved unlisten
    // is invoked immediately to avoid leaking.
    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('logs and swallows errors when listen() rejects', async () => {
    mockedListen.mockImplementationOnce(() =>
      Promise.reject(new Error('event bus down'))
    )

    renderHook(() => useMainWindowEventListeners())

    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to setup quick-pane-submit listener',
      { error: expect.any(Error) }
    )
  })
})
