/**
 * MainWindowContent — the center pane of the main window.
 *
 * Renders the active Beads view (driven by the workspace store's
 * `activeView` + the `WORKSPACE_VIEWS` enum) plus the issue detail
 * drawer as an overlay. View-tabs + views-router + drawer are the
 * three pieces of state that drive the beads UI surface.
 *
 * State onion (per AGENTS.md): local UI → Zustand (`workspace-store`),
 * server data → TanStack Query, persistent prefs → Tauri commands.
 * The fs-watch invalidation hook is mounted here so every tab /
 * view / drawer benefits from fresh disk data without each
 * re-subscribing.
 */
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '@/store/workspace-store'
import { useBeadsInvalidation } from '@/hooks/useBeadsInvalidation'
import { ViewTabs } from '@/components/beads/ViewTabs'
import { ViewsRouter } from '@/components/beads/ViewsRouter'
import { IssueDetailDrawer } from '@/components/beads/IssueDetailDrawer'

export function MainWindowContent() {
  const { t } = useTranslation()
  const repoPath = useWorkspaceStore(s => s.repoPath)
  const selectedIssueId = useWorkspaceStore(s => s.selectedIssueId)
  const openIssue = useWorkspaceStore(s => s.openIssue)
  const closeIssue = useWorkspaceStore(s => s.closeIssue)

  // Single fs-watch subscription per main window. Tabs / views /
  // drawer all benefit from the invalidation without each one
  // re-subscribing.
  useBeadsInvalidation()

  if (repoPath === null) {
    // Defensive: MainWindow is only rendered once a repo is
    // chosen, so this branch should be unreachable in practice.
    // Render a minimal placeholder instead of a hard crash.
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-background text-muted-foreground">
        {t('main.noWorkspaceSelected', 'No workspace selected.')}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <ViewTabs />
      <div className="flex-1 overflow-hidden" data-testid="main-viewport">
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
