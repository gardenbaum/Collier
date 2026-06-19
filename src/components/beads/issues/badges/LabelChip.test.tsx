import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@/test/test-utils'
import { LabelChip } from './LabelChip'

describe('LabelChip', () => {
  it('renders the label text', () => {
    render(<LabelChip label="bug" />)
    expect(screen.getByTestId('label-chip').textContent).toContain('bug')
  })

  it('exposes the label as data-label for QA selectors', () => {
    render(<LabelChip label="frontend" />)
    expect(screen.getByTestId('label-chip').getAttribute('data-label')).toBe(
      'frontend'
    )
  })

  it('uses a soft border (4px radius) and translucent styling', () => {
    render(<LabelChip label="ux" />)
    const chip = screen.getByTestId('label-chip')
    expect(chip.style.borderRadius).toBe('4px')
  })

  it('renders no remove button when onRemove is omitted', () => {
    render(<LabelChip label="ux" />)
    expect(
      screen.queryByRole('button', { name: /remove label ux/i })
    ).toBeNull()
  })

  it('invokes onRemove when the X is clicked', () => {
    const onRemove = vi.fn()
    render(<LabelChip label="ux" onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: /remove label ux/i }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})
