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

  // Build the tree client-side. Epics are top-level (no parent, type=epic).
  // Children are grouped by `parent` so each epic can render its subtree.
  const tree = useMemo(() => {
    const issues = data ?? []
    const epics = issues
      .filter(i => i.issue_type === 'epic' && i.parent === null)
      // Stable order: highest priority first, then by id for determinism.
      .sort((a, b) => {
        if (a.priority !== b.priority)
          return a.priority.localeCompare(b.priority)
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
      <ul data-testid="epic-tree" style={listStyle}>
        {epics.map(epic => (
          <EpicTreeRow
            key={epic.id}
            epic={epic}
            epicChildren={tree.childrenByParent.get(epic.id) ?? []}
            isExpanded={expanded.has(epic.id)}
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
  onToggle: () => void
  onOpenIssue: (id: string) => void
}

function EpicTreeRow({
  epic,
  epicChildren,
  isExpanded,
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
      data-testid="epic-row"
      data-epic-id={epic.id}
      data-expanded={isExpanded}
      style={epicRowStyle}
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
          onOpenIssue={onOpenIssue}
          emptyLabel={t('beads.views.epic.noChildren')}
        />
      ) : null}
    </li>
  )
}

interface ChildrenListProps {
  epicChildren: Issue[]
  onOpenIssue: (id: string) => void
  emptyLabel: string
}

function ChildrenList({
  epicChildren,
  onOpenIssue,
  emptyLabel,
}: ChildrenListProps) {
  if (epicChildren.length === 0) {
    return (
      <div data-testid="epic-children-empty" style={noChildrenStyle}>
        {emptyLabel}
      </div>
    )
  }
  return (
    <ul data-testid="epic-children" style={childrenListStyle}>
      {epicChildren.map(child => (
        <li key={child.id}>
          <button
            type="button"
            data-testid="epic-child-row"
            data-issue-id={child.id}
            data-issue-status={child.status}
            onClick={() => onOpenIssue(child.id)}
            style={childRowStyle}
          >
            <StatusPill status={child.status} />
            <PriorityDot priority={child.priority} />
            <span style={childTitleStyle}>{child.title}</span>
            <span style={childIdStyle}>{child.id}</span>
          </button>
        </li>
      ))}
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
