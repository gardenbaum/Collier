/**
 * Tests for StatusOverviewView — M2 R6 status overview cards.
 *
 * Contract:
 *   - Fetches the full issue list via `commands.bdList(cwd, {})`
 *     (the Rust command passes `--all` so closed issues are
 *     visible — see src-tauri/src/beads/list.rs).
 *   - Renders one card per status (5 known statuses in lifecycle
 *     order plus any custom statuses discovered in the data,
 *     appended alphabetically).
 *   - Each card carries `data-status`, `data-count`, and
 *     `data-percent` matching the fixture distribution. The
 *     progress bar's aria-valuenow matches the rounded percent.
 *   - Clicking a card sets the issue-filter store's `status`
 *     dimension to the clicked status and switches the workspace
 *     view to 'list'.
 *   - Loading / error / empty states are mutually exclusive.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { useIssueFilterStore } from '@/store/issue-filter-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { Issue } from '@/lib/bindings'

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

const importSut = () => import('./StatusOverviewView')

/** Issue fixture factory. Accepts any status string — including
 * Beads v2 user-defined custom statuses — because the overview
 * must render those even though the v1 type union doesn't
 * enumerate them. */
interface IssueOverrides {
  id?: string
  status: Issue['status'] | string
  title?: string
  priority?: Issue['priority']
  issue_type?: Issue['issue_type']
}

function makeIssue(overrides: IssueOverrides): Issue {
  const base = {
    id: 'beads-1',
    title: 'Ship T15b',
    priority: 'P1' as const,
    issue_type: 'task' as const,
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
  } as unknown
  return base as Issue
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reset both stores so the click-filter tests start from a
  // known empty filter selection and a known starting view.
  useIssueFilterStore.getState().clearAll()
  useIssueFilterStore.persist.clearStorage()
  useIssueFilterStore.setState({
    status: [],
    priority: [],
    type: [],
    labels: [],
    assignees: [],
  })
  useWorkspaceStore.setState({ activeView: 'status' })
})

