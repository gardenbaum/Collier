/**
 * Tests for the IssueCreateForm modal.
 *
 * Contract: IssueCreateForm captures the v1 `bd create` surface
 * (title, description, type, priority, assignee, labels, external_ref),
 * validates the title is non-empty, and submits via
 * `commands.bdCreate(cwd, input)`. On success it fires
 * `onCreated(issueId)`; on error it shows an inline error with a
 * retry button.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'

// ponytail: hoisted so the vi.mock factory can reference the mock fn.
// Same pattern as ReadyView.test.tsx — global setup.ts mock doesn't
// include `bdCreate` (it predates T21), so the per-test mock is
// necessary.
const { mockBdCreate } = vi.hoisted(() => ({
  mockBdCreate: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdCreate: mockBdCreate,
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

const importSut = () => import('./IssueCreateForm')

const newIssue = {
  id: 'beads-42',
  title: 'Test',
  status: 'open' as const,
  priority: 'P1' as const,
  issue_type: 'bug' as const,
  created_at: '2026-06-17T00:00:00Z',
  updated_at: null,
  closed_at: null,
  description: null,
  owner: null,
  labels: [],
  dependencies: [],
  dependency_count: 0,
  dependent_count: 0,
  comment_count: 0,
  parent: null,
  acceptance_criteria: null,
  external_ref: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ponytail: React 19's controlled-input quirk — direct `input.value = …`
// doesn't fire `onChange`. Use the native-setter pattern + dispatch
// an `input` event so the component sees the change. Documented in
// the T19 search-view tests; the same fix applies here.
const setNativeValue = (
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
) => {
  const proto = Object.getPrototypeOf(el) as object
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
  desc?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

const setNativeSelect = (el: HTMLSelectElement, value: string) => {
  const proto = Object.getPrototypeOf(el) as object
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
  desc?.set?.call(el, value)
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('IssueCreateForm', () => {
  it('renders all fields and the create / cancel buttons', async () => {
    const { IssueCreateForm } = await importSut()
    render(
      <IssueCreateForm cwd="/fake" onClose={vi.fn()} onCreated={vi.fn()} />
    )

    expect(screen.getByTestId('create-form')).toBeInTheDocument()
    expect(screen.getByTestId('create-title')).toBeInTheDocument()
    expect(screen.getByTestId('create-description')).toBeInTheDocument()
    expect(screen.getByTestId('create-type')).toBeInTheDocument()
    expect(screen.getByTestId('create-priority-P0')).toBeInTheDocument()
    expect(screen.getByTestId('create-priority-P1')).toBeInTheDocument()
    expect(screen.getByTestId('create-priority-P2')).toBeInTheDocument()
    expect(screen.getByTestId('create-priority-P3')).toBeInTheDocument()
    expect(screen.getByTestId('create-priority-P4')).toBeInTheDocument()
    expect(screen.getByTestId('create-assignee')).toBeInTheDocument()
    expect(screen.getByTestId('create-labels-input')).toBeInTheDocument()
    expect(screen.getByTestId('create-external-ref')).toBeInTheDocument()
    expect(screen.getByTestId('create-submit')).toBeInTheDocument()
    expect(screen.getByTestId('create-cancel')).toBeInTheDocument()
  })

  it('shows a title-required validation error when submitting empty', async () => {
    const { IssueCreateForm } = await importSut()
    render(
      <IssueCreateForm cwd="/fake" onClose={vi.fn()} onCreated={vi.fn()} />
    )

    // Click Create without typing a title.
    fireEvent.click(screen.getByTestId('create-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('create-title-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('create-title-error').textContent).toBe(
      'Title is required'
    )

    // No mutation should have been invoked.
    expect(mockBdCreate).not.toHaveBeenCalled()
  })

  it('submits the form values via commands.bdCreate', async () => {
    mockBdCreate.mockResolvedValue({ status: 'ok', data: newIssue })
    const onCreated = vi.fn()
    const { IssueCreateForm } = await importSut()
    render(
      <IssueCreateForm cwd="/repo" onClose={vi.fn()} onCreated={onCreated} />
    )

    // Title is the only required field; fill it and a few optional ones.
    const titleInput = screen.getByTestId('create-title') as HTMLInputElement
    setNativeValue(titleInput, 'Test issue')

    const descTextarea = screen.getByTestId(
      'create-description'
    ) as HTMLTextAreaElement
    setNativeValue(descTextarea, 'Description body')

    // Type select: change to "bug".
    setNativeSelect(
      screen.getByTestId('create-type') as HTMLSelectElement,
      'bug'
    )

    // Priority: click P1 button.
    fireEvent.click(screen.getByTestId('create-priority-P1'))

    // Assignee + external ref + one label.
    setNativeValue(
      screen.getByTestId('create-assignee') as HTMLInputElement,
      'alice'
    )
    const labelInput = screen.getByTestId(
      'create-labels-input'
    ) as HTMLInputElement
    setNativeValue(labelInput, 'urgent')
    fireEvent.keyDown(labelInput, { key: 'Enter' })
    setNativeValue(
      screen.getByTestId('create-external-ref') as HTMLInputElement,
      'JIRA-1'
    )

    fireEvent.click(screen.getByTestId('create-submit'))

    await waitFor(() => {
      expect(mockBdCreate).toHaveBeenCalledTimes(1)
    })

    const [cwdArg, inputArg] = mockBdCreate.mock.calls[0] ?? []
    expect(cwdArg).toBe('/repo')
    expect(inputArg).toEqual({
      title: 'Test issue',
      description: 'Description body',
      issueType: 'bug',
      priority: 'P1',
      assignee: 'alice',
      labels: ['urgent'],
      externalRef: 'JIRA-1',
    })
  })

  it('fires onCreated with the new issue id on a successful submit', async () => {
    mockBdCreate.mockResolvedValue({ status: 'ok', data: newIssue })
    const onCreated = vi.fn()
    const onClose = vi.fn()
    const { IssueCreateForm } = await importSut()
    render(
      <IssueCreateForm cwd="/fake" onClose={onClose} onCreated={onCreated} />
    )

    const titleInput = screen.getByTestId('create-title') as HTMLInputElement
    setNativeValue(titleInput, 'X')
    fireEvent.click(screen.getByTestId('create-submit'))

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith('beads-42')
    })
    // The modal is expected to be dismissed by the parent (via the
    // onClose callback or by re-rendering without the form); we just
    // assert the success callback fired.
  })

  it('shows an inline error and a retry button when bdCreate fails', async () => {
    mockBdCreate.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: 'no workspace',
      },
    })
    const { IssueCreateForm } = await importSut()
    render(
      <IssueCreateForm cwd="/fake" onClose={vi.fn()} onCreated={vi.fn()} />
    )

    const titleInput = screen.getByTestId('create-title') as HTMLInputElement
    setNativeValue(titleInput, 'X')
    fireEvent.click(screen.getByTestId('create-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('create-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('create-error').textContent).toContain(
      'no workspace'
    )
    expect(screen.getByTestId('create-retry')).toBeInTheDocument()

    // Clicking retry re-invokes bdCreate.
    fireEvent.click(screen.getByTestId('create-retry'))
    await waitFor(() => {
      expect(mockBdCreate).toHaveBeenCalledTimes(2)
    })
  })

  it('fires onClose when the cancel button is clicked', async () => {
    const onClose = vi.fn()
    const { IssueCreateForm } = await importSut()
    render(
      <IssueCreateForm cwd="/fake" onClose={onClose} onCreated={vi.fn()} />
    )

    fireEvent.click(screen.getByTestId('create-cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
    // No mutation should have been triggered.
    expect(mockBdCreate).not.toHaveBeenCalled()
  })
})
