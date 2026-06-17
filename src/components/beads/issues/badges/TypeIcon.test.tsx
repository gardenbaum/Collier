import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { TypeIcon } from './TypeIcon'

// ponytail: lucide-react v1.18.0 sets `class="lucide lucide-{name}"`
// on the SVG (no `data-lucide` attribute in this version). The class-based
// selectors below are what the library actually emits, not the
// `data-lucide` attribute documented for older versions.
const expectedIcon = {
  bug: 'lucide-bug',
  feature: 'lucide-sparkles',
  task: 'lucide-square-check',
  epic: 'lucide-mountain',
  chore: 'lucide-wrench',
  decision: 'lucide-git-branch',
  gate: 'lucide-lock',
} as const

describe('TypeIcon', () => {
  it.each(
    Object.entries(expectedIcon) as [keyof typeof expectedIcon, string][]
  )('%s type renders the %s Lucide icon', (type, klass) => {
    const { container } = render(<TypeIcon type={type} />)
    const wrapper = screen.getByTestId('type-icon')
    expect(wrapper.getAttribute('data-type')).toBe(type)
    const svg = container.querySelector(`[class~="${klass}"]`)
    expect(svg).not.toBeNull()
    expect(svg?.tagName.toLowerCase()).toBe('svg')
  })

  it('honours the size prop', () => {
    const { container } = render(<TypeIcon type="bug" size={20} />)
    const svg = container.querySelector('[class~="lucide-bug"]')
    expect(svg?.getAttribute('width')).toBe('20')
    expect(svg?.getAttribute('height')).toBe('20')
  })

  it('defaults to 14px when size is omitted', () => {
    const { container } = render(<TypeIcon type="bug" />)
    const svg = container.querySelector('[class~="lucide-bug"]')
    expect(svg?.getAttribute('width')).toBe('14')
    expect(svg?.getAttribute('height')).toBe('14')
  })
})
