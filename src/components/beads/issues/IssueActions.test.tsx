/**
 * Tests for the IssueActions component.
 *
 * Contract: IssueActions renders 4 buttons (Close / Reopen / Add
 * Comment / Delete) with visibility based on `issue.status`. The
 * Add Comment button expands a textarea + submit form; the Delete
 * button expands a typed-identifier confirmation panel per AC-4
 * (the Confirm button is enabled only when the typed text matches
 * `issue.id` exactly). Each action fires its corresponding Tauri
 * command and the right callback on success.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'

// ponytail: hoisted so the vi.mock factory can reference the mock fn.
// All four commands return controllable payloads so we can drive
// the happy path and the mutation-error path from individual tests.
const { mockBdClose, mockBdReopen, mockBdAddComment, mockBdDelete } =
  vi.hoisted(() => ({
    mockBdClose: vi.fn(),
    mockBdReopen: vi.fn(),
    mockBdAddComment: vi.fn(),
    mockBdDelete: vi.fn(),
  }))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdClose: mockBdClose,
    bdReopen: mockBdReopen,
    bdAddComment: mockBdAddComment,
    bdDelete: mockBdDelete,
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

const importSut = () => import('./IssueActions')

function makeIssue(
  overrides: Partial<{
    id: string
    status: 'open' | 'in_progress' | 'blocked' | 'closed' | 'deferred'
    title: string
  }> = {}
) {
  return {
    id: overrides.id ?? 'beads-42',
    title: overrides.title ?? 'Ship T23-T26',
    status: overrides.status ?? ('open' as const),
    priority: 'P2' as const,
    issue_type: 'task' as const,
    created_at: '2026-06-17T10:00:00Z',
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
}

const closedIssue = {
  id: 'beads-42',
  title: 'Done',
  status: 'closed' as const,
  priority: 'P2' as const,
  issue_type: 'task' as const,
  created_at: '2026-06-17T10:00:00Z',
  updated_at: '2026-06-17T10:05:00Z',
  closed_at: '2026-06-17T10:05:00Z',
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

describe('IssueActions', () => {
  it('renders Close + Add Comment + Delete for an open issue, no Reopen', async () => {
    mockBdClose.mockResolvedValue({ status: 'ok', data: null })
    mockBdReopen.mockResolvedValue({ status: 'ok', data: null })
    mockBdAddComment.mockResolvedValue({ status: 'ok', data: null })
    mockBdDelete.mockResolvedValue({ status: 'ok', data: null })

    const { IssueActions } = await importSut()
    render(
      <IssueActions
        cwd="/repo"
        issue={makeIssue({ status: 'open' })}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
        onCommentAdded={vi.fn()}
      />
    )

    expect(screen.getByTestId('action-close')).toBeInTheDocument()
    expect(screen.queryByTestId('action-reopen')).not.toBeInTheDocument()
    expect(screen.getByTestId('action-add-comment')).toBeInTheDocument()
    expect(screen.getByTestId('action-delete')).toBeInTheDocument()
  })

  it('renders Reopen + Add Comment + Delete for a closed issue, no Close', async () => {
    mockBdClose.mockResolvedValue({ status: 'ok', data: null })
    mockBdReopen.mockResolvedValue({ status: 'ok', data: null })
    mockBdAddComment.mockResolvedValue({ status: 'ok', data: null })
    mockBdDelete.mockResolvedValue({ status: 'ok', data: null })

    const { IssueActions } = await importSut()
    render(
      <IssueActions
        cwd="/repo"
        issue={closedIssue}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
        onCommentAdded={vi.fn()}
      />
    )

    expect(screen.queryByTestId('action-close')).not.toBeInTheDocument()
    expect(screen.getByTestId('action-reopen')).toBeInTheDocument()
    expect(screen.getByTestId('action-add-comment')).toBeInTheDocument()
    expect(screen.getByTestId('action-delete')).toBeInTheDocument()
  })

  it('clicking Close fires bdClose and onUpdated', async () => {
    const updated = makeIssue({ status: 'closed' })
    mockBdClose.mockResolvedValue({ status: 'ok', data: updated })
    const onUpdated = vi.fn()

    const { IssueActions } = await importSut()
    render(
      <IssueActions
        cwd="/repo"
        issue={makeIssue({ status: 'open' })}
        onUpdated={onUpdated}
        onDeleted={vi.fn()}
        onCommentAdded={vi.fn()}
      />
    )

    await userEvent.setup().click(screen.getByTestId('action-close'))

    await waitFor(() => {
      expect(mockBdClose).toHaveBeenCalledWith('/repo', 'beads-42')
    })
    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalledWith(updated)
    })
  })

  it('clicking Reopen fires bdReopen and onUpdated', async () => {
    const reopened = makeIssue({ status: 'open' })
    mockBdReopen.mockResolvedValue({ status: 'ok', data: reopened })
    const onUpdated = vi.fn()

    const { IssueActions } = await importSut()
    render(
      <IssueActions
        cwd="/repo"
        issue={closedIssue}
        onUpdated={onUpdated}
        onDeleted={vi.fn()}
        onCommentAdded={vi.fn()}
      />
    )

    await userEvent.setup().click(screen.getByTestId('action-reopen'))

    await waitFor(() => {
      expect(mockBdReopen).toHaveBeenCalledWith('/repo', 'beads-42')
    })
    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalledWith(reopened)
    })
  })

  it('clicking Add Comment expands the form; submitting fires bdAddComment and onCommentAdded', async () => {
    mockBdAddComment.mockResolvedValue({ status: 'ok', data: null })
    const onCommentAdded = vi.fn()

    const { IssueActions } = await importSut()
    const user = userEvent.setup()
    render(
      <IssueActions
        cwd="/repo"
        issue={makeIssue({ status: 'open' })}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
        onCommentAdded={onCommentAdded}
      />
    )

    // Form is collapsed by default.
    expect(screen.queryByTestId('add-comment-form')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('action-add-comment'))

    // Form is now visible.
    expect(screen.getByTestId('add-comment-form')).toBeInTheDocument()
    expect(screen.getByTestId('add-comment-textarea')).toBeInTheDocument()

    // Type a comment and submit.
    const textarea = screen.getByTestId('add-comment-textarea')
    await user.type(textarea, 'Looks good')
    await user.click(screen.getByTestId('add-comment-submit'))

    await waitFor(() => {
      expect(mockBdAddComment).toHaveBeenCalledWith(
        '/repo',
        'beads-42',
        'Looks good'
      )
    })
    await waitFor(() => {
      expect(onCommentAdded).toHaveBeenCalledTimes(1)
    })

    // Form collapses on success.
    await waitFor(() => {
      expect(screen.queryByTestId('add-comment-form')).not.toBeInTheDocument()
    })
  })

  it('clicking Delete shows the confirmation panel; typing the correct id enables Confirm', async () => {
    mockBdDelete.mockResolvedValue({ status: 'ok', data: null })

    const { IssueActions } = await importSut()
    const user = userEvent.setup()
    render(
      <IssueActions
        cwd="/repo"
        issue={makeIssue({ id: 'beads-42', status: 'open' })}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
        onCommentAdded={vi.fn()}
      />
    )

    // Panel is hidden initially.
    expect(screen.queryByTestId('delete-confirm')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('action-delete'))

    // Panel is now visible, confirm button is disabled.
    expect(screen.getByTestId('delete-confirm')).toBeInTheDocument()
    expect(screen.getByTestId('delete-confirm-target').textContent).toBe(
      'beads-42'
    )
    const confirmButton = screen.getByTestId('delete-confirm-button')
    expect(confirmButton).toBeDisabled()

    // Typing the wrong text keeps it disabled.
    const input = screen.getByTestId('delete-confirm-input')
    await user.type(input, 'beads-99')
    expect(confirmButton).toBeDisabled()

    // Clearing and typing the right id enables it.
    await user.clear(input)
    await user.type(input, 'beads-42')
    expect(confirmButton).not.toBeDisabled()
  })

  it('clicking Confirm with the wrong typed id does NOT fire bdDelete', async () => {
    mockBdDelete.mockResolvedValue({ status: 'ok', data: null })

    const { IssueActions } = await importSut()
    const user = userEvent.setup()
    render(
      <IssueActions
        cwd="/repo"
        issue={makeIssue({ id: 'beads-42', status: 'open' })}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
        onCommentAdded={vi.fn()}
      />
    )

    await user.click(screen.getByTestId('action-delete'))
    const input = screen.getByTestId('delete-confirm-input')
    await user.type(input, 'beads-99')
    const confirmButton = screen.getByTestId('delete-confirm-button')

    // AC-4: the button is disabled when the text doesn't match.
    // Belt-and-suspenders: even a programmatic click doesn't fire.
    expect(confirmButton).toBeDisabled()
    await user.click(confirmButton)

    // The mutation was not invoked.
    expect(mockBdDelete).not.toHaveBeenCalled()
  })

  it('clicking Confirm with the correct typed id fires bdDelete and onDeleted', async () => {
    mockBdDelete.mockResolvedValue({ status: 'ok', data: null })
    const onDeleted = vi.fn()

    const { IssueActions } = await importSut()
    const user = userEvent.setup()
    render(
      <IssueActions
        cwd="/repo"
        issue={makeIssue({ id: 'beads-42', status: 'open' })}
        onUpdated={vi.fn()}
        onDeleted={onDeleted}
        onCommentAdded={vi.fn()}
      />
    )

    await user.click(screen.getByTestId('action-delete'))
    const input = screen.getByTestId('delete-confirm-input')
    await user.type(input, 'beads-42')
    await user.click(screen.getByTestId('delete-confirm-button'))

    await waitFor(() => {
      expect(mockBdDelete).toHaveBeenCalledWith('/repo', 'beads-42')
    })
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledWith('beads-42')
    })
  })

  it('mutation error surfaces in the actions-error alert with the stderr', async () => {
    mockBdClose.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: 'no workspace',
      },
    })

    const { IssueActions } = await importSut()
    const user = userEvent.setup()
    render(
      <IssueActions
        cwd="/repo"
        issue={makeIssue({ status: 'open' })}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
        onCommentAdded={vi.fn()}
      />
    )

    await user.click(screen.getByTestId('action-close'))

    await waitFor(() => {
      expect(screen.getByTestId('actions-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('actions-error').textContent).toContain(
      'no workspace'
    )
  })
})
