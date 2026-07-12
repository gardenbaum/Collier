/**
 * Tests for the IssueUpdatePanel side panel.
 *
 * Contract: IssueUpdatePanel renders a pre-populated form for a
 * passed `Issue`, tracks dirty state per field, gates Save on
 * `isDirty`, and submits the minimum-diff `UpdateInput` via
 * `commands.bdUpdate(cwd, id, input)`. On success it fires
 * `onUpdated(updatedIssue)`; on error it shows an inline error.
 *
 * The Cancel button is hidden / disabled when not dirty (the spec
 * allows either; we use `disabled` so the testid is always
 * queryable). The close (×) button is always enabled and fires
 * `onClose` regardless of dirty state — that's the "dismiss without
 * saving" path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'

// ponytail: hoisted so the vi.mock factory can reference the mock fn.
// Same pattern as IssueCreateForm.test.tsx — global setup.ts mock
// doesn't include `bdUpdate` (it predates T22), so the per-test mock
// is necessary.
const { mockBdUpdate } = vi.hoisted(() => ({
  mockBdUpdate: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdUpdate: mockBdUpdate,
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const importSut = () => import('./IssueUpdatePanel')

// ponytail: a fully-populated fixture. The `null` fields exercise the
// "Option<String> starts as empty string" path; the optional scalars
// exercise the "starts as the issue's value" path. Every test uses
// the same fixture to keep the assertions stable.
const baseIssue = {
  id: 'beads-42',
  title: 'Original title',
  status: 'open' as const,
  priority: 'P2' as const,
  issue_type: 'task' as const,
  created_at: '2026-06-17T00:00:00Z',
  updated_at: null,
  closed_at: null,
  description: 'Original description',
  owner: 'alice',
  labels: [],
  dependencies: [],
  dependency_count: 0,
  dependent_count: 0,
  comment_count: 0,
  parent: null,
  acceptance_criteria: null,
  external_ref: 'JIRA-1',
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ponytail: React 19's controlled-input quirk — direct `input.value = …`
// doesn't fire `onChange`. Native-setter + dispatch `input` event so
// the component sees the change. Same fix as IssueCreateForm.test.tsx.
const setNativeValue = (
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
) => {
  const proto = Object.getPrototypeOf(el) as object
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
  desc?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('IssueUpdatePanel', () => {
  it('renders all fields pre-populated from the issue prop', async () => {
    const { IssueUpdatePanel } = await importSut()
    render(
      <IssueUpdatePanel
        cwd="/fake"
        issue={baseIssue}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    expect(screen.getByTestId('update-panel')).toBeInTheDocument()
    const titleInput = screen.getByTestId('update-title') as HTMLInputElement
    expect(titleInput.value).toBe('Original title')
    const descTextarea = screen.getByTestId(
      'update-description'
    ) as HTMLTextAreaElement
    expect(descTextarea.value).toBe('Original description')
    const typeSelect = screen.getByTestId('update-type') as HTMLSelectElement
    expect(typeSelect.value).toBe('task')
    const statusSelect = screen.getByTestId(
      'update-status'
    ) as HTMLSelectElement
    expect(statusSelect.value).toBe('open')
    const assigneeInput = screen.getByTestId(
      'update-assignee'
    ) as HTMLInputElement
    expect(assigneeInput.value).toBe('alice')
    const extRefInput = screen.getByTestId(
      'update-external-ref'
    ) as HTMLInputElement
    expect(extRefInput.value).toBe('JIRA-1')
  })

  it('Save button is disabled when no fields are changed', async () => {
    const { IssueUpdatePanel } = await importSut()
    render(
      <IssueUpdatePanel
        cwd="/fake"
        issue={baseIssue}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const save = screen.getByTestId('update-save') as HTMLButtonElement
    expect(save).toBeDisabled()
    expect(mockBdUpdate).not.toHaveBeenCalled()
  })

  it('editing a field enables the Save button', async () => {
    const { IssueUpdatePanel } = await importSut()
    render(
      <IssueUpdatePanel
        cwd="/fake"
        issue={baseIssue}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const titleInput = screen.getByTestId('update-title') as HTMLInputElement
    setNativeValue(titleInput, 'New title')

    const save = screen.getByTestId('update-save') as HTMLButtonElement
    expect(save).not.toBeDisabled()
  })

  it('submitting fires bdUpdate with only the changed fields', async () => {
    mockBdUpdate.mockResolvedValue({
      status: 'ok',
      data: { ...baseIssue, title: 'New title' },
    })
    const { IssueUpdatePanel } = await importSut()
    render(
      <IssueUpdatePanel
        cwd="/repo"
        issue={baseIssue}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const titleInput = screen.getByTestId('update-title') as HTMLInputElement
    setNativeValue(titleInput, 'New title')

    fireEvent.click(screen.getByTestId('update-save'))

    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalledTimes(1)
    })

    const [cwdArg, idArg, inputArg] = mockBdUpdate.mock.calls[0] ?? []
    expect(cwdArg).toBe('/repo')
    expect(idArg).toBe('beads-42')
    // ponytail: only the title is in the input — the dirty-detection
    // contract says "send the minimum diff", so every other field is
    // `undefined`. The Rust side treats `None` as "don't change".
    expect(inputArg).toEqual({ title: 'New title' })
  })

  it('successful update fires onUpdated with the response', async () => {
    const updatedIssue = { ...baseIssue, title: 'New title' }
    mockBdUpdate.mockResolvedValue({ status: 'ok', data: updatedIssue })
    const onUpdated = vi.fn()
    const { IssueUpdatePanel } = await importSut()
    render(
      <IssueUpdatePanel
        cwd="/fake"
        issue={baseIssue}
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />
    )

    const titleInput = screen.getByTestId('update-title') as HTMLInputElement
    setNativeValue(titleInput, 'New title')
    fireEvent.click(screen.getByTestId('update-save'))

    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalledWith(updatedIssue)
    })
  })

  it('shows an inline error when bdUpdate fails', async () => {
    mockBdUpdate.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: 'no write access',
      },
    })
    const onUpdated = vi.fn()
    const { IssueUpdatePanel } = await importSut()
    render(
      <IssueUpdatePanel
        cwd="/fake"
        issue={baseIssue}
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />
    )

    const titleInput = screen.getByTestId('update-title') as HTMLInputElement
    setNativeValue(titleInput, 'New title')
    fireEvent.click(screen.getByTestId('update-save'))

    await waitFor(() => {
      expect(screen.getByTestId('update-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('update-error').textContent).toContain(
      'no write access'
    )
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it('Cancel button is disabled when not dirty and fires onClose when enabled', async () => {
    const onClose = vi.fn()
    const { IssueUpdatePanel } = await importSut()
    render(
      <IssueUpdatePanel
        cwd="/fake"
        issue={baseIssue}
        onClose={onClose}
        onUpdated={vi.fn()}
      />
    )

    const cancel = screen.getByTestId('update-cancel') as HTMLButtonElement
    expect(cancel).toBeDisabled()
    fireEvent.click(cancel)
    // Disabled buttons don't fire onClick, so onClose should not be
    // called from the cancel path. The close (×) button is the
    // always-enabled dismiss path.
    expect(onClose).not.toHaveBeenCalled()

    // Make it dirty, then cancel — onClose fires now.
    const titleInput = screen.getByTestId('update-title') as HTMLInputElement
    setNativeValue(titleInput, 'New title')
    expect(cancel).not.toBeDisabled()
    fireEvent.click(cancel)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not use the accent color anywhere in the rendered output', async () => {
    const { IssueUpdatePanel } = await importSut()
    const { container } = render(
      <IssueUpdatePanel
        cwd="/fake"
        issue={baseIssue}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    // ponytail: AC-14 — the brand colour is reserved for destructive
    // actions and the P0 priority badge only. This panel is purely
    // an edit form, so no surface in the rendered output may reach
    // for the accent.
    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
    expect(html).not.toContain('accent')
  })

  // ponytail: the six remaining fields each need their onChange
  // handler exercised so the per-field branches in `handleSubmit`
  // (lines 131-137) and the dirty-detection OR-chain (lines 104-111)
  // are covered. One explicit test per field — the DOM event types
  // differ (native input, select onChange, radio click), so a single
  // parameterized `setField` helper would be more cryptic than
  // six short tests.

  it('editing the description enables Save and submits only the description', async () => {
    mockBdUpdate.mockResolvedValue({
      status: 'ok',
      data: { ...baseIssue, description: 'New description' },
    })
    const { IssueUpdatePanel } = await importSut()
    render(
      <IssueUpdatePanel
        cwd="/repo"
        issue={baseIssue}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const desc = screen.getByTestId('update-description') as HTMLTextAreaElement
    setNativeValue(desc, 'New description')

    const save = screen.getByTestId('update-save') as HTMLButtonElement
    expect(save).not.toBeDisabled()

    fireEvent.click(save)
    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalledTimes(1)
    })
    expect(mockBdUpdate.mock.calls[0]?.[2]).toEqual({
      description: 'New description',
    })
  })

  it('changing the type enables Save and submits only the type', async () => {
    mockBdUpdate.mockResolvedValue({
      status: 'ok',
      data: { ...baseIssue, issue_type: 'bug' },
    })
    const { IssueUpdatePanel } = await importSut()
    render(
      <IssueUpdatePanel
        cwd="/repo"
        issue={baseIssue}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const typeSelect = screen.getByTestId('update-type') as HTMLSelectElement
    fireEvent.change(typeSelect, { target: { value: 'bug' } })

    const save = screen.getByTestId('update-save') as HTMLButtonElement
    expect(save).not.toBeDisabled()

    fireEvent.click(save)
    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalledTimes(1)
    })
    expect(mockBdUpdate.mock.calls[0]?.[2]).toEqual({ issueType: 'bug' })
  })

  it('clicking a priority radio enables Save and submits only the priority', async () => {
    mockBdUpdate.mockResolvedValue({
      status: 'ok',
      data: { ...baseIssue, priority: 'P1' },
    })
    const { IssueUpdatePanel } = await importSut()
    render(
      <IssueUpdatePanel
        cwd="/repo"
        issue={baseIssue}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    // baseIssue.priority is 'P2' — click P1 to flip it.
    fireEvent.click(screen.getByTestId('update-priority-P1'))

    const save = screen.getByTestId('update-save') as HTMLButtonElement
    expect(save).not.toBeDisabled()

    fireEvent.click(save)
    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalledTimes(1)
    })
    expect(mockBdUpdate.mock.calls[0]?.[2]).toEqual({ priority: 'P1' })
  })

  it('changing the status enables Save and submits only the status', async () => {
    mockBdUpdate.mockResolvedValue({
      status: 'ok',
      data: { ...baseIssue, status: 'in_progress' },
    })
    const { IssueUpdatePanel } = await importSut()
    render(
      <IssueUpdatePanel
        cwd="/repo"
        issue={baseIssue}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const statusSelect = screen.getByTestId(
      'update-status'
    ) as HTMLSelectElement
    fireEvent.change(statusSelect, { target: { value: 'in_progress' } })

    const save = screen.getByTestId('update-save') as HTMLButtonElement
    expect(save).not.toBeDisabled()

    fireEvent.click(save)
    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalledTimes(1)
    })
    expect(mockBdUpdate.mock.calls[0]?.[2]).toEqual({ status: 'in_progress' })
  })

  it('editing the assignee enables Save and submits only the assignee', async () => {
    mockBdUpdate.mockResolvedValue({
      status: 'ok',
      data: { ...baseIssue, owner: 'bob' },
    })
    const { IssueUpdatePanel } = await importSut()
    render(
      <IssueUpdatePanel
        cwd="/repo"
        issue={baseIssue}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const assignee = screen.getByTestId('update-assignee') as HTMLInputElement
    setNativeValue(assignee, 'bob')

    const save = screen.getByTestId('update-save') as HTMLButtonElement
    expect(save).not.toBeDisabled()

    fireEvent.click(save)
    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalledTimes(1)
    })
    expect(mockBdUpdate.mock.calls[0]?.[2]).toEqual({ assignee: 'bob' })
  })

  it('editing the external ref enables Save and submits only the external ref', async () => {
    mockBdUpdate.mockResolvedValue({
      status: 'ok',
      data: { ...baseIssue, external_ref: 'GITHUB-99' },
    })
    const { IssueUpdatePanel } = await importSut()
    render(
      <IssueUpdatePanel
        cwd="/repo"
        issue={baseIssue}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const extRef = screen.getByTestId('update-external-ref') as HTMLInputElement
    setNativeValue(extRef, 'GITHUB-99')

    const save = screen.getByTestId('update-save') as HTMLButtonElement
    expect(save).not.toBeDisabled()

    fireEvent.click(save)
    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalledTimes(1)
    })
    expect(mockBdUpdate.mock.calls[0]?.[2]).toEqual({
      externalRef: 'GITHUB-99',
    })
  })

  it('falls back to empty strings when description/owner/external_ref are null', async () => {
    // ponytail: baseIssue fills all three optional columns, which
    // leaves the `?? ''` fallbacks at lines 89/93/94/101/102/103
    // uncovered on the null path. Render with a fixture that has
    // all three null, then mutate one to confirm the dirty branch
    // still trips on the derived `''` original.
    mockBdUpdate.mockResolvedValue({
      status: 'ok',
      data: { ...baseIssue, description: 'Now non-null' },
    })
    const nullIssue = {
      ...baseIssue,
      description: null,
      owner: null,
      external_ref: null,
    } as unknown as typeof baseIssue
    const { IssueUpdatePanel } = await importSut()
    render(
      <IssueUpdatePanel
        cwd="/repo"
        issue={nullIssue}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const desc = screen.getByTestId('update-description') as HTMLTextAreaElement
    const assignee = screen.getByTestId('update-assignee') as HTMLInputElement
    const extRef = screen.getByTestId('update-external-ref') as HTMLInputElement
    // ponytail: null fields coerce to '' on render so the user
    // sees a stable text input rather than the literal "null".
    expect(desc.value).toBe('')
    expect(assignee.value).toBe('')
    expect(extRef.value).toBe('')

    // Mutating just the description flips dirty on the `?? ''`
    // branch and submits with only the changed field.
    setNativeValue(desc, 'Now non-null')

    const save = screen.getByTestId('update-save') as HTMLButtonElement
    expect(save).not.toBeDisabled()

    fireEvent.click(save)
    await waitFor(() => {
      expect(mockBdUpdate).toHaveBeenCalledTimes(1)
    })
    expect(mockBdUpdate.mock.calls[0]?.[2]).toEqual({
      description: 'Now non-null',
    })
  })

  it('form submission with no dirty state hits the early-return guard', async () => {
    // ponytail: line 126 — `if (!isDirty || updateMutation.isPending) return`.
    // A disabled Save button blocks `click`, but the form's `onSubmit`
    // still fires if we dispatch `submit` directly. This verifies the
    // guard short-circuits before reaching `commands.bdUpdate`.
    const { IssueUpdatePanel } = await importSut()
    render(
      <IssueUpdatePanel
        cwd="/repo"
        issue={baseIssue}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const save = screen.getByTestId('update-save') as HTMLButtonElement
    expect(save).toBeDisabled()

    // ponytail: `save` lives inside the form, and the form has no
    // testid of its own — go through the button's `closest` and
    // narrow to HTMLFormElement so the assertion reads naturally
    // and the call site doesn't need a non-null assertion.
    const form = save.closest('form') as HTMLFormElement
    expect(form).not.toBeNull()
    fireEvent.submit(form)

    // ponytail: the early-return means bdUpdate never resolves
    // (and the mock isn't even configured to). Give React a tick.
    await new Promise(resolve => {
      setTimeout(resolve, 0)
    })
    expect(mockBdUpdate).not.toHaveBeenCalled()
  })

  it('shows the Saving… label while the mutation is in flight', async () => {
    // ponytail: line 299 — the `isPending ? 'Saving…' : 'Save'` ternary.
    // A never-resolving promise keeps the mutation pending; the button
    // label should swap to "Saving…" and the button should disable on
    // the second-clause of `disabled={!isDirty || ...}`.
    let resolveUpdate!: (value: unknown) => void
    mockBdUpdate.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveUpdate = resolve
        })
    )
    const { IssueUpdatePanel } = await importSut()
    render(
      <IssueUpdatePanel
        cwd="/repo"
        issue={baseIssue}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    )

    const titleInput = screen.getByTestId('update-title') as HTMLInputElement
    setNativeValue(titleInput, 'New title')

    const save = screen.getByTestId('update-save') as HTMLButtonElement
    fireEvent.click(save)

    await waitFor(() => {
      expect(save.textContent).toBe('Saving…')
    })
    expect(save).toBeDisabled()

    // ponytail: resolve the promise so React flushes the success
    // state and the test doesn't leak an unresolved handle.
    resolveUpdate({ status: 'ok', data: { ...baseIssue, title: 'New title' } })
  })
})
