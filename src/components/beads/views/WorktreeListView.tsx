/**
 * WorktreeListView — read-only list of worktrees.
 *
 * bd 1.0.5 has no `worktree` subcommand; v1 ships as an empty state.
 * v2 will render `git worktree list` style info once `bd worktree` ships.
 */
import { GitBranch } from 'lucide-react'
import { EmptyState } from '@/components/atoms'

export interface WorktreeListViewProps {
  /** Repository root (unused for v1). */
  cwd: string
}

export function WorktreeListView({ cwd: _cwd }: WorktreeListViewProps) {
  return (
    <section data-testid="worktree-view" className="flex h-full flex-col">
      <div
        data-testid="worktree-empty"
        className="flex flex-1 items-center justify-center"
      >
        <EmptyState
          icon={GitBranch}
          title="No worktrees"
          body="Run `git worktree add` to create one."
        />
      </div>
    </section>
  )
}

export default WorktreeListView
