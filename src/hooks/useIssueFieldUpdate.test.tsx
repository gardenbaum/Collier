/**
 * Tests for useIssueFieldUpdate — the shared optimistic-update
 * mutation hook for `commands.bdUpdate`.
 *
 * Contract:
 *   - mutationFn: forwards `buildInput(value)` as the third
 *     arg of `commands.bdUpdate(cwd, issueId, input)`; throws
 *     `result.error` on non-ok.
 *   - onMutate: cancels every `['beads', 'list', cwd]` variant
 *     + the `['beads', 'show', cwd, issueId]` slot, snapshots
 *     them, and applies `applyToIssue(issue, value)` across
 *     both. Returns `{ previousLists, previousShow }` so onError
 *     can revert.
 *   - onError: reverts every patched slot, calls
 *     `logger.error(errorLogMessage, ...)`, and toasts
 *     `formatError(err, errorFallback)`.
 *   - onSuccess: sets the freshly-returned issue into both
 *     slots.
 *   - Cache miss on the show slot (drawer never mounted) is
 *     handled without crashing onMutate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useIssueFieldUpdate } from './useIssueFieldUpdate'
import type { Issue } from '@/lib/bindings'

const { mockBdUpdate } = vi.hoisted(() => ({
  mockBdUpdate: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdUpdate: mockBdUpdate,
  },
}))

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}))

const { mockToast } = vi.hoisted(() => ({
  mockToast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: mockToast,
}))

function makeIssue(id: string, overrides: Partial<Issue> = {}): Issue {
  return {
    id,
    title: `Issue ${id}`,
    status: 'open',
    priority: 'P2',
    issue_type: 'task',
    created_at: '2026-07-04T00:00:00Z',
    updated_at: null,
    closed_at: null,
    description: null,
    owner: null,
    labels: [],
    dependencies: [],
    dependents: [],
    dependency_count: 0,
    dependent_count: 0,
    comment_count: 0,
    parent: null,
    acceptance_criteria: null,
    external_ref: null,
    ...overrides,
  }
}

function makeWrapper() {
  // ponytail: do NOT set `gcTime: 0` — the test seeds the
  // cache via `client.setQueryData(...)` without an active
  // observer, and `gcTime: 0` would GC the entry before our
  // `waitFor` assertions read it back. The default `gcTime`
  // (5 min) keeps the entry alive for the test's duration.
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return { Wrapper, client }
}

// ponytail: keep the buildInput/applyToIssue pair trivial for
// the contract tests so the test reads as the hook, not the
// caller. The InlineIssueEdit / InlineDescriptionEdit suites
// pin the per-field shape.
const descriptionBuildInput = (value: string | null) => ({ description: value })
const descriptionApplyToIssue = (
  issue: Issue,
  value: string | null
): Issue => ({
  ...issue,
  description: value,
})

describe('useIssueFieldUpdate — mutationFn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards buildInput(value) to commands.bdUpdate(cwd, issueId, input)', async () => {
    const updated = makeIssue('task-1', { description: 'new' })
    mockBdUpdate.mockResolvedValue({ status: 'ok', data: updated })
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useIssueFieldUpdate({
          cwd: '/fake',
          issueId: 'task-1',
          buildInput: descriptionBuildInput,
          applyToIssue: descriptionApplyToIssue,
        }),
      { wrapper: Wrapper }
    )

    await act(async () => {
      await result.current.mutateAsync('new')
    })

    expect(mockBdUpdate).toHaveBeenCalledTimes(1)
    expect(mockBdUpdate).toHaveBeenCalledWith('/fake', 'task-1', {
      description: 'new',
    })
  })

  it('throws result.error when the IPC call returns a non-ok status', async () => {
    const err = { type: 'NonZeroExit', stderr: 'boom' }
    mockBdUpdate.mockResolvedValue({ status: 'error', error: err })
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useIssueFieldUpdate({
          cwd: '/fake',
          issueId: 'task-1',
          buildInput: descriptionBuildInput,
          applyToIssue: descriptionApplyToIssue,
        }),
      { wrapper: Wrapper }
    )

    await act(async () => {
      await expect(result.current.mutateAsync('new')).rejects.toEqual(err)
    })

    expect(result.current.isError).toBe(true)
    expect(result.current.error).toEqual(err)
  })
})

describe('useIssueFieldUpdate — onMutate optimistic patch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('patches every cached list variant AND the show slot with applyToIssue', async () => {
    // ponytail: a "list variant" is a single list cache slot
    // keyed by `['beads', 'list', cwd, filters]`. Real views
    // (IssueListView, EpicView) seed multiple variants when
    // the user has toggled sidebar filters; the hook must
    // patch every variant, not just the bare 3-segment key.
    const issueA = makeIssue('task-1')
    const issueB = makeIssue('task-2', { owner: 'alice' })

    const { Wrapper, client } = makeWrapper()
    client.setQueryData(
      ['beads', 'list', '/fake', { status: 'open' }],
      [issueA, issueB]
    )
    client.setQueryData(
      ['beads', 'list', '/fake', { status: 'closed' }],
      [issueB]
    )
    client.setQueryData(['beads', 'show', '/fake', 'task-1'], issueA)

    // Pending promise so the cache patch is observable before
    // the mutation resolves.
    let resolveUpdate!: (v: { status: 'ok'; data: Issue }) => void
    mockBdUpdate.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveUpdate = resolve
        })
    )

    const { result } = renderHook(
      () =>
        useIssueFieldUpdate({
          cwd: '/fake',
          issueId: 'task-1',
          buildInput: descriptionBuildInput,
          applyToIssue: descriptionApplyToIssue,
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.mutate('new description')
    })

    await waitFor(() => {
      // The list variants are patched immediately, before the
      // bd call resolves.
      const openVariant = client.getQueryData<Issue[]>([
        'beads',
        'list',
        '/fake',
        { status: 'open' },
      ])
      expect(openVariant?.find(i => i.id === 'task-1')?.description).toBe(
        'new description'
      )
      const closedVariant = client.getQueryData<Issue[]>([
        'beads',
        'list',
        '/fake',
        { status: 'closed' },
      ])
      expect(
        closedVariant?.find(i => i.id === 'task-1')?.description
      ).toBeUndefined() // task-1 was never in the closed list
      // task-2 is untouched in both lists
      expect(openVariant?.find(i => i.id === 'task-2')?.description).toBeNull()
      expect(
        closedVariant?.find(i => i.id === 'task-2')?.description
      ).toBeNull()
      // The show slot is patched too.
      const show = client.getQueryData<Issue>([
        'beads',
        'show',
        '/fake',
        'task-1',
      ])
      expect(show?.description).toBe('new description')
    })

    // Resolve the pending bd call so the test's afterEach (if
    // any) doesn't hang on an outstanding promise.
    await act(async () => {
      resolveUpdate({ status: 'ok', data: { ...issueA, description: 'new' } })
      // Let the onSuccess handler settle.
      await Promise.resolve()
    })
  })

  it('handles a missing show slot (detail drawer never mounted) without crashing', async () => {
    const issueA = makeIssue('task-1')
    const { Wrapper, client } = makeWrapper()
    // Only seed the list cache; the show slot is empty.
    client.setQueryData(
      ['beads', 'list', '/fake', { status: 'open' }],
      [issueA]
    )

    let resolveUpdate!: (v: { status: 'ok'; data: Issue }) => void
    mockBdUpdate.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveUpdate = resolve
        })
    )

    const { result } = renderHook(
      () =>
        useIssueFieldUpdate({
          cwd: '/fake',
          issueId: 'task-1',
          buildInput: descriptionBuildInput,
          applyToIssue: descriptionApplyToIssue,
        }),
      { wrapper: Wrapper }
    )

    // The mutation should fire without throwing even though
    // the show slot was never seeded.
    expect(() => {
      act(() => {
        result.current.mutate('new')
      })
    }).not.toThrow()

    // List variant is patched.
    await waitFor(() => {
      const openVariant = client.getQueryData<Issue[]>([
        'beads',
        'list',
        '/fake',
        { status: 'open' },
      ])
      expect(openVariant?.find(i => i.id === 'task-1')?.description).toBe('new')
    })

    await act(async () => {
      resolveUpdate({ status: 'ok', data: { ...issueA, description: 'new' } })
      await Promise.resolve()
    })
  })
})

describe('useIssueFieldUpdate — onError revert', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reverts both the list variants and the show slot, logs, and toasts formatError', async () => {
    const issueA = makeIssue('task-1')
    const originalList: Issue[] = [issueA]
    const { Wrapper, client } = makeWrapper()
    client.setQueryData(
      ['beads', 'list', '/fake', { status: 'open' }],
      [...originalList]
    )
    client.setQueryData(['beads', 'show', '/fake', 'task-1'], issueA)

    mockBdUpdate.mockRejectedValue({ type: 'NonZeroExit', stderr: 'disk full' })

    const { result } = renderHook(
      () =>
        useIssueFieldUpdate({
          cwd: '/fake',
          issueId: 'task-1',
          buildInput: descriptionBuildInput,
          applyToIssue: descriptionApplyToIssue,
          errorLogMessage: 'description update failed',
          errorFallback: 'Failed to update description.',
        }),
      { wrapper: Wrapper }
    )

    await act(async () => {
      try {
        await result.current.mutateAsync('will fail')
      } catch {
        // expected
      }
    })

    // Both cache slots reverted to the pre-update values.
    const listAfter = client.getQueryData<Issue[]>([
      'beads',
      'list',
      '/fake',
      { status: 'open' },
    ])
    expect(listAfter).toEqual(originalList)
    const showAfter = client.getQueryData<Issue>([
      'beads',
      'show',
      '/fake',
      'task-1',
    ])
    expect(showAfter).toEqual(issueA)
    expect(showAfter?.description).toBeNull()

    // logger.error uses the caller's diagnostic message.
    expect(mockLogger.error).toHaveBeenCalledWith(
      'description update failed',
      expect.objectContaining({ err: expect.anything() })
    )

    // toast.error surfaces the stderr from the failed bd call
    // (formatError returns `bd failed: disk full`, which
    // contains the substring the assertion targets).
    expect(mockToast.error).toHaveBeenCalledTimes(1)
    const callArg = (mockToast.error.mock.calls[0] as unknown[])[0]
    expect(callArg).toContain('disk full')
  })

  it('falls back to errorFallback when the error has no extractable message', async () => {
    const issueA = makeIssue('task-1')
    const { Wrapper, client } = makeWrapper()
    client.setQueryData(
      ['beads', 'list', '/fake', { status: 'open' }],
      [issueA]
    )
    client.setQueryData(['beads', 'show', '/fake', 'task-1'], issueA)

    mockBdUpdate.mockRejectedValue(undefined)

    const { result } = renderHook(
      () =>
        useIssueFieldUpdate({
          cwd: '/fake',
          issueId: 'task-1',
          buildInput: descriptionBuildInput,
          applyToIssue: descriptionApplyToIssue,
          errorFallback: 'Could not save.',
        }),
      { wrapper: Wrapper }
    )

    await act(async () => {
      try {
        await result.current.mutateAsync('will fail')
      } catch {
        // expected
      }
    })

    // formatError(undefined, 'Could not save.') returns the
    // fallback string.
    expect(mockToast.error).toHaveBeenCalledWith('Could not save.')
  })
})

describe('useIssueFieldUpdate — onSuccess reconcile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes the freshly-returned issue into both list variants and the show slot', async () => {
    const issueA = makeIssue('task-1')
    const updated = makeIssue('task-1', { description: 'from server' })
    const { Wrapper, client } = makeWrapper()
    client.setQueryData(
      ['beads', 'list', '/fake', { status: 'open' }],
      [issueA]
    )
    client.setQueryData(['beads', 'show', '/fake', 'task-1'], issueA)

    mockBdUpdate.mockResolvedValue({ status: 'ok', data: updated })

    const { result } = renderHook(
      () =>
        useIssueFieldUpdate({
          cwd: '/fake',
          issueId: 'task-1',
          buildInput: descriptionBuildInput,
          applyToIssue: descriptionApplyToIssue,
        }),
      { wrapper: Wrapper }
    )

    await act(async () => {
      await result.current.mutateAsync('optimistic value')
    })

    // The freshly-returned issue (not the optimistic value)
    // is what lands in the cache, matching the InlineIssueEdit
    // contract that the watcher tick is belt-and-braces.
    const listAfter = client.getQueryData<Issue[]>([
      'beads',
      'list',
      '/fake',
      { status: 'open' },
    ])
    expect(listAfter?.find(i => i.id === 'task-1')?.description).toBe(
      'from server'
    )
    const showAfter = client.getQueryData<Issue>([
      'beads',
      'show',
      '/fake',
      'task-1',
    ])
    expect(showAfter?.description).toBe('from server')
  })
})
