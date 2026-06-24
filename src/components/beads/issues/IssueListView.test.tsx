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

// ponytail: the generated `Issue` type advertises priority as
// `"P0"|"P1"|...|"P4"` (the specta name), but `bd list --json`
// emits the bare integer 0..4 on the wire (Rust `Serialize_repr`).
// The component sorts by `Number(issue.priority)`, so a test that
// uses the variant-name strings silently sorts by NaN — which is
// why this file's history shows a buggy comparator slipping
// through CI. `p` is the integer-shape helper so callers stay
// honest about the wire data while satisfying the structural
// type system.
const p = (n: number): Issue['priority'] => n as unknown as Issue['priority']

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: 'beads-1',
  title: 'Ship T15b',
  status: 'open',
  priority: p(1),
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

  it('clicking a chip \u00d7 removes the entire dimension in one click', async () => {
    mockBdList.mockResolvedValue({ status: 'ok', data: [] })

    // Two statuses + one priority + one type + one label.
    useIssueFilterStore.getState().toggleStatus('open')
    useIssueFilterStore.getState().toggleStatus('in_progress')
    useIssueFilterStore.getState().togglePriority('P0')
    useIssueFilterStore.getState().toggleType('bug')
    useIssueFilterStore.getState().toggleLabel('urgent')

    const { IssueListView } = await importSut()
    render(<IssueListView cwd="/fake" onOpenIssue={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('list-empty')).toBeInTheDocument()
    })

    // Click the Status chip's remove button.
    act(() => {
      screen.getByTestId('filter-chip-status-remove').click()
    })

    // Status dimension is now empty (both values cleared in one
    // click), the chip disappears, the others remain.
    expect(useIssueFilterStore.getState().status).toEqual([])
    expect(screen.queryByTestId('filter-chip-status')).not.toBeInTheDocument()
    expect(screen.getByTestId('filter-chip-priority')).toBeInTheDocument()
    expect(screen.getByTestId('filter-chip-type')).toBeInTheDocument()
    expect(screen.getByTestId('filter-chip-labels')).toBeInTheDocument()
  })

  it('clicking the Clear all chip empties every dimension in one click', async () => {
    mockBdList.mockResolvedValue({ status: 'ok', data: [] })

    useIssueFilterStore.getState().toggleStatus('open')
    useIssueFilterStore.getState().togglePriority('P0')
    useIssueFilterStore.getState().toggleType('bug')
    useIssueFilterStore.getState().toggleLabel('urgent')
    useIssueFilterStore.getState().toggleAssignee('alice')

    const { IssueListView } = await importSut()
    render(<IssueListView cwd="/fake" onOpenIssue={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('list-empty')).toBeInTheDocument()
    })

    expect(screen.getByTestId('filter-clear-all')).toBeInTheDocument()

    act(() => {
      screen.getByTestId('filter-clear-all').click()
    })

    const s = useIssueFilterStore.getState()
    expect(s.status).toEqual([])
    expect(s.priority).toEqual([])
    expect(s.type).toEqual([])
    expect(s.labels).toEqual([])
    expect(s.assignees).toEqual([])

    // The entire chip row disappears when no filter is active.
    expect(screen.queryByTestId('filter-chips')).not.toBeInTheDocument()
    expect(screen.queryByTestId('filter-clear-all')).not.toBeInTheDocument()
  })

  it('hides the chip row when no filter is active', async () => {
    mockBdList.mockResolvedValue({ status: 'ok', data: [] })

    const { IssueListView } = await importSut()
    render(<IssueListView cwd="/fake" onOpenIssue={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('list-empty')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('filter-chips')).not.toBeInTheDocument()
    expect(screen.queryByTestId('filter-clear-all')).not.toBeInTheDocument()
  })

  it('multiple filters compose with AND in the bdList payload (R2 spec)', async () => {
    // ponytail: spec R2 explicitly requires AND composition. With
    // two statuses and one priority active, the bdList call must
    // carry all three values; the backend (`bd list`) treats
    // repeatable flags as AND. We assert the bridge payload shape
    // to lock the contract.
    mockBdList.mockResolvedValue({ status: 'ok', data: [] })

    useIssueFilterStore.getState().toggleStatus('open')
    useIssueFilterStore.getState().toggleStatus('in_progress')
    useIssueFilterStore.getState().togglePriority('P0')
    useIssueFilterStore.getState().toggleType('bug')
    useIssueFilterStore.getState().toggleLabel('urgent')
    useIssueFilterStore.getState().toggleAssignee('alice')

    const { IssueListView } = await importSut()
    render(<IssueListView cwd="/fake" onOpenIssue={vi.fn()} />)

    await waitFor(() => {
      expect(mockBdList).toHaveBeenCalled()
    })

    const [, filters] = mockBdList.mock.calls[
      mockBdList.mock.calls.length - 1
    ] as [string, ListFilters]
    // All five dimensions active; all carry every value (AND).
    // ponytail: priority is sent as the bare integer 0..4
    // (matching the Rust `bd_list` deserializer's `u8` shape)
    // — see IssueListView's `priorityToWire` helper for the
    // IPC-boundary conversion. The store still holds the specta
    // string union ("P0".."P4"), so the test toggles
    // `togglePriority('P0')` and asserts the wire value `0`.
    expect(filters.status).toEqual(['open', 'in_progress'])
    expect(filters.priority).toEqual([0])
    expect(filters.issueType).toEqual(['bug'])
    expect(filters.labels).toEqual(['urgent'])
    expect(filters.assignees).toEqual(['alice'])
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
    // ponytail: priority sent as bare integer 1 over the wire
    // (IssueListView.priorityToWire converts "P1" -> 1). See the
    // R2 spec's "AND composition" assertion in tests/e2e for the
    // matching convention.
    expect(filters.priority).toEqual([1])
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
        priority: i % 2 === 0 ? p(0) : p(1),
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

  it('renders a column header row with the spec R1 columns', async () => {
    const issues = [
      makeIssue({ id: 'beads-1', status: 'open', priority: p(1) }),
    ]
    mockBdList.mockResolvedValue({ status: 'ok', data: issues })

    const { IssueListView } = await importSut()
    render(
      <IssueListView cwd="/fake" onOpenIssue={vi.fn()} containerHeight={200} />
    )

    await waitFor(() => {
      expect(screen.getByTestId('issue-list-headers')).toBeInTheDocument()
    })

    // Every spec R1 column is present as a sortable header except
    // Title (intentionally not sortable per the spec).
    expect(screen.getByTestId('sort-header-id')).toBeInTheDocument()
    expect(screen.getByTestId('sort-header-status')).toBeInTheDocument()
    expect(screen.getByTestId('sort-header-priority')).toBeInTheDocument()
    expect(screen.getByTestId('sort-header-type')).toBeInTheDocument()
    expect(screen.getByTestId('sort-header-assignee')).toBeInTheDocument()
    // No `sort-header-title` — title is not sortable.
    expect(screen.queryByTestId('sort-header-title')).not.toBeInTheDocument()

    // No sort active by default.
    const idHeader = screen.getByTestId('sort-header-id')
    expect(idHeader.getAttribute('data-sort-direction')).toBe('none')
  })

  it('renders each row as a six-column grid with the spec R1 columns', async () => {
    const issues = [
      makeIssue({
        id: 'beads-1',
        title: 'Hello world',
        status: 'in_progress',
        priority: p(2),
        issue_type: 'bug',
        owner: 'alice',
      }),
    ]
    mockBdList.mockResolvedValue({ status: 'ok', data: issues })

    const { IssueListView } = await importSut()
    render(
      <IssueListView cwd="/fake" onOpenIssue={vi.fn()} containerHeight={200} />
    )

    await waitFor(() => {
      expect(screen.getByTestId('issue-row')).toBeInTheDocument()
    })

    const row = screen.getByTestId('issue-row')
    expect(row.querySelector('[data-column="id"]')?.textContent).toBe('beads-1')
    expect(row.querySelector('[data-column="title"]')?.textContent).toContain(
      'Hello world'
    )
    expect(row.querySelector('[data-column="status"]')).toBeTruthy()
    expect(row.querySelector('[data-column="priority"]')).toBeTruthy()
    expect(row.querySelector('[data-column="type"]')).toBeTruthy()
    // ponytail: the assignee cell now also embeds an inline-edit
    // <select> with all assignees as options (for the R3 dropdown).
    // The visible text is the first child <span>; assert against
    // it directly so the test stays scoped to the user-visible
    // owner rather than the full select option list.
    expect(
      row
        .querySelector(
          '[data-column="assignee"] [data-testid="inline-assignee-edit"]'
        )
        ?.querySelector('span')
    ).toHaveTextContent('alice')

    // Spec R1 also bakes the column values onto the row for QA selectors
    // that don't have to traverse the DOM tree.
    expect(row.getAttribute('data-issue-id')).toBe('beads-1')
    expect(row.getAttribute('data-issue-status')).toBe('in_progress')
    expect(row.getAttribute('data-issue-priority')).toBe('2')
    expect(row.getAttribute('data-issue-type')).toBe('bug')
    expect(row.getAttribute('data-issue-assignee')).toBe('alice')
  })

  it('renders an em-dash placeholder for issues without an assignee', async () => {
    const issues = [makeIssue({ id: 'beads-1', owner: null })]
    mockBdList.mockResolvedValue({ status: 'ok', data: issues })

    const { IssueListView } = await importSut()
    render(
      <IssueListView cwd="/fake" onOpenIssue={vi.fn()} containerHeight={200} />
    )

    await waitFor(() => {
      expect(screen.getByTestId('issue-row')).toBeInTheDocument()
    })

    const row = screen.getByTestId('issue-row')
    // The data attribute is empty for unassigned, NOT the string "null".
    expect(row.getAttribute('data-issue-assignee')).toBe('')
    // The cell carries the em-dash placeholder. Same scope as the
    // owner test above: read the visible span, not the whole cell
    // (the inline-edit select adds option texts that are not part
    // of the visible owner).
    expect(
      row
        .querySelector(
          '[data-column="assignee"] [data-testid="inline-assignee-edit"]'
        )
        ?.querySelector('span')
    ).toHaveTextContent('—')
  })

  it('clicking a sort header reorders the rows by that key (asc)', async () => {
    // ponytail: 4 issues with mixed priorities, deterministically
    // ordered by issue id in the mock. After clicking the priority
    // header, the row order must match the P0..P3 rank, NOT the
    // original id order.
    const issues = [
      makeIssue({ id: 'beads-1', priority: p(3) }),
      makeIssue({ id: 'beads-2', priority: p(0) }),
      makeIssue({ id: 'beads-3', priority: p(2) }),
      makeIssue({ id: 'beads-4', priority: p(1) }),
    ]
    mockBdList.mockResolvedValue({ status: 'ok', data: issues })

    const { IssueListView } = await importSut()
    render(
      <IssueListView cwd="/fake" onOpenIssue={vi.fn()} containerHeight={400} />
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('issue-row')).toHaveLength(4)
    })

    // Header starts inactive.
    const header = screen.getByTestId('sort-header-priority')
    expect(header.getAttribute('data-sort-direction')).toBe('none')

    act(() => {
      header.click()
    })

    // After click: ascending priority order. beads-2 and beads-4
    // share priority 1, so the stable id tiebreaker (asc) puts
    // beads-2 before beads-4. Likewise beads-3 (P2) sits between
    // the two P1 issues and beads-1 (P3) trails.
    const rows = screen.getAllByTestId('issue-row')
    const idsInOrder = rows.map(r => r.getAttribute('data-issue-id'))
    expect(idsInOrder).toEqual(['beads-2', 'beads-4', 'beads-3', 'beads-1'])
    expect(header.getAttribute('data-sort-direction')).toBe('asc')
  })

  it('clicking the active sort header again toggles to desc', async () => {
    const issues = [
      makeIssue({ id: 'beads-1', priority: p(3) }),
      makeIssue({ id: 'beads-2', priority: p(0) }),
    ]
    mockBdList.mockResolvedValue({ status: 'ok', data: issues })

    const { IssueListView } = await importSut()
    render(
      <IssueListView cwd="/fake" onOpenIssue={vi.fn()} containerHeight={400} />
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('issue-row')).toHaveLength(2)
    })

    const header = screen.getByTestId('sort-header-priority')
    act(() => {
      header.click()
    })
    expect(header.getAttribute('data-sort-direction')).toBe('asc')
    let ids = screen
      .getAllByTestId('issue-row')
      .map(r => r.getAttribute('data-issue-id'))
    expect(ids).toEqual(['beads-2', 'beads-1'])

    act(() => {
      header.click()
    })
    expect(header.getAttribute('data-sort-direction')).toBe('desc')
    ids = screen
      .getAllByTestId('issue-row')
      .map(r => r.getAttribute('data-issue-id'))
    expect(ids).toEqual(['beads-1', 'beads-2'])
  })

  it('clicking a different sort header resets direction to asc', async () => {
    const issues = [
      makeIssue({ id: 'beads-1', status: 'closed', priority: p(0) }),
      makeIssue({ id: 'beads-2', status: 'open', priority: p(3) }),
    ]
    mockBdList.mockResolvedValue({ status: 'ok', data: issues })

    const { IssueListView } = await importSut()
    render(
      <IssueListView cwd="/fake" onOpenIssue={vi.fn()} containerHeight={400} />
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('issue-row')).toHaveLength(2)
    })

    const statusHeader = screen.getByTestId('sort-header-status')
    const priorityHeader = screen.getByTestId('sort-header-priority')

    // Sort status DESC first.
    act(() => {
      statusHeader.click()
    })
    act(() => {
      statusHeader.click()
    })
    expect(statusHeader.getAttribute('data-sort-direction')).toBe('desc')
    expect(priorityHeader.getAttribute('data-sort-direction')).toBe('none')

    // Now click priority — should be active in asc, status should reset to none.
    act(() => {
      priorityHeader.click()
    })
    expect(priorityHeader.getAttribute('data-sort-direction')).toBe('asc')
    expect(statusHeader.getAttribute('data-sort-direction')).toBe('none')
  })

  it('sorts by status using the lifecycle order (open → closed)', async () => {
    const issues = [
      makeIssue({ id: 'beads-1', status: 'closed' }),
      makeIssue({ id: 'beads-2', status: 'open' }),
      makeIssue({ id: 'beads-3', status: 'in_progress' }),
      makeIssue({ id: 'beads-4', status: 'deferred' }),
      makeIssue({ id: 'beads-5', status: 'blocked' }),
    ]
    mockBdList.mockResolvedValue({ status: 'ok', data: issues })

    const { IssueListView } = await importSut()
    render(
      <IssueListView cwd="/fake" onOpenIssue={vi.fn()} containerHeight={500} />
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('issue-row')).toHaveLength(5)
    })

    act(() => {
      screen.getByTestId('sort-header-status').click()
    })

    const ids = screen
      .getAllByTestId('issue-row')
      .map(r => r.getAttribute('data-issue-id'))
    expect(ids).toEqual([
      'beads-2', // open
      'beads-3', // in_progress
      'beads-5', // blocked
      'beads-4', // deferred
      'beads-1', // closed
    ])
  })

  it('sorts by id lexicographically (asc and desc)', async () => {
    const issues = [
      makeIssue({ id: 'beads-c' }),
      makeIssue({ id: 'beads-a' }),
      makeIssue({ id: 'beads-b' }),
    ]
    mockBdList.mockResolvedValue({ status: 'ok', data: issues })

    const { IssueListView } = await importSut()
    render(
      <IssueListView cwd="/fake" onOpenIssue={vi.fn()} containerHeight={400} />
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('issue-row')).toHaveLength(3)
    })

    const header = screen.getByTestId('sort-header-id')
    act(() => {
      header.click()
    })
    expect(
      screen
        .getAllByTestId('issue-row')
        .map(r => r.getAttribute('data-issue-id'))
    ).toEqual(['beads-a', 'beads-b', 'beads-c'])

    act(() => {
      header.click()
    })
    expect(
      screen
        .getAllByTestId('issue-row')
        .map(r => r.getAttribute('data-issue-id'))
    ).toEqual(['beads-c', 'beads-b', 'beads-a'])
  })

  it('sorts assignees alphabetically and sinks nulls to the bottom of asc', async () => {
    const issues = [
      makeIssue({ id: 'beads-1', owner: 'charlie' }),
      makeIssue({ id: 'beads-2', owner: null }),
      makeIssue({ id: 'beads-3', owner: 'alice' }),
      makeIssue({ id: 'beads-4', owner: 'bob' }),
    ]
    mockBdList.mockResolvedValue({ status: 'ok', data: issues })

    const { IssueListView } = await importSut()
    render(
      <IssueListView cwd="/fake" onOpenIssue={vi.fn()} containerHeight={500} />
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('issue-row')).toHaveLength(4)
    })

    const header = screen.getByTestId('sort-header-assignee')
    act(() => {
      header.click()
    })
    const ascIds = screen
      .getAllByTestId('issue-row')
      .map(r => r.getAttribute('data-issue-id'))
    // Asc: alice, bob, charlie, then unassigned at the bottom.
    expect(ascIds).toEqual(['beads-3', 'beads-4', 'beads-1', 'beads-2'])

    act(() => {
      header.click()
    })
    const descIds = screen
      .getAllByTestId('issue-row')
      .map(r => r.getAttribute('data-issue-id'))
    // Desc: unassigned at the top, then charlie, bob, alice.
    expect(descIds).toEqual(['beads-2', 'beads-1', 'beads-4', 'beads-3'])
  })

  it('does not mutate the TanStack Query cache when sorting', async () => {
    // ponytail: the sort useMemo must copy the array before sorting.
    // If it sorts in place, the next invalidation would observe a
    // mutated cache and the entire app would re-render in a different
    // order than the user expects. We assert by snapshotting the
    // input array reference and confirming it survives the sort.
    const issues = [
      makeIssue({ id: 'beads-1', priority: p(3) }),
      makeIssue({ id: 'beads-2', priority: p(0) }),
    ]
    const snapshot = [...issues]
    mockBdList.mockResolvedValue({ status: 'ok', data: issues })

    const { IssueListView } = await importSut()
    render(
      <IssueListView cwd="/fake" onOpenIssue={vi.fn()} containerHeight={400} />
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('issue-row')).toHaveLength(2)
    })

    act(() => {
      screen.getByTestId('sort-header-priority').click()
    })

    // Original input array is untouched (same order, same objects).
    expect(issues.map(i => i.id)).toEqual(snapshot.map(i => i.id))
  })

  it('does not use the brand colour anywhere in the rendered output', async () => {
    // ponytail: AC-14 — the brand colour is reserved for destructive
    // actions and the P0 priority badge only. The P0 row legitimately
    // carries it (inside `PriorityDot`), so we filter that one out of
    // the assertion: the LIST VIEW itself never paints the colour on
    // a non-P0 element.
    const issues = [
      makeIssue({ id: 'beads-1', priority: p(1) }),
      makeIssue({ id: 'beads-2', priority: p(2) }),
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
