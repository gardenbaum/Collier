import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select'

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    // no-op: Radix Select may request scroll alignment when content mounts.
  }
}

/**
 * These tests cover the thin shadcn-style Radix Select wrappers that
 * only add stable `data-slot` attributes and className merging. The
 * behavioral Select interactions are exercised by component tests that
 * consume the wrapper; here we keep the assertions at the wrapper API.
 */
describe('Select wrappers (Radix)', () => {
  it('Group: applies data-slot to the Radix group element', () => {
    const { container } = render(
      <SelectGroup>
        <span>Fruits</span>
      </SelectGroup>
    )

    const group = container.querySelector('[data-slot="select-group"]')
    expect(group).toBeInTheDocument()
    expect(group).toContainElement(screen.getByText('Fruits'))
  })

  it('Label: renders text and merges custom className', () => {
    render(
      <SelectGroup>
        <SelectLabel className="custom-label">Fruit</SelectLabel>
      </SelectGroup>
    )

    const label = screen.getByText('Fruit')
    expect(label).toHaveAttribute('data-slot', 'select-label')
    expect(label).toHaveClass('text-[color:var(--muted-foreground)]')
    expect(label).toHaveClass('custom-label')
  })

  it('Separator: renders the separator and forwards custom className', () => {
    const { container } = render(
      <SelectSeparator className="custom-separator" />
    )

    const separator = container.querySelector('[data-slot="select-separator"]')
    expect(separator).toBeInTheDocument()
    expect(separator).toHaveClass('bg-[color:var(--border)]')
    expect(separator).toHaveClass('custom-separator')
  })

  it('mounts the root, trigger, content, item, group, label, and separator wrappers together', () => {
    expect(() =>
      render(
        <Select defaultOpen defaultValue="apple">
          <SelectTrigger>
            <SelectValue placeholder="Choose a fruit" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Fruits</SelectLabel>
              <SelectItem value="apple">Apple</SelectItem>
              <SelectSeparator />
              <SelectItem value="banana">Banana</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      )
    ).not.toThrow()

    expect(
      screen.getByText('Fruits').closest('[data-slot="select-label"]')
    ).toBeInTheDocument()
    expect(
      screen
        .getByText('Apple', { selector: '[id^="radix-"]' })
        .closest('[data-slot="select-item"]')
    ).toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="select-separator"]')
    ).toBeInTheDocument()
  })
})
