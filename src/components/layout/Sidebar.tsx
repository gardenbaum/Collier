/**
 * FilterSidebar (was: Sidebar) — workspace views, filter chips,
 * and the labels/assignees filter lists.
 *
 * ponytail: this is the canonical sidebar for the IssueListView
 * per spec R2. It exposes the active filter selection as toggle
 * chips grouped by dimension (Status, Priority, Type, Assignees,
 * Labels). Toggling a chip writes to `useIssueFilterStore`; the
 * IssueListView consumes the same store and re-keys its query, so
 * every chip click is a server-side filter (no client-side list
 * manipulation).
 *
 * Multiple chips combine with AND (per spec R2). "Clear all"
 * empties every dimension in one click; the chip itself only
 * renders when at least one dimension is non-empty.
 *
 * Active state is shown by `data-active="true"` on the chip
 * button. Test selectors (and E2E) use the data attribute
 * rather than visual class so refactors don't break the contract.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionLabel } from '@/components/atoms'
import {
  useWorkspaceStore,
  WORKSPACE_VIEWS,
  type WorkspaceView,
} from '@/store/workspace-store'
import { useIssueFilterStore } from '@/store/issue-filter-store'
import { commands } from '@/lib/tauri-bindings'
import type {
  AssigneeWithCount,
  IssuePriority,
  IssueStatus,
  IssueType,
  LabelWithCount,
} from '@/lib/bindings'

const VIEW_LABELS: Record<WorkspaceView, string> = {
  list: 'List',
  ready: 'Ready',
  blocked: 'Blocked',
  search: 'Search',
  epic: 'Epics',
  graph: 'Graph',
  swarm: 'Swarm',
  sync: 'Sync',
  worktree: 'Worktree',
  status: 'Status',
  raw: 'Raw',
}

/** All known lifecycle statuses. Beads allows user-defined custom
 * statuses in v2; until then, this closed set is the source of truth.
 * Sorted in lifecycle order (matching `IssueListView`'s sort) so the
 * sidebar reads the same way the user expects to see the list.
 * (T17 stores them as a set; ordering only affects the sidebar chip
 * layout.) */
const ALL_STATUSES: readonly IssueStatus[] = [
  'open',
  'in_progress',
  'blocked',
  'deferred',
  'closed',
]

/** All priorities P0..P4. Closed enum per the constitution. */
const ALL_PRIORITIES: readonly IssuePriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

/** All issue types per the Beads schema. */
const ALL_TYPES: readonly IssueType[] = [
  'bug',
  'feature',
  'task',
  'epic',
  'chore',
  'decision',
  'gate',
]

/** User-facing label for each enum value — lowercase kebab on the
 * wire, Title Case on screen. Kept in one place so the chip
 * wording can be localised later without touching every chip. */
const STATUS_LABEL: Record<IssueStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  deferred: 'Deferred',
  closed: 'Closed',
}

const PRIORITY_LABEL: Record<IssuePriority, string> = {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
}

const TYPE_LABEL: Record<IssueType, string> = {
  bug: 'Bug',
  feature: 'Feature',
  task: 'Task',
  epic: 'Epic',
  chore: 'Chore',
  decision: 'Decision',
  gate: 'Gate',
}

