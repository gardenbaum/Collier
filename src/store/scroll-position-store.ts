/**
 * Scroll-position store — Zustand slice for per-workspace scroll
 * restoration in virtualized list views.
 *
 * M4 introduced multi-workspace: when the user switches between
 * Beads workspaces, each workspace's scroll offset must round-trip
 * through the switch so they don't lose their place in a long list.
 *
 * Design mirrors `issue-filter-store`:
 *   - Persisted shape: `{ byRepo: Record<path, ScrollPositions> }`
 *   - State exposes the *active* repo's positions directly via the
 *     `getForView` / `setForView` selectors.
 *   - A subscriber to the workspace-store swaps the active map
 *     key on every `repoPath` change.
 *
 * One position per view, keyed by `view` string (the workspace-store's
 * `WorkspaceView` enum). The list view, graph view, blocked view, etc.
 * each maintain their own scroll offset per workspace.
 */
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

/** A map of view-name → scrollTop (px). */
export type ScrollPositions = Record<string, number>

interface ScrollPositionState {
  /** Active repo's positions. Empty when no workspace is open. */
  positions: ScrollPositions
  /** Internal: the path whose `positions` we're currently exposing. */
  _activeRepoPath: string | null
  /** Internal: full persisted map (incl. inactive repos). */
  _persistedByRepo: Record<string, ScrollPositions>
  /** Internal: cleanup for the workspace-store subscription. */
  _unsubscribeWorkspace?: () => void

  /** Read the saved scroll offset for `(path, view)`. */
  getForView: (path: string, view: string) => number
  /** Persist the scroll offset for the active repo + view. */
  setForView: (view: string, offset: number) => void
  /**
   * Internal: called by the workspace-store subscriber. Reads the
   * current `positions` into the previous repo's map key, then
   * overwrites the in-memory `positions` with the new repo's
   * saved values (or empty if the new repo has none yet).
   */
  _setActiveRepoPath: (path: string | null) => void
}

const EMPTY: ScrollPositions = {}

interface PersistedShape {
  byRepo: Record<string, ScrollPositions>
}

export const useScrollPositionStore = create<ScrollPositionState>()(
  devtools(
    persist(
      (set, get) => ({
        positions: EMPTY,
        _activeRepoPath: null,
        _persistedByRepo: {},

        getForView: (path, view) => {
          // Caller-supplied path — used by components that need to
          // look up a position for an arbitrary repo (e.g. a list
          // rendering rows from a different workspace). Falls back
          // to the active repo's positions when the path matches.
          const state = get()
          if (path === state._activeRepoPath) {
            return state.positions[view] ?? 0
          }
          const persisted = state._persistedByRepo ?? {}
          const positions = persisted[path]
          if (positions === undefined) return 0
          return positions[view] ?? 0
        },

        setForView: (view, offset) => {
          if (!Number.isFinite(offset) || offset < 0) return
          const state = get()
          const path = state._activeRepoPath
          if (path === null) {
            // No active workspace — nothing to persist. The set is
            // a no-op so the caller can blindly call this in a
            // shared scroll handler without null-checking.
            return
          }
          const persisted: Record<string, ScrollPositions> = {
            ...(state._persistedByRepo ?? {}),
          }
          const positions: ScrollPositions = { ...state.positions }
          positions[view] = offset
          persisted[path] = positions
          set(
            {
              positions,
              _persistedByRepo: persisted,
            },
            false,
            'setForView'
          )
        },

        _setActiveRepoPath: path => {
          const state = get()
          const prev = state._activeRepoPath
          if (prev === path) return
          const persisted: Record<string, ScrollPositions> = {
            ...(state._persistedByRepo ?? {}),
          }
          // Persist the outgoing repo's current selection.
          if (prev !== null && Object.keys(state.positions).length > 0) {
            persisted[prev] = state.positions
          }
          const next = path === null ? EMPTY : (persisted[path] ?? EMPTY)
          set(
            {
              positions: next,
              _activeRepoPath: path,
              _persistedByRepo: persisted,
            },
            false,
            '_setActiveRepoPath'
          )
        },
      }),
      {
        name: 'collier-scroll-positions',
        version: 1,
        partialize: state => ({
          byRepo: state._persistedByRepo ?? {},
        }),
        merge: (persistedState: unknown, currentState: ScrollPositionState) => {
          const obj =
            (persistedState as Partial<PersistedShape> | undefined) ?? {}
          return {
            ...currentState,
            positions: EMPTY,
            _persistedByRepo: obj.byRepo ?? {},
          }
        },
      }
    ),
    { name: 'scroll-position-store' }
  )
)

/**
 * Wire the scroll-position store to the workspace-store so workspace
 * switches swap the active positions automatically. Idempotent.
 * See `issue-filter-store.attachToWorkspaceStore` for the same
 * pattern — the two stores are intentionally isomorphic so the
 * `App.tsx` wiring reads as two parallel lines.
 */
export function attachToWorkspaceStore(
  workspaceStore: {
    getState: () => { repoPath: string | null }
    subscribe: (
      listener: (state: { repoPath: string | null }) => void
    ) => () => void
  }
): () => void {
  const prev = useScrollPositionStore.getState()._unsubscribeWorkspace
  if (prev) prev()
  const initialPath = workspaceStore.getState().repoPath
  if (initialPath !== null) {
    useScrollPositionStore.getState()._setActiveRepoPath(initialPath)
  }
  const unsubscribe = workspaceStore.subscribe(state => {
    useScrollPositionStore.getState()._setActiveRepoPath(state.repoPath)
  })
  useScrollPositionStore.setState({ _unsubscribeWorkspace: unsubscribe })
  return unsubscribe
}

/**
 * Test-only: reset the store to a clean slate. Production never
 * calls this; it's here so unit tests can start from a known state.
 */
export function resetScrollPositionStoreForTests(): void {
  const s = useScrollPositionStore.getState()
  if (s._unsubscribeWorkspace) s._unsubscribeWorkspace()
  useScrollPositionStore.setState({
    positions: EMPTY,
    _activeRepoPath: null,
    _persistedByRepo: {},
    _unsubscribeWorkspace: undefined,
  })
}