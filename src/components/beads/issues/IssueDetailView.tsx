/**
 * IssueDetailView — right-side drawer with 4 tabs (Description, Deps,
 * Comments, History) for a single Beads issue.
 *
 * ponytail: 4 separate TanStack Query instances (one per command), each
 * with its own key under the `['beads', …]` namespace. Comments and
 * History are gated by `enabled: activeTab === '…'` so the request only
 * fires once the user actually opens the tab — Description is the
 * default, so its query has no gate.
 *
 * State onion (per AGENTS.md):
 *   - Local UI state (active tab, comment textarea) → `useState`
 *   - Persistent data (4 bd commands) → TanStack Query
 *   - No Zustand needed for this component.
 *
 * Hard-edged Bauhaus: mono only, hard edges, inline `style` with design
 * tokens. The brand colour is reserved for destructive + P0 per AC-14;
 * this component never reaches for it. No animations, no transitions,
 * no shadow, no radius.
 *
 * Deps tab renders the sectioned dependency list (T27/T30/T31).
 */
import { useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import type { Comment, HistoryEntry, Issue } from '@/lib/bindings'
import { colors, space, type } from '@/lib/design-tokens'
import { TypeIcon } from './badges/TypeIcon'
import { LabelChip } from './badges/LabelChip'
import { DependencyListView } from '../dependencies/DependencyListView'
import {
  InlineAssigneeEdit,
  InlinePriorityEdit,
  InlineStatusEdit,
} from './InlineIssueEdit'
import { InlineDescriptionEdit } from './InlineDescriptionEdit'

type Tab = 'description' | 'deps' | 'comments' | 'history'

const TABS: { id: Tab; label: string; testId: string }[] = [
  { id: 'description', label: 'Description', testId: 'tab-description' },
  { id: 'deps', label: 'Deps', testId: 'tab-deps' },
  { id: 'comments', label: 'Comments', testId: 'tab-comments' },
  { id: 'history', label: 'History', testId: 'tab-history' },
]

export interface IssueDetailViewProps {
  /** Repository root. Passed to all 4 commands. */
  cwd: string
  /** The issue id to display. */
  issueId: string
  /** Fires when the user clicks the close button. */
  onClose: () => void
  /**
   * Optional nav hook for dependency links. The Deps tab is a
   * placeholder for Wave 4 — when it lands, it will call this to
   * navigate to a blocking issue. Not used by 16b.
   */
  onOpenIssue?: (id: string) => void
}

export function IssueDetailView({
  cwd,
  issueId,
  onClose,
  onOpenIssue,
}: IssueDetailViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('description')
  const queryClient = useQueryClient()

  // Description tab query — fires on mount. Issue is the core data
  // shared by the header and the Description tab body.
  const showQuery = useQuery({
    queryKey: ['beads', 'show', cwd, issueId],
    queryFn: async () => {
      const result = await commands.bdShow(cwd, issueId)
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  // Comments tab query — lazy. The `enabled` gate keeps the request
  // from firing until the user actually opens the tab.
  const commentsQuery = useQuery({
    queryKey: ['beads', 'comments', cwd, issueId],
    queryFn: async () => {
      const result = await commands.bdComments(cwd, issueId)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    enabled: activeTab === 'comments',
  })

  // History tab query — lazy, same pattern.
  const historyQuery = useQuery({
    queryKey: ['beads', 'history', cwd, issueId],
    queryFn: async () => {
      const result = await commands.bdHistory(cwd, issueId)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    enabled: activeTab === 'history',
  })

  const addCommentMutation = useMutation({
    mutationFn: async (body: string) => {
      const result = await commands.bdAddComment(cwd, issueId, body)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    onSuccess: () => {
      // ponytail: invalidate then refetch. `invalidateQueries` alone
      // would be enough for the next mount; `refetch` covers the
      // "user is staring at the Comments tab right now" case.
      queryClient.invalidateQueries({
        queryKey: ['beads', 'comments', cwd, issueId],
      })
      void commentsQuery.refetch()
    },
  })

  const issue = showQuery.data

  // ponytail: this component used to wrap its body in a full-viewport
  // `position: fixed; inset: 0; z-index: 50` overlay. That made sense
  // when IssueDetailView was the top-level drawer, but the production
  // surface nests it inside `IssueDetailDrawer` which already provides
  // the backdrop overlay. The inner overlay sat on top of the drawer's
  // own children (z-index 50 > the tabs' auto), and WebDriverIO's
  // click-intercept check on the r4-detail E2E failed every tab click
  // because the click was always on the inner overlay's background.
  // The wrapper is now a plain flex-column container; the parent
  // (IssueDetailDrawer's panel) supplies the backdrop, the close
  // button, and the focus trap.
  return (
    <div data-testid="issue-detail-view" style={detailViewContainerStyle}>
      <aside style={drawerStyle} role="dialog" aria-label="Issue detail">
        <header style={headerStyle}>
          <div style={headerTopRowStyle}>
            <span style={idStyle}>{issueId}</span>
            <button
              type="button"
              data-testid="close-button"
              onClick={onClose}
              aria-label="Close"
              style={closeButtonStyle}
            >
              ×
            </button>
          </div>

          {showQuery.isLoading ? (
            <div style={titleStyle}>Loading…</div>
          ) : showQuery.isError ? (
            <div style={titleStyle}>
              Failed to load issue: {formatBdError(showQuery.error)}
            </div>
          ) : issue ? (
            <>
              <h1 style={titleStyle}>{issue.title}</h1>
              <div style={badgesRowStyle}>
                <InlinePriorityEdit cwd={cwd} issue={issue} />
                <TypeIcon type={issue.issue_type} />
                <InlineStatusEdit cwd={cwd} issue={issue} />
                <InlineAssigneeEdit cwd={cwd} issue={issue} />
                <span style={metaStyle}>
                  created: {formatDate(issue.created_at)}
                </span>
                {issue.updated_at ? (
                  <span style={metaStyle}>
                    updated: {formatDate(issue.updated_at)}
                  </span>
                ) : null}
                {issue.closed_at ? (
                  <span style={metaStyle}>
                    closed: {formatDate(issue.closed_at)}
                  </span>
                ) : null}
              </div>
              {issue.labels.length > 0 ? (
                <div style={labelsRowStyle}>
                  {issue.labels.map(l => (
                    <LabelChip key={l.name} label={l.name} />
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </header>

        <nav style={tabsRowStyle} role="tablist">
          {TABS.map(t => {
            const selected = activeTab === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={selected}
                data-testid={t.testId}
                onClick={() => setActiveTab(t.id)}
                style={selected ? tabSelectedStyle : tabStyle}
              >
                {t.label}
              </button>
            )
          })}
        </nav>

        <section style={tabBodyStyle}>
          {activeTab === 'description' ? (
            <DescriptionTab cwd={cwd} issue={issue} showQuery={showQuery} />
          ) : null}
          {activeTab === 'deps' ? (
            <DependencyListView
              cwd={cwd}
              issueId={issueId}
              onOpenIssue={
                onOpenIssue ??
                (() => {
                  // ponytail: Wave 8 wires the parent-level nav.
                })
              }
            />
          ) : null}
          {activeTab === 'comments' ? (
            <CommentsTab query={commentsQuery} mutation={addCommentMutation} />
          ) : null}
          {activeTab === 'history' ? <HistoryTab query={historyQuery} /> : null}
        </section>
      </aside>
    </div>
  )
}

function DescriptionTab({
  cwd,
  issue,
  showQuery,
}: {
  /** Repository root — forwarded to InlineDescriptionEdit so the
   *  underlying `commands.bdUpdate` writes back into the right
   *  Beads workspace. */
  cwd: string
  issue: Issue | undefined
  showQuery: { isLoading: boolean; isError: boolean; error: unknown }
}) {
  if (showQuery.isLoading) {
    return (
      <div data-testid="description-loading" style={messageStyle}>
        Loading…
      </div>
    )
  }
  if (showQuery.isError) {
    return (
      <div data-testid="description-error" style={messageStyle} role="alert">
        {String(showQuery.error)}
      </div>
    )
  }
  if (!issue) {
    return (
      <div data-testid="description-empty" style={messageStyle}>
        No data.
      </div>
    )
  }
  // ponytail: render the editable description field via
  // InlineDescriptionEdit (R4). The wrapper `description-body`
  // testid still wraps everything so existing selectors keep
  // matching.
  return (
    <div data-testid="description-body" style={descriptionBodyStyle}>
      <InlineDescriptionEdit cwd={cwd} issue={issue} />
      <dl style={descriptionMetaStyle}>
        <dt style={descriptionMetaLabelStyle}>Type</dt>
        <dd style={descriptionMetaValueStyle}>{issue.issue_type}</dd>
        <dt style={descriptionMetaLabelStyle}>Priority</dt>
        <dd style={descriptionMetaValueStyle}>{issue.priority}</dd>
        <dt style={descriptionMetaLabelStyle}>Status</dt>
        <dd style={descriptionMetaValueStyle}>{issue.status}</dd>
        {issue.owner ? (
          <>
            <dt style={descriptionMetaLabelStyle}>Owner</dt>
            <dd style={descriptionMetaValueStyle}>{issue.owner}</dd>
          </>
        ) : null}
        <dt style={descriptionMetaLabelStyle}>Created</dt>
        <dd style={descriptionMetaValueStyle}>
          {formatDate(issue.created_at)}
        </dd>
        {issue.updated_at ? (
          <>
            <dt style={descriptionMetaLabelStyle}>Updated</dt>
            <dd style={descriptionMetaValueStyle}>
              {formatDate(issue.updated_at)}
            </dd>
          </>
        ) : null}
        {issue.closed_at ? (
          <>
            <dt style={descriptionMetaLabelStyle}>Closed</dt>
            <dd style={descriptionMetaValueStyle}>
              {formatDate(issue.closed_at)}
            </dd>
          </>
        ) : null}
        {issue.external_ref ? (
          <>
            <dt style={descriptionMetaLabelStyle}>External ref</dt>
            <dd style={descriptionMetaValueStyle}>{issue.external_ref}</dd>
          </>
        ) : null}
      </dl>
    </div>
  )
}

function CommentsTab({
  query,
  mutation,
}: {
  query: {
    data: Comment[] | undefined
    isLoading: boolean
    isError: boolean
    error: unknown
  }
  mutation: {
    mutate: (body: string) => void
    isPending: boolean
    isError: boolean
    error: unknown
  }
}) {
  const [draft, setDraft] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = draft.trim()
    if (trimmed.length === 0 || mutation.isPending) return
    mutation.mutate(trimmed)
    setDraft('')
  }

  if (query.isLoading) {
    return (
      <div data-testid="comments-loading" style={messageStyle}>
        Loading…
      </div>
    )
  }
  if (query.isError) {
    return (
      <div data-testid="comments-error" style={messageStyle} role="alert">
        {String(query.error)}
      </div>
    )
  }

  const comments = query.data ?? []

  return (
    <div data-testid="comments-tab" style={commentsTabStyle}>
      <ul style={commentsListStyle}>
        {comments.length === 0 ? (
          <li
            data-testid="comments-empty"
            style={{ ...messageStyle, listStyle: 'none' }}
          >
            No comments yet.
          </li>
        ) : (
          comments.map(c => (
            <li
              key={c.id}
              data-testid="comment-row"
              data-comment-id={c.id}
              style={commentRowStyle}
            >
              <header style={commentHeaderStyle}>
                <span style={commentAuthorStyle}>{c.author}</span>
                <span style={commentDateStyle}>{formatDate(c.created_at)}</span>
              </header>
              <p style={commentBodyStyle}>{c.body}</p>
            </li>
          ))
        )}
      </ul>

      {mutation.isError ? (
        <div
          data-testid="comment-mutation-error"
          style={mutationErrorStyle}
          role="alert"
        >
          {formatMutationError(mutation.error)}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} style={commentFormStyle}>
        <textarea
          data-testid="comment-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Add a comment…"
          disabled={mutation.isPending}
          style={textareaStyle}
          rows={3}
          aria-label="New comment"
        />
        <button
          type="submit"
          data-testid="comment-submit-button"
          disabled={mutation.isPending || draft.trim().length === 0}
          style={
            mutation.isPending || draft.trim().length === 0
              ? submitButtonDisabledStyle
              : submitButtonStyle
          }
        >
          {mutation.isPending ? 'Posting…' : 'Post comment'}
        </button>
      </form>
    </div>
  )
}

function HistoryTab({
  query,
}: {
  query: {
    data: HistoryEntry[] | undefined
    isLoading: boolean
    isError: boolean
    error: unknown
  }
}) {
  if (query.isLoading) {
    return (
      <div data-testid="history-loading" style={messageStyle}>
        Loading…
      </div>
    )
  }
  if (query.isError) {
    return (
      <div data-testid="history-error" style={messageStyle} role="alert">
        {String(query.error)}
      </div>
    )
  }
  const entries = query.data ?? []
  if (entries.length === 0) {
    return (
      <div data-testid="history-empty" style={messageStyle}>
        No history.
      </div>
    )
  }
  return (
    <ul data-testid="history-list" style={historyListStyle}>
      {entries.map(e => (
        <li
          key={e.id}
          data-testid="history-row"
          data-history-id={e.id}
          style={historyRowStyle}
        >
          <div style={historyHeaderStyle}>
            <span style={historyTimestampStyle}>{formatDate(e.timestamp)}</span>
            <span style={historyActionStyle}>{e.action}</span>
            {e.actor ? <span style={historyActorStyle}>{e.actor}</span> : null}
          </div>
          {e.details ? <p style={historyDetailsStyle}>{e.details}</p> : null}
        </li>
      ))}
    </ul>
  )
}

// ponytail: short-circuit on the common shape, fall back to a generic
// line. Keeps the toast/alert from showing `undefined` or `{type: …}`.
function formatMutationError(err: unknown): string {
  if (err && typeof err === 'object' && 'type' in err) {
    const e = err as { type: string; message?: string; stderr?: string }
    if (e.type === 'NonZeroExit' && e.stderr) return e.stderr
    if ('message' in e && e.message) return e.message
    return e.type
  }
  if (err instanceof Error) return err.message
  return 'Failed to post comment.'
}

/**
 * Flatten a `bd_show` failure (a `BdError` tagged enum from the
 * Rust side, deserialised to a plain object) into a human-readable
 * string. The default `String(showQuery.error)` produces
 * "[object Object]" because the error is a tagged-union object
 * (`{ type: 'NonZeroExit', code, stderr }` etc.) with no useful
 * `toString()`. The E2E suite asserts on the detail-view's text
 * content, so a clearer message here makes a CI failure
 * diagnosable without re-running locally.
 */
function formatBdError(err: unknown): string {
  if (err && typeof err === 'object' && 'type' in err) {
    const e = err as {
      type: string
      id?: string
      code?: number
      stderr?: string
      stdout?: string
      message?: string
      path?: string
      repo_path?: string
      seconds?: number
    }
    switch (e.type) {
      case 'NotFound':
        return `NotFound (id=${e.id ?? '?'})`
      case 'NonZeroExit':
        return `NonZeroExit (code=${e.code ?? '?'}) stderr=${(e.stderr ?? '').trim() || '<empty>'}`
      case 'ParseError':
        return `ParseError: ${e.message ?? ''}`
      case 'IoError':
        return `IoError: ${e.message ?? ''}`
      case 'SchemaMismatch':
        return `SchemaMismatch: ${e.message ?? ''}`
      case 'PermissionDenied':
        return `PermissionDenied (path=${e.path ?? '?'})`
      case 'BdNotInPath':
        return 'BdNotInPath'
      case 'Timeout':
        return `Timeout (seconds=${e.seconds ?? '?'})`
      case 'DoltOnly':
        return `DoltOnly: ${e.message ?? ''}`
      case 'AlreadyLocked':
        return `AlreadyLocked (repo=${e.repo_path ?? '?'})`
      default:
        return JSON.stringify(e)
    }
  }
  if (err instanceof Error) return err.message
  return String(err)
}

function formatDate(iso: string): string {
  // ponytail: ISO strings round-trip cleanly through `new Date(…)`; the
  // toLocaleString defaults to the host's locale and 24h time. Cheap
  // and dependency-free.
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

const detailViewContainerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
}

const drawerStyle: CSSProperties = {
  // ponytail: the standalone IssueDetailView (used in unit tests +
  // any future direct consumer) still wants a fixed 600px surface,
  // but when the component is nested inside the IssueDetailDrawer's
  // 480px panel, the maxWidth = 100% clamp wins and the drawer fits
  // inside the parent instead of overflowing past the close button.
  // The old `maxWidth: '90vw'` was sized against the viewport, not
  // the parent, so the 600px aside extended 120px past the panel
  // — putting the close button outside the panel's overflow region
  // and triggering `element not interactable` in the r3/r4 e2e.
  width: 600,
  maxWidth: '100%',
  height: '100%',
  backgroundColor: colors.mono9,
  borderLeft: `1px solid ${colors.mono7}`,
  display: 'flex',
  flexDirection: 'column',
  color: colors.mono0,
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  lineHeight: type.lineHeight.normal,
  overflow: 'hidden',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
  padding: space[4],
  borderBottom: `1px solid ${colors.mono7}`,
}

const headerTopRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[2],
}

const idStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.xs,
  color: colors.mono5,
}

const closeButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  padding: 0,
  margin: 0,
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  color: colors.mono0,
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.base,
  lineHeight: 1,
  cursor: 'pointer',
}

const titleStyle: CSSProperties = {
  fontSize: type.fontSize.xl,
  fontWeight: type.fontWeight.bold,
  lineHeight: type.lineHeight.tight,
  margin: 0,
  color: colors.mono0,
}

const badgesRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: space[2],
}

const metaStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.xs,
  color: colors.mono5,
}

const labelsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: space[1],
}

const tabsRowStyle: CSSProperties = {
  display: 'flex',
  gap: 0,
  borderBottom: `1px solid ${colors.mono7}`,
  backgroundColor: colors.mono9,
}

const tabStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.regular,
  color: colors.mono3,
  backgroundColor: colors.mono8,
  borderWidth: 0,
  borderBottomWidth: 1,
  borderStyle: 'solid',
  borderBottomColor: colors.mono7,
  paddingInline: space[4],
  paddingBlock: space[3],
  cursor: 'pointer',
}

const tabSelectedStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.bold,
  color: colors.mono0,
  backgroundColor: colors.mono9,
  borderWidth: 0,
  borderBottomWidth: 2,
  borderStyle: 'solid',
  borderBottomColor: colors.mono0,
  paddingInline: space[4],
  paddingBlock: space[3],
  cursor: 'pointer',
}

const tabBodyStyle: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: space[4],
}

const messageStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  color: colors.mono3,
  padding: space[2],
}

const descriptionBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
}

// descriptionTextStyle used to live here; the actual styling for
// the description paragraph moved into InlineDescriptionEdit.tsx
// (R4 — the description became editable). Kept the dl layout below
// unchanged.

const descriptionMetaStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '120px 1fr',
  gap: `${space[1]} ${space[3]}`,
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  margin: 0,
  padding: 0,
}

const descriptionMetaLabelStyle: CSSProperties = {
  fontWeight: type.fontWeight.bold,
  color: colors.mono3,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
}

const descriptionMetaValueStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  color: colors.mono0,
  margin: 0,
}

const commentsTabStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
}

const commentsListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
}

const commentRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[1],
  backgroundColor: colors.mono8,
  border: `1px solid ${colors.mono7}`,
  padding: space[3],
}

const commentHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: space[2],
}

const commentAuthorStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.medium,
  color: colors.mono0,
}

const commentDateStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.xs,
  color: colors.mono5,
  marginInlineStart: 'auto',
}

const commentBodyStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  whiteSpace: 'pre-wrap',
  margin: 0,
}

const commentFormStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
}

const textareaStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  backgroundColor: colors.mono9,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[2],
  paddingBlock: space[2],
  outline: 'none',
  resize: 'vertical',
}

const submitButtonStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.medium,
  color: colors.mono0,
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[4],
  paddingBlock: space[2],
  cursor: 'pointer',
  alignSelf: 'flex-start',
}

const submitButtonDisabledStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.medium,
  color: colors.mono5,
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono7,
  paddingInline: space[4],
  paddingBlock: space[2],
  cursor: 'not-allowed',
  alignSelf: 'flex-start',
}

const mutationErrorStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  color: colors.mono0,
  backgroundColor: colors.mono8,
  border: `1px solid ${colors.mono3}`,
  padding: space[2],
}

const historyListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
}

const historyRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[1],
  borderLeft: `2px solid ${colors.mono3}`,
  paddingInline: space[3],
  paddingBlock: space[2],
}

const historyHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: space[2],
  flexWrap: 'wrap',
}

const historyTimestampStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.xs,
  color: colors.mono5,
}

const historyActionStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.medium,
  color: colors.mono0,
}

const historyActorStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.xs,
  color: colors.mono3,
}

const historyDetailsStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  color: colors.mono3,
  whiteSpace: 'pre-wrap',
  margin: 0,
}

export default IssueDetailView
