import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Monogram } from './Monogram'

// ponytail: jsdom serializes inline-style #RRGGBB to rgb(94, 106, 210)
// when read back from element.style.background. The strings below accept
// either form so the test passes against jsdom + real browsers.
const ACCENT_HEX = '#5e6ad2'
const ACCENT_RGB = 'rgb(94, 106, 210)'
const PURPLE_HEX = '#7c3aed'
const PURPLE_RGB = 'rgb(124, 58, 237)'
const matchesAny = (haystack: string, ...needles: string[]) =>
  needles.some(n => haystack.includes(n))

describe('Monogram', () => {
  it('renders the "C" letter', () => {
    render(<Monogram size={22} data-testid="mg" />)
    expect(screen.getByTestId('mg').textContent).toBe('C')
  })

  it('applies the gradient background', () => {
    render(<Monogram size={22} data-testid="mg" />)
    const el = screen.getByTestId('mg')
    expect(el.style.background).toContain('linear-gradient')
    expect(matchesAny(el.style.background, ACCENT_HEX, ACCENT_RGB)).toBe(true)
    expect(matchesAny(el.style.background, PURPLE_HEX, PURPLE_RGB)).toBe(true)
  })

  it('uses the requested size', () => {
    render(<Monogram size={32} data-testid="mg" />)
    const el = screen.getByTestId('mg')
    expect(el.style.width).toBe('32px')
    expect(el.style.height).toBe('32px')
  })

  it('exposes aria-label when provided', () => {
    render(<Monogram size={22} ariaLabel="Collier logo" data-testid="mg" />)
    expect(screen.getByTestId('mg')).toHaveAttribute(
      'aria-label',
      'Collier logo'
    )
  })
})
