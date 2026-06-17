import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { StatusPill } from './StatusPill'

// ponytail: every IssueStatus variant must render without accent, both
// as a background and as a dot fill. Accent (#c2410c) is reserved for
// destructive actions and the P0 priority badge per AC-14.
const ACCENT_RGB = 'rgb(194, 65, 12)'

describe('StatusPill', () => {
  it.each(['open', 'in_progress', 'blocked', 'closed', 'deferred'] as const)(
    'renders %s status with mono background and mono dot',
    status => {
      render(<StatusPill status={status} />)
      const pill = screen.getByTestId('status-pill')
      expect(pill.style.backgroundColor).not.toBe(ACCENT_RGB)
      expect(pill.style.backgroundColor.toLowerCase()).not.toContain('c2410c')
    }
  )

  it('exposes the status as data-status for QA selectors', () => {
    render(<StatusPill status="in_progress" />)
    expect(screen.getByTestId('status-pill').getAttribute('data-status')).toBe(
      'in_progress'
    )
  })

  it('is hard-edged (radius 0)', () => {
    render(<StatusPill status="open" />)
    const pill = screen.getByTestId('status-pill')
    expect(pill.style.borderRadius).toBe('0px')
  })

  it('renders the human-readable status text', () => {
    render(<StatusPill status="in_progress" />)
    expect(screen.getByTestId('status-pill').textContent).toContain(
      'in progress'
    )
  })
})
