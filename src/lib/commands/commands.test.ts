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

  // Branch-coverage tests for `src/lib/commands/registry.ts`.
  //
  // The existing fixtures in `navigationCommands` always declare a
  // `descriptionKey`, so the `descriptionKey ? ... : ''` ternary
  // (line 23) never reaches the empty-string fallback. Likewise the
  // "handles command execution errors" test only throws `new Error()`,
  // so the non-Error branch of `error instanceof Error ? ... :
  // 'Unknown error'` (line 58) is unreachable through the public
  // surface. These two tests close both gaps and pin the behaviour.
  describe('registry branch coverage', () => {
    it('searches commands that omit descriptionKey without crashing on the missing key', () => {
      // Register a command without a descriptionKey. The label still
      // matches the search term, so the command should appear in the
      // filtered list. The ternary on line 23 takes the falsy branch
      // (descriptionKey is undefined → description becomes ''), the
      // label-only `includes(search)` then keeps the command in the
      // results, and `t(cmd.descriptionKey)` is never called.
      const descriptionlessCommand: AppCommand = {
        id: 'descriptionless',
        labelKey: 'commands.descriptionless.label',
        execute: vi.fn(),
      }
      registerCommands([descriptionlessCommand])

      const searchResults = getAllCommands(
        mockContext,
        'descriptionless',
        mockT
      )

      expect(searchResults).toContain(descriptionlessCommand)
    })

    it('wraps non-Error throws in the catch block with "Unknown error"', async () => {
      // The catch on line 56-64 normalises every thrown value into a
      // string. A `new Error('…')` takes the `instanceof Error` truthy
      // branch (covered by the existing "handles command execution
      // errors" test). Here we throw a non-Error value — a plain
      // object — to drive the `'Unknown error'` fallback on line 58.
      // The serialiser must not include `[object Object]` (which
      // would happen if the implementation just stringified the raw
      // value); the production code's intent is to mask unexpected
      // shapes behind the literal "Unknown error".
      const nonErrorThrower: AppCommand = {
        id: 'non-error-thrower',
        labelKey: 'commands.nonErrorThrower.label',
        execute: () => {
          // A plain object throw — exercises the `error instanceof
          // Error` falsy branch on line 58. Production code masks
          // non-Error values behind the literal "Unknown error".
          throw { custom: true }
        },
      }
      registerCommands([nonErrorThrower])

      const result = await executeCommand('non-error-thrower', mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unknown error')
      expect(result.error).not.toContain('[object Object]')
      expect(result.error).toContain("'non-error-thrower'")
    })
  })
})
