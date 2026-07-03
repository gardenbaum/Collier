/**
 * WorkspaceSwitcher — header dropdown listing every Beads workspace
 * the user has touched.
 *
 * Discovery (M4 spec):
 *   1. The active workspace (always first, always labelled "current")
 *   2. AppPreferences.recent_repos
 *   3. ~/.beads/registry.json entries not already in (1) or (2)
 *
 * Picking an entry calls `useWorkspaceStore.switchWorkspace(path)`,
 * which (a) drops the old workspace's `['beads']` query cache so the
 * TanStack Query consumers re-fetch against the new repo, (b) closes
 * any open detail drawer, (c) writes the new path to recent_repos so
 * it appears in the dropdown again next time. The watcher hook
 * (`useBeadsInvalidation`) re-attaches itself because it depends on
 * `repoPath` from the workspace-store.
 *
 * The current workspace is rendered with a check icon and bold
 * weight; missing workspaces (`exists === false`) are rendered with a
 * muted color and a "missing" tooltip so the user can clean them up.
 *
 * Tests: see `workspace-switcher.test.tsx`. We cover the rendered
 * list shape (current first, recents / registry after), the
 * "missing" visual treatment, the click-to-switch path (mocking the
 * Tauri commands), and the empty-state (no workspace open yet).
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Folder, FolderOpen, RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { commands } from '@/lib/tauri-bindings'
import type { WorkspaceEntry } from '@/lib/bindings'
import { useWorkspaceStore } from '@/store/workspace-store'
import { cn } from '@/lib/utils'

/** Tailwind keyframes for the refresh spinner. Inline so the
 *  component doesn't pull in a global stylesheet. */
const REFRESH_KEYFRAMES = `@keyframes workspace-switcher-spin { to { transform: rotate(360deg); } }`

/**
 * Fetch the workspace list. Re-fetches on a 30s staleTime — the
 * sources (recent_repos + registry.json) change infrequently and
 * the cost of a stale list is "the dropdown is missing a workspace
 * the user just opened", which resolves itself on the next render
 * anyway. The refetch-on-mount + manual refresh button keeps the
 * source of truth tight without aggressive polling.
 */
function useWorkspaceList(current: string | null): {
  entries: WorkspaceEntry[]
  isLoading: boolean
  isError: boolean
  refresh: () => void
  isFetching: boolean
} {
  const query = useQuery({
    queryKey: ['workspace-list', current],
    queryFn: async () => {
      const result = await commands.listWorkspaces(current)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    // Re-fetch when the active workspace changes — switching repos
    // rewrites recent_repos, so the list is stale until the next
    // query invalidation. We can't easily invalidate from the
    // workspace store, so instead we key on `current` and let
    // TanStack Query re-run the queryFn.
    staleTime: 30_000,
  })

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refresh: () => {
      void query.refetch()
    },
    isFetching: query.isFetching,
  }
}

export interface WorkspaceSwitcherProps {
  /** Optional override for the active workspace. Defaults to the
   *  workspace-store's repoPath. Provided as a prop so tests can
   *  inject a controlled value without touching the global store. */
  currentPath?: string | null
  /** Optional override for the switch callback. Defaults to the
   *  workspace-store's `switchWorkspace` action. */
  onSwitch?: (path: string) => void
}

