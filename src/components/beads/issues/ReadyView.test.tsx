/**
 * Tests for the ReadyView list component.
 *
 * Contract: ReadyView calls `commands.bdReady(cwd)` via TanStack Query,
 * shows a loading skeleton while the query is pending, shows an error
 * state when the Result is `error`, and renders one row per `Issue` on
 * success. Each row shows PriorityDot, TypeIcon, StatusPill, title, and
 * the issue id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@/test/test-utils'

// ponytail: hoisted so the vi.mock factory can reference the mock fn.
// `bdReady` is never resolves for the loading test (we just check
// the skeleton renders), and resolves with controlled payloads for
// the success and error tests.
const { mockBdReady } = vi.hoisted(() => ({
  mockBdReady: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdReady: mockBdReady,
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

const importSut = () => import('./ReadyView')

const issueA = {
  id: 'beads-1',
  title: 'Ship T18',
  status: 'open' as const,
  priority: 'P1' as const,
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
  parent: null,
  acceptance_criteria: null,
  external_ref: null,
}

const issueB = {
  id: 'beads-2',
  title: 'Wire sidebar',
  status: 'in_progress' as const,
  priority: 'P0' as const,
  issue_type: 'bug' as const,
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
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ReadyView', () => {
  it('renders a loading skeleton while the query is pending', async () => {
    // Never-resolving promise keeps the query in `pending` state.
    mockBdReady.mockReturnValue(new Promise<never>(() => undefined))

    const { ReadyView } = await importSut()
    render(<ReadyView cwd="/fake" />)

    expect(screen.getByTestId('ready-view')).toBeInTheDocument()
    expect(screen.getByTestId('ready-loading')).toBeInTheDocument()
    // Empty/error/list branches are mutually exclusive with loading.
    expect(screen.queryByTestId('ready-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ready-error')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ready-list')).not.toBeInTheDocument()
  })

  it('calls bdReady with the provided cwd', async () => {
    mockBdReady.mockResolvedValue({ status: 'ok', data: [] })

    const { ReadyView } = await importSut()
    render(<ReadyView cwd="/repo/path" />)

    await waitFor(() => {
      expect(mockBdReady).toHaveBeenCalledWith('/repo/path')
    })
  })

  it('renders one row per issue with badge, title, and id on success', async () => {
    mockBdReady.mockResolvedValue({ status: 'ok', data: [issueA, issueB] })

    const { ReadyView } = await importSut()
    render(<ReadyView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('ready-list')).toBeInTheDocument()
    })

    const rows = screen.getAllByTestId('ready-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.getAttribute('data-issue-id')).toBe('beads-1')
    expect(rows[1]?.getAttribute('data-issue-id')).toBe('beads-2')

    // Title text appears inside each row.
    expect(rows[0]?.textContent).toContain('Ship T18')
    expect(rows[1]?.textContent).toContain('Wire sidebar')

    // The id badge is rendered.
    expect(screen.getByText('beads-1')).toBeInTheDocument()
    expect(screen.getByText('beads-2')).toBeInTheDocument()

    // Badges present per row.
    expect(rows[0]?.querySelector('[data-testid="status-pill"]')).toBeTruthy()
    expect(rows[0]?.querySelector('[data-testid="priority-dot"]')).toBeTruthy()
    expect(rows[0]?.querySelector('[data-testid="type-icon"]')).toBeTruthy()

    // Heading shows the count.
    expect(
      screen.getByRole('heading', { name: /Ready \(2\)/ })
    ).toBeInTheDocument()
  })

  it('renders the empty state when the result is an empty array', async () => {
    mockBdReady.mockResolvedValue({ status: 'ok', data: [] })

    const { ReadyView } = await importSut()
    render(<ReadyView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('ready-empty')).toBeInTheDocument()
    })
    expect(screen.getByText('No ready work')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Ready \(0\)/ })
    ).toBeInTheDocument()
  })

  it('renders the error state when bdReady returns an error', async () => {
    mockBdReady.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: 'no workspace',
      },
    })

    const { ReadyView } = await importSut()
    render(<ReadyView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('ready-error')).toBeInTheDocument()
    })
    // Stderr is included so the user sees the underlying reason.
    expect(screen.getByTestId('ready-error').textContent).toContain(
      'no workspace'
    )
    // List and empty are mutually exclusive with error.
    expect(screen.queryByTestId('ready-list')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ready-empty')).not.toBeInTheDocument()
  })

  it('does not use the accent color anywhere in the rendered output', async () => {
    mockBdReady.mockResolvedValue({ status: 'ok', data: [issueA, issueB] })

    const { ReadyView } = await importSut()
    const { container } = render(<ReadyView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('ready-list')).toBeInTheDocument()
    })

    // ponytail: AC-14 — the brand colour is reserved for destructive
    // actions and the P0 priority badge only. StatusPill/PriorityDot
    // for non-P0 rows must not surface the accent.
    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })

  it('renders the dep badge for ready issues that have dependents', async () => {
    // M3 R8: ready issues have no open blockers, so the
    // "blocked by" chip is always absent. The "blocks" chip can
    // still surface (a ready task can still gate downstream
    // work). The row must show the count when > 0.
    const readyWithDependents = {
      ...issueA,
      dependency_count: 0,
      dependent_count: 2,
    }
    mockBdReady.mockResolvedValue({
      status: 'ok',
      data: [readyWithDependents],
    })

    const { ReadyView } = await importSut()
    render(<ReadyView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('ready-list')).toBeInTheDocument()
    })

    const row = screen.getByTestId('ready-row')
    const badge = row.querySelector('[data-testid="dep-badge"]')
    expect(badge).not.toBeNull()
    // No "blocked by" — ready issues are unblocked by definition.
    expect(badge?.getAttribute('data-blocked-by')).toBeNull()
    expect(badge?.getAttribute('data-blocks')).toBe('2')
    expect(badge?.textContent).toContain('blocks 2')
  })

  it('omits the dep badge when both counts are zero', async () => {
    mockBdReady.mockResolvedValue({ status: 'ok', data: [issueA] })

    const { ReadyView } = await importSut()
    render(<ReadyView cwd="/fake" />)

    await waitFor(() => {
      expect(screen.getByTestId('ready-list')).toBeInTheDocument()
    })

    const row = screen.getByTestId('ready-row')
    expect(row.querySelector('[data-testid="dep-badge"]')).toBeNull()
  })
})