export function Sidebar() {
  const { t } = useTranslation()
  const activeView = useWorkspaceStore(s => s.activeView)
  const setActiveView = useWorkspaceStore(s => s.setActiveView)
  const repoPath = useWorkspaceStore(s => s.repoPath)

  // ponytail: 7 separate selectors — never destructure the whole
  // store (per AGENTS.md, that would re-render on every unrelated
  // change). The store exposes one toggle action per dimension
  // and a clearAll() for the "Clear all" button.
  const status = useIssueFilterStore(s => s.status)
  const priority = useIssueFilterStore(s => s.priority)
  const issueType = useIssueFilterStore(s => s.type)
  const labels = useIssueFilterStore(s => s.labels)
  const assignees = useIssueFilterStore(s => s.assignees)
  const toggleStatus = useIssueFilterStore(s => s.toggleStatus)
  const togglePriority = useIssueFilterStore(s => s.togglePriority)
  const toggleType = useIssueFilterStore(s => s.toggleType)
  const toggleLabel = useIssueFilterStore(s => s.toggleLabel)
  const toggleAssignee = useIssueFilterStore(s => s.toggleAssignee)
  const clearAll = useIssueFilterStore(s => s.clearAll)

  const hasAnyFilter =
    status.length > 0 ||
    priority.length > 0 ||
    issueType.length > 0 ||
    labels.length > 0 ||
    assignees.length > 0

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

  // ponytail: same parallel query for assignees — `bd` has no
  // dedicated "assignee list-all" subcommand, so the Rust side
  // derives the rows from a full `bd list --json` pass
  // (bd_assignee_list_all). Unassigned issues are excluded.
  const assigneesQuery = useQuery({
    queryKey: ['beads', 'assignees', repoPath],
    queryFn: async () => {
      if (repoPath === null) return []
      const r = await commands.bdAssigneeListAll(repoPath)
      if (r.status === 'ok') return r.data
      throw r.error
    },
    enabled: repoPath !== null,
  })

  const sortedLabels = useMemo<LabelWithCount[]>(
    () =>
      (labelsQuery.data ?? [])
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label)),
    [labelsQuery.data]
  )

  // ponytail: backend already returns assignees sorted by name
  // (Rust BTreeMap sort). We still pass through a defensive
  // copy here so a future backend reorder doesn't silently
  // reshuffle the sidebar — the cost is one n log n pass on
  // a list that's normally <50 entries.
  const sortedAssignees = useMemo<AssigneeWithCount[]>(
    () =>
      (assigneesQuery.data ?? [])
        .slice()
        .sort((a, b) => a.assignee.localeCompare(b.assignee)),
    [assigneesQuery.data]
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
        {hasAnyFilter ? (
          <button
            type="button"
            data-testid="sidebar-filter-clear-all"
            onClick={() => clearAll()}
            aria-label="Clear all filters"
            className="mb-1 inline-flex items-center gap-1 h-6 px-2 text-[11px] text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] hover:bg-[color:var(--sidebar-accent)] rounded-[var(--radius)]"
          >
            <X size={10} aria-hidden="true" />
            <span>Clear all</span>
          </button>
        ) : null}

        <FilterGroup
          testidPrefix="sidebar-filter-status"
          label="Status"
          count={status.length}
        >
          <ChipRow testidPrefix="sidebar-filter-status" active={status}>
            {ALL_STATUSES.map(s => (
              <ToggleChip
                key={s}
                value={s}
                label={STATUS_LABEL[s]}
                isActive={status.includes(s)}
                onToggle={() => toggleStatus(s)}
                testidPrefix="sidebar-filter-status"
              />
            ))}
          </ChipRow>
        </FilterGroup>

        <FilterGroup
          testidPrefix="sidebar-filter-priority"
          label="Priority"
          count={priority.length}
        >
          <ChipRow testidPrefix="sidebar-filter-priority" active={priority}>
            {ALL_PRIORITIES.map(p => (
              <ToggleChip
                key={p}
                value={p}
                label={PRIORITY_LABEL[p]}
                isActive={priority.includes(p)}
                onToggle={() => togglePriority(p)}
                testidPrefix="sidebar-filter-priority"
              />
            ))}
          </ChipRow>
        </FilterGroup>

        <FilterGroup
          testidPrefix="sidebar-filter-type"
          label="Type"
          count={issueType.length}
        >
          <ChipRow testidPrefix="sidebar-filter-type" active={issueType}>
            {ALL_TYPES.map(typ => (
              <ToggleChip
                key={typ}
                value={typ}
                label={TYPE_LABEL[typ]}
                isActive={issueType.includes(typ)}
                onToggle={() => toggleType(typ)}
                testidPrefix="sidebar-filter-type"
              />
            ))}
          </ChipRow>
        </FilterGroup>

        <SectionLabel>{t('sidebar.sections.assignees')}</SectionLabel>
        {assigneesQuery.isLoading ? (
          <div
            className="px-2 py-1 text-[11px] italic text-[color:var(--muted-foreground)]"
            data-testid="sidebar-assignees-loading"
          >
            …
          </div>
        ) : null}
        {assigneesQuery.isError ? (
          <div
            className="px-2 py-1 text-[11px] italic text-[color:var(--muted-foreground)]"
            data-testid="sidebar-assignees-error"
          >
            —
          </div>
        ) : null}
        {!assigneesQuery.isLoading && !assigneesQuery.isError ? (
          sortedAssignees.length === 0 ? (
            <div
              className="px-2 py-1 text-[11px] italic text-[color:var(--muted-foreground)]"
              data-testid="sidebar-assignees-empty"
            >
              —
            </div>
          ) : (
            <ul role="list" className="flex flex-col gap-0.5">
              {sortedAssignees.map(a => {
                const isActive = assignees.includes(a.assignee)
                return (
                  <li key={a.assignee}>
                    <button
                      type="button"
                      data-testid={`sidebar-filter-assignee-${a.assignee}`}
                      data-active={isActive}
                      aria-pressed={isActive}
                      aria-label={`${a.assignee}, ${a.count} ${a.count === 1 ? 'issue' : 'issues'}, filter${isActive ? ', active' : ''}`}
                      onClick={() => toggleAssignee(a.assignee)}
                      className={cn(
                        'flex w-full items-center gap-2 h-7 px-2 rounded-[var(--radius)] text-[12px]',
                        isActive
                          ? 'bg-[color:var(--accent)]/20 text-[color:var(--accent)] font-medium'
                          : 'text-[color:var(--foreground)] hover:bg-[color:var(--sidebar-accent)]'
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-[2px] bg-[color:var(--sidebar-accent-foreground)]/30"
                      />
                      <span className="flex-1 text-start truncate">
                        {a.assignee}
                      </span>
                      <span className="text-[10px] text-[color:var(--muted-foreground)] font-mono">
                        {a.count}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )
        ) : null}

        <SectionLabel>{t('sidebar.sections.labels')}</SectionLabel>
        {labelsQuery.isLoading ? (
          <div
            className="px-2 py-1 text-[11px] italic text-[color:var(--muted-foreground)]"
            data-testid="sidebar-labels-loading"
          >
            …
          </div>
        ) : null}
        {labelsQuery.isError ? (
          <div
            className="px-2 py-1 text-[11px] italic text-[color:var(--muted-foreground)]"
            data-testid="sidebar-labels-error"
          >
            —
          </div>
        ) : null}
        {!labelsQuery.isLoading && !labelsQuery.isError ? (
          sortedLabels.length === 0 ? (
            <div
              className="px-2 py-1 text-[11px] italic text-[color:var(--muted-foreground)]"
              data-testid="sidebar-labels-empty"
            >
              —
            </div>
          ) : (
            <ul role="list" className="flex flex-col gap-0.5">
              {sortedLabels.map(l => {
                const isActive = labels.includes(l.label)
                return (
                  <li key={l.label}>
                    <button
                      type="button"
                      data-testid={`sidebar-label-${l.label}`}
                      data-active={isActive}
                      data-count={l.count}
                      aria-pressed={isActive}
                      aria-label={`${l.label} label, ${l.count} ${l.count === 1 ? 'issue' : 'issues'}, filter${isActive ? ', active' : ''}`}
                      onClick={() => toggleLabel(l.label)}
                      className={cn(
                        'flex w-full items-center gap-2 h-7 px-2 rounded-[var(--radius)] text-[12px]',
                        isActive
                          ? 'bg-[color:var(--accent)]/20 text-[color:var(--accent)] font-medium'
                          : 'text-[color:var(--foreground)] hover:bg-[color:var(--sidebar-accent)]'
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-[2px] bg-[color:var(--sidebar-accent-foreground)]/30"
                      />
                      <span className="flex-1 text-start truncate">
                        {l.label}
                      </span>
                      <span className="text-[10px] text-[color:var(--muted-foreground)] font-mono">
                        {l.count}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )
        ) : null}
      </div>
    </aside>
  )
}

interface FilterGroupProps {
  /** Data-testid prefix used on the section header. */
  testidPrefix: string
  /** Section label text. */
  label: string
  /** Active count badge shown after the label. */
  count: number
  /** Per-value chip row. */
  children: React.ReactNode
}

/** Section header + body for a single filter dimension.
 *
 * ponytail: the header is a `<div>` (not a `<button>`) so it
 * can't be clicked — the dimension's filter affordance is the
 * per-value chips inside it. Toggling is per-value; "clear this
 * dimension" is left to the IssueListView chip × button (a
 * future "remove dimension" affordance). */
function FilterGroup({
  testidPrefix,
  label,
  count,
  children,
}: FilterGroupProps) {
  return (
    <div className="mt-2" data-testid={testidPrefix}>
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[color:var(--muted-foreground)]">
          {label}
        </span>
        <span className="text-[10px] text-[color:var(--muted-foreground)] font-mono">
          ({count})
        </span>
      </div>
      {children}
    </div>
  )
}

interface ChipRowProps {
  testidPrefix: string
  /** Active values; passed-through to preserve referential stability
   * for the parent's memoization (the row's children re-render only
   * when this array reference changes). */
  active: readonly string[]
  children: React.ReactNode
}

/** Flex-wrap row of toggle chips. The wrapper carries a
 * data-testid so tests can scope queries to a single dimension
 * without colliding with sibling sections. */
function ChipRow({ testidPrefix, active, children }: ChipRowProps) {
  return (
    <div
      data-testid={`${testidPrefix}-chips`}
      data-active-count={active.length}
      className="flex flex-wrap gap-1 px-2 pb-1"
    >
      {children}
    </div>
  )
}

interface ToggleChipProps {
  value: string
  label: string
  isActive: boolean
  onToggle: () => void
  testidPrefix: string
}

/** Single toggle chip. `data-active` mirrors the visual active
 * state; tests assert on the attribute rather than the class. */
function ToggleChip({
  value,
  label,
  isActive,
  onToggle,
  testidPrefix,
}: ToggleChipProps) {
  return (
    <button
      type="button"
      data-testid={`${testidPrefix}-${value}`}
      data-active={isActive}
      aria-pressed={isActive}
      aria-label={`${label} filter${isActive ? ', active' : ''}`}
      onClick={onToggle}
      className={cn(
        'inline-flex items-center h-6 px-2 rounded-[var(--radius)] text-[11px] border',
        isActive
          ? 'bg-[color:var(--accent)]/20 text-[color:var(--accent)] border-[color:var(--accent)]/40 font-medium'
          : 'bg-transparent text-[color:var(--foreground)] border-[color:var(--border)] hover:bg-[color:var(--sidebar-accent)]'
      )}
    >
      {label}
    </button>
  )
}

export default Sidebar
