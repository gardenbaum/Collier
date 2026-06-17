/**
 * Tests for `useKeyboardShortcuts`.
 *
 * Contract: a single-key shortcut (e.g. `"j"`) dispatches on the
 * matching `keydown`. A two-key combo (e.g. `"g+i"`) requires the
 * leader (`g`) followed by the second key (`i`) within 1 second.
 * Input/textarea/contenteditable focus suppresses every shortcut.
 * `enabled = false` detaches the listener entirely.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKeyboardShortcuts, type ShortcutMap } from './useKeyboardShortcuts'

/**
 * Dispatch a synthetic keydown on `window`. `key` is the
 * KeyboardEvent.key value (lowercased inside the hook).
 */
function pressKey(key: string, target: EventTarget = window) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useKeyboardShortcuts', () => {
  it('dispatches a single-key shortcut when its key is pressed', () => {
    const handler = vi.fn()
    const shortcuts: ShortcutMap = { j: handler }
    renderHook(() => useKeyboardShortcuts(shortcuts, true))

    pressKey('j')

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('dispatches a two-key leader combo when the keys land within the timeout', () => {
    const handler = vi.fn()
    const shortcuts: ShortcutMap = { 'g+i': handler }
    renderHook(() => useKeyboardShortcuts(shortcuts, true))

    pressKey('g')
    // 100ms later, well within the 1000ms leader window.
    vi.advanceTimersByTime(100)
    pressKey('i')

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('falls back to a single-key lookup when the second key arrives past the leader window', () => {
    const leaderHandler = vi.fn()
    const singleHandler = vi.fn()
    const shortcuts: ShortcutMap = {
      'g+i': leaderHandler,
      j: singleHandler,
    }
    renderHook(() => useKeyboardShortcuts(shortcuts, true))

    pressKey('g')
    // 1500ms later — past the 1000ms leader window.
    vi.advanceTimersByTime(1500)
    pressKey('j')

    // The leader combo must NOT fire; the standalone `j` shortcut
    // should. This is the leader-timeout contract.
    expect(leaderHandler).not.toHaveBeenCalled()
    expect(singleHandler).toHaveBeenCalledTimes(1)
  })

  it('skips shortcuts when the event target is an INPUT element', () => {
    const handler = vi.fn()
    const shortcuts: ShortcutMap = { j: handler }
    renderHook(() => useKeyboardShortcuts(shortcuts, true))

    const input = document.createElement('input')
    document.body.appendChild(input)
    pressKey('j', input)
    document.body.removeChild(input)

    expect(handler).not.toHaveBeenCalled()
  })

  it('skips shortcuts when the event target is a TEXTAREA element', () => {
    const handler = vi.fn()
    const shortcuts: ShortcutMap = { j: handler }
    renderHook(() => useKeyboardShortcuts(shortcuts, true))

    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    pressKey('j', ta)
    document.body.removeChild(ta)

    expect(handler).not.toHaveBeenCalled()
  })

  it('skips shortcuts when enabled is false', () => {
    const handler = vi.fn()
    const shortcuts: ShortcutMap = { j: handler }
    renderHook(() => useKeyboardShortcuts(shortcuts, false))

    pressKey('j')

    expect(handler).not.toHaveBeenCalled()
  })

  it('removes the window keydown listener on unmount', () => {
    const handler = vi.fn()
    const shortcuts: ShortcutMap = { j: handler }
    const { unmount } = renderHook(() => useKeyboardShortcuts(shortcuts, true))

    pressKey('j')
    expect(handler).toHaveBeenCalledTimes(1)

    unmount()
    pressKey('j')
    expect(handler).toHaveBeenCalledTimes(1) // unchanged after unmount
  })
})
