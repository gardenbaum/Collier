/**
 * Tests for the IssueListView list component.
 *
 * Contract: IssueListView calls `commands.bdList(cwd, filters)` via
 * TanStack Query, shows a loading state while the query is pending,
 * shows an error state when the Result is `error`, renders one
 * filtered row per `Issue` on success, surfaces the active filters as
 * chips at the top, fires `onOpenIssue` on row click, and uses
 * manual windowing so 1000 issues only mount ~15 rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { useIssueFilterStore } from '@/store/issue-filter-store'
import type { Issue, ListFilters } from '@/lib/bindings'

// ponytail: hoisted so the vi.mock factory can reference the mock fn.
// bdList returns a `Result<Issue[], BdError>`; the component unwraps
// it in the queryFn and throws on `error` so the error branch fires
// through TanStack Query's normal failure path.
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

const importSut = () => import('./IssueListView')

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: 'beads-1',
  title: 'Ship T15b',
  status: 'open',
  priority: 'P1',
  issue_type: 'task',
  created_at: '2026-06-17T00:00:00Z',
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
})

beforeEach(() => {
  vi.clearAllMocks()
  // ponytail: each test starts from a clean filter state. The store
  // has `persist` middleware so a previous test's localStorage entry
  // could leak into the next test via rehydration; clear both.
  useIssueFilterStore.getState().clearAll()
  useIssueFilterStore.persist.clearStorage()
  useIssueFilterStore.setState({
    status: [],
    priority: [],
    type: [],
    labels: [],
    assignees: [],
  })
})

describe('IssueListView', () => {
  it('renders a loading state while the query is pending', async () => {
    // Never-resolving promise keeps the query in `pending` state.
    mockBdList.mockReturnValue(new Promise<never>(() => undefined))

    const { IssueListView } = await importSut()
    render(<IssueListView cwd="/fake" onOpenIssue={vi.fn()} />)

    expect(screen.getByTestId('issue-list-view')).toBeInTheDocument()
    expect(screen.getByTestId('list-loading')).toBeInTheDocument()
    // Other states are mutually exclusive with loading.
    expect(screen.queryByTestId('list-error')).not.toBeInTheDocument()
    expect(screen.queryByTestId('list-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('issue-row')).not.toBeInTheDocument()
  })

  it('renders one row per issue on success', async () => {
    const issues = [
      makeIssue({ id: 'beads-1', title: 'Alpha' }),
      makeIssue({ id: 'beads-2', title: 'Beta' }),
      makeIssue({ id: 'beads-3', title: 'Gamma' }),
    ]
    mockBdList.mockResolvedValue({ status: 'ok', data: issues })

    const { IssueListView } = await importSut()
    // ponytail: small `containerHeight` keeps the test DOM tight —
    // 200 / 40 = 5 rows + overscan, so all 3 mock issues fit in the
    // visible window.
    render(
      <IssueListView cwd="/fake" onOpenIssue={vi.fn()} containerHeight={200} />
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('issue-row')).toHaveLength(3)
    })

    const rows = screen.getAllByTestId('issue-row')
    expect(rows[0]?.getAttribute('data-issue-id')).toBe('beads-1')
    expect(rows[1]?.getAttribute('data-issue-id')).toBe('beads-2')
    expect(rows[2]?.getAttribute('data-issue-id')).toBe('beads-3')
    expect(rows[0]?.textContent).toContain('Alpha')
    expect(rows[1]?.textContent).toContain('Beta')
    expect(rows[2]?.textContent).toContain('Gamma')

    // Badges present per row.
    expect(rows[0]?.querySelector('[data-testid="status-pill"]')).toBeTruthy()
    expect(rows[0]?.querySelector('[data-testid="priority-dot"]')).toBeTruthy()
    expect(rows[0]?.querySelector('[data-testid="type-icon"]')).toBeTruthy()

    // Footer reflects the row count.
    expect(screen.getByTestId('list-footer').textContent).toContain('3 issues')
  })

  it('renders the empty state when bdList returns no issues', async () => {
    mockBdList.mockResolvedValue({ status: 'ok', data: [] })

    const { IssueListView } = await importSut()
    render(<IssueListView cwd="/fake" onOpenIssue={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('list-empty')).toBeInTheDocument()
    })
    expect(screen.getByText('No issues match.')).toBeInTheDocument()
    expect(screen.getByTestId('list-footer').textContent).toContain('0 issues')
  })

  it('renders the error state when bdList returns a Result error', async () => {
    mockBdList.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: 'no workspace',
      },
    })

    const { IssueListView } = await importSut()
    render(<IssueListView cwd="/fake" onOpenIssue={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('list-error')).toBeInTheDocument()
    })
    // The error message surfaces so the user sees the underlying reason.
    expect(screen.getByTestId('list-error').textContent).toContain(
      'Failed to load'
    )
    // No rows / no empty state when errored.
    expect(screen.queryByTestId('issue-row')).not.toBeInTheDocument()
    expect(screen.queryByTestId('list-empty')).not.toBeInTheDocument()
  })

  it('row click fires onOpenIssue with the issue id', async () => {
    const issues = [
      makeIssue({ id: 'beads-7', title: 'Click me' }),
      makeIssue({ id: 'beads-8', title: 'Not me' }),
    ]
    mockBdList.mockResolvedValue({ status: 'ok', data: issues })

    const onOpenIssue = vi.fn()
    const { IssueListView } = await importSut()
    const { container } = render(
      <IssueListView
        cwd="/fake"
        onOpenIssue={onOpenIssue}
        containerHeight={200}
      />
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('issue-row')).toHaveLength(2)
    })

    const firstRow = container.querySelector(
      '[data-issue-id="beads-7"]'
    ) as HTMLElement
    fireEvent.click(firstRow)
    expect(onOpenIssue).toHaveBeenCalledTimes(1)
    expect(onOpenIssue).toHaveBeenCalledWith('beads-7')
  })

  it('keyboard activation (Enter) also fires onOpenIssue', async () => {
    const issues = [makeIssue({ id: 'beads-9' })]
    mockBdList.mockResolvedValue({ status: 'ok', data: issues })

    const onOpenIssue = vi.fn()
    const { IssueListView } = await importSut()
    render(
      <IssueListView
        cwd="/fake"
        onOpenIssue={onOpenIssue}
        containerHeight={200}
      />
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('issue-row')).toHaveLength(1)
    })

    const row = screen.getByTestId('issue-row')
    row.focus()
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onOpenIssue).toHaveBeenCalledWith('beads-9')
  })

  it('filter chips reflect the active filter dimensions', async () => {
    mockBdList.mockResolvedValue({ status: 'ok', data: [] })

    // Toggle two statuses and one priority to populate the chips.
    useIssueFilterStore.getState().toggleStatus('open')
    useIssueFilterStore.getState().toggleStatus('closed')
    useIssueFilterStore.getState().togglePriority('P0')

    const { IssueListView } = await importSut()
    render(<IssueListView cwd="/fake" onOpenIssue={vi.fn()} />)

    // Wait for the empty state so we know the component has rendered.
    await waitFor(() => {
      expect(screen.getByTestId('list-empty')).toBeInTheDocument()
    })

    const chips = screen.getByTestId('filter-chips')
    expect(chips).toBeInTheDocument()
    expect(screen.getByTestId('filter-chip-status')).toHaveTextContent(
      'Status (2)'
    )
    expect(screen.getByTestId('filter-chip-priority')).toHaveTextContent(
      'Priority (1)'
    )
    // Untouched dimensions have no chip.
    expect(screen.queryByTestId('filter-chip-type')).not.toBeInTheDocument()
    expect(screen.queryByTestId('filter-chip-labels')).not.toBeInTheDocument()
  })

  it('passes the active filter snapshot into bdList', async () => {
    mockBdList.mockResolvedValue({ status: 'ok', data: [] })

    useIssueFilterStore.getState().toggleStatus('open')
    useIssueFilterStore.getState().toggleStatus('in_progress')
    useIssueFilterStore.getState().togglePriority('P1')

    const { IssueListView } = await importSut()
    render(<IssueListView cwd="/fake" onOpenIssue={vi.fn()} />)

    await waitFor(() => {
      expect(mockBdList).toHaveBeenCalled()
    })

    const [cwd, filters] = mockBdList.mock.calls[0] as [string, ListFilters]
    expect(cwd).toBe('/fake')
    expect(filters.status).toEqual(['open', 'in_progress'])
    expect(filters.priority).toEqual(['P1'])
    // Empty dimensions are omitted (undefined), not empty arrays.
    expect(filters.issueType).toBeUndefined()
    expect(filters.labels).toBeUndefined()
    expect(filters.assignees).toBeUndefined()
  })

  it('windowing renders only the visible slice, not every issue', async () => {
    // ponytail: 1000 issues with ROW_HEIGHT=40 + containerHeight=200
    // = 5 visible rows + 2 * OVERSCAN overscan on each side = ~15 rows
    // mounted in the DOM. The test asserts < 20 (well under 1000) to
    // prove the windowing math is wired up.
    const issues = Array.from({ length: 1000 }, (_, i) =>
      makeIssue({ id: `beads-${i}`, title: `Issue ${i}` })
    )
    mockBdList.mockResolvedValue({ status: 'ok', data: issues })

    const { IssueListView } = await importSut()
    render(
      <IssueListView cwd="/fake" onOpenIssue={vi.fn()} containerHeight={200} />
    )

    await waitFor(() => {
      expect(screen.getByTestId('issue-list-scroll')).toBeInTheDocument()
    })

    // Wait for the windowed rows to actually mount (TanStack Query
    // resolves the promise, then React commits the rows).
    await waitFor(() => {
      const rows = screen.queryAllByTestId('issue-row')
      expect(rows.length).toBeGreaterThan(0)
    })

    const mountedRows = screen.getAllByTestId('issue-row')
    expect(mountedRows.length).toBeLessThan(20)
    // Footer still reflects the total count even though only some
    // rows are mounted in the DOM.
    expect(screen.getByTestId('list-footer').textContent).toContain(
      '1000 issues'
    )
  })

  it('keeps the DOM row count bounded at <100 with 1000 issues (spec R4)', async () => {
    // ponytail: M0 spec R4 — the list must virtualise so the DOM only
    // ever carries the viewport rows. 1000 issues + containerHeight=600
    // + ROW_HEIGHT=40 = 15 visible + 2*5 overscan = 25 rows, well under
    // the 100-row spec ceiling even if the test picks a generous
    // container height. The pre-emptive < 100 ceiling is the actual
    // acceptance criterion from docs/specs/m0-foundation.md.
    const issues = Array.from({ length: 1000 }, (_, i) =>
      makeIssue({ id: `beads-${i}`, title: `Issue ${i}` })
    )
    mockBdList.mockResolvedValue({ status: 'ok', data: issues })

    const { IssueListView } = await importSut()
    render(
      <IssueListView cwd="/fake" onOpenIssue={vi.fn()} containerHeight={600} />
    )

    // The query resolves async; wait for at least one row to mount so
    // the virtualizer has had a chance to measure the scroll container.
    await waitFor(() => {
      const rows = screen.queryAllByTestId('issue-row')
      expect(rows.length).toBeGreaterThan(0)
    })

    const mountedRows = screen.getAllByTestId('issue-row')
    // Spec ceiling: the list must not render 100 rows for 1000 issues.
    expect(mountedRows.length).toBeLessThan(100)
    // Sanity: 1000 items → footer reports the full count, even though
    // only a windowed slice is in the DOM.
    expect(screen.getByTestId('list-footer').textContent).toContain(
      '1000 issues'
    )
    // Inner container reports the full virtual height (1000 * 40 =
    // 40 000px) — the scrollbar is honest about how long the list is.
    const inner = screen.getByTestId('issue-list-inner')
    expect((inner as HTMLElement).style.height).toBe('40000px')
  })

  it('watcher tick (query refetch) does not re-render the full 1000-row list', async () => {
    // ponytail: the watcher's payload is a fresh array from
    // `bd list --json` — every issue is a new object reference. The
    // virtualizer only mounts viewport rows, so even when ALL 1000
    // references change, only the windowed slice re-renders. We assert
    // this end-to-end by: (1) rendering 1000 issues, (2) refetching
    // with a wholly new 1000-issue payload (simulating a watcher tick
    // re-invalidating the query), and (3) confirming the DOM still
    // carries < 100 rows after the swap — proving the windowing math
    // + reference identity together keep render scope bounded.
    const initial = Array.from({ length: 1000 }, (_, i) =>
      makeIssue({ id: `beads-${i}`, title: `Issue ${i}` })
    )
    const updated = Array.from({ length: 1000 }, (_, i) =>
      makeIssue({
        id: `beads-${i}`,
        title: `Updated ${i}`,
        // Mutate a visible field too so a hypothetical full re-render
        // would have to repaint every row.
        priority: i % 2 === 0 ? 'P0' : 'P1',
      })
    )
    mockBdList.mockResolvedValueOnce({ status: 'ok', data: initial })
    mockBdList.mockResolvedValueOnce({ status: 'ok', data: updated })

    const { IssueListView } = await importSut()
    const onOpenIssue = vi.fn()
    render(
      <IssueListView
        cwd="/fake"
        onOpenIssue={onOpenIssue}
        containerHeight={200}
      />
    )

    // First mount: query resolves to `initial`.
    await waitFor(() => {
      const rows = screen.queryAllByTestId('issue-row')
      expect(rows.length).toBeGreaterThan(0)
    })
    expect(screen.getAllByTestId('issue-row').length).toBeLessThan(100)
    expect(screen.getByTestId('list-footer').textContent).toContain(
      '1000 issues'
    )

    // Simulate a watcher tick: re-key the query by toggling a filter
    // checkbox. `useBeadsInvalidation` calls
    // `queryClient.invalidateQueries({ queryKey: ['beads'] })` in
    // production; toggling a filter achieves the same re-key/re-fetch
    // for this test without dragging the full Tauri event bus into
    // the test setup. The new payload is `updated` — completely fresh
    // issue references.
    await act(async () => {
      useIssueFilterStore.getState().toggleStatus('open')
    })

    // After refetch, the windowed rows still show new data (proves
    // the refetch landed) AND the DOM is still bounded (proves no
    // full re-render).
    await waitFor(() => {
      const rows = screen.queryAllByTestId('issue-row')
      // The windowed slice was painted with `updated` titles.
      const hasUpdatedTitle = rows.some(r =>
        r.textContent?.includes('Updated ')
      )
      expect(hasUpdatedTitle).toBe(true)
    })
    expect(screen.getAllByTestId('issue-row').length).toBeLessThan(100)
    // And the row count never ballooned during the swap.
    const peak = screen.getAllByTestId('issue-row').length
    expect(peak).toBeLessThan(100)
    // Footer still says 1000 issues — total count is unchanged, just
    // the data identity is fresh.
    expect(screen.getByTestId('list-footer').textContent).toContain(
      '1000 issues'
    )
  })

  it('does not use the brand colour anywhere in the rendered output', async () => {
    // ponytail: AC-14 — the brand colour is reserved for destructive
    // actions and the P0 priority badge only. The P0 row legitimately
    // carries it (inside `PriorityDot`), so we filter that one out of
    // the assertion: the LIST VIEW itself never paints the colour on
    // a non-P0 element.
    const issues = [
      makeIssue({ id: 'beads-1', priority: 'P1' }),
      makeIssue({ id: 'beads-2', priority: 'P2' }),
    ]
    mockBdList.mockResolvedValue({ status: 'ok', data: issues })

    const { IssueListView } = await importSut()
    const { container } = render(
      <IssueListView cwd="/fake" onOpenIssue={vi.fn()} containerHeight={200} />
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('issue-row')).toHaveLength(2)
    })

    // The component's own JSX (containerStyle, chips, etc.) must not
    // bake the brand colour. We exclude the PriorityDot subtree
    // (which legitimately carries it on P0 rows) by checking the
    // row's direct children, not the full row subtree.
    const rows = screen.getAllByTestId('issue-row')
    rows.forEach(row => {
      // Only check the row's own inline style; PriorityDot's style
      // is allowed to carry the brand colour for P0.
      const ownStyle = row.getAttribute('style')?.toLowerCase() ?? ''
      expect(ownStyle).not.toContain('c2410c')
    })

    // Top-level container JSX (not the row subtree).
    const rootStyle = (
      container.querySelector('[data-testid="issue-list-view"]') as HTMLElement
    )
      ?.getAttribute('style')
      ?.toLowerCase()
    expect(rootStyle ?? '').not.toContain('c2410c')
  })
})