export function WorkspaceSwitcher({
  currentPath,
  onSwitch,
}: WorkspaceSwitcherProps): React.JSX.Element {
  const { t } = useTranslation()
  // Resolve the active path: prop wins when supplied, otherwise read
  // from the workspace store. We use a getState() subscription via
  // a re-rendering selector so the dropdown updates when the user
  // switches workspaces from any code path (bootstrap, switcher,
  // command palette future).
  const repoPath = useWorkspaceStore(s => s.repoPath)
  const switchWorkspace = useWorkspaceStore(s => s.switchWorkspace)
  const active = currentPath === undefined ? repoPath : currentPath
  const handleSwitch = onSwitch ?? switchWorkspace

  const { entries, isLoading, isError, refresh, isFetching } =
    useWorkspaceList(active)

  // Group entries by source so the dropdown has clear sections
  // (current, recents, registry) instead of one flat list. The
  // current entry is always first; the recents and registry follow
  // in that order. If there is no current entry (bootstrap hasn't
  // completed), we hide the "current" section entirely.
  const currentEntry = entries.find(e => e.path === active) ?? null
  const recents = entries.filter(
    e => e.source === 'recent' && e.path !== active
  )
  const registryEntries = entries.filter(
    e => e.source === 'registry' && e.path !== active
  )
  const [open, setOpen] = useState(false)
  // Track the last-seen path so the dropdown doesn't refetch on
  // mount-after-switch — the query is keyed on `active` already,
  // but the consumer-facing `isFetching` flag would flicker. We
  // read entries from the cache for one render after a path change
  // and then the new fetch resolves.
  // (no extra effect needed; useQuery handles staleness for us.)

  // Refresh the list whenever the dropdown opens. This catches
  // any changes the user made externally between sessions (e.g.
  // they edited registry.json, or a new `bd init` was run). Doing
  // this on open rather than on a timer means we only do the work
  // when the user is actually looking at the list.
  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  const triggerLabel =
    currentEntry?.name ?? active ?? t('workspace.noWorkspace', 'No workspace')
  const triggerSubtitle =
    currentEntry?.path ?? active ?? t('workspace.pickOne', 'Pick a workspace')

  return (
    <>
      <style>{REFRESH_KEYFRAMES}</style>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          data-testid="workspace-switcher-trigger"
          aria-label={t('workspace.switcherLabel', 'Switch workspace')}
          className={cn(
            'group flex items-center gap-1.5 rounded-[var(--radius)] px-2 py-1 text-left',
            'hover:bg-[color:var(--accent)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ring)]',
            'data-[state=open]:bg-[color:var(--accent)]'
          )}
        >
          <FolderOpen
            className="size-3.5 text-[color:var(--muted-foreground)] group-data-[state=open]:text-[color:var(--foreground)]"
            aria-hidden
          />
          <div className="flex flex-col leading-tight">
            <span
              className="text-[12px] font-semibold text-[color:var(--foreground)] tracking-tight"
              data-testid="workspace-switcher-name"
            >
              {triggerLabel}
            </span>
            <span
              className="text-[10px] text-[color:var(--muted-foreground)] font-mono truncate max-w-[260px]"
              data-testid="workspace-switcher-path"
              title={triggerSubtitle}
            >
              {triggerSubtitle}
            </span>
          </div>
          <ChevronDown
            className="size-3 text-[color:var(--muted-foreground)] group-data-[state=open]:rotate-180 transition-transform"
            aria-hidden
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="min-w-[320px] max-w-[480px]"
          data-testid="workspace-switcher-menu"
        >
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>{t('workspace.switcherHeading', 'Workspaces')}</span>
            <button
              type="button"
              onClick={e => {
                e.preventDefault()
                refresh()
              }}
              className={cn(
                'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px]',
                'text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--accent)]',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ring)]'
              )}
              data-testid="workspace-switcher-refresh"
              aria-label={t('workspace.refresh', 'Refresh workspace list')}
            >
              <RefreshCw
                className={cn(
                  'size-3',
                  isFetching &&
                    'animate-[workspace-switcher-spin_1s_linear_infinite]'
                )}
                aria-hidden
              />
              {t('workspace.refresh', 'Refresh')}
            </button>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {isLoading && entries.length === 0 ? (
            <DropdownMenuItem disabled data-testid="workspace-switcher-loading">
              <span className="text-[color:var(--muted-foreground)]">
                {t('workspace.loading', 'Loading workspaces…')}
              </span>
            </DropdownMenuItem>
          ) : null}

          {isError ? (
            <DropdownMenuItem disabled data-testid="workspace-switcher-error">
              <span className="text-[color:var(--destructive)]">
                {t('workspace.error', 'Failed to load workspaces')}
              </span>
            </DropdownMenuItem>
          ) : null}

          {!isLoading && !isError && entries.length === 0 ? (
            <DropdownMenuItem disabled data-testid="workspace-switcher-empty">
              <span className="text-[color:var(--muted-foreground)]">
                {t('workspace.empty', 'No workspaces yet')}
              </span>
            </DropdownMenuItem>
          ) : null}

          {currentEntry !== null ? (
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-[color:var(--muted-foreground)] pt-2">
              {t('workspace.currentSection', 'Current')}
            </DropdownMenuLabel>
          ) : null}
          {currentEntry !== null ? (
            <CurrentWorkspaceRow
              entry={currentEntry}
              data-testid="workspace-switcher-current"
            />
          ) : null}

          {recents.length > 0 ? (
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-[color:var(--muted-foreground)] pt-2">
              {t('workspace.recentsSection', 'Recents')}
            </DropdownMenuLabel>
          ) : null}
          {recents.map(entry => (
            <WorkspaceRow
              key={`recent:${entry.path}`}
              entry={entry}
              onSelect={() => {
                handleSwitch(entry.path)
                setOpen(false)
              }}
            />
          ))}

          {registryEntries.length > 0 ? (
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-[color:var(--muted-foreground)] pt-2">
              {t('workspace.registrySection', 'Registry')}
            </DropdownMenuLabel>
          ) : null}
          {registryEntries.map(entry => (
            <WorkspaceRow
              key={`registry:${entry.path}`}
              entry={entry}
              onSelect={() => {
                handleSwitch(entry.path)
                setOpen(false)
              }}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

interface CurrentWorkspaceRowProps extends React.HTMLAttributes<HTMLDivElement> {
  entry: WorkspaceEntry
}

/**
 * The "current" row is rendered as a label (not an item) so the
 * user can't click-to-switch to the workspace they're already in.
 * Showing the check icon + bold name makes it obvious which one is
 * active when the list has 3+ entries. The shared inner label body
 * lives in `WorkspaceEntryLabel` (variant="current").
 */
function CurrentWorkspaceRow({
  entry,
  className,
  ...rest
}: CurrentWorkspaceRowProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
        className
      )}
      data-active="true"
      {...rest}
    >
      <WorkspaceEntryLabel entry={entry} variant="current" />
    </div>
  )
}

