import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import {
  TitleBarLeftActions,
  TitleBarRightActions,
  TitleBarTitle,
  CommandPaletteHint,
} from './TitleBarContent'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { WorkspaceEntry } from '@/lib/bindings'

const { mockExecuteCommand, mockShowToast, mockListWorkspaces } = vi.hoisted(
  () => ({
    mockExecuteCommand: vi.fn(),
    mockShowToast: vi.fn(),
    mockListWorkspaces: vi.fn(),
  })
)

vi.mock('@/lib/commands', () => ({
  executeCommand: mockExecuteCommand,
  useCommandContext: () => ({
    openPreferences: vi.fn(),
    showToast: mockShowToast,
  }),
}))

// WorkspaceSwitcher (rendered inside TitleBarLeftActions) calls
// commands.listWorkspaces via TanStack Query — mirror the pattern from
// workspace-switcher.test.tsx so the trigger renders without crashing.
vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    listWorkspaces: mockListWorkspaces,
  },
}))

function makeEntry(path: string): WorkspaceEntry {
  const parts = path.split('/').filter(Boolean)
  return {
    path,
    name: parts[parts.length - 1] ?? path,
    source: 'current',
    exists: true,
  }
}

describe('TitleBarContent', () => {
  beforeEach(() => {
    mockExecuteCommand.mockReset()
    mockShowToast.mockReset()
    mockListWorkspaces.mockReset()
    useUIStore.setState({ sidebarVisible: true })
    useWorkspaceStore.setState({ repoPath: null })
    // Default: WorkspaceSwitcher resolves with an empty list so its
    // trigger mounts immediately without throwing.
    mockListWorkspaces.mockResolvedValue({ status: 'ok', data: [] })
  })

  describe('TitleBarLeftActions', () => {
    it('renders the toggle-sidebar button with the expected testid', () => {
      render(<TitleBarLeftActions />)
      expect(screen.getByTestId('titlebar-toggle-left')).toBeInTheDocument()
    })

    it('shows the PanelLeftClose icon when the sidebar is visible', () => {
      useUIStore.setState({ sidebarVisible: true })
      const { container } = render(<TitleBarLeftActions />)
      expect(
        container.querySelector('.lucide-panel-left-close')
      ).toBeInTheDocument()
      expect(
        container.querySelector('.lucide-panel-left')
      ).not.toBeInTheDocument()
    })

    it('shows the PanelLeft icon when the sidebar is hidden', () => {
      useUIStore.setState({ sidebarVisible: false })
      const { container } = render(<TitleBarLeftActions />)
      expect(container.querySelector('.lucide-panel-left')).toBeInTheDocument()
      expect(
        container.querySelector('.lucide-panel-left-close')
      ).not.toBeInTheDocument()
    })

    it('uses the hideLeftSidebar i18n key as the title when sidebar is visible', () => {
      useUIStore.setState({ sidebarVisible: true })
      render(<TitleBarLeftActions />)
      expect(screen.getByTestId('titlebar-toggle-left')).toHaveAttribute(
        'title',
        'Hide sidebar'
      )
    })

    it('uses the showLeftSidebar i18n key as the title when sidebar is hidden', () => {
      useUIStore.setState({ sidebarVisible: false })
      render(<TitleBarLeftActions />)
      expect(screen.getByTestId('titlebar-toggle-left')).toHaveAttribute(
        'title',
        'Show sidebar'
      )
    })

    it('calls toggleSidebar when the button is clicked', async () => {
      const user = userEvent.setup()
      useUIStore.setState({ sidebarVisible: true })
      render(<TitleBarLeftActions />)
      await user.click(screen.getByTestId('titlebar-toggle-left'))
      expect(useUIStore.getState().sidebarVisible).toBe(false)
      await user.click(screen.getByTestId('titlebar-toggle-left'))
      expect(useUIStore.getState().sidebarVisible).toBe(true)
    })

    it('renders the WorkspaceSwitcher next to the toggle button', async () => {
      useWorkspaceStore.setState({ repoPath: '/dev/projects/collier' })
      mockListWorkspaces.mockResolvedValue({
        status: 'ok',
        data: [makeEntry('/dev/projects/collier')],
      })
      render(<TitleBarLeftActions />)
      expect(
        await screen.findByTestId('workspace-switcher-trigger')
      ).toBeInTheDocument()
    })
  })

  describe('TitleBarRightActions', () => {
    it('renders the settings button with the expected testid', () => {
      render(<TitleBarRightActions />)
      expect(screen.getByTestId('titlebar-settings')).toBeInTheDocument()
    })

    it('uses the settings i18n key as the title', () => {
      render(<TitleBarRightActions />)
      expect(screen.getByTestId('titlebar-settings')).toHaveAttribute(
        'title',
        'Settings'
      )
    })

    it('calls executeCommand("open-preferences", ctx) when the button is clicked', async () => {
      const user = userEvent.setup()
      mockExecuteCommand.mockResolvedValue({ success: true })
      render(<TitleBarRightActions />)
      await user.click(screen.getByTestId('titlebar-settings'))
      await waitFor(() => {
        expect(mockExecuteCommand).toHaveBeenCalledTimes(1)
      })
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'open-preferences',
        expect.objectContaining({ showToast: mockShowToast })
      )
    })

    it('does not toast when the open-preferences command succeeds', async () => {
      const user = userEvent.setup()
      mockExecuteCommand.mockResolvedValue({ success: true })
      render(<TitleBarRightActions />)
      await user.click(screen.getByTestId('titlebar-settings'))
      await waitFor(() => {
        expect(mockExecuteCommand).toHaveBeenCalled()
      })
      expect(mockShowToast).not.toHaveBeenCalled()
    })

    it('toasts the error when executeCommand returns success=false with an error', async () => {
      const user = userEvent.setup()
      mockExecuteCommand.mockResolvedValue({
        success: false,
        error: 'preferences blew up',
      })
      render(<TitleBarRightActions />)
      await user.click(screen.getByTestId('titlebar-settings'))
      await waitFor(() => {
        expect(mockExecuteCommand).toHaveBeenCalled()
      })
      expect(mockShowToast).toHaveBeenCalledWith('preferences blew up', 'error')
    })

    it('does not toast when executeCommand returns success=false without an error', async () => {
      const user = userEvent.setup()
      mockExecuteCommand.mockResolvedValue({ success: false })
      render(<TitleBarRightActions />)
      await user.click(screen.getByTestId('titlebar-settings'))
      await waitFor(() => {
        expect(mockExecuteCommand).toHaveBeenCalled()
      })
      expect(mockShowToast).not.toHaveBeenCalled()
    })
  })

  describe('TitleBarTitle', () => {
    it('renders the monogram with the expected testid', () => {
      render(<TitleBarTitle />)
      expect(screen.getByTestId('titlebar-monogram')).toBeInTheDocument()
    })

    it('renders the default "Collier" title when no title prop is given', () => {
      render(<TitleBarTitle />)
      expect(screen.getByText('Collier')).toBeInTheDocument()
    })

    it('renders the provided title when the title prop is set', () => {
      render(<TitleBarTitle title="Custom" />)
      expect(screen.getByText('Custom')).toBeInTheDocument()
    })

    it('ignores the repoPath prop (workspace lives in the left switcher now)', () => {
      // The JSDoc on TitleBarTitle notes that repoPath is preserved for
      // callers that want to render a custom badge, but the default
      // TitleBarTitle ignores it. We just make sure rendering doesn't
      // throw and the title region still appears.
      render(<TitleBarTitle repoPath="/some/path" />)
      expect(screen.getByText('Collier')).toBeInTheDocument()
    })
  })

  describe('CommandPaletteHint', () => {
    it('renders the kbd with the expected testid', () => {
      render(<CommandPaletteHint />)
      expect(screen.getByTestId('titlebar-cmdk-hint')).toBeInTheDocument()
    })

    it('uses the openCommandPalette i18n key as the title', () => {
      render(<CommandPaletteHint />)
      expect(screen.getByTestId('titlebar-cmdk-hint')).toHaveAttribute(
        'title',
        'Open command palette'
      )
    })

    it('renders the trailing "K" letter', () => {
      render(<CommandPaletteHint />)
      expect(screen.getByTestId('titlebar-cmdk-hint').textContent).toContain(
        'K'
      )
    })
  })
})
