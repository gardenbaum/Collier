/**
 * ViewTabs — main-content tab bar for switching between beads views.
 *
 * The single source of truth for the active tab is `useWorkspaceStore`
 * (selective subscription to `activeView` + `setActiveView`). Tabs are
 * rendered from `WORKSPACE_VIEWS` so adding a view is one line in the
 * store + one branch in the router.
 *
 * A11y: standard WAI-ARIA tabs contract.
 *  - The tab list has `role="tablist"` and a translated label.
 *  - Each tab is `role="tab"` with `aria-selected` reflecting the
 *    active state.
 *  - Roving tabindex: only the active tab has `tabIndex={0}`; the
 *    rest are `tabIndex={-1}`. ArrowLeft / ArrowRight move focus
 *    between tabs and re-activate the tab under focus. Home / End
 *    jump to the first / last tab.
 */
import { useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  WORKSPACE_VIEWS,
  useWorkspaceStore,
  type WorkspaceView,
} from '@/store/workspace-store'
import { cn } from '@/lib/utils'

const TAB_LABELS: Record<WorkspaceView, string> = {
  list: 'beads.tabs.list',
  ready: 'beads.tabs.ready',
  blocked: 'beads.tabs.blocked',
  search: 'beads.tabs.search',
  epic: 'beads.tabs.epic',
  swarm: 'beads.tabs.swarm',
  sync: 'beads.tabs.sync',
  worktree: 'beads.tabs.worktree',
  status: 'beads.tabs.status',
  raw: 'beads.tabs.raw',
}

export function ViewTabs() {
  const { t } = useTranslation()
  const activeView = useWorkspaceStore(s => s.activeView)
  const setActiveView = useWorkspaceStore(s => s.setActiveView)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  // Roving-tabindex keyboard handler. The active tab owns focus; the
  // arrow keys move focus + activate the newly-focused tab. Home/End
  // jump to the first/last tab. Returning false from the handler
  // prevents the page from scrolling on Space/Enter.
  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const total = WORKSPACE_VIEWS.length
    const currentIdx = WORKSPACE_VIEWS.indexOf(activeView)
    let nextIdx: number | null = null
    if (e.key === 'ArrowRight') nextIdx = (currentIdx + 1) % total
    else if (e.key === 'ArrowLeft')
      nextIdx = (currentIdx - 1 + total) % total
    else if (e.key === 'Home') nextIdx = 0
    else if (e.key === 'End') nextIdx = total - 1
    if (nextIdx === null) return
    e.preventDefault()
    if (nextIdx < 0 || nextIdx >= WORKSPACE_VIEWS.length) return
    const next = WORKSPACE_VIEWS[nextIdx]
    if (next === undefined) return
    setActiveView(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <nav
      role="tablist"
      aria-label={t('beads.tabs.label', 'Workspace views')}
      onKeyDown={onTabKeyDown}
      className="flex h-9 shrink-0 items-stretch border-b bg-background"
    >
      {WORKSPACE_VIEWS.map(view => {
        const isActive = view === activeView
        const labelKey = TAB_LABELS[view]
        return (
          <button
            key={view}
            ref={el => {
              tabRefs.current[view] = el
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            data-testid={`view-tab-${view}`}
            onClick={() => setActiveView(view)}
            className={cn(
              'border-r px-3 text-sm font-medium transition-colors',
              'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'border-b-2 border-b-foreground bg-background text-foreground'
                : 'border-b-2 border-b-transparent bg-background text-muted-foreground'
            )}
          >
            {t(labelKey, view)}
          </button>
        )
      })}
    </nav>
  )
}
