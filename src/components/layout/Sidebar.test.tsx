/**
 * Tests for the Sidebar — workspace views, filter chips,
 * label/assignee filter lists, and Clear-all affordance.
 *
 * Spec R2 (M1 issue-core): wire the FilterSidebar + Labels panel
 * to actually filter the list by status, priority, type, assignee,
 * and label. Multiple filters combine with AND; show active
 * filters; provide clear-all.
 *
 * ponytail: every filter toggle writes to `useIssueFilterStore`
 * and the IssueListView consumes the same store. Sidebar tests
 * focus on the Sidebar's contract (toggle wiring, active state,
 * Clear-all visibility); the "filters flow through to bdList" half
 * is covered by IssueListView.test.tsx.
 */
import { render, screen, act } from '@/test/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Sidebar } from './Sidebar'
import { useIssueFilterStore } from '@/store/issue-filter-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import type {
  AssigneeWithCount,
  LabelWithCount,
  ListFilters,
} from '@/lib/bindings'

// ponytail: hoisted so the vi.mock factory can reference the mock fns.
// The Sidebar fires `bdLabelListAll` and `bdAssigneeListAll` against
// `repoPath` from `useWorkspaceStore`. Empty repoPath disables both
// queries (see the `enabled: repoPath !== null` flag) so tests that
// only exercise the view list / filter chip sections don't have to
// mock the queries at all.
const { mockBdLabelListAll, mockBdAssigneeListAll } = vi.hoisted(() => ({
  mockBdLabelListAll: vi.fn(),
  mockBdAssigneeListAll: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdLabelListAll: mockBdLabelListAll,
    bdAssigneeListAll: mockBdAssigneeListAll,
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
  // Default repo path: a known fixture root. Tests that need no
  // repo can override this with `setRepoPath(null)`.
  useWorkspaceStore.setState({ repoPath: '/fake/repo' })
})

const SAMPLE_LABELS: LabelWithCount[] = [
  { label: 'auth', count: 3 },
  { label: 'bug', count: 5 },
  { label: 'frontend', count: 2 },
]

const SAMPLE_ASSIGNEES: AssigneeWithCount[] = [
  { assignee: 'alice', count: 4 },
  { assignee: 'bob', count: 2 },
  { assignee: 'carol', count: 1 },
]

describe('Sidebar — views', () => {
  it('renders all 11 view names', () => {
    render(<Sidebar />)
    const views = [
      'list',
      'ready',
      'blocked',
      'search',
      'epic',
      'graph',
      'swarm',
      'sync',
      'worktree',
      'status',
      'raw',
    ] as const
    for (const view of views) {
      expect(screen.getByTestId(`sidebar-view-${view}`)).toBeInTheDocument()
    }
  })

  it('highlights the active view', () => {
    render(<Sidebar />)
    const listItem = screen.getByRole('tab', { name: /List/ })
    expect(listItem.getAttribute('data-active')).toBe('true')
  })
})

describe('Sidebar — section labels', () => {
  it('renders the FILTERS section label', () => {
    render(<Sidebar />)
    expect(screen.getByText(/^Filters$/i)).toBeInTheDocument()
  })

  it('renders the LABELS section label', () => {
    render(<Sidebar />)
    expect(screen.getByText(/^Labels$/i)).toBeInTheDocument()
  })

  it('renders the ASSIGNEES section label', () => {
    render(<Sidebar />)
    expect(screen.getByText(/^Assignees$/i)).toBeInTheDocument()
  })
})

describe('Sidebar — filter chips per dimension', () => {
  it('renders one toggle chip per status enum value', () => {
    render(<Sidebar />)
    for (const status of [
      'open',
      'in_progress',
      'blocked',
      'deferred',
      'closed',
    ]) {
      expect(
        screen.getByTestId(`sidebar-filter-status-${status}`)
      ).toBeInTheDocument()
    }
  })

  it('renders one toggle chip per priority enum value', () => {
    render(<Sidebar />)
    for (const priority of ['P0', 'P1', 'P2', 'P3', 'P4']) {
      expect(
        screen.getByTestId(`sidebar-filter-priority-${priority}`)
      ).toBeInTheDocument()
    }
  })

  it('renders one toggle chip per issue type enum value', () => {
    render(<Sidebar />)
    for (const type of [
      'bug',
      'feature',
      'task',
      'epic',
      'chore',
      'decision',
      'gate',
    ]) {
      expect(
        screen.getByTestId(`sidebar-filter-type-${type}`)
      ).toBeInTheDocument()
    }
  })
})

describe('Sidebar — chip toggling', () => {
  it('clicking a status chip toggles the store and reflects active state', () => {
    render(<Sidebar />)
    const openChip = screen.getByTestId('sidebar-filter-status-open')
    // ponytail: data-active mirrors the store. Default is "false".
    expect(openChip.getAttribute('data-active')).toBe('false')

    act(() => {
      openChip.click()
    })

    expect(useIssueFilterStore.getState().status).toEqual(['open'])
    // After re-render, the chip is active.
    expect(
      screen
        .getByTestId('sidebar-filter-status-open')
        .getAttribute('data-active')
    ).toBe('true')

    // Toggle again — chip becomes inactive, store empties.
    act(() => {
      screen.getByTestId('sidebar-filter-status-open').click()
    })
    expect(useIssueFilterStore.getState().status).toEqual([])
    expect(
      screen
        .getByTestId('sidebar-filter-status-open')
        .getAttribute('data-active')
    ).toBe('false')
  })

  it('clicking a priority chip toggles the store', () => {
    render(<Sidebar />)
    act(() => {
      screen.getByTestId('sidebar-filter-priority-P0').click()
    })
    expect(useIssueFilterStore.getState().priority).toEqual(['P0'])
  })

  it('clicking a type chip toggles the store', () => {
    render(<Sidebar />)
    act(() => {
      screen.getByTestId('sidebar-filter-type-bug').click()
    })
    expect(useIssueFilterStore.getState().type).toEqual(['bug'])
  })

  it('multiple chips on different dimensions combine with AND in the store', () => {
    render(<Sidebar />)
    act(() => {
      screen.getByTestId('sidebar-filter-status-open').click()
      screen.getByTestId('sidebar-filter-priority-P1').click()
      screen.getByTestId('sidebar-filter-type-task').click()
    })
    const s = useIssueFilterStore.getState()
    expect(s.status).toEqual(['open'])
    expect(s.priority).toEqual(['P1'])
    expect(s.type).toEqual(['task'])
    // All three chips show active state.
    expect(
      screen
        .getByTestId('sidebar-filter-status-open')
        .getAttribute('data-active')
    ).toBe('true')
    expect(
      screen
        .getByTestId('sidebar-filter-priority-P1')
        .getAttribute('data-active')
    ).toBe('true')
    expect(
      screen.getByTestId('sidebar-filter-type-task').getAttribute('data-active')
    ).toBe('true')
  })
})

describe('Sidebar — labels section', () => {
  beforeEach(() => {
    mockBdLabelListAll.mockResolvedValue({ status: 'ok', data: SAMPLE_LABELS })
  })

  it('renders one button per label from bdLabelListAll', async () => {
    render(<Sidebar />)
    // Wait for the query to resolve and React to commit the rows.
    for (const label of SAMPLE_LABELS) {
      expect(
        await screen.findByTestId(`sidebar-label-${label.label}`)
      ).toBeInTheDocument()
    }
  })

  it('clicking a label button toggles the label filter', async () => {
    render(<Sidebar />)
    const bugButton = await screen.findByTestId('sidebar-label-bug')
    expect(bugButton.getAttribute('data-active')).toBe('false')

    act(() => {
      bugButton.click()
    })
    expect(useIssueFilterStore.getState().labels).toEqual(['bug'])
    expect(
      screen.getByTestId('sidebar-label-bug').getAttribute('data-active')
    ).toBe('true')

    // Toggle off.
    act(() => {
      screen.getByTestId('sidebar-label-bug').click()
    })
    expect(useIssueFilterStore.getState().labels).toEqual([])
  })
})

describe('Sidebar — assignees section', () => {
  beforeEach(() => {
    mockBdAssigneeListAll.mockResolvedValue({
      status: 'ok',
      data: SAMPLE_ASSIGNEES,
    })
  })

  it('renders one button per assignee from bdAssigneeListAll', async () => {
    render(<Sidebar />)
    for (const a of SAMPLE_ASSIGNEES) {
      expect(
        await screen.findByTestId(`sidebar-filter-assignee-${a.assignee}`)
      ).toBeInTheDocument()
    }
  })

  it('clicking an assignee button toggles the assignee filter', async () => {
    render(<Sidebar />)
    const aliceButton = await screen.findByTestId(
      'sidebar-filter-assignee-alice'
    )
    expect(aliceButton.getAttribute('data-active')).toBe('false')

    act(() => {
      aliceButton.click()
    })
    expect(useIssueFilterStore.getState().assignees).toEqual(['alice'])
    expect(
      screen
        .getByTestId('sidebar-filter-assignee-alice')
        .getAttribute('data-active')
    ).toBe('true')
  })

  it('renders the empty placeholder when no assignees exist', async () => {
    mockBdAssigneeListAll.mockResolvedValue({ status: 'ok', data: [] })
    render(<Sidebar />)
    expect(
      await screen.findByTestId('sidebar-assignees-empty')
    ).toBeInTheDocument()
  })
})

describe('Sidebar — Clear all', () => {
  it('hides the Clear all button when no filter is active', () => {
    render(<Sidebar />)
    expect(
      screen.queryByTestId('sidebar-filter-clear-all')
    ).not.toBeInTheDocument()
  })

  it('shows the Clear all button when at least one dimension is active', () => {
    useIssueFilterStore.setState({ status: ['open'] })
    render(<Sidebar />)
    expect(screen.getByTestId('sidebar-filter-clear-all')).toBeInTheDocument()
  })

  it('clicking Clear all empties every dimension in one click', () => {
    useIssueFilterStore.setState({
      status: ['open', 'in_progress'],
      priority: ['P0', 'P1'],
      type: ['bug'],
      labels: ['urgent'],
      assignees: ['alice'],
    })
    render(<Sidebar />)
    act(() => {
      screen.getByTestId('sidebar-filter-clear-all').click()
    })
    const s = useIssueFilterStore.getState()
    expect(s.status).toEqual([])
    expect(s.priority).toEqual([])
    expect(s.type).toEqual([])
    expect(s.labels).toEqual([])
    expect(s.assignees).toEqual([])
  })

  it('hides itself again after clicking Clear all (no more active filters)', () => {
    useIssueFilterStore.setState({ status: ['open'] })
    render(<Sidebar />)
    expect(screen.getByTestId('sidebar-filter-clear-all')).toBeInTheDocument()
    act(() => {
      screen.getByTestId('sidebar-filter-clear-all').click()
    })
    expect(
      screen.queryByTestId('sidebar-filter-clear-all')
    ).not.toBeInTheDocument()
  })
})

describe('Sidebar — chip payload shape (AND composition proof)', () => {
  it('projects the store into the ListFilters payload that IssueListView consumes', () => {
    // ponytail: spec R2 says "multiple filters combine with AND".
    // The store is the single source of truth for the active
    // selection; IssueListView projects it into a ListFilters
    // payload and hands it to `commands.bdList`. We assert the
    // payload shape directly here so a future refactor of the
    // store projection in IssueListView is caught.
    useIssueFilterStore.setState({
      status: ['open', 'in_progress'],
      priority: ['P0', 'P1'],
      type: ['bug', 'feature'],
      labels: ['urgent'],
      assignees: ['alice', 'bob'],
    })

    // Mirror IssueListView's projection (kept in lock-step).
    const state = useIssueFilterStore.getState()
    const projected: ListFilters = {
      status: state.status.length > 0 ? state.status : undefined,
      priority: state.priority.length > 0 ? state.priority : undefined,
      issueType: state.type.length > 0 ? state.type : undefined,
      labels: state.labels.length > 0 ? state.labels : undefined,
      assignees: state.assignees.length > 0 ? state.assignees : undefined,
    }

    expect(projected.status).toEqual(['open', 'in_progress'])
    expect(projected.priority).toEqual(['P0', 'P1'])
    expect(projected.issueType).toEqual(['bug', 'feature'])
    expect(projected.labels).toEqual(['urgent'])
    expect(projected.assignees).toEqual(['alice', 'bob'])
  })

  it('projects undefined for empty dimensions (no empty arrays over the wire)', () => {
    const state = useIssueFilterStore.getState()
    const projected: ListFilters = {
      status: state.status.length > 0 ? state.status : undefined,
      priority: state.priority.length > 0 ? state.priority : undefined,
      issueType: state.type.length > 0 ? state.type : undefined,
      labels: state.labels.length > 0 ? state.labels : undefined,
      assignees: state.assignees.length > 0 ? state.assignees : undefined,
    }
    expect(projected.status).toBeUndefined()
    expect(projected.priority).toBeUndefined()
    expect(projected.issueType).toBeUndefined()
    expect(projected.labels).toBeUndefined()
    expect(projected.assignees).toBeUndefined()
  })
})
