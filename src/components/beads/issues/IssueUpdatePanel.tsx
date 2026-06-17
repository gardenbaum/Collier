/**
 * IssueUpdatePanel — side panel for in-place editing of a Beads issue.
 *
 * ponytail: dirty-state is tracked per-field. `isDirty` is a
 * derived boolean: any field whose current state differs from the
 * original `issue` prop flips it true. The Save button is gated on
 * `isDirty && !isPending`; the Cancel button stays enabled even
 * when not dirty so the user can dismiss the panel.
 *
 * State onion (per AGENTS.md):
 *   - Form fields → `useState` (component-local)
 *   - Submit call → TanStack Query `useMutation`
 *   - No Zustand needed.
 *
 * Hard-edged Bauhaus: mono only, hard edges, inline `style` with
 * design tokens. The brand colour is reserved for destructive + P0
 * per AC-14; this component never reaches for it. No animations, no
 * transitions, no shadow, no radius.
 *
 * Label editing is omitted in v1 (deferred to T34-T36 per the plan).
 * The `Issue` already has its labels; the user can edit them via a
 * dedicated flow once it lands.
 *
 * WriteLock: the Rust runner serializes `bd` writes internally, so
 * the frontend does not coordinate locking. Same reasoning as
 * `IssueCreateForm`.
 */
