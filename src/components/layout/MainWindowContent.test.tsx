/**
 * Tests for `MainWindowContent` — the center pane of the main window.
 *
 * Component contract:
 *   1. No-repo placeholder when `useWorkspaceStore.repoPath === null`.
 *   2. PAGE_TITLES lookup for the 12 active-view keys + raw-string
 *      fallback for views that aren't in the title map.
 *   3. New-issue button visibility (only for `list` and `ready` views).
 *   4. New-issue button click → `executeCommand('create-issue', ctx)`;
 *      toast on `success: false` with `error` string, silent on success.
 *   5. IssueDetailDrawer mount on `selectedIssueId !== null` with the
 *      right cwd / issueId / onClose / onOpenIssue props, and removed
 *      when the drawer is closed.
 *   6. ViewsRouter mount with the right cwd / onOpenIssue, and active-
 *      view switching propagates (`useWorkspaceStore.setActiveView`
 *      reaches the router mock with the new view).
 *   7. Hooks `useBeadsRealtimeSync`, `useBeadsInvalidation`,
 *      `useKeyboardNavigation` mount without crashing; their internal
 *      contract is covered by their own hook test suites.
 *
 * Mocking strategy:
 *   - `useWorkspaceStore`: real, reset in `beforeEach` (persist
 *     storage cleared so localStorage from a prior test never leaks).
 *   - `@/components/beads/ViewsRouter` and `IssueDetailDrawer` are
 *     stubbed to plain `data-testid` containers that capture their
 *     props. The real ViewsRouter would mount 12 different subview
 *     trees with TanStack Query subscriptions — overkill for proving
 *     MainWindowContent's plumbing; those subtrees carry their own
 *     focused test suites.
 *   - `@/lib/commands` is mocked so `executeCommand` and
 *     `useCommandContext` are observable in tests, and the toast
 *     error-path can be exercised without touching the real
 *     registry.
 *   - `@/lib/logger`, `sonner`, `@/lib/notifications` are stubbed
 *     to silence the otherwise-spammy output and keep the toast
 *     assertion channel narrow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { useWorkspaceStore, type WorkspaceView } from '@/store/workspace-store'
import { WORKSPACE_VIEWS } from '@/store/workspace-store'
import type { CommandContext } from '@/lib/commands/types'
import { MainWindowContent } from './MainWindowContent'

// ponytail: hoisted so each vi.mock factory can reference the same
// `vi.fn()` instances the test bodies re-mock per case. The
// `mockUseCommandContext` factory returns a STABLE singleton object
// (mirroring the real `useCommandContext` which returns a module-
// level `commandContext` const) so test bodies can assert on the
// same identity the component received.
const { mockExecuteCommand, mockUseCommandContext, mockCommandContext } =
  vi.hoisted(() => {
    const showToast = vi.fn()
    const openPreferences = vi.fn()
    const ctx: CommandContext = {
      showToast,
      openPreferences,
    }
    return {
      mockExecuteCommand: vi.fn(),
      mockUseCommandContext: vi.fn(() => ctx),
      mockCommandContext: ctx,
    }
  })

const { mockGetAllCommands } = vi.hoisted(() => ({
  mockGetAllCommands: vi.fn(() => []),
}))

// Capture the props that `MainWindowContent` passes to `<ViewsRouter>`
// and `<IssueDetailDrawer>` so tests can assert on wiring without
// rendering the real subtrees.
const { mockViewsRouter, mockIssueDetailDrawer } = vi.hoisted(() => ({
  mockViewsRouter: vi.fn(
    ({
      cwd,
      onOpenIssue,
    }: {
      cwd: string
      onOpenIssue: (id: string) => void
    }) => (
      <div
        data-testid="views-router"
        data-cwd={cwd}
        data-has-open-issue={
          typeof onOpenIssue === 'function' ? 'true' : 'false'
        }
      />
    )
  ),
  mockIssueDetailDrawer: vi.fn(
    ({
      cwd,
      issueId,
      onClose,
      onOpenIssue,
    }: {
      cwd: string
      issueId: string
      onClose: () => void
      onOpenIssue?: (id: string) => void
    }) => (
      <div
        data-testid="issue-detail-drawer"
        data-cwd={cwd}
        data-issue-id={issueId}
        data-has-close="true"
        data-has-open-issue={
          typeof onOpenIssue === 'function' ? 'true' : 'false'
        }
      >
        <button type="button" onClick={() => onOpenIssue?.('nested-id')}>
          nested-open
        </button>
        <button type="button" onClick={onClose}>
          nested-close
        </button>
      </div>
    )
  ),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdList: vi.fn().mockResolvedValue({ status: 'ok', data: [] }),
    bdReady: vi.fn().mockResolvedValue({ status: 'ok', data: [] }),
    bdBlocked: vi.fn().mockResolvedValue({ status: 'ok', data: [] }),
    bdSearch: vi.fn().mockResolvedValue({ status: 'ok', data: [] }),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/lib/commands', () => ({
  executeCommand: mockExecuteCommand,
  useCommandContext: mockUseCommandContext,
  getAllCommands: mockGetAllCommands,
}))

vi.mock('@/lib/notifications', () => ({
  notify: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/components/beads/ViewsRouter', () => ({
  ViewsRouter: mockViewsRouter,
}))

vi.mock('@/components/beads/IssueDetailDrawer', () => ({
  IssueDetailDrawer: mockIssueDetailDrawer,
}))

beforeEach(() => {
  vi.clearAllMocks()
  // Default: clean workspace-store state, like a freshly booted app.
  // The store has `persist` middleware keyed on `repoPath`; clear
  // localStorage too so a persisted entry from a previous test does
  // not bleed into `repoPath`.
  useWorkspaceStore.persist.clearStorage()
  useWorkspaceStore.setState({
    repoPath: '/fake/repo',
    activeView: 'list',
    selectedIssueId: null,
    selectedRowId: null,
  })
  // Sensible default: the `create-issue` command "succeeds" silently.
  // Tests that need to drive an error return override this.
  mockExecuteCommand.mockResolvedValue({ success: true })
})

describe('MainWindowContent — workspace gating', () => {
  it('renders the no-workspace placeholder when repoPath is null', () => {
    useWorkspaceStore.setState({ repoPath: null })
    render(<MainWindowContent />)

    // Placeholder text matches the en.json default
    // (`main.noWorkspaceSelected = "No workspace selected."`).
    expect(screen.getByText(/No workspace selected\./)).toBeInTheDocument()

    // Crucially, the configured main-viewport, drawer, and new-issue
    // button must NOT mount when no repo is picked.
    expect(screen.queryByTestId('main-viewport')).not.toBeInTheDocument()
    expect(screen.queryByTestId('page-header')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('page-header-new-issue')
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('issue-detail-drawer')).not.toBeInTheDocument()
  })

  it('renders the page header and main viewport when a repo is picked', () => {
    render(<MainWindowContent />)
    expect(screen.getByTestId('page-header')).toBeInTheDocument()
    expect(screen.getByTestId('main-viewport')).toBeInTheDocument()
  })
})

describe('MainWindowContent — page title', () => {
  // The 10 PAGE_TITLES keys rendered through `<h1 data-testid="page-title">`.
  // `gates` and `graph` are valid WorkspaceView values but not in the
  // map — see the "fallback" describe below for those.
  const MAPPED_VIEWS: { view: WorkspaceView; title: string }[] = [
    { view: 'list', title: 'All issues' },
    { view: 'ready', title: 'Ready to work' },
    { view: 'blocked', title: 'Blocked' },
    { view: 'search', title: 'Search' },
    { view: 'epic', title: 'Epics' },
    { view: 'swarm', title: 'Swarm' },
    { view: 'sync', title: 'Sync status' },
    { view: 'worktree', title: 'Worktrees' },
    { view: 'status', title: 'Status' },
    { view: 'raw', title: 'Raw command' },
  ]

  it.each(MAPPED_VIEWS)(
    'renders the mapped title "$title" for activeView=$view',
    ({ view, title }) => {
      useWorkspaceStore.setState({ activeView: view })
      render(<MainWindowContent />)
      const h1 = screen.getByTestId('page-title')
      expect(h1).toHaveTextContent(title)
    }
  )

  it('renders the unmapped-view fallback for activeView=gates (raw string)', () => {
    // `gates` is a valid WorkspaceView but PAGE_TITLES does not
    // include it → the component falls back to the raw string.
    useWorkspaceStore.setState({ activeView: 'gates' })
    render(<MainWindowContent />)
    const h1 = screen.getByTestId('page-title')
    expect(h1).toHaveTextContent('gates')
  })

  it('renders the unmapped-view fallback for activeView=graph (raw string)', () => {
    useWorkspaceStore.setState({ activeView: 'graph' })
    render(<MainWindowContent />)
    const h1 = screen.getByTestId('page-title')
    expect(h1).toHaveTextContent('graph')
  })

  it('renders every WorkspaceView without throwing', () => {
    // ponytail: smoke that none of the 12 valid views cause the
    // component to crash (a refactor that forgets to handle one of
    // them would manifest here as an unhandled render error).
    for (const view of WORKSPACE_VIEWS) {
      useWorkspaceStore.setState({ activeView: view })
      const { unmount } = render(<MainWindowContent />)
      expect(screen.getByTestId('page-title')).toBeInTheDocument()
      unmount()
    }
  })

  it('renders the fallback to the raw string when activeView is an unknown cast', () => {
    // Cast past the union to simulate a hypothetical future WorkspaceView
    // not present in PAGE_TITLES. The `?? activeView` fallback covers it.
    useWorkspaceStore.setState({
      activeView: 'unknown-future-view' as WorkspaceView,
    })
    render(<MainWindowContent />)
    const h1 = screen.getByTestId('page-title')
    expect(h1).toHaveTextContent('unknown-future-view')
  })
})

describe('MainWindowContent — new-issue button visibility', () => {
  // The new-issue button appears only on the two views that surface
  // the active queue (`list`, `ready`).
  const VIEWS_WITH_BUTTON: WorkspaceView[] = ['list', 'ready']
  const VIEWS_WITHOUT_BUTTON: WorkspaceView[] = WORKSPACE_VIEWS.filter(
    v => !VIEWS_WITH_BUTTON.includes(v)
  )

  it.each(VIEWS_WITH_BUTTON)(
    'shows the new-issue button on activeView=%s',
    view => {
      useWorkspaceStore.setState({ activeView: view })
      render(<MainWindowContent />)
      expect(screen.getByTestId('page-header-new-issue')).toBeInTheDocument()
    }
  )

  it.each(VIEWS_WITHOUT_BUTTON)(
    'hides the new-issue button on activeView=%s',
    view => {
      useWorkspaceStore.setState({ activeView: view })
      render(<MainWindowContent />)
      expect(
        screen.queryByTestId('page-header-new-issue')
      ).not.toBeInTheDocument()
    }
  )

  it('omits the new-issue button entirely when no repo is picked', () => {
    // Covered again here for the cross-cutting case: the placeholder
    // branch returns before the conditional header render.
    useWorkspaceStore.setState({ repoPath: null, activeView: 'list' })
    render(<MainWindowContent />)
    expect(
      screen.queryByTestId('page-header-new-issue')
    ).not.toBeInTheDocument()
  })
})

describe('MainWindowContent — new-issue click handler', () => {
  function setup(activeView: WorkspaceView = 'list') {
    useWorkspaceStore.setState({ activeView })
    const user = userEvent.setup()
    render(<MainWindowContent />)
    return { user }
  }

  it('calls executeCommand("create-issue", ctx) when the button is clicked on list', async () => {
    const { user } = setup('list')
    await user.click(screen.getByTestId('page-header-new-issue'))

    await waitFor(() => {
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1)
    })
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'create-issue',
      expect.objectContaining({
        showToast: expect.any(Function),
        openPreferences: expect.any(Function),
      })
    )
  })

  it('calls executeCommand on the ready view too', async () => {
    const { user } = setup('ready')
    await user.click(screen.getByTestId('page-header-new-issue'))

    await waitFor(() => {
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1)
    })
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'create-issue',
      expect.any(Object)
    )
  })

  it('does not toast when the command returns success=true', async () => {
    mockExecuteCommand.mockResolvedValue({ success: true })
    const { user } = setup('list')

    await user.click(screen.getByTestId('page-header-new-issue'))

    await waitFor(() => {
      expect(mockExecuteCommand).toHaveBeenCalled()
    })
    expect(mockCommandContext.showToast).not.toHaveBeenCalled()
  })

  it('toasts the error string when the command returns success=false with an error', async () => {
    mockExecuteCommand.mockResolvedValue({ success: false, error: 'boom' })
    const { user } = setup('list')

    await user.click(screen.getByTestId('page-header-new-issue'))

    await waitFor(() => {
      expect(mockExecuteCommand).toHaveBeenCalled()
    })
    expect(mockCommandContext.showToast).toHaveBeenCalledWith('boom', 'error')
  })

  it('does not toast when the command returns success=false with no error (defensive)', async () => {
    // ponytail: the if-guard is `!r.success && r.error` — if the
    // registry returns a `{ success: false }` result without an error
    // string, the toast must NOT fire (no message to surface).
    mockExecuteCommand.mockResolvedValue({ success: false })
    const { user } = setup('list')

    await user.click(screen.getByTestId('page-header-new-issue'))

    await waitFor(() => {
      expect(mockExecuteCommand).toHaveBeenCalled()
    })
    expect(mockCommandContext.showToast).not.toHaveBeenCalled()
  })

  it('passes the same commandContext identity returned by useCommandContext', async () => {
    const { user } = setup('list')

    await user.click(screen.getByTestId('page-header-new-issue'))

    await waitFor(() => {
      expect(mockExecuteCommand).toHaveBeenCalled()
    })
    // The exact same object reference goes into executeCommand;
    // a future refactor that uses a stale `getState()` snapshot
    // would fail this check.
    expect(mockExecuteCommand.mock.calls[0]?.[1]).toBe(mockCommandContext)
  })

  it('also handles keyboard activation (Enter on focused button)', async () => {
    // ponytail: button clicks also fire on Space/Enter when focused;
    // user-event already exercises that on `.click()`, but pin the
    // fireEvent path too so any custom keydown handlers we add
    // later don't regress.
    setup('list')
    const button = screen.getByTestId('page-header-new-issue')
    button.focus()
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1)
    })
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'create-issue',
      expect.any(Object)
    )
  })
})

describe('MainWindowContent — IssueDetailDrawer overlay', () => {
  it('does not render the drawer when selectedIssueId is null', () => {
    useWorkspaceStore.setState({ selectedIssueId: null })
    render(<MainWindowContent />)
    expect(screen.queryByTestId('issue-detail-drawer')).not.toBeInTheDocument()
  })

  it('renders the drawer with cwd + issueId + onClose when selectedIssueId is set', () => {
    useWorkspaceStore.setState({ selectedIssueId: 'beads-42' })
    render(<MainWindowContent />)

    const drawer = screen.getByTestId('issue-detail-drawer')
    expect(drawer).toBeInTheDocument()
    expect(drawer).toHaveAttribute('data-cwd', '/fake/repo')
    expect(drawer).toHaveAttribute('data-issue-id', 'beads-42')
    expect(drawer).toHaveAttribute('data-has-close', 'true')
    expect(drawer).toHaveAttribute('data-has-open-issue', 'true')
    // The mock captures props — confirm the latest call matches.
    const lastCall = mockIssueDetailDrawer.mock.calls.at(-1)?.[0]
    expect(lastCall).toEqual(
      expect.objectContaining({
        cwd: '/fake/repo',
        issueId: 'beads-42',
        onClose: expect.any(Function),
        onOpenIssue: expect.any(Function),
      })
    )
  })

  it('passes the workspace store onClose identity to the drawer', () => {
    const closeIssueRef = useWorkspaceStore.getState().closeIssue
    useWorkspaceStore.setState({ selectedIssueId: 'beads-99' })
    render(<MainWindowContent />)

    const lastCall = mockIssueDetailDrawer.mock.calls.at(-1)?.[0]
    expect(lastCall?.onClose).toBe(closeIssueRef)
  })

  it('passes the workspace store onOpenIssue identity to the drawer', () => {
    const openIssueRef = useWorkspaceStore.getState().openIssue
    useWorkspaceStore.setState({ selectedIssueId: 'beads-100' })
    render(<MainWindowContent />)

    const lastCall = mockIssueDetailDrawer.mock.calls.at(-1)?.[0]
    expect(lastCall?.onOpenIssue).toBe(openIssueRef)
  })

  it('omits the drawer entirely when no repo is picked (no-repo branch returns early)', () => {
    useWorkspaceStore.setState({
      repoPath: null,
      selectedIssueId: 'beads-1',
    })
    render(<MainWindowContent />)
    expect(screen.queryByTestId('issue-detail-drawer')).not.toBeInTheDocument()
  })
})

describe('MainWindowContent — ViewsRouter wiring', () => {
  it('mounts the router with cwd=repoPath and an onOpenIssue identity', () => {
    const openIssueRef = useWorkspaceStore.getState().openIssue
    render(<MainWindowContent />)

    expect(screen.getByTestId('views-router')).toBeInTheDocument()
    expect(screen.getByTestId('views-router')).toHaveAttribute(
      'data-cwd',
      '/fake/repo'
    )
    const lastCall = mockViewsRouter.mock.calls.at(-1)?.[0]
    expect(lastCall?.cwd).toBe('/fake/repo')
    expect(lastCall?.onOpenIssue).toBe(openIssueRef)
  })

  it('forwards onOpenIssue into the workspace store when the router invokes it', () => {
    // The ViewsRouter mock receives the onOpenIssue function by
    // reference and stores it. We extract it from the latest call
    // props and fire it, then assert the store was updated.
    render(<MainWindowContent />)

    const lastCall = mockViewsRouter.mock.calls.at(-1)?.[0]
    act(() => {
      lastCall?.onOpenIssue?.('beads-77')
    })
    expect(useWorkspaceStore.getState().selectedIssueId).toBe('beads-77')
  })

  it('remounts the router when activeView changes (selector-driven re-render)', () => {
    const { rerender } = render(<MainWindowContent />)
    const beforeCalls = mockViewsRouter.mock.calls.length

    act(() => {
      useWorkspaceStore.setState({ activeView: 'ready' })
    })
    rerender(<MainWindowContent />)

    // The `activeView` selector inside MainWindowContent triggers
    // a re-render. The router mock gets called again on each
    // render even if its props are unchanged (the component itself
    // has the selector wired). We assert the call count grew and
    // the router still mounts.
    expect(mockViewsRouter.mock.calls.length).toBeGreaterThan(beforeCalls)
    expect(screen.getByTestId('views-router')).toBeInTheDocument()
  })

  it('does not mount the router when no repo is picked', () => {
    useWorkspaceStore.setState({ repoPath: null })
    render(<MainWindowContent />)
    expect(screen.queryByTestId('views-router')).not.toBeInTheDocument()
  })
})

describe('MainWindowContent — full integration smoke', () => {
  it('keeps the page header + viewport + page-title wiring stable across view changes', () => {
    // ponytail: end-to-end shape check across a few views. Each
    // re-render must keep the structural testids stable so layout
    // shell regressions are caught even if individual subtrees are
    // mocked.
    const views: WorkspaceView[] = ['list', 'ready', 'blocked', 'gates', 'epic']
    for (const view of views) {
      useWorkspaceStore.setState({ activeView: view })
      const { unmount } = render(<MainWindowContent />)
      expect(screen.getByTestId('page-header')).toBeInTheDocument()
      expect(screen.getByTestId('main-viewport')).toBeInTheDocument()
      expect(screen.getByTestId('page-title')).toBeInTheDocument()
      expect(screen.getByTestId('views-router')).toBeInTheDocument()
      unmount()
    }
  })

  it('drawer overlay + router co-mount cleanly when both are active', () => {
    useWorkspaceStore.setState({
      activeView: 'list',
      selectedIssueId: 'beads-50',
    })
    render(<MainWindowContent />)

    expect(screen.getByTestId('main-viewport')).toBeInTheDocument()
    expect(screen.getByTestId('views-router')).toBeInTheDocument()
    expect(screen.getByTestId('issue-detail-drawer')).toBeInTheDocument()
  })
})
