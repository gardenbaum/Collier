/**
 * Tests for the StatusListView component.
 *
 * Contract: StatusListView delegates to `queryFn(cwd)` via TanStack
 * Query, shows a loading skeleton while the query is pending, shows
 * an error state when the Result is `error`, and renders one row
 * per `Issue` on success. The per-status copy (heading, empty-state
 * icon / title / body, error fallback) and the testid prefix come
 * from props. The wrapper-specific tests for `BlockedView` /
 * `ReadyView` cover the per-status props; this suite exercises the
 * shared rendering surface end-to-end with a mock IPC.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { Inbox } from 'lucide-react'
import { render } from '@/test/test-utils'

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const importSut = () => import('./StatusListView')

const issueA = {
  id: 'beads-7',
  title: 'Waiting on review',
  status: 'blocked' as const,
  priority: 'P2' as const,
  issue_type: 'task' as const,
  created_at: '2026-06-16T00:00:00Z',
  updated_at: null,
  closed_at: null,
  description: null,
  owner: null,
  labels: [],
  dependencies: [],
  dependency_count: 1,
  dependent_count: 0,
  comment_count: 0,
  parent: null,
  acceptance_criteria: null,
  external_ref: null,
}

const issueB = {
  id: 'beads-8',
  title: 'Blocked by infra',
  status: 'blocked' as const,
  priority: 'P3' as const,
  issue_type: 'chore' as const,
  created_at: '2026-06-16T00:00:00Z',
  updated_at: null,
  closed_at: null,
  description: null,
  owner: null,
  labels: [],
  dependencies: [],
  dependency_count: 2,
  dependent_count: 0,
  comment_count: 0,
  parent: null,
  acceptance_criteria: null,
  external_ref: null,
}

type IssueFixture = typeof issueA
type FetchResult =
  | { status: 'ok'; data: IssueFixture[] }
  | { status: 'error'; error: unknown }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('StatusListView', () => {
  it('renders a loading skeleton while the query is pending', async () => {
    const queryFn = vi.fn(() => new Promise<FetchResult>(() => undefined))

    const { StatusListView } = await importSut()
    render(
      <StatusListView
        cwd="/fake"
        queryKey={['beads', 'test-status']}
        queryFn={queryFn as never}
        heading="Test Status"
        testidPrefix="test"
        emptyIcon={Inbox}
        emptyTitle="Nothing here"
        emptyBody="Items matching this status will appear here."
        errorFallback="Failed to load items."
      />
    )

    expect(screen.getByTestId('test-view')).toBeInTheDocument()
    expect(screen.getByTestId('test-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('test-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('test-error')).not.toBeInTheDocument()
    expect(screen.queryByTestId('test-list')).not.toBeInTheDocument()
  })

  it('calls queryFn with the provided cwd', async () => {
    const queryFn = vi.fn(async () => ({
      status: 'ok' as const,
      data: [] as (typeof issueA)[],
    }))

    const { StatusListView } = await importSut()
    render(
      <StatusListView
        cwd="/repo/path"
        queryKey={['beads', 'test-status']}
        queryFn={queryFn as never}
        heading="Test Status"
        testidPrefix="test"
        emptyIcon={Inbox}
        emptyTitle="Nothing here"
        emptyBody="Items matching this status will appear here."
        errorFallback="Failed to load items."
      />
    )

    await waitFor(() => {
      expect(queryFn).toHaveBeenCalledWith('/repo/path')
    })
  })

  it('renders one row per issue with badge, title, and id on success', async () => {
    const queryFn = vi.fn(async () => ({
      status: 'ok' as const,
      data: [issueA, issueB],
    }))

    const { StatusListView } = await importSut()
    render(
      <StatusListView
        cwd="/fake"
        queryKey={['beads', 'test-status']}
        queryFn={queryFn as never}
        heading="Test Status"
        testidPrefix="test"
        emptyIcon={Inbox}
        emptyTitle="Nothing here"
        emptyBody="Items matching this status will appear here."
        errorFallback="Failed to load items."
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('test-list')).toBeInTheDocument()
    })

    const rows = screen.getAllByTestId('test-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.getAttribute('data-issue-id')).toBe('beads-7')
    expect(rows[1]?.getAttribute('data-issue-id')).toBe('beads-8')

    expect(rows[0]?.textContent).toContain('Waiting on review')
    expect(rows[1]?.textContent).toContain('Blocked by infra')

    expect(screen.getByText('beads-7')).toBeInTheDocument()
    expect(screen.getByText('beads-8')).toBeInTheDocument()

    // Badges per row.
    expect(rows[0]?.querySelector('[data-testid="status-pill"]')).toBeTruthy()
    expect(rows[0]?.querySelector('[data-testid="priority-dot"]')).toBeTruthy()
    expect(rows[0]?.querySelector('[data-testid="type-icon"]')).toBeTruthy()

    // Heading shows the count + the supplied heading prop.
    expect(
      screen.getByRole('heading', { name: /Test Status \(2\)/ })
    ).toBeInTheDocument()
  })

  it('renders the empty state when the result is an empty array', async () => {
    const queryFn = vi.fn(async () => ({
      status: 'ok' as const,
      data: [] as (typeof issueA)[],
    }))

    const { StatusListView } = await importSut()
    render(
      <StatusListView
        cwd="/fake"
        queryKey={['beads', 'test-status']}
        queryFn={queryFn as never}
        heading="Test Status"
        testidPrefix="test"
        emptyIcon={Inbox}
        emptyTitle="Nothing here"
        emptyBody="Items matching this status will appear here."
        errorFallback="Failed to load items."
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('test-empty')).toBeInTheDocument()
    })
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Test Status \(0\)/ })
    ).toBeInTheDocument()
  })

  it('renders the error state when queryFn returns an error result', async () => {
    const queryFn = vi.fn(async () => ({
      status: 'error' as const,
      error: { type: 'NotARepo', path: '/fake' },
    }))

    const { StatusListView } = await importSut()
    render(
      <StatusListView
        cwd="/fake"
        queryKey={['beads', 'test-status']}
        queryFn={queryFn as never}
        heading="Test Status"
        testidPrefix="test"
        emptyIcon={Inbox}
        emptyTitle="Nothing here"
        emptyBody="Items matching this status will appear here."
        errorFallback="Failed to load items."
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('test-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('test-error').textContent).toContain('NotARepo')
    expect(screen.queryByTestId('test-list')).not.toBeInTheDocument()
    expect(screen.queryByTestId('test-empty')).not.toBeInTheDocument()
  })

  it('renders the dep badge for issues with their blocker count', async () => {
    // The dep badge is wired into IssueSummaryRow regardless of the
    // parent view's status semantics, so the badge is part of the
    // shared surface and lives in this suite.
    const queryFn = vi.fn(async () => ({
      status: 'ok' as const,
      data: [issueA, issueB],
    }))

    const { StatusListView } = await importSut()
    render(
      <StatusListView
        cwd="/fake"
        queryKey={['beads', 'test-status']}
        queryFn={queryFn as never}
        heading="Test Status"
        testidPrefix="test"
        emptyIcon={Inbox}
        emptyTitle="Nothing here"
        emptyBody="Items matching this status will appear here."
        errorFallback="Failed to load items."
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('test-list')).toBeInTheDocument()
    })

    const rows = screen.getAllByTestId('test-row')
    const badgeA = rows[0]?.querySelector('[data-testid="dep-badge"]')
    expect(badgeA).not.toBeNull()
    expect(badgeA?.getAttribute('data-blocked-by')).toBe('1')
    expect(badgeA?.textContent).toContain('blocked by 1')
    const badgeB = rows[1]?.querySelector('[data-testid="dep-badge"]')
    expect(badgeB).not.toBeNull()
    expect(badgeB?.getAttribute('data-blocked-by')).toBe('2')
    expect(badgeB?.textContent).toContain('blocked by 2')
  })

  it('does not use the accent color anywhere in the rendered output', async () => {
    const queryFn = vi.fn(async () => ({
      status: 'ok' as const,
      data: [issueA, issueB],
    }))

    const { StatusListView } = await importSut()
    const { container } = render(
      <StatusListView
        cwd="/fake"
        queryKey={['beads', 'test-status']}
        queryFn={queryFn as never}
        heading="Test Status"
        testidPrefix="test"
        emptyIcon={Inbox}
        emptyTitle="Nothing here"
        emptyBody="Items matching this status will appear here."
        errorFallback="Failed to load items."
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('test-list')).toBeInTheDocument()
    })

    // ponytail: AC-14 — accent is reserved for destructive + P0.
    // The test issues are P2/P3 so no row should reach for accent.
    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })
})
