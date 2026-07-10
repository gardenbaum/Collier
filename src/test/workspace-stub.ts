/**
 * Test-only workspace-store stub.
 *
 * The helper under test (`attachToWorkspaceStore`) only reads two
 * slices of the real store:
 *   - `getState().repoPath`
 *   - `subscribe(listener)`
 *
 * This stub mirrors that contract — `setRepoPath` plays the role of
 * `setState` for the path field, fires every active subscriber, and
 * `subscribe` returns an unsubscribe fn that detaches the listener.
 *
 * Shared by `issue-filter-store.test.ts`, `scroll-position-store.test.ts`,
 * and `attach-to-workspace-store.test.ts`.
 */

export interface WorkspaceStubState {
  repoPath: string | null
}

export interface WorkspaceStub {
  /** Snapshot of `repoPath` at construction time. Use `getState()` for the live value. */
  repoPath: string | null
  getState: () => WorkspaceStubState
  subscribe: (listener: (state: WorkspaceStubState) => void) => () => void
  /** Mutate `repoPath` and notify every subscriber. */
  setRepoPath: (path: string | null) => void
}

export function makeWorkspaceStub(
  initialPath: string | null = null
): WorkspaceStub {
  const listeners = new Set<(state: WorkspaceStubState) => void>()
  const state: WorkspaceStubState = { repoPath: initialPath }
  return {
    repoPath: state.repoPath,
    getState: () => state,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setRepoPath: path => {
      state.repoPath = path
      listeners.forEach(l => l({ repoPath: path }))
    },
  }
}
