import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { SectionLabel } from '@/components/atoms'
import {
  useWorkspaceStore,
  WORKSPACE_VIEWS,
  type WorkspaceView,
} from '@/store/workspace-store'
import { useIssueFilterStore } from '@/store/issue-filter-store'
import { commands } from '@/lib/tauri-bindings'

const VIEW_LABELS: Record<WorkspaceView, string> = {
  list: 'List',
  ready: 'Ready',
  blocked: 'Blocked',
  search: 'Search',
  epic: 'Epics',
  swarm: 'Swarm',
  sync: 'Sync',
  worktree: 'Worktree',
  status: 'Status',
  raw: 'Raw',
}

export function Sidebar() {
  const { t } = useTranslation()
  const activeView = useWorkspaceStore(s => s.activeView)
  const setActiveView = useWorkspaceStore(s => s.setActiveView)
  const repoPath = useWorkspaceStore(s => s.repoPath)

  const status = useIssueFilterStore(s => s.status)
  const priority = useIssueFilterStore(s => s.priority)
  const issueType = useIssueFilterStore(s => s.type)

  const labelsQuery = useQuery({
    queryKey: ['beads', 'labels', repoPath],
    queryFn: async () => {
      if (repoPath === null) return []
      const r = await commands.bdLabelListAll(repoPath)
      if (r.status === 'ok') return r.data
      throw r.error
    },
    enabled: repoPath !== null,
  })

  const sortedLabels = useMemo(
    () =>
      (labelsQuery.data ?? [])
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label)),
    [labelsQuery.data]
  )

  return (
    <aside
      className="flex h-full w-full flex-col border-r border-[color:var(--border)] bg-[color:var(--sidebar)] backdrop-blur-xl"
      data-testid="sidebar"
    >
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <SectionLabel>{t('sidebar.sections.views')}</SectionLabel>
        <ul role="list" className="flex flex-col gap-0.5">
          {WORKSPACE_VIEWS.map(view => {
            const isActive = view === activeView
            return (
              <li key={view}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  data-active={isActive}
                  data-testid={`sidebar-view-${view}`}
                  onClick={() => setActiveView(view)}
                  className={cn(
                    'flex w-full items-center justify-between h-7 px-2 rounded-[var(--radius)] text-[12px] transition-colors',
                    isActive
                      ? 'bg-[color:var(--accent)]/20 text-[color:var(--accent)] font-medium'
                      : 'text-[color:var(--foreground)] hover:bg-[color:var(--sidebar-accent)]'
                  )}
                >
                  <span>{VIEW_LABELS[view]}</span>
                </button>
              </li>
            )
          })}
        </ul>

        <SectionLabel>{t('sidebar.sections.filters')}</SectionLabel>
        <ul role="list" className="flex flex-col gap-0.5">
          {[
            {
              testid: 'sidebar-filter-status',
              label: 'Status',
              count: status.length,
            },
            {
              testid: 'sidebar-filter-priority',
              label: 'Priority',
              count: priority.length,
            },
            {
              testid: 'sidebar-filter-type',
              label: 'Type',
              count: issueType.length,
            },
          ].map(f => (
            <li key={f.testid}>
              <button
                type="button"
                data-testid={f.testid}
                className="flex w-full items-center justify-between h-7 px-2 rounded-[var(--radius)] text-[12px] text-[color:var(--foreground)] hover:bg-[color:var(--sidebar-accent)]"
              >
                <span>{f.label}</span>
                <span className="text-[10px] text-[color:var(--muted-foreground)] font-mono">
                  ({f.count})
                </span>
              </button>
            </li>
          ))}
        </ul>

        <SectionLabel>{t('sidebar.sections.labels')}</SectionLabel>
        <ul role="list" className="flex flex-col gap-0.5">
          {sortedLabels.length === 0 ? (
            <li
              className="px-2 py-1 text-[11px] italic text-[color:var(--muted-foreground)]"
              data-testid="sidebar-labels-empty"
            >
              —
            </li>
          ) : (
            sortedLabels.map(l => (
              <li key={l.label}>
                <button
                  type="button"
                  data-testid={`sidebar-label-${l.label}`}
                  data-count={l.count}
                  className="flex w-full items-center gap-2 h-7 px-2 rounded-[var(--radius)] text-[12px] text-[color:var(--foreground)] hover:bg-[color:var(--sidebar-accent)]"
                >
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-[2px] bg-[color:var(--sidebar-accent-foreground)]/30"
                  />
                  <span className="flex-1 text-start truncate">{l.label}</span>
                  <span className="text-[10px] text-[color:var(--muted-foreground)] font-mono">
                    {l.count}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </aside>
  )
}

export default Sidebar
