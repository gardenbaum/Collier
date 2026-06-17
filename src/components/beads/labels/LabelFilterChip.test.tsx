/**
 * Tests for `LabelFilterChip` (task 36).
 *
 * Contract: LabelFilterChip reads the active `labels` array from
 * `useIssueFilterStore` and renders one chip per active label.
 * Clicking a chip's `×` calls `toggleLabel`, which removes the
 * label from the store. The component renders nothing when the
 * store's `labels` array is empty.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { useIssueFilterStore } from '@/store/issue-filter-store'

const importSut = () => import('./LabelFilterChip')

beforeEach(() => {
  act(() => {
    useIssueFilterStore.getState().clearAll()
  })
})

describe('LabelFilterChip', () => {
  it('renders nothing when the store has no active labels', async () => {
    const { LabelFilterChip } = await importSut()
    const { container } = render(<LabelFilterChip />)
    expect(container.firstChild).toBeNull()
    expect(
      screen.queryByTestId('label-filter-chip-bar')
    ).not.toBeInTheDocument()
  })

  it('renders one chip per active label from the store', async () => {
    act(() => {
      useIssueFilterStore.getState().toggleLabel('bug')
      useIssueFilterStore.getState().toggleLabel('priority-high')
    })

    const { LabelFilterChip } = await importSut()
    render(<LabelFilterChip />)

    const chips = screen.getAllByTestId('label-filter-chip')
    expect(chips).toHaveLength(2)
    expect(chips[0]?.getAttribute('data-label')).toBe('bug')
    expect(chips[1]?.getAttribute('data-label')).toBe('priority-high')
    expect(screen.getByTestId('label-filter-chip-bar')).toBeInTheDocument()
  })

  it('clicking a chip × removes that label from the store', async () => {
    act(() => {
      useIssueFilterStore.getState().toggleLabel('bug')
      useIssueFilterStore.getState().toggleLabel('priority-high')
    })

    const { LabelFilterChip } = await importSut()
    render(<LabelFilterChip />)

    const bugRemove = screen.getByRole('button', {
      name: /Remove filter for bug/,
    })
    await userEvent.click(bugRemove)

    const remaining = useIssueFilterStore.getState().labels
    expect(remaining).toEqual(['priority-high'])
    // After removal, the bug chip is gone and only the priority-high
    // chip remains.
    const chips = screen.getAllByTestId('label-filter-chip')
    expect(chips).toHaveLength(1)
    expect(chips[0]?.getAttribute('data-label')).toBe('priority-high')
  })

  it('hides the chip bar entirely when the last label is removed', async () => {
    act(() => {
      useIssueFilterStore.getState().toggleLabel('bug')
    })

    const { LabelFilterChip } = await importSut()
    render(<LabelFilterChip />)

    expect(screen.getByTestId('label-filter-chip-bar')).toBeInTheDocument()

    const remove = screen.getByRole('button', {
      name: /Remove filter for bug/,
    })
    await userEvent.click(remove)

    expect(
      screen.queryByTestId('label-filter-chip-bar')
    ).not.toBeInTheDocument()
  })
})