describe('StatusOverviewView', () => {
  it('renders a loading skeleton while the query is pending', async () => {
    mockBdList.mockReturnValue(new Promise<never>(() => undefined))

    const { StatusOverviewView } = await importSut()
    render(<StatusOverviewView cwd="/fake" />)

    expect(screen.getByTestId('status-view')).toBeInTheDocument()
    expect(screen.getByTestId('status-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('status-grid')).not.toBeInTheDocument()
    expect(screen.queryByTestId('status-empty')).not.toBeInTheDocument()
  })

  it('calls bdList with the provided cwd and an empty filter', async () => {
    mockBdList.mockResolvedValue({ status: 'ok', data: [] })

    const { StatusOverviewView } = await importSut()
    render(<StatusOverviewView cwd="/repo/path" />)

    await waitFor(() => {
      expect(mockBdList).toHaveBeenCalledWith('/repo/path', {})
    })
  })

  it('renders the empty state when there are no issues', async () => {
    mockBdList.mockResolvedValue({ status: 'ok', data: [] })

    const { StatusOverviewView } = await importSut()
    render(<StatusOverviewView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('status-empty')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('status-grid')).not.toBeInTheDocument()
  })

  it('renders one card per known status with counts and percent matching the fixture', async () => {
    // The fixture seeds 25 issues with this distribution (see
    // scripts/make-fixture.sh):
    //   open(10) in_progress(3) blocked(2) deferred(2) closed(8)
    mockBdList.mockResolvedValue({
      status: 'ok',
      data: [
        // open: 10
        makeIssue({ id: 'o-1', status: 'open' }),
        makeIssue({ id: 'o-2', status: 'open' }),
        makeIssue({ id: 'o-3', status: 'open' }),
        makeIssue({ id: 'o-4', status: 'open' }),
        makeIssue({ id: 'o-5', status: 'open' }),
        makeIssue({ id: 'o-6', status: 'open' }),
        makeIssue({ id: 'o-7', status: 'open' }),
        makeIssue({ id: 'o-8', status: 'open' }),
        makeIssue({ id: 'o-9', status: 'open' }),
        makeIssue({ id: 'o-10', status: 'open' }),
        // in_progress: 3
        makeIssue({ id: 'ip-1', status: 'in_progress' }),
        makeIssue({ id: 'ip-2', status: 'in_progress' }),
        makeIssue({ id: 'ip-3', status: 'in_progress' }),
        // blocked: 2
        makeIssue({ id: 'b-1', status: 'blocked' }),
        makeIssue({ id: 'b-2', status: 'blocked' }),
        // deferred: 2
        makeIssue({ id: 'd-1', status: 'deferred' }),
        makeIssue({ id: 'd-2', status: 'deferred' }),
        // closed: 8
        makeIssue({ id: 'c-1', status: 'closed' }),
        makeIssue({ id: 'c-2', status: 'closed' }),
        makeIssue({ id: 'c-3', status: 'closed' }),
        makeIssue({ id: 'c-4', status: 'closed' }),
        makeIssue({ id: 'c-5', status: 'closed' }),
        makeIssue({ id: 'c-6', status: 'closed' }),
        makeIssue({ id: 'c-7', status: 'closed' }),
        makeIssue({ id: 'c-8', status: 'closed' }),
      ],
    })

    const { StatusOverviewView } = await importSut()
    render(<StatusOverviewView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('status-grid')).toBeInTheDocument()
    })

    const cards = screen.getAllByTestId('status-card')
    expect(cards).toHaveLength(5)

    // Lifecycle order: open, in_progress, blocked, deferred, closed.
    const expected: { status: string; count: number; percent: number }[] = [
      { status: 'open', count: 10, percent: 40 },
      { status: 'in_progress', count: 3, percent: 12 },
      { status: 'blocked', count: 2, percent: 8 },
      { status: 'deferred', count: 2, percent: 8 },
      { status: 'closed', count: 8, percent: 32 },
    ]
    for (let i = 0; i < expected.length; i++) {
      const card = cards[i]
      const exp = expected[i]
      if (!card || !exp) {
        throw new Error(`missing card or expectation at index ${i}`)
      }
      expect(card.getAttribute('data-status')).toBe(exp.status)
      expect(card.getAttribute('data-count')).toBe(String(exp.count))
      expect(card.getAttribute('data-percent')).toBe(String(exp.percent))
      const bar = card.querySelector('[data-testid="status-card-bar"]')
      expect(bar?.getAttribute('role')).toBe('progressbar')
      expect(bar?.getAttribute('aria-valuenow')).toBe(String(exp.percent))
    }

    // Footer totals: 25 issues.
    expect(screen.getByTestId('status-footer').textContent).toMatch(/25/)
  })

  it('appends custom statuses discovered in the data in alphabetical order', async () => {
    // Beads v2 allows user-defined statuses; the overview must
    // render them too so an unexpected "review" bucket still
    // shows up in the grid.
    mockBdList.mockResolvedValue({
      status: 'ok',
      data: [
        makeIssue({ id: 'o-1', status: 'open' }),
        makeIssue({ id: 'o-2', status: 'open' }),
        makeIssue({ id: 'r-1', status: 'review' }),
        makeIssue({ id: 'r-2', status: 'review' }),
        makeIssue({ id: 'r-3', status: 'review' }),
        // Add a zero-count custom status — should NOT render a
        // card because no issues carry it.
      ] as Issue[],
    })

    const { StatusOverviewView } = await importSut()
    render(<StatusOverviewView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('status-grid')).toBeInTheDocument()
    })

    const cards = screen.getAllByTestId('status-card')
    // 5 known + 1 custom (review) = 6.
    expect(cards).toHaveLength(6)
    // Custom card appended after the known lifecycle.
    const reviewCard = cards[5]
    if (!reviewCard) throw new Error('review card missing')
    expect(reviewCard.getAttribute('data-status')).toBe('review')
    expect(reviewCard.getAttribute('data-count')).toBe('3')
  })

  it('still renders cards for known statuses that have zero issues', async () => {
    // Every status bucket should be visible so the user can click
    // into an empty one to see "no items" in the list view. This
    // matches the GitHub / Jira pattern for status dashboards.
    mockBdList.mockResolvedValue({
      status: 'ok',
      data: [makeIssue({ id: 'o-1', status: 'open' })],
    })

    const { StatusOverviewView } = await importSut()
    render(<StatusOverviewView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('status-grid')).toBeInTheDocument()
    })

    const cards = screen.getAllByTestId('status-card')
    expect(cards).toHaveLength(5)
    const blockedCard = cards.find(
      c => c.getAttribute('data-status') === 'blocked'
    )
    expect(blockedCard?.getAttribute('data-count')).toBe('0')
    expect(blockedCard?.getAttribute('data-percent')).toBe('0')
  })

  it('clicking a card sets the status filter and switches the view to list', async () => {
    mockBdList.mockResolvedValue({
      status: 'ok',
      data: [
        makeIssue({ id: 'o-1', status: 'open' }),
        makeIssue({ id: 'o-2', status: 'open' }),
        makeIssue({ id: 'c-1', status: 'closed' }),
      ],
    })

    const { StatusOverviewView } = await importSut()
    render(<StatusOverviewView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('status-grid')).toBeInTheDocument()
    })

    const cards = screen.getAllByTestId('status-card')
    const closedCard = cards.find(
      c => c.getAttribute('data-status') === 'closed'
    )
    if (!closedCard) throw new Error('closed card missing')
    await fireEvent.click(closedCard)

    // Filter store: exactly the clicked status, no others.
    expect(useIssueFilterStore.getState().status).toEqual(['closed'])
    // Workspace view switched to list.
    expect(useWorkspaceStore.getState().activeView).toBe('list')
  })

  it('clicking a card when other statuses are active replaces them with the clicked one', async () => {
    // Pre-existing filter from another view — clicking a card
    // must normalise the status dimension to exactly the
    // clicked value, not add to it.
    useIssueFilterStore.setState({ status: ['open', 'in_progress'] })

    mockBdList.mockResolvedValue({
      status: 'ok',
      data: [
        makeIssue({ id: 'o-1', status: 'open' }),
        makeIssue({ id: 'ip-1', status: 'in_progress' }),
        makeIssue({ id: 'c-1', status: 'closed' }),
      ],
    })

    const { StatusOverviewView } = await importSut()
    render(<StatusOverviewView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('status-grid')).toBeInTheDocument()
    })

    const closedCard = screen
      .getAllByTestId('status-card')
      .find(c => c.getAttribute('data-status') === 'closed')
    if (!closedCard) throw new Error('closed card missing')
    await fireEvent.click(closedCard)

    // The other statuses were removed and only `closed` remains.
    expect(useIssueFilterStore.getState().status).toEqual(['closed'])
    expect(useWorkspaceStore.getState().activeView).toBe('list')
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

    const { StatusOverviewView } = await importSut()
    render(<StatusOverviewView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('status-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('status-error').textContent).toContain(
      'not a beads repository'
    )
    expect(screen.queryByTestId('status-grid')).not.toBeInTheDocument()
    expect(screen.queryByTestId('status-empty')).not.toBeInTheDocument()
  })

  it('renders the raw status string as the label for a custom status with no i18n entry', async () => {
    // Custom (Beads-v2-defined) statuses are not present in
    // STATUS_I18N_KEY, so the label lookup
    // `t(`beads.status.${STATUS_I18N_KEY[status] ?? status}`)` must
    // fall through to the raw status string. Previously a custom
    // card was rendered but its label was never asserted, so the
    // `?? status` branch on line 281 was uncovered.
    mockBdList.mockResolvedValue({
      status: 'ok',
      data: [
        makeIssue({ id: 'o-1', status: 'open' }),
        makeIssue({ id: 'r-1', status: 'review' }),
        makeIssue({ id: 'r-2', status: 'review' }),
        makeIssue({ id: 'r-3', status: 'review' }),
      ],
    })

    const { StatusOverviewView } = await importSut()
    render(<StatusOverviewView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('status-grid')).toBeInTheDocument()
    })

    // The custom 'review' card is appended after the 5 known ones.
    const reviewCard = screen
      .getAllByTestId('status-card')
      .find(c => c.getAttribute('data-status') === 'review')
    if (!reviewCard) throw new Error('review card missing')

    // The visible label element is the second <span> inside the
    // header (the first is the colored dot). It must equal the
    // raw status string, not 'beads.status.review' or any i18n key.
    const spans = Array.from(reviewCard.querySelectorAll('span'))
    const labelEl = spans.find(s => s.textContent === 'review')
    expect(labelEl).toBeDefined()
  })

  it('clicking a card whose status is already in the filter keeps only that status', async () => {
    // The click handler normalises the status filter to exactly
    // the clicked value. Pre-seed an existing filter that already
    // contains the clicked status (`['open', 'closed']`) so the
    // for-loop on line 361 hits its `s === card.key` branch (no
    // toggle) and the guard on line 363 hits its false branch
    // (current.includes(card.key) is true, no extra toggle).
    useIssueFilterStore.setState({ status: ['open', 'closed'] })

    mockBdList.mockResolvedValue({
      status: 'ok',
      data: [
        makeIssue({ id: 'o-1', status: 'open' }),
        makeIssue({ id: 'c-1', status: 'closed' }),
      ],
    })

    const { StatusOverviewView } = await importSut()
    render(<StatusOverviewView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('status-grid')).toBeInTheDocument()
    })

    const closedCard = screen
      .getAllByTestId('status-card')
      .find(c => c.getAttribute('data-status') === 'closed')
    if (!closedCard) throw new Error('closed card missing')
    await fireEvent.click(closedCard)

    // 'open' was removed (for-loop toggle on line 361 with
    // s !== 'closed'), 'closed' was NOT re-toggled (line 363 false
    // branch — it was already in the filter). Result is exactly
    // `['closed']`.
    expect(useIssueFilterStore.getState().status).toEqual(['closed'])
    expect(useWorkspaceStore.getState().activeView).toBe('list')
  })
})
