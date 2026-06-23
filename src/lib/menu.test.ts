import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import i18n from '@/i18n/config'

interface MenuItemConfig {
  id?: string
  text?: string
  accelerator?: string
  action?: () => void | Promise<void>
}

interface PredefinedConfig {
  item?: string
  text?: string
}

const { mockMenu, mockSubmenu, mockMenuItem, mockPredefined } = vi.hoisted(
  () => ({
    mockMenu: vi.fn().mockImplementation(() => ({
      setAsAppMenu: vi.fn().mockResolvedValue(undefined),
    })),
    mockSubmenu: vi.fn().mockImplementation(async () => ({})),
    mockMenuItem: vi.fn().mockImplementation(async () => ({})),
    mockPredefined: vi.fn().mockImplementation(async () => ({})),
  })
)

const { mockCheck, mockNotifications, mockLogger, mockUIStore } = vi.hoisted(
  () => ({
    mockCheck: vi.fn(),
    mockNotifications: {
      info: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    },
    mockLogger: {
      info: vi.fn(),
      error: vi.fn(),
    },
    mockUIStore: {
      getState: vi.fn(() => ({
        preferencesOpen: false,
        sidebarVisible: true,
        toggleLeftSidebar: vi.fn(),
        setPreferencesOpen: vi.fn(),
      })),
    },
  })
)

vi.mock('@tauri-apps/api/menu', () => ({
  Menu: Object.assign(
    vi.fn().mockImplementation(() => ({ setAsAppMenu: vi.fn() })),
    { new: mockMenu }
  ),
  Submenu: Object.assign(vi.fn(), { new: mockSubmenu }),
  MenuItem: Object.assign(vi.fn(), { new: mockMenuItem }),
  PredefinedMenuItem: Object.assign(vi.fn(), { new: mockPredefined }),
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: mockCheck,
}))

vi.mock('@/lib/notifications', () => ({
  notifications: mockNotifications,
}))

vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}))

vi.mock('@/store/ui-store', () => ({
  useUIStore: mockUIStore,
}))

// Set the build-time constant menu.ts relies on.
;(globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = '0.1.0-test'

// Stub window.alert for the About menu handler.
const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined)

import { buildAppMenu, setupMenuLanguageListener } from './menu'

const flushAsync = () => new Promise(resolve => setTimeout(resolve, 0))

const getMenuItemConfig = (id: string): MenuItemConfig | undefined => {
  for (const call of mockMenuItem.mock.calls) {
    const config = call[0] as MenuItemConfig | undefined
    if (config?.id === id) return config
  }
  return undefined
}

const collectPredefined = (): PredefinedConfig[] => {
  const out: PredefinedConfig[] = []
  for (const call of mockPredefined.mock.calls) {
    out.push(call[0] as PredefinedConfig)
  }
  return out
}

describe('buildAppMenu', () => {
  beforeEach(() => {
    mockMenu.mockClear()
    mockSubmenu.mockClear()
    mockMenuItem.mockClear()
    mockPredefined.mockClear()
    mockCheck.mockReset()
    mockNotifications.info.mockReset()
    mockNotifications.success.mockReset()
    mockNotifications.error.mockReset()
    mockLogger.info.mockReset()
    mockLogger.error.mockReset()
    alertSpy.mockClear()
  })

  it('builds two submenus, instantiates Menu, and exposes a setAsAppMenu method', async () => {
    const menu = await buildAppMenu()
    expect(mockSubmenu).toHaveBeenCalledTimes(2)
    expect(mockMenuItem).toHaveBeenCalled()
    expect(mockPredefined).toHaveBeenCalled()
    expect(mockMenu).toHaveBeenCalledTimes(1)
    expect((menu as { setAsAppMenu: unknown }).setAsAppMenu).toBeDefined()
  })

  it('wires the expected menu item ids and accelerator', async () => {
    await buildAppMenu()
    const about = getMenuItemConfig('about')
    const checkUpdates = getMenuItemConfig('check-updates')
    const preferences = getMenuItemConfig('preferences')
    const toggleSidebar = getMenuItemConfig('toggle-sidebar')

    expect(about).toBeDefined()
    expect(checkUpdates).toBeDefined()
    expect(preferences).toBeDefined()
    expect(preferences?.accelerator).toBe('CmdOrCtrl+,')
    expect(toggleSidebar).toBeDefined()
    expect(toggleSidebar?.accelerator).toBe('CmdOrCtrl+1')
  })

  it('emits separators, Hide/HideOthers/ShowAll and Quit predefined items', async () => {
    await buildAppMenu()
    const predefined = collectPredefined()
    const separators = predefined.filter(p => p.item === 'Separator')
    expect(separators.length).toBeGreaterThanOrEqual(3)
    expect(predefined.map(p => p.item)).toEqual(
      expect.arrayContaining(['Hide', 'HideOthers', 'ShowAll', 'Quit'])
    )
  })

  it('logs a success message after a successful build', async () => {
    await buildAppMenu()
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Application menu built successfully'
    )
  })

  it('logs and rethrows when Submenu.new rejects', async () => {
    mockSubmenu.mockImplementationOnce(async () => {
      throw new Error('boom')
    })
    await expect(buildAppMenu()).rejects.toThrow('boom')
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to build application menu',
      { error: expect.any(Error) }
    )
  })
})

