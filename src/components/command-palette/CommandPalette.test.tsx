// jsdom does not implement ResizeObserver. cmdk (the primitive
// underneath `Command*`) uses one to drive scroll-into-view; a no-op
// stub keeps its hook contract happy without forcing the test to
// simulate real DOM measurements.
class ResizeObserverStub {
  observe(): void {
    /* no-op */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}
beforeAll(() => {
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver
})

// jsdom does not implement Element.scrollIntoView. cmdk (the
// primitive underneath `Command*`) calls it on items to drive
// keyboard navigation; a no-op keeps its layout-effect happy
// without the test having to simulate real scroll geometry.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    /* no-op */
  }
}

/**
 * Tests for the `CommandPalette` component.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { FileText, Settings, Star } from 'lucide-react'
import { useUIStore } from '@/store/ui-store'
import { CommandPalette } from './CommandPalette'

const { mockGetAllCommands, mockExecuteCommand, mockCommandContext } =
  vi.hoisted(() => ({
    mockGetAllCommands: vi.fn(),
    mockExecuteCommand: vi.fn(),
    mockCommandContext: {
      openPreferences: vi.fn(),
      showToast: vi.fn(),
    },
  }))

vi.mock('@/lib/commands', () => ({
  getAllCommands: mockGetAllCommands,
  executeCommand: mockExecuteCommand,
}))

vi.mock('@/hooks/use-command-context', () => ({
  useCommandContext: () => mockCommandContext,
}))

const fixtureCommands = [
  {
    id: 'nav.search',
    labelKey: 'commands.goToSearch.label',
    descriptionKey: 'commands.goToSearch.description',
    icon: FileText,
    group: 'navigation',
    shortcut: '⌘P',
  },
  {
    // Second item in the `navigation` group. Exists to exercise
    // the reducer's "group already exists" branch (the path that
    // runs when `groups[group]` is truthy and we skip the
    // initialisation).
    id: 'nav.toggle-sidebar',
    labelKey: 'commands.hideLeftSidebar.label',
    descriptionKey: 'commands.hideLeftSidebar.description',
    icon: FileText,
    group: 'navigation',
  },
  {
    id: 'settings.open',
    labelKey: 'commands.openPreferences.label',
    descriptionKey: 'commands.openPreferences.description',
    icon: Settings,
    group: 'settings',
    shortcut: '⌘,',
  },
  {
    id: 'misc.ungrouped',
    labelKey: 'commands.testToast.label',
    descriptionKey: 'commands.testToast.description',
    icon: Star,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  useUIStore.setState({
    sidebarVisible: true,
    commandPaletteOpen: false,
    preferencesOpen: false,
    lastQuickPaneEntry: null,
  })
  mockGetAllCommands.mockReturnValue([])
  mockExecuteCommand.mockResolvedValue({ success: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function openDialog(): void {
  act(() => {
    useUIStore.setState({ commandPaletteOpen: true })
  })
}

async function renderOpen(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup()
  render(<CommandPalette />)
  openDialog()
  await waitFor(() =>
    expect(
      screen.getByPlaceholderText('Type a command or search...')
    ).toBeInTheDocument()
  )
  return user
}

describe('CommandPalette', () => {
  describe('render path', () => {
    it('does not render any dialog content while commandPaletteOpen is false', () => {
      mockGetAllCommands.mockReturnValue(fixtureCommands)
      render(<CommandPalette />)
      expect(
        screen.queryByPlaceholderText('Type a command or search...')
      ).not.toBeInTheDocument()
      expect(screen.queryByText('Collier')).not.toBeInTheDocument()
      expect(screen.queryByText('⌘K')).not.toBeInTheDocument()
      expect(mockGetAllCommands).toHaveBeenCalled()
    })

    it('renders the Collier header and ⌘K hint when the dialog opens', async () => {
      await renderOpen()
      expect(screen.getByLabelText('Collier')).toBeInTheDocument()
      expect(screen.getByText('Collier')).toBeInTheDocument()
      expect(screen.getByText('⌘K')).toBeInTheDocument()
    })

    it('renders the CommandInput wired to the placeholder from translations', async () => {
      await renderOpen()
      const input = screen.getByPlaceholderText('Type a command or search...')
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('role', 'combobox')
    })

    it('renders the "No results found" empty state when getAllCommands returns []', async () => {
      await renderOpen()
      expect(screen.getByText('No results found.')).toBeInTheDocument()
    })

    it('renders a sr-only title and description pulled from translations', async () => {
      render(<CommandPalette />)
      openDialog()
      await waitFor(() => {
        // Title + description are inside the dialog content,
        // which Radix portals to document.body, so query the
        // whole document rather than the React render host.
        expect(document.body.textContent).toContain('Command Palette')
        expect(document.body.textContent).toContain(
          'Type a command or search...'
        )
      })
    })
  })

  describe('search filter', () => {
    it('calls getAllCommands with the latest search query when the user types', async () => {
      const user = await renderOpen()
      const input = screen.getByPlaceholderText('Type a command or search...')
      await user.type(input, 'search')
      expect(mockGetAllCommands).toHaveBeenCalled()
      const lastCall =
        mockGetAllCommands.mock.calls[mockGetAllCommands.mock.calls.length - 1]
      expect(lastCall?.[1]).toBe('search')
    })

    it('calls getAllCommands with an empty search by default', async () => {
      await renderOpen()
      const firstCall = mockGetAllCommands.mock.calls[0]
      expect(firstCall?.[1]).toBe('')
    })
  })

  describe('grouping', () => {
    it('renders each command inside its translated group heading', async () => {
      mockGetAllCommands.mockReturnValue(fixtureCommands)
      await renderOpen()
      expect(screen.getByText('Navigation')).toBeInTheDocument()
      expect(screen.getByText('Settings')).toBeInTheDocument()
      expect(screen.getByText('Other')).toBeInTheDocument()
      expect(screen.getByText('Search Issues')).toBeInTheDocument()
      expect(screen.getByText('Open Preferences')).toBeInTheDocument()
      expect(screen.getByText('Test Toast Notification')).toBeInTheDocument()
    })

    it('falls back to a capitalised group name when no translation key exists', async () => {
      const customFixture = [
        {
          id: 'custom.a',
          labelKey: 'commands.goToSearch.label',
          descriptionKey: undefined,
          icon: Star,
          group: 'miscOps',
        },
      ]
      mockGetAllCommands.mockReturnValue(customFixture)
      await renderOpen()
      expect(screen.getByText('MiscOps')).toBeInTheDocument()
      expect(
        screen.queryByText('commands.group.miscOps')
      ).not.toBeInTheDocument()
    })

    it('renders the icon, description and shortcut when each is present on the command', async () => {
      mockGetAllCommands.mockReturnValue(fixtureCommands)
      render(<CommandPalette />)
      openDialog()
      await waitFor(() => {
        expect(
          screen.getByText('Switch to the search view and focus the input')
        ).toBeInTheDocument()
        expect(
          screen.getByText('Open the application preferences')
        ).toBeInTheDocument()
      })
      expect(screen.getByText('⌘P')).toBeInTheDocument()
      expect(screen.getByText('⌘,')).toBeInTheDocument()
      // Radix Dialog portals its content to `document.body`, so the
      // SVGs are outside the React render container. Query the
      // document directly rather than `container.querySelectorAll`.
      const svgCount = document.querySelectorAll('svg').length
      expect(svgCount).toBeGreaterThanOrEqual(fixtureCommands.length)
    })

    it('omits the description block when the command has no descriptionKey', async () => {
      mockGetAllCommands.mockReturnValue([
        {
          id: 'plain.cmd',
          labelKey: 'commands.testToast.label',
          icon: Star,
          group: 'misc',
        },
      ])
      render(<CommandPalette />)
      openDialog()
      await waitFor(() => {
        expect(screen.getByText('Test Toast Notification')).toBeInTheDocument()
      })
      // The header `⌘K` hint is a plain <span> (not a
      // CommandShortcut), so the ONLY way a command-shortcut
      // span can appear is if the picked command has a
      // `shortcut` field. With `shortcut: undefined` here, the
      // per-item shortcut block must be omitted entirely.
      const shortcutSpans = document.querySelectorAll(
        '[data-slot="command-shortcut"]'
      )
      expect(shortcutSpans).toHaveLength(0)
    })
  })

  describe('keyboard shortcut (Cmd/Ctrl + K)', () => {
    it('toggles the palette when the user presses Cmd + K and prevents the default', () => {
      const toggleSpy = vi.spyOn(useUIStore.getState(), 'toggleCommandPalette')
      render(<CommandPalette />)
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      })
      act(() => {
        document.dispatchEvent(event)
      })
      expect(event.defaultPrevented).toBe(true)
      expect(toggleSpy).toHaveBeenCalledTimes(1)
    })

    it('toggles the palette when the user presses Ctrl + K (Linux/Windows)', () => {
      const toggleSpy = vi.spyOn(useUIStore.getState(), 'toggleCommandPalette')
      render(<CommandPalette />)
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
      act(() => {
        document.dispatchEvent(event)
      })
      expect(event.defaultPrevented).toBe(true)
      expect(toggleSpy).toHaveBeenCalledTimes(1)
    })

    it('does nothing for unrelated keys', () => {
      const toggleSpy = vi.spyOn(useUIStore.getState(), 'toggleCommandPalette')
      render(<CommandPalette />)
      const plainK = new KeyboardEvent('keydown', {
        key: 'k',
        bubbles: true,
        cancelable: true,
      })
      act(() => {
        document.dispatchEvent(plainK)
      })
      const plainJ = new KeyboardEvent('keydown', {
        key: 'j',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      })
      act(() => {
        document.dispatchEvent(plainJ)
      })
      expect(plainK.defaultPrevented).toBe(false)
      expect(plainJ.defaultPrevented).toBe(false)
      expect(toggleSpy).not.toHaveBeenCalled()
    })

    it('removes the keydown listener when the component unmounts', () => {
      const toggleSpy = vi.spyOn(useUIStore.getState(), 'toggleCommandPalette')
      const { unmount } = render(<CommandPalette />)
      unmount()
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      })
      act(() => {
        document.dispatchEvent(event)
      })
      expect(toggleSpy).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(false)
    })
  })

  describe('command selection', () => {
    it('closes the dialog, clears the search and executes the picked command', async () => {
      mockGetAllCommands.mockReturnValue(fixtureCommands)
      mockExecuteCommand.mockResolvedValue({ success: true })
      const user = await renderOpen()
      // First type into the search field so we can verify the
      // clear-on-select behaviour, then clear it again so cmdk's
      // own filter does not hide the items before we click one.
      const input = screen.getByPlaceholderText('Type a command or search...')
      await user.type(input, 'pref')
      expect(input).toHaveValue('pref')
      await user.clear(input)
      const prefsItem = screen.getByText('Open Preferences')
      await user.click(prefsItem)
      await waitFor(() =>
        expect(mockExecuteCommand).toHaveBeenCalledWith(
          'settings.open',
          mockCommandContext
        )
      )
      expect(useUIStore.getState().commandPaletteOpen).toBe(false)
      expect(mockCommandContext.showToast).not.toHaveBeenCalled()
      // After selection the search state is wiped, ready for the
      // next time the palette opens.
      expect(input).toHaveValue('')
    })

    it('shows a toast carrying the error message when the command fails', async () => {
      mockGetAllCommands.mockReturnValue(fixtureCommands)
      mockExecuteCommand.mockResolvedValue({
        success: false,
        error: 'something went wrong',
      })
      const user = await renderOpen()
      await user.click(screen.getByText('Open Preferences'))
      await waitFor(() =>
        expect(mockExecuteCommand).toHaveBeenCalledWith(
          'settings.open',
          mockCommandContext
        )
      )
      await waitFor(() =>
        expect(mockCommandContext.showToast).toHaveBeenCalledWith(
          'something went wrong',
          'error'
        )
      )
      expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    })

    it('does NOT show a toast when the command succeeds', async () => {
      mockGetAllCommands.mockReturnValue(fixtureCommands)
      mockExecuteCommand.mockResolvedValue({ success: true })
      const user = await renderOpen()
      await user.click(screen.getByText('Search Issues'))
      await waitFor(() =>
        expect(mockExecuteCommand).toHaveBeenCalledWith(
          'nav.search',
          mockCommandContext
        )
      )
      expect(mockCommandContext.showToast).not.toHaveBeenCalled()
    })

    it('does NOT show a toast when executeCommand returns success:false with no error string', async () => {
      mockGetAllCommands.mockReturnValue(fixtureCommands)
      mockExecuteCommand.mockResolvedValue({ success: false })
      const user = await renderOpen()
      await user.click(screen.getByText('Open Preferences'))
      await waitFor(() =>
        expect(mockExecuteCommand).toHaveBeenCalledWith(
          'settings.open',
          mockCommandContext
        )
      )
      expect(mockCommandContext.showToast).not.toHaveBeenCalled()
    })
  })

  describe('dialog close', () => {
    it('clears the search field when the dialog is dismissed without selecting a command', async () => {
      mockGetAllCommands.mockReturnValue(fixtureCommands)
      const user = await renderOpen()
      const input = screen.getByPlaceholderText('Type a command or search...')
      await user.type(input, 'preferences')
      expect(input).toHaveValue('preferences')
      fireEvent.keyDown(document, { key: 'Escape' })
      await waitFor(() =>
        expect(useUIStore.getState().commandPaletteOpen).toBe(false)
      )
      expect(mockExecuteCommand).not.toHaveBeenCalled()
      openDialog()
      await waitFor(() =>
        expect(
          screen.getByPlaceholderText('Type a command or search...')
        ).toBeInTheDocument()
      )
      expect(
        screen.getByPlaceholderText('Type a command or search...')
      ).toHaveValue('')
    })

    it('clears the search field on re-open when the user closed the palette with a query', async () => {
      // When the user closes the palette (Escape), Radix's
      // `onOpenChange(false)` flows through `handleOpenChange`,
      // which clears the in-component `search` state. Re-opening
      // the palette (e.g. via the Cmd+K shortcut toggle, which
      // bypasses `handleOpenChange`) must therefore show an empty
      // input - the previous query is gone.
      mockGetAllCommands.mockReturnValue(fixtureCommands)
      const user = await renderOpen()
      const input = screen.getByPlaceholderText('Type a command or search...')
      await user.type(input, 'keep me')
      expect(input).toHaveValue('keep me')

      // Close via Escape so `handleOpenChange(false)` fires.
      fireEvent.keyDown(document, { key: 'Escape' })
      await waitFor(() =>
        expect(useUIStore.getState().commandPaletteOpen).toBe(false)
      )

      // Re-open via the keyboard shortcut. This calls
      // `toggleCommandPalette()` directly (not `setCommandPaletteOpen(true)`),
      // so the only path the search could have been cleared is
      // through `handleOpenChange(false)` on the way down.
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      })
      act(() => {
        document.dispatchEvent(event)
      })

      await waitFor(() =>
        expect(
          screen.getByPlaceholderText('Type a command or search...')
        ).toBeInTheDocument()
      )
      expect(
        screen.getByPlaceholderText('Type a command or search...')
      ).toHaveValue('')
      expect(input).toHaveValue('')
    })

    it('calls setCommandPaletteOpen(false) when the user dismisses the dialog with Escape', async () => {
      // Radix Dialog translates the Escape key into a single
      // `onOpenChange(false)` call on the consumer. The palette
      // forwards that into the UI store's `setCommandPaletteOpen`
      // action and clears the search - this test pins both halves
      // of that contract from the consumer's side.
      const setOpenSpy = vi.spyOn(
        useUIStore.getState(),
        'setCommandPaletteOpen'
      )
      mockGetAllCommands.mockReturnValue(fixtureCommands)
      const user = await renderOpen()
      // Type something so we can also verify the close clears it.
      const input = screen.getByPlaceholderText('Type a command or search...')
      await user.type(input, 'foo')
      expect(input).toHaveValue('foo')

      fireEvent.keyDown(document, { key: 'Escape' })

      await waitFor(() => {
        expect(setOpenSpy).toHaveBeenCalledWith(false)
      })
      expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    })
  })
})
