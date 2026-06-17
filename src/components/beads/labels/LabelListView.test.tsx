/**
 * Tests for `LabelListView` (task 35).
 *
 * Contract: LabelListView calls `commands.bdLabelListAll(cwd)`,
 * shows a loading skeleton while the query is pending, shows an
 * error state on failure, and renders one row per
 * `LabelWithCount` on success. The search input filters rows by
 * case-insensitive substring match on the label name.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'

const { mockBdLabelListAll } = vi.hoisted(() => ({
  mockBdLabelListAll: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
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

const importSut = () => import('./LabelListView')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LabelListView', () => {
  it('renders a loading skeleton while the query is pending', async () => {
    mockBdLabelListAll.mockReturnValue(new Promise<never>(() => undefined))

    const { LabelListView } = await importSut()
    render(<LabelListView cwd="/repo" />)

    expect(screen.getByTestId('label-list-view')).toBeInTheDocument()
    expect(screen.getByTestId('label-list-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('label-list-rows')).not.toBeInTheDocument()
    expect(screen.queryByTestId('label-list-empty')).not.toBeInTheDocument()
  })

  it('calls bdLabelListAll with the provided cwd', async () => {
    mockBdLabelListAll.mockResolvedValue({ status: 'ok', data: [] })

    const { LabelListView } = await importSut()
    render(<LabelListView cwd="/repo/path" />)

    await waitFor(() => {
      expect(mockBdLabelListAll).toHaveBeenCalledWith('/repo/path')
    })
  })

  it('renders one row per label with the usage count on the right', async () => {
    mockBdLabelListAll.mockResolvedValue({
      status: 'ok',
      data: [
        { label: 'bug', count: 5 },
        { label: 'priority-high', count: 2 },
        { label: 'regression', count: 1 },
      ],
    })

    const { LabelListView } = await importSut()
    render(<LabelListView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('label-list-rows')).toBeInTheDocument()
    })

    const rows = screen.getAllByTestId('label-list-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]?.getAttribute('data-label')).toBe('bug')
    expect(rows[0]?.getAttribute('data-count')).toBe('5')
    expect(rows[1]?.getAttribute('data-label')).toBe('priority-high')
    expect(rows[1]?.getAttribute('data-count')).toBe('2')
    expect(rows[2]?.getAttribute('data-label')).toBe('regression')
    expect(rows[2]?.getAttribute('data-count')).toBe('1')

    // Heading shows the count.
    expect(
      screen.getByRole('heading', { name: /Labels \(3\)/ })
    ).toBeInTheDocument()
  })

  it('renders the empty state when the result is an empty array', async () => {
    mockBdLabelListAll.mockResolvedValue({ status: 'ok', data: [] })

    const { LabelListView } = await importSut()
    render(<LabelListView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('label-list-empty')).toBeInTheDocument()
    })
    expect(screen.getByText('No labels yet.')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Labels \(0\)/ })
    ).toBeInTheDocument()
  })

  it('renders the error state when bdLabelListAll returns an error', async () => {
    mockBdLabelListAll.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: 'no workspace',
      },
    })

    const { LabelListView } = await importSut()
    render(<LabelListView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('label-list-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('label-list-error').textContent).toContain(
      'no workspace'
    )
    expect(screen.queryByTestId('label-list-rows')).not.toBeInTheDocument()
    expect(screen.queryByTestId('label-list-empty')).not.toBeInTheDocument()
  })

  it('search filters rows by case-insensitive substring on the label name', async () => {
    mockBdLabelListAll.mockResolvedValue({
      status: 'ok',
      data: [
        { label: 'bug', count: 5 },
        { label: 'priority-high', count: 2 },
        { label: 'regression', count: 1 },
      ],
    })

    const { LabelListView } = await importSut()
    render(<LabelListView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('label-list-rows')).toBeInTheDocument()
    })

    const search = screen.getByTestId('label-list-search')
    await userEvent.type(search, 'bug')

    await waitFor(() => {
      const rows = screen.getAllByTestId('label-list-row')
      expect(rows).toHaveLength(1)
      expect(rows[0]?.getAttribute('data-label')).toBe('bug')
    })
    // Heading count follows the filter.
    expect(
      screen.getByRole('heading', { name: /Labels \(1\)/ })
    ).toBeInTheDocument()
  })

  it('empty search shows all rows', async () => {
    mockBdLabelListAll.mockResolvedValue({
      status: 'ok',
      data: [
        { label: 'bug', count: 5 },
        { label: 'priority-high', count: 2 },
      ],
    })

    const { LabelListView } = await importSut()
    render(<LabelListView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('label-list-rows')).toBeInTheDocument()
    })

    await userEvent.type(
      screen.getByTestId('label-list-search'),
      'nothing-matches'
    )

    await waitFor(() => {
      expect(screen.getByTestId('label-list-empty')).toBeInTheDocument()
    })
    expect(
      screen.getByText('No labels match the current search.')
    ).toBeInTheDocument()
  })
})
