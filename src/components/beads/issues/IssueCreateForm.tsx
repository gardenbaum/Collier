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
import { useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { commands } from '@/lib/tauri-bindings'
import type { CreateInput, IssuePriority, IssueType } from '@/lib/bindings'
import { useDialogA11y } from '@/hooks/useDialogA11y'
import { formatError } from '@/lib/error-format'
import { IssueTypeField } from './IssueTypeField'
import { IssuePriorityField } from './IssuePriorityField'

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

const DEFAULT_PRIORITY: IssuePriority = 'P2'

const inputClass =
  'w-full h-9 px-3 rounded-[var(--radius)] bg-[color:var(--secondary)] border border-[color:var(--border)] text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] focus:ring-offset-2 focus:ring-offset-[color:var(--background)] text-[13px]'
const selectClass = `${inputClass} cursor-pointer`
const textareaClass = `${inputClass} min-h-[88px] py-2 resize-y`
const priorityButtonClass =
  'h-8 px-3 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--secondary)] text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] cursor-pointer font-mono text-[11px] font-semibold tracking-[0.04em] transition-colors'
const priorityButtonSelectedClass =
  'h-8 px-3 rounded-[var(--radius)] border border-[color:var(--ring)] bg-[color:var(--accent)]/15 text-[color:var(--foreground)] cursor-pointer font-mono text-[11px] font-semibold tracking-[0.04em]'
const cancelButtonClass =
  'h-9 px-4 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--secondary)] text-[color:var(--foreground)] hover:bg-[color:var(--accent)]/10 cursor-pointer font-sans text-[13px]'
const submitButtonClass =
  'h-9 px-5 rounded-[var(--radius)] bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:bg-[color:var(--accent)] cursor-pointer font-sans text-[13px] font-semibold'
const submitButtonDisabledClass =
  'h-9 px-5 rounded-[var(--radius)] bg-[color:var(--muted-foreground)] text-[color:var(--background)] cursor-not-allowed font-sans text-[13px] font-semibold opacity-50'

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

  // M5 a11y: focus trap + restoration + Escape handling shared by
  // every modal dialog in the app. The hook snapshots the trigger
  // on mount and restores focus to it on unmount, so the user
  // doesn't lose their place in the issue list when the form closes.
  const panelRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  useDialogA11y({
    panelRef,
    initialFocusRef: titleRef,
    onClose,
  })

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
      setTitleError(
        t('beads.issueCreateForm.titleRequired', 'Title is required')
      )
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
        ref={panelRef}
        data-testid="create-form"
        role="dialog"
        aria-modal="true"
        aria-label={t('beads.issueCreateForm.newIssue', 'New issue')}
        tabIndex={-1}
        className="flex max-h-[90vh] w-[560px] max-w-[90vw] flex-col overflow-y-auto rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--card)] font-sans text-sm leading-normal text-[color:var(--card-foreground)] shadow-lg"
      >
        <header className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
          <h1 className="m-0 text-lg font-bold leading-tight text-[color:var(--foreground)]">
            {t('beads.issueCreateForm.newIssue', 'New Issue')}
          </h1>
          <button
            type="button"
            data-testid="create-close"
            onClick={onClose}
            aria-label="Close"
            className="m-0 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--secondary)] p-0 font-sans text-base leading-none text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
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
              ref={titleRef}
              type="text"
              data-testid="create-title"
              value={title}
              onChange={e => {
                setTitle(e.target.value)
                if (titleError) setTitleError(null)
              }}
              required
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
            <IssueTypeField
              value={issueType}
              onChange={setIssueType}
              testId="create-type"
              selectClassName={selectClass}
            />
          </Field>

          <Field label={t('beads.issueCreateForm.priority', 'Priority')}>
            <IssuePriorityField
              value={priority}
              onChange={setPriority}
              testIdPrefix="create-priority"
              ariaLabel={t('beads.issueCreateForm.priority', 'Priority')}
              buttonClassName={priorityButtonClass}
              buttonSelectedClassName={priorityButtonSelectedClass}
            />
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
                    className="inline-flex h-5 items-center gap-1 rounded-[4px] border border-[color:var(--border)] bg-[color:var(--secondary)] px-2 font-sans text-xs font-medium text-[color:var(--foreground)]"
                  >
                    {l}
                    <button
                      type="button"
                      data-testid={`create-label-chip-remove-${l}`}
                      onClick={() => handleRemoveLabel(l)}
                      aria-label={`Remove ${l}`}
                      className="m-0 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-[2px] border-0 bg-transparent p-0 font-sans text-sm leading-none text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
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
              className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-[color:var(--destructive)]/40 bg-[color:var(--destructive)]/10 px-3 py-2 font-sans text-xs text-[color:var(--foreground)]"
            >
              <span>
                {formatError(createMutation.error, 'Failed to create issue.')}
              </span>
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
                className="h-7 px-3 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--secondary)] font-sans text-xs font-medium text-[color:var(--foreground)] cursor-pointer hover:bg-[color:var(--accent)]/10"
              >
                Retry
              </button>
            </div>
          ) : null}

          <footer className="mt-2 flex items-center justify-between gap-2 border-t border-[color:var(--border)] px-0 pt-3">
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
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted-foreground)]">
        {label}
        {required ? (
          <span className="font-bold text-[color:var(--foreground)]"> *</span>
        ) : null}
      </span>
      {children}
      {error ? (
        <span
          data-testid="create-title-error"
          className="font-medium text-xs text-[color:var(--destructive)]"
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
