/**
 * Tests for useBeadList — the shared fetch hook for the
 * full-bead-list views (`EpicView`, `StatusOverviewView`).
 *
 * Contract:
 *   - Queries `commands.bdList(cwd, {})` keyed by
 *     `['beads', 'list', cwd, {}]`.
 *   - Returns the issue array on `ok`.
 *   - Throws (surfaces via `error`) on a non-`ok` IPC result.
 *   - The hook is disabled when `cwd === null` (no query fires
 *     before a workspace is selected).
 *
 * **Keyspace**: the realtime sync + invalidation hooks
 * (`useBeadsRealtimeSync`, `useBeadsInvalidation`) patch every
 * cached list variant via the 3-segment prefix
 * `['beads', 'list', cwd]`. The 4-segment key here is a
 * sub-query of that prefix so the watcher lands `created` /
 * `updated` / `deleted` events on the EpicView / StatusOverview
 * cache in ≤1s without the consumers re-subscribing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useBeadList } from './useBeadList'
import type { Issue } from '@/lib/bindings'

const { mockBdList } = vi.hoisted(() => ({
  mockBdList: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdList: mockBdList,
  },
}))

/** Minimal Issue fixture — only the fields the hook reads are
 * populated. The hook treats the result as opaque, but the
 * contract test pins `id` so an accidental filter side-effect
 * would surface. */
function makeIssue(id: string, overrides: Partial<Issue> = {}): Issue {
  return {
    id,
    title: `Issue ${id}`,
    status: 'open',
    priority: 'P2',
    issue_type: 'task',
    created_at: '2026-06-16T00:00:00Z',
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
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return Wrapper
}

describe('useBeadList', () => {
  beforeEach(() => {
    mockBdList.mockReset()
  })

  it('calls commands.bdList(cwd, {}) exactly once and returns the data array on ok', async () => {
    const issues = [makeIssue('task-1'), makeIssue('task-2')]
    mockBdList.mockResolvedValue({ status: 'ok', data: issues })

    const { result } = renderHook(() => useBeadList('/fake'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data).toEqual(issues)
    })
    expect(mockBdList).toHaveBeenCalledTimes(1)
    expect(mockBdList).toHaveBeenCalledWith('/fake', {})
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('surfaces the typed error when the IPC call fails', async () => {
    mockBdList.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: 'fatal: not a beads repository',
      },
    })

    const { result } = renderHook(() => useBeadList('/fake'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => {
      expect(result.current.error).not.toBeNull()
    })
    // data stays undefined on error so consumers fall through to
    // their own error UI (EpicView renders `formatError`,
    // StatusOverviewView renders `formatError`).
    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
  })

  it('does not fire the query when cwd is null', () => {
    mockBdList.mockResolvedValue({ status: 'ok', data: [] })

    const { result } = renderHook(() => useBeadList(null), {
      wrapper: makeWrapper(),
    })

    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(mockBdList).not.toHaveBeenCalled()
  })

  it('uses the 4-segment query key so the realtime sync prefix matches', async () => {
    mockBdList.mockResolvedValue({ status: 'ok', data: [] })

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    })
    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      )
    }

    renderHook(() => useBeadList('/fake'), { wrapper: Wrapper })

    // The 4-segment key shape is what makes the realtime sync
    // (`setQueriesData({ queryKey: ['beads', 'list', cwd] })`)
    // find this cache entry — pinning the literal shape guards
    // against an accidental refactor that breaks the ≤1s patch
    // contract for EpicView / StatusOverviewView.
    await waitFor(() => {
      const cached = client.getQueryCache().findAll()
      const keys = cached.map(q => JSON.stringify(q.queryKey))
      expect(keys).toContain(JSON.stringify(['beads', 'list', '/fake', {}]))
    })
  })

  it('queryFn throws a defensive error when invoked with cwd === null', async () => {
    // The `enabled: cwd !== null` gate at the bottom of useBeadList
    // keeps queryFn from running automatically while no workspace is
    // selected, but queryFn itself still carries the same null-check
    // as an explicit throw (useBeadList.ts L80-82) — the comment
    // there calls it a defensive backstop for a future regression of
    // the `enabled` gate. This test exercises that backstop directly
    // by registering the hook with cwd=null (which seeds a cache
    // entry whose queryFn closure captures cwd=null) and then
    // invoking the registered queryFn out of band. The thrown error
    // is the only observable proof that the inner guard still fires,
    // and pinning its message guards against a typo like
    // `throw new Error(...)` losing the literal `cwd is null` string
    // the production stack traces rely on.
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    })
    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      )
    }

    renderHook(() => useBeadList(null), { wrapper: Wrapper })

    const query = client
      .getQueryCache()
      .find({ queryKey: ['beads', 'list', null, {}] })
    // Belt and braces: confirm the entry registered with cwd=null —
    // otherwise the test below would silently cover a stale cache
    // from a prior render.
    if (!query) throw new Error('expected query entry for cwd=null')
    // The registered queryFn is the same closure the hook wires up —
    // invoking it out of band drives the L80-82 guard with cwd=null
    // captured in scope. The throw must surface unchanged to the
    // caller's `error` channel if the `enabled` gate ever regressed.
    const queryFn = query.options.queryFn as () => Promise<unknown>
    expect(queryFn).toBeDefined()
    await expect(queryFn()).rejects.toThrow('useBeadList: cwd is null')
    // The throw must short-circuit before any `commands.bdList` call —
    // otherwise a regression that flipped the order would still hit
    // the wire and burn a real repo roundtrip from the defensive path.
    expect(mockBdList).not.toHaveBeenCalled()
  })
})
