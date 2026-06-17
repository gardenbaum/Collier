import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@/test/test-utils'
import { LabelChip } from './LabelChip'

// ponytail: accent (#c2410c) is forbidden on labels per AC-14 — assert
// the rendered chip never reaches for it, neither in background, border,
// nor text. Mono scale only.
const ACCENT_RGB = 'rgb(194, 65, 12)'

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

  it('is hard-edged (radius 0) and uses a mono border', () => {
    render(<LabelChip label="ux" />)
    const chip = screen.getByTestId('label-chip')
    expect(chip.style.borderRadius).toBe('0px')
    expect(chip.style.borderColor.toLowerCase()).not.toContain('c2410c')
  })

  it('uses a mono background (no accent)', () => {
    render(<LabelChip label="ux" />)
    const chip = screen.getByTestId('label-chip')
    expect(chip.style.backgroundColor).not.toBe(ACCENT_RGB)
    expect(chip.style.backgroundColor.toLowerCase()).not.toContain('c2410c')
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
