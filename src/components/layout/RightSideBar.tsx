/**
 * RightSideBar — right rail of the main window.
 *
 * Hosts the `LabelListView` against the active workspace so labels
 * not yet used in the current filter chips remain visible and the
 * user can audit / copy them.
 *
 * Children prop is preserved as a future escape hatch (per-issue
 * metadata, dependency graph, comments thread) without a breaking
 * change.
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/store/workspace-store'
import { LabelListView } from '@/components/beads/labels/LabelListView'

interface RightSideBarProps {
  children?: ReactNode
  className?: string
}

export function RightSideBar({ children, className }: RightSideBarProps) {
  const repoPath = useWorkspaceStore(s => s.repoPath)

  return (
    <div
      className={cn('flex h-full flex-col border-l bg-background', className)}
    >
      {children ??
        (repoPath !== null ? <LabelListView cwd={repoPath} /> : null)}
    </div>
  )
}
