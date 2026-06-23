import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { CommandContext } from './types'

const { mockWindowApi } = vi.hoisted(() => ({
  mockWindowApi: {
    close: vi.fn(),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    setFullscreen: vi.fn(),
  },
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => mockWindowApi),
}))

import { windowCommands } from './window-commands'

const createContext = (): CommandContext => ({
  openPreferences: vi.fn(),
  showToast: vi.fn(),
})

const findCommand = (id: string) => {
  const cmd = windowCommands.find(c => c.id === id)
  if (!cmd) throw new Error(`Window command '${id}' not found in registry`)
  return cmd
}

describe('windowCommands', () => {
  let context: CommandContext

  beforeEach(() => {
    vi.clearAllMocks()
    mockWindowApi.close.mockReset()
    mockWindowApi.minimize.mockReset()
    mockWindowApi.toggleMaximize.mockReset()
    mockWindowApi.setFullscreen.mockReset()
    context = createContext()
  })

  it('exports five window commands', () => {
    expect(windowCommands).toHaveLength(5)
    const ids = windowCommands.map(c => c.id)
    expect(ids).toEqual([
      'window-close',
      'window-minimize',
      'window-toggle-maximize',
      'window-fullscreen',
      'window-exit-fullscreen',
    ])
  })

  it('binds the documented translation keys and shortcut hints', () => {
    const expected: Record<string, { labelKey: string; shortcut?: string }> = {
      'window-close': {
        labelKey: 'commands.windowClose.label',
        shortcut: '⌘+W',
      },
      'window-minimize': {
        labelKey: 'commands.windowMinimize.label',
        shortcut: '⌘+M',
      },
      'window-toggle-maximize': {
        labelKey: 'commands.windowToggleMaximize.label',
      },
      'window-fullscreen': {
        labelKey: 'commands.windowFullscreen.label',
        shortcut: 'F11',
      },
      'window-exit-fullscreen': {
        labelKey: 'commands.windowExitFullscreen.label',
        shortcut: 'Escape',
      },
    }
    for (const [id, expectation] of Object.entries(expected)) {
      const cmd = findCommand(id)
      expect(cmd.labelKey).toBe(expectation.labelKey)
      expect(cmd.shortcut).toBe(expectation.shortcut)
    }
  })

  describe('window-close', () => {
    it('calls getCurrentWindow().close() and does not toast on success', async () => {
      mockWindowApi.close.mockResolvedValueOnce(undefined)
      await findCommand('window-close').execute(context)
      expect(mockWindowApi.close).toHaveBeenCalledTimes(1)
      expect(context.showToast).not.toHaveBeenCalled()
    })

    it('reports a non-Error failure with the toast.error helper', async () => {
      mockWindowApi.close.mockRejectedValueOnce('boom')
      await findCommand('window-close').execute(context)
      expect(context.showToast).toHaveBeenCalledTimes(1)
      const toastCall = (context.showToast as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, string]
      expect(toastCall).toBeDefined()
      const [message, type] = toastCall
      expect(type).toBe('error')
      expect(message).toContain('Unknown error')
    })

    it('uses the Error message when the failure is an Error instance', async () => {
      mockWindowApi.close.mockRejectedValueOnce(new Error('permission denied'))
      await findCommand('window-close').execute(context)
      const toastCall = (context.showToast as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, string]
      expect(toastCall).toBeDefined()
      const [message, type] = toastCall
      expect(type).toBe('error')
      expect(message).toContain('permission denied')
    })
  })

  describe('window-minimize', () => {
    it('minimizes the current window on success', async () => {
      mockWindowApi.minimize.mockResolvedValueOnce(undefined)
      await findCommand('window-minimize').execute(context)
      expect(mockWindowApi.minimize).toHaveBeenCalledTimes(1)
      expect(context.showToast).not.toHaveBeenCalled()
    })

    it('toasts an Error.message when minimize throws', async () => {
      mockWindowApi.minimize.mockRejectedValueOnce(new Error('denied'))
      await findCommand('window-minimize').execute(context)
      const toastCall = (context.showToast as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, string]
      expect(toastCall).toBeDefined()
      const [message, type] = toastCall
      expect(type).toBe('error')
      expect(message).toContain('denied')
    })

    it('toasts "Unknown error" when minimize throws a non-Error value', async () => {
      mockWindowApi.minimize.mockRejectedValueOnce('plain string')
      await findCommand('window-minimize').execute(context)
      const toastCall = (context.showToast as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, string]
      expect(toastCall).toBeDefined()
      const [message, type] = toastCall
      expect(type).toBe('error')
      expect(message).toContain('Unknown error')
    })
  })

  describe('window-toggle-maximize', () => {
    it('toggles maximize on success', async () => {
      mockWindowApi.toggleMaximize.mockResolvedValueOnce(undefined)
      await findCommand('window-toggle-maximize').execute(context)
      expect(mockWindowApi.toggleMaximize).toHaveBeenCalledTimes(1)
      expect(context.showToast).not.toHaveBeenCalled()
    })

    it('toasts "Unknown error" when maximize toggling fails with a non-Error', async () => {
      mockWindowApi.toggleMaximize.mockRejectedValueOnce('nope')
      await findCommand('window-toggle-maximize').execute(context)
      const toastCall = (context.showToast as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, string]
      expect(toastCall).toBeDefined()
      const [message, type] = toastCall
      expect(type).toBe('error')
      expect(message).toContain('Unknown error')
    })

    it('toasts the Error.message when maximize toggling fails with an Error', async () => {
      mockWindowApi.toggleMaximize.mockRejectedValueOnce(
        new Error('wm crashed')
      )
      await findCommand('window-toggle-maximize').execute(context)
      const toastCall = (context.showToast as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, string]
      expect(toastCall).toBeDefined()
      const [message, type] = toastCall
      expect(type).toBe('error')
      expect(message).toContain('wm crashed')
    })
  })

  describe('window-fullscreen', () => {
    it('requests fullscreen(true) on success', async () => {
      mockWindowApi.setFullscreen.mockResolvedValueOnce(undefined)
      await findCommand('window-fullscreen').execute(context)
      expect(mockWindowApi.setFullscreen).toHaveBeenCalledWith(true)
      expect(context.showToast).not.toHaveBeenCalled()
    })

    it('toasts the Error.message when entering fullscreen fails', async () => {
      mockWindowApi.setFullscreen.mockRejectedValueOnce(new Error('fs-blocked'))
      await findCommand('window-fullscreen').execute(context)
      const toastCall = (context.showToast as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, string]
      expect(toastCall).toBeDefined()
      const [message, type] = toastCall
      expect(type).toBe('error')
      expect(message).toContain('fs-blocked')
    })

    it('toasts "Unknown error" when entering fullscreen fails with a non-Error', async () => {
      mockWindowApi.setFullscreen.mockRejectedValueOnce(0)
      await findCommand('window-fullscreen').execute(context)
      const toastCall = (context.showToast as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, string]
      expect(toastCall).toBeDefined()
      const [message, type] = toastCall
      expect(type).toBe('error')
      expect(message).toContain('Unknown error')
    })
  })

  describe('window-exit-fullscreen', () => {
    it('requests fullscreen(false) on success', async () => {
      mockWindowApi.setFullscreen.mockResolvedValueOnce(undefined)
      await findCommand('window-exit-fullscreen').execute(context)
      expect(mockWindowApi.setFullscreen).toHaveBeenCalledWith(false)
      expect(context.showToast).not.toHaveBeenCalled()
    })

    it('toasts "Unknown error" when leaving fullscreen fails with a non-Error', async () => {
      mockWindowApi.setFullscreen.mockRejectedValueOnce('escape-fail')
      await findCommand('window-exit-fullscreen').execute(context)
      const toastCall = (context.showToast as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, string]
      expect(toastCall).toBeDefined()
      const [message, type] = toastCall
      expect(type).toBe('error')
      expect(message).toContain('Unknown error')
    })

    it('toasts the Error.message when leaving fullscreen fails with an Error', async () => {
      mockWindowApi.setFullscreen.mockRejectedValueOnce(
        new Error('escape blocked')
      )
      await findCommand('window-exit-fullscreen').execute(context)
      const toastCall = (context.showToast as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, string]
      expect(toastCall).toBeDefined()
      const [message, type] = toastCall
      expect(type).toBe('error')
      expect(message).toContain('escape blocked')
    })
  })
})
