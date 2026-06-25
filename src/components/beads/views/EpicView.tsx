/**
 * EpicView — collapsible tree of epics with progress bars.
 *
 * M2 epic tree (R5 in the milestone). Reads the full issue list via
 * `commands.bdList({ cwd, filters: {} })` (the Rust command passes
 * `--all` so closed issues are visible by default — see
 * src-tauri/src/beads/list.rs), groups children by their `parent`
 * field, and renders the epics as a depth-2 tree:
 *
 *   ▸ Epic A             [████░░░] 2/5
 *     • Auth epic child
 *     • Auth epic child
 *   ▾ Epic B             [████████] 3/3
 *     • Perf epic child
 *     …
 *
 * Each epic row has:
 *   - expand/collapse chevron (clickable button)
 *   - StatusPill + PriorityDot + title + id (clickable to open detail)
 *   - progress bar (closed children / total children) + counts
 *
 * Each child row, when expanded, is a clickable button that opens
 * the issue detail via `onOpenIssue`.
 *
 * State onion: server state lives in TanStack Query
 * (`['beads', 'list', cwd, {}]` keyspace), expand/collapse state is a
 * local `useState<Set<string>>` of expanded epic ids. Default: all
 * epics expanded — the user can collapse the ones they don't care
 * about; collapsing on view change is the follow-up (persisted
 * `useWorkspaceStore` slice is out of scope for R5).
 *
 * Keyboard navigation (arrow/h/l) is deferred to R6 — the data-testid
 * hooks are in place so the follow-up can bind without touching the
 * DOM.
 */
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Layers } from 'lucide-react'
import { commands } from '@/lib/tauri-bindings'
import type { Issue } from '@/lib/bindings'
import { colors, palette, radius, space, type } from '@/lib/design-tokens'
import { useWorkspaceStore } from '@/store/workspace-store'
import { EmptyState } from '@/components/atoms'
import { StatusPill } from '../issues/badges/StatusPill'
import { PriorityDot } from '../issues/badges/PriorityDot'

export interface EpicViewProps {
  /** Repository root passed to `bd list`. */
  cwd: string
  /** Called when a row is activated — opens the issue detail drawer. */
  onOpenIssue: (id: string) => void
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  color: colors.mono0,
  fontFamily: type.fontFamily.sans,
}

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
}

const epicRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
  padding: `${space[3]}px ${space[4]}px`,
  borderBottom: `1px solid ${colors.mono3}`,
  backgroundColor: palette.surface,
}

const epicHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[2],
  width: '100%',
}

const chevronButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  padding: 0,
  background: 'transparent',
  border: 'none',
  color: colors.mono5,
  cursor: 'pointer',
  borderRadius: radius.sm,
  flexShrink: 0,
}

const epicTitleButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[2],
  flex: 1,
  minWidth: 0,
  padding: 0,
  background: 'transparent',
  border: 'none',
  color: colors.mono0,
  fontFamily: 'inherit',
  fontSize: type.fontSize.base,
  fontWeight: type.fontWeight.medium,
  cursor: 'pointer',
  textAlign: 'start',
}

const epicTitleStyle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  minWidth: 0,
}

const epicIdStyle: CSSProperties = {
  fontFamily: type.fontFamily.mono,
  fontSize: type.fontSize.xs,
  color: colors.mono5,
  flexShrink: 0,
}

const progressLabelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[2],
  fontSize: type.fontSize.xs,
  color: colors.mono5,
  fontFamily: type.fontFamily.mono,
  flexShrink: 0,
}

const progressTrackStyle: CSSProperties = {
  position: 'relative',
  height: 6,
  width: 96,
  backgroundColor: colors.mono3,
  borderRadius: radius.sm,
  overflow: 'hidden',
  flexShrink: 0,
}

const progressFillStyle = (percent: number): CSSProperties => ({
  position: 'absolute',
  insetBlockStart: 0,
  insetInlineStart: 0,
  height: '100%',
  width: `${Math.max(0, Math.min(100, percent))}%`,
  backgroundColor: palette.success,
  transition: 'width 120ms ease-out',
})

const childrenListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  paddingInlineStart: space[6],
  paddingBlockStart: space[1],
  paddingBlockEnd: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const childRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[2],
  padding: `${space[2]}px ${space[3]}px`,
  backgroundColor: palette.surfaceAlt,
  borderRadius: radius.sm,
  border: `1px solid ${colors.mono3}`,
  width: '100%',
  fontFamily: 'inherit',
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  cursor: 'pointer',
  textAlign: 'start',
}

