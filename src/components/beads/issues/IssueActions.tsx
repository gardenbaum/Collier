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
 * Hard-edged Bauhaus: mono only, hard edges, Tailwind classes that
 * map directly to design tokens. The brand colour is reserved for
 * destructive + P0 per AC-14; this component never reaches for it.
 * The Delete button is distinguished from the other three by the
 * high-contrast `mono0`/`mono9` inversion (same pattern as
 * `IssueUpdatePanel`'s Save button) — destructive without colour.
 * No animations, no transitions, no shadow, no radius.
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
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { commands } from '@/lib/tauri-bindings'
import type { Issue } from '@/lib/bindings'

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

const actionButtonClass =
  'font-sans text-sm font-medium text-mono-0 bg-mono-8 border border-mono-3 px-3 py-1 cursor-pointer'
const actionButtonDisabledClass =
  'font-sans text-sm font-medium text-mono-5 bg-mono-8 border border-mono-7 px-3 py-1 cursor-not-allowed'
const submitButtonClass = actionButtonClass
const submitButtonDisabledClass = actionButtonDisabledClass
// ponytail: destructive treatment via mono inversion (same look as
// `IssueUpdatePanel`'s Save button). The brand colour is reserved
// for P0 + destructive per AC-14; this component keeps the file
// brand-colour-free and uses `mono0` text on `mono0` border /
// `mono9` background as the visual destructive signal.
const destructiveButtonClass =
  'font-sans text-sm font-bold text-mono-9 bg-mono-0 border border-mono-0 px-3 py-1 cursor-pointer'
const destructiveButtonDisabledClass =
  'font-sans text-sm font-bold text-mono-5 bg-mono-5 border border-mono-5 px-3 py-1 cursor-not-allowed'

export function IssueActions({
  cwd,
  issue,
  onUpdated,
  onDeleted,
  onCommentAdded,
}: IssueActionsProps) {
  const { t } = useTranslation()
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
    <div data-testid="issue-actions" className="flex flex-col gap-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {isClosed ? null : (
          <button
            type="button"
            data-testid="action-close"
            onClick={handleClose}
            disabled={closeMutation.isPending}
            className={
              closeMutation.isPending
                ? actionButtonDisabledClass
                : actionButtonClass
            }
          >
            {closeMutation.isPending
              ? t('beads.issueActions.closing', 'Closing…')
              : t('beads.issueActions.close', 'Close')}
          </button>
        )}

        {isClosed ? (
          <button
            type="button"
            data-testid="action-reopen"
            onClick={handleReopen}
            disabled={reopenMutation.isPending}
            className={
              reopenMutation.isPending
                ? actionButtonDisabledClass
                : actionButtonClass
            }
          >
            {reopenMutation.isPending
              ? t('beads.issueActions.reopening', 'Reopening…')
              : t('beads.issueActions.reopen', 'Reopen')}
          </button>
        ) : null}

        <button
          type="button"
          data-testid="action-add-comment"
          onClick={() => setCommentOpen(open => !open)}
          aria-expanded={commentOpen}
          className={actionButtonClass}
        >
          {commentOpen
            ? t('beads.issueActions.cancelComment', 'Cancel comment')
            : t('beads.issueActions.addComment', 'Add comment')}
        </button>

        <button
          type="button"
          data-testid="action-delete"
          onClick={() => setDeleteOpen(open => !open)}
          aria-expanded={deleteOpen}
          className={actionButtonClass}
        >
          {deleteOpen
            ? t('beads.issueActions.cancelDelete', 'Cancel delete')
            : t('beads.issueActions.delete', 'Delete')}
        </button>
      </div>

      {commentOpen ? (
        <form
          data-testid="add-comment-form"
          onSubmit={handleCommentSubmit}
          className="flex flex-col gap-2"
        >
          <textarea
            data-testid="add-comment-textarea"
            value={commentDraft}
            onChange={e => setCommentDraft(e.target.value)}
            rows={3}
            placeholder="Write a comment…"
            disabled={commentMutation.isPending}
            className="resize-y border border-mono-3 bg-mono-9 px-2 py-2 font-sans text-sm text-mono-0 outline-none"
            aria-label={t('beads.issueActions.newComment', 'New comment')}
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              data-testid="add-comment-submit"
              disabled={
                commentMutation.isPending || commentDraft.trim().length === 0
              }
              className={
                commentMutation.isPending || commentDraft.trim().length === 0
                  ? submitButtonDisabledClass
                  : submitButtonClass
              }
            >
              {commentMutation.isPending
                ? t('beads.issueActions.posting', 'Posting…')
                : t('beads.issueActions.postComment', 'Post comment')}
            </button>
          </div>
        </form>
      ) : null}

      {deleteOpen ? (
        <div
          data-testid="delete-confirm"
          className="flex flex-col gap-2 border border-mono-3 bg-mono-8 p-3"
        >
          <p
            data-testid="delete-confirm-text"
            className="m-0 font-sans text-sm text-mono-0"
          >
            {`Type the issue ID `}
            <code
              data-testid="delete-confirm-target"
              className="border border-mono-3 bg-mono-9 px-1 font-mono text-sm font-bold text-mono-0"
            >
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
            className="border border-mono-3 bg-mono-9 px-2 py-2 font-mono text-sm text-mono-0 outline-none"
            autoComplete="off"
            spellCheck={false}
            aria-label="Type the issue id to confirm deletion"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="delete-confirm-cancel"
              onClick={handleCancelDelete}
              disabled={deleteMutation.isPending}
              className={actionButtonClass}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="delete-confirm-button"
              onClick={handleDeleteConfirm}
              disabled={!confirmEnabled}
              className={
                confirmEnabled
                  ? destructiveButtonClass
                  : destructiveButtonDisabledClass
              }
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Confirm delete'}
            </button>
          </div>
        </div>
      ) : null}

      {anyError ? (
        <div
          data-testid="actions-error"
          role="alert"
          className="border border-mono-3 bg-mono-8 px-3 py-2 font-sans text-xs text-mono-0"
        >
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