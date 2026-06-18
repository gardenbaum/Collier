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
 * Hard-edged Bauhaus: mono only, hard edges, Tailwind classes that
 * map directly to design tokens. The brand colour is reserved for
 * destructive + P0 per AC-14; this component never reaches for it.
 * No animations, no transitions, no shadow, no radius.
 *
 * WriteLock: the Rust runner already serializes `bd` writes through
 * the runner's internal lock, so the frontend does not need to
 * coordinate locking here. The plan's T21 spec mentioned WriteLock;
 * it's automatic via the runner, not exposed in the UI.
 */
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { commands } from '@/lib/tauri-bindings'
import type { CreateInput, IssuePriority, IssueType } from '@/lib/bindings'

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

const inputClass =
  'border border-mono-3 bg-mono-9 px-2 py-2 font-sans text-sm text-mono-0 outline-none'
const selectClass = `${inputClass} cursor-pointer`
const textareaClass = `${inputClass} resize-y`
const priorityButtonClass =
  'border border-mono-3 bg-mono-8 px-3 py-1 font-sans text-xs font-medium text-mono-3 cursor-pointer'
const priorityButtonSelectedClass =
  'border border-mono-0 bg-mono-0 px-3 py-1 font-sans text-xs font-bold text-mono-9 cursor-pointer'
const cancelButtonClass =
  'border border-mono-3 bg-mono-9 px-4 py-2 font-sans text-sm font-normal text-mono-0 cursor-pointer'
const submitButtonClass =
  'border border-mono-0 bg-mono-0 px-6 py-2 font-sans text-sm font-bold text-mono-9 cursor-pointer'
const submitButtonDisabledClass =
  'border border-mono-5 bg-mono-5 px-6 py-2 font-sans text-sm font-bold text-mono-9 cursor-not-allowed'

export function IssueCreateForm({
  cwd,
  onClose,
  onCreated,
}: IssueCreateFormProps) {
  const { t } = useTranslation()
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
      setTitleError(t('beads.issueCreateForm.titleRequired', 'Title is required'))
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
    <div
      data-testid="create-form-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div
        data-testid="create-form"
        role="dialog"
        aria-label={t('beads.issueCreateForm.newIssue', 'New issue')}
        className="flex max-h-[90vh] w-[560px] max-w-[90vw] flex-col overflow-y-auto border border-mono-3 bg-mono-9 font-sans text-sm leading-normal text-mono-0"
      >
        <header className="flex items-center justify-between border-b border-mono-7 px-4 py-3">
          <h1 className="m-0 text-lg font-bold leading-tight text-mono-0">
            {t('beads.issueCreateForm.newIssue', 'New Issue')}
          </h1>
          <button
            type="button"
            data-testid="create-close"
            onClick={onClose}
            aria-label="Close"
            className="m-0 inline-flex h-6 w-6 cursor-pointer items-center justify-center border border-mono-3 bg-mono-8 p-0 font-sans text-base leading-none text-mono-0"
          >
            ×
          </button>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 px-4 py-4"
          noValidate
        >
          <Field
            label={t('beads.issueCreateForm.title', 'Title')}
            required
            error={titleError}
          >
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
              className={inputClass}
            />
          </Field>

          <Field label={t('beads.issueCreateForm.description', 'Description')}>
            <textarea
              data-testid="create-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              className={textareaClass}
            />
          </Field>

          <Field label={t('beads.issueCreateForm.type', 'Type')}>
            <select
              data-testid="create-type"
              value={issueType}
              onChange={e => setIssueType(e.target.value as IssueType)}
              className={selectClass}
            >
              {ISSUE_TYPES.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('beads.issueCreateForm.priority', 'Priority')}>
            <div
              className="flex gap-1"
              role="radiogroup"
              aria-label={t('beads.issueCreateForm.priority', 'Priority')}
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
                    className={
                      selected
                        ? priorityButtonSelectedClass
                        : priorityButtonClass
                    }
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label={t('beads.issueCreateForm.assignee', 'Assignee')}>
            <input
              type="text"
              data-testid="create-assignee"
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label={t('beads.issueCreateForm.labels', 'Labels')}>
            <input
              type="text"
              data-testid="create-labels-input"
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              onKeyDown={handleLabelKeyDown}
              placeholder="Type a label and press Enter"
              className={inputClass}
            />
            {labels.length > 0 ? (
              <div
                data-testid="create-labels-chips"
                className="mt-1 flex flex-wrap gap-1"
              >
                {labels.map(l => (
                  <span
                    key={l}
                    data-testid={`create-label-chip-${l}`}
                    className="inline-flex items-center gap-1 border border-mono-7 bg-mono-8 px-2 py-1 font-sans text-xs text-mono-0"
                  >
                    {l}
                    <button
                      type="button"
                      data-testid={`create-label-chip-remove-${l}`}
                      onClick={() => handleRemoveLabel(l)}
                      aria-label={`Remove ${l}`}
                      className="m-0 inline-flex h-4 w-4 cursor-pointer items-center justify-center border-0 bg-transparent p-0 font-sans text-sm leading-none text-mono-3"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </Field>

          <Field label={t('beads.issueCreateForm.externalRef', 'External ref')}>
            <input
              type="text"
              data-testid="create-external-ref"
              value={externalRef}
              onChange={e => setExternalRef(e.target.value)}
              className={inputClass}
            />
          </Field>

          {createMutation.isError ? (
            <div
              data-testid="create-error"
              role="alert"
              className="flex items-center justify-between gap-2 border border-mono-3 bg-mono-8 px-3 py-2 font-sans text-xs text-mono-0"
            >
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
                className="border border-mono-3 bg-mono-9 px-3 py-1 font-sans text-xs font-medium text-mono-0 cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : null}

          <footer className="mt-2 flex items-center justify-between gap-2 border-t border-mono-7 px-0 pt-2">
            <button
              type="button"
              data-testid="create-cancel"
              onClick={onClose}
              className={cancelButtonClass}
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="create-submit"
              disabled={createMutation.isPending}
              className={
                createMutation.isPending
                  ? submitButtonDisabledClass
                  : submitButtonClass
              }
            >
              {createMutation.isPending
                ? t('beads.issueCreateForm.creating', 'Creating…')
                : t('beads.issueCreateForm.create', 'Create')}
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
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.4px] text-mono-3">
        {label}
        {required ? <span className="font-bold text-mono-0"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span
          data-testid="create-title-error"
          className="font-medium text-xs text-mono-0"
        >
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