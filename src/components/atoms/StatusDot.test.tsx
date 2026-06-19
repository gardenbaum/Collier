import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatusDot } from './StatusDot'

const RGB = (r: number, g: number, b: number) => `rgb(${r}, ${g}, ${b})`

describe('StatusDot', () => {
  it('in_progress uses accent purple', () => {
    render(<StatusDot status="in_progress" data-testid="sd" />)
    expect(screen.getByTestId('sd').style.backgroundColor).toBe(
      RGB(94, 106, 210)
    )
  })

  it('blocked uses warning orange', () => {
    render(<StatusDot status="blocked" data-testid="sd" />)
    expect(screen.getByTestId('sd').style.backgroundColor).toBe(
      RGB(251, 146, 60)
    )
  })

  it('closed uses muted mono', () => {
    render(<StatusDot status="closed" data-testid="sd" />)
    expect(screen.getByTestId('sd').style.backgroundColor).toBe(RGB(82, 82, 82))
  })

  it('exposes aria-label', () => {
    render(<StatusDot status="open" />)
    expect(screen.getByLabelText('open')).toBeInTheDocument()
  })

  it('respects custom size', () => {
    render(<StatusDot status="open" size={12} data-testid="sd" />)
    const el = screen.getByTestId('sd')
    expect(el.style.width).toBe('12px')
    expect(el.style.height).toBe('12px')
  })
})
