/**
 * Tests for `useSquareCornersEffect`.
 *
 * Contract:
 *   - on macOS: setSquareCorners(false) is called (rounded corners
 *     always); the fullscreen check and resize listener are not used.
 *   - on Windows / Linux: square corners are enabled iff the window
 *     is fullscreen; the effect re-evaluates on window resize.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { mockPlatform, mockIsFullscreen, mockOnResized } = vi.hoisted(() => ({
  mockPlatform: vi.fn<() => string>(),
  mockIsFullscreen: vi.fn<() => Promise<boolean>>(),
  // The real Tauri API passes the resize handler to `onResized(handler)`,
  // so the mock has to accept a callback. We capture it in tests that
  // exercise the listener path.
  mockOnResized: vi.fn<(cb?: () => void) => Promise<() => void>>(),
}))

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: () => mockPlatform(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isFullscreen: () => mockIsFullscreen(),
    // Forward the resize handler so tests can capture and invoke it.
    onResized: (cb: () => void) => mockOnResized(cb),
  }),
}))

vi.mock('./use-platform', () => ({
  usePlatform: () => {
    const tauri = mockPlatform()
    if (tauri === 'macos') return 'macos'
    if (tauri === 'windows') return 'windows'
    return 'linux'
  },
}))

import { useSquareCornersEffect } from './useSquareCornersEffect'

const isSquareCornersActive = () =>
  document.documentElement.classList.contains('square-corners')

describe('useSquareCornersEffect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.documentElement.classList.remove('square-corners')
    mockIsFullscreen.mockResolvedValue(false)
    mockOnResized.mockResolvedValue(() => undefined)
  })

  it('forces rounded corners (no fullscreen check) on macOS', async () => {
    mockPlatform.mockReturnValue('macos')

    renderHook(() => useSquareCornersEffect())

    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(isSquareCornersActive()).toBe(false)
    expect(mockIsFullscreen).not.toHaveBeenCalled()
    expect(mockOnResized).not.toHaveBeenCalled()
  })

  it('enables square corners when the window is fullscreen on Windows', async () => {
    mockPlatform.mockReturnValue('windows')
    mockIsFullscreen.mockResolvedValueOnce(true)

    renderHook(() => useSquareCornersEffect())

    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockIsFullscreen).toHaveBeenCalledTimes(1)
    expect(mockOnResized).toHaveBeenCalledTimes(1)
    expect(isSquareCornersActive()).toBe(true)
  })

  it('keeps corners rounded when the window is not fullscreen on Linux', async () => {
    mockPlatform.mockReturnValue('linux')
    mockIsFullscreen.mockResolvedValueOnce(false)

    renderHook(() => useSquareCornersEffect())

    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockIsFullscreen).toHaveBeenCalledTimes(1)
    expect(isSquareCornersActive()).toBe(false)
  })

  it('re-checks fullscreen on the second mount (covers re-evaluation path)', async () => {
    mockPlatform.mockReturnValue('windows')
    mockIsFullscreen.mockResolvedValueOnce(false)
    mockIsFullscreen.mockResolvedValueOnce(true)

    const first = renderHook(() => useSquareCornersEffect())
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(isSquareCornersActive()).toBe(false)
    first.unmount()

    // Reset DOM between mounts.
    document.documentElement.classList.remove('square-corners')

    renderHook(() => useSquareCornersEffect())
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(isSquareCornersActive()).toBe(true)
  })

  it('cleans up the resize listener on unmount', async () => {
    mockPlatform.mockReturnValue('windows')
    const unlisten = vi.fn()
    mockOnResized.mockResolvedValueOnce(unlisten)

    const { unmount } = renderHook(() => useSquareCornersEffect())
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })

    unmount()
    await act(async () => {
      await Promise.resolve()
    })

    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('does not setSquareCorners when isFullscreen resolves after unmount', async () => {
    // Covers the post-await `if (cancelled) return` branch inside
    // updateCorners (L30:21): the effect was cleaned up before the
    // awaited isFullscreen() promise resolved, so the short-circuit
    // must win and setSquareCorners must not be called.
    mockPlatform.mockReturnValue('windows')

    // Definite-assignment: the resolver is wired up synchronously inside
    // the Promise constructor below, and TypeScript can't follow the
    // closure to see that. Using `!` skips the null check at the call
    // site; we still guard via `mockIsFullscreen` being awaited in act()
    // before reaching the resolution.
    let resolveFullscreen!: (value: boolean) => void
    mockIsFullscreen.mockReturnValueOnce(
      new Promise<boolean>(resolve => {
        resolveFullscreen = resolve
      })
    )

    const { unmount } = renderHook(() => useSquareCornersEffect())

    // Unmount synchronously sets `cancelled = true`; only then do we
    // resolve the deferred isFullscreen promise.
    unmount()
    resolveFullscreen(true)

    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(isSquareCornersActive()).toBe(false)
  })

  it('fires updateCorners from the resize listener while mounted and no-ops after unmount', async () => {
    // Covers the onResized callback paths:
    //   - while mounted: enters the callback, `cancelled` is false, so
    //     `void updateCorners()` runs (L41:6), producing another
    //     isFullscreen() call.
    //   - after unmount: enters the callback (L40:6), `cancelled` is
    //     true, so the `return` short-circuit fires (L40:21) and
    //     no further isFullscreen() call is made.
    mockPlatform.mockReturnValue('windows')
    mockIsFullscreen.mockResolvedValue(false)

    let resizeListener: (() => void) | null = null
    const unlisten = vi.fn()
    mockOnResized.mockImplementationOnce(cb => {
      resizeListener = cb ?? null
      return Promise.resolve(unlisten)
    })

    const { unmount } = renderHook(() => useSquareCornersEffect())
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })

    // Sanity: initial mount triggered one isFullscreen check and one
    // onResized subscription.
    expect(mockIsFullscreen).toHaveBeenCalledTimes(1)
    expect(mockOnResized).toHaveBeenCalledTimes(1)
    expect(resizeListener).not.toBeNull()

    // Fire listener while mounted → `void updateCorners()` runs →
    // another isFullscreen() call.
    await act(async () => {
      if (!resizeListener) throw new Error('listener was not registered')
      resizeListener()
    })
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockIsFullscreen).toHaveBeenCalledTimes(2)

    // Unmount sets `cancelled = true`.
    unmount()
    await act(async () => {
      await Promise.resolve()
    })
    expect(unlisten).toHaveBeenCalledTimes(1)

    // Fire listener after unmount → short-circuits, no further calls.
    await act(async () => {
      if (!resizeListener) throw new Error('listener was not registered')
      resizeListener()
    })
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockIsFullscreen).toHaveBeenCalledTimes(2)
  })
})
