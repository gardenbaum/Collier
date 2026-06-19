import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { StatusPill } from './StatusPill'

describe('StatusPill', () => {
  it('exposes the status as data-status for QA selectors', () => {
    render(<StatusPill status="in_progress" />)
    expect(screen.getByTestId('status-pill').getAttribute('data-status')).toBe(
      'in_progress'
    )
  })

  it('is not pinned to a hard-edged radius', () => {
    render(<StatusPill status="open" />)
    const pill = screen.getByTestId('status-pill')
    expect(pill.style.borderRadius).not.toBe('0px')
  })
})
