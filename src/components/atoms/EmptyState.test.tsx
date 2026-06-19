import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Inbox } from 'lucide-react'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders title, body, and CTA', () => {
    render(
      <EmptyState
        icon={Inbox}
        title="Nothing here yet"
        body="Issues you create will show up here."
        cta={<button>+ New issue</button>}
      />
    )
    expect(
      screen.getByRole('heading', { name: 'Nothing here yet' })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Issues you create will show up here.')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '+ New issue' })
    ).toBeInTheDocument()
  })

  it('hides CTA when not provided', () => {
    render(<EmptyState icon={Inbox} title="t" body="b" data-testid="es" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('forwards data-testid', () => {
    render(<EmptyState icon={Inbox} title="t" body="b" data-testid="es" />)
    expect(screen.getByTestId('es')).toBeInTheDocument()
  })
})
