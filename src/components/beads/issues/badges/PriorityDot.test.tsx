import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { PriorityDot } from './PriorityDot'

describe('PriorityDot', () => {
  it('P0 is rendered in danger colour (rgb 239, 68, 68)', () => {
    render(<PriorityDot priority="P0" />)
    const dot = screen.getByTestId('priority-dot')
    expect(dot.style.color).toBe('rgb(239, 68, 68)')
  })

  it('P1..P4 are rendered in non-danger colours', () => {
    for (const p of ['P1', 'P2', 'P3', 'P4'] as const) {
      const { unmount } = render(<PriorityDot priority={p} />)
      expect(screen.getByTestId('priority-dot').style.color).not.toBe(
        'rgb(239, 68, 68)'
      )
      unmount()
    }
  })

  it('is not pinned to a hard-edged radius', () => {
    render(<PriorityDot priority="P2" />)
    const dot = screen.getByTestId('priority-dot')
    expect(dot.style.borderRadius).not.toBe('0px')
  })
})
