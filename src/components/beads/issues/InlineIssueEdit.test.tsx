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
// `priorityToLabel` is `@internal` and lives in the sibling file
// `./priority-label` (kept separate so `InlineIssueEdit.tsx` stays
// components-only for `react-refresh/only-export-components`). Production
// code only feeds it values from `ALL_PRIORITIES` (string form) or
// `issue.priority` (bare integer form, via `priorityToValue`), so the
// numeric + P-prefix edge-case branches are dead in the integration
// tests above. Importing it directly lets us cover the defensive
// fallbacks without spying on String.prototype or hacking through the
// JSX.
const importPriorityToLabel = () =>
  import('./priority-label').then(m => m.priorityToLabel)

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
    // ponytail: option values are the bare integer 0..4 strings
    // (matching the Rust wire format) and labels are the
    // human-friendly "P0".."P4" form. The mutation handler reads
    // `select.value` (the integer string) and the user sees
    // `P1` in the dropdown label.
    const values = Array.from(select.options).map(o => o.value)
    expect(values).toEqual(['0', '1', '2', '3', '4'])
    const labels = Array.from(select.options).map(o => o.textContent)
    expect(labels).toEqual(['P0', 'P1', 'P2', 'P3', 'P4'])
  })

  it('fires bdUpdate with only the changed priority field on change', async () => {
    const { InlinePriorityEdit } = await importSut()
    // ponytail: the <option value="..."> is the bare integer
    // string 0..4 (matching the Rust wire format) — see the
    // InlineIssueEdit component for the same convention. The
    // mutation passes the wire shape straight through to
    // `bd update`, and the deserialiser accepts both shapes, so
    // the assertion below matches the actual call payload.
    const updated: Issue = {
      ...baseIssue,
      priority: 0 as unknown as Issue['priority'],
    }
    mockBdUpdate.mockResolvedValue({ status: 'ok', data: updated })
    render(<InlinePriorityEdit cwd="/fake" issue={baseIssue} />)
    const select = screen.getByTestId(
      'inline-priority-select'
    ) as HTMLSelectElement
    act(() => {
      setNativeSelect(select, '0')
    })
    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalledTimes(1)
    })
    expect(mockBdUpdate).toHaveBeenCalledWith('/fake', 'beads-42', {
      priority: 0,
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

  // ponytail: the click branch of `hostGuardProps` (L532-534) is
  // already covered by the four tests above. The two sibling
  // branches — `onMouseDown` (L535-537) and `onKeyDown` (L538-540)
  // — fire on the same swallowHostEvents=true render but on
  // different event types. The handler shape is identical, so one
  // combined test covers both branches by asserting the parent's
  // onClick spy never fires on either event.
  it('InlineStatusEdit swallows mousedown + keydown events when swallowHostEvents is true', async () => {
    const { InlineStatusEdit } = await importSut()
    const onClick = vi.fn()
    render(
      <span onClick={onClick}>
        <InlineStatusEdit cwd="/fake" issue={baseIssue} swallowHostEvents />
      </span>
    )
    const cell = screen.getByTestId('inline-status-edit')
    fireEvent.mouseDown(cell)
    fireEvent.keyDown(cell, { key: 'Enter' })
    expect(onClick).not.toHaveBeenCalled()
  })

  // ponytail: the `else` paths of `hostGuardProps`'s onMouseDown
  // and onKeyDown handlers (the `if (swallow)` branches when
  // swallow is false) are exercised when the cell is embedded
  // without `swallowHostEvents`. The handlers still fire, but
  // they do NOT call stopPropagation — so mousedown / keydown
  // bubble normally.
  it('InlineStatusEdit mousedown + keydown propagate when swallowHostEvents is false', async () => {
    const { InlineStatusEdit } = await importSut()
    const onMouseDown = vi.fn()
    const onKeyDown = vi.fn()
    render(
      <span onMouseDown={onMouseDown} onKeyDown={onKeyDown}>
        <InlineStatusEdit cwd="/fake" issue={baseIssue} />
      </span>
    )
    const cell = screen.getByTestId('inline-status-edit')
    fireEvent.mouseDown(cell)
    fireEvent.keyDown(cell, { key: 'Enter' })
    expect(onMouseDown).toHaveBeenCalledTimes(1)
    expect(onKeyDown).toHaveBeenCalledTimes(1)
  })
})