interface WorkspaceRowProps {
  entry: WorkspaceEntry
  onSelect: () => void
}

/** A single non-current workspace entry. The shared inner label body
 *  lives in `WorkspaceEntryLabel` (variant="row"). */
function WorkspaceRow({
  entry,
  onSelect,
}: WorkspaceRowProps): React.JSX.Element {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      data-testid="workspace-switcher-item"
      data-workspace-path={entry.path}
      data-workspace-source={entry.source}
      data-workspace-exists={entry.exists ? 'true' : 'false'}
    >
      <WorkspaceEntryLabel entry={entry} variant="row" />
    </DropdownMenuItem>
  )
}

interface WorkspaceEntryLabelProps {
  entry: WorkspaceEntry
  /**
   * `'current'` renders a Check icon + a fixed bold/foreground name;
   * the parent (CurrentWorkspaceRow) renders this as a non-clickable
   * label. `'row'` renders only the Folder icon + a missing-aware
   * name (line-through when !entry.exists) + an `ml-auto` missing
   * badge; the parent (WorkspaceRow) wraps it in a DropdownMenuItem.
   */
  variant: 'current' | 'row'
}

/**
 * Shared inner body for both the "current" label and the per-entry
 * dropdown rows. Both call sites render the same folder icon + name
 * + path + optional missing badge; the only differences are the
 * presence of a Check icon, the Folder colour rule, the missing-state
 * styling on the name, and an `ml-auto` push on the missing badge for
 * the non-current variant. Extracted here to remove a self-duplicate
 * flagged by `bun run jscpd`.
 */
function WorkspaceEntryLabel({
  entry,
  variant,
}: WorkspaceEntryLabelProps): React.JSX.Element {
  const isCurrent = variant === 'current'

  const folderClass = isCurrent
    ? entry.exists
      ? 'text-[color:var(--foreground)]'
      : 'text-[color:var(--muted-foreground)]'
    : entry.exists
      ? 'text-[color:var(--muted-foreground)]'
      : 'text-[color:var(--destructive)]'

  const nameClass = isCurrent
    ? 'text-[12px] font-semibold text-[color:var(--foreground)] truncate'
    : cn(
        'text-[12px] truncate',
        entry.exists
          ? 'text-[color:var(--foreground)]'
          : 'text-[color:var(--muted-foreground)] line-through'
      )

  return (
    <>
      {isCurrent ? (
        <Check
          className="size-3.5 text-[color:var(--primary)] shrink-0"
          aria-hidden
        />
      ) : null}
      <Folder className={cn('size-3.5 shrink-0', folderClass)} aria-hidden />
      <div className="flex flex-col leading-tight min-w-0 flex-1">
        <span
          className={nameClass}
          data-testid={
            isCurrent
              ? 'workspace-switcher-current-name'
              : 'workspace-switcher-item-name'
          }
        >
          {entry.name}
        </span>
        <span
          className="text-[10px] text-[color:var(--muted-foreground)] font-mono truncate"
          title={entry.path}
        >
          {entry.path}
        </span>
      </div>
      {!entry.exists ? (
        <span
          className={cn(
            'text-[10px] uppercase tracking-wider text-[color:var(--destructive)]',
            !isCurrent && 'ml-auto'
          )}
        >
          missing
        </span>
      ) : null}
    </>
  )
}
