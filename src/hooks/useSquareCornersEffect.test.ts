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
  mockOnResized: vi.fn<() => Promise<() => void>>(),
}))

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: () => mockPlatform(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isFullscreen: () => mockIsFullscreen(),
    onResized: () => mockOnResized(),
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
})
