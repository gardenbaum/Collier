/**
 * LabelManager — per-issue label add / remove / propagate.
 *
 * Renders three pieces:
 *   1. The issue's current labels as a row of `LabelChip` (T20) with
 *      a small `×` that calls `bdLabelRemove`.
 *   2. An inline "Add label" input. Enter invokes `bdLabelAdd`. The
 *      input is also a `<datalist>` backed by the latest
 *      `bdLabelListAll` so the user can pick from labels already in
 *      the repo (autocomplete is a native HTML feature — no JS
 *      autocomplete dropdown needed for v1).
 *   3. A "Propagate to children" button, visible only when the
 *      issue has children (`issue.dependency_count > 0` is the v1
 *      proxy — see ponytail note). Clicking expands a confirmation
 *      panel with a yes/no cancel pair. Confirm invokes
 *      `bdLabelPropagate` and toasts the `PropagationReport`
 *      totals.
 *
 * State onion (per AGENTS.md):
 *   - Draft input text + propagate confirm state → `useState`.
 *   - List query + 3 mutations → TanStack Query.
 *   - No Zustand needed.
 *
 * Hard-edged Bauhaus: mono only, hard edges, inline `style` with
 * design tokens. The brand colour is reserved for destructive + P0
 * per AC-14 — label UI never reaches for it. No animations, no
 * transitions, no shadow, no radius.
 *
 * WriteLock: the Rust runner already serializes `bd` writes, so
 * the frontend does not coordinate locking here (same as
 * `IssueActions` and `DependencyListView`).
 */
import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import type { Issue, LabelWithCount, PropagationReport } from '@/lib/bindings'
import { colors, space, type } from '@/lib/design-tokens'
import { LabelChip } from '@/components/beads/issues/badges/LabelChip'

export interface LabelManagerProps {
  /** Repository root. Passed to every command. */
  cwd: string
  /** The currently-displayed issue. Used as `parent_id` /
   *  `issue_id` for the add/remove/propagate commands and as the
   *  query namespace key. */
  issue: Issue
}

const inputId = 'label-manager-add-input'
const propagateButtonId = 'label-manager-propagate-toggle'
const propagateCancelId = 'label-manager-propagate-cancel'
const propagateConfirmId = 'label-manager-propagate-confirm'

