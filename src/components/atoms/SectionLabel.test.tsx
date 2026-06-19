import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SectionLabel } from './SectionLabel'

describe('SectionLabel', () => {
  it('renders the text as-is (CSS handles the uppercase)', () => {
    render(<SectionLabel>Filters</SectionLabel>)
    expect(screen.getByText('Filters')).toBeInTheDocument()
  })

  it('applies text-transform: uppercase via CSS', () => {
    render(<SectionLabel data-testid="sl">Filters</SectionLabel>)
    expect(screen.getByTestId('sl').style.textTransform).toBe('uppercase')
  })

  it('uses the caps letter-spacing token (0.08em)', () => {
    render(<SectionLabel data-testid="sl">Views</SectionLabel>)
    const el = screen.getByTestId('sl')
    expect(el.style.letterSpacing).toBe('0.08em')
  })

  it('forwards the data-testid', () => {
    render(<SectionLabel data-testid="x">Labels</SectionLabel>)
    expect(screen.getByTestId('x')).toBeInTheDocument()
  })
})
