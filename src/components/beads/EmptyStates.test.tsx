/**
 * Tests for the empty-state components.
 *
 * Contract: each variant renders its heading + body + single CTA. The
 * CTA invokes the matching `on*` callback exactly once per click.
 * The brand colour is not used in any variant (AC-14).
 */
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { NoIssuesEmpty, NoResultsEmpty, NoRepoEmpty } from './EmptyStates'

describe('EmptyStates', () => {
  it('NoIssuesEmpty renders heading, body, and the Create issue button', () => {
    const onCreate = vi.fn()
    render(<NoIssuesEmpty onCreate={onCreate} />)

    expect(screen.getByTestId('no-issues-empty')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'No issues yet' })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Create your first issue to get started.')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Create issue' })
    ).toBeInTheDocument()
  })

  it('NoIssuesEmpty invokes onCreate when the CTA is clicked', async () => {
    const onCreate = vi.fn()
    const user = userEvent.setup()
    render(<NoIssuesEmpty onCreate={onCreate} />)

    await user.click(screen.getByTestId('no-issues-create'))

    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('NoResultsEmpty renders heading, body, and the Clear filters button', () => {
    const onClearFilters = vi.fn()
    render(<NoResultsEmpty onClearFilters={onClearFilters} />)

    expect(screen.getByTestId('no-results-empty')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'No matches' })
    ).toBeInTheDocument()
    expect(
      screen.getByText('No issues match your filters.')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Clear filters' })
    ).toBeInTheDocument()
  })

  it('NoResultsEmpty invokes onClearFilters when the CTA is clicked', async () => {
    const onClearFilters = vi.fn()
    const user = userEvent.setup()
    render(<NoResultsEmpty onClearFilters={onClearFilters} />)

    await user.click(screen.getByTestId('no-results-clear'))

    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })

  it('NoRepoEmpty renders heading, body, and the Select a repo button', () => {
    const onSelectRepo = vi.fn()
    render(<NoRepoEmpty onSelectRepo={onSelectRepo} />)

    expect(screen.getByTestId('no-repo-empty')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'No repository selected' })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Choose a repo to get started.')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Select a repo' })
    ).toBeInTheDocument()
  })

  it('NoRepoEmpty invokes onSelectRepo when the CTA is clicked', async () => {
    const onSelectRepo = vi.fn()
    const user = userEvent.setup()
    render(<NoRepoEmpty onSelectRepo={onSelectRepo} />)

    await user.click(screen.getByTestId('no-repo-select'))

    expect(onSelectRepo).toHaveBeenCalledTimes(1)
  })

  it('does not use the brand colour in any variant (AC-14)', () => {
    const { container } = render(
      <div>
        <NoIssuesEmpty onCreate={() => undefined} />
        <NoResultsEmpty onClearFilters={() => undefined} />
        <NoRepoEmpty onSelectRepo={() => undefined} />
      </div>
    )

    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })
})