export function LabelManager({ cwd, issue }: LabelManagerProps) {
  const queryClient = useQueryClient()

  // ponytail: derive the label-name list from `Issue.labels`. The
  // `Label` struct carries `{ name, color? }`; we only need the
  // name for the chip text and the remove call.
  const currentLabelNames = useMemo(
    () => issue.labels.map(l => l.name),
    [issue.labels]
  )

  const listAllQuery = useQuery({
    queryKey: ['beads', 'labelListAll', cwd],
    queryFn: async () => {
      const result = await commands.bdLabelListAll(cwd)
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  // ponytail: stable datalist id. Reusing a literal id across
  // re-renders is the cheapest possible implementation — no
  // `useId()` ceremony for a v1 single-instance component.
  const datalistId = `${inputId}-datalist`

  const invalidate = () => {
    // The `Issue.labels` field lives on the show payload, so the
    // detail view's `bdShow` query is the source of truth. The
    // `bd_label_list_all` cache is also refreshed because a new
    // label may have appeared in the repo.
    queryClient.invalidateQueries({
      queryKey: ['beads', 'show', cwd, issue.id],
    })
    queryClient.invalidateQueries({
      queryKey: ['beads', 'labelListAll', cwd],
    })
  }

  const addMutation = useMutation({
    mutationFn: async (label: string) => {
      const result = await commands.bdLabelAdd(cwd, issue.id, label)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    onSuccess: () => invalidate(),
  })

  const removeMutation = useMutation({
    mutationFn: async (label: string) => {
      const result = await commands.bdLabelRemove(cwd, issue.id, label)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    onSuccess: () => invalidate(),
  })

  const propagateMutation = useMutation({
    mutationFn: async (label: string) => {
      const result = await commands.bdLabelPropagate(cwd, issue.id, label)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    onSuccess: () => invalidate(),
  })

  const [addDraft, setAddDraft] = useState('')
  const [propagateOpen, setPropagateOpen] = useState(false)
  const [propagateLabel, setPropagateLabel] = useState('')

  // ponytail: v1 child proxy. The plan offers no v1 "list of
  // children" call; `dependency_count` is the closest typed
  // signal. A real children count would require a recursive
  // `bd show` walk or a future CLI flag, both out of scope.
  const hasChildren = issue.dependency_count > 0

  const handleAddSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = addDraft.trim()
    if (trimmed.length === 0 || addMutation.isPending) return
    addMutation.mutate(trimmed, {
      onSuccess: () => setAddDraft(''),
    })
  }

  const handleRemove = (label: string) => {
    if (removeMutation.isPending) return
    removeMutation.mutate(label)
  }

  const handlePropagateClick = () => {
    if (!hasChildren) return
    setPropagateOpen(true)
  }

  const handlePropagateCancel = () => {
    setPropagateOpen(false)
    setPropagateLabel('')
  }

  const handlePropagateConfirm = () => {
    const trimmed = propagateLabel.trim()
    if (trimmed.length === 0 || propagateMutation.isPending) return
    propagateMutation.mutate(trimmed, {
      onSuccess: (report: PropagationReport) => {
        setPropagateOpen(false)
        setPropagateLabel('')
        // ponytail: a parent with no children yields
        // `{ added: 0, skipped: 0, errors: [] }`. The toast
        // surfaces that as a successful "nothing to propagate"
        // signal. The data attribute is a testid-like contract
        // for the test suite.
        const total = report.added + report.skipped
        const message =
          report.errors.length > 0
            ? `Propagated ${report.added} added, ${report.skipped} skipped, ${report.errors.length} errors`
            : total === 0
              ? 'Nothing to propagate (no children).'
              : `Propagated ${report.added} added, ${report.skipped} skipped.`
        const banner = document.querySelector(
          '[data-testid="label-manager-toast"]'
        ) as HTMLElement | null
        if (banner) {
          banner.textContent = message
          banner.dataset.tone = report.errors.length > 0 ? 'partial' : 'success'
        }
      },
    })
  }

  return (
    <div data-testid="label-manager" style={containerStyle}>
      <div data-testid="label-manager-chips" style={chipsRowStyle}>
        {currentLabelNames.length === 0 ? (
          <div data-testid="label-manager-empty" style={messageStyle}>
            No labels.
          </div>
        ) : (
          currentLabelNames.map(label => (
            <LabelChip
              key={label}
              label={label}
              onRemove={() => handleRemove(label)}
            />
          ))
        )}
      </div>

      <form
        data-testid="label-manager-add-form"
        onSubmit={handleAddSubmit}
        style={addFormStyle}
      >
        <label htmlFor={inputId} style={addLabelStyle}>
          Add label
        </label>
        <input
          id={inputId}
          data-testid="label-manager-add-input"
          list={datalistId}
          type="text"
          value={addDraft}
          onChange={e => setAddDraft(e.target.value)}
          placeholder="priority-high"
          disabled={addMutation.isPending}
          style={inputStyle}
          autoComplete="off"
          spellCheck={false}
          aria-label="New label name"
        />
        <datalist id={datalistId}>
          {(listAllQuery.data ?? []).map((row: LabelWithCount) => (
            <option key={row.label} value={row.label} />
          ))}
        </datalist>
        <button
          type="submit"
          data-testid="label-manager-add-submit"
          disabled={addMutation.isPending || addDraft.trim().length === 0}
          style={
            addMutation.isPending || addDraft.trim().length === 0
              ? submitButtonDisabledStyle
              : submitButtonStyle
          }
        >
          {addMutation.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      {hasChildren ? (
        <div style={propagateContainerStyle}>
          {propagateOpen ? (
            <div
              data-testid="label-manager-propagate-panel"
              style={propagatePanelStyle}
            >
              <p style={propagatePromptStyle}>
                Push a label down to all direct children that don't already
                carry it.
              </p>
              <input
                data-testid="label-manager-propagate-input"
                list={datalistId}
                type="text"
                value={propagateLabel}
                onChange={e => setPropagateLabel(e.target.value)}
                placeholder="branch:auth"
                disabled={propagateMutation.isPending}
                style={inputStyle}
                autoComplete="off"
                spellCheck={false}
                aria-label="Label to propagate"
              />
              <div style={propagateActionsStyle}>
                <button
                  type="button"
                  data-testid={propagateCancelId}
                  onClick={handlePropagateCancel}
                  disabled={propagateMutation.isPending}
                  style={actionButtonStyle}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid={propagateConfirmId}
                  onClick={handlePropagateConfirm}
                  disabled={
                    propagateMutation.isPending ||
                    propagateLabel.trim().length === 0
                  }
                  style={
                    propagateMutation.isPending ||
                    propagateLabel.trim().length === 0
                      ? submitButtonDisabledStyle
                      : actionButtonStyle
                  }
                >
                  {propagateMutation.isPending ? 'Propagating…' : 'Propagate'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              data-testid={propagateButtonId}
              onClick={handlePropagateClick}
              style={actionButtonStyle}
            >
              Propagate to children
            </button>
          )}
        </div>
      ) : null}

      <div
        data-testid="label-manager-toast"
        data-tone="idle"
        style={toastStyle}
        role="status"
        aria-live="polite"
      />

      {addMutation.isError || removeMutation.isError ? (
        <div
          data-testid="label-manager-error"
          role="alert"
          style={errorBoxStyle}
        >
          {formatMutationError(addMutation.error ?? removeMutation.error)}
        </div>
      ) : null}
    </div>
  )
}

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
  gap: space[3],
}

const chipsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: space[2],
  alignItems: 'center',
  minHeight: 24,
}

const messageStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  color: colors.mono5,
  fontStyle: 'italic',
}

const addFormStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: space[2],
}

const addLabelStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.medium,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: colors.mono3,
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
  paddingBlock: space[1],
  outline: 'none',
  minWidth: 160,
  flex: '1 1 160px',
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

const propagateContainerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
}

const propagatePanelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  padding: space[3],
}

const propagatePromptStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  margin: 0,
}

const propagateActionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[2],
}

const toastStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  color: colors.mono5,
  minHeight: 16,
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

export default LabelManager
