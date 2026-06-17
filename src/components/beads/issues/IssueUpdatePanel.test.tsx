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
})
