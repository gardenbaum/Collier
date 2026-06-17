import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { PriorityDot } from './PriorityDot'

const inlineColorToHex = (cssColor: string): string => {
  const rgb = cssColor.match(/\d+/g)?.map(Number).slice(0, 3) ?? []
  return '#' + rgb.map(n => n.toString(16).padStart(2, '0')).join('')
}

describe('PriorityDot', () => {
  it('P0 is the only priority rendered in accent (#c2410c)', () => {
    render(<PriorityDot priority="P0" />)
    const dot = screen.getByTestId('priority-dot')
    expect(dot.style.backgroundColor).toBe('rgb(194, 65, 12)') // #c2410c
    expect(inlineColorToHex(dot.style.backgroundColor)).toBe('#c2410c')
  })

  it('P1..P4 are mono (never accent)', () => {
    const { rerender } = render(<PriorityDot priority="P1" />)
    expect(screen.getByTestId('priority-dot').style.backgroundColor).not.toBe(
      'rgb(194, 65, 12)'
    )

    rerender(<PriorityDot priority="P2" />)
    expect(screen.getByTestId('priority-dot').style.backgroundColor).not.toBe(
      'rgb(194, 65, 12)'
    )

    rerender(<PriorityDot priority="P3" />)
    expect(screen.getByTestId('priority-dot').style.backgroundColor).not.toBe(
      'rgb(194, 65, 12)'
    )

    rerender(<PriorityDot priority="P4" />)
    expect(screen.getByTestId('priority-dot').style.backgroundColor).not.toBe(
      'rgb(194, 65, 12)'
    )
  })

  it('is 8×8 and hard-edged (radius 0)', () => {
    render(<PriorityDot priority="P2" />)
    const dot = screen.getByTestId('priority-dot')
    expect(dot.style.width).toBe('8px')
    expect(dot.style.height).toBe('8px')
    expect(dot.style.borderRadius).toBe('0px')
  })

  it('exposes the priority as data-priority for QA selectors', () => {
    render(<PriorityDot priority="P3" />)
    expect(
      screen.getByTestId('priority-dot').getAttribute('data-priority')
    ).toBe('P3')
  })
})
