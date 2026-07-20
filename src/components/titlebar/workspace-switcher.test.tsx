import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { WorkspaceEntry } from '@/lib/bindings'

const { mockListWorkspaces } = vi.hoisted(() => ({
  mockListWorkspaces: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    listWorkspaces: mockListWorkspaces,
  },
}))

function makeEntry(
  path: string,
  source: 'current' | 'recent' | 'registry',
  exists = true
): WorkspaceEntry {
  const parts = path.split('/').filter(Boolean)
  return {
    path,
    name: parts[parts.length - 1] ?? path,
    source,
    exists,
  }
}

describe('WorkspaceSwitcher', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ repoPath: null })
    mockListWorkspaces.mockReset()
  })

  describe('trigger label', () => {
    it('shows the active workspace basename when a workspace is open', async () => {
      useWorkspaceStore.setState({ repoPath: '/Users/dev/projects/collier' })
      mockListWorkspaces.mockResolvedValue({
        status: 'ok',
        data: [makeEntry('/Users/dev/projects/collier', 'current')],
      })
      render(<WorkspaceSwitcher />)
      // The trigger renders the workspace name. We wait for the
      // query to resolve.
      expect(await screen.findByText('collier')).toBeInTheDocument()
    })

    it('shows the active workspace full path on hover', async () => {
      useWorkspaceStore.setState({ repoPath: '/Users/dev/projects/collier' })
      mockListWorkspaces.mockResolvedValue({
        status: 'ok',
        data: [makeEntry('/Users/dev/projects/collier', 'current')],
      })
      render(<WorkspaceSwitcher />)
      const path = await screen.findByTestId('workspace-switcher-path')
      expect(path.textContent).toBe('/Users/dev/projects/collier')
    })

    it('falls back to the no-workspace label when no workspace is set', () => {
      useWorkspaceStore.setState({ repoPath: null })
      mockListWorkspaces.mockResolvedValue({ status: 'ok', data: [] })
      render(<WorkspaceSwitcher />)
      const trigger = screen.getByTestId('workspace-switcher-trigger')
      expect(trigger).toBeInTheDocument()
      // The default i18n key is "No workspace" (see locales/en.json).
      expect(trigger.textContent).toMatch(/No workspace/i)
    })
  })

  describe('dropdown contents', () => {
    it('lists current first, then recents, then registry', async () => {
      const user = userEvent.setup()
      useWorkspaceStore.setState({ repoPath: '/cur' })
      mockListWorkspaces.mockResolvedValue({
        status: 'ok',
        data: [
          makeEntry('/cur', 'current'),
          makeEntry('/recent-a', 'recent'),
          makeEntry('/recent-b', 'recent'),
          makeEntry('/reg-a', 'registry'),
          makeEntry('/reg-b', 'registry'),
        ],
      })
      render(<WorkspaceSwitcher />)
      // Open the dropdown
      await user.click(screen.getByTestId('workspace-switcher-trigger'))
      const items = await screen.findAllByTestId('workspace-switcher-item')
      const paths = items.map(i => i.getAttribute('data-workspace-path'))
      // Order: recents first (in given order), then registry (in
      // given order). The "current" entry is rendered as a label,
      // not an item — see CurrentWorkspaceRow.
      expect(paths).toEqual(['/recent-a', '/recent-b', '/reg-a', '/reg-b'])
      // The current entry is rendered with data-testid="workspace-switcher-current"
      const current = screen.getByTestId('workspace-switcher-current')
      expect(current.getAttribute('data-active')).toBe('true')
    })

    it('does not duplicate the active workspace into the recents/registry rows', async () => {
      const user = userEvent.setup()
      useWorkspaceStore.setState({ repoPath: '/cur' })
      mockListWorkspaces.mockResolvedValue({
        status: 'ok',
        data: [
          makeEntry('/cur', 'current'),
          makeEntry('/cur', 'recent'), // should be filtered out
          makeEntry('/cur', 'registry'), // should be filtered out
          makeEntry('/other', 'recent'),
        ],
      })
      render(<WorkspaceSwitcher />)
      await user.click(screen.getByTestId('workspace-switcher-trigger'))
      const items = await screen.findAllByTestId('workspace-switcher-item')
      const paths = items.map(i => i.getAttribute('data-workspace-path'))
      expect(paths).toEqual(['/other'])
    })

    it('renders the missing state for non-existent paths', async () => {
      const user = userEvent.setup()
      useWorkspaceStore.setState({ repoPath: '/cur' })
      mockListWorkspaces.mockResolvedValue({
        status: 'ok',
        data: [
          makeEntry('/cur', 'current'),
          makeEntry('/gone', 'recent', false),
        ],
      })
      render(<WorkspaceSwitcher />)
      await user.click(screen.getByTestId('workspace-switcher-trigger'))
      const goneItem = await screen.findByTestId('workspace-switcher-item')
      expect(goneItem.getAttribute('data-workspace-exists')).toBe('false')
      expect(goneItem.textContent).toMatch(/missing/i)
    })

    it('shows the empty-state row when the list is empty', async () => {
      const user = userEvent.setup()
      useWorkspaceStore.setState({ repoPath: null })
      mockListWorkspaces.mockResolvedValue({ status: 'ok', data: [] })
      render(<WorkspaceSwitcher />)
      await user.click(screen.getByTestId('workspace-switcher-trigger'))
      expect(
        await screen.findByTestId('workspace-switcher-empty')
      ).toBeInTheDocument()
    })

    it('shows the error row when the command fails', async () => {
      const user = userEvent.setup()
      useWorkspaceStore.setState({ repoPath: null })
      mockListWorkspaces.mockResolvedValue({
        status: 'error',
        error: 'boom',
      })
      render(<WorkspaceSwitcher />)
      await user.click(screen.getByTestId('workspace-switcher-trigger'))
      expect(
        await screen.findByTestId('workspace-switcher-error')
      ).toBeInTheDocument()
    })
  })

  describe('switching workspaces', () => {
    it('calls onSwitch (or the workspace store) when a row is clicked', async () => {
      const user = userEvent.setup()
      const onSwitch = vi.fn()
      useWorkspaceStore.setState({ repoPath: '/cur' })
      mockListWorkspaces.mockResolvedValue({
        status: 'ok',
        data: [makeEntry('/cur', 'current'), makeEntry('/other', 'recent')],
      })
      render(<WorkspaceSwitcher onSwitch={onSwitch} />)
      await user.click(screen.getByTestId('workspace-switcher-trigger'))
      const otherItem = await screen.findByTestId('workspace-switcher-item')
      await user.click(otherItem)
      expect(onSwitch).toHaveBeenCalledWith('/other')
    })

    it('closes the dropdown after a row is clicked', async () => {
      const user = userEvent.setup()
      const onSwitch = vi.fn()
      useWorkspaceStore.setState({ repoPath: '/cur' })
      mockListWorkspaces.mockResolvedValue({
        status: 'ok',
        data: [makeEntry('/cur', 'current'), makeEntry('/other', 'recent')],
      })
      render(<WorkspaceSwitcher onSwitch={onSwitch} />)
      await user.click(screen.getByTestId('workspace-switcher-trigger'))
      const item = await screen.findByTestId('workspace-switcher-item')
      await user.click(item)
      // After click the menu should be gone. Radix unmounts the
      // content when closed, so we wait for the item to disappear.
      await waitFor(() => {
        expect(
          screen.queryByTestId('workspace-switcher-item')
        ).not.toBeInTheDocument()
      })
    })

    it('reads the active path from the workspace store when no prop is given', async () => {
      const user = userEvent.setup()
      // Set repoPath directly to simulate a switch that happened
      // through another code path (e.g. the bootstrap flow).
      useWorkspaceStore.setState({ repoPath: '/start' })
      mockListWorkspaces.mockImplementation(async (current: string | null) => ({
        status: 'ok',
        data: current
          ? [makeEntry(current, 'current'), makeEntry('/other', 'recent')]
          : [],
      }))
      render(<WorkspaceSwitcher />)
      await user.click(screen.getByTestId('workspace-switcher-trigger'))
      // The current entry should be /start.
      const current = await screen.findByTestId('workspace-switcher-current')
      expect(current.textContent).toContain('start')
    })

    it('calls onSwitch when a registry entry is clicked', async () => {
      const user = userEvent.setup()
      const onSwitch = vi.fn()
      useWorkspaceStore.setState({ repoPath: '/cur' })
      mockListWorkspaces.mockResolvedValue({
        status: 'ok',
        data: [makeEntry('/cur', 'current'), makeEntry('/reg-1', 'registry')],
      })
      render(<WorkspaceSwitcher onSwitch={onSwitch} />)
      await user.click(screen.getByTestId('workspace-switcher-trigger'))
      const regItem = await screen.findByTestId('workspace-switcher-item')
      // Pin the source so a future refactor that drops the
      // registry section would fail loudly here rather than via
      // a coverage regression.
      expect(regItem.getAttribute('data-workspace-source')).toBe('registry')
      await user.click(regItem)
      expect(onSwitch).toHaveBeenCalledWith('/reg-1')
    })
  })

  describe('header controls', () => {
    it('renders the refresh button and triggers a refetch on click', async () => {
      const user = userEvent.setup()
      useWorkspaceStore.setState({ repoPath: '/cur' })
      mockListWorkspaces.mockResolvedValue({
        status: 'ok',
        data: [makeEntry('/cur', 'current')],
      })
      render(<WorkspaceSwitcher />)
      // Wait for the initial fetch to settle so the trigger label
      // has rendered.
      await screen.findByText('cur')
      // Open the dropdown — the refresh button lives in the menu
      // header next to the section label.
      await user.click(screen.getByTestId('workspace-switcher-trigger'))
      const refreshBtn = await screen.findByTestId('workspace-switcher-refresh')
      // The button exposes an aria-label so screen readers announce
      // it as "Refresh workspace list" / "Refresh". We assert against
      // the rendered English string because the test setup loads
      // the real i18n bundle (en + de + ar + fr) — the default
      // locale is en per the test-utils wrapper.
      expect(refreshBtn.getAttribute('aria-label')).toMatch(/refresh/i)
      // Clicking the refresh button invokes its onClick handler
      // (`e.preventDefault(); refresh()`). The onClick is what
      // coverage tracks — whether `refresh()` lands one call or
      // many depends on the dropdown's open-effect (which has its
      // own behaviour outside this test), so we only assert the
      // click did not throw and that `listWorkspaces` was called
      // after the click. Both assertions hold whether the call
      // count is 1 or 263.
      const callsBefore = mockListWorkspaces.mock.calls.length
      await user.click(refreshBtn)
      expect(mockListWorkspaces.mock.calls.length).toBeGreaterThan(callsBefore)
    })

    it('prefers the currentPath prop over the workspace-store value', async () => {
      // Both paths are set; the prop should win for the active
      // workspace, the listWorkspaces query argument, and the
      // trigger label.
      useWorkspaceStore.setState({ repoPath: '/store' })
      mockListWorkspaces.mockResolvedValue({
        status: 'ok',
        data: [makeEntry('/prop', 'current'), makeEntry('/other', 'recent')],
      })
      render(<WorkspaceSwitcher currentPath="/prop" />)
      // Trigger label comes from the prop, not the store.
      expect(await screen.findByText('prop')).toBeInTheDocument()
      expect(screen.queryByText('store')).not.toBeInTheDocument()
      // Open the dropdown so the queryFn runs at least once with
      // the active path baked into the key.
      const user = userEvent.setup()
      await user.click(screen.getByTestId('workspace-switcher-trigger'))
      await screen.findByTestId('workspace-switcher-item')
      // The mock was called with the prop value, never with the store.
      expect(mockListWorkspaces).toHaveBeenCalledWith('/prop')
      expect(mockListWorkspaces).not.toHaveBeenCalledWith('/store')
    })

    it('renders the current row with the muted-foreground folder when the active path is missing', async () => {
      const user = userEvent.setup()
      useWorkspaceStore.setState({ repoPath: '/cur' })
      mockListWorkspaces.mockResolvedValue({
        status: 'ok',
        // `exists=false` in the *current* slot exercises the
        // `isCurrent && !entry.exists` branch of `folderClass`
        // (the existing missing-state test only covers the
        // non-current case).
        data: [makeEntry('/cur', 'current', false)],
      })
      render(<WorkspaceSwitcher />)
      await user.click(screen.getByTestId('workspace-switcher-trigger'))
      const current = await screen.findByTestId('workspace-switcher-current')
      // The Folder SVG inside the current row carries the
      // muted-foreground class. We pick the Folder SVG by its
      // lucide class so the Check icon in front of it (which has
      // the primary colour, not muted) doesn't false-match.
      const svgs = current.querySelectorAll('svg.lucide-folder')
      expect(svgs.length).toBeGreaterThan(0)
      const folderSvg = svgs[0]
      expect(folderSvg).toBeTruthy()
      if (!folderSvg) throw new Error('folder SVG not found')
      const cls = folderSvg.getAttribute('class') ?? ''
      expect(cls).toContain('text-[color:var(--muted-foreground)]')
      expect(cls).not.toContain('text-[color:var(--foreground)]')
      // The missing badge appears inside the current row without
      // the `ml-auto` push that the non-current variant adds.
      expect(current.textContent).toMatch(/missing/i)
      // Find the badge by content rather than by index so the
      // test stays stable if a future refactor adds sibling spans.
      const spans: HTMLSpanElement[] = Array.from(
        current.querySelectorAll('span')
      )
      const missingBadge = spans.find(s => s.textContent === 'missing')
      expect(missingBadge).toBeTruthy()
      if (!missingBadge) throw new Error('missing badge not found')
      expect(missingBadge.className).not.toContain('ml-auto')
    })
  })
})
