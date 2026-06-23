/**
 * InlineDescriptionEdit — click-to-edit description field for the
 * Issue detail drawer. Spec M1 R4.
 *
 * ponytail: distinct from the sibling InlineIssueEdit cells (status /
 * priority / assignee) in two ways:
 *
 *   1. Free-form text, not a constrained enum. The mutation sends
 *      `UpdateInput { description: string | null }` (trimmed; empty
 *      → null) via `commands.bdUpdate`.
 *
 *   2. Click-to-edit, not hover-to-edit. Multi-line descriptions
 *      would overflow the badge-overlay pattern, so we use a
 *      dedicated "Edit" affordance that toggles into a textarea +
 *      Save / Cancel row. The textarea is the single source of
 *      truth while editing; on Save we mutate, on Cancel we throw
 *      the draft away.
 *
 * Optimistic-update strategy mirrors `useInlineUpdate` from
 * `InlineIssueEdit.tsx`:
 *
 *   1. On mutate, cancel any in-flight refetch for the list and
 *      show caches, snapshot both, then patch both with the new
 *      description. The UI re-renders with the new text instantly.
 *   2. The `bd update` Tauri command runs in the background. On
 *      success, the watcher fires `beads-data-changed` and the
 *      next refetch confirms the optimistic value. On error, we
 *      revert the cache patches and toast a message.
 *
 * State onion (per AGENTS.md):
 *   - Local "editing / draft" state → `useState` (component-local)
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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { commands } from '@/lib/tauri-bindings'
import type { Issue, UpdateInput } from '@/lib/bindings'
import { logger } from '@/lib/logger'
import { colors, space, type } from '@/lib/design-tokens'

export interface InlineDescriptionEditProps {
  /** Repository root — passed to `commands.bdUpdate`. */
  cwd: string
  /** The issue whose description is being edited. The current
   *  description is read from this prop; the optimistic patch
   *  writes back into the TanStack Query cache so every consumer
   *  (the list, the detail drawer, anything else) sees the change
   *  immediately. */
  issue: Issue
}

interface UseDescriptionUpdateArgs {
  cwd: string
  issueId: string
}

/**
 * `useDescriptionUpdate` — single mutation hook for description
 * edits. Mirrors `useInlineUpdate` from `InlineIssueEdit.tsx`
 * except the payload is a free-form string|null instead of a
 * discriminated union.
 *
 * ponytail: optimistic-update strategy. We patch the two caches
 * the user might be looking at:
 *   - `['beads', 'list', cwd]` — the issue list. Patching this
 *     keeps the rendered rows in sync immediately.
 *   - `['beads', 'show', cwd, issueId]` — the detail drawer.
 *     Patching this keeps the description we are editing from
 *     snapping back to the server value while the mutation is
 *     in flight.
 *
 * The watcher tick (which always fires after a successful bd
 * write) will refetch both caches and confirm the optimistic
 * value. On mutation error, we revert the patch and toast the
 * error.
 */