// ponytail: M5 keyboard cursor indicator. A slightly stronger
// background + a 2px left-edge ring keep the active row visible
// without the brand blue (reserved for destructive + P0 per AC-14).
const childRowSelectedStyle: CSSProperties = {
  backgroundColor: 'rgba(94, 106, 210, 0.18)',
  borderColor: 'rgb(94, 106, 210)',
  boxShadow: 'inset 2px 0 0 0 rgb(94, 106, 210)',
}

const epicRowSelectedStyle: CSSProperties = {
  backgroundColor: 'rgba(94, 106, 210, 0.10)',
  boxShadow: 'inset 2px 0 0 0 rgb(94, 106, 210)',
}

const childTitleStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const childIdStyle: CSSProperties = {
  fontFamily: type.fontFamily.mono,
  fontSize: type.fontSize.xs,
  color: colors.mono5,
  flexShrink: 0,
}

const noChildrenStyle: CSSProperties = {
  padding: `${space[2]}px ${space[3]}px`,
  fontSize: type.fontSize.xs,
  color: colors.mono5,
  fontStyle: 'italic',
}

const errorStyle: CSSProperties = {
  fontSize: type.fontSize.sm,
  color: palette.danger,
  padding: space[4],
}

const loadingRowStyle: CSSProperties = {
  padding: space[4],
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
}

const skeletonBarStyle: CSSProperties = {
  height: 12,
  backgroundColor: colors.mono3,
  borderRadius: radius.sm,
}

/** Progress fraction for an epic: closed children / total children. */
function computeProgress(children: Issue[]): {
  closed: number
  total: number
  percent: number
} {
  const total = children.length
  const closed = children.filter(c => c.status === 'closed').length
  const percent = total === 0 ? 0 : Math.round((closed / total) * 100)
  return { closed, total, percent }
}

// ponytail: `IssuePriority` is `#[repr(u8)] Serialize_repr` on the Rust
// side, so `bd list --json` emits priority as a bare integer 0..4
// (not the P0..P4 string the generated TS type advertises). Calling
// `localeCompare` on a number throws TypeError and crashes the app,
// which the r5 e2e spec surfaces as the "Something went wrong"
// fallback. Use a numeric lookup instead — same shape as the M1
// IssueListView `priorityRank`, kept local so the dependency on
// the runtime data shape is explicit at the call site.
const priorityRank: Record<number, number> = {
  0: 0, // P0
  1: 1, // P1
  2: 2, // P2
  3: 3, // P3
  4: 4, // P4
}

export function EpicView({ cwd, onOpenIssue }: EpicViewProps) {
  const { t } = useTranslation()
  const { data, isLoading, error } = useQuery({
    queryKey: ['beads', 'list', cwd, {}],
    queryFn: async () => {
      const result = await commands.bdList(cwd, {})
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })
  // M5 keyboard navigation: the cursor highlights the active epic
  // (or epic child) so `j`/`k` give visible feedback and `h`/`l`
  // can collapse/expand the selected epic.
  const selectedRowId = useWorkspaceStore(s => s.selectedRowId)

  // Build the tree client-side. Epics are top-level (no parent, type=epic).
  // Children are grouped by `parent` so each epic can render its subtree.
  const tree = useMemo(() => {
    const issues = data ?? []
    const epics = issues
      .filter(i => i.issue_type === 'epic' && i.parent === null)
      // Stable order: highest priority first, then by id for determinism.
      // Uses the numeric `priorityRank` lookup — see comment above
      // for why the generated TS `IssuePriority` string type lies.
      .sort((a, b) => {
        const pa = priorityRank[Number(a.priority)] ?? Number.MAX_SAFE_INTEGER
        const pb = priorityRank[Number(b.priority)] ?? Number.MAX_SAFE_INTEGER
        if (pa !== pb) return pa - pb
        return a.id.localeCompare(b.id)
      })
    const childrenByParent = new Map<string, Issue[]>()
    for (const issue of issues) {
      const parentId: string | null = issue.parent ?? null
      if (parentId === null) continue
      const list = childrenByParent.get(parentId) ?? []
      list.push(issue)
      childrenByParent.set(parentId, list)
    }
    // Sort each child's children list by id so the render is deterministic
    // and the E2E spec can assert on the first child id.
    for (const list of childrenByParent.values()) {
      list.sort((a, b) => a.id.localeCompare(b.id))
    }
    return { epics, childrenByParent }
  }, [data])

  // Default state: every epic expanded. The user can collapse individual
  // epics; the choice lives only for the lifetime of this view.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Keep `expanded` in sync when the query first resolves — the
  // `useState` initializer above ran before `data` arrived, so it
  // initialised with the empty `tree.epics` list. As soon as we
  // have the real list and the user has expressed no preference
  // (no manual toggle yet), open all epics. Subsequent re-renders
  // (e.g. when the file-watcher pushes a fresh list) leave the
  // user's collapse choices alone.
  const [initialized, setInitialized] = useState(false)
  if (!initialized && tree.epics.length > 0 && expanded.size === 0) {
    setExpanded(new Set(tree.epics.map(e => e.id)))
    setInitialized(true)
  } else if (!initialized && tree.epics.length === 0 && data !== undefined) {
    setInitialized(true)
  }

  const toggle = (id: string): void => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <section data-testid="epic-view" style={containerStyle} aria-busy="true">
        <div data-testid="epic-loading" style={loadingRowStyle}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ ...skeletonBarStyle, width: '100%' }} />
          ))}
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section data-testid="epic-view" style={containerStyle}>
        <div data-testid="epic-error" style={errorStyle} role="alert">
          {formatError(error)}
        </div>
      </section>
    )
  }

  const epics = tree.epics

  if (epics.length === 0) {
    return (
      <section
        data-testid="epic-view"
        style={containerStyle}
        aria-label={t('beads.views.epic.title')}
      >
        <div
          data-testid="epic-empty"
          className="flex flex-1 items-center justify-center"
        >
          <EmptyState
            icon={Layers}
            title={t('beads.views.epic.empty.title')}
            body={t('beads.views.epic.empty.body')}
          />
        </div>
      </section>
    )
  }

  return (
    <section
      data-testid="epic-view"
      style={containerStyle}
      aria-label={t('beads.views.epic.title')}
    >
      <ul
        data-testid="epic-tree"
        role="tree"
        aria-label={t('beads.views.epic.title')}
        style={listStyle}
      >
        {epics.map((epic, idx) => (
          <EpicTreeRow
            key={epic.id}
            epic={epic}
            epicChildren={tree.childrenByParent.get(epic.id) ?? []}
            isExpanded={expanded.has(epic.id)}
            isKeyboardSelected={selectedRowId === epic.id}
            selectedRowId={selectedRowId}
            epicIndex={idx + 1}
            epicCount={epics.length}
            onToggle={() => toggle(epic.id)}
            onOpenIssue={onOpenIssue}
          />
        ))}
      </ul>
    </section>
  )
}

