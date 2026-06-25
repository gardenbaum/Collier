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
 *
 * **M4 — multi-workspace switcher.** The header dropdown lets the
 * user jump between known Beads workspaces without going back to
 * the bootstrap screen. `switchWorkspace(path)` is the action: it
 * updates `repoPath`, closes any open detail drawer, clears the
 * TanStack Query cache for the old workspace (so list / detail /
 * graph views refetch against the new repo), and writes the new
 * path to `recent_repos` (so the dropdown finds it again next
 * time). The queryClient is captured via a setter installed by
 * `installQueryClient` on app boot — see `src/main.tsx`. We
 * deliberately don't take a `queryClient` parameter on every
 * action because the singleton is process-global and stable.
 */
import type { QueryClient } from '@tanstack/react-query'
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
  /**
   * M5 keyboard navigation: the issue id of the row highlighted
   * by j/k in the active list view. Distinct from `selectedIssueId`
   * (which tracks the currently-open detail drawer). Cleared on
   * workspace switch, repo path change, and when Escape is pressed
   * without an open drawer.
   */
  selectedRowId: string | null

  setRepoPath: (path: string | null) => void
  setActiveView: (view: WorkspaceView) => void
  setSelectedIssueId: (id: string | null) => void
  /**
   * M5 keyboard navigation: move the keyboard cursor to the given
   * row id. No-op when the value is unchanged. Always a UI-only
   * mutation — never affects `selectedIssueId` or the open drawer.
   */
  setSelectedRowId: (id: string | null) => void
  openIssue: (id: string) => void
  closeIssue: () => void
  reset: () => void
  /**
   * Switch to a different Beads workspace in-place. Updates
   * `repoPath`, closes the open detail drawer, drops the old
   * workspace's TanStack Query cache (so list / detail / graph
   * refetch against the new repo), and fires a `recent_repos`
   * update via the on-disk Rust command so the dropdown finds
   * the workspace again next launch. No-op when `path` equals
   * the current `repoPath`.
   */
  switchWorkspace: (path: string) => void
}

// Module-level queryClient handle. Set once at app boot via
// `installQueryClient` (see src/main.tsx); used by `switchWorkspace`
// to drop the old workspace's query cache. Kept module-private so
// callers can't mutate it from outside the store.
let queryClient: QueryClient | null = null

/**
 * Wire the TanStack Query singleton into the workspace store so
 * `switchWorkspace` can clear the old workspace's cache. Idempotent
 * — re-calling with the same client is a no-op. MUST be called once
 * during app boot, after `QueryClientProvider` mounts.
 */
export function installQueryClient(client: QueryClient): void {
  queryClient = client
}

/**
 * Read-only access for tests and the `switchWorkspace` action.
 * Returns null when the app hasn't installed a client yet (the
 * store itself never throws on this — `switchWorkspace` simply
 * skips the invalidation step in that case so the store stays
 * usable from isolated tests).
 */
export function getQueryClient(): QueryClient | null {
  return queryClient
}

export const useWorkspaceStore = create<WorkspaceState>()(
  devtools(
    persist(
      (set, get) => ({
        repoPath: null,
        activeView: 'list',
        selectedIssueId: null,
        selectedRowId: null,

        setRepoPath: path =>
          set(state =>
            state.repoPath === path
              ? state
              : { repoPath: path, selectedIssueId: null, selectedRowId: null }
          ),
        setActiveView: view => set({ activeView: view }),
        setSelectedIssueId: id => set({ selectedIssueId: id }),
        setSelectedRowId: id =>
          set(state => (state.selectedRowId === id ? state : { selectedRowId: id })),
        openIssue: id => set({ selectedIssueId: id }),
        closeIssue: () => set({ selectedIssueId: null }),
        reset: () =>
          set({
            repoPath: null,
            activeView: 'list',
            selectedIssueId: null,
            selectedRowId: null,
          }),
        switchWorkspace: path => {
          if (path.length === 0) return
          const current = get().repoPath
          if (current === path) return
          // Each workspace's beads list + show caches are keyed
          // on its own path (`['beads', 'list', cwd, filters]` and
          // `['beads', 'show', cwd, id]`), so a switch is naturally
          // isolated by the queryKey — the OLD workspace's
          // component re-renders with a new queryKey and TanStack
          // Query discards it as garbage, the NEW workspace's
          // component renders with its OWN queryKey and finds
          // either a fresh cached list (if it was loaded before
          // — instant render) or runs the queryFn (cold bd
          // subprocess, ~1-2s on Dolt). The previous implementation
          // called `removeQueries({ queryKey: ['beads'] })` which
          // wiped every workspace's cache, forcing a fresh `bd
          // list --json` subprocess on every switch and racing the
          // e2e spec's 10s budget under Dolt cold-start (r9 test
          // 5: 'can switch back to the first fixture and reload'
          // failed with 'Received string: 0 issues' / 'Loading...').
          // Keep `selectedIssueId: null` — the old issue is from
          // a different workspace. Same applies to `selectedRowId`:
          // the keyboard cursor points at a row in the previous
          // workspace's list, which is no longer rendered.
          set({
            repoPath: path,
            selectedIssueId: null,
            selectedRowId: null,
          })
        },
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
