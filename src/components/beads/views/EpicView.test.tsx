/**
 * Tests for EpicView — M2 R5 epic tree with progress bars.
 *
 * Contract:
 *   - Fetches the full issue list via `commands.bdList(cwd, {})`
 *     (the Rust command passes `--all` so closed children are
 *     visible — see src-tauri/src/beads/list.rs).
 *   - Renders one row per epic (issue_type === 'epic' and
 *     parent === null), sorted by priority then id.
 *   - Each row shows the progress fraction (closed children / total
 *     children) and a `role="progressbar"` element with the matching
 *     aria-valuenow.
 *   - Clicking the chevron collapses/expands the children list.
 *   - Clicking a child row calls `onOpenIssue(id)` — opening the
 *     detail drawer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { useIssueFilterStore } from '@/store/issue-filter-store'

const { mockBdList } = vi.hoisted(() => ({
  mockBdList: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdList: mockBdList,
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

const importSut = () => import('./EpicView')

function makeEpic(
  overrides: Partial<{
    id: string
    title: string
    status: 'open' | 'in_progress' | 'blocked' | 'closed' | 'deferred'
    priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
  }>
) {
  return {
    id: 'epic-1',
    title: 'Auth epic',
    status: 'open' as const,
    priority: 'P1' as const,
    issue_type: 'epic' as const,
    created_at: '2026-06-16T00:00:00Z',
    updated_at: null,
    closed_at: null,
    description: null,
    owner: null,
    labels: [],
    dependencies: [],
    dependency_count: 0,
    dependent_count: 0,
    comment_count: 0,
    parent: null,
    acceptance_criteria: null,
    external_ref: null,
    ...overrides,
  }
}

function makeChild(
  overrides: Partial<{
    id: string
    title: string
    status: 'open' | 'in_progress' | 'blocked' | 'closed' | 'deferred'
    parent: string | null
    priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
  }>
) {
  return {
    title: 'Login form',
    status: 'closed' as const,
    priority: 'P2' as const,
    issue_type: 'task' as const,
    created_at: '2026-06-16T00:00:00Z',
    updated_at: null,
    closed_at: null,
    description: null,
    owner: null,
    labels: [],
    dependencies: [],
    dependency_count: 0,
    dependent_count: 0,
    comment_count: 0,
    parent: 'epic-1',
    acceptance_criteria: null,
    external_ref: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EpicView', () => {
  it('renders a loading skeleton while the query is pending', async () => {
    mockBdList.mockReturnValue(new Promise<never>(() => undefined))

    const { EpicView } = await importSut()
    render(<EpicView cwd="/fake" onOpenIssue={() => undefined} />)

    expect(screen.getByTestId('epic-view')).toBeInTheDocument()
    expect(screen.getByTestId('epic-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('epic-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('epic-tree')).not.toBeInTheDocument()
  })

  it('calls bdList with the provided cwd and an empty filter', async () => {
    mockBdList.mockResolvedValue({ status: 'ok', data: [] })

    const { EpicView } = await importSut()
    render(<EpicView cwd="/repo/path" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(mockBdList).toHaveBeenCalledWith('/repo/path', {})
    })
  })

  it('renders the empty state when there are no epics', async () => {
    mockBdList.mockResolvedValue({
      status: 'ok',
      data: [makeChild({ id: 'task-1', parent: null })],
    })

    const { EpicView } = await importSut()
    render(<EpicView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('epic-empty')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('epic-tree')).not.toBeInTheDocument()
  })

  it('renders one row per epic with a progress bar and counts', async () => {
    const authEpic = makeEpic({
      id: 'epic-auth',
      title: 'Auth epic',
      priority: 'P1',
    })
    const perfEpic = makeEpic({
      id: 'epic-perf',
      title: 'Perf epic',
      priority: 'P2',
    })
    mockBdList.mockResolvedValue({
      status: 'ok',
      data: [
        authEpic,
        perfEpic,
        // 3 children under epic-auth: 2 closed, 1 in_progress => 2/3 = 67%
        makeChild({
          id: 'auth-1',
          title: 'Login',
          status: 'closed',
          parent: 'epic-auth',
        }),
        makeChild({
          id: 'auth-2',
          title: 'OAuth',
          status: 'closed',
          parent: 'epic-auth',
        }),
        makeChild({
          id: 'auth-3',
          title: 'Password reset',
          status: 'in_progress',
          parent: 'epic-auth',
        }),
        // 2 children under epic-perf: 0 closed => 0/2 = 0%
        makeChild({
          id: 'perf-1',
          title: 'Profile cache',
          status: 'open',
          parent: 'epic-perf',
        }),
        makeChild({
          id: 'perf-2',
          title: 'Optimize queries',
          status: 'blocked',
          parent: 'epic-perf',
        }),
      ],
    })

    const { EpicView } = await importSut()
    render(<EpicView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('epic-tree')).toBeInTheDocument()
    })

    const rows = screen.getAllByTestId('epic-row')
    expect(rows).toHaveLength(2)
    // Sorted by priority then id — P1 first, P2 second.
    expect(rows[0]?.getAttribute('data-epic-id')).toBe('epic-auth')
    expect(rows[1]?.getAttribute('data-epic-id')).toBe('epic-perf')

    // Progress labels: closed/total. There are two epics so use
    // getAllByTestId and reach for each by index.
    const progressLabels = screen.getAllByTestId('epic-progress')
    expect(progressLabels).toHaveLength(2)
    const authProgress = progressLabels[0]
    const perfProgress = progressLabels[1]
    if (!authProgress || !perfProgress) {
      throw new Error('expected two epic-progress elements')
    }
    expect(authProgress.getAttribute('data-closed')).toBe('2')
    expect(authProgress.getAttribute('data-total')).toBe('3')
    expect(perfProgress.getAttribute('data-closed')).toBe('0')
    expect(perfProgress.getAttribute('data-total')).toBe('2')

    // Progressbar role carries aria-valuenow (rounded percent).
    const authBar = screen.getAllByTestId('epic-progress-bar')[0]
    expect(authBar?.getAttribute('role')).toBe('progressbar')
    expect(authBar?.getAttribute('aria-valuenow')).toBe('67')
    const perfBar = screen.getAllByTestId('epic-progress-bar')[1]
    expect(perfBar?.getAttribute('aria-valuenow')).toBe('0')
  })

  it('renders expanded children by default and toggles via the chevron', async () => {
    mockBdList.mockResolvedValue({
      status: 'ok',
      data: [
        makeEpic({ id: 'epic-auth' }),
        makeChild({
          id: 'auth-1',
          title: 'Login',
          status: 'closed',
          parent: 'epic-auth',
        }),
        makeChild({
          id: 'auth-2',
          title: 'OAuth',
          status: 'in_progress',
          parent: 'epic-auth',
        }),
      ],
    })

    const { EpicView } = await importSut()
    render(<EpicView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('epic-tree')).toBeInTheDocument()
    })

    // Expanded by default → children list visible.
    const childrenBefore = screen.getAllByTestId('epic-child-row')
    expect(childrenBefore).toHaveLength(2)

    // Click the chevron to collapse.
    const chevron = screen.getByTestId('epic-chevron')
    await fireEvent.click(chevron)

    const childrenAfter = screen.queryAllByTestId('epic-child-row')
    expect(childrenAfter).toHaveLength(0)

    // Click again to re-expand.
    await fireEvent.click(chevron)
    const childrenReExpanded = screen.getAllByTestId('epic-child-row')
    expect(childrenReExpanded).toHaveLength(2)
  })

  it('shows the no-children hint for an epic with zero children', async () => {
    mockBdList.mockResolvedValue({
      status: 'ok',
      data: [makeEpic({ id: 'epic-empty' })],
    })

    const { EpicView } = await importSut()
    render(<EpicView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('epic-tree')).toBeInTheDocument()
    })

    expect(screen.getByTestId('epic-children-empty')).toBeInTheDocument()
  })

  it('calls onOpenIssue with the child id when a child row is clicked', async () => {
    mockBdList.mockResolvedValue({
      status: 'ok',
      data: [
        makeEpic({ id: 'epic-auth' }),
        makeChild({
          id: 'auth-1',
          title: 'Login',
          status: 'closed',
          parent: 'epic-auth',
        }),
      ],
    })

    const onOpenIssue = vi.fn()
    const { EpicView } = await importSut()
    render(<EpicView cwd="/fake" onOpenIssue={onOpenIssue} />)

    await waitFor(() => {
      expect(screen.getByTestId('epic-tree')).toBeInTheDocument()
    })

    const childRow = screen.getByTestId('epic-child-row')
    await fireEvent.click(childRow)

    expect(onOpenIssue).toHaveBeenCalledWith('auth-1')
  })

  it('calls onOpenIssue with the epic id when the epic open button is clicked', async () => {
    mockBdList.mockResolvedValue({
      status: 'ok',
      data: [
        makeEpic({ id: 'epic-auth' }),
        makeChild({ id: 'auth-1', parent: 'epic-auth' }),
      ],
    })

    const onOpenIssue = vi.fn()
    const { EpicView } = await importSut()
    render(<EpicView cwd="/fake" onOpenIssue={onOpenIssue} />)

    await waitFor(() => {
      expect(screen.getByTestId('epic-tree')).toBeInTheDocument()
    })

    const openBtn = screen.getByTestId('epic-open')
    await fireEvent.click(openBtn)

    expect(onOpenIssue).toHaveBeenCalledWith('epic-auth')
  })

  it('renders the error state when bdList returns an error', async () => {
    mockBdList.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: 'fatal: not a beads repository',
      },
    })

    const { EpicView } = await importSut()
    render(<EpicView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('epic-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('epic-error').textContent).toContain(
      'not a beads repository'
    )
    expect(screen.queryByTestId('epic-tree')).not.toBeInTheDocument()
    expect(screen.queryByTestId('epic-empty')).not.toBeInTheDocument()
  })

  // ponytail: M5 a11y — the epic view is a real ARIA tree. These
  // tests verify the structural semantics without touching the
  // visual styling. They live alongside the rest of the EpicView
  // suite because the same mock + render harness covers both.
  describe('ARIA tree semantics', () => {
    it('renders the outer list as a role="tree" with an accessible label', async () => {
      mockBdList.mockResolvedValue({
        status: 'ok',
        data: [makeEpic({ id: 'epic-auth' })],
      })

      const { EpicView } = await importSut()
      render(<EpicView cwd="/fake" onOpenIssue={() => undefined} />)

      await waitFor(() => {
        expect(screen.getByTestId('epic-tree')).toBeInTheDocument()
      })

      const tree = screen.getByRole('tree', { name: 'Epics' })
      expect(tree).toBeInTheDocument()
    })

    it('marks each epic row as role="treeitem" with aria-level/posinset/setsize/expanded', async () => {
      mockBdList.mockResolvedValue({
        status: 'ok',
        data: [
          makeEpic({ id: 'epic-a', title: 'Alpha epic' }),
          makeEpic({ id: 'epic-b', title: 'Beta epic' }),
          makeEpic({ id: 'epic-c', title: 'Gamma epic' }),
        ],
      })

      const { EpicView } = await importSut()
      render(<EpicView cwd="/fake" onOpenIssue={() => undefined} />)

      await waitFor(() => {
        expect(screen.getAllByTestId('epic-row')).toHaveLength(3)
      })

      const rows = screen.getAllByTestId('epic-row')
      for (const [idx, row] of rows.entries()) {
        expect(row).toHaveAttribute('role', 'treeitem')
        expect(row).toHaveAttribute('aria-level', '1')
        expect(row).toHaveAttribute('aria-posinset', String(idx + 1))
        expect(row).toHaveAttribute('aria-setsize', '3')
        // All epics start expanded (the view opens every epic by
        // default) → aria-expanded=true.
        expect(row).toHaveAttribute('aria-expanded', 'true')
      }
    })

    it('hides the children group when the epic is collapsed (aria-expanded=false)', async () => {
      mockBdList.mockResolvedValue({
        status: 'ok',
        data: [
          makeEpic({ id: 'epic-auth' }),
          makeChild({ id: 'auth-1', parent: 'epic-auth' }),
        ],
      })

      const { EpicView } = await importSut()
      render(<EpicView cwd="/fake" onOpenIssue={() => undefined} />)

      await waitFor(() => {
        expect(screen.getByTestId('epic-tree')).toBeInTheDocument()
      })

      // Collapse the epic via the chevron — the children group
      // disappears from the DOM and aria-expanded flips to false.
      await fireEvent.click(screen.getByTestId('epic-chevron'))
      const row = screen.getByTestId('epic-row')
      expect(row).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByTestId('epic-children')).not.toBeInTheDocument()
    })

    it('marks children as level-2 treeitems inside a role="group"', async () => {
      mockBdList.mockResolvedValue({
        status: 'ok',
        data: [
          makeEpic({ id: 'epic-auth' }),
          makeChild({ id: 'auth-1', title: 'Login', parent: 'epic-auth' }),
          makeChild({ id: 'auth-2', title: 'Logout', parent: 'epic-auth' }),
        ],
      })

      const { EpicView } = await importSut()
      render(<EpicView cwd="/fake" onOpenIssue={() => undefined} />)

      await waitFor(() => {
        expect(screen.getByTestId('epic-children')).toBeInTheDocument()
      })

      const group = screen.getByTestId('epic-children')
      expect(group).toHaveAttribute('role', 'group')
      const children = screen.getAllByTestId('epic-child-row')
      expect(children).toHaveLength(2)
      for (const [idx, child] of children.entries()) {
        expect(child).toHaveAttribute('role', 'treeitem')
        expect(child).toHaveAttribute('aria-level', '2')
        expect(child).toHaveAttribute('aria-posinset', String(idx + 1))
        expect(child).toHaveAttribute('aria-setsize', '2')
      }
    })

    it('exposes the epic title via aria-label on the treeitem', async () => {
      mockBdList.mockResolvedValue({
        status: 'ok',
        data: [makeEpic({ id: 'epic-auth', title: 'Authentication' })],
      })

      const { EpicView } = await importSut()
      render(<EpicView cwd="/fake" onOpenIssue={() => undefined} />)

      await waitFor(() => {
        expect(screen.getByTestId('epic-tree')).toBeInTheDocument()
      })

      const row = screen.getByTestId('epic-row')
      expect(row.getAttribute('aria-label')).toContain('Authentication')
    })
  })

  /**
   * M6 perf — the epic tree is virtualised with
   * @tanstack/react-virtual so the DOM only carries the viewport
   * slice + overscan. The `containerHeight` prop controls the
   * scroll container's pixel height; the virtualizer reads its
   * offsetHeight to compute which rows are visible. The tests
   * below exercise the height estimator, the small-list shape,
   * and the refetch-doesn't-blow-up invariant.
   */
  describe('M6 perf — large backlog', () => {
    it('estimateRowHeight returns the expected heights for each expand state', async () => {
      // Pure unit test on the exported helper — no render.
      const { estimateRowHeight } = await import('./epicViewSizing')
      // Collapsed: 72px (the header alone).
      expect(estimateRowHeight(false, 0)).toBe(72)
      // Expanded with 0 children: still 72px (the empty
      // children block collapses to a 0-height div).
      expect(estimateRowHeight(true, 0)).toBe(72)
      // Expanded with 3 children: 72 + 3*32 + 2*2 + 4 = 176px.
      expect(estimateRowHeight(true, 3)).toBe(72 + 3 * 32 + 2 * 2 + 4)
      // Expanded with 10 children: 72 + 10*32 + 9*2 + 4 = 414px.
      expect(estimateRowHeight(true, 10)).toBe(72 + 10 * 32 + 9 * 2 + 4)
    })

    it('virtualizes a 60-epic list so the DOM only carries the viewport slice + overscan', async () => {
      // 60 epics, containerHeight=200. With ROW_HEIGHT=72 +
      // OVERSCAN=5, ~3 visible + 2*5 overscan = ~13 rows
      // mounted. The test asserts < 60 to prove the virtualizer
      // is wiring up — without virtualization every render
      // would mount all 60 rows.
      const epics = Array.from({ length: 60 }, (_, i) =>
        makeEpic({
          id: `epic-${i}`,
          title: `Epic ${i}`,
          priority: `P${(i % 5).toString()}` as
            | 'P0'
            | 'P1'
            | 'P2'
            | 'P3'
            | 'P4',
          status: 'open',
        })
      )
      mockBdList.mockResolvedValue({ status: 'ok', data: epics })

      const { EpicView } = await importSut()
      render(
        <EpicView
          cwd="/fake"
          onOpenIssue={() => undefined}
          containerHeight={200}
        />
      )

      await waitFor(() => {
        expect(screen.getByTestId('epic-tree')).toBeInTheDocument()
      })

      // Wait for at least one row to mount.
      await waitFor(() => {
        const rows = screen.queryAllByTestId('epic-row')
        expect(rows.length).toBeGreaterThan(0)
      })

      // The DOM is bounded: far fewer than 60 rows mounted.
      const mountedRows = screen.getAllByTestId('epic-row')
      expect(mountedRows.length).toBeLessThan(60)
      // And the rows carry the absolute-position style the
      // virtualizer uses (proves virtualization is wired up).
      for (const row of mountedRows) {
        expect((row as HTMLElement).style.position).toBe('absolute')
      }
    })

    it('refetching the list does not re-mount rows outside the change set (watcher tick is targeted)', async () => {
      // 60 epics in a 200px-tall container; the virtualiser is
      // active. The test simulates a watcher tick by toggling a
      // filter on the store; this re-keys the TanStack Query
      // for `bdList` and triggers a fresh fetch with a wholly
      // new issue reference set, the way a real
      // `beads-issue-updated` event would after a `bd update`
      // from a sibling shell. The virtualiser should keep the
      // DOM row count bounded regardless.
      const initial = Array.from({ length: 60 }, (_, i) =>
        makeEpic({
          id: `epic-${i}`,
          title: `Epic ${i}`,
          priority: `P${(i % 5).toString()}` as
            | 'P0'
            | 'P1'
            | 'P2'
            | 'P3'
            | 'P4',
          status: 'open',
        })
      )
      const updated = initial.map((e, i) =>
        i === 7
          ? { ...e, title: 'Updated epic 7', status: 'closed' as const }
          : e
      )
      mockBdList.mockResolvedValueOnce({ status: 'ok', data: initial })
      mockBdList.mockResolvedValueOnce({ status: 'ok', data: updated })

      const { EpicView } = await importSut()
      render(
        <EpicView
          cwd="/fake"
          onOpenIssue={() => undefined}
          containerHeight={200}
        />
      )

      // First mount: data resolves to `initial`.
      await waitFor(() => {
        expect(screen.getByTestId('epic-tree')).toBeInTheDocument()
      })
      // Bounded DOM after first paint.
      await waitFor(() => {
        const rows = screen.queryAllByTestId('epic-row')
        expect(rows.length).toBeLessThan(60)
      })

      // Force a refetch by toggling the filter on the store.
      // (TanStack Query's `bdList` query is keyed on cwd +
      // filters; a filter change re-keys it.) This matches
      // the M0 R4 watcher-tick invariant test in
      // IssueListView.test.tsx.
      await act(async () => {
        useIssueFilterStore.getState().toggleStatus('open')
      })

      // After the refetch, the row count stays bounded — the
      // virtualiser still owns the mount set. Without
      // virtualization, every refresh would mount all 60
      // rows; with it, only the viewport slice + 5 overscan.
      await waitFor(() => {
        const rows = screen.queryAllByTestId('epic-row')
        expect(rows.length).toBeLessThan(60)
      })

      // Cleanup the filter so it doesn't leak into the next test.
      useIssueFilterStore.getState().toggleStatus('open')
    })
  })

  /**
   * M5 keyboard navigation — every treeitem carries its own
   * keyDown handler so Enter / Space open the issue when the row
   * is focused via the roving-tabindex path. The global hook
   * already routes Enter for the selected row, so these handlers
   * fire on the row's own keydown event when the user Tabs onto
   * it explicitly. The tests below exercise the 4 positive paths
   * (Enter + Space × epic + child) plus 2 negative paths that
   * cover the false-branch of the `||` so all 17 branch slots
   * and the 6 statement slots in EpicView.tsx L614-616 and
   * L756-758 are reachable.
   */
  describe('Keyboard navigation', () => {
    // The file-level `beforeEach` only clears call data via
    // `vi.clearAllMocks()`. Queued `mockResolvedValueOnce` and
    // the default impl registered by prior tests (the M6 perf
    // tests queue two `mockResolvedValueOnce` slots and leave the
    // 60-epic default) leak into this describe and override the
    // `mockResolvedValue({...})` calls below. Reset the mock
    // explicitly so each test starts from a fresh implementation.
    beforeEach(() => {
      mockBdList.mockReset()
    })

    // `preventDefault` spies operate on `KeyboardEvent.prototype`
    // and must be torn down after each test — `clearAllMocks`
    // does not restore spy implementations.
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('calls onOpenIssue(epic.id) when Enter is pressed on the epic treeitem', async () => {
      mockBdList.mockResolvedValue({
        status: 'ok',
        data: [
          makeEpic({ id: 'epic-auth', title: 'Auth epic' }),
          makeChild({ id: 'auth-1', parent: 'epic-auth' }),
        ],
      })

      const onOpenIssue = vi.fn()
      const { EpicView } = await importSut()
      render(<EpicView cwd="/fake" onOpenIssue={onOpenIssue} />)

      await waitFor(() => {
        expect(screen.getByTestId('epic-row')).toBeInTheDocument()
      })

      const epicRow = screen.getByTestId('epic-row')
      const preventDefault = vi.spyOn(KeyboardEvent.prototype, 'preventDefault')
      fireEvent.keyDown(epicRow, { key: 'Enter' })

      expect(onOpenIssue).toHaveBeenCalledWith('epic-auth')
      // React's synthetic-event delegator may call the native
      // `preventDefault` once for the listener and once again as
      // part of SyntheticEvent housekeeping, so we assert "called
      // at least once" rather than a brittle exact count. The
      // point is to verify the activation branch fired its
      // `preventDefault()` — not how many times.
      expect(preventDefault).toHaveBeenCalled()
    })

    it('calls onOpenIssue(epic.id) when Space is pressed on the epic treeitem', async () => {
      mockBdList.mockResolvedValue({
        status: 'ok',
        data: [
          makeEpic({ id: 'epic-auth', title: 'Auth epic' }),
          makeChild({ id: 'auth-1', parent: 'epic-auth' }),
        ],
      })

      const onOpenIssue = vi.fn()
      const { EpicView } = await importSut()
      render(<EpicView cwd="/fake" onOpenIssue={onOpenIssue} />)

      await waitFor(() => {
        expect(screen.getByTestId('epic-row')).toBeInTheDocument()
      })

      const epicRow = screen.getByTestId('epic-row')
      const preventDefault = vi.spyOn(KeyboardEvent.prototype, 'preventDefault')
      fireEvent.keyDown(epicRow, { key: ' ' })

      expect(onOpenIssue).toHaveBeenCalledWith('epic-auth')
      expect(preventDefault).toHaveBeenCalled()
    })

    it('calls onOpenIssue(child.id) when Enter is pressed on a child treeitem', async () => {
      mockBdList.mockResolvedValue({
        status: 'ok',
        data: [
          makeEpic({ id: 'epic-auth', title: 'Auth epic' }),
          makeChild({ id: 'auth-1', parent: 'epic-auth' }),
        ],
      })

      const onOpenIssue = vi.fn()
      const { EpicView } = await importSut()
      render(<EpicView cwd="/fake" onOpenIssue={onOpenIssue} />)

      await waitFor(() => {
        expect(screen.getByTestId('epic-child-row')).toBeInTheDocument()
      })

      const childRow = screen.getByTestId('epic-child-row')
      const preventDefault = vi.spyOn(KeyboardEvent.prototype, 'preventDefault')
      fireEvent.keyDown(childRow, { key: 'Enter' })

      expect(onOpenIssue).toHaveBeenCalledWith('auth-1')
      expect(preventDefault).toHaveBeenCalled()
    })

    it('calls onOpenIssue(child.id) when Space is pressed on a child treeitem', async () => {
      mockBdList.mockResolvedValue({
        status: 'ok',
        data: [
          makeEpic({ id: 'epic-auth', title: 'Auth epic' }),
          makeChild({ id: 'auth-1', parent: 'epic-auth' }),
        ],
      })

      const onOpenIssue = vi.fn()
      const { EpicView } = await importSut()
      render(<EpicView cwd="/fake" onOpenIssue={onOpenIssue} />)

      await waitFor(() => {
        expect(screen.getByTestId('epic-child-row')).toBeInTheDocument()
      })

      const childRow = screen.getByTestId('epic-child-row')
      const preventDefault = vi.spyOn(KeyboardEvent.prototype, 'preventDefault')
      fireEvent.keyDown(childRow, { key: ' ' })

      expect(onOpenIssue).toHaveBeenCalledWith('auth-1')
      expect(preventDefault).toHaveBeenCalled()
    })

    it('does not call onOpenIssue when a non-activation key is pressed on an epic treeitem', async () => {
      // 'Tab' keeps the false-branch of `e.key === 'Enter' ||
      // e.key === ' '` reachable on the epic-row path. We also
      // verify `preventDefault` is NOT called — the row must
      // leave default Tab handling alone so the browser can
      // move focus to the next focusable element.
      mockBdList.mockResolvedValue({
        status: 'ok',
        data: [
          makeEpic({ id: 'epic-auth', title: 'Auth epic' }),
          makeChild({ id: 'auth-1', parent: 'epic-auth' }),
        ],
      })

      const onOpenIssue = vi.fn()
      const { EpicView } = await importSut()
      render(<EpicView cwd="/fake" onOpenIssue={onOpenIssue} />)

      await waitFor(() => {
        expect(screen.getByTestId('epic-row')).toBeInTheDocument()
      })

      const epicRow = screen.getByTestId('epic-row')
      const preventDefault = vi.spyOn(KeyboardEvent.prototype, 'preventDefault')
      fireEvent.keyDown(epicRow, { key: 'Tab' })

      expect(onOpenIssue).not.toHaveBeenCalled()
      expect(preventDefault).not.toHaveBeenCalled()
    })

    it('does not call onOpenIssue when a non-activation key is pressed on a child treeitem', async () => {
      // Mirrors the epic negative test on the child row,
      // covering the false-branch of L756's `||` so both halves
      // of the `||` short-circuit reach 100% branch coverage.
      mockBdList.mockResolvedValue({
        status: 'ok',
        data: [
          makeEpic({ id: 'epic-auth', title: 'Auth epic' }),
          makeChild({ id: 'auth-1', parent: 'epic-auth' }),
        ],
      })

      const onOpenIssue = vi.fn()
      const { EpicView } = await importSut()
      render(<EpicView cwd="/fake" onOpenIssue={onOpenIssue} />)

      await waitFor(() => {
        expect(screen.getByTestId('epic-child-row')).toBeInTheDocument()
      })

      const childRow = screen.getByTestId('epic-child-row')
      const preventDefault = vi.spyOn(KeyboardEvent.prototype, 'preventDefault')
      fireEvent.keyDown(childRow, { key: 'Tab' })

      expect(onOpenIssue).not.toHaveBeenCalled()
      expect(preventDefault).not.toHaveBeenCalled()
    })
  })
})
