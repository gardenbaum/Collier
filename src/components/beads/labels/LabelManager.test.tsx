/**
 * Tests for `LabelManager` (task 34).
 *
 * Contract: LabelManager reads `Issue.labels`, exposes add/remove
 * via the `bdLabelAdd` / `bdLabelRemove` mutations, and offers a
 * propagate flow that calls `bdLabelPropagate` after explicit
 * confirmation. The `bdLabelListAll` query populates a `<datalist>`
 * for native autocomplete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'

const {
  mockBdLabelAdd,
  mockBdLabelRemove,
  mockBdLabelPropagate,
  mockBdLabelListAll,
} = vi.hoisted(() => ({
  mockBdLabelAdd: vi.fn(),
  mockBdLabelRemove: vi.fn(),
  mockBdLabelPropagate: vi.fn(),
  mockBdLabelListAll: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdLabelAdd: mockBdLabelAdd,
    bdLabelRemove: mockBdLabelRemove,
    bdLabelPropagate: mockBdLabelPropagate,
    bdLabelListAll: mockBdLabelListAll,
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

const importSut = () => import('./LabelManager')

const issueWithLabels = {
  id: 'beads-1',
  title: 'Wire labels',
  status: 'open' as const,
  priority: 'P2' as const,
  issue_type: 'task' as const,
  created_at: '2026-06-16T00:00:00Z',
  updated_at: null,
  closed_at: null,
  description: null,
  owner: null,
  labels: [
    { name: 'bug', color: null },
    { name: 'priority-high', color: null },
  ],
  dependencies: [],
  dependency_count: 0,
  dependent_count: 0,
  comment_count: 0,
  parent: null,
  acceptance_criteria: null,
  external_ref: null,
}

const issueWithoutLabels = {
  ...issueWithLabels,
  id: 'beads-2',
  title: 'Empty',
  labels: [],
}

const issueWithChildren = {
  ...issueWithLabels,
  id: 'beads-3',
  title: 'Has children',
  dependency_count: 3,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LabelManager', () => {
  it('renders one LabelChip per label on the issue', async () => {
    mockBdLabelListAll.mockResolvedValue({ status: 'ok', data: [] })

    const { LabelManager } = await importSut()
    render(<LabelManager cwd="/repo" issue={issueWithLabels} />)

    expect(screen.getByTestId('label-manager')).toBeInTheDocument()
    const chips = screen.getAllByTestId('label-chip')
    expect(chips).toHaveLength(2)
    expect(chips[0]?.getAttribute('data-label')).toBe('bug')
    expect(chips[1]?.getAttribute('data-label')).toBe('priority-high')
  })

  it('renders the empty state when the issue has no labels', async () => {
    mockBdLabelListAll.mockResolvedValue({ status: 'ok', data: [] })

    const { LabelManager } = await importSut()
    render(<LabelManager cwd="/repo" issue={issueWithoutLabels} />)

    expect(screen.getByTestId('label-manager-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('label-chip')).not.toBeInTheDocument()
  })

  it('add: typing a label and pressing Enter invokes bdLabelAdd', async () => {
    mockBdLabelListAll.mockResolvedValue({
      status: 'ok',
      data: [{ label: 'priority-high', count: 1 }],
    })
    mockBdLabelAdd.mockResolvedValue({ status: 'ok', data: null })

    const { LabelManager } = await importSut()
    render(<LabelManager cwd="/repo" issue={issueWithoutLabels} />)

    const input = screen.getByTestId('label-manager-add-input')
    await userEvent.type(input, 'priority-high')
    await userEvent.keyboard('{Enter}')

    await waitFor(() => {
      expect(mockBdLabelAdd).toHaveBeenCalledWith(
        '/repo',
        'beads-2',
        'priority-high'
      )
    })
  })

  it('remove: clicking the chip × invokes bdLabelRemove', async () => {
    mockBdLabelListAll.mockResolvedValue({ status: 'ok', data: [] })
    mockBdLabelRemove.mockResolvedValue({ status: 'ok', data: null })

    const { LabelManager } = await importSut()
    render(<LabelManager cwd="/repo" issue={issueWithLabels} />)

    const removeButtons = screen.getAllByRole('button', {
      name: /Remove label bug/,
    })
    const [firstRemove] = removeButtons
    if (!firstRemove) throw new Error('expected a remove button')
    await userEvent.click(firstRemove)

    await waitFor(() => {
      expect(mockBdLabelRemove).toHaveBeenCalledWith('/repo', 'beads-1', 'bug')
    })
  })

  it('propagate: hidden when the issue has no children, shown when it does', async () => {
    mockBdLabelListAll.mockResolvedValue({ status: 'ok', data: [] })

    const { LabelManager } = await importSut()
    const { rerender } = render(
      <LabelManager cwd="/repo" issue={issueWithLabels} />
    )
    // dependency_count is 0 on issueWithLabels — the toggle is hidden.
    expect(
      screen.queryByTestId('label-manager-propagate-toggle')
    ).not.toBeInTheDocument()

    rerender(<LabelManager cwd="/repo" issue={issueWithChildren} />)
    expect(
      screen.getByTestId('label-manager-propagate-toggle')
    ).toBeInTheDocument()
  })

  it('propagate: opens the confirm panel and only invokes bdLabelPropagate after Confirm', async () => {
    mockBdLabelListAll.mockResolvedValue({ status: 'ok', data: [] })
    mockBdLabelPropagate.mockResolvedValue({
      status: 'ok',
      data: { added: 2, skipped: 1, errors: [] },
    })

    const { LabelManager } = await importSut()
    render(<LabelManager cwd="/repo" issue={issueWithChildren} />)

    // The toggle opens the panel but does NOT call the command yet.
    await userEvent.click(screen.getByTestId('label-manager-propagate-toggle'))
    expect(mockBdLabelPropagate).not.toHaveBeenCalled()
    expect(
      screen.getByTestId('label-manager-propagate-panel')
    ).toBeInTheDocument()

    // Type a label and confirm.
    const propagateInput = screen.getByTestId('label-manager-propagate-input')
    await userEvent.type(propagateInput, 'branch:auth')
    await userEvent.click(screen.getByTestId('label-manager-propagate-confirm'))

    await waitFor(() => {
      expect(mockBdLabelPropagate).toHaveBeenCalledWith(
        '/repo',
        'beads-3',
        'branch:auth'
      )
    })
  })

  it('propagate: Cancel collapses the panel without invoking the command', async () => {
    mockBdLabelListAll.mockResolvedValue({ status: 'ok', data: [] })
    mockBdLabelPropagate.mockResolvedValue({
      status: 'ok',
      data: { added: 0, skipped: 0, errors: [] },
    })

    const { LabelManager } = await importSut()
    render(<LabelManager cwd="/repo" issue={issueWithChildren} />)

    await userEvent.click(screen.getByTestId('label-manager-propagate-toggle'))
    expect(
      screen.getByTestId('label-manager-propagate-panel')
    ).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('label-manager-propagate-cancel'))

    expect(mockBdLabelPropagate).not.toHaveBeenCalled()
    expect(
      screen.queryByTestId('label-manager-propagate-panel')
    ).not.toBeInTheDocument()
    expect(
      screen.getByTestId('label-manager-propagate-toggle')
    ).toBeInTheDocument()
  })

  it('add: empty input keeps the submit button disabled', async () => {
    mockBdLabelListAll.mockResolvedValue({ status: 'ok', data: [] })

    const { LabelManager } = await importSut()
    render(<LabelManager cwd="/repo" issue={issueWithoutLabels} />)

    const submit = screen.getByTestId('label-manager-add-submit')
    expect(submit).toBeDisabled()
  })

  it('list-all query populates the autocomplete datalist', async () => {
    mockBdLabelListAll.mockResolvedValue({
      status: 'ok',
      data: [
        { label: 'bug', count: 3 },
        { label: 'priority-high', count: 1 },
      ],
    })

    const { LabelManager } = await importSut()
    render(<LabelManager cwd="/repo" issue={issueWithLabels} />)

    await waitFor(() => {
      const datalist = document.getElementById(
        'label-manager-add-input-datalist'
      )
      expect(datalist).toBeInTheDocument()
      const options = datalist?.querySelectorAll('option')
      expect(options).toHaveLength(2)
      expect(options?.[0]?.getAttribute('value')).toBe('bug')
      expect(options?.[1]?.getAttribute('value')).toBe('priority-high')
    })
  })
})
