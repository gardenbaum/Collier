/**
 * Workspace store — Zustand slice for the active beads repository.
 *
 * Holds the path of the repo the user is currently working in, the
 * main-view tab selection, and the issue id of the open detail drawer.
 * All three are read by `App.tsx` (bootstrap flow), `MainWindowContent`
 * (view router) and `IssueDetailView` (drawer overlay).
 *
 * `repoPath` is persisted to localStorage so a restart drops the user
 * back into the last workspace without a re-pick. `version: 1` makes
 * any future schema change opt-in via a `migrate` step instead of a
 * silent corruption.
 */
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

export type WorkspaceView =
  | 'list'
  | 'ready'
  | 'blocked'
  | 'search'
  | 'epic'
  | 'graph'
  | 'swarm'
  | 'sync'
  | 'worktree'
  | 'status'
  | 'raw'

export const WORKSPACE_VIEWS: readonly WorkspaceView[] = [
  'list',
  'ready',
  'blocked',
  'search',
  'epic',
  'graph',
  'swarm',
  'sync',
  'worktree',
  'status',
  'raw',
] as const

interface WorkspaceState {
  repoPath: string | null
  activeView: WorkspaceView
  selectedIssueId: string | null

  setRepoPath: (path: string | null) => void
  setActiveView: (view: WorkspaceView) => void
  setSelectedIssueId: (id: string | null) => void
  openIssue: (id: string) => void
  closeIssue: () => void
  reset: () => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  devtools(
    persist(
      set => ({
        repoPath: null,
        activeView: 'list',
        selectedIssueId: null,

        setRepoPath: path =>
          set(state =>
            state.repoPath === path
              ? state
              : { repoPath: path, selectedIssueId: null }
          ),
        setActiveView: view => set({ activeView: view }),
        setSelectedIssueId: id => set({ selectedIssueId: id }),
        openIssue: id => set({ selectedIssueId: id }),
        closeIssue: () => set({ selectedIssueId: null }),
        reset: () =>
          set({
            repoPath: null,
            activeView: 'list',
            selectedIssueId: null,
          }),
      }),
      {
        name: 'collier-workspace',
        version: 1,
        // We intentionally persist only the repo path; view + selection
        // are runtime concerns that should reset on launch.
        partialize: state => ({ repoPath: state.repoPath }),
      }
    ),
    { name: 'workspace-store' }
  )
)
