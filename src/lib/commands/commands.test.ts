import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { TFunction } from 'i18next'
import type { CommandContext, AppCommand } from './types'

const mockUIStore = {
  getState: vi.fn(() => ({
    sidebarVisible: true,
    commandPaletteOpen: false,
    setSidebarVisible: vi.fn(),
  })),
}

vi.mock('@/store/ui-store', () => ({
  useUIStore: mockUIStore,
}))

const mockWorkspaceStore = {
  getState: vi.fn(() => ({
    setActiveView: vi.fn(),
  })),
}

// M5 keyboard navigation: `go-to-search` reads the workspace store
// to switch to the search view. Mock it here so the command-system
// tests don't drag in the full Zustand persist + installQueryClient
// machinery from the real store.
vi.mock('@/store/workspace-store', () => ({
  useWorkspaceStore: mockWorkspaceStore,
}))

const focusSearchInput = vi.fn()
// Stub the focus event dispatcher so the command under test never
// tries to talk to a real DOM EventTarget (jsdom can, but a stub
// makes the assertion crisper).
vi.mock('@/hooks/use-keyboard-navigation', () => ({
  focusSearchInput,
}))

const { registerCommands, getAllCommands, executeCommand } =
  await import('./registry')
const { navigationCommands } = await import('./navigation-commands')

const createMockContext = (): CommandContext => ({
  openPreferences: vi.fn(),
  showToast: vi.fn(),
})

// Mock translation function for testing
const mockT = ((key: string): string => {
  const translations: Record<string, string> = {
    'commands.showLeftSidebar.label': 'Show Sidebar',
    'commands.showLeftSidebar.description': 'Show the sidebar',
    'commands.hideLeftSidebar.label': 'Hide Sidebar',
    'commands.hideLeftSidebar.description': 'Hide the sidebar',
    'commands.openPreferences.label': 'Open Preferences',
    'commands.openPreferences.description': 'Open the application preferences',
  }
  return translations[key] || key
}) as TFunction

describe('Simplified Command System', () => {
  let mockContext: CommandContext

  beforeEach(() => {
    mockContext = createMockContext()
    registerCommands(navigationCommands)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Command Registration', () => {
    it('registers commands correctly', () => {
      const commands = getAllCommands(mockContext)
      expect(commands.length).toBeGreaterThan(0)

      const sidebarCommand = commands.find(
        cmd => cmd.id === 'show-sidebar' || cmd.id === 'hide-sidebar'
      )
      expect(sidebarCommand).toBeDefined()
      expect(mockT(sidebarCommand?.labelKey ?? '')).toContain('Sidebar')
    })

    it('filters commands by availability', () => {
      mockUIStore.getState.mockReturnValue({
        sidebarVisible: false,
        commandPaletteOpen: false,
        setSidebarVisible: vi.fn(),
      })

      const availableCommands = getAllCommands(mockContext)
      const showSidebarCommand = availableCommands.find(
        cmd => cmd.id === 'show-sidebar'
      )
      const hideSidebarCommand = availableCommands.find(
        cmd => cmd.id === 'hide-sidebar'
      )

      expect(showSidebarCommand).toBeDefined()
      expect(hideSidebarCommand).toBeUndefined()
    })

    it('filters commands by search term using translations', () => {
      const searchResults = getAllCommands(mockContext, 'sidebar', mockT)

      expect(searchResults.length).toBeGreaterThan(0)
      searchResults.forEach(cmd => {
        const label = mockT(cmd.labelKey).toLowerCase()
        const description = cmd.descriptionKey
          ? mockT(cmd.descriptionKey).toLowerCase()
          : ''
        const matchesSearch =
          label.includes('sidebar') || description.includes('sidebar')

        expect(matchesSearch).toBe(true)
      })
    })
  })

  describe('Command Execution', () => {
    it('executes show-sidebar command correctly', async () => {
      mockUIStore.getState.mockReturnValue({
        sidebarVisible: false,
        commandPaletteOpen: false,
        setSidebarVisible: vi.fn(),
      })

      const result = await executeCommand('show-sidebar', mockContext)

      expect(result.success).toBe(true)
    })

    it('fails to execute unavailable command', async () => {
      mockUIStore.getState.mockReturnValue({
        sidebarVisible: true,
        commandPaletteOpen: false,
        setSidebarVisible: vi.fn(),
      })

      const result = await executeCommand('show-sidebar', mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('not available')
    })

    it('handles non-existent command', async () => {
      const result = await executeCommand('non-existent-command', mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('handles command execution errors', async () => {
      const errorCommand: AppCommand = {
        id: 'error-command',
        labelKey: 'commands.error.label',
        execute: () => {
          throw new Error('Test error')
        },
      }

      registerCommands([errorCommand])

      const result = await executeCommand('error-command', mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Test error')
    })

    it('executes open-preferences and forwards the call to the context', async () => {
      const result = await executeCommand('open-preferences', mockContext)

      expect(result.success).toBe(true)
      expect(mockContext.openPreferences).toHaveBeenCalledTimes(1)
    })

    it('executes hide-sidebar to collapse the left sidebar', async () => {
      mockUIStore.getState.mockReturnValue({
        sidebarVisible: true,
        commandPaletteOpen: false,
        setSidebarVisible: vi.fn(),
      })

      const result = await executeCommand('hide-sidebar', mockContext)

      expect(result.success).toBe(true)
    })

    it('executes go-to-search: switches the active view and dispatches focus', async () => {
      const setActiveView = vi.fn()
      mockWorkspaceStore.getState.mockReturnValue({ setActiveView })
      focusSearchInput.mockClear()

      const result = await executeCommand('go-to-search', mockContext)

      expect(result.success).toBe(true)
      expect(setActiveView).toHaveBeenCalledWith('search')
      expect(focusSearchInput).toHaveBeenCalledTimes(1)
    })
  })
})
