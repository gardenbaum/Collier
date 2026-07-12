import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { Badge } from './badge'

/**
 * These tests cover the Badge primitive declared in
 * src/components/ui/badge.tsx (currently 0% coverage).
 *
 * Badge is a single function component that:
 *  - renders a `<span>` by default with `data-slot="badge"`
 *  - swaps the rendered element to Radix `Slot` when `asChild={true}`,
 *    forwarding props onto the wrapped child
 *  - drives its className through a cva call with 4 variants
 *    (`default` | `secondary` | `destructive` | `outline`)
 *  - merges a custom `className` via cn() and spreads remaining span
 *    props onto the rendered element
 *
 * The cva variant branch and the `asChild` Slot branch both need
 * dedicated describes because their behaviour diverges from the plain
 * span-rendering path. Mirrors the Alert / Popover / Tooltip test
 * patterns established in PRs #100 / #104 / #102.
 */

describe('Badge', () => {
  describe('default <span> rendering', () => {
    it('renders a single span with data-slot="badge", base classes, and default variant classes', () => {
      const { container } = render(
        <Badge data-testid="badge-default">Badge</Badge>
      )

      const element = screen.getByTestId('badge-default')
      expect(container.children).toHaveLength(1)
      expect(element.tagName).toBe('SPAN')
      expect(element).toHaveAttribute('data-slot', 'badge')

      // A few representative base classes from the cva definition that
      // are present on every variant.
      expect(element).toHaveClass('inline-flex')
      expect(element).toHaveClass('items-center')
      expect(element).toHaveClass('justify-center')
      expect(element).toHaveClass('rounded-[var(--radius)]')
      expect(element).toHaveClass('border')
      // Note: the base `border-[color:var(--border)]` is overridden by
      // every variant's `border-transparent` via tailwind-merge, so
      // the final element carries `border` + `border-transparent`
      // (border-width + border-color), not the literal base colour.
      expect(element).toHaveClass('border-transparent')
      expect(element).toHaveClass('px-2')
      expect(element).toHaveClass('py-0.5')
      expect(element).toHaveClass('text-xs')
      expect(element).toHaveClass('font-medium')
      expect(element).toHaveClass('w-fit')
      expect(element).toHaveClass('whitespace-nowrap')
      expect(element).toHaveClass('shrink-0')
      expect(element).toHaveClass('gap-1')
      expect(element).toHaveClass('[&>svg]:size-3')
      expect(element).toHaveClass('focus-visible:ring-2')
      expect(element).toHaveClass('focus-visible:ring-[color:var(--ring)]')
      expect(element).toHaveClass('transition-[color,box-shadow]')
      expect(element).toHaveClass('overflow-hidden')

      // Default-variant classes from the cva definition.
      expect(element).toHaveClass('border-transparent')
      expect(element).toHaveClass('bg-[color:var(--primary)]')
      expect(element).toHaveClass('text-[color:var(--primary-foreground)]')
      expect(element).toHaveClass('[a&]:hover:opacity-90')

      expect(element).toHaveTextContent('Badge')
    })

    it('merges a custom className through the cva call alongside the default variant classes', () => {
      render(
        <Badge className="custom-badge-class" data-testid="badge-custom">
          Custom
        </Badge>
      )

      const element = screen.getByTestId('badge-custom')
      expect(element).toHaveClass('bg-[color:var(--primary)]')
      expect(element).toHaveClass('text-[color:var(--primary-foreground)]')
      expect(element).toHaveClass('custom-badge-class')
    })

    it('forwards arbitrary span props (id, aria-*, data-*, onClick)', () => {
      const handleClick = vi.fn()
      render(
        <Badge
          aria-label="badge label"
          data-custom="custom-value"
          data-testid="badge-forwarded"
          id="badge-id"
          onClick={handleClick}
          title="badge title"
        >
          Forwarded
        </Badge>
      )

      const element = screen.getByTestId('badge-forwarded')
      expect(element).toHaveAttribute('id', 'badge-id')
      expect(element).toHaveAttribute('aria-label', 'badge label')
      expect(element).toHaveAttribute('data-custom', 'custom-value')
      expect(element).toHaveAttribute('title', 'badge title')
      expect(element).toHaveTextContent('Forwarded')

      fireEvent.click(element)
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('renders a span even when asChild={false} is passed explicitly', () => {
      render(
        <Badge asChild={false} data-testid="badge-explicit-no-aschild">
          Explicit
        </Badge>
      )

      const element = screen.getByTestId('badge-explicit-no-aschild')
      expect(element.tagName).toBe('SPAN')
      expect(element).toHaveAttribute('data-slot', 'badge')
    })
  })

  describe('secondary variant', () => {
    it('applies the secondary variant classes while keeping the shared base classes', () => {
      render(
        <Badge data-testid="badge-secondary" variant="secondary">
          Secondary
        </Badge>
      )

      const element = screen.getByTestId('badge-secondary')
      expect(element.tagName).toBe('SPAN')
      expect(element).toHaveAttribute('data-slot', 'badge')

      // Secondary-variant classes from the cva definition.
      expect(element).toHaveClass('border-transparent')
      expect(element).toHaveClass('bg-[color:var(--secondary)]')
      expect(element).toHaveClass('text-[color:var(--secondary-foreground)]')
      expect(element).toHaveClass('[a&]:hover:opacity-80')

      // Sanity-check base classes are still applied.
      expect(element).toHaveClass('inline-flex')
      expect(element).toHaveClass('rounded-[var(--radius)]')
      expect(element).toHaveClass('text-xs')

      // Default-variant bg/text must NOT be present.
      expect(element).not.toHaveClass('bg-[color:var(--primary)]')
      expect(element).not.toHaveClass('text-[color:var(--primary-foreground)]')
      expect(element).not.toHaveClass('[a&]:hover:opacity-90')
    })
  })

  describe('destructive variant', () => {
    it('applies the destructive variant classes while keeping the shared base classes', () => {
      render(
        <Badge data-testid="badge-destructive" variant="destructive">
          Destructive
        </Badge>
      )

      const element = screen.getByTestId('badge-destructive')
      expect(element.tagName).toBe('SPAN')
      expect(element).toHaveAttribute('data-slot', 'badge')

      // Destructive-variant classes from the cva definition.
      expect(element).toHaveClass('border-transparent')
      expect(element).toHaveClass('bg-[color:var(--destructive)]')
      expect(element).toHaveClass('text-[color:var(--destructive-foreground)]')
      expect(element).toHaveClass('[a&]:hover:opacity-90')

      // Sanity-check base classes are still applied.
      expect(element).toHaveClass('inline-flex')
      expect(element).toHaveClass('rounded-[var(--radius)]')
      expect(element).toHaveClass('focus-visible:ring-2')

      // Default-variant classes must NOT be present.
      expect(element).not.toHaveClass('bg-[color:var(--primary)]')
      expect(element).not.toHaveClass('text-[color:var(--primary-foreground)]')
    })
  })

  describe('outline variant', () => {
    it('applies the outline variant classes (foreground text + hover-accent utilities) and keeps the shared base classes', () => {
      render(
        <Badge data-testid="badge-outline" variant="outline">
          Outline
        </Badge>
      )

      const element = screen.getByTestId('badge-outline')
      expect(element.tagName).toBe('SPAN')
      expect(element).toHaveAttribute('data-slot', 'badge')

      // Outline-variant classes from the cva definition.
      expect(element).toHaveClass('text-[color:var(--foreground)]')
      expect(element).toHaveClass('[a&]:hover:bg-[color:var(--accent)]/10')
      expect(element).toHaveClass(
        '[a&]:hover:text-[color:var(--accent-foreground)]'
      )

      // Outline has NO transparent-border or filled-background variant
      // class — the cva definition only declares text/hover utilities.
      expect(element).not.toHaveClass('border-transparent')
      expect(element).not.toHaveClass('bg-[color:var(--primary)]')
      expect(element).not.toHaveClass('bg-[color:var(--secondary)]')
      expect(element).not.toHaveClass('bg-[color:var(--destructive)]')

      // Sanity-check base classes are still applied.
      expect(element).toHaveClass('inline-flex')
      expect(element).toHaveClass('rounded-[var(--radius)]')
      expect(element).toHaveClass('border')
      expect(element).toHaveClass('border-[color:var(--border)]')
    })
  })

  describe('asChild Slot', () => {
    it('renders the wrapped child element instead of a <span>, still setting data-slot="badge" on it', () => {
      render(
        <Badge asChild>
          <a data-testid="badge-aschild-link" href="/somewhere">
            Link
          </a>
        </Badge>
      )

      // Slot forwards data-slot and other Badge props onto the child,
      // so the anchor receives data-slot="badge" instead of being
      // wrapped in a span.
      const element = screen.getByTestId('badge-aschild-link')
      expect(element.tagName).toBe('A')
      expect(element).toHaveAttribute('data-slot', 'badge')
      expect(element).toHaveAttribute('href', '/somewhere')
      expect(element).toHaveTextContent('Link')

      // Default-variant cva classes should still be applied to the
      // rendered child element.
      expect(element).toHaveClass('bg-[color:var(--primary)]')
      expect(element).toHaveClass('text-[color:var(--primary-foreground)]')
      expect(element).toHaveClass('inline-flex')
      expect(element).toHaveClass('rounded-[var(--radius)]')
    })

    it('forwards id / aria-label / onClick onto the wrapped child when asChild is set', () => {
      const handleClick = vi.fn()
      render(
        <Badge
          aria-label="anchor label"
          asChild
          data-testid="badge-aschild-forwarded"
          id="aschild-id"
          onClick={handleClick}
        >
          <button type="button">Trigger</button>
        </Badge>
      )

      const button = screen.getByTestId('badge-aschild-forwarded')
      expect(button.tagName).toBe('BUTTON')
      expect(button).toHaveAttribute('data-slot', 'badge')
      expect(button).toHaveAttribute('id', 'aschild-id')
      expect(button).toHaveAttribute('aria-label', 'anchor label')
      expect(button).toHaveAttribute('type', 'button')

      fireEvent.click(button)
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('applies a non-default variant class when asChild is set', () => {
      render(
        <Badge asChild variant="destructive">
          <a data-testid="badge-aschild-destructive" href="/x">
            Destructive link
          </a>
        </Badge>
      )

      const element = screen.getByTestId('badge-aschild-destructive')
      expect(element.tagName).toBe('A')
      expect(element).toHaveAttribute('data-slot', 'badge')
      expect(element).toHaveClass('bg-[color:var(--destructive)]')
      expect(element).toHaveClass('text-[color:var(--destructive-foreground)]')
      // Default-variant classes must NOT be present.
      expect(element).not.toHaveClass('bg-[color:var(--primary)]')
      expect(element).not.toHaveClass('text-[color:var(--primary-foreground)]')
    })
  })
})
