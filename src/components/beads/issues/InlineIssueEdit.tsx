/**
 * InlineIssueEdit — clickable status / priority / assignee cells for
 * the issue list and the issue detail header. Spec M1 R3.
 *
 * ponytail: three sibling subcomponents share one mutation hook
 * (`useInlineUpdate`) so the optimistic-update + reconcile-via-
 * watcher pattern lives in one place. The pattern is:
 *
 *   1. User picks a new value in the dropdown.
 *   2. The TanStack Query cache for `['beads', 'list', cwd]` (and the
 *      `['beads', 'show', cwd, issueId]` cache, if mounted) is
 *      patched in place via `setQueryData`. The UI re-renders with
 *      the new value immediately — this is the "optimistic" half.
 *   3. The `bd update` Tauri command runs in the background. On
 *      success, the file-watcher fires `beads-data-changed`, the
 *      cache invalidates, and the next refetch confirms the
 *      optimistic value. On error, we revert the cache patch and
 *      toast a message.
 *
 * Each subcomponent renders the existing badge / pill (StatusPill,
 * PriorityDot, TypeIcon) plus an `<select>` overlay that's invisible
 * until the user activates it. We could swap the badge for the
 * native control directly, but doing so:
 *   - loses the badge styling (color-coded status / priority dots
 *     are the visual identity of the issue row)
 *   - prevents inline display in the cell — native `<select>` is
 *     block-level and wider than the badge it replaces
 *   - drops the hover affordance the user needs to discover the
 *     control is interactive
 *
 * So we keep the badge as the visible cell content and overlay a
 * transparent `<select>` on hover. The native control is still
 * keyboard-accessible (Tab focuses the cell, arrow keys change the
 * value, Enter/Space confirm) and the badge's data-testid /
 * data-status / data-priority attributes are unchanged so all
 * existing selectors keep working.
 *
 * State onion (per AGENTS.md):
 *   - Local "menu open" hover state → `useState` (component-local)
 *   - Optimistic cache patch → TanStack Query `queryClient`
 *   - `bd update` IPC call → TanStack Query `useMutation`
 *   - No Zustand needed.
 *
 * Hard-edged Bauhaus: mono only, hard edges, inline `style` with
 * design tokens. The brand colour is reserved for destructive + P0
 * per AC-14; this component never reaches for it. No animations,
 * no transitions, no shadow, no radius.
 */
import { useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { commands } from '@/lib/tauri-bindings'
import type {
  Issue,
  IssuePriority,
  IssueStatus,
  UpdateInput,
} from '@/lib/bindings'
import { logger } from '@/lib/logger'
import { colors, radius, space, type } from '@/lib/design-tokens'
import { PriorityDot } from './badges/PriorityDot'
import { StatusPill } from './badges/StatusPill'

/** Beads lifecycle statuses. Beads allows user-defined custom
 *  statuses in v2; until then, this closed set is the source of truth.
 *  Sorted in lifecycle order so the dropdown reads the way the user
 *  thinks about issue progress. */
const ALL_STATUSES: readonly IssueStatus[] = [
  'open',
  'in_progress',
  'blocked',
  'deferred',
  'closed',
]

const ALL_PRIORITIES: readonly IssuePriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

/** Common base shape for the three inline-editable cells. */
interface InlineCellBaseProps {
  /** Repository root — passed to `commands.bdUpdate`. */
  cwd: string
  /** The issue being edited. The current cell value is read from
   *  this prop; the optimistic patch writes back into the
   *  TanStack Query cache so all consumers see the change. */
  issue: Issue
  /**
   * When true, swallow click / mousedown / keydown events on the
   * inline control so they don't bubble up to a parent
   * `role="button"` row. The issue-list row uses a button-like
   * div as its outer surface; without this guard, clicking the
   * native select to open its dropdown would also fire the row's
   * "open detail" handler. Set this to true when embedding the
   * cell inside a clickable row.
   */
  swallowHostEvents?: boolean
}

/**
 * `useInlineUpdate` — single mutation hook shared by the three
 * subcomponents. The shape of the call is identical: `bd update
 * <id> --status/--priority/--assignee <newValue>`. We model the
 * "new value" as a single discriminated union (`Field`) so a
 * future inline-editable field (e.g. `type`) can be added without
 * adding a parallel mutation hook.
 *
 * ponytail: optimistic update strategy. We patch the two caches
 * the user might be looking at:
 *   - `['beads', 'list', cwd]` — the issue list. Patching this
 *     keeps the rendered rows in sync immediately.
 *   - `['beads', 'show', cwd, issueId]` — the detail drawer, if
 *     mounted. Patching this keeps the detail header in sync
 *     without waiting for the watcher to round-trip.
 *
 * The watcher tick (which always fires after a successful bd
 * write) will refetch both caches and confirm the optimistic value.
 * On mutation error, we revert the patch and toast the error.
 */
type Field =
  | { kind: 'status'; value: IssueStatus }
  | { kind: 'priority'; value: IssuePriority }
  | { kind: 'assignee'; value: string | null }

interface UseInlineUpdateArgs {
  cwd: string
  issueId: string
}

function useInlineUpdate({ cwd, issueId }: UseInlineUpdateArgs) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (field: Field) => {
      // ponytail: build a minimal UpdateInput — only the field
      // the user just edited. Sending the full struct would
      // cause the CLI to write a no-op history entry for every
      // unchanged field.
      const input: UpdateInput = {}
      switch (field.kind) {
        case 'status':
          input.status = field.value
          break
        case 'priority':
          input.priority = field.value
          break
        case 'assignee':
          // ponytail: empty string means "unassign" per the
          // bindings contract (UpdateInput.assignee: Option<String>,
          // Some("") is treated as "not set" — `bd update --assignee ""`
          // would error on bd). null sends an explicit unassign.
          input.assignee = field.value ?? ''
          break
      }
      const result = await commands.bdUpdate(cwd, issueId, input)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    onMutate: async (field: Field) => {
      // ponytail: cancel any in-flight refetch for both caches
      // BEFORE we patch. Otherwise a stale refetch could overwrite
      // the optimistic value between our patch and the cache write.
      await queryClient.cancelQueries({ queryKey: ['beads', 'list', cwd] })
      await queryClient.cancelQueries({
        queryKey: ['beads', 'show', cwd, issueId],
      })

      const listKey = ['beads', 'list', cwd]
      const showKey = ['beads', 'show', cwd, issueId]

      const previousList = queryClient.getQueryData<Issue[]>(listKey)
      const previousShow = queryClient.getQueryData<Issue>(showKey)

      const apply = (issue: Issue): Issue => {
        switch (field.kind) {
          case 'status':
            return { ...issue, status: field.value }
          case 'priority':
            return { ...issue, priority: field.value }
          case 'assignee':
            return { ...issue, owner: field.value }
        }
      }

      if (previousList) {
        queryClient.setQueryData<Issue[]>(
          listKey,
          previousList.map(i => (i.id === issueId ? apply(i) : i))
        )
      }
      if (previousShow) {
        queryClient.setQueryData<Issue>(showKey, apply(previousShow))
      }

      return { previousList, previousShow }
    },
    onError: (err, _field, context) => {
      // ponytail: revert both caches to the pre-mutation snapshot.
      // The context is typed as `unknown` by TanStack; we know the
      // shape because we own onMutate. The cast is the standard
      // TanStack escape hatch for the same reason.
      const ctx = context as
        | {
            previousList: Issue[] | undefined
            previousShow: Issue | undefined
          }
        | undefined
      if (ctx?.previousList) {
        queryClient.setQueryData(['beads', 'list', cwd], ctx.previousList)
      }
      if (ctx?.previousShow) {
        queryClient.setQueryData(
          ['beads', 'show', cwd, issueId],
          ctx.previousShow
        )
      }
      logger.error('inline issue edit failed', { err })
      toast.error(formatMutationError(err))
    },
    onSuccess: updated => {
      // ponytail: the watcher will fire beads-data-changed within
      // ~1s and TanStack will refetch both caches. We also patch
      // them with the freshly-returned issue here so the UI is
      // instantly correct even if the watcher is slow.
      queryClient.setQueryData<Issue[]>(
        ['beads', 'list', cwd],
        (prev: Issue[] | undefined) =>
          prev ? prev.map(i => (i.id === updated.id ? updated : i)) : prev
      )
      queryClient.setQueryData<Issue>(['beads', 'show', cwd, issueId], updated)
    },
  })
}

/** Format a mutation error into a user-readable string. Mirrors the
 *  shape used elsewhere in the codebase (IssueActions / IssueUpdatePanel). */
function formatMutationError(err: unknown): string {
  if (err && typeof err === 'object' && 'type' in err) {
    const e = err as { type: string; message?: string; stderr?: string }
    if (e.type === 'NonZeroExit' && e.stderr) return e.stderr
    if ('message' in e && e.message) return e.message
    return e.type
  }
  if (err instanceof Error) return err.message
  return 'Failed to update issue.'
}

interface InlineStatusEditProps extends InlineCellBaseProps {
  /** Optional className for the wrapper. */
  className?: string
}