describe('InlineIssueEdit — hover + pending state', () => {
  // ponytail: each cell renders a transparent <select> overlay
  // that's invisible until the wrapper is hovered. The
  // `opacity: hovered || mutation.isPending ? 1 : 0` ternary
  // (`selectOverlayStyle`) gates that visibility. The ternary
  // `true` branch (opacity 1) was uncovered before — the existing
  // tests never hovered the cell or kept the mutation pending
  // long enough to observe it.

  it('InlineStatusEdit hover flips the overlay opacity to 1', async () => {
    const { InlineStatusEdit } = await importSut()
    render(<InlineStatusEdit cwd="/fake" issue={baseIssue} />)
    const cell = screen.getByTestId('inline-status-edit')
    const select = screen.getByTestId(
      'inline-status-select'
    ) as HTMLSelectElement
    // Default state: not hovered, not pending → opacity 0.
    expect(select.style.opacity).toBe('0')
    act(() => {
      fireEvent.mouseEnter(cell)
    })
    expect(select.style.opacity).toBe('1')
    act(() => {
      fireEvent.mouseLeave(cell)
    })
    expect(select.style.opacity).toBe('0')
  })

  it('InlinePriorityEdit hover flips the overlay opacity to 1', async () => {
    const { InlinePriorityEdit } = await importSut()
    render(<InlinePriorityEdit cwd="/fake" issue={baseIssue} />)
    const cell = screen.getByTestId('inline-priority-edit')
    const select = screen.getByTestId(
      'inline-priority-select'
    ) as HTMLSelectElement
    expect(select.style.opacity).toBe('0')
    act(() => {
      fireEvent.mouseEnter(cell)
    })
    expect(select.style.opacity).toBe('1')
    act(() => {
      fireEvent.mouseLeave(cell)
    })
    expect(select.style.opacity).toBe('0')
  })

  it('InlineAssigneeEdit hover flips the overlay opacity to 1', async () => {
    const { InlineAssigneeEdit } = await importSut()
    render(<InlineAssigneeEdit cwd="/fake" issue={baseIssue} />)
    const cell = screen.getByTestId('inline-assignee-edit')
    const select = screen.getByTestId(
      'inline-assignee-select'
    ) as HTMLSelectElement
    expect(select.style.opacity).toBe('0')
    act(() => {
      fireEvent.mouseEnter(cell)
    })
    expect(select.style.opacity).toBe('1')
    act(() => {
      fireEvent.mouseLeave(cell)
    })
    expect(select.style.opacity).toBe('0')
  })

  it('InlineStatusEdit shows a pending badge while the mutation is in flight', async () => {
    const { InlineStatusEdit } = await importSut()
    // Keep the mutation pending so the cell renders the pending
    // badge. We resolve before unmount to avoid leaking a pending
    // mutation across tests (the test-utils cleanup hook will
    // wait for it).
    mockBdUpdate.mockImplementation(
      () => new Promise<{ status: 'ok'; data: Issue }>(() => undefined)
    )
    render(<InlineStatusEdit cwd="/fake" issue={baseIssue} />)
    const select = screen.getByTestId(
      'inline-status-select'
    ) as HTMLSelectElement
    expect(
      screen.queryByTestId('inline-status-pending')
    ).not.toBeInTheDocument()
    act(() => {
      setNativeSelect(select, 'in_progress')
    })
    await waitFor(() => {
      expect(screen.getByTestId('inline-status-pending')).toBeInTheDocument()
    })
  })

  it('InlinePriorityEdit shows a pending badge while the mutation is in flight', async () => {
    const { InlinePriorityEdit } = await importSut()
    mockBdUpdate.mockImplementation(
      () => new Promise<{ status: 'ok'; data: Issue }>(() => undefined)
    )
    render(<InlinePriorityEdit cwd="/fake" issue={baseIssue} />)
    const select = screen.getByTestId(
      'inline-priority-select'
    ) as HTMLSelectElement
    expect(
      screen.queryByTestId('inline-priority-pending')
    ).not.toBeInTheDocument()
    act(() => {
      setNativeSelect(select, '0')
    })
    await waitFor(() => {
      expect(screen.getByTestId('inline-priority-pending')).toBeInTheDocument()
    })
  })

  it('InlineAssigneeEdit shows a pending badge while the mutation is in flight', async () => {
    const { InlineAssigneeEdit } = await importSut()
    mockBdUpdate.mockImplementation(
      () => new Promise<{ status: 'ok'; data: Issue }>(() => undefined)
    )
    render(<InlineAssigneeEdit cwd="/fake" issue={baseIssue} />)
    const select = screen.getByTestId(
      'inline-assignee-select'
    ) as HTMLSelectElement
    await waitFor(() => {
      expect(select.options.length).toBeGreaterThan(1)
    })
    expect(
      screen.queryByTestId('inline-assignee-pending')
    ).not.toBeInTheDocument()
    act(() => {
      setNativeSelect(select, 'bob')
    })
    await waitFor(() => {
      expect(screen.getByTestId('inline-assignee-pending')).toBeInTheDocument()
    })
  })
})

