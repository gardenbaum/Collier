/**
 * Tests for the InlineIssueEdit cells — M1 spec R3.
 *
 * Contract: each inline cell renders the existing badge plus a
 * native `<select>` overlay; selecting a new value fires
 * `commands.bdUpdate(cwd, id, input)` with the minimal-diff
 * UpdateInput (only the changed field). The TanStack Query cache
 * for `['beads', 'list', cwd]` is patched optimistically (so the
 * UI updates instantly) and the watcher tick reconciles the value
 * via `useBeadsInvalidation`. On mutation error, the cache is
 * reverted and an error toast fires.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import type { Issue } from '@/lib/bindings'

const { mockBdUpdate, mockBdAssigneeListAll } = vi.hoisted(() => ({
  mockBdUpdate: vi.fn(),
  mockBdAssigneeListAll: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdUpdate: mockBdUpdate,
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

// ponytail: sonner renders toasts into a portal at the document
// root; in tests we don't mount <Toaster />, so the toast text
// never lands in the DOM. Mock the toast API and assert against
// the mock instead. Same pattern as useBeadsInvalidation.test.tsx.
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

const importSut = () => import('./InlineIssueEdit')

const baseIssue: Issue = {
  id: 'beads-42',
  title: 'Original title',
  status: 'open',
  priority: 'P2',
  issue_type: 'task',
  created_at: '2026-06-17T00:00:00Z',
  updated_at: null,
  closed_at: null,
  description: null,
  owner: 'alice',
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
  // default: list-all returns two known assignees
  mockBdAssigneeListAll.mockResolvedValue({
    status: 'ok',
    data: [
      { assignee: 'alice', count: 3 },
      { assignee: 'bob', count: 2 },
    ],
  })
})

// ponytail: React 19 quirk — direct `select.value = "…"` doesn't
// fire `onChange`. Use the native-setter pattern + dispatch a
// `change` event so the component sees the change. Same fix as
// IssueCreateForm.test.tsx.
const setNativeSelect = (el: HTMLSelectElement, value: string) => {
  const proto = Object.getPrototypeOf(el) as object
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
  desc?.set?.call(el, value)
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('InlineStatusEdit', () => {
  it('renders the existing StatusPill badge inside the cell', async () => {
    const { InlineStatusEdit } = await importSut()
    render(<InlineStatusEdit cwd="/fake" issue={baseIssue} />)
    expect(screen.getByTestId('inline-status-edit')).toBeInTheDocument()
    expect(screen.getByTestId('status-pill')).toBeInTheDocument()
    expect(screen.getByTestId('status-pill').getAttribute('data-status')).toBe(
      'open'
    )
  })

  it('renders a native <select> with all 5 lifecycle statuses', async () => {
    const { InlineStatusEdit } = await importSut()
    render(<InlineStatusEdit cwd="/fake" issue={baseIssue} />)
    const select = screen.getByTestId(
      'inline-status-select'
    ) as HTMLSelectElement
    const options = Array.from(select.options).map(o => o.value)
    expect(options).toEqual([
      'open',
      'in_progress',
      'blocked',
      'deferred',
      'closed',
    ])
  })

  it('fires bdUpdate with only the changed status field on change', async () => {
    const { InlineStatusEdit } = await importSut()
    const updated: Issue = { ...baseIssue, status: 'in_progress' }
    mockBdUpdate.mockResolvedValue({ status: 'ok', data: updated })
    render(<InlineStatusEdit cwd="/fake" issue={baseIssue} />)
    const select = screen.getByTestId(
      'inline-status-select'
    ) as HTMLSelectElement
    act(() => {
      setNativeSelect(select, 'in_progress')
    })
    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalledTimes(1)
    })
    expect(mockBdUpdate).toHaveBeenCalledWith('/fake', 'beads-42', {
      status: 'in_progress',
    })
  })

  it('does NOT fire bdUpdate when the selected value equals the current value', async () => {
    const { InlineStatusEdit } = await importSut()
    mockBdUpdate.mockResolvedValue({
      status: 'ok',
      data: baseIssue,
    })
    render(<InlineStatusEdit cwd="/fake" issue={baseIssue} />)
    const select = screen.getByTestId(
      'inline-status-select'
    ) as HTMLSelectElement
    act(() => {
      setNativeSelect(select, 'open')
    })
    // Give React Query a tick to settle, then assert no mutation
    // was fired.
    await new Promise(r => setTimeout(r, 30))
    expect(mockBdUpdate).not.toHaveBeenCalled()
  })
})

describe('InlinePriorityEdit', () => {
  it('renders the existing PriorityDot badge inside the cell', async () => {
    const { InlinePriorityEdit } = await importSut()
    render(<InlinePriorityEdit cwd="/fake" issue={baseIssue} />)
    expect(screen.getByTestId('inline-priority-edit')).toBeInTheDocument()
    expect(screen.getByTestId('priority-dot')).toBeInTheDocument()
  })

  it('renders a native <select> with all 5 priorities', async () => {
    const { InlinePriorityEdit } = await importSut()
    render(<InlinePriorityEdit cwd="/fake" issue={baseIssue} />)
    const select = screen.getByTestId(
      'inline-priority-select'
    ) as HTMLSelectElement
    const options = Array.from(select.options).map(o => o.value)
    expect(options).toEqual(['P0', 'P1', 'P2', 'P3', 'P4'])
  })

  it('fires bdUpdate with only the changed priority field on change', async () => {
    const { InlinePriorityEdit } = await importSut()
    const updated: Issue = { ...baseIssue, priority: 'P0' }
    mockBdUpdate.mockResolvedValue({ status: 'ok', data: updated })
    render(<InlinePriorityEdit cwd="/fake" issue={baseIssue} />)
    const select = screen.getByTestId(
      'inline-priority-select'
    ) as HTMLSelectElement
    act(() => {
      setNativeSelect(select, 'P0')
    })
    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalledTimes(1)
    })
    expect(mockBdUpdate).toHaveBeenCalledWith('/fake', 'beads-42', {
      priority: 'P0',
    })
  })
})

describe('InlineAssigneeEdit', () => {
  it('renders the owner as visible text and exposes data-assignee', async () => {
    const { InlineAssigneeEdit } = await importSut()
    render(<InlineAssigneeEdit cwd="/fake" issue={baseIssue} />)
    const cell = screen.getByTestId('inline-assignee-edit')
    expect(cell.getAttribute('data-assignee')).toBe('alice')
    expect(cell.textContent).toContain('alice')
  })

  it('renders an em-dash for unassigned issues', async () => {
    const { InlineAssigneeEdit } = await importSut()
    render(
      <InlineAssigneeEdit cwd="/fake" issue={{ ...baseIssue, owner: null }} />
    )
    const cell = screen.getByTestId('inline-assignee-edit')
    expect(cell.getAttribute('data-assignee')).toBe('')
    expect(cell.textContent).toContain('—')
  })

  it('lists an (unassigned) option first, then the known assignees', async () => {
    const { InlineAssigneeEdit } = await importSut()
    render(<InlineAssigneeEdit cwd="/fake" issue={baseIssue} />)
    // Wait for the assignees query to resolve AND the option list
    // to populate. We can't just wait on the mock call — the
    // query result has to propagate through React Query into
    // the rendered DOM before the assertion is meaningful.
    await waitFor(() => {
      expect(mockBdAssigneeListAll).toHaveBeenCalled()
    })
    const select = screen.getByTestId(
      'inline-assignee-select'
    ) as HTMLSelectElement
    await waitFor(() => {
      const values = Array.from(select.options).map(o => o.value)
      expect(values).toContain('alice')
    })
    const values = Array.from(select.options).map(o => o.value)
    expect(values[0]).toBe('__unassigned__')
    expect(values).toContain('bob')
  })

  it('fires bdUpdate with only the changed assignee field on change', async () => {
    const { InlineAssigneeEdit } = await importSut()
    const updated: Issue = { ...baseIssue, owner: 'bob' }
    mockBdUpdate.mockResolvedValue({ status: 'ok', data: updated })
    render(<InlineAssigneeEdit cwd="/fake" issue={baseIssue} />)
    // Wait for the assignees query so the select is enabled.
    const select = screen.getByTestId(
      'inline-assignee-select'
    ) as HTMLSelectElement
    await waitFor(() => {
      expect(select.options.length).toBeGreaterThan(1)
    })
    act(() => {
      setNativeSelect(select, 'bob')
    })
    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalledTimes(1)
    })
    expect(mockBdUpdate).toHaveBeenCalledWith('/fake', 'beads-42', {
      assignee: 'bob',
    })
  })

  it('maps the (unassigned) sentinel to an empty assignee string', async () => {
    const { InlineAssigneeEdit } = await importSut()
    const updated: Issue = { ...baseIssue, owner: null }
    mockBdUpdate.mockResolvedValue({ status: 'ok', data: updated })
    // Start with an issue that IS assigned; pick __unassigned__ and
    // verify the wire payload uses the empty-string "no assignee"
    // form (matches the bindings contract).
    render(<InlineAssigneeEdit cwd="/fake" issue={baseIssue} />)
    const select = screen.getByTestId(
      'inline-assignee-select'
    ) as HTMLSelectElement
    await waitFor(() => {
      expect(select.options.length).toBeGreaterThan(1)
    })
    act(() => {
      setNativeSelect(select, '__unassigned__')
    })
    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalledTimes(1)
    })
    expect(mockBdUpdate).toHaveBeenCalledWith('/fake', 'beads-42', {
      assignee: '',
    })
  })

  it('shows a mutation error toast when bdUpdate rejects', async () => {
    const { InlineAssigneeEdit } = await importSut()
    const { toast } = await import('sonner')
    const errorToast = vi.mocked(toast.error)
    mockBdUpdate.mockRejectedValue({ type: 'NonZeroExit', stderr: 'boom' })
    render(<InlineAssigneeEdit cwd="/fake" issue={baseIssue} />)
    const select = screen.getByTestId(
      'inline-assignee-select'
    ) as HTMLSelectElement
    await waitFor(() => {
      expect(select.options.length).toBeGreaterThan(1)
    })
    act(() => {
      setNativeSelect(select, 'bob')
    })
    await waitFor(() => {
      expect(errorToast).toHaveBeenCalled()
    })
    // The mutation-error toast includes the stderr from the
    // failed bd invocation ("boom"), proving the error path
    // surfaced the right detail.
    const callArgs = errorToast.mock.calls[0]?.[0]
    expect(callArgs).toContain('boom')
  })
})

describe('InlineIssueEdit — optimistic cache patch', () => {
  it('patches the list cache optimistically on status change', async () => {
    const { InlineStatusEdit } = await importSut()
    const { QueryClient, QueryClientProvider } =
      await import('@tanstack/react-query')
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const issueList: Issue[] = [baseIssue]
    qc.setQueryData(['beads', 'list', '/fake'], issueList)
    // pending=true so the React state stays "in flight" long enough
    // to observe the patched cache; we resolve manually.
    let resolveUpdate: (v: { status: 'ok'; data: Issue }) => void = () =>
      undefined
    mockBdUpdate.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveUpdate = resolve
        })
    )
    render(
      <QueryClientProvider client={qc}>
        <InlineStatusEdit cwd="/fake" issue={baseIssue} />
      </QueryClientProvider>
    )
    const select = screen.getByTestId(
      'inline-status-select'
    ) as HTMLSelectElement
    act(() => {
      setNativeSelect(select, 'in_progress')
    })
    // While the mutation is pending, the cache should already
    // reflect the optimistic patch (status=in_progress).
    await waitFor(() => {
      const cached = qc.getQueryData<Issue[]>(['beads', 'list', '/fake'])
      expect(cached?.[0]?.status).toBe('in_progress')
    })
    // Resolve the mutation; the success path should preserve the
    // optimistic value (now authoritative from the server response).
    await act(async () => {
      resolveUpdate({
        status: 'ok',
        data: { ...baseIssue, status: 'in_progress' },
      })
    })
    const cached = qc.getQueryData<Issue[]>(['beads', 'list', '/fake'])
    expect(cached?.[0]?.status).toBe('in_progress')
  })

  it('reverts the cache patch on mutation error', async () => {
    const { InlineStatusEdit } = await importSut()
    const { QueryClient, QueryClientProvider } =
      await import('@tanstack/react-query')
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    qc.setQueryData(['beads', 'list', '/fake'], [baseIssue])
    mockBdUpdate.mockRejectedValue({ type: 'NonZeroExit', stderr: 'denied' })
    render(
      <QueryClientProvider client={qc}>
        <InlineStatusEdit cwd="/fake" issue={baseIssue} />
      </QueryClientProvider>
    )
    const select = screen.getByTestId(
      'inline-status-select'
    ) as HTMLSelectElement
    act(() => {
      setNativeSelect(select, 'closed')
    })
    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalled()
    })
    // After the error, the cache is reverted to the original
    // status — the user's optimistic change didn't persist.
    await waitFor(() => {
      const cached = qc.getQueryData<Issue[]>(['beads', 'list', '/fake'])
      expect(cached?.[0]?.status).toBe('open')
    })
  })
})

describe('InlineIssueEdit — host-event swallowing', () => {
  it('InlineStatusEdit swallows click events when swallowHostEvents is true', async () => {
    const { InlineStatusEdit } = await importSut()
    const onClick = vi.fn()
    render(
      // Wrap in a span whose onClick we want suppressed when the
      // user interacts with the inline edit.
      <span onClick={onClick}>
        <InlineStatusEdit cwd="/fake" issue={baseIssue} swallowHostEvents />
      </span>
    )
    const cell = screen.getByTestId('inline-status-edit')
    // Click on the cell should NOT bubble to the host span.
    fireEvent.click(cell)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('InlinePriorityEdit swallows click events when swallowHostEvents is true', async () => {
    const { InlinePriorityEdit } = await importSut()
    const onClick = vi.fn()
    render(
      <span onClick={onClick}>
        <InlinePriorityEdit cwd="/fake" issue={baseIssue} swallowHostEvents />
      </span>
    )
    const cell = screen.getByTestId('inline-priority-edit')
    fireEvent.click(cell)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('InlineAssigneeEdit swallows click events when swallowHostEvents is true', async () => {
    const { InlineAssigneeEdit } = await importSut()
    const onClick = vi.fn()
    render(
      <span onClick={onClick}>
        <InlineAssigneeEdit cwd="/fake" issue={baseIssue} swallowHostEvents />
      </span>
    )
    const cell = screen.getByTestId('inline-assignee-edit')
    fireEvent.click(cell)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('events propagate when swallowHostEvents is false (default)', async () => {
    const { InlineStatusEdit } = await importSut()
    const onClick = vi.fn()
    render(
      <span onClick={onClick}>
        <InlineStatusEdit cwd="/fake" issue={baseIssue} />
      </span>
    )
    const cell = screen.getByTestId('inline-status-edit')
    fireEvent.click(cell)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
