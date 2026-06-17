/**
 * IssueCreateForm — modal form for creating a new Beads issue.
 *
 * Captures the v1 `bd create` surface: title (required), description,
 * type, priority, assignee, labels, external_ref. Submits via
 * `commands.bdCreate(cwd, input)` and fires `onCreated(issueId)` on
 * success so the parent can navigate to the new detail view.
 *
 * State onion (per AGENTS.md):
 *   - Form fields → `useState` (component-local, no Zustand needed)
 *   - Submit call → TanStack Query `useMutation`
 *
 * Hard-edged Bauhaus: mono only, hard edges, inline `style` with
 * design tokens. The brand colour is reserved for destructive + P0
 * per AC-14; this component never reaches for it. No animations, no
 * transitions, no shadow, no radius.
 *
 * WriteLock: the Rust runner already serializes `bd` writes through
 * the runner's internal lock, so the frontend does not need to
 * coordinate locking here. The plan's T21 spec mentioned WriteLock;
 * it's automatic via the runner, not exposed in the UI.
 */
import { useState, type CSSProperties, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import type { CreateInput, IssuePriority, IssueType } from '@/lib/bindings'
import { colors, space, type } from '@/lib/design-tokens'

export interface IssueCreateFormProps {
  /** Repository root. Passed to `commands.bdCreate`. */
  cwd: string
  /** Fires when the user dismisses the modal (Cancel button or backdrop). */
  onClose: () => void
  /**
   * Fires with the new issue id after a successful create. The parent
   * is expected to navigate to the detail view (T16b).
   */
  onCreated: (issueId: string) => void
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

const DEFAULT_PRIORITY: IssuePriority = 'P2'

export function IssueCreateForm({
  cwd,
  onClose,
  onCreated,
}: IssueCreateFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [issueType, setIssueType] = useState<IssueType>('task')
  const [priority, setPriority] = useState<IssuePriority>(DEFAULT_PRIORITY)
  const [assignee, setAssignee] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [labels, setLabels] = useState<string[]>([])
  const [externalRef, setExternalRef] = useState('')
  const [titleError, setTitleError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: async (input: CreateInput) => {
      const result = await commands.bdCreate(cwd, input)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    onSuccess: issue => {
      onCreated(issue.id)
    },
  })

  const handleAddLabel = () => {
    const trimmed = labelInput.trim()
    if (trimmed.length === 0) return
    if (labels.includes(trimmed)) {
      setLabelInput('')
      return
    }
    setLabels([...labels, trimmed])
    setLabelInput('')
  }

  const handleRemoveLabel = (label: string) => {
    setLabels(labels.filter(l => l !== label))
  }

  const handleLabelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddLabel()
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmedTitle = title.trim()
    if (trimmedTitle.length === 0) {
      setTitleError('Title is required')
      return
    }
    setTitleError(null)
    const input: CreateInput = {
      title: trimmedTitle,
      description: description.trim() || null,
      issueType,
      priority,
      assignee: assignee.trim() || null,
      labels: labels.length > 0 ? labels : null,
      externalRef: externalRef.trim() || null,
    }
    createMutation.mutate(input)
  }

  return (
    <div data-testid="create-form-overlay" style={overlayStyle}>
      <div
        data-testid="create-form"
        role="dialog"
        aria-label="New issue"
        style={cardStyle}
      >
        <header style={headerStyle}>
          <h1 style={titleHeadingStyle}>New Issue</h1>
          <button
            type="button"
            data-testid="create-close"
            onClick={onClose}
            aria-label="Close"
            style={closeButtonStyle}
          >
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit} style={formStyle} noValidate>
          <Field label="Title" required error={titleError}>
            <input
              type="text"
              data-testid="create-title"
              value={title}
              onChange={e => {
                setTitle(e.target.value)
                if (titleError) setTitleError(null)
              }}
              required
              autoFocus
              style={inputStyle}
            />
          </Field>

          <Field label="Description">
            <textarea
              data-testid="create-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              style={textareaStyle}
            />
          </Field>

          <Field label="Type">
            <select
              data-testid="create-type"
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
                    data-testid={`create-priority-${p}`}
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

          <Field label="Assignee">
            <input
              type="text"
              data-testid="create-assignee"
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Labels">
            <input
              type="text"
              data-testid="create-labels-input"
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              onKeyDown={handleLabelKeyDown}
              placeholder="Type a label and press Enter"
              style={inputStyle}
            />
            {labels.length > 0 ? (
              <div data-testid="create-labels-chips" style={chipsRowStyle}>
                {labels.map(l => (
                  <span
                    key={l}
                    data-testid={`create-label-chip-${l}`}
                    style={chipStyle}
                  >
                    {l}
                    <button
                      type="button"
                      data-testid={`create-label-chip-remove-${l}`}
                      onClick={() => handleRemoveLabel(l)}
                      aria-label={`Remove ${l}`}
                      style={chipRemoveButtonStyle}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </Field>

          <Field label="External ref">
            <input
              type="text"
              data-testid="create-external-ref"
              value={externalRef}
              onChange={e => setExternalRef(e.target.value)}
              style={inputStyle}
            />
          </Field>

          {createMutation.isError ? (
            <div data-testid="create-error" role="alert" style={errorBoxStyle}>
              <span>{formatMutationError(createMutation.error)}</span>
              <button
                type="button"
                data-testid="create-retry"
                onClick={() =>
                  createMutation.mutate(
                    buildInput({
                      title,
                      description,
                      issueType,
                      priority,
                      assignee,
                      labels,
                      externalRef,
                    })
                  )
                }
                style={retryButtonStyle}
              >
                Retry
              </button>
            </div>
          ) : null}

          <footer style={actionsStyle}>
            <button
              type="button"
              data-testid="create-cancel"
              onClick={onClose}
              style={cancelButtonStyle}
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="create-submit"
              disabled={createMutation.isPending}
              style={
                createMutation.isPending
                  ? submitButtonDisabledStyle
                  : submitButtonStyle
              }
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <label style={fieldStyle}>
      <span style={fieldLabelStyle}>
        {label}
        {required ? <span style={requiredStyle}> *</span> : null}
      </span>
      {children}
      {error ? (
        <span data-testid="create-title-error" style={fieldErrorStyle}>
          {error}
        </span>
      ) : null}
    </label>
  )
}

function buildInput(state: {
  title: string
  description: string
  issueType: IssueType
  priority: IssuePriority
  assignee: string
  labels: string[]
  externalRef: string
}): CreateInput {
  return {
    title: state.title.trim(),
    description: state.description.trim() || null,
    issueType: state.issueType,
    priority: state.priority,
    assignee: state.assignee.trim() || null,
    labels: state.labels.length > 0 ? state.labels : null,
    externalRef: state.externalRef.trim() || null,
  }
}

function formatMutationError(err: unknown): string {
  if (err && typeof err === 'object' && 'type' in err) {
    const e = err as { type: string; message?: string; stderr?: string }
    if (e.type === 'NonZeroExit' && e.stderr) return e.stderr
    if ('message' in e && e.message) return e.message
    return e.type
  }
  if (err instanceof Error) return err.message
  return 'Failed to create issue.'
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
  backgroundColor: 'rgba(0, 0, 0, 0.4)',
}

const cardStyle: CSSProperties = {
  width: 560,
  maxWidth: '90vw',
  maxHeight: '90vh',
  overflowY: 'auto',
  backgroundColor: colors.mono9,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  display: 'flex',
  flexDirection: 'column',
  color: colors.mono0,
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  lineHeight: type.lineHeight.normal,
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingInline: space[4],
  paddingBlock: space[3],
  borderBottom: `1px solid ${colors.mono7}`,
}

const titleHeadingStyle: CSSProperties = {
  fontSize: type.fontSize.lg,
  fontWeight: type.fontWeight.bold,
  lineHeight: type.lineHeight.tight,
  margin: 0,
  color: colors.mono0,
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

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
  paddingInline: space[4],
  paddingBlock: space[4],
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

const requiredStyle: CSSProperties = {
  color: colors.mono0,
  fontWeight: type.fontWeight.bold,
}

const fieldErrorStyle: CSSProperties = {
  fontSize: type.fontSize.xs,
  color: colors.mono0,
  fontWeight: type.fontWeight.medium,
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

const chipsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: space[1],
  marginTop: space[1],
}

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[1],
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  color: colors.mono0,
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono7,
  paddingInline: space[2],
  paddingBlock: space[1],
}

const chipRemoveButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 16,
  padding: 0,
  margin: 0,
  backgroundColor: 'transparent',
  borderWidth: 0,
  color: colors.mono3,
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  lineHeight: 1,
  cursor: 'pointer',
}

const errorBoxStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[2],
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

const retryButtonStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.medium,
  color: colors.mono0,
  backgroundColor: colors.mono9,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[3],
  paddingBlock: space[1],
  cursor: 'pointer',
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[2],
  paddingTop: space[2],
  borderTop: `1px solid ${colors.mono7}`,
  marginTop: space[2],
  paddingInline: 0,
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