describe('InlineIssueEdit — no-op guards', () => {
  // ponytail: each cell has a "no-op" guard that suppresses the
  // mutation when the user picks the SAME value the issue already
  // has. The status guard (L260) is already covered by the
  // 'does NOT fire bdUpdate when the selected value equals the
  // current value' test above. The priority guard (L347) and
  // assignee guard (L442) live in the same shape but were not
  // exercised — the priority guard uses `String(next) ===
  // String(issue.priority)` so the test must pick a value whose
  // string form matches the issue's current priority.
  it('InlinePriorityEdit does NOT fire bdUpdate when the selected value equals the current priority', async () => {
    const { InlinePriorityEdit } = await importSut()
    // ponytail: the source compares `String(next) === String(issue.priority)`.
    // The default baseIssue has `priority: 'P2'` so the wire value
    // (priorityToValue('P2')) is '2' and the same-as-current
    // comparison is `'2' === 'P2'` → false. Bump the issue to
    // a numeric-string priority ('2') so the guard actually trips.
    const issueP2AsWire: Issue = {
      ...baseIssue,
      priority: '2' as unknown as Issue['priority'],
    }
    mockBdUpdate.mockResolvedValue({ status: 'ok', data: issueP2AsWire })
    render(<InlinePriorityEdit cwd="/fake" issue={issueP2AsWire} />)
    const select = screen.getByTestId(
      'inline-priority-select'
    ) as HTMLSelectElement
    // The select's value (priorityToValue('2')) is '2' — same as
    // the current priority. The guard should fire and skip the
    // mutation.
    expect(select.value).toBe('2')
    act(() => {
      setNativeSelect(select, '2')
    })
    await new Promise(r => setTimeout(r, 30))
    expect(mockBdUpdate).not.toHaveBeenCalled()
  })

  it('InlineAssigneeEdit does NOT fire bdUpdate when the selected assignee matches the current owner', async () => {
    const { InlineAssigneeEdit } = await importSut()
    mockBdUpdate.mockResolvedValue({ status: 'ok', data: baseIssue })
    render(<InlineAssigneeEdit cwd="/fake" issue={baseIssue} />)
    const select = screen.getByTestId(
      'inline-assignee-select'
    ) as HTMLSelectElement
    await waitFor(() => {
      expect(select.options.length).toBeGreaterThan(1)
    })
    // baseIssue.owner is 'alice' and the default mock puts 'alice'
    // in the assignees list — selecting alice again should hit
    // the `next === (issue.owner ?? null)` guard and skip the
    // mutation.
    act(() => {
      setNativeSelect(select, 'alice')
    })
    await new Promise(r => setTimeout(r, 30))
    expect(mockBdUpdate).not.toHaveBeenCalled()
  })

  it('InlineAssigneeEdit does NOT fire bdUpdate when the unassigned option matches an unassigned owner (null branch of ??)', async () => {
    const { InlineAssigneeEdit } = await importSut()
    // ponytail: the guard reads `next === (issue.owner ?? null)`.
    // With `owner = null` and the user picking `__unassigned__`
    // (which maps to `next = null`), the `??` falls through to
    // the null branch and `null === null` trips the guard. This
    // test exercises the null branch of the `??` together with
    // the guard's no-op path.
    mockBdUpdate.mockResolvedValue({ status: 'ok', data: baseIssue })
    render(
      <InlineAssigneeEdit cwd="/fake" issue={{ ...baseIssue, owner: null }} />
    )
    const select = screen.getByTestId(
      'inline-assignee-select'
    ) as HTMLSelectElement
    await waitFor(() => {
      expect(mockBdAssigneeListAll).toHaveBeenCalled()
    })
    // Issue is already unassigned → __unassigned__ is the same value.
    expect(select.value).toBe('__unassigned__')
    act(() => {
      setNativeSelect(select, '__unassigned__')
    })
    await new Promise(r => setTimeout(r, 30))
    expect(mockBdUpdate).not.toHaveBeenCalled()
  })

  // ponytail: the `applyFieldToIssue` switch arms for 'priority'
  // (L199) and 'assignee' (L201) were not exercised — the existing
  // optimistic-cache test only flipped 'status'. The two tests
  // below trigger each arm end-to-end and assert the cache is
  // patched with the matching field. Keeps the test surface
  // identical to the existing 'patches the list cache
  // optimistically on status change' test.
  it('applyFieldToIssue priority arm patches the list cache optimistically', async () => {
    const { InlinePriorityEdit } = await importSut()
    const { QueryClient, QueryClientProvider } =
      await import('@tanstack/react-query')
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    qc.setQueryData(['beads', 'list', '/fake'], [baseIssue])
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
        <InlinePriorityEdit cwd="/fake" issue={baseIssue} />
      </QueryClientProvider>
    )
    const select = screen.getByTestId(
      'inline-priority-select'
    ) as HTMLSelectElement
    act(() => {
      setNativeSelect(select, '0')
    })
    // While the mutation is pending, the cache should already
    // reflect the optimistic priority patch (priority=0).
    await waitFor(() => {
      const cached = qc.getQueryData<Issue[]>(['beads', 'list', '/fake'])
      expect(cached?.[0]?.priority).toBe(0)
    })
    resolveUpdate({
      status: 'ok',
      data: { ...baseIssue, priority: 0 as unknown as Issue['priority'] },
    })
  })

  it('applyFieldToIssue assignee arm patches the list cache optimistically', async () => {
    const { InlineAssigneeEdit } = await importSut()
    const { QueryClient, QueryClientProvider } =
      await import('@tanstack/react-query')
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    qc.setQueryData(['beads', 'list', '/fake'], [baseIssue])
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
        <InlineAssigneeEdit cwd="/fake" issue={baseIssue} />
      </QueryClientProvider>
    )
    const select = screen.getByTestId(
      'inline-assignee-select'
    ) as HTMLSelectElement
    await waitFor(() => {
      expect(select.options.length).toBeGreaterThan(1)
    })
    act(() => {
      setNativeSelect(select, 'bob')
    })
    // While the mutation is pending, the cache should already
    // reflect the optimistic assignee patch (owner='bob').
    await waitFor(() => {
      const cached = qc.getQueryData<Issue[]>(['beads', 'list', '/fake'])
      expect(cached?.[0]?.owner).toBe('bob')
    })
    resolveUpdate({ status: 'ok', data: { ...baseIssue, owner: 'bob' } })
  })
})