describe('menu item action handlers', () => {
  beforeEach(() => {
    mockMenu.mockClear()
    mockSubmenu.mockClear()
    mockMenuItem.mockClear()
    mockPredefined.mockClear()
    mockCheck.mockReset()
    mockNotifications.info.mockReset()
    mockNotifications.success.mockReset()
    mockNotifications.error.mockReset()
    mockLogger.info.mockReset()
    mockLogger.error.mockReset()
    alertSpy.mockClear()
    mockUIStore.getState.mockReturnValue({
      preferencesOpen: false,
      sidebarVisible: true,
      toggleLeftSidebar: vi.fn(),
      setPreferencesOpen: vi.fn(),
    })
  })

  it('handleAbout: shows an alert containing the app name and version', async () => {
    await buildAppMenu()
    const about = getMenuItemConfig('about')?.action
    expect(about).toBeDefined()
    about?.()
    expect(mockLogger.info).toHaveBeenCalledWith('About menu item clicked')
    expect(alertSpy).toHaveBeenCalledTimes(1)
    const message = alertSpy.mock.calls[0]?.[0] as string
    expect(message).toContain('Tauri Template')
    expect(message).toContain('Version: 0.1.0-test')
    expect(message).toContain('Built with Tauri v2')
  })

  it('handleCheckForUpdates: notifies success when no update is available', async () => {
    mockCheck.mockResolvedValueOnce(null)
    await buildAppMenu()
    const action = getMenuItemConfig('check-updates')?.action
    expect(action).toBeDefined()
    await action?.()
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Check for Updates menu item clicked'
    )
    expect(mockCheck).toHaveBeenCalledTimes(1)
    expect(mockNotifications.success).toHaveBeenCalledWith(
      'Up to Date',
      'You are running the latest version'
    )
    expect(mockNotifications.info).not.toHaveBeenCalled()
    expect(mockNotifications.error).not.toHaveBeenCalled()
  })

  it('handleCheckForUpdates: notifies info with the version when an update is available', async () => {
    mockCheck.mockResolvedValueOnce({ version: '1.2.3' })
    await buildAppMenu()
    const action = getMenuItemConfig('check-updates')?.action
    await action?.()
    expect(mockNotifications.info).toHaveBeenCalledWith(
      'Update Available',
      'Version 1.2.3 is available'
    )
    expect(mockNotifications.success).not.toHaveBeenCalled()
  })

  it('handleCheckForUpdates: notifies error and logs when check() rejects', async () => {
    mockCheck.mockRejectedValueOnce(new Error('network down'))
    await buildAppMenu()
    const action = getMenuItemConfig('check-updates')?.action
    await action?.()
    expect(mockLogger.error).toHaveBeenCalledWith('Update check failed', {
      error: expect.any(Error),
    })
    expect(mockNotifications.error).toHaveBeenCalledWith(
      'Update Check Failed',
      'Could not check for updates'
    )
  })

  it('handleOpenPreferences: flips the preferences-open state via the UI store', async () => {
    const setPreferencesOpen = vi.fn()
    mockUIStore.getState.mockReturnValue({
      preferencesOpen: false,
      sidebarVisible: true,
      toggleLeftSidebar: vi.fn(),
      setPreferencesOpen,
    })
    await buildAppMenu()
    const action = getMenuItemConfig('preferences')?.action
    expect(action).toBeDefined()
    action?.()
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Preferences menu item clicked'
    )
    expect(setPreferencesOpen).toHaveBeenCalledWith(true)
  })

  it('handleToggleLeftSidebar: invokes toggleLeftSidebar on the UI store', async () => {
    const toggleLeftSidebar = vi.fn()
    mockUIStore.getState.mockReturnValue({
      preferencesOpen: false,
      sidebarVisible: true,
      toggleLeftSidebar,
      setPreferencesOpen: vi.fn(),
    })
    await buildAppMenu()
    const action = getMenuItemConfig('toggle-sidebar')?.action
    expect(action).toBeDefined()
    action?.()
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Toggle Sidebar menu item clicked'
    )
    expect(toggleLeftSidebar).toHaveBeenCalledTimes(1)
  })
})

describe('setupMenuLanguageListener', () => {
  afterEach(() => {
    i18n.off('languageChanged', () => undefined)
  })

  it('returns an unsubscribe function and rebuilds the menu on language change', async () => {
    const initialMenuCalls = mockMenu.mock.calls.length
    const initialSubmenuCalls = mockSubmenu.mock.calls.length

    const unsubscribe = setupMenuLanguageListener()
    expect(typeof unsubscribe).toBe('function')

    await i18n.changeLanguage('fr')
    await flushAsync()
    await flushAsync()

    expect(mockSubmenu.mock.calls.length).toBeGreaterThan(initialSubmenuCalls)
    expect(mockMenu.mock.calls.length).toBeGreaterThan(initialMenuCalls)
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Language changed, rebuilding menu'
    )

    // Restore default locale for downstream tests.
    await i18n.changeLanguage('en')
    await flushAsync()
    unsubscribe()
  })

  it('unsubscribe stops further rebuilds', async () => {
    const unsubscribe = setupMenuLanguageListener()
    const baselineMenuCalls = mockMenu.mock.calls.length
    const baselineSubmenuCalls = mockSubmenu.mock.calls.length

    unsubscribe()

    await i18n.changeLanguage('ar')
    await flushAsync()
    await flushAsync()

    expect(mockMenu.mock.calls.length).toBe(baselineMenuCalls)
    expect(mockSubmenu.mock.calls.length).toBe(baselineSubmenuCalls)

    await i18n.changeLanguage('en')
    await flushAsync()
  })

  it('logs but does not throw when rebuilding fails after a language change', async () => {
    const unsubscribe = setupMenuLanguageListener()

    mockMenu.mockImplementationOnce(() => {
      throw new Error('rebuild-failed')
    })

    await i18n.changeLanguage('ar')
    await flushAsync()
    await flushAsync()

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to rebuild menu on language change',
      { error: expect.any(Error) }
    )

    await i18n.changeLanguage('en')
    await flushAsync()
    unsubscribe()
  })
})
