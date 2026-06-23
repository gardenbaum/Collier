/**
 * Tests for the InlineDescriptionEdit component — M1 spec R4.
 *
 * Contract: a click-to-edit textarea that mutates the issue's
 * description via `commands.bdUpdate(cwd, id, { description })`.
 * Optimistic UI patches the TanStack Query cache for
 * `['beads', 'list', cwd]` and `['beads', 'show', cwd, issueId]`
 * and reverts on error. Empty / whitespace-only submissions
 * collapse to `null` (bd's "no description" sentinel).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@/test/test-utils'
import type { Issue } from '@/lib/bindings'

const { mockBdUpdate } = vi.hoisted(() => ({
  mockBdUpdate: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdUpdate: mockBdUpdate,
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

// ponytail: sonner renders toasts into a portal; tests don't mount
// <Toaster /> so the toast text never lands in the DOM. Mock the
// toast API and assert against the mock instead (same pattern as
// InlineIssueEdit.test.tsx).
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

const importSut = () => import('./InlineDescriptionEdit')

const baseIssue: Issue = {
  id: 'beads-42',
  title: 'Original title',
  status: 'open',
  priority: 'P2',
  issue_type: 'task',
  created_at: '2026-06-17T00:00:00Z',
  updated_at: null,
  closed_at: null,
  description: 'The widget is on fire. Please put it out.',
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
})

describe('InlineDescriptionEdit — display', () => {
  it('renders the current description text', async () => {
    const { InlineDescriptionEdit } = await importSut()
    render(<InlineDescriptionEdit cwd="/repo" issue={baseIssue} />)

    expect(screen.getByTestId('description-text').textContent).toBe(
      'The widget is on fire. Please put it out.'
    )
  })

  it('renders the empty state when description is null', async () => {
    const { InlineDescriptionEdit } = await importSut()
    render(
      <InlineDescriptionEdit
        cwd="/repo"
        issue={{ ...baseIssue, description: null }}
      />
    )

    expect(screen.getByTestId('description-empty-text').textContent).toMatch(
      /no description/i
    )
  })

  it('renders the empty state when description is an empty string', async () => {
    const { InlineDescriptionEdit } = await importSut()
    render(
      <InlineDescriptionEdit
        cwd="/repo"
        issue={{ ...baseIssue, description: '' }}
      />
    )

    // ponytail: the empty-string case is equivalent to null for
    // the user — both mean "no description was set". We treat them
    // identically so the UI doesn't leak the underlying bd storage
    // detail.
    expect(screen.getByTestId('description-empty-text')).toBeInTheDocument()
    expect(screen.queryByTestId('description-text')).not.toBeInTheDocument()
  })

  it('shows an "Edit" button when description is set', async () => {
    const { InlineDescriptionEdit } = await importSut()
    render(<InlineDescriptionEdit cwd="/repo" issue={baseIssue} />)

    const button = screen.getByTestId('inline-description-edit-button')
    expect(button.textContent?.toLowerCase()).toContain('edit')
  })

  it('shows an "Add description" button when description is empty', async () => {
    const { InlineDescriptionEdit } = await importSut()
    render(
      <InlineDescriptionEdit
        cwd="/repo"
        issue={{ ...baseIssue, description: null }}
      />
    )

    const button = screen.getByTestId('inline-description-edit-button')
    expect(button.textContent?.toLowerCase()).toContain('add')
  })
})

describe('InlineDescriptionEdit — edit flow', () => {
  it('clicking Edit reveals a textarea seeded with the current value', async () => {
    const { InlineDescriptionEdit } = await importSut()
    render(<InlineDescriptionEdit cwd="/repo" issue={baseIssue} />)

    fireEvent.click(screen.getByTestId('inline-description-edit-button'))

    const textarea = screen.getByTestId(
      'inline-description-textarea'
    ) as HTMLTextAreaElement
    expect(textarea).toBeInTheDocument()
    expect(textarea.value).toBe('The widget is on fire. Please put it out.')
  })

  it('clicking Cancel hides the form without firing bdUpdate', async () => {
    const { InlineDescriptionEdit } = await importSut()
    render(<InlineDescriptionEdit cwd="/repo" issue={baseIssue} />)

    fireEvent.click(screen.getByTestId('inline-description-edit-button'))
    fireEvent.change(screen.getByTestId('inline-description-textarea'), {
      target: { value: 'new draft that should NOT be persisted' },
    })
    fireEvent.click(screen.getByTestId('inline-description-cancel'))

    expect(mockBdUpdate).not.toHaveBeenCalled()
    expect(
      screen.queryByTestId('inline-description-edit-form')
    ).not.toBeInTheDocument()
    // Back to display mode with the original text.
    expect(screen.getByTestId('description-text').textContent).toBe(
      'The widget is on fire. Please put it out.'
    )
  })

  it('clicking Save fires bdUpdate with { description } only', async () => {
    const { InlineDescriptionEdit } = await importSut()
    mockBdUpdate.mockResolvedValue({
      status: 'ok',
      data: { ...baseIssue, description: 'Updated body text.' },
    })
    render(<InlineDescriptionEdit cwd="/repo" issue={baseIssue} />)

    fireEvent.click(screen.getByTestId('inline-description-edit-button'))
    fireEvent.change(screen.getByTestId('inline-description-textarea'), {
      target: { value: 'Updated body text.' },
    })
    fireEvent.click(screen.getByTestId('inline-description-save'))

    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalledTimes(1)
    })
    // ponytail: minimal-diff — only the description field, no
    // title / status / priority / assignee leaks. Sending the full
    // struct would cause the CLI to write a no-op history entry
    // for every unchanged field.
    expect(mockBdUpdate).toHaveBeenCalledWith('/repo', 'beads-42', {
      description: 'Updated body text.',
    })
  })

  it('collapses whitespace-only drafts to null when saving', async () => {
    const { InlineDescriptionEdit } = await importSut()
    mockBdUpdate.mockResolvedValue({
      status: 'ok',
      data: { ...baseIssue, description: null },
    })
    render(<InlineDescriptionEdit cwd="/repo" issue={baseIssue} />)

    fireEvent.click(screen.getByTestId('inline-description-edit-button'))
    fireEvent.change(screen.getByTestId('inline-description-textarea'), {
      target: { value: '   \n  ' },
    })
    fireEvent.click(screen.getByTestId('inline-description-save'))

    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalledWith('/repo', 'beads-42', {
        description: null,
      })
    })
  })

  it('does not fire bdUpdate when the draft equals the current value', async () => {
    const { InlineDescriptionEdit } = await importSut()
    render(<InlineDescriptionEdit cwd="/repo" issue={baseIssue} />)

    fireEvent.click(screen.getByTestId('inline-description-edit-button'))
    // textarea is seeded with the current value; click Save without changes.
    fireEvent.click(screen.getByTestId('inline-description-save'))

    expect(mockBdUpdate).not.toHaveBeenCalled()
    // Form closes anyway.
    expect(
      screen.queryByTestId('inline-description-edit-form')
    ).not.toBeInTheDocument()
  })

  it('saves null when the user clears a previously-set description', async () => {
    const { InlineDescriptionEdit } = await importSut()
    mockBdUpdate.mockResolvedValue({
      status: 'ok',
      data: { ...baseIssue, description: null },
    })
    render(<InlineDescriptionEdit cwd="/repo" issue={baseIssue} />)

    fireEvent.click(screen.getByTestId('inline-description-edit-button'))
    fireEvent.change(screen.getByTestId('inline-description-textarea'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByTestId('inline-description-save'))

    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalledWith('/repo', 'beads-42', {
        description: null,
      })
    })
  })

  it('exits edit mode after a successful save (form closes)', async () => {
    // ponytail: in production the parent (IssueDetailView) observes
    // the show cache via useQuery, so the new issue flows back down
    // to InlineDescriptionEdit as a prop and the displayed text
    // updates. The optimistic-cache test above already verifies
    // that side of the contract. Here we only assert the local
    // edit-state machine (form opens, user saves, form closes).
    const { InlineDescriptionEdit } = await importSut()
    mockBdUpdate.mockResolvedValue({
      status: 'ok',
      data: { ...baseIssue, description: 'Persisted value' },
    })
    render(<InlineDescriptionEdit cwd="/repo" issue={baseIssue} />)

    fireEvent.click(screen.getByTestId('inline-description-edit-button'))
    fireEvent.change(screen.getByTestId('inline-description-textarea'), {
      target: { value: 'Persisted value' },
    })
    fireEvent.click(screen.getByTestId('inline-description-save'))

    await waitFor(() => {
      expect(
        screen.queryByTestId('inline-description-edit-form')
      ).not.toBeInTheDocument()
    })
  })

  it('renders the mutation error inline when bdUpdate rejects', async () => {
    const { InlineDescriptionEdit } = await importSut()
    mockBdUpdate.mockRejectedValue({
      type: 'NonZeroExit',
      stderr: 'permission denied',
    })
    render(<InlineDescriptionEdit cwd="/repo" issue={baseIssue} />)

    fireEvent.click(screen.getByTestId('inline-description-edit-button'))
    fireEvent.change(screen.getByTestId('inline-description-textarea'), {
      target: { value: 'will fail' },
    })
    fireEvent.click(screen.getByTestId('inline-description-save'))

    await waitFor(() => {
      expect(screen.getByTestId('inline-description-error')).toBeInTheDocument()
    })
    // Error surfaces the bd stderr — same shape as InlineIssueEdit.
    expect(
      screen.getByTestId('inline-description-error').textContent
    ).toContain('permission denied')
    // The form stays open so the user can retry or cancel.
    expect(
      screen.getByTestId('inline-description-edit-form')
    ).toBeInTheDocument()
  })

  it('toasts an error when bdUpdate rejects', async () => {
    const { InlineDescriptionEdit } = await importSut()
    const { toast } = await import('sonner')
    const errorToast = vi.mocked(toast.error)
    mockBdUpdate.mockRejectedValue({
      type: 'NonZeroExit',
      stderr: 'disk full',
    })
    render(<InlineDescriptionEdit cwd="/repo" issue={baseIssue} />)

    fireEvent.click(screen.getByTestId('inline-description-edit-button'))
    fireEvent.change(screen.getByTestId('inline-description-textarea'), {
      target: { value: 'will fail' },
    })
    fireEvent.click(screen.getByTestId('inline-description-save'))

    await waitFor(() => {
      expect(errorToast).toHaveBeenCalled()
    })
    expect(errorToast.mock.calls[0]?.[0]).toContain('disk full')
  })
})

describe('InlineDescriptionEdit — optimistic cache patch', () => {
  it('patches the list and show caches optimistically on mutate', async () => {
    const { InlineDescriptionEdit } = await importSut()
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    qc.setQueryData(['beads', 'list', '/repo'], [baseIssue])
    qc.setQueryData(['beads', 'show', '/repo', 'beads-42'], baseIssue)

    // Pending promise so the React state stays "in flight" long
    // enough to observe the patched cache.
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
        <InlineDescriptionEdit cwd="/repo" issue={baseIssue} />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByTestId('inline-description-edit-button'))
    fireEvent.change(screen.getByTestId('inline-description-textarea'), {
      target: { value: 'optimistic value' },
    })
    fireEvent.click(screen.getByTestId('inline-description-save'))

    // While the mutation is pending, the cache should already
    // reflect the optimistic patch.
    await waitFor(() => {
      const cachedList = qc.getQueryData<Issue[]>(['beads', 'list', '/repo'])
      const cachedShow = qc.getQueryData<Issue>([
        'beads',
        'show',
        '/repo',
        'beads-42',
      ])
      expect(cachedList?.[0]?.description).toBe('optimistic value')
      expect(cachedShow?.description).toBe('optimistic value')
    })

    // Resolve the mutation; the success path keeps the optimistic
    // value (now authoritative from the server response).
    await act(async () => {
      resolveUpdate({
        status: 'ok',
        data: { ...baseIssue, description: 'optimistic value' },
      })
    })
    const cachedList = qc.getQueryData<Issue[]>(['beads', 'list', '/repo'])
    expect(cachedList?.[0]?.description).toBe('optimistic value')
  })

  it('reverts the cache patch on mutation error', async () => {
    const { InlineDescriptionEdit } = await importSut()
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    qc.setQueryData(['beads', 'list', '/repo'], [baseIssue])
    qc.setQueryData(['beads', 'show', '/repo', 'beads-42'], baseIssue)

    mockBdUpdate.mockRejectedValue({
      type: 'NonZeroExit',
      stderr: 'denied',
    })

    render(
      <QueryClientProvider client={qc}>
        <InlineDescriptionEdit cwd="/repo" issue={baseIssue} />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByTestId('inline-description-edit-button'))
    fireEvent.change(screen.getByTestId('inline-description-textarea'), {
      target: { value: 'will be reverted' },
    })
    fireEvent.click(screen.getByTestId('inline-description-save'))

    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalled()
    })
    // After the error, the cache reverts to the original description.
    await waitFor(() => {
      const cachedList = qc.getQueryData<Issue[]>(['beads', 'list', '/repo'])
      const cachedShow = qc.getQueryData<Issue>([
        'beads',
        'show',
        '/repo',
        'beads-42',
      ])
      expect(cachedList?.[0]?.description).toBe(
        'The widget is on fire. Please put it out.'
      )
      expect(cachedShow?.description).toBe(
        'The widget is on fire. Please put it out.'
      )
    })
  })
})

describe('InlineDescriptionEdit — accessibility / Bauhaus', () => {
  it('does not use the brand colour anywhere in the rendered output', async () => {
    const { InlineDescriptionEdit } = await importSut()
    const { container } = render(
      <InlineDescriptionEdit cwd="/repo" issue={baseIssue} />
    )

    // ponytail: AC-14 — the brand colour is reserved for destructive
    // actions and P0 priority. Description edit is neither; the
    // rendered HTML must not surface the accent hex.
    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })

  it('disables Save and Cancel while the mutation is pending', async () => {
    const { InlineDescriptionEdit } = await importSut()
    let resolveUpdate: (v: { status: 'ok'; data: Issue }) => void = () =>
      undefined
    mockBdUpdate.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveUpdate = resolve
        })
    )
    render(<InlineDescriptionEdit cwd="/repo" issue={baseIssue} />)

    fireEvent.click(screen.getByTestId('inline-description-edit-button'))
    fireEvent.change(screen.getByTestId('inline-description-textarea'), {
      target: { value: 'pending value' },
    })
    fireEvent.click(screen.getByTestId('inline-description-save'))

    await waitFor(() => {
      expect(
        (screen.getByTestId('inline-description-save') as HTMLButtonElement)
          .disabled
      ).toBe(true)
      expect(
        (screen.getByTestId('inline-description-cancel') as HTMLButtonElement)
          .disabled
      ).toBe(true)
    })

    // Cleanup: resolve the mutation so the test can tear down.
    await act(async () => {
      resolveUpdate({
        status: 'ok',
        data: { ...baseIssue, description: 'pending value' },
      })
    })
  })
})
