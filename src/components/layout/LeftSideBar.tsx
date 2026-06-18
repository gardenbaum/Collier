/**
 * LeftSideBar — left rail of the main window.
 *
 * Hosts the `FilterSidebar` against the active workspace. Label
 * and assignee option lists come from the live `bdList` query cache
 * so the rail doesn't fire a second IPC just to render the chips.
 *
 * Children prop is preserved as a future escape hatch (e.g. dev
 * tools, per-workspace metadata) without a breaking change.
 */
import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { commands } from '@/lib/tauri-bindings'
import { useWorkspaceStore } from '@/store/workspace-store'
import { FilterSidebar } from '@/components/beads/issues/FilterSidebar'

interface LeftSideBarProps {
  children?: ReactNode
  className?: string
}

export function LeftSideBar({ children, className }: LeftSideBarProps) {
  const repoPath = useWorkspaceStore(s => s.repoPath)

  // Label set: ask the backend so we don't have to keep the client
  // in sync with the .beads/labels.jsonl file. The query is keyed on
  // cwd so switching repos re-fetches automatically.
  const labelsQuery = useQuery({
    queryKey: ['beads', 'labels', repoPath],
    queryFn: async () => {
      if (repoPath === null) return []
      const result = await commands.bdLabelListAll(repoPath)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    enabled: repoPath !== null,
  })

  // Assignee set: derived from the live `bdList` payload (the same
  // one IssueListView already fetches). No extra IPC.
  const issuesQuery = useQuery({
    queryKey: ['beads', 'list', repoPath, {}],
    queryFn: async () => {
      if (repoPath === null) return []
      const result = await commands.bdList(repoPath, {})
      if (result.status === 'ok') return result.data
      throw result.error
    },
    enabled: repoPath !== null,
    staleTime: Infinity,
  })

  const assignees = useMemo(() => {
    const set = new Set<string>()
    for (const issue of issuesQuery.data ?? []) {
      if (issue.owner !== null && issue.owner.length > 0) {
        set.add(issue.owner)
      }
    }
    return Array.from(set).sort()
  }, [issuesQuery.data])

  const labelNames = useMemo(
    () => (labelsQuery.data ?? []).map(l => l.label).sort(),
    [labelsQuery.data]
  )

  return (
    <div
      className={cn('flex h-full flex-col border-r bg-background', className)}
    >
      {children ?? (
        <FilterSidebar labels={labelNames} assignees={assignees} />
      )}
    </div>
  )
}
