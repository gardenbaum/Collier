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
 * Hard-edged Bauhaus: mono only, hard edges, Tailwind classes that
 * map directly to design tokens. The brand colour is reserved for
 * destructive + P0 per AC-14; this component never reaches for it.
 * No animations, no transitions, no shadow, no radius.
 *
 * Label editing is omitted in v1 (deferred to T34-T36 per the plan).
 * The `Issue` already has its labels; the user can edit them via a
 * dedicated flow once it lands.
 *
 * WriteLock: the Rust runner serializes `bd` writes internally, so
 * the frontend does not coordinate locking. Same reasoning as
 * `IssueCreateForm`.
 */
import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { commands } from '@/lib/tauri-bindings'
import type {
  Issue,
  IssuePriority,
  IssueStatus,
  IssueType,
  UpdateInput,
} from '@/lib/bindings'

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
const cancelButtonDisabledClass =
  'border border-mono-7 bg-mono-8 px-4 py-2 font-sans text-sm font-normal text-mono-5 cursor-not-allowed'
const submitButtonClass =
  'border border-mono-0 bg-mono-0 px-6 py-2 font-sans text-sm font-bold text-mono-9 cursor-pointer'
const submitButtonDisabledClass =
  'border border-mono-5 bg-mono-5 px-6 py-2 font-sans text-sm font-bold text-mono-9 cursor-not-allowed'

export function IssueUpdatePanel({
  cwd,
  issue,
  onClose,
  onUpdated,
}: IssueUpdatePanelProps) {
  const { t } = useTranslation()
  // ponytail: pre-populate from the issue prop. We keep the original
  // `issue` reference (not a snapshot copy) so the dirty check is a
  // plain equality compare against live fields.
  const [title, setTitle] = useState(issue.title)
  const [description, setDescription] = useState(issue.description ?? '')
  const [issueType, setIssueType] = useState<IssueType>(issue.issue_type)
  const [priority, setPriority] = useState<IssuePriority>(issue.priority)
  const [status, setStatus] = useState<IssueStatus>(issue.status)
  const [assignee, setAssignee] = useState(issue.owner ?? '')
  const [externalRef, setExternalRef] = useState(issue.external_ref ?? '')

  // ponytail: per-field dirty state. Each entry is true when the
  // current value differs from the original. `isDirty` is derived
  // so the Save button can gate on it. We do NOT compare strings with
  // `!==` directly because the user may "edit and revert" — that
  // must be a no-op (back to false).
  const ownerOriginal = issue.owner ?? ''
  const descOriginal = issue.description ?? ''
  const extRefOriginal = issue.external_ref ?? ''
  const isDirty =
    title !== issue.title ||
    description !== descOriginal ||
    issueType !== issue.issue_type ||
    priority !== issue.priority ||
    status !== issue.status ||
    assignee !== ownerOriginal ||
    externalRef !== extRefOriginal

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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!isDirty || updateMutation.isPending) return
    // ponytail: only include fields that actually changed. Sending
    // the full struct on every save would cause the CLI to write a
    // no-op history entry for every unchanged field.
    const input: UpdateInput = {}
    if (title !== issue.title) input.title = title
    if (description !== descOriginal) input.description = description
    if (issueType !== issue.issue_type) input.issueType = issueType
    if (priority !== issue.priority) input.priority = priority
    if (status !== issue.status) input.status = status
    if (assignee !== ownerOriginal) input.assignee = assignee
    if (externalRef !== extRefOriginal) input.externalRef = externalRef
    updateMutation.mutate(input)
  }

  return (
    <div
      data-testid="update-panel-overlay"
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
    >
      <aside
        data-testid="update-panel"
        role="dialog"
        aria-label={t('beads.issueUpdatePanel.editIssue', 'Edit issue')}
        className="flex h-full w-[560px] max-w-[90vw] flex-col overflow-hidden border-l border-mono-7 bg-mono-9 font-sans text-sm leading-normal text-mono-0"
      >
        <header className="flex flex-col gap-2 border-b border-mono-7 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-mono-5">{issue.id}</span>
            <button
              type="button"
              data-testid="update-close"
              onClick={onClose}
              aria-label="Close"
              className="m-0 inline-flex h-6 w-6 cursor-pointer items-center justify-center border border-mono-3 bg-mono-8 p-0 font-sans text-base leading-none text-mono-0"
            >
              ×
            </button>
          </div>
          <h1 className="m-0 text-lg font-bold leading-tight text-mono-0">
            {t('beads.issueUpdatePanel.editIssue', 'Edit Issue')}
          </h1>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
          noValidate
        >
          <Field label={t('beads.issueUpdatePanel.title', 'Title')}>
            <input
              type="text"
              data-testid="update-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label={t('beads.issueUpdatePanel.description', 'Description')}>
            <textarea
              data-testid="update-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              className={textareaClass}
            />
          </Field>

          <Field label={t('beads.issueUpdatePanel.type', 'Type')}>
            <select
              data-testid="update-type"
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

          <Field label={t('beads.issueUpdatePanel.priority', 'Priority')}>
            <div
              className="flex gap-1"
              role="radiogroup"
              aria-label={t('beads.issueUpdatePanel.priority', 'Priority')}
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

          <Field label={t('beads.issueUpdatePanel.status', 'Status')}>
            <select
              data-testid="update-status"
              value={status}
              onChange={e => setStatus(e.target.value as IssueStatus)}
              className={selectClass}
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('beads.issueUpdatePanel.assignee', 'Assignee')}>
            <input
              type="text"
              data-testid="update-assignee"
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field
            label={t('beads.issueUpdatePanel.externalRef', 'External ref')}
          >
            <input
              type="text"
              data-testid="update-external-ref"
              value={externalRef}
              onChange={e => setExternalRef(e.target.value)}
              className={inputClass}
            />
          </Field>

          {updateMutation.isError ? (
            <div
              data-testid="update-error"
              role="alert"
              className="border border-mono-3 bg-mono-8 px-3 py-2 font-sans text-xs text-mono-0"
            >
              {formatMutationError(updateMutation.error)}
            </div>
          ) : null}

          <footer className="mt-2 flex items-center justify-between gap-2 border-t border-mono-7 pt-2">
            <button
              type="button"
              data-testid="update-cancel"
              onClick={onClose}
              disabled={!isDirty}
              className={
                !isDirty ? cancelButtonDisabledClass : cancelButtonClass
              }
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="update-save"
              disabled={!isDirty || updateMutation.isPending}
              className={
                !isDirty || updateMutation.isPending
                  ? submitButtonDisabledClass
                  : submitButtonClass
              }
            >
              {updateMutation.isPending
                ? t('beads.issueUpdatePanel.saving', 'Saving…')
                : t('beads.issueUpdatePanel.save', 'Save')}
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
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.4px] text-mono-3">
        {label}
      </span>
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