function useDescriptionUpdate({ cwd, issueId }: UseDescriptionUpdateArgs) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (description: string | null) => {
      // ponytail: build a minimal UpdateInput — only the field
      // the user just edited. Sending the full struct would
      // cause the CLI to write a no-op history entry for every
      // unchanged field.
      const input: UpdateInput = { description }
      const result = await commands.bdUpdate(cwd, issueId, input)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    onMutate: async (description: string | null) => {
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

      const apply = (issue: Issue): Issue => ({ ...issue, description })

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
    onError: (err, _description, context) => {
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
      logger.error('description update failed', { err })
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

/** Format a mutation error into a user-readable string. Mirrors
 *  the shape used by InlineIssueEdit and the comment form. */
function formatMutationError(err: unknown): string {
  if (err && typeof err === 'object' && 'type' in err) {
    const e = err as { type: string; message?: string; stderr?: string }
    if (e.type === 'NonZeroExit' && e.stderr) return e.stderr
    if ('message' in e && e.message) return e.message
    return e.type
  }
  if (err instanceof Error) return err.message
  return 'Failed to update description.'
}

/** Normalise the current description for equality checks.
 *  Treats null, undefined, and empty string as the same "no
 *  description" state — bd and the bindings disagree on the
 *  representation but they're all equivalent to the user. */
function normaliseDescription(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export function InlineDescriptionEdit({
  cwd,
  issue,
}: InlineDescriptionEditProps) {
  const { t } = useTranslation()
  const mutation = useDescriptionUpdate({ cwd, issueId: issue.id })

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const startEdit = () => {
    // ponytail: seed the textarea with the current value (or empty
    // string for the null case). Trimmed-empty submissions collapse
    // back to null in handleSave.
    setDraft(issue.description ?? '')
    setEditing(true)
  }

  const handleCancel = () => {
    setEditing(false)
    setDraft('')
  }

  const handleSave = () => {
    const next = normaliseDescription(draft)
    const current = normaliseDescription(issue.description)
    if (next === current) {
      // No-op: user opened the editor and didn't change anything.
      // Skip the bd round-trip and just close.
      setEditing(false)
      setDraft('')
      return
    }
    mutation.mutate(next, {
      onSuccess: () => {
        setEditing(false)
        setDraft('')
        toast.success(
          t('beads.descriptionEdit.saved', {
            defaultValue: 'Description updated.',
          })
        )
      },
    })
  }

  if (editing) {
    return (
      <div data-testid="inline-description-edit-form" style={formStyle}>
        <textarea
          data-testid="inline-description-textarea"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={6}
          autoFocus
          disabled={mutation.isPending}
          style={textareaStyle}
          aria-label={t(
            'beads.descriptionEdit.editDescription',
            'Edit description'
          )}
          placeholder={t(
            'beads.descriptionEdit.placeholder',
            'Describe this issue…'
          )}
        />
        {mutation.isError ? (
          <div
            data-testid="inline-description-error"
            role="alert"
            style={errorStyle}
          >
            {formatMutationError(mutation.error)}
          </div>
        ) : null}
        <div style={actionsStyle}>
          <button
            type="button"
            data-testid="inline-description-cancel"
            onClick={handleCancel}
            disabled={mutation.isPending}
            style={cancelButtonStyle}
          >
            {t('beads.descriptionEdit.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            data-testid="inline-description-save"
            onClick={handleSave}
            disabled={mutation.isPending}
            style={
              mutation.isPending ? submitButtonDisabledStyle : submitButtonStyle
            }
          >
            {mutation.isPending
              ? t('beads.descriptionEdit.saving', 'Saving…')
              : t('beads.descriptionEdit.save', 'Save')}
          </button>
        </div>
      </div>
    )
  }

  const hasDescription = normaliseDescription(issue.description) !== null

  return (
    <div data-testid="inline-description-display" style={displayStyle}>
      {hasDescription ? (
        <p data-testid="description-text" style={descriptionTextStyle}>
          {issue.description}
        </p>
      ) : (
        <p data-testid="description-empty-text" style={emptyStyle}>
          {t('beads.descriptionEdit.empty', 'No description.')}
        </p>
      )}
      <button
        type="button"
        data-testid="inline-description-edit-button"
        onClick={startEdit}
        style={editButtonStyle}
      >
        {hasDescription
          ? t('beads.descriptionEdit.edit', 'Edit')
          : t('beads.descriptionEdit.add', 'Add description')}
      </button>
    </div>
  )
}

// ponytail: shared styles. All values are design tokens, no raw
// colours. The brand accent is intentionally absent — the Edit
// button is a primary action but the description edit is not
// destructive or P0-class (AC-14).

const displayStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
  alignItems: 'flex-start',
}

const descriptionTextStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  whiteSpace: 'pre-wrap',
  margin: 0,
  padding: 0,
  width: '100%',
}

const emptyStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  color: colors.mono3,
  margin: 0,
  padding: 0,
  width: '100%',
}

const editButtonStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.medium,
  color: colors.mono0,
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[3],
  paddingBlock: space[1],
  cursor: 'pointer',
  alignSelf: 'flex-start',
}

const formStyle: CSSProperties = {
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
  width: '100%',
  minHeight: 96,
  boxSizing: 'border-box',
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: space[2],
}

const cancelButtonStyle: CSSProperties = {
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
}

const submitButtonStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.medium,
  color: colors.mono0,
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono0,
  paddingInline: space[4],
  paddingBlock: space[2],
  cursor: 'pointer',
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
}

const errorStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  color: colors.mono0,
  backgroundColor: colors.mono8,
  border: `1px solid ${colors.mono3}`,
  padding: space[2],
}
