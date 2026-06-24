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
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'

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
})
