/**
 * Tests for the Welcome / empty state component.
 *
 * Contract: shown when Beads is initialized AND the issue list is empty.
 * The component is purely presentational — it only emits `onCreate` when
 * the user clicks the single "Create issue" CTA. The actual create form
 * is T21, not in this scope.
 */
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { Welcome } from './Welcome'

describe('Welcome', () => {
  it('renders heading, body text, and Create issue button', () => {
    const onCreate = vi.fn()
    render(<Welcome onCreate={onCreate} />)

    // Root marker
    expect(screen.getByTestId('welcome')).toBeInTheDocument()

    // Heading (Bauhaus 3xl, bold)
    expect(
      screen.getByRole('heading', { name: 'Welcome to Collier' })
    ).toBeInTheDocument()

    // Body copy
    expect(
      screen.getByText(
        'Beads is initialized. Create your first issue to get started.'
      )
    ).toBeInTheDocument()

    // CTA — accessible by role and by testid
    expect(screen.getByTestId('create-issue')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Create issue' })
    ).toBeInTheDocument()
  })

  it('calls onCreate exactly once when the Create issue button is clicked', async () => {
    const onCreate = vi.fn()
    const user = userEvent.setup()
    render(<Welcome onCreate={onCreate} />)

    await user.click(screen.getByTestId('create-issue'))

    expect(onCreate).toHaveBeenCalledTimes(1)
  })
})
