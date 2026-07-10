/**
 * Tests for `ViewsRouter` — the pure-switch component that dispatches
 * the workspace's active view onto the matching subview.
 *
 * Component contract:
 *   1. `useWorkspaceStore.activeView` is the only switch input; the
 *      router itself owns no state.
 *   2. All 13 cases render the matching Subview and pass `cwd` (and
 *      `onOpenIssue` where the subview declares it) by identity.
 *   3. Unknown `activeView` values fall through the `default` branch
 *      and return `null` (the parent owns the empty-state UI).
 *
 * Mocking strategy:
 *   - `useWorkspaceStore`: real, reset in `beforeEach` with both
 *     `setState` (activeView + repoPath) and `persist.clearStorage()`
 *     so localStorage from a prior run never leaks into a fresh test.
 *   - All 12 subview components are stubbed via `vi.mock` to
 *     `data-testid="view-<name>"` containers that capture `cwd`
 *     (rendered as `data-cwd`) and a marker for `onOpenIssue` (as
 *     `data-has-onopen-issue="true|false"`). Stubbing is necessary
 *     because the real components mount full TanStack Query
 *     subscriptions; coverage of those lives in their own focused
 *     test suites (IssueListView.test.tsx, etc.). The point of this
 *     file is the switch wiring in `ViewsRouter.tsx` itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { ViewsRouter } from './ViewsRouter'
import { useWorkspaceStore, type WorkspaceView } from '@/store/workspace-store'

// All 13 cases the switch handles. Used to drive a data-driven
// test below — one it-block per case is fine, but a parametrized
// test makes the contract obvious at a glance and keeps the file
// short.
const ALL_VIEWS: WorkspaceView[] = [
  'list',
  'ready',
  'blocked',
  'search',
  'epic',
  'graph',
  'gates',
  'swarm',
  'sync',
  'worktree',
  'status',
  'raw',
]

// Subviews that receive the `onOpenIssue` prop in addition to
// `cwd`. The rest only get `cwd`.
const VIEWS_WITH_ONOPEN: ReadonlySet<WorkspaceView> = new Set<WorkspaceView>([
  'list',
  'epic',
  'graph',
  'gates',
])

// Default `onOpenIssue` for tests where the prop isn't actually
// exercised (the router just forwards it to the stub, which
// neither uses nor asserts on it). A `vi.fn()` silences
// `@typescript-eslint/no-empty-function` while keeping a real
// identity in case a future test wants to assert it was forwarded.
const noop = vi.fn<(id: string) => void>()

// `vi.mock` factories run before module load, so referencing the
// real subviews from the SUT requires the same aliased path the
// SUT uses. Each factory returns a stub component that accepts the
// documented prop shape and renders a `data-testid` so the test
// can assert "the right branch ran" without depending on the real
// subview's internals.
vi.mock('@/components/beads/issues/IssueListView', () => ({
  IssueListView: ({
    cwd,
    onOpenIssue,
  }: {
    cwd: string
    onOpenIssue: (id: string) => void
  }) => (
    <div
      data-testid="view-list"
      data-cwd={cwd}
      data-has-onopen-issue={typeof onOpenIssue}
    />
  ),
}))

vi.mock('@/components/beads/issues/ReadyView', () => ({
  ReadyView: ({ cwd }: { cwd: string }) => (
    <div data-testid="view-ready" data-cwd={cwd} />
  ),
}))

vi.mock('@/components/beads/issues/BlockedView', () => ({
  BlockedView: ({ cwd }: { cwd: string }) => (
    <div data-testid="view-blocked" data-cwd={cwd} />
  ),
}))

vi.mock('@/components/beads/issues/SearchView', () => ({
  SearchView: ({ cwd }: { cwd: string }) => (
    <div data-testid="view-search" data-cwd={cwd} />
  ),
}))

vi.mock('@/components/beads/views/EpicView', () => ({
  EpicView: ({
    cwd,
    onOpenIssue,
  }: {
    cwd: string
    onOpenIssue: (id: string) => void
  }) => (
    <div
      data-testid="view-epic"
      data-cwd={cwd}
      data-has-onopen-issue={typeof onOpenIssue}
    />
  ),
}))

vi.mock('@/components/beads/views/DepGraphView', () => ({
  DepGraphView: ({
    cwd,
    onOpenIssue,
  }: {
    cwd: string
    onOpenIssue: (id: string) => void
  }) => (
    <div
      data-testid="view-graph"
      data-cwd={cwd}
      data-has-onopen-issue={typeof onOpenIssue}
    />
  ),
}))

vi.mock('@/components/beads/views/GatesView', () => ({
  GatesView: ({
    cwd,
    onOpenIssue,
  }: {
    cwd: string
    onOpenIssue: (id: string) => void
  }) => (
    <div
      data-testid="view-gates"
      data-cwd={cwd}
      data-has-onopen-issue={typeof onOpenIssue}
    />
  ),
}))

// The next three are stub `EmptyState` views in v1 (no test file
// of their own). They MUST still be mocked here so the router
// doesn't pull in `lucide-react` icons that the test runner
// sometimes trips on, and so the testid map stays consistent with
// the 13 documented branches.
vi.mock('@/components/beads/views/SwarmView', () => ({
  SwarmView: ({ cwd }: { cwd: string }) => (
    <div data-testid="view-swarm" data-cwd={cwd} />
  ),
}))

vi.mock('@/components/beads/views/SyncStatusView', () => ({
  SyncStatusView: ({ cwd }: { cwd: string }) => (
    <div data-testid="view-sync" data-cwd={cwd} />
  ),
}))

vi.mock('@/components/beads/views/WorktreeListView', () => ({
  WorktreeListView: ({ cwd }: { cwd: string }) => (
    <div data-testid="view-worktree" data-cwd={cwd} />
  ),
}))

vi.mock('@/components/beads/views/StatusOverviewView', () => ({
  StatusOverviewView: ({ cwd }: { cwd: string }) => (
    <div data-testid="view-status" data-cwd={cwd} />
  ),
}))

vi.mock('@/components/beads/raw/RawCommandPanel', () => ({
  RawCommandPanel: ({ cwd }: { cwd: string }) => (
    <div data-testid="view-raw" data-cwd={cwd} />
  ),
}))

beforeEach(() => {
  // ponytail: the store carries `persist` middleware, so a previous
  // test's localStorage entry can sneak into the next test via
  // rehydration. Clear it before every run.
  useWorkspaceStore.persist.clearStorage()
  useWorkspaceStore.setState({
    repoPath: '/fake/repo',
    activeView: 'list',
    selectedIssueId: null,
    selectedRowId: null,
  })
})

describe('ViewsRouter — per-view dispatch', () => {
  it.each(ALL_VIEWS)('mounts the matching subview for activeView=%s', view => {
    useWorkspaceStore.setState({ activeView: view })
    const { container } = render(
      <ViewsRouter cwd="/fake/repo" onOpenIssue={noop} />
    )

    // The matching branch's stub is in the DOM.
    const subview = screen.getByTestId(`view-${view}`)
    expect(subview).toBeInTheDocument()

    // Every other branch's stub is NOT rendered (the switch fell
    // through the right case and broke out of the component).
    for (const other of ALL_VIEWS) {
      if (other === view) continue
      expect(screen.queryByTestId(`view-${other}`)).toBeNull()
    }

    // `cwd` is forwarded verbatim by identity.
    expect(subview.getAttribute('data-cwd')).toBe('/fake/repo')

    // `onOpenIssue` is present iff the case declares it. The stubs
    // for subviews WITHOUT the prop don't render a
    // `data-has-onopen-issue` attribute at all, so a missing attr
    // and an explicit `'function'` value are the two valid
    // outcomes.
    if (VIEWS_WITH_ONOPEN.has(view)) {
      expect(subview.getAttribute('data-has-onopen-issue')).toBe('function')
    } else {
      expect(subview.getAttribute('data-has-onopen-issue')).toBeNull()
    }
    expect(container.firstChild).not.toBeNull()
  })
})

describe('ViewsRouter — default branch', () => {
  it('returns null for an unknown activeView (container is empty)', () => {
    // Cast through unknown so we can plant a value the switch
    // never matches. The TS type for `activeView` is the closed
    // union; the runtime check (the `default:` arm) is the
    // safety net we're covering here.
    useWorkspaceStore.setState({
      activeView: 'totally-unknown-view' as unknown as WorkspaceView,
    })
    const { container } = render(
      <ViewsRouter cwd="/fake/repo" onOpenIssue={noop} />
    )

    // No subview stub is in the DOM.
    for (const view of ALL_VIEWS) {
      expect(screen.queryByTestId(`view-${view}`)).toBeNull()
    }
    // Component returns `null` → nothing mounted under the container.
    expect(container.firstChild).toBeNull()
  })
})

describe('ViewsRouter — prop identity', () => {
  it('forwards cwd by identity to a subview that takes both props (list)', () => {
    useWorkspaceStore.setState({ activeView: 'list' })
    const cwd = '/identity/cwd/path'
    const onOpenIssue = vi.fn()
    render(<ViewsRouter cwd={cwd} onOpenIssue={onOpenIssue} />)

    const subview = screen.getByTestId('view-list')
    expect(subview.getAttribute('data-cwd')).toBe(cwd)
    // The stub typed the prop with `typeof onOpenIssue` so identity
    // surfaces as a string. `function` proves it was forwarded (not
    // a re-wrapped proxy) — that's the most we can assert from a
    // stub without breaking the SUT's interface.
    expect(subview.getAttribute('data-has-onopen-issue')).toBe('function')
  })

  it('forwards cwd by identity to a subview that takes only cwd (ready)', () => {
    useWorkspaceStore.setState({ activeView: 'ready' })
    const cwd = '/identity/cwd/ready'
    render(<ViewsRouter cwd={cwd} onOpenIssue={noop} />)

    const subview = screen.getByTestId('view-ready')
    expect(subview.getAttribute('data-cwd')).toBe(cwd)
  })

  it("omits the onOpenIssue prop on subviews that don't accept it (ready)", () => {
    useWorkspaceStore.setState({ activeView: 'ready' })
    render(<ViewsRouter cwd="/fake/repo" onOpenIssue={noop} />)

    // `view-ready` stub renders no `data-has-onopen-issue` attribute
    // because `ReadyView`'s prop type doesn't include `onOpenIssue`.
    expect(
      screen.getByTestId('view-ready').getAttribute('data-has-onopen-issue')
    ).toBeNull()
  })

  it('forwards cwd by identity to a subview that takes both props (epic)', () => {
    useWorkspaceStore.setState({ activeView: 'epic' })
    const cwd = '/identity/cwd/epic'
    render(<ViewsRouter cwd={cwd} onOpenIssue={noop} />)

    const subview = screen.getByTestId('view-epic')
    expect(subview.getAttribute('data-cwd')).toBe(cwd)
    expect(subview.getAttribute('data-has-onopen-issue')).toBe('function')
  })

  it('forwards cwd by identity to a subview that takes both props (graph)', () => {
    useWorkspaceStore.setState({ activeView: 'graph' })
    const cwd = '/identity/cwd/graph'
    render(<ViewsRouter cwd={cwd} onOpenIssue={noop} />)

    const subview = screen.getByTestId('view-graph')
    expect(subview.getAttribute('data-cwd')).toBe(cwd)
    expect(subview.getAttribute('data-has-onopen-issue')).toBe('function')
  })

  it('forwards cwd by identity to a subview that takes both props (gates)', () => {
    useWorkspaceStore.setState({ activeView: 'gates' })
    const cwd = '/identity/cwd/gates'
    render(<ViewsRouter cwd={cwd} onOpenIssue={noop} />)

    const subview = screen.getByTestId('view-gates')
    expect(subview.getAttribute('data-cwd')).toBe(cwd)
    expect(subview.getAttribute('data-has-onopen-issue')).toBe('function')
  })

  it('forwards cwd by identity to a stub-only subview (swarm)', () => {
    useWorkspaceStore.setState({ activeView: 'swarm' })
    const cwd = '/identity/cwd/swarm'
    render(<ViewsRouter cwd={cwd} onOpenIssue={noop} />)

    const subview = screen.getByTestId('view-swarm')
    expect(subview.getAttribute('data-cwd')).toBe(cwd)
  })

  it('forwards cwd by identity to a stub-only subview (sync)', () => {
    useWorkspaceStore.setState({ activeView: 'sync' })
    const cwd = '/identity/cwd/sync'
    render(<ViewsRouter cwd={cwd} onOpenIssue={noop} />)

    const subview = screen.getByTestId('view-sync')
    expect(subview.getAttribute('data-cwd')).toBe(cwd)
  })

  it('forwards cwd by identity to a stub-only subview (worktree)', () => {
    useWorkspaceStore.setState({ activeView: 'worktree' })
    const cwd = '/identity/cwd/worktree'
    render(<ViewsRouter cwd={cwd} onOpenIssue={noop} />)

    const subview = screen.getByTestId('view-worktree')
    expect(subview.getAttribute('data-cwd')).toBe(cwd)
  })
})
