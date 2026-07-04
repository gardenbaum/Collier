/**
 * Issue-filter store — Zustand slice for the FilterSidebar.
 *
 * ponytail (M4): per-workspace persistence. The state still exposes
 * `status`, `priority`, etc. directly (callers don't care which repo
 * they're in), but those arrays now mirror the active repo's saved
 * filter rather than a single global filter. The full set of filters
 * is persisted as `Record<path, IssueFilter>` under one localStorage
 * key (`collier-issue-filter`), and the store subscribes to the
 * workspace-store so a workspace switch swaps the in-memory filter to
 * the new repo's saved selection.
 *
 * Selector pattern (per AGENTS.md): never destructure the whole store
 * in a component — `useIssueFilterStore(state => state.status)` for
 * the dimension you need.
 *
 * Wiring the store to the workspace-store lives in
 * `./attach-to-workspace-store.ts` — call
 * `attachToWorkspaceStore(workspaceStore, useIssueFilterStore)` from
 * the app boot path.
 */
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { IssuePriority, IssueType } from '@/lib/bindings'

export interface IssueFilter {
  status: string[]
  priority: IssuePriority[]
  type: IssueType[]
  labels: string[]
  assignees: string[]
}

export interface IssueFilterState extends IssueFilter {
  /** Wired during boot via `attachToWorkspaceStore`. Internal. */
  _activeRepoPath: string | null
  /** Subscribed to workspace-store changes. Internal. */
  _unsubscribeWorkspace?: () => void
  /**
   * Internal: full persisted map (incl. inactive repos). Lives
   * on the state slice so the persist middleware can write it
   * to localStorage and so `_setActiveRepoPath` can read the
   * latest persisted map when swapping repos.
   */
  _persistedByRepo: Record<string, IssueFilter>

  toggleStatus: (s: string) => void
  togglePriority: (p: IssuePriority) => void
  toggleType: (t: IssueType) => void
  toggleLabel: (l: string) => void
  toggleAssignee: (a: string) => void
  clearAll: () => void
  /**
   * Internal: called by the workspace-store subscriber when the
   * active repo changes. Loads the saved filter for `path` (or
   * an empty filter when none is persisted yet) and writes the
   * previous repo's current state back to the map so a round-trip
   * switch restores it.
   */
  _setActiveRepoPath: (path: string | null) => void
}

const EMPTY: IssueFilter = {
  status: [],
  priority: [],
  type: [],
  labels: [],
  assignees: [],
}

/**
 * Persisted shape. The `version` is bumped to 2 so an old v1 entry
 * (which serialised as a bare `IssueFilter`) is treated as an empty
 * map by Zustand's `migrate` step rather than silently feeding into
 * the new `byRepo` field.
 */
interface PersistedShape {
  byRepo: Record<string, IssueFilter>
}

