/**
 * Tests for the BlockedView list component.
 *
 * Contract: BlockedView calls `commands.bdBlocked(cwd)` via TanStack Query,
 * shows a loading skeleton while the query is pending, shows an error
 * state when the Result is `error`, and renders one row per `Issue` on
 * success. Each row shows PriorityDot, TypeIcon, StatusPill, title, and
 * the issue id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@/test/test-utils'

const { mockBdBlocked } = vi.hoisted(() => ({
  mockBdBlocked: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdBlocked: mockBdBlocked,
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

const importSut = () => import('./BlockedView')

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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BlockedView', () => {
  it('renders a loading skeleton while the query is pending', async () => {
    mockBdBlocked.mockReturnValue(new Promise<never>(() => undefined))

    const { BlockedView } = await importSut()
    render(<BlockedView cwd="/fake" />)

    expect(screen.getByTestId('blocked-view')).toBeInTheDocument()
    expect(screen.getByTestId('blocked-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('blocked-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('blocked-error')).not.toBeInTheDocument()
    expect(screen.queryByTestId('blocked-list')).not.toBeInTheDocument()
  })

  it('calls bdBlocked with the provided cwd', async () => {
    mockBdBlocked.mockResolvedValue({ status: 'ok', data: [] })

    const { BlockedView } = await importSut()
    render(<BlockedView cwd="/repo/path" />)

    await waitFor(() => {
      expect(mockBdBlocked).toHaveBeenCalledWith('/repo/path')
    })
  })

  it('renders one row per issue with badge, title, and id on success', async () => {
    mockBdBlocked.mockResolvedValue({ status: 'ok', data: [issueA, issueB] })

    const { BlockedView } = await importSut()
    render(<BlockedView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('blocked-list')).toBeInTheDocument()
    })

    const rows = screen.getAllByTestId('blocked-row')
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

    // Heading shows the count.
    expect(
      screen.getByRole('heading', { name: /Blocked \(2\)/ })
    ).toBeInTheDocument()
  })

  it('renders the empty state when the result is an empty array', async () => {
    mockBdBlocked.mockResolvedValue({ status: 'ok', data: [] })

    const { BlockedView } = await importSut()
    render(<BlockedView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('blocked-empty')).toBeInTheDocument()
    })
    expect(screen.getByText('Nothing blocked')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Blocked \(0\)/ })
    ).toBeInTheDocument()
  })

  it('renders the error state when bdBlocked returns an error', async () => {
    mockBdBlocked.mockResolvedValue({
      status: 'error',
      error: { type: 'NotARepo', path: '/fake' },
    })

    const { BlockedView } = await importSut()
    render(<BlockedView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('blocked-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('blocked-error').textContent).toContain(
      'NotARepo'
    )
    expect(screen.queryByTestId('blocked-list')).not.toBeInTheDocument()
    expect(screen.queryByTestId('blocked-empty')).not.toBeInTheDocument()
  })

  it('does not use the accent color anywhere in the rendered output', async () => {
    mockBdBlocked.mockResolvedValue({ status: 'ok', data: [issueA, issueB] })

    const { BlockedView } = await importSut()
    const { container } = render(<BlockedView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('blocked-list')).toBeInTheDocument()
    })

    // ponytail: AC-14 — accent is reserved for destructive + P0.
    // Blocked rows are P2/P3 here so no row should reach for accent.
    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })

  it('renders the dep badge for blocked issues with their blocker count', async () => {
    // M3 R8: BlockedView is the canonical surface for "this issue
    // is stuck on a dep". The row must surface a "blocked by N"
    // chip on every blocked issue with dependency_count > 0.
    // The fixture (TASK_OPT, TASK_REFAC) seeds the same shape.
    mockBdBlocked.mockResolvedValue({ status: 'ok', data: [issueA, issueB] })

    const { BlockedView } = await importSut()
    render(<BlockedView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('blocked-list')).toBeInTheDocument()
    })

    const rows = screen.getAllByTestId('blocked-row')
    // Row A has 1 blocker — "blocked by 1" chip.
    const badgeA = rows[0]?.querySelector('[data-testid="dep-badge"]')
    expect(badgeA).not.toBeNull()
    expect(badgeA?.getAttribute('data-blocked-by')).toBe('1')
    expect(badgeA?.textContent).toContain('blocked by 1')
    // Row B has 2 blockers — "blocked by 2" chip.
    const badgeB = rows[1]?.querySelector('[data-testid="dep-badge"]')
    expect(badgeB).not.toBeNull()
    expect(badgeB?.getAttribute('data-blocked-by')).toBe('2')
    expect(badgeB?.textContent).toContain('blocked by 2')
  })
})
