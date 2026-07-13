import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { Separator } from './separator'

/**
 * These tests cover the `Separator` display primitive declared in
 * src/components/ui/separator.tsx (currently 0% coverage).
 *
 * Separator is a stateless cn() wrapper around `@radix-ui/react-separator`'s
 * Root:
 *   - data-slot="separator"
 *   - decorative prop (default true) -> Radix applies role="none" when
 *     decorative=true, role="separator" when decorative=false
 *   - orientation prop (default 'horizontal') -> Radix applies the
 *     matching data-orientation attribute
 *   - cn() concatenates the base + orientation-conditional classes
 *     UNCONDITIONALLY (selection happens at render time via the
 *     data-orientation attribute Radix applies to the element). So
 *     every render — default and vertical — carries both
 *     `data-[orientation=horizontal]:…` and `data-[orientation=vertical]:…`
 *     tokens in className.
 *   - ...rest forwards onto the Root (id, aria-*, data-*, event handlers)
 */
describe('Separator', () => {
  describe('default rendering', () => {
    it('renders a single div with data-slot="separator" and role="none" (decorative default)', () => {
      const { container } = render(
        <Separator data-testid="separator-default" />
      )

      const element = screen.getByTestId('separator-default')
      expect(container.children).toHaveLength(1)
      expect(element.tagName).toBe('DIV')
      expect(element).toHaveAttribute('data-slot', 'separator')
      // Radix sets role="none" when decorative is true (default).
      expect(element).toHaveAttribute('role', 'none')
      // Radix applies the default orientation attribute.
      expect(element).toHaveAttribute('data-orientation', 'horizontal')
    })

    it('applies the unconditional cn() base classes (Variant B: all orientation-conditional tokens concatenated)', () => {
      render(<Separator data-testid="separator-default" />)
      const element = screen.getByTestId('separator-default')

      // Always-on base classes.
      expect(element).toHaveClass('bg-[color:var(--border)]')
      expect(element).toHaveClass('shrink-0')

      // The four orientation-conditional classes are concatenated by
      // cn() on EVERY render — selection happens at render time via
      // the data-orientation attribute that Radix applies, not via
      // conditional class injection. So both horizontal and vertical
      // tokens are present even on the default horizontal render.
      expect(element).toHaveClass('data-[orientation=horizontal]:h-px')
      expect(element).toHaveClass('data-[orientation=horizontal]:w-full')
      expect(element).toHaveClass('data-[orientation=vertical]:h-full')
      expect(element).toHaveClass('data-[orientation=vertical]:w-px')
    })
  })

  describe('orientation="vertical"', () => {
    it('keeps the unconditional cn() class set and flips the data-orientation attribute Radix applies', () => {
      render(
        <Separator data-testid="separator-vertical" orientation="vertical" />
      )
      const element = screen.getByTestId('separator-vertical')

      // Radix applies the new orientation attribute.
      expect(element).toHaveAttribute('data-orientation', 'vertical')

      // cn() is stateless — every orientation-conditional token is
      // still concatenated into className. Tailwind reads
      // data-orientation at render time and only the matching one
      // resolves to a real CSS rule.
      expect(element).toHaveClass('bg-[color:var(--border)]')
      expect(element).toHaveClass('shrink-0')
      expect(element).toHaveClass('data-[orientation=horizontal]:h-px')
      expect(element).toHaveClass('data-[orientation=horizontal]:w-full')
      expect(element).toHaveClass('data-[orientation=vertical]:h-full')
      expect(element).toHaveClass('data-[orientation=vertical]:w-px')
    })
  })

  describe('decorative', () => {
    it('flips role to "separator" when decorative={false}', () => {
      render(
        <Separator data-testid="separator-non-decorative" decorative={false} />
      )
      const element = screen.getByTestId('separator-non-decorative')
      expect(element).toHaveAttribute('data-slot', 'separator')
      // Radix sets role="separator" when decorative is false so
      // assistive tech can announce the boundary.
      expect(element).toHaveAttribute('role', 'separator')
      expect(element).toHaveAttribute('data-orientation', 'horizontal')
    })

    it('combines decorative={false} with orientation="vertical" — both attributes flip', () => {
      render(
        <Separator
          data-testid="separator-vertical-non-decorative"
          decorative={false}
          orientation="vertical"
        />
      )
      const element = screen.getByTestId('separator-vertical-non-decorative')
      expect(element).toHaveAttribute('role', 'separator')
      expect(element).toHaveAttribute('data-orientation', 'vertical')
    })
  })

  describe('className merge', () => {
    it('merges a custom className alongside the unconditional cn() base classes', () => {
      render(
        <Separator
          className="custom-separator-class"
          data-testid="separator-custom"
        />
      )
      const element = screen.getByTestId('separator-custom')

      // Base classes are still present.
      expect(element).toHaveClass('bg-[color:var(--border)]')
      expect(element).toHaveClass('shrink-0')
      // User-supplied class lands alongside.
      expect(element).toHaveClass('custom-separator-class')
    })
  })

  describe('props forwarding', () => {
    it('forwards id, aria-*, data-* attributes onto the underlying div via props spread', () => {
      render(
        <Separator
          aria-label="section break"
          data-custom="custom-value"
          data-testid="separator-forwarded"
          id="separator-id"
        />
      )
      const element = screen.getByTestId('separator-forwarded')
      expect(element).toHaveAttribute('id', 'separator-id')
      expect(element).toHaveAttribute('aria-label', 'section break')
      expect(element).toHaveAttribute('data-custom', 'custom-value')
    })

    it('forwards a click event handler onto the underlying div', () => {
      const handleClick = vi.fn()
      render(<Separator data-testid="separator-click" onClick={handleClick} />)

      const element = screen.getByTestId('separator-click')
      fireEvent.click(element)
      expect(handleClick).toHaveBeenCalledTimes(1)
    })
  })
})