export const useIssueFilterStore = create<IssueFilterState>()(
  devtools(
    persist(
      (set, get) => ({
        ...EMPTY,
        _activeRepoPath: null,
        _persistedByRepo: {},

        toggleStatus: s =>
          set(
            state => ({
              status: state.status.includes(s)
                ? state.status.filter(x => x !== s)
                : [...state.status, s],
            }),
            false,
            'toggleStatus'
          ),
        togglePriority: p =>
          set(
            state => ({
              priority: state.priority.includes(p)
                ? state.priority.filter(x => x !== p)
                : [...state.priority, p],
            }),
            false,
            'togglePriority'
          ),
        toggleType: t =>
          set(
            state => ({
              type: state.type.includes(t)
                ? state.type.filter(x => x !== t)
                : [...state.type, t],
            }),
            false,
            'toggleType'
          ),
        toggleLabel: l =>
          set(
            state => ({
              labels: state.labels.includes(l)
                ? state.labels.filter(x => x !== l)
                : [...state.labels, l],
            }),
            false,
            'toggleLabel'
          ),
        toggleAssignee: a =>
          set(
            state => ({
              assignees: state.assignees.includes(a)
                ? state.assignees.filter(x => x !== a)
                : [...state.assignees, a],
            }),
            false,
            'toggleAssignee'
          ),
        clearAll: () => set({ ...EMPTY }, false, 'clearAll'),

        _setActiveRepoPath: path => {
          const prev = get()._activeRepoPath
          if (prev === path) return
          // The persist middleware writes the `byRepo` map on every
          // set() — we read the latest map from storage via the
          // store's persisted slice. Zustand persist exposes the
          // current hydrated state through getState(), but we need
          // to round-trip through storage to avoid losing a write
          // the subscriber makes between our get() and set().
          // Simplest correct approach: snapshot the current filter
          // into the next path's map key, and overwrite the in-memory
          // state with the next path's filter (or empty).
          const persisted = get()._persistedByRepo
          const byRepo: Record<string, IssueFilter> = {
            ...(persisted ?? {}),
          }
          // Persist the outgoing repo's current selection (if it
          // had a repo key — the very first selection before any
          // workspace was opened is dropped, since there's no path
          // to attribute it to).
          if (prev !== null) {
            byRepo[prev] = {
              status: get().status,
              priority: get().priority,
              type: get().type,
              labels: get().labels,
              assignees: get().assignees,
            }
          }
          const next = path === null ? EMPTY : (byRepo[path] ?? EMPTY)
          // Write the merged map back; the persist middleware will
          // also flush this, but we set it explicitly so subscribers
          // see the new filter on the same render.
          set(
            {
              ...next,
              _activeRepoPath: path,
              _persistedByRepo: byRepo,
            },
            false,
            '_setActiveRepoPath'
          )
        },
      }),
      {
        name: 'collier-issue-filter',
        version: 2,
        // Persist only the by-repo map; the in-memory fields are
        // derived from `_activeRepoPath` + the map on hydrate.
        partialize: state => ({
          byRepo: state._persistedByRepo ?? {},
        }),
        // On hydrate: lift the persisted map into the store's
        // internal `_persistedByRepo` field. The active repo's
        // filter isn't loaded here — `attachToWorkspaceStore`
        // reads `repoPath` from the workspace-store once on boot
        // and calls `_setActiveRepoPath`, which is what writes
        // the active repo's filter into `status` / `priority` / …
        merge: (
          persistedState: unknown,
          currentState: IssueFilterState
        ): IssueFilterState => {
          const obj =
            (persistedState as Partial<PersistedShape> | undefined) ?? {}
          const byRepo = obj.byRepo ?? {}
          return {
            ...currentState,
            ...EMPTY,
            _persistedByRepo: byRepo,
          }
        },
        migrate: (
          persistedState: unknown,
          fromVersion: number
        ): PersistedShape => {
          // v1 → v2: the old format was a bare IssueFilter (no
          // per-repo scoping). Discard it — a v1 user gets the
          // same UX as a fresh install (empty filters everywhere).
          // The byRepo key wasn't there, so there are no saved
          // per-repo filters to migrate.
          if (fromVersion < 2) {
            return { byRepo: {} }
          }
          // Defensive default for unexpected versions — Zustand
          // calls migrate before merge, so we always return the
          // expected shape.
          const obj = persistedState as Partial<PersistedShape> | undefined
          return { byRepo: obj?.byRepo ?? {} }
        },
      }
    ),
    { name: 'issue-filter-store' }
  )
)

// The internal `_persistedByRepo`, `_activeRepoPath`, and
// `_unsubscribeWorkspace` fields live on the state slice (declared
// on the State interface below) so the persist middleware can
// write them to localStorage and so `_setActiveRepoPath` can read
// the latest persisted map when swapping repos. Their underscore
// prefix marks them as "not part of the public API — call the
// actions, don't poke the fields directly".

/**
 * Test-only: reset every piece of the store (in-memory filter,
 * persisted map, active repo, subscription). Used by tests that
 * start from a clean slate; production code never calls this.
 */
export function resetIssueFilterStoreForTests(): void {
  const s = useIssueFilterStore.getState()
  if (s._unsubscribeWorkspace) s._unsubscribeWorkspace()
  useIssueFilterStore.setState({
    ...EMPTY,
    _activeRepoPath: null,
    _persistedByRepo: {},
    _unsubscribeWorkspace: undefined,
  })
}

/**
 * Snapshot of every dimension's active count. Lives outside the store so
 * it never lands in localStorage and so callers don't need to subscribe
 * to the store just to read lengths.
 */
export interface IssueFilterCounts {
  status: number
  priority: number
  type: number
  labels: number
  assignees: number
}

// ponytail: read latest state via getState(). The store is module-level
// so by the time this helper is called the store is fully initialised —
// no TDZ or circular reference.
export const getIssueFilterCounts = (): IssueFilterCounts => {
  const s = useIssueFilterStore.getState()
  return {
    status: s.status.length,
    priority: s.priority.length,
    type: s.type.length,
    labels: s.labels.length,
    assignees: s.assignees.length,
  }
}