describe('InlineIssueEdit — priority wire-format coverage', () => {
  // ponytail: `priorityToValue` falls back to `String(p)` when the
  // input is NOT a P-prefixed string (numeric priority, the
  // serialized Rust wire-format). The default fixture uses the
  // specta-style 'P2' string and so the fallback branch at L96
  // was never reached. Render with a numeric priority so the
  // fallback is exercised on both the select value and the
  // data-priority attribute.
  it('InlinePriorityEdit renders a numeric priority as the wire-format integer string', async () => {
    const { InlinePriorityEdit } = await importSut()
    const numericIssue: Issue = {
      ...baseIssue,
      priority: 2 as unknown as Issue['priority'],
    }
    render(<InlinePriorityEdit cwd="/fake" issue={numericIssue} />)
    const select = screen.getByTestId(
      'inline-priority-select'
    ) as HTMLSelectElement
    // The select control is controlled by priorityToValue(priority);
    // for a numeric input priorityToValue returns String(p) — the
    // wire-format integer. The matching DOM option has the value
    // '2', so the React controlled select finds it.
    expect(select.value).toBe('2')
    // The data-priority attribute mirrors issue.priority directly
    // (React stringifies the value into the DOM attribute).
    expect(select.getAttribute('data-priority')).toBe('2')
  })
})

describe('InlineAssigneeEdit — assignees query error path', () => {
  // ponytail: the assignees queryFn's `else` branch (L427-429)
  // throws when `commands.bdAssigneeListAll` returns a
  // `status: 'error'` Result. React Query catches the throw and
  // stores it in `query.error`; the component still renders the
  // unassigned option (the `(assigneesQuery.data ?? [])` fallback
  // is an empty array on error). The test mounts the cell with
  // an error Result and asserts the option list still renders.
  it('throws the bdAssigneeListAll error and renders the unassigned-only fallback', async () => {
    // The query error is logged by React Query to console.error —
    // suppress it so the test output stays clean.
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mockBdAssigneeListAll.mockResolvedValue({
      status: 'error',
      error: 'assignee catalog unavailable',
    })
    const { InlineAssigneeEdit } = await importSut()
    render(<InlineAssigneeEdit cwd="/fake" issue={baseIssue} />)
    // Allow the query to settle (the throw happens async).
    await waitFor(() => {
      expect(mockBdAssigneeListAll).toHaveBeenCalled()
    })
    const select = screen.getByTestId(
      'inline-assignee-select'
    ) as HTMLSelectElement
    // The select must still render with the (unassigned) option
    // even though the assignees query failed.
    expect(select.options.length).toBe(1)
    expect(select.options[0]?.value).toBe('__unassigned__')
    consoleErrorSpy.mockRestore()
  })
})

