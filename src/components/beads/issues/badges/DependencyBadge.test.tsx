import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { DependencyBadge } from './DependencyBadge'

describe('DependencyBadge', () => {
  it('renders nothing when both counts are zero', () => {
    const { container } = render(<DependencyBadge blockedBy={0} blocks={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the "blocked by" chip when blockedBy > 0', () => {
    render(<DependencyBadge blockedBy={1} blocks={0} />)
    const chip = screen.getByTestId('dep-badge-blocked-by')
    expect(chip.textContent).toContain('blocked by 1')
    // Singular: "issue" not "issues" in the aria-label
    expect(chip.getAttribute('aria-label')).toBe('Blocked by 1 issue')
  })

  it('pluralises the aria-label correctly', () => {
    render(<DependencyBadge blockedBy={3} blocks={0} />)
    const chip = screen.getByTestId('dep-badge-blocked-by')
    expect(chip.textContent).toContain('blocked by 3')
    expect(chip.getAttribute('aria-label')).toBe('Blocked by 3 issues')
  })

  it('renders the "blocks" chip when blocks > 0', () => {
    render(<DependencyBadge blockedBy={0} blocks={2} />)
    const chip = screen.getByTestId('dep-badge-blocks')
    expect(chip.textContent).toContain('blocks 2')
    expect(chip.getAttribute('aria-label')).toBe('Blocks 2 issues')
  })

  it('uses singular "issue" in the blocks aria-label when blocks = 1', () => {
    render(<DependencyBadge blockedBy={0} blocks={1} />)
    const chip = screen.getByTestId('dep-badge-blocks')
    expect(chip.getAttribute('aria-label')).toBe('Blocks 1 issue')
  })

  it('renders both chips when both counts > 0', () => {
    render(<DependencyBadge blockedBy={2} blocks={1} />)
    expect(screen.getByTestId('dep-badge-blocked-by').textContent).toContain(
      'blocked by 2'
    )
    expect(screen.getByTestId('dep-badge-blocks').textContent).toContain(
      'blocks 1'
    )
  })

  it('exposes counts as data attributes on the container', () => {
    render(<DependencyBadge blockedBy={2} blocks={1} />)
    const container = screen.getByTestId('dep-badge')
    expect(container.getAttribute('data-blocked-by')).toBe('2')
    expect(container.getAttribute('data-blocks')).toBe('1')
    expect(container.getAttribute('data-variant')).toBe('row')
  })

  it('omits data attributes that would advertise a zero count', () => {
    render(<DependencyBadge blockedBy={0} blocks={4} />)
    const container = screen.getByTestId('dep-badge')
    expect(container.getAttribute('data-blocked-by')).toBeNull()
    expect(container.getAttribute('data-blocks')).toBe('4')
  })

  it('defaults to the row variant', () => {
    render(<DependencyBadge blockedBy={1} blocks={0} />)
    expect(screen.getByTestId('dep-badge').getAttribute('data-variant')).toBe(
      'row'
    )
  })

  it('honours the header variant', () => {
    render(<DependencyBadge blockedBy={1} blocks={0} variant="header" />)
    expect(screen.getByTestId('dep-badge').getAttribute('data-variant')).toBe(
      'header'
    )
  })
})