/**
 * InlineStatusEdit — clickable status cell.
 *
 * Renders the existing `<StatusPill>` plus a transparent native
 * `<select>` overlay. The overlay is keyboard-focusable, has the
 * same `data-testid` as the pill (so existing E2E selectors keep
 * working), and forwards `change` events to the shared mutation
 * hook. Row click is NOT swallowed — the `<select>` is a sibling
 * element under the row rather than a child of the row's
 * `<button>`-like surface; see IssueListView for the propagation
 * handling.
 */
export function InlineStatusEdit({
  cwd,
  issue,
  className,
  swallowHostEvents,
}: InlineStatusEditProps) {
  const { t } = useTranslation()
  const mutation = useInlineUpdate({ cwd, issueId: issue.id })
  const [hovered, setHovered] = useState(false)
  const guard = hostGuardProps(swallowHostEvents)

  // ponytail: native <select> inside a CSS-grid row can stretch
  // beyond the cell — we cap it to the cell width and let the
  // visible pill sit in the same box. The select is absolutely
  // positioned at 0/0 with width:100% so it covers the pill on
  // hover; opacity 0 keeps the pill visible by default.
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as IssueStatus
    if (next === issue.status) return
    mutation.mutate({ kind: 'status', value: next })
    toast.success(
      t('beads.inlineEdit.statusChanged', {
        id: issue.id,
        status: next,
        defaultValue: `${issue.id} → ${next}`,
      })
    )
  }

  return (
    <span
      data-testid="inline-status-edit"
      className={className}
      style={wrapperStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...guard}
    >
      <StatusPill status={issue.status} />
      <select
        data-testid="inline-status-select"
        data-status={issue.status}
        aria-label={t('beads.inlineEdit.changeStatus', 'Change status')}
        value={issue.status}
        onChange={handleChange}
        disabled={mutation.isPending}
        style={{
          ...selectOverlayStyle,
          opacity: hovered || mutation.isPending ? 1 : 0,
        }}
      >
        {ALL_STATUSES.map(s => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {mutation.isPending ? (
        <span data-testid="inline-status-pending" style={pendingBadgeStyle}>
          …
        </span>
      ) : null}
    </span>
  )
}

interface InlinePriorityEditProps extends InlineCellBaseProps {
  className?: string
}

/**
 * InlinePriorityEdit — clickable priority cell. Same pattern as
 * InlineStatusEdit: the existing `<PriorityDot>` stays visible and
 * a native `<select>` overlays on hover.
 */
export function InlinePriorityEdit({
  cwd,
  issue,
  className,
  swallowHostEvents,
}: InlinePriorityEditProps) {
  const { t } = useTranslation()
  const mutation = useInlineUpdate({ cwd, issueId: issue.id })
  const [hovered, setHovered] = useState(false)
  const guard = hostGuardProps(swallowHostEvents)

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as IssuePriority
    if (next === issue.priority) return
    mutation.mutate({ kind: 'priority', value: next })
    toast.success(
      t('beads.inlineEdit.priorityChanged', {
        id: issue.id,
        priority: next,
        defaultValue: `${issue.id} → ${next}`,
      })
    )
  }

  return (
    <span
      data-testid="inline-priority-edit"
      className={className}
      style={wrapperStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...guard}
    >
      <PriorityDot priority={issue.priority} />
      <select
        data-testid="inline-priority-select"
        data-priority={issue.priority}
        aria-label={t('beads.inlineEdit.changePriority', 'Change priority')}
        value={issue.priority}
        onChange={handleChange}
        disabled={mutation.isPending}
        style={{
          ...selectOverlayStyle,
          opacity: hovered || mutation.isPending ? 1 : 0,
        }}
      >
        {ALL_PRIORITIES.map(p => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      {mutation.isPending ? (
        <span data-testid="inline-priority-pending" style={pendingBadgeStyle}>
          …
        </span>
      ) : null}
    </span>
  )
}

interface InlineAssigneeEditProps extends InlineCellBaseProps {
  className?: string
}

/**
 * InlineAssigneeEdit — clickable assignee cell. Shows the current
 * owner (or an em-dash for unassigned) plus a native `<select>`
 * overlay. The dropdown is populated from
 * `commands.bdAssigneeListAll` (the same query that powers the
 * sidebar), with an explicit "(unassigned)" option rendered first.
 */
export function InlineAssigneeEdit({
  cwd,
  issue,
  className,
  swallowHostEvents,
}: InlineAssigneeEditProps) {
  const { t } = useTranslation()
  const mutation = useInlineUpdate({ cwd, issueId: issue.id })
  const [hovered, setHovered] = useState(false)
  const guard = hostGuardProps(swallowHostEvents)

  // ponytail: the dropdown's option list comes from the same
  // assignees query the sidebar uses. Re-using the query key
  // (`['beads', 'assignees', cwd]`) lets the React Query deduper
  // share the result across both consumers — no double-fetch.
  const assigneesQuery = useQuery({
    queryKey: ['beads', 'assignees', cwd],
    queryFn: async () => {
      const result = await commands.bdAssigneeListAll(cwd)
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const raw = e.target.value
    // ponytail: the special sentinel `__unassigned__` means "no
    // owner". We send `null` to bd (which writes an empty
    // assignee). Native selects can't represent null cleanly, so
    // a sentinel string in the option list is the canonical
    // workaround.
    const next = raw === '__unassigned__' ? null : raw
    if (next === (issue.owner ?? null)) return
    mutation.mutate({ kind: 'assignee', value: next })
    toast.success(
      t('beads.inlineEdit.assigneeChanged', {
        id: issue.id,
        assignee: next ?? t('beads.inlineEdit.unassigned', 'unassigned'),
        defaultValue: `${issue.id} → ${next ?? 'unassigned'}`,
      })
    )
  }

  const currentValue = issue.owner ?? '__unassigned__'

  return (
    <span
      data-testid="inline-assignee-edit"
      data-assignee={issue.owner ?? ''}
      className={className}
      style={wrapperStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...guard}
    >
      <span style={assigneeTextStyle}>
        {issue.owner ?? (
          <span style={unassignedStyle}>
            {t('beads.inlineEdit.unassigned', '—')}
          </span>
        )}
      </span>
      <select
        data-testid="inline-assignee-select"
        aria-label={t('beads.inlineEdit.changeAssignee', 'Change assignee')}
        value={currentValue}
        onChange={handleChange}
        disabled={mutation.isPending || assigneesQuery.isLoading}
        style={{
          ...selectOverlayStyle,
          opacity: hovered || mutation.isPending ? 1 : 0,
        }}
      >
        <option value="__unassigned__">
          {t('beads.inlineEdit.unassigned', '(unassigned)')}
        </option>
        {(assigneesQuery.data ?? []).map(a => (
          <option key={a.assignee} value={a.assignee}>
            {a.assignee}
          </option>
        ))}
      </select>
      {mutation.isPending ? (
        <span data-testid="inline-assignee-pending" style={pendingBadgeStyle}>
          …
        </span>
      ) : null}
    </span>
  )
}

/**
 * `useInlineUpdate` — single mutation hook shared by the three
 * subcomponents. The shape of the call is identical: `bd update
 * <id> --status/--priority/--assignee <newValue>`. We model the
 * "new value" as a single discriminated union (`Field`) so a
 * future inline-editable field (e.g. `type`) can be added without
 * adding a parallel mutation hook.
 */

// ponytail: shared styles for the three cells. The wrapper is
// `position: relative` so the absolutely-positioned <select> overlay
// sits inside it without leaking into siblings. Width is constrained
// so the overlay matches the visible badge width.

const wrapperStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  minWidth: 0,
  maxWidth: '100%',
}

/**
 * Host-event handlers for the inline-edit cells. When the cell is
 * embedded inside a clickable row (the issue list), clicking the
 * native `<select>` to open its dropdown would also fire the row's
 * "open detail" handler. Stopping propagation on click + mousedown
 * + keydown prevents that — the inline edit captures the event,
 * the row stays inert.
 *
 * ponytail: the eslint rule forbids empty `() => {}` arrow
 * functions; `e.stopPropagation()` is a real call, so the linter
 * is happy.
 */
function hostGuardProps(swallow: boolean | undefined): {
  onClick: (e: React.MouseEvent) => void
  onMouseDown: (e: React.MouseEvent) => void
  onKeyDown: (e: React.KeyboardEvent) => void
} {
  return {
    onClick: e => {
      if (swallow) e.stopPropagation()
    },
    onMouseDown: e => {
      if (swallow) e.stopPropagation()
    },
    onKeyDown: e => {
      if (swallow) e.stopPropagation()
    },
  }
}

const selectOverlayStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  padding: 0,
  margin: 0,
  border: 0,
  background: 'transparent',
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  outline: 'none',
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  transition: 'opacity 80ms linear',
}

const assigneeTextStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  color: colors.mono2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
}

const unassignedStyle: CSSProperties = {
  color: colors.mono4,
}

const pendingBadgeStyle: CSSProperties = {
  marginLeft: space[1],
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  color: colors.mono5,
  borderRadius: radius.sm,
}