// ponytail: `priorityToLabel` is the helper that bridges the two wire
// shapes Rust's `#[repr(u8)] Serialize_repr` and specta's variant-name
// string union produce. The component's integration tests above only
// exercise the happy paths (string form via `ALL_PRIORITIES`, numeric
// form via `priorityToValue`). The defensive fallbacks below cover
// everything else: out-of-range integers, NaN/Infinity, non-P-prefixed
// strings, and P-prefixed strings whose suffix isn't a valid integer.
describe('priorityToLabel — direct unit tests (defensive fallbacks)', () => {
  it('maps a bare integer 0..4 to the P-form (production wire format)', async () => {
    // This is the path `priorityToValue(issue.priority)` would also
    // take if `priorityToLabel` were ever called with the integer form
    // directly (e.g. via the `PriorityDot` fallback). The numeric
    // branch (`const n = Number(p)`) and its `in-range` arm must both
    // fire to return `P2`.
    const priorityToLabel = await importPriorityToLabel()
    expect(priorityToLabel(0 as unknown as Issue['priority'])).toBe('P0')
    expect(priorityToLabel(2 as unknown as Issue['priority'])).toBe('P2')
    expect(priorityToLabel(4 as unknown as Issue['priority'])).toBe('P4')
  })

  it('falls back to String(p) when the integer is out of range', async () => {
    // 99 is finite and ≥0 but > 4, so the `Number.isFinite(n) && n >= 0 && n <= 4`
    // guard fails and we hit `return String(p)` at the bottom of the
    // function. The component never produces this shape, but if a
    // future deserializer change widens the Rust enum and a stale
    // frontend sees a value > 4, we still render *something* instead
    // of crashing the `<option>` map.
    const priorityToLabel = await importPriorityToLabel()
    expect(priorityToLabel(99 as unknown as Issue['priority'])).toBe('99')
    expect(priorityToLabel(-1 as unknown as Issue['priority'])).toBe('-1')
  })

  it('falls back to String(p) when the input is NaN or non-finite', async () => {
    // `Number.isFinite(NaN)` is false → out-of-range branch → `String(NaN)`
    // is `'NaN'`. Defensive: real data should never carry NaN, but the
    // helper is the last line of defense before the DOM render.
    const priorityToLabel = await importPriorityToLabel()
    expect(priorityToLabel(Number.NaN as unknown as Issue['priority'])).toBe(
      'NaN'
    )
    expect(
      priorityToLabel(Number.POSITIVE_INFINITY as unknown as Issue['priority'])
    ).toBe('Infinity')
  })

  it('returns the input unchanged when a P-prefixed string is out of range', async () => {
    // The string branch fires (typeof p === 'string' && p.startsWith('P')),
    // the parsed integer is finite but > 4, so the `n <= 4` arm fails
    // and we hit `return p` (the defensive fallback). Same shape that
    // a future specta bump might emit if the Rust enum gains a new
    // variant the frontend hasn't picked up yet.
    const priorityToLabel = await importPriorityToLabel()
    expect(priorityToLabel('P9' as unknown as Issue['priority'])).toBe('P9')
    expect(priorityToLabel('P42' as unknown as Issue['priority'])).toBe('P42')
  })

  it('returns the input unchanged when a P-prefixed string has a non-numeric suffix', async () => {
    // `Number.parseInt('foo', 10)` is NaN → `Number.isFinite` is false
    // → falls to `return p`. Same defensive shape as the out-of-range
    // integer case above; covered separately so the failure mode is
    // unambiguous if one branch regresses.
    const priorityToLabel = await importPriorityToLabel()
    expect(priorityToLabel('Pfoo' as unknown as Issue['priority'])).toBe('Pfoo')
    expect(priorityToLabel('P-1' as unknown as Issue['priority'])).toBe('P-1')
  })

  it('falls back to String(p) when the input is not P-prefixed and not numeric', async () => {
    // The outer `typeof p === 'string' && p.startsWith('P')` guard fails
    // (no P prefix), so we drop into the numeric branch. `Number('foo')`
    // is NaN → `Number.isFinite` is false → `return String(p)` returns
    // the original input verbatim. Same shape as a future migration
    // that renames the variant prefix.
    const priorityToLabel = await importPriorityToLabel()
    expect(priorityToLabel('foo' as unknown as Issue['priority'])).toBe('foo')
  })
})
