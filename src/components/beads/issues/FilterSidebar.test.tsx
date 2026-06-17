/**
 * Tests for the FilterSidebar component + issue-filter store.
 *
 * Contract:
 *  - renders all 5 filter sections (status, priority, type, labels, assignees)
 *  - clicking a checkbox toggles the corresponding dimension in the store
 *  - "Clear all" resets every dimension to empty and the button disables
 *  - count badge reflects the store's array length per dimension
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { FilterSidebar } from './FilterSidebar'
import { useIssueFilterStore } from '@/store/issue-filter-store'

// ponytail: persist middleware writes the filter slice to localStorage.
// Each test needs a clean slate, so we reset both the in-memory state
// AND the localStorage entry. `clearStorage()` is the persist API for
// the latter.
beforeEach(() => {
  useIssueFilterStore.getState().clearAll()
  useIssueFilterStore.persist.clearStorage()
  // Re-seed after clear so the next test starts from EMPTY, not from
  // whatever localStorage had on disk.
  useIssueFilterStore.setState({
    status: [],
    priority: [],
    type: [],
    labels: [],
    assignees: [],
  })
})

describe('FilterSidebar', () => {
  it('renders all 5 filter sections', () => {
    render(<FilterSidebar />)

    expect(screen.getByTestId('filter-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('status-section')).toBeInTheDocument()
    expect(screen.getByTestId('priority-section')).toBeInTheDocument()
    expect(screen.getByTestId('type-section')).toBeInTheDocument()
    expect(screen.getByTestId('labels-section')).toBeInTheDocument()
    expect(screen.getByTestId('assignees-section')).toBeInTheDocument()

    // Each non-empty section renders its full option set.
    expect(screen.getByTestId('status-option-open')).toBeInTheDocument()
    expect(screen.getByTestId('status-option-in_progress')).toBeInTheDocument()
    expect(screen.getByTestId('status-option-blocked')).toBeInTheDocument()
    expect(screen.getByTestId('status-option-closed')).toBeInTheDocument()
    expect(screen.getByTestId('status-option-deferred')).toBeInTheDocument()

    expect(screen.getByTestId('priority-option-P0')).toBeInTheDocument()
    expect(screen.getByTestId('priority-option-P4')).toBeInTheDocument()

    expect(screen.getByTestId('type-option-bug')).toBeInTheDocument()
    expect(screen.getByTestId('type-option-gate')).toBeInTheDocument()
  })

  it('shows "No labels yet" / "No assignees yet" placeholders by default', () => {
    render(<FilterSidebar />)

    expect(screen.getByTestId('labels-empty')).toHaveTextContent(
      'No labels yet'
    )
    expect(screen.getByTestId('assignees-empty')).toHaveTextContent(
      'No assignees yet'
    )
  })

  it('renders label + assignee options when props are provided', () => {
    render(
      <FilterSidebar
        labels={['urgent', 'tech-debt']}
        assignees={['alice', 'bob']}
      />
    )

    expect(screen.getByTestId('label-option-urgent')).toBeInTheDocument()
    expect(screen.getByTestId('label-option-tech-debt')).toBeInTheDocument()
    expect(screen.getByTestId('assignee-option-alice')).toBeInTheDocument()
    expect(screen.getByTestId('assignee-option-bob')).toBeInTheDocument()
    expect(screen.queryByTestId('labels-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('assignees-empty')).not.toBeInTheDocument()
  })

  it('clicking a status checkbox toggles it in the store', () => {
    render(<FilterSidebar />)

    fireEvent.click(screen.getByTestId('status-option-open'))
    expect(useIssueFilterStore.getState().status).toEqual(['open'])

    // Click again → toggle off.
    fireEvent.click(screen.getByTestId('status-option-open'))
    expect(useIssueFilterStore.getState().status).toEqual([])

    // Click a different status → adds to the array.
    fireEvent.click(screen.getByTestId('status-option-blocked'))
    expect(useIssueFilterStore.getState().status).toEqual(['blocked'])
  })

  it('count badge reflects the store state per dimension', () => {
    render(<FilterSidebar />)

    // Initially every section shows (0).
    expect(
      screen.getByRole('heading', { name: /Status \(0\)/ })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Priority \(0\)/ })
    ).toBeInTheDocument()

    // Toggle two statuses.
    fireEvent.click(screen.getByTestId('status-option-open'))
    fireEvent.click(screen.getByTestId('status-option-closed'))

    // Status heading should now read (2).
    expect(
      screen.getByRole('heading', { name: /Status \(2\)/ })
    ).toBeInTheDocument()

    // Priority is untouched.
    expect(
      screen.getByRole('heading', { name: /Priority \(0\)/ })
    ).toBeInTheDocument()
  })

  it('"Clear all" resets every dimension and disables the button', () => {
    render(<FilterSidebar />)

    // Toggle a few things across dimensions.
    fireEvent.click(screen.getByTestId('status-option-open'))
    fireEvent.click(screen.getByTestId('priority-option-P2'))
    fireEvent.click(screen.getByTestId('type-option-bug'))

    // Sanity: filters are populated.
    expect(useIssueFilterStore.getState().status).toEqual(['open'])
    expect(useIssueFilterStore.getState().priority).toEqual(['P2'])
    expect(useIssueFilterStore.getState().type).toEqual(['bug'])

    const clearBtn = screen.getByTestId('clear-all-button') as HTMLButtonElement
    expect(clearBtn.disabled).toBe(false)

    fireEvent.click(clearBtn)

    // Store is empty.
    expect(useIssueFilterStore.getState().status).toEqual([])
    expect(useIssueFilterStore.getState().priority).toEqual([])
    expect(useIssueFilterStore.getState().type).toEqual([])

    // Every section heading reads (0).
    expect(
      screen.getByRole('heading', { name: /Status \(0\)/ })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Priority \(0\)/ })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Type \(0\)/ })
    ).toBeInTheDocument()

    // Button is now disabled.
    expect(clearBtn.disabled).toBe(true)
  })

  it('"Clear all" button is disabled when no filters are active', () => {
    render(<FilterSidebar />)

    const clearBtn = screen.getByTestId('clear-all-button') as HTMLButtonElement
    expect(clearBtn.disabled).toBe(true)
  })

  it('does not use the brand colour anywhere in the rendered output', () => {
    // ponytail: AC-14 — the brand colour is reserved for destructive
    // actions and the P0 priority badge only. FilterSidebar is a
    // mono-scale component, so it must not surface it via inline
    // styles, class names, or attribute values.
    const { container } = render(<FilterSidebar />)

    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
    expect(html).not.toContain('accent')
  })
})
