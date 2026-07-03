/**
 * Generic helper to wire a per-repo Zustand store to the workspace-store.
 *
 * Background
 * ----------
 * Several Zustand stores in the app maintain a per-repo map of state
 * (`_persistedByRepo: Record<path, T>`) and expose a `_setActiveRepoPath`
 * action that swaps the in-memory slice to the matching entry whenever
 * the workspace changes. Today the wiring is the same in every such
 * store -- issue-filter, scroll-position, etc. -- and was previously
 * duplicated verbatim across files. This helper extracts that wiring
 * once; each per-repo store calls it from a thin forwarding wrapper so
 * the existing public API and tests stay untouched.
 *
 * Contract
 * --------
 * The `workspaceStore` only needs `getState().repoPath` and `subscribe`
 * -- the same slice `App.tsx` already passes to the per-store wrappers.
 *
 * The `perRepoStore` only needs to expose:
 *   - `getState()._unsubscribeWorkspace?`  (cleaned up on re-attach)
 *   - `getState()._setActiveRepoPath(path)` (called on workspace changes)
 *   - `setState({ _unsubscribeWorkspace })` (so the store can later tear
 *     itself down in tests / on app shutdown).
 *
 * Behaviour
 * ---------
 * Idempotent -- re-calling tears down any prior subscription before
 * attaching a new one, so tests can re-attach after a `setState` reset.
 * Returns the unsubscribe fn the caller can use for cleanup; in
 * production the stores live for the whole session, so cleanup is a
 * no-op.
 */
export interface WorkspaceStore {
  getState: () => { repoPath: string | null }
  subscribe: (
    listener: (state: { repoPath: string | null }) => void
  ) => () => void
}

export interface PerRepoStore {
  getState: () => {
    _unsubscribeWorkspace?: () => void
    _setActiveRepoPath: (path: string | null) => void
  }
  setState: (state: { _unsubscribeWorkspace?: () => void }) => void
}

export function attachToWorkspaceStore(
  workspaceStore: WorkspaceStore,
  perRepoStore: PerRepoStore
): () => void {
  const prev = perRepoStore.getState()._unsubscribeWorkspace
  if (prev) prev()

  // Initial sync: load the active repo's selection if one is set.
  const initialPath = workspaceStore.getState().repoPath
  if (initialPath !== null) {
    perRepoStore.getState()._setActiveRepoPath(initialPath)
  }

  const unsubscribe = workspaceStore.subscribe(state => {
    perRepoStore.getState()._setActiveRepoPath(state.repoPath)
  })

  perRepoStore.setState({ _unsubscribeWorkspace: unsubscribe })
  return unsubscribe
}
