/**
 * ViewsRouter — single-render switch over the workspace's active view.
 *
 * The router intentionally lives in a dedicated component so the parent
 * (MainWindowContent) can keep its layout structure (header / tabs /
 * content / drawer) in one place. Each branch renders the dedicated
 * view component for the active tab; data fetching and shell styling
 * stay encapsulated inside each view.
 */
import { useWorkspaceStore } from '@/store/workspace-store'
import { IssueListView } from './issues/IssueListView'
import { ReadyView } from './issues/ReadyView'
import { BlockedView } from './issues/BlockedView'
import { SearchView } from './issues/SearchView'
import { EpicView } from './views/EpicView'
import { SwarmView } from './views/SwarmView'
import { SyncStatusView } from './views/SyncStatusView'
import { WorktreeListView } from './views/WorktreeListView'
import { StatusOverviewView } from './views/StatusOverviewView'
import { RawCommandPanel } from './raw/RawCommandPanel'

export interface ViewsRouterProps {
  /** Active workspace repository root. */
  cwd: string
  /** Called when a row in a list view is activated. */
  onOpenIssue: (id: string) => void
}

export function ViewsRouter({ cwd, onOpenIssue }: ViewsRouterProps) {
  const activeView = useWorkspaceStore(s => s.activeView)

  switch (activeView) {
    case 'list':
      return <IssueListView cwd={cwd} onOpenIssue={onOpenIssue} />
    case 'ready':
      return <ReadyView cwd={cwd} />
    case 'blocked':
      return <BlockedView cwd={cwd} />
    case 'search':
      return <SearchView cwd={cwd} />
    case 'epic':
      return <EpicView cwd={cwd} />
    case 'swarm':
      return <SwarmView cwd={cwd} />
    case 'sync':
      return <SyncStatusView cwd={cwd} />
    case 'worktree':
      return <WorktreeListView cwd={cwd} />
    case 'status':
      return <StatusOverviewView cwd={cwd} />
    case 'raw':
      return <RawCommandPanel cwd={cwd} />
    default:
      return null
  }
}
