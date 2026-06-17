/**
 * IssueActions — action bar for a single Beads issue.
 *
 * Renders four buttons in a single horizontal row:
 *   - Close (visible unless the issue is already closed)
 *   - Reopen (visible only when the issue is closed)
 *   - Add Comment (always visible; expands a textarea + submit form)
 *   - Delete (always visible; expands a typed-identifier confirmation panel
 *     per AC-4 — destructive ops require the user to type the issue id exactly)
 *
 * State onion (per AGENTS.md):
 *   - Form / panel toggles + local drafts → `useState` (component-local)
 *   - The 4 IPC calls → TanStack Query `useMutation`
 *   - No Zustand needed; the parent owns the displayed issue.
 *
 * Hard-edged Bauhaus: mono only, hard edges, inline `style` with design
 * tokens. The brand colour is reserved for destructive + P0 per AC-14;
 * this component never reaches for it. The Delete button is
 * distinguished from the other three by the high-contrast
 * `mono0`/`mono9` inversion (same pattern as `IssueUpdatePanel`'s Save
 * button) — destructive without colour. No animations, no
 * transitions, no shadow, no radius.
 *
 * AC-4: destructive operations require typed-identifier confirmation.
 * The Delete button is the only destructive op in this component, so
 * the typed-identifier gate is the difference between a real delete
 * and a misclick. The user must type the issue id exactly into the
 * confirmation input; the Confirm button stays disabled until the
 * typed text matches `issue.id` byte-for-byte.
 *
 * WriteLock: the Rust runner already serializes `bd` writes through
 * the runner's internal lock, so the frontend does not coordinate
 * locking here (same reasoning as `IssueCreateForm`).
 *
 * Bulk actions, keyboard shortcuts, modal confirmations, and
 * optimistic updates are explicitly OUT OF SCOPE per the plan.
 */