import { useState, type CSSProperties, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import type {
  Issue,
  IssuePriority,
  IssueStatus,
  IssueType,
  UpdateInput,
} from '@/lib/bindings'
import { colors, space, type } from '@/lib/design-tokens'

export interface IssueUpdatePanelProps {
  /** Repository root. Passed to `commands.bdUpdate`. */
  cwd: string
  /** The issue to edit. Used both for the form's initial values and for the id. */
  issue: Issue
  /** Fires when the user dismisses the panel (close button or Cancel). */
  onClose: () => void
  /** Fires with the updated issue after a successful save. */
  onUpdated: (issue: Issue) => void
}

const ISSUE_TYPES: IssueType[] = [
  'bug',
  'feature',
  'task',
  'epic',
  'chore',
  'decision',
  'gate',
]

const PRIORITIES: IssuePriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

const STATUSES: IssueStatus[] = [
  'open',
  'in_progress',
  'blocked',
  'closed',
  'deferred',
]

function asStringOrEmpty(v: string | null | undefined): string {
  return v ?? ''
}

export function IssueUpdatePanel({
  cwd,
  issue,
  onClose,
  onUpdated,
}: IssueUpdatePanelProps) {
  // ponytail: pre-populate from the issue prop. We keep the original
  // `issue` reference (not a snapshot copy) so the dirty check is a
  // plain equality compare against live fields.
  const [title, setTitle] = useState(issue.title)
  const [description, setDescription] = useState(
    asStringOrEmpty(issue.description)
  )
  const [issueType, setIssueType] = useState<IssueType>(issue.issue_type)
  const [priority, setPriority] = useState<IssuePriority>(issue.priority)
  const [status, setStatus] = useState<IssueStatus>(issue.status)
  const [assignee, setAssignee] = useState(asStringOrEmpty(issue.owner))
  const [externalRef, setExternalRef] = useState(
    asStringOrEmpty(issue.external_ref)
  )

  // ponytail: per-field dirty state. Each entry is true when the
  // current value differs from the original. `isDirty` is derived
  // (`Object.values(dirty).some(Boolean)`) so the Save button can
  // gate on it. We do NOT compare strings with `!==` directly
  // because the user may "edit and revert" — that must be a no-op
  // (back to false).
  const isDirty =
    title !== issue.title ||
    description !== asStringOrEmpty(issue.description) ||
    issueType !== issue.issue_type ||
    priority !== issue.priority ||
    status !== issue.status ||
    assignee !== asStringOrEmpty(issue.owner) ||
    externalRef !== asStringOrEmpty(issue.external_ref)

  const updateMutation = useMutation({
    mutationFn: async (input: UpdateInput) => {
      const result = await commands.bdUpdate(cwd, issue.id, input)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    onSuccess: updated => {
      onUpdated(updated)
    },
  })

  // ponytail: only include fields that actually changed. Sending the
  // full struct on every save would cause the CLI to write a no-op
  // history entry for every unchanged field. The dirty booleans
  // above guarantee we send the minimum diff.
  const buildInput = (): UpdateInput => {
    const input: UpdateInput = {}
    if (title !== issue.title) input.title = title
    if (description !== asStringOrEmpty(issue.description)) {
      input.description = description
    }
    if (issueType !== issue.issue_type) input.issueType = issueType
    if (priority !== issue.priority) input.priority = priority
    if (status !== issue.status) input.status = status
    if (assignee !== asStringOrEmpty(issue.owner)) input.assignee = assignee
    if (externalRef !== asStringOrEmpty(issue.external_ref)) {
      input.externalRef = externalRef
    }
    return input
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!isDirty || updateMutation.isPending) return
    updateMutation.mutate(buildInput())
  }

  return (
    <div data-testid="update-panel-overlay" style={overlayStyle}>
      <aside
        data-testid="update-panel"
        role="dialog"
        aria-label="Edit issue"
        style={panelStyle}
      >
        <header style={headerStyle}>
          <div style={headerTopRowStyle}>
            <span style={idStyle}>{issue.id}</span>
            <button
              type="button"
              data-testid="update-close"
              onClick={onClose}
              aria-label="Close"
              style={closeButtonStyle}
            >
              ×
            </button>
          </div>
          <h1 style={titleHeadingStyle}>Edit Issue</h1>
        </header>

        <form onSubmit={handleSubmit} style={formStyle} noValidate>
          <Field label="Title">
            <input
              type="text"
              data-testid="update-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Description">
            <textarea
              data-testid="update-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              style={textareaStyle}
            />
          </Field>

          <Field label="Type">
            <select
              data-testid="update-type"
              value={issueType}
              onChange={e => setIssueType(e.target.value as IssueType)}
              style={selectStyle}
            >
              {ISSUE_TYPES.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Priority">
            <div
              style={priorityRowStyle}
              role="radiogroup"
              aria-label="Priority"
            >
              {PRIORITIES.map(p => {
                const selected = p === priority
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-testid={`update-priority-${p}`}
                    onClick={() => setPriority(p)}
                    style={
                      selected
                        ? priorityButtonSelectedStyle
                        : priorityButtonStyle
                    }
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label="Status">
            <select
              data-testid="update-status"
              value={status}
              onChange={e => setStatus(e.target.value as IssueStatus)}
              style={selectStyle}
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Assignee">
            <input
              type="text"
              data-testid="update-assignee"
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="External ref">
            <input
              type="text"
              data-testid="update-external-ref"
              value={externalRef}
              onChange={e => setExternalRef(e.target.value)}
              style={inputStyle}
            />
          </Field>

          {updateMutation.isError ? (
            <div data-testid="update-error" role="alert" style={errorBoxStyle}>
              {formatMutationError(updateMutation.error)}
            </div>
          ) : null}

          <footer style={actionsStyle}>
            <button
              type="button"
              data-testid="update-cancel"
              onClick={onClose}
              disabled={!isDirty}
              style={!isDirty ? cancelButtonDisabledStyle : cancelButtonStyle}
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="update-save"
              disabled={!isDirty || updateMutation.isPending}
              style={
                !isDirty || updateMutation.isPending
                  ? submitButtonDisabledStyle
                  : submitButtonStyle
              }
            >
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label style={fieldStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
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
  return 'Failed to update issue.'
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  justifyContent: 'flex-end',
  zIndex: 50,
  backgroundColor: 'rgba(0, 0, 0, 0.4)',
}

const panelStyle: CSSProperties = {
  width: 560,
  maxWidth: '90vw',
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

const titleHeadingStyle: CSSProperties = {
  fontSize: type.fontSize.lg,
  fontWeight: type.fontWeight.bold,
  lineHeight: type.lineHeight.tight,
  margin: 0,
  color: colors.mono0,
}

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
  padding: space[4],
  flex: 1,
  overflowY: 'auto',
}

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[1],
}

const fieldLabelStyle: CSSProperties = {
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.medium,
  color: colors.mono3,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
}

const inputStyle: CSSProperties = {
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
}

const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  fontFamily: type.fontFamily.sans,
}

const selectStyle: CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

const priorityRowStyle: CSSProperties = {
  display: 'flex',
  gap: space[1],
}

const priorityButtonStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.medium,
  color: colors.mono3,
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[3],
  paddingBlock: space[1],
  cursor: 'pointer',
}

const priorityButtonSelectedStyle: CSSProperties = {
  ...priorityButtonStyle,
  color: colors.mono9,
  backgroundColor: colors.mono0,
  borderColor: colors.mono0,
  fontWeight: type.fontWeight.bold,
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

const actionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[2],
  paddingTop: space[2],
  borderTop: `1px solid ${colors.mono7}`,
  marginTop: space[2],
}

const cancelButtonStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.regular,
  color: colors.mono0,
  backgroundColor: colors.mono9,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[4],
  paddingBlock: space[2],
  cursor: 'pointer',
}

const cancelButtonDisabledStyle: CSSProperties = {
  ...cancelButtonStyle,
  color: colors.mono5,
  backgroundColor: colors.mono8,
  borderColor: colors.mono7,
  cursor: 'not-allowed',
}

const submitButtonStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.bold,
  color: colors.mono9,
  backgroundColor: colors.mono0,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono0,
  paddingInline: space[6],
  paddingBlock: space[2],
  cursor: 'pointer',
}

const submitButtonDisabledStyle: CSSProperties = {
  ...submitButtonStyle,
  backgroundColor: colors.mono5,
  borderColor: colors.mono5,
  cursor: 'not-allowed',
}