interface EpicTreeRowProps {
  epic: Issue
  epicChildren: Issue[]
  isExpanded: boolean
  /**
   * M5 keyboard navigation: highlights the active epic so the user
   * can see which row `h`/`l` would collapse/expand. Selected at
   * the outer `<li>` so the children list picks up the indicator
   * for free when an epic is collapsed.
   */
  isKeyboardSelected: boolean
  /**
   * M5 keyboard navigation: forwarded to the children list so an
   * expanded epic's child rows can also show their selection
   * state. Cheap because it's a single string equality check per
   * child — no extra store subscription needed here.
   */
  selectedRowId: string | null
  /**
   * M5 a11y: 1-based position of this epic within the visible
   * tree, used to set `aria-posinset` on the treeitem. Required
   * by the ARIA tree pattern so screen-reader users know "I am at
   * item 2 of 5 in this level".
   */
  epicIndex: number
  /** M5 a11y: total number of top-level epics, for `aria-setsize`. */
  epicCount: number
  onToggle: () => void
  onOpenIssue: (id: string) => void
}

function EpicTreeRow({
  epic,
  epicChildren,
  isExpanded,
  isKeyboardSelected,
  selectedRowId,
  epicIndex,
  epicCount,
  onToggle,
  onOpenIssue,
}: EpicTreeRowProps) {
  const { t } = useTranslation()
  const { closed, total, percent } = useMemo(
    () => computeProgress(epicChildren),
    [epicChildren]
  )

  return (
    <li
      role="treeitem"
      aria-level={1}
      aria-expanded={isExpanded}
      aria-posinset={epicIndex}
      aria-setsize={epicCount}
      aria-selected={isKeyboardSelected}
      aria-label={`${t('beads.views.epic.openIssue')}: ${epic.title}`}
      data-testid="epic-row"
      data-kbd-nav="row"
      data-row-id={epic.id}
      data-epic-id={epic.id}
      data-expanded={isExpanded}
      data-row-selected={isKeyboardSelected ? 'true' : 'false'}
      tabIndex={isKeyboardSelected ? 0 : -1}
      id={`${epic.id}-treeitem`}
      onKeyDown={e => {
        // The global keyboard hook already routes Enter on the
        // selected row to `openIssue`, but if the user explicitly
        // Tabs onto the treeitem and presses Enter, the row's own
        // keydown handler is what fires first. Keep it in sync
        // so the treeitem is self-contained when focused via the
        // roving tabindex path.
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenIssue(epic.id)
        }
      }}
      style={{
        ...epicRowStyle,
        ...(isKeyboardSelected ? epicRowSelectedStyle : null),
      }}
    >
      <div style={epicHeaderStyle}>
        <button
          type="button"
          data-testid="epic-chevron"
          data-expanded={isExpanded}
          aria-label={
            isExpanded
              ? t('beads.views.epic.collapse')
              : t('beads.views.epic.expand')
          }
          aria-expanded={isExpanded}
          onClick={onToggle}
          style={chevronButtonStyle}
        >
          {isExpanded ? (
            <ChevronDown size={14} aria-hidden="true" />
          ) : (
            <ChevronRight size={14} aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          data-testid="epic-open"
          data-issue-id={epic.id}
          aria-label={`${t('beads.views.epic.openIssue')}: ${epic.title}`}
          onClick={() => onOpenIssue(epic.id)}
          style={epicTitleButtonStyle}
        >
          <PriorityDot priority={epic.priority} />
          <StatusPill status={epic.status} />
          <span style={epicTitleStyle}>{epic.title}</span>
          <span style={epicIdStyle}>{epic.id}</span>
        </button>

        <span
          data-testid="epic-progress"
          data-closed={closed}
          data-total={total}
          style={progressLabelStyle}
          aria-label={t('beads.views.epic.progress', { closed, total } as {
            closed: number
            total: number
          })}
        >
          <span aria-hidden="true">
            {t('beads.views.epic.progress', { closed, total })}
          </span>
          <span
            data-testid="epic-progress-bar"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            style={progressTrackStyle}
          >
            <span style={progressFillStyle(percent)} />
          </span>
          <span data-testid="epic-children-count" aria-hidden="true">
            {t('beads.views.epic.childrenCount', { count: total })}
          </span>
        </span>
      </div>

      {isExpanded ? (
        <ChildrenList
          epicChildren={epicChildren}
          selectedRowId={selectedRowId}
          onOpenIssue={onOpenIssue}
          emptyLabel={t('beads.views.epic.noChildren')}
        />
      ) : null}
    </li>
  )
}

interface ChildrenListProps {
  epicChildren: Issue[]
  /** M5 keyboard navigation: highlight the row matching this id. */
  selectedRowId: string | null
  onOpenIssue: (id: string) => void
  emptyLabel: string
}

function ChildrenList({
  epicChildren,
  selectedRowId,
  onOpenIssue,
  emptyLabel,
}: ChildrenListProps) {
  // ponytail: ChildrenList is rendered inside EpicTreeRow, which
  // also reads `t`, but we re-call the hook here so the
  // childrenGroupLabel translation is owned by the component that
  // actually renders it. Each useTranslation instance is cheap
  // (i18next memoises), so the duplication is fine.
  const { t } = useTranslation()
  if (epicChildren.length === 0) {
    return (
      <div data-testid="epic-children-empty" style={noChildrenStyle}>
        {emptyLabel}
      </div>
    )
  }
  return (
    <ul
      data-testid="epic-children"
      role="group"
      aria-label={t('beads.views.epic.childrenGroupLabel', 'Epic children')}
      style={childrenListStyle}
    >
      {epicChildren.map((child, idx) => {
        const isSelected = child.id === selectedRowId
        return (
          <li
            key={child.id}
            role="treeitem"
            aria-level={2}
            aria-posinset={idx + 1}
            aria-setsize={epicChildren.length}
            aria-selected={isSelected}
            aria-label={child.title}
            data-testid="epic-child-row"
            data-kbd-nav="row"
            data-row-id={child.id}
            data-issue-id={child.id}
            data-issue-status={child.status}
            data-row-selected={isSelected ? 'true' : 'false'}
            tabIndex={isSelected ? 0 : -1}
            id={`${child.id}-treeitem`}
            onClick={() => onOpenIssue(child.id)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpenIssue(child.id)
              }
            }}
            style={{
              ...childRowStyle,
              ...(isSelected ? childRowSelectedStyle : null),
            }}
          >
            <StatusPill status={child.status} />
            <PriorityDot priority={child.priority} />
            <span style={childTitleStyle}>{child.title}</span>
            <span style={childIdStyle}>{child.id}</span>
          </li>
        )
      })}
    </ul>
  )
}

// ponytail: BdError is a tagged union with many variants; we collapse
// to a human-readable string. Non-zero exit surfaces stderr so the
// user sees the real failure reason.
function formatError(err: unknown): string {
  if (err && typeof err === 'object' && 'type' in err) {
    const e = err as { type: string; message?: string; stderr?: string }
    if (e.type === 'NonZeroExit' && e.stderr) return `bd failed: ${e.stderr}`
    if ('message' in e && e.message) return e.message
    return e.type
  }
  if (err instanceof Error) return err.message
  return 'Failed to load epics.'
}

export default EpicView
