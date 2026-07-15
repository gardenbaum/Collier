import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { listen } from '@tauri-apps/api/event'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { Issue } from '@/lib/bindings'

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { logger } from '@/lib/logger'
import { useBeadsRealtimeSync } from './useBeadsRealtimeSync'

// Capture every (eventName, handler) pair registered via
// listen(), keyed by event name so multiple listeners can be
// simulated at once. Tests simulate emits by looking up the
// matching handler and invoking it with a minimal Event<T>
// shape (the real @tauri-apps/api Event<T> carries { event,
// id, payload } — we only need `payload` for the handlers).
type ListenerCallback = Parameters<typeof listen>[1]
type Unlisten = () => void
const listeners = new Map<string, ListenerCallback>()
const unlistenFns = new Set<Unlisten>()

const mockedListen = vi.mocked(listen)

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'beads-1',
    title: 'Sample',
    status: 'open',
    priority: 'P2',
    issue_type: 'task',
    created_at: '2026-01-01T00:00:00Z',
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

function emit(eventName: string, payload: unknown): void {
  const handler = listeners.get(eventName)
  if (!handler) {
    throw new Error(`no listener registered for ${eventName}`)
  }
  // Cast through `never` — the handler signature is generic
  // over T but we don't know T at the call site; the handler
  // only reads `evt.payload` so a structural cast is safe.
  handler({ event: eventName, id: 0, payload } as never)
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderWithClient(qc: QueryClient) {
  return renderHook(() => useBeadsRealtimeSync(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  unlistenFns.clear()
  // Defensive: a previous test may have exposed the diag surface.
  // Clear it so the bump helper skips on tests that don't opt in.
  delete (globalThis as { __collierDiag__?: Record<string, number> })
    .__collierDiag__
  // Default mock: every listen() call registers the handler in
  // the shared map and returns a fake unlisten that clears it.
  mockedListen.mockImplementation(
    (eventName: string, handler: ListenerCallback) => {
      listeners.set(eventName, handler)
      const unlisten: Unlisten = () => {
        listeners.delete(eventName)
        unlistenFns.delete(unlisten)
      }
      unlistenFns.add(unlisten)
      return Promise.resolve(unlisten)
    }
  )
})

afterEach(() => {
  // Defensive: nothing should outlive its hook, but if a test
  // forgot to unmount, clear the leftovers so the next test
  // starts from a clean slate.
  listeners.clear()
  unlistenFns.clear()
})

const REPO = '/tmp/e2e-workspace'

describe('useBeadsRealtimeSync', () => {
  it('registers listeners for all four targeted events', async () => {
    const qc = makeQueryClient()
    renderWithClient(qc)

    // Let the listen() microtasks resolve
    await act(async () => {
      await Promise.resolve()
    })

    expect(listeners.has('beads-data-reset')).toBe(true)
    expect(listeners.has('beads-issue-created')).toBe(true)
    expect(listeners.has('beads-issue-updated')).toBe(true)
    expect(listeners.has('beads-issue-deleted')).toBe(true)
  })

  it('patches the matching issue into the list cache on beads-issue-updated', async () => {
    const qc = makeQueryClient()
    const initial = makeIssue({ id: 'beads-1', status: 'open' })
    const updated = makeIssue({ id: 'beads-1', status: 'closed' })
    qc.setQueryData<Issue[]>(['beads', 'list', REPO, {}], [initial])
    qc.setQueryData<Issue[]>(['beads', 'list', REPO, 'filtered'], [initial])
    qc.setQueryData<Issue>(['beads', 'show', REPO, 'beads-1'], initial)
    useWorkspaceStore.setState({ repoPath: REPO })

    renderWithClient(qc)
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      emit('beads-issue-updated', { repo_path: REPO, issue: updated })
    })

    // Both list variants patched
    const listA = qc.getQueryData<Issue[]>(['beads', 'list', REPO, {}])
    const listB = qc.getQueryData<Issue[]>(['beads', 'list', REPO, 'filtered'])
    expect(listA?.[0]?.status).toBe('closed')
    expect(listB?.[0]?.status).toBe('closed')

    // Show cache patched
    const show = qc.getQueryData<Issue>(['beads', 'show', REPO, 'beads-1'])
    expect(show?.status).toBe('closed')
  })

  it('inserts a new issue into the list cache on beads-issue-created', async () => {
    const qc = makeQueryClient()
    const existing = makeIssue({ id: 'beads-1', status: 'open' })
    const created = makeIssue({ id: 'beads-2', title: 'Brand new' })
    qc.setQueryData<Issue[]>(['beads', 'list', REPO, {}], [existing])
    useWorkspaceStore.setState({ repoPath: REPO })

    renderWithClient(qc)
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      emit('beads-issue-created', { repo_path: REPO, issue: created })
    })

    const list = qc.getQueryData<Issue[]>(['beads', 'list', REPO, {}])
    expect(list?.length).toBe(2)
    expect(list?.find(i => i.id === 'beads-2')?.title).toBe('Brand new')
  })

  it('removes the issue from list cache + show cache on beads-issue-deleted', async () => {
    const qc = makeQueryClient()
    const a = makeIssue({ id: 'beads-1' })
    const b = makeIssue({ id: 'beads-2' })
    qc.setQueryData<Issue[]>(['beads', 'list', REPO, {}], [a, b])
    qc.setQueryData<Issue>(['beads', 'show', REPO, 'beads-1'], a)
    qc.setQueryData<Issue>(['beads', 'show', REPO, 'beads-2'], b)
    useWorkspaceStore.setState({ repoPath: REPO })

    renderWithClient(qc)
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      emit('beads-issue-deleted', { repo_path: REPO, issue_id: 'beads-1' })
    })

    const list = qc.getQueryData<Issue[]>(['beads', 'list', REPO, {}])
    expect(list?.map(i => i.id)).toEqual(['beads-2'])
    expect(
      qc.getQueryData<Issue>(['beads', 'show', REPO, 'beads-1'])
    ).toBeUndefined()
    // beads-2's show cache must remain untouched
    expect(qc.getQueryData<Issue>(['beads', 'show', REPO, 'beads-2'])?.id).toBe(
      'beads-2'
    )
  })

  it('does NOT touch caches for events from a different repo', async () => {
    const qc = makeQueryClient()
    const issue = makeIssue({ id: 'beads-1', status: 'open' })
    const otherIssue = makeIssue({ id: 'beads-1', status: 'closed' })
    qc.setQueryData<Issue[]>(['beads', 'list', REPO, {}], [issue])
    qc.setQueryData<Issue>(['beads', 'show', REPO, 'beads-1'], issue)
    useWorkspaceStore.setState({ repoPath: REPO })

    renderWithClient(qc)
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      emit('beads-issue-updated', {
        repo_path: '/tmp/other-workspace',
        issue: otherIssue,
      })
    })

    // The active repo's caches must remain unchanged.
    const list = qc.getQueryData<Issue[]>(['beads', 'list', REPO, {}])
    expect(list?.[0]?.status).toBe('open')
    const show = qc.getQueryData<Issue>(['beads', 'show', REPO, 'beads-1'])
    expect(show?.status).toBe('open')
  })

  it('does NOT touch caches for deleted events from a different repo', async () => {
    const qc = makeQueryClient()
    const issue = makeIssue({ id: 'beads-1' })
    qc.setQueryData<Issue[]>(['beads', 'list', REPO, {}], [issue])
    qc.setQueryData<Issue>(['beads', 'show', REPO, 'beads-1'], issue)
    useWorkspaceStore.setState({ repoPath: REPO })

    renderWithClient(qc)
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      emit('beads-issue-deleted', {
        repo_path: '/tmp/other-workspace',
        issue_id: 'beads-1',
      })
    })

    const list = qc.getQueryData<Issue[]>(['beads', 'list', REPO, {}])
    expect(list?.length).toBe(1)
    expect(qc.getQueryData<Issue>(['beads', 'show', REPO, 'beads-1'])?.id).toBe(
      'beads-1'
    )
  })

  it('invalidates the broad beads key on beads-data-reset', async () => {
    const qc = makeQueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    useWorkspaceStore.setState({ repoPath: REPO })

    renderWithClient(qc)
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      emit('beads-data-reset', { repo_path: REPO, count: 25 })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['beads'] })
  })

  it('does NOT invalidate on beads-data-reset for a different repo', async () => {
    const qc = makeQueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    useWorkspaceStore.setState({ repoPath: REPO })

    renderWithClient(qc)
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      emit('beads-data-reset', {
        repo_path: '/tmp/other-workspace',
        count: 25,
      })
    })

    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('cancels every listener on unmount', async () => {
    const qc = makeQueryClient()
    const { unmount } = renderWithClient(qc)

    await act(async () => {
      await Promise.resolve()
    })

    expect(listeners.size).toBe(4)
    expect(unlistenFns.size).toBe(4)

    unmount()

    // All four listeners torn down.
    expect(listeners.size).toBe(0)
    expect(unlistenFns.size).toBe(0)
  })

  it('patches a list query with an empty array (does not delete the key)', async () => {
    // Defensive: an empty list cache must stay present after a
    // patch (setQueriesData with an undefined prev returns
    // undefined and leaves the existing data alone). This
    // matches the optimistic mutation's behavior in
    // `InlineIssueEdit.onSuccess`.
    const qc = makeQueryClient()
    const initial = makeIssue({ id: 'beads-1', status: 'open' })
    const updated = makeIssue({ id: 'beads-1', status: 'closed' })
    qc.setQueryData<Issue[]>(['beads', 'list', REPO, {}], [])
    useWorkspaceStore.setState({ repoPath: REPO })

    renderWithClient(qc)
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      emit('beads-issue-updated', { repo_path: REPO, issue: updated })
    })

    // The patch should INSERT the row into the (previously
    // empty) list cache — setQueriesData runs even when the
    // existing array is empty, because the `map` short-circuits
    // to `prev` only when `prev` is undefined.
    const list = qc.getQueryData<Issue[]>(['beads', 'list', REPO, {}])
    expect(list?.length).toBe(1)
    expect(list?.[0]?.status).toBe('closed')
    // Silence unused-var lint on the initial fixture.
    expect(initial.id).toBe('beads-1')
  })

  it('no-ops when there is no active workspace', async () => {
    const qc = makeQueryClient()
    // Initial cache state: status = 'open'.
    qc.setQueryData<Issue[]>(
      ['beads', 'list', REPO, {}],
      [makeIssue({ id: 'beads-1', status: 'open' })]
    )
    useWorkspaceStore.setState({ repoPath: null })

    renderWithClient(qc)
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      // Emit an updated payload whose repo_path points at REPO
      // but the workspace store says there's no active
      // workspace. The filter MUST drop the event.
      emit('beads-issue-updated', {
        repo_path: REPO,
        issue: makeIssue({ id: 'beads-1', status: 'closed' }),
      })
    })

    // Cache unchanged: still 'open'.
    const list = qc.getQueryData<Issue[]>(['beads', 'list', REPO, {}])
    expect(list?.[0]?.status).toBe('open')
  })

  it('logs an error when listen() rejects for one of the targeted events', async () => {
    // Override the listen mock so one event throws on registration.
    // The setupListener wrapper must catch the rejection and emit a
    // logger.error line — otherwise the rejection becomes an
    // unhandled promise rejection that crashes the consumer's app.
    mockedListen.mockImplementation(
      (eventName: string, handler: ListenerCallback) => {
        if (eventName === 'beads-data-reset') {
          return Promise.reject(new Error('listener init failed'))
        }
        listeners.set(eventName, handler)
        const unlisten: Unlisten = () => {
          listeners.delete(eventName)
          unlistenFns.delete(unlisten)
        }
        unlistenFns.add(unlisten)
        return Promise.resolve(unlisten)
      }
    )

    const qc = makeQueryClient()
    renderWithClient(qc)

    // Let the listen() rejection microtask resolve before we assert.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // The catch block in setupListener must have logged the failure
    // tagged with the event name so the failure is traceable back to
    // the targeted listener it belongs to.
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to setup beads-data-reset listener',
      expect.objectContaining({ error: expect.any(Error) })
    )
  })

  it('bumps the diag counter when __collierDiag__ is exposed', async () => {
    // Expose the diag surface (production code skips when undefined).
    // The diag counters are read by the E2E suite to attribute lost
    // events to the layer that dropped them; the bump helper is the
    // only place that writes to it.
    ;(
      globalThis as { __collierDiag__?: Record<string, number> }
    ).__collierDiag__ = {}

    const qc = makeQueryClient()
    useWorkspaceStore.setState({ repoPath: REPO })
    renderWithClient(qc)
    await act(async () => {
      await Promise.resolve()
    })

    // Trigger a reset event with a mismatched repo_path so we
    // exercise both bump('dataReset') AND bump('droppedRepoMismatch')
    // — the two bump sites inside the data-reset handler.
    await act(async () => {
      emit('beads-data-reset', { repo_path: '/tmp/other-workspace', count: 25 })
    })

    const diag = (globalThis as { __collierDiag__?: Record<string, number> })
      .__collierDiag__
    expect(diag?.dataReset).toBe(1)
    expect(diag?.droppedRepoMismatch).toBe(1)

    // Cleanup so the next test starts from a clean diag surface.
    delete (globalThis as { __collierDiag__?: Record<string, number> })
      .__collierDiag__
  })

  it('does NOT touch caches for created events from a different repo', async () => {
    // Sibling to the updated/deleted mismatch tests already in this
    // file — beads-issue-created has the same repo_path filter, and
    // the create branch must drop the event the same way the update
    // and delete branches do.
    const qc = makeQueryClient()
    const existing = makeIssue({ id: 'beads-1' })
    const created = makeIssue({ id: 'beads-2', title: 'New issue' })
    qc.setQueryData<Issue[]>(['beads', 'list', REPO, {}], [existing])
    useWorkspaceStore.setState({ repoPath: REPO })

    renderWithClient(qc)
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      emit('beads-issue-created', {
        repo_path: '/tmp/other-workspace',
        issue: created,
      })
    })

    // The active repo's caches must remain unchanged — beads-2 must
    // not be inserted into the list and the show cache for beads-2
    // must not be populated.
    const list = qc.getQueryData<Issue[]>(['beads', 'list', REPO, {}])
    expect(list?.map(i => i.id)).toEqual(['beads-1'])
    expect(
      qc.getQueryData<Issue>(['beads', 'show', REPO, 'beads-2'])
    ).toBeUndefined()
  })

  it('discards a listener that resolves after the hook unmounts', async () => {
    // Race: listen() is asynchronous, so it can resolve after the
    // effect's cleanup has already flipped `isMounted = false`.
    // The setupListener wrapper must detect that and call unlisten()
    // immediately instead of pushing a now-stale listener into
    // unlistenFns (the cleanup loop would otherwise try to double-
    // unlisten it on the next unmount).
    let resolveListen: (() => void) | null = null
    const lateUnlisten = vi.fn() as unknown as Unlisten
    mockedListen.mockImplementation(
      (eventName: string, handler: ListenerCallback) => {
        listeners.set(eventName, handler)
        // Park the resolution so we control when listen() "completes".
        // Note: production code is responsible for either calling
        // unlisten() (discard branch) or pushing it into unlistenFns
        // (live branch) AFTER the await — the mock does neither.
        return new Promise<Unlisten>(resolve => {
          resolveListen = () => resolve(lateUnlisten)
        })
      }
    )

    const qc = makeQueryClient()
    const { unmount } = renderWithClient(qc)

    // Unmount while every listen() promise is still pending — this
    // flips isMounted to false inside the effect.
    unmount()

    // Now resolve the parked listen() promises. Each one will see
    // isMounted=false and call unlisten() immediately rather than
    // pushing the listener into unlistenFns.
    await act(async () => {
      if (resolveListen) resolveListen()
      await Promise.resolve()
      await Promise.resolve()
    })

    // The late unlisten must have been discarded exactly once.
    expect(lateUnlisten).toHaveBeenCalledTimes(1)
    // And the unlistenFns set must be empty — every parked promise
    // got the discard branch, none went into the cleanup loop.
    expect(unlistenFns.size).toBe(0)
  })
})
