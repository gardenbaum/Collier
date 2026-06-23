/**
 * Tests for the module-level command context returned by
 * `useCommandContext`. The hook returns a stable reference whose
 * `openPreferences` and `showToast` members dispatch into the
 * UI store and the notifications helper.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useUIStore } from '@/store/ui-store'

const { mockNotify } = vi.hoisted(() => ({
  mockNotify: vi.fn(),
}))

vi.mock('@/lib/notifications', () => ({
  notify: mockNotify,
}))

import { useCommandContext } from './use-command-context'

describe('useCommandContext', () => {
  beforeEach(() => {
    mockNotify.mockReset()
    useUIStore.setState({ preferencesOpen: false })
  })

  it('returns an object with the documented CommandContext shape', () => {
    const { result } = renderHook(() => useCommandContext())
    expect(typeof result.current.openPreferences).toBe('function')
    expect(typeof result.current.showToast).toBe('function')
  })

  it('returns a stable reference across renders', () => {
    const { result, rerender } = renderHook(() => useCommandContext())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })

  it('openPreferences toggles the UI store preferencesOpen flag', () => {
    const { result } = renderHook(() => useCommandContext())
    expect(useUIStore.getState().preferencesOpen).toBe(false)

    result.current.openPreferences()
    expect(useUIStore.getState().preferencesOpen).toBe(true)

    result.current.openPreferences()
    expect(useUIStore.getState().preferencesOpen).toBe(false)
  })

  it('showToast forwards the message to notify with type "info" by default', () => {
    const { result } = renderHook(() => useCommandContext())
    result.current.showToast('hello world')
    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(mockNotify).toHaveBeenCalledWith('hello world', undefined, {
      type: 'info',
    })
  })

  it('showToast respects an explicit toast type', () => {
    const { result } = renderHook(() => useCommandContext())
    result.current.showToast('something went wrong', 'error')
    expect(mockNotify).toHaveBeenCalledWith('something went wrong', undefined, {
      type: 'error',
    })
  })

  it('showToast accepts "success" and "info" as type variants', () => {
    const { result } = renderHook(() => useCommandContext())
    result.current.showToast('yay', 'success')
    result.current.showToast('heads up', 'info')
    expect(mockNotify).toHaveBeenNthCalledWith(1, 'yay', undefined, {
      type: 'success',
    })
    expect(mockNotify).toHaveBeenNthCalledWith(2, 'heads up', undefined, {
      type: 'info',
    })
  })
})