import { useState, type CSSProperties, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import type { Issue } from '@/lib/bindings'
import { colors, space, type } from '@/lib/design-tokens'

export interface IssueActionsProps {
  /** Repository root. Passed to every command. */
  cwd: string
  /** The currently-displayed issue. Used to compute button visibility
   *  and the typed-identifier confirmation target. */
  issue: Issue
  /** Fires with the updated issue after a successful close / reopen. */
  onUpdated: (issue: Issue) => void
  /** Fires with the deleted issue's id after a successful delete. */
  onDeleted: (issueId: string) => void
  /** Fires after a comment is successfully added; the parent refetches. */
  onCommentAdded: () => void
}

export function IssueActions({
  cwd,
  issue,
  onUpdated,
  onDeleted,
  onCommentAdded,
}: IssueActionsProps) {
  const isClosed = issue.status === 'closed'

  // ponytail: each panel has its own open/close state. They are
  // independent (you can have the comment form open and the delete
  // confirmation collapsed, or vice versa) so we model them as
  // separate booleans rather than a discriminated union. Trivial
  // cost, simpler tests.
  const [commentOpen, setCommentOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [commentDraft, setCommentDraft] = useState('')
  // ponytail: typed-identifier confirmation buffer. The Confirm
  // button is enabled only when `confirmText === issue.id` exactly.
  // The string equality is the entire safety contract — whitespace
  // differences, case differences, and trailing characters all keep
  // the button disabled. AC-4.
  const [confirmText, setConfirmText] = useState('')

  const closeMutation = useMutation({
    mutationFn: async () => {
      const result = await commands.bdClose(cwd, issue.id)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    onSuccess: updated => onUpdated(updated),
  })

  const reopenMutation = useMutation({
    mutationFn: async () => {
      const result = await commands.bdReopen(cwd, issue.id)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    onSuccess: updated => onUpdated(updated),
  })

  const commentMutation = useMutation({
    mutationFn: async (body: string) => {
      const result = await commands.bdAddComment(cwd, issue.id, body)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    onSuccess: () => {
      setCommentDraft('')
      setCommentOpen(false)
      onCommentAdded()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const result = await commands.bdDelete(cwd, issue.id)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    onSuccess: () => onDeleted(issue.id),
  })

  const handleClose = () => {
    if (closeMutation.isPending) return
    closeMutation.mutate()
  }

  const handleReopen = () => {
    if (reopenMutation.isPending) return
    reopenMutation.mutate()
  }

  const handleCommentSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = commentDraft.trim()
    if (trimmed.length === 0 || commentMutation.isPending) return
    commentMutation.mutate(trimmed)
  }

  const handleDeleteConfirm = () => {
    // ponytail: AC-4 hard rule. Even though the button is disabled
    // when the text doesn't match, we re-check on click as a
    // belt-and-suspenders guard — if a future refactor ever makes
    // the button reachable without the typed match, the delete
    // still won't fire.
    if (confirmText !== issue.id || deleteMutation.isPending) return
    deleteMutation.mutate()
  }

  const handleCancelDelete = () => {
    setDeleteOpen(false)
    setConfirmText('')
  }

  const closeOrReopenPending =
    closeMutation.isPending || reopenMutation.isPending
  const confirmEnabled =
    confirmText === issue.id &&
    !deleteMutation.isPending &&
    !closeOrReopenPending

  // ponytail: one combined mutationError line keeps the parent's
  // 3-prop dirty check trivial. Any 422 / NonZeroExit / ParseError
  // surfaces here.
  const anyError =
    closeMutation.error ??
    reopenMutation.error ??
    commentMutation.error ??
    deleteMutation.error

  return (
    <div data-testid="issue-actions" style={containerStyle}>
      <div style={rowStyle}>
        {isClosed ? null : (
          <button
            type="button"
            data-testid="action-close"
            onClick={handleClose}
            disabled={closeMutation.isPending}
            style={
              closeMutation.isPending
                ? actionButtonDisabledStyle
                : actionButtonStyle
            }
          >
            {closeMutation.isPending ? 'Closing…' : 'Close'}
          </button>
        )}

        {isClosed ? (
          <button
            type="button"
            data-testid="action-reopen"
            onClick={handleReopen}
            disabled={reopenMutation.isPending}
            style={
              reopenMutation.isPending
                ? actionButtonDisabledStyle
                : actionButtonStyle
            }
          >
            {reopenMutation.isPending ? 'Reopening…' : 'Reopen'}
          </button>
        ) : null}

        <button
          type="button"
          data-testid="action-add-comment"
          onClick={() => setCommentOpen(open => !open)}
          aria-expanded={commentOpen}
          style={actionButtonStyle}
        >
          {commentOpen ? 'Cancel comment' : 'Add comment'}
        </button>

        <button
          type="button"
          data-testid="action-delete"
          onClick={() => setDeleteOpen(open => !open)}
          aria-expanded={deleteOpen}
          style={actionButtonStyle}
        >
          {deleteOpen ? 'Cancel delete' : 'Delete'}
        </button>
      </div>

      {commentOpen ? (
        <form
          data-testid="add-comment-form"
          onSubmit={handleCommentSubmit}
          style={formStyle}
        >
          <textarea
            data-testid="add-comment-textarea"
            value={commentDraft}
            onChange={e => setCommentDraft(e.target.value)}
            rows={3}
            placeholder="Write a comment…"
            disabled={commentMutation.isPending}
            style={textareaStyle}
            aria-label="New comment"
          />
          <div style={formActionsStyle}>
            <button
              type="submit"
              data-testid="add-comment-submit"
              disabled={
                commentMutation.isPending || commentDraft.trim().length === 0
              }
              style={
                commentMutation.isPending || commentDraft.trim().length === 0
                  ? submitButtonDisabledStyle
                  : submitButtonStyle
              }
            >
              {commentMutation.isPending ? 'Posting…' : 'Post comment'}
            </button>
          </div>
        </form>
      ) : null}

      {deleteOpen ? (
        <div data-testid="delete-confirm" style={confirmPanelStyle}>
          <p data-testid="delete-confirm-text" style={confirmTextStyle}>
            {`Type the issue ID `}
            <code data-testid="delete-confirm-target" style={confirmIdStyle}>
              {issue.id}
            </code>
            {` to confirm:`}
          </p>
          <input
            type="text"
            data-testid="delete-confirm-input"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            disabled={deleteMutation.isPending}
            style={inputStyle}
            autoComplete="off"
            spellCheck={false}
            aria-label="Type the issue id to confirm deletion"
          />
          <div style={formActionsStyle}>
            <button
              type="button"
              data-testid="delete-confirm-cancel"
              onClick={handleCancelDelete}
              disabled={deleteMutation.isPending}
              style={actionButtonStyle}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="delete-confirm-button"
              onClick={handleDeleteConfirm}
              disabled={!confirmEnabled}
              style={
                confirmEnabled
                  ? destructiveButtonStyle
                  : destructiveButtonDisabledStyle
              }
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Confirm delete'}
            </button>
          </div>
        </div>
      ) : null}

      {anyError ? (
        <div data-testid="actions-error" role="alert" style={errorBoxStyle}>
          {formatMutationError(anyError)}
        </div>
      ) : null}
    </div>
  )
}

// ponytail: short-circuit on the common shape, fall back to a generic
// line. Keeps the error from showing `undefined` or `{type: …}`.
function formatMutationError(err: unknown): string {
  if (err && typeof err === 'object' && 'type' in err) {
    const e = err as { type: string; message?: string; stderr?: string }
    if (e.type === 'NonZeroExit' && e.stderr) return e.stderr
    if ('message' in e && e.message) return e.message
    return e.type
  }
  if (err instanceof Error) return err.message
  return 'Action failed.'
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
  paddingBlock: space[2],
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[2],
  flexWrap: 'wrap',
}

const actionButtonStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.medium,
  color: colors.mono0,
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[3],
  paddingBlock: space[1],
  cursor: 'pointer',
}

const actionButtonDisabledStyle: CSSProperties = {
  ...actionButtonStyle,
  color: colors.mono5,
  backgroundColor: colors.mono8,
  borderColor: colors.mono7,
  cursor: 'not-allowed',
}

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
}

const formActionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
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

const inputStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  backgroundColor: colors.mono9,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[2],
  paddingBlock: space[2],
  outline: 'none',
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
  paddingInline: space[3],
  paddingBlock: space[1],
  cursor: 'pointer',
}

const submitButtonDisabledStyle: CSSProperties = {
  ...submitButtonStyle,
  color: colors.mono5,
  backgroundColor: colors.mono8,
  borderColor: colors.mono7,
  cursor: 'not-allowed',
}

const confirmPanelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
  padding: space[3],
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
}

const confirmTextStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  margin: 0,
}

const confirmIdStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.bold,
  color: colors.mono0,
  backgroundColor: colors.mono9,
  paddingInline: space[1],
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
}

// ponytail: destructive treatment via mono inversion (same look as
// `IssueUpdatePanel`'s Save button). The brand colour is reserved
// for P0 + destructive per AC-14; this component keeps the file
// brand-colour-free and uses `mono0` text on `mono0` border /
// `mono9` background as the visual destructive signal.
const destructiveButtonStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.bold,
  color: colors.mono9,
  backgroundColor: colors.mono0,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono0,
  paddingInline: space[3],
  paddingBlock: space[1],
  cursor: 'pointer',
}

const destructiveButtonDisabledStyle: CSSProperties = {
  ...destructiveButtonStyle,
  color: colors.mono5,
  backgroundColor: colors.mono5,
  borderColor: colors.mono5,
  cursor: 'not-allowed',
}

const errorBoxStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  color: colors.mono0,
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[3],
  paddingBlock: space[2],
}
