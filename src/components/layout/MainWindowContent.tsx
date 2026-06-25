/**
 * MainWindowContent — the center pane of the main window.
 *
 * Renders the active Beads view (driven by the workspace store's
 * `activeView` + the `WORKSPACE_VIEWS` enum) plus the issue detail
 * drawer as an overlay. The page-header shows the current view's
 * title; view switching happens in the consolidated Sidebar.
 *
 * State onion (per AGENTS.md): local UI → Zustand (`workspace-store`),
 * server data → TanStack Query, persistent prefs → Tauri commands.
 * The fs-watch invalidation hook is mounted here so every view /
 * drawer benefits from fresh disk data without each one
 * re-subscribing.
 */
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace-store'
import { useBeadsInvalidation } from '@/hooks/useBeadsInvalidation'
import { ViewsRouter } from '@/components/beads/ViewsRouter'
import { IssueDetailDrawer } from '@/components/beads/IssueDetailDrawer'
import { Button } from '@/components/ui/button'
import { executeCommand, useCommandContext } from '@/lib/commands'

const PAGE_TITLES: Record<string, string> = {
  list: 'All issues',
  ready: 'Ready to work',
  blocked: 'Blocked',
  search: 'Search',
  epic: 'Epics',
  swarm: 'Swarm',
  sync: 'Sync status',
  worktree: 'Worktrees',
  status: 'Status',
  raw: 'Raw command',
}

export function MainWindowContent() {
  const { t } = useTranslation()
  const repoPath = useWorkspaceStore(s => s.repoPath)
  const activeView = useWorkspaceStore(s => s.activeView)
  const selectedIssueId = useWorkspaceStore(s => s.selectedIssueId)
  const openIssue = useWorkspaceStore(s => s.openIssue)
  const closeIssue = useWorkspaceStore(s => s.closeIssue)
  const commandContext = useCommandContext()

  // Single fs-watch subscription per main window. Views / drawer all
  // benefit from the invalidation without each one re-subscribing.
  useBeadsInvalidation()

  if (repoPath === null) {
    // Defensive: MainWindow is only rendered once a repo is chosen,
    // so this branch should be unreachable in practice. Render a
    // minimal placeholder instead of a hard crash.
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-[color:var(--background)] text-[color:var(--muted-foreground)]">
        {t('main.noWorkspaceSelected', 'No workspace selected.')}
      </div>
    )
  }

  const handleNewIssue = async () => {
    const r = await executeCommand('create-issue', commandContext)
    if (!r.success && r.error) commandContext.showToast(r.error, 'error')
  }

  return (
    <div className="flex h-full flex-col bg-[color:var(--background)]">
      <header
        className="flex h-10 shrink-0 items-center justify-between px-6 border-b border-[color:var(--border)]"
        data-testid="page-header"
      >
        <div className="flex items-center gap-2">
          <h1
            className="text-[13px] font-semibold text-[color:var(--foreground)]"
            data-testid="page-title"
          >
            {PAGE_TITLES[activeView] ?? activeView}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {activeView === 'list' || activeView === 'ready' ? (
            <Button
              onClick={handleNewIssue}
              size="sm"
              variant="default"
              data-testid="page-header-new-issue"
            >
              <Plus className="size-3.5" />
              {t('sidebar.newIssue')}
            </Button>
          ) : null}
        </div>
      </header>

      <div
        className="flex flex-1 flex-col overflow-hidden"
        data-testid="main-viewport"
      >
        <ViewsRouter cwd={repoPath} onOpenIssue={openIssue} />
      </div>

      {selectedIssueId !== null ? (
        <IssueDetailDrawer
          cwd={repoPath}
          issueId={selectedIssueId}
          onClose={closeIssue}
          onOpenIssue={openIssue}
        />
      ) : null}
    </div>
  )
}
