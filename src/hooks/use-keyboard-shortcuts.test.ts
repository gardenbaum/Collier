/**
 * Tests for the actually-used `use-keyboard-shortcuts` hook (the
 * kbd-shortcut registration used by the main window to handle
 * Cmd+, and Cmd+1). The kebab-case filename is the live module
 * path imported from `useMainWindowEventListeners.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useUIStore } from '@/store/ui-store'
import type { CommandContext } from '@/lib/commands/types'
import { useKeyboardShortcuts } from './use-keyboard-shortcuts'

const makeContext = (): CommandContext => ({
  openPreferences: vi.fn(),
  showToast: vi.fn(),
})

function pressKey(key: string, mods: { meta?: boolean; ctrl?: boolean } = {}) {
  window.document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      metaKey: !!mods.meta,
      ctrlKey: !!mods.ctrl,
      bubbles: true,
    })
  )
}

describe('useKeyboardShortcuts (kebab-case module)', () => {
  beforeEach(() => {
    useUIStore.setState({
      sidebarVisible: true,
      leftSidebarVisible: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens preferences when Cmd+, is pressed', () => {
    const ctx = makeContext()
    renderHook(() => useKeyboardShortcuts(ctx))

    pressKey(',', { meta: true })

    expect(ctx.openPreferences).toHaveBeenCalledTimes(1)
  })

  it('opens preferences when Ctrl+, is pressed', () => {
    const ctx = makeContext()
    renderHook(() => useKeyboardShortcuts(ctx))

    pressKey(',', { ctrl: true })

    expect(ctx.openPreferences).toHaveBeenCalledTimes(1)
  })

  it('toggles the sidebar when Cmd+1 is pressed (visible -> hidden)', () => {
    const ctx = makeContext()
    renderHook(() => useKeyboardShortcuts(ctx))

    pressKey('1', { meta: true })

    expect(useUIStore.getState().sidebarVisible).toBe(false)
    expect(useUIStore.getState().leftSidebarVisible).toBe(false)
  })

  it('toggles the sidebar when Ctrl+1 is pressed (hidden -> visible)', () => {
    useUIStore.setState({ sidebarVisible: false, leftSidebarVisible: false })
    const ctx = makeContext()
    renderHook(() => useKeyboardShortcuts(ctx))

    pressKey('1', { ctrl: true })

    expect(useUIStore.getState().sidebarVisible).toBe(true)
    expect(useUIStore.getState().leftSidebarVisible).toBe(true)
  })

  it('ignores the bare key when no modifier is held', () => {
    const ctx = makeContext()
    renderHook(() => useKeyboardShortcuts(ctx))

    pressKey(',')
    pressKey('1')

    expect(ctx.openPreferences).not.toHaveBeenCalled()
    expect(useUIStore.getState().sidebarVisible).toBe(true)
  })

  it('ignores other modified keys (Cmd+2, Cmd+a, etc.)', () => {
    const ctx = makeContext()
    renderHook(() => useKeyboardShortcuts(ctx))

    pressKey('2', { meta: true })
    pressKey('a', { meta: true })
    pressKey('Escape', { meta: true })

    expect(ctx.openPreferences).not.toHaveBeenCalled()
    expect(useUIStore.getState().sidebarVisible).toBe(true)
  })

  it('detaches the document keydown listener on unmount', () => {
    const ctx = makeContext()
    const { unmount } = renderHook(() => useKeyboardShortcuts(ctx))

    pressKey(',', { meta: true })
    expect(ctx.openPreferences).toHaveBeenCalledTimes(1)

    unmount()

    pressKey(',', { meta: true })
    expect(ctx.openPreferences).toHaveBeenCalledTimes(1)
  })
})
