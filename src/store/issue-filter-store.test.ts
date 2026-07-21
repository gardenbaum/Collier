import { describe, it, expect, beforeEach } from 'vitest'
import {
  getIssueFilterCounts,
  resetIssueFilterStoreForTests,
  useIssueFilterStore,
  type IssueFilterState,
} from './issue-filter-store'
import { attachToWorkspaceStore } from './attach-to-workspace-store'
import { makeWorkspaceStub } from '@/test/workspace-stub'

// localStorage key used by the persist middleware. Mirrors the
// `name` field in the store's persist options. Asserted against the
// real localStorage so a future rename of the key won't silently
// invalidate these tests.
const STORAGE_KEY = 'collier-issue-filter'

describe('useIssueFilterStore', () => {
  beforeEach(() => {
    resetIssueFilterStoreForTests()
  })

  describe('initial state', () => {
    it('starts with empty filter arrays on every dimension', () => {
      const state = useIssueFilterStore.getState()
      expect(state.status).toEqual([])
      expect(state.priority).toEqual([])
      expect(state.type).toEqual([])
      expect(state.labels).toEqual([])
      expect(state.assignees).toEqual([])
    })
  })

  describe('toggleStatus', () => {
    it('adds a status when not present', () => {
      useIssueFilterStore.getState().toggleStatus('open')
      expect(useIssueFilterStore.getState().status).toEqual(['open'])
    })

    it('removes a status when already present', () => {
      useIssueFilterStore.setState({ status: ['open', 'in_progress'] })
      useIssueFilterStore.getState().toggleStatus('open')
      expect(useIssueFilterStore.getState().status).toEqual(['in_progress'])
    })

    it('preserves order of remaining values', () => {
      useIssueFilterStore.getState().toggleStatus('closed')
      useIssueFilterStore.getState().toggleStatus('open')
      useIssueFilterStore.getState().toggleStatus('closed')
      expect(useIssueFilterStore.getState().status).toEqual(['open'])
    })
  })

  describe('togglePriority', () => {
    it('adds and removes priorities', () => {
      const { togglePriority } = useIssueFilterStore.getState()
      togglePriority('P0')
      togglePriority('P1')
      expect(useIssueFilterStore.getState().priority).toEqual(['P0', 'P1'])
      togglePriority('P0')
      expect(useIssueFilterStore.getState().priority).toEqual(['P1'])
    })
  })

  describe('toggleType', () => {
    it('adds and removes types', () => {
      const { toggleType } = useIssueFilterStore.getState()
      toggleType('bug')
      toggleType('feature')
      expect(useIssueFilterStore.getState().type).toEqual(['bug', 'feature'])
      toggleType('bug')
      expect(useIssueFilterStore.getState().type).toEqual(['feature'])
    })
  })

  describe('toggleLabel', () => {
    it('adds and removes label names', () => {
      const { toggleLabel } = useIssueFilterStore.getState()
      toggleLabel('urgent')
      toggleLabel('frontend')
      expect(useIssueFilterStore.getState().labels).toEqual([
        'urgent',
        'frontend',
      ])
      toggleLabel('urgent')
      expect(useIssueFilterStore.getState().labels).toEqual(['frontend'])
    })
  })

  describe('toggleAssignee', () => {
    it('adds and removes assignees', () => {
      const { toggleAssignee } = useIssueFilterStore.getState()
      toggleAssignee('alice')
      toggleAssignee('bob')
      expect(useIssueFilterStore.getState().assignees).toEqual(['alice', 'bob'])
      toggleAssignee('alice')
      expect(useIssueFilterStore.getState().assignees).toEqual(['bob'])
    })
  })

  describe('clearAll', () => {
    it('empties every dimension in one call', () => {
      useIssueFilterStore.setState({
        status: ['open'],
        priority: ['P0'],
        type: ['bug'],
        labels: ['urgent'],
        assignees: ['alice'],
      })
      useIssueFilterStore.getState().clearAll()
      const s = useIssueFilterStore.getState()
      expect(s.status).toEqual([])
      expect(s.priority).toEqual([])
      expect(s.type).toEqual([])
      expect(s.labels).toEqual([])
      expect(s.assignees).toEqual([])
    })
  })

  describe('per-workspace persistence (M4)', () => {
    // Workspace stub + attach() helper. Every test starts with a
    // fresh workspace stub and a fresh store reset — the
    // subscription wiring is what we're exercising.
    function bootWorkspace(initial: string | null) {
      const ws = makeWorkspaceStub(initial)
      attachToWorkspaceStore(ws, useIssueFilterStore)
      return ws
    }

    it('loads the saved filter when a workspace is attached', () => {
      // Pre-seed the persisted map by toggling under one workspace,
      // then attaching a fresh workspace that points at the same
      // path — the filter must come back.
      const wsA = bootWorkspace('/repo-a')
      useIssueFilterStore.getState().toggleStatus('open')
      useIssueFilterStore.getState().togglePriority('P1')
      expect(useIssueFilterStore.getState().status).toEqual(['open'])

      // Switch to a different repo: filter clears.
      wsA.setRepoPath('/repo-b')
      expect(useIssueFilterStore.getState().status).toEqual([])
      expect(useIssueFilterStore.getState()._activeRepoPath).toBe('/repo-b')

      // Switch back to A: filter restores.
      wsA.setRepoPath('/repo-a')
      expect(useIssueFilterStore.getState().status).toEqual(['open'])
      expect(useIssueFilterStore.getState().priority).toEqual(['P1'])
      expect(useIssueFilterStore.getState()._activeRepoPath).toBe('/repo-a')
    })

    it("keeps two repos' filters isolated", () => {
      const ws = bootWorkspace('/repo-a')
      useIssueFilterStore.getState().toggleStatus('open')
      ws.setRepoPath('/repo-b')
      useIssueFilterStore.getState().toggleStatus('blocked')
      useIssueFilterStore.getState().togglePriority('P0')
      ws.setRepoPath('/repo-a')
      expect(useIssueFilterStore.getState().status).toEqual(['open'])
      expect(useIssueFilterStore.getState().priority).toEqual([])
      ws.setRepoPath('/repo-b')
      expect(useIssueFilterStore.getState().status).toEqual(['blocked'])
      expect(useIssueFilterStore.getState().priority).toEqual(['P0'])
    })

    it('handles a switch to a fresh workspace (no saved filter)', () => {
      const ws = bootWorkspace('/repo-a')
      useIssueFilterStore.getState().toggleStatus('open')
      ws.setRepoPath('/brand-new-repo')
      expect(useIssueFilterStore.getState().status).toEqual([])
      // Round-trip back: /repo-a's filter survives.
      ws.setRepoPath('/repo-a')
      expect(useIssueFilterStore.getState().status).toEqual(['open'])
    })

    it('handles a switch to null (closing the workspace)', () => {
      const ws = bootWorkspace('/repo-a')
      useIssueFilterStore.getState().toggleStatus('open')
      ws.setRepoPath(null)
      expect(useIssueFilterStore.getState().status).toEqual([])
      expect(useIssueFilterStore.getState()._activeRepoPath).toBeNull()
      // The persisted map still holds /repo-a — reattaching with
      // the same path must restore the filter.
      ws.setRepoPath('/repo-a')
      expect(useIssueFilterStore.getState().status).toEqual(['open'])
    })

    it('attaching twice replaces the previous subscription (no leaks)', () => {
      const ws1 = bootWorkspace('/repo-a')
      useIssueFilterStore.getState().toggleStatus('open')
      // ws2 is the second workspace stub; we keep a handle to it
      // so the variable is used (bootWorkspace already wired the
      // subscription via its return value).
      void bootWorkspace('/repo-b')
      // ws2's attach should have replaced ws1's. Setting ws1's path
      // must NOT swap the filter; only the latest subscription
      // should fire.
      expect(useIssueFilterStore.getState()._activeRepoPath).toBe('/repo-b')
      // Toggle under /repo-b
      useIssueFilterStore.getState().togglePriority('P2')
      expect(useIssueFilterStore.getState().priority).toEqual(['P2'])
      // Setting ws1 to a new path must not affect the store.
      ws1.setRepoPath('/repo-c')
      expect(useIssueFilterStore.getState().priority).toEqual(['P2'])
    })

    it('clearAll in workspace A does not affect workspace B', () => {
      const ws = bootWorkspace('/repo-a')
      useIssueFilterStore.getState().toggleStatus('open')
      ws.setRepoPath('/repo-b')
      useIssueFilterStore.getState().toggleStatus('blocked')
      ws.setRepoPath('/repo-a')
      useIssueFilterStore.getState().clearAll()
      // A is now empty
      expect(useIssueFilterStore.getState().status).toEqual([])
      ws.setRepoPath('/repo-b')
      // B still has its 'blocked' selection.
      expect(useIssueFilterStore.getState().status).toEqual(['blocked'])
    })
  })

  describe('internal defensive fallbacks + merge/migrate', () => {
    // These branches are reachable only through corrupted state
    // (`_persistedByRepo === undefined`) or via the persist
    // middleware's internal helpers (`merge`, `migrate`,
    // `partialize`). We exercise them through the public API plus
    // `useIssueFilterStore.persist.getOptions()` (which exposes the
    // merge + migrate closures) so the production source stays
    // untouched.

    it('_setActiveRepoPath is a no-op when the active repo path matches', () => {
      // Wire a workspace to /repo-a, set a status, then call
      // setRepoPath('/repo-a') again — the no-op guard at line 143
      // (`if (prev === path) return`) must fire so no extra setState
      // goes through the persist middleware.
      const ws = makeWorkspaceStub('/repo-a')
      attachToWorkspaceStore(ws, useIssueFilterStore)
      useIssueFilterStore.getState().toggleStatus('open')

      // Round-trip to populate _persistedByRepo (the outgoing-repo
      // snapshot is only written when we switch OUT, not on the
      // initial attach). Without this, `beforeByRepo` would be `{}`
      // and the no-op test couldn't distinguish "untouched" from
      // "rewritten to {}".
      ws.setRepoPath('/repo-b')
      ws.setRepoPath('/repo-a')
      const beforeByRepo = useIssueFilterStore.getState()._persistedByRepo
      const beforeStorage = localStorage.getItem(STORAGE_KEY)

      // Same-path call — must short-circuit and NOT mutate state.
      ws.setRepoPath('/repo-a')

      const after = useIssueFilterStore.getState()
      // Status untouched.
      expect(after.status).toEqual(['open'])
      // Active repo still /repo-a.
      expect(after._activeRepoPath).toBe('/repo-a')
      // No extra entries written into the persisted map.
      expect(Object.keys(after._persistedByRepo).sort()).toEqual([
        '/repo-a',
        '/repo-b',
      ])
      // Same object reference: no setState happened at all, so the
      // store didn't re-allocate the map. Strongest signal that the
      // guard fired.
      expect(after._persistedByRepo).toBe(beforeByRepo)
      // localStorage was not re-flushed.
      expect(localStorage.getItem(STORAGE_KEY)).toBe(beforeStorage)
    })

    it('_setActiveRepoPath handles an undefined _persistedByRepo (defensive `?? {}` in the byRepo snapshot)', () => {
      // The body of _setActiveRepoPath spreads `persisted ?? {}`
      // (line 155) so a corrupted store with `_persistedByRepo ===
      // undefined` still produces a usable byRepo map. The `as
      // unknown as Partial<IssueFilterState>` cast bypasses the
      // `Record<string, IssueFilter>` type — we're simulating
      // exactly the runtime state the guard is there to recover
      // from.
      const ws = makeWorkspaceStub('/repo-a')
      attachToWorkspaceStore(ws, useIssueFilterStore)
      useIssueFilterStore.getState().toggleStatus('open')

      useIssueFilterStore.setState({
        _persistedByRepo: undefined,
      } as unknown as Partial<IssueFilterState>)

      // Switching the workspace triggers _setActiveRepoPath, which
      // snapshots the outgoing repo's filter into the (now
      // `undefined`) map. The `persisted ?? {}` fallback must turn
      // the undefined snapshot into a fresh empty object so the
      // outgoing-repo write still happens.
      expect(() => ws.setRepoPath('/repo-b')).not.toThrow()

      const after = useIssueFilterStore.getState()
      // /repo-a's filter survived the switch.
      expect(after._persistedByRepo['/repo-a']).toEqual({
        status: ['open'],
        priority: [],
        type: [],
        labels: [],
        assignees: [],
      })
      // /repo-b is a brand-new repo — no saved filter yet.
      expect(after._persistedByRepo['/repo-b']).toBeUndefined()
      expect(after._activeRepoPath).toBe('/repo-b')
      expect(after.status).toEqual([])
    })

    it('partialize handles an undefined _persistedByRepo (defensive `?? {}` at line 191)', () => {
      // partialize returns `{ byRepo: state._persistedByRepo ?? {} }`.
      // Drive `_persistedByRepo` to undefined, then trigger a setState
      // that flows through the persist middleware — the middleware
      // must not throw and the persisted value must be `{ byRepo: {} }`.
      useIssueFilterStore.setState({
        _persistedByRepo: undefined,
      } as unknown as Partial<IssueFilterState>)

      // Clear any prior storage entry from earlier tests so we read
      // a fresh write.
      useIssueFilterStore.persist.clearStorage()

      expect(() =>
        useIssueFilterStore.getState().toggleStatus('open')
      ).not.toThrow()

      const raw = localStorage.getItem(STORAGE_KEY)
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw as string) as {
        state: { byRepo: Record<string, unknown> }
        version: number
      }
      // The partialize fallback wrote an empty map — no `byRepo` key
      // was lost in the cast, and the undefined state didn't bleed
      // through to localStorage as the string "undefined".
      expect(parsed.state).toEqual({ byRepo: {} })
      expect(parsed.version).toBe(2)
    })

    it('resetIssueFilterStoreForTests() works on a fresh store with no subscription', () => {
      // Mirror a freshly-booted store: no workspace has ever been
      // attached, so `_unsubscribeWorkspace` is undefined. The
      // `if (s._unsubscribeWorkspace)` guard in `reset()` must skip
      // the unsubscribe call rather than throw
      // `s._unsubscribeWorkspace is not a function`.
      useIssueFilterStore.setState({
        _unsubscribeWorkspace: undefined,
        status: ['open'],
        priority: ['P0'],
        type: ['bug'],
        labels: ['urgent'],
        assignees: ['alice'],
        _activeRepoPath: '/something',
        _persistedByRepo: { '/something': { status: ['open'] } } as never,
      } as unknown as Partial<IssueFilterState>)

      expect(() => resetIssueFilterStoreForTests()).not.toThrow()

      const s = useIssueFilterStore.getState()
      expect(s._activeRepoPath).toBeNull()
      expect(s._persistedByRepo).toEqual({})
      expect(s._unsubscribeWorkspace).toBeUndefined()
      expect(s.status).toEqual([])
      expect(s.priority).toEqual([])
      expect(s.type).toEqual([])
      expect(s.labels).toEqual([])
      expect(s.assignees).toEqual([])
    })

    describe('merge (via persist.getOptions)', () => {
      // The `merge` fn is a closure inside the persist options.
      // `useIssueFilterStore.persist.getOptions()` exposes the full
      // options object — that's the official hook for tests that
      // need to exercise hydration without re-creating the store.
      // merge() is called by Zustand with the result of migrate()
      // and the current state — it lifts `byRepo` into the
      // `_persistedByRepo` internal slice.

      const getMerge = () => {
        const opts = useIssueFilterStore.persist.getOptions()
        if (!opts.merge) throw new Error('merge fn is not exposed')
        return opts.merge
      }

      it('merge lifts byRepo from a well-formed v2 entry into _persistedByRepo', () => {
        // The happy path: persisted state has a byRepo key, merge
        // copies it onto currentState._persistedByRepo. The
        // currentState argument's stale in-memory filter is
        // overridden by ...EMPTY so callers always see empty
        // dimensions on hydrate (the workspace-store subscriber
        // loads the active repo's filter via _setActiveRepoPath).
        const merge = getMerge()
        const byRepo = {
          '/repo-a': {
            status: ['open'],
            priority: ['P1'],
            type: [],
            labels: [],
            assignees: [],
          },
        }
        const persisted = { byRepo }
        const current = useIssueFilterStore.getState()
        const merged = merge(persisted, current)
        expect(merged._persistedByRepo).toEqual(byRepo)
        // The in-memory filter arrays reset to EMPTY on merge —
        // the workspace subscriber reloads the active repo's
        // selection afterward.
        expect(merged.status).toEqual([])
        expect(merged.priority).toEqual([])
        expect(merged.type).toEqual([])
        expect(merged.labels).toEqual([])
        expect(merged.assignees).toEqual([])
      })

      it('merge substitutes {} when persisted state is undefined (defensive `?? {}`)', () => {
        // The cast `(persistedState as Partial<PersistedShape> |
        // undefined) ?? {}` covers a missing localStorage entry.
        // merge() must not throw — it produces a state with an empty
        // _persistedByRepo instead.
        const merge = getMerge()
        const merged = merge(undefined, useIssueFilterStore.getState())
        expect(merged._persistedByRepo).toEqual({})
      })

      it('merge substitutes {} when persisted state is well-formed but lacks byRepo', () => {
        // The second `?? {}` at line 205 (`obj.byRepo ?? {}`) covers
        // a malformed v2 entry — a stored object with no byRepo key.
        // merge() must still return a valid state slice.
        const merge = getMerge()
        const merged = merge(
          { state: {}, version: 2 } as unknown,
          useIssueFilterStore.getState()
        )
        expect(merged._persistedByRepo).toEqual({})
      })
    })

    describe('migrate (via persist.getOptions)', () => {
      // The `migrate` fn is a closure inside the persist options.
      // `useIssueFilterStore.persist.getOptions()` exposes the full
      // options object — that's the official hook for tests that
      // need to exercise migration without setting up a real v1
      // localStorage entry.

      const getMigrate = () => {
        const opts = useIssueFilterStore.persist.getOptions()
        if (!opts.migrate) throw new Error('migrate fn is not exposed')
        return opts.migrate
      }

      it('migrate(_, 1) discards the v1 entry — returns { byRepo: {} }', () => {
        // v1 stored a bare IssueFilter (no per-repo scoping). The
        // migration throws the old shape away because there are no
        // per-repo keys to lift into the new map.
        const migrate = getMigrate()
        expect(
          migrate(
            {
              status: ['open'],
              priority: ['P1'],
              type: [],
              labels: [],
              assignees: [],
            },
            1
          )
        ).toEqual({ byRepo: {} })
      })

      it('migrate(_, 0) also discards — anything < 2 is treated as v1', () => {
        // A v0 entry is hypothetical but the migration treats it
        // the same as v1. Covers the `fromVersion < 2` truthy
        // branch at line 221.
        const migrate = getMigrate()
        expect(migrate({ status: ['open'] }, 0)).toEqual({ byRepo: {} })
      })

      it('migrate(undefined, 99) returns { byRepo: {} } — unexpected version + missing state', () => {
        // Defensive fallback at line 227-228: `obj?.byRepo ?? {}`
        // when both `persistedState` is undefined and `obj?.byRepo`
        // is undefined. The `?.` and the `??` both fire here.
        const migrate = getMigrate()
        expect(migrate(undefined, 99)).toEqual({ byRepo: {} })
      })

      it('migrate({}, 99) returns { byRepo: {} } — byRepo missing on unexpected version', () => {
        // Same fallback, but persistedState is `{}` (defined) and
        // byRepo is absent — exercises the `?? {}` branch only.
        const migrate = getMigrate()
        expect(migrate({}, 99)).toEqual({ byRepo: {} })
      })

      it('migrate({byRepo: ...}, 99) preserves byRepo for future versions', () => {
        // When an unexpected but well-formed v99 entry arrives, the
        // defensive fallback must preserve the byRepo key rather
        // than discarding it — only `fromVersion < 2` discards.
        const migrate = getMigrate()
        const byRepo = { '/repo-a': { status: ['open'] } }
        expect(migrate({ byRepo }, 99)).toEqual({ byRepo })
      })
    })

    describe('persist.rehydrate lifts byRepo from a seeded localStorage entry', () => {
      // End-to-end check that merge() + migrate() are wired
      // correctly: when a v2 entry exists in localStorage, calling
      // persist.rehydrate() must populate _persistedByRepo with the
      // stored map. This is the actual code path the persist
      // middleware takes on app boot.

      it('rehydrates _persistedByRepo from localStorage', async () => {
        const byRepo = {
          '/repo-a': {
            status: ['open'],
            priority: [],
            type: [],
            labels: [],
            assignees: [],
          },
        }
        // Seed localStorage with a v2 entry (current store version).
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ state: { byRepo }, version: 2 })
        )

        // Force the persist middleware to read storage and call
        // merge() against the current state. The middleware awaits
        // the returned promise; we wait for it before asserting.
        await useIssueFilterStore.persist.rehydrate()

        expect(useIssueFilterStore.getState()._persistedByRepo).toEqual(byRepo)

        // Tidy up so the next test sees a clean storage.
        useIssueFilterStore.persist.clearStorage()
      })

      it('rehydrate on an empty localStorage leaves _persistedByRepo at {}', async () => {
        // No localStorage entry → migrate() and merge() both
        // receive undefined → state stays empty. Verifies the
        // defensive default at the start of the rehydration
        // pipeline, end-to-end.
        useIssueFilterStore.persist.clearStorage()
        await useIssueFilterStore.persist.rehydrate()
        expect(useIssueFilterStore.getState()._persistedByRepo).toEqual({})
      })
    })
  })
})

describe('getIssueFilterCounts', () => {
  beforeEach(() => {
    resetIssueFilterStoreForTests()
  })

  it('returns zero on every dimension for the default state', () => {
    expect(getIssueFilterCounts()).toEqual({
      status: 0,
      priority: 0,
      type: 0,
      labels: 0,
      assignees: 0,
    })
  })

  it('reflects the current filter state', () => {
    useIssueFilterStore.setState({
      status: ['open', 'in_progress'],
      priority: ['P0'],
      type: ['bug', 'feature', 'task'],
      labels: ['urgent'],
      assignees: [],
    })
    expect(getIssueFilterCounts()).toEqual({
      status: 2,
      priority: 1,
      type: 3,
      labels: 1,
      assignees: 0,
    })
  })
})
