import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PriorityBadge } from './PriorityBadge'

const RGB = (r: number, g: number, b: number) => `rgb(${r}, ${g}, ${b})`

describe('PriorityBadge', () => {
  it('P0 is danger red', () => {
    render(<PriorityBadge priority="P0" data-testid="pb" />)
    expect(screen.getByTestId('pb').style.color).toBe(RGB(239, 68, 68))
  })

  it('P1 is white (text-primary)', () => {
    render(<PriorityBadge priority="P1" data-testid="pb" />)
    expect(screen.getByTestId('pb').style.color).toBe(RGB(250, 250, 250))
  })

  it('P2 is text-secondary', () => {
    render(<PriorityBadge priority="P2" data-testid="pb" />)
    expect(screen.getByTestId('pb').style.color).toBe(RGB(212, 212, 212))
  })

  it('uses the mono font family', () => {
    render(<PriorityBadge priority="P3" data-testid="pb" />)
    expect(screen.getByTestId('pb').style.fontFamily).toContain('SF Mono')
  })

  it('exposes aria-label', () => {
    render(<PriorityBadge priority="P0" />)
    expect(screen.getByLabelText('P0')).toBeInTheDocument()
  })
})
