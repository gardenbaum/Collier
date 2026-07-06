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
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { Issue } from '@/lib/bindings'
import { useIssueFieldUpdate } from '@/hooks/useIssueFieldUpdate'
import { formatError } from '@/lib/error-format'
import { colors, space, type } from '@/lib/design-tokens'
import { primaryButtonStyle, textareaStyle } from '@/lib/form-styles'

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

/**
 * The mutation hook for description edits is
 * [`useIssueFieldUpdate`](@/hooks/useIssueFieldUpdate), which
 * owns the optimistic-patch lifecycle (cancel both caches,
 * snapshot them, patch both, revert on error, reconcile on
 * success) — the same machinery used by the three
 * `InlineIssueEdit` cells. We supply two short callbacks:
 * `buildInput` translates the `string | null` payload into a
 * minimal-diff `UpdateInput` (only `description` set, no other
 * fields), and `applyToIssue` patches the matching field on
 * the cached `Issue`.
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
 * value. On mutation error, the hook reverts the patch and
 * toasts `formatError(err)`.
 */
function buildDescriptionInput(description: string | null): {
  description: string | null
} {
  return { description }
}

function applyDescriptionToIssue(
  issue: Issue,
  description: string | null
): Issue {
  return { ...issue, description }
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
  const mutation = useIssueFieldUpdate<string | null>({
    cwd,
    issueId: issue.id,
    buildInput: buildDescriptionInput,
    applyToIssue: applyDescriptionToIssue,
    errorLogMessage: 'description update failed',
    errorFallback: 'Failed to update description.',
  })

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
            {formatError(mutation.error)}
          </div>
        ) : null}
        <div style={actionsStyle}>
          <button
            type="button"
            data-testid="inline-description-cancel"
            onClick={handleCancel}
            disabled={mutation.isPending}
            style={primaryButtonStyle}
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

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: space[2],
}

// Primary save button: mono0 border reads as a highlight against the
// mono3 of the cancel button next to it.
const submitButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  borderColor: colors.mono0,
}

const submitButtonDisabledStyle: CSSProperties = {
  ...primaryButtonStyle,
  color: colors.mono5,
  borderColor: colors.mono7,
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
