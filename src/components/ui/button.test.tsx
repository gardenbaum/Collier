import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { Button, buttonVariants } from './button'

/**
 * These tests cover the Button primitive declared in
 * src/components/ui/button.tsx (currently 0% coverage, 63 lines).
 *
 * Button is a single function component that:
 *  - renders a native `<button>` by default with `data-slot="button"`
 *  - swaps the rendered element to Radix `Slot` when `asChild={true}`,
 *    forwarding props onto the wrapped child
 *  - drives its className through a cva call with 7 variants
 *    (`default` | `destructive` | `outline` | `secondary` | `subtle`
 *    | `ghost` | `link`) and 6 sizes (`default` | `sm` | `lg` | `icon`
 *    | `icon-sm` | `icon-lg`)
 *  - merges a custom `className` via cn() and spreads remaining button
 *    props onto the rendered element
 *
 * The cva variant + size branches and the `asChild` Slot branch each
 * need dedicated describes because their behaviour diverges from the
 * plain button-rendering path. Mirrors the badge.test.tsx (PR #105),
 * label.test.tsx (PR #113), and textarea.test.tsx (PR #112) layout:
 * unconditional cn() base assertions, one describe per variant, one
 * describe per size, className merge, asChild Slot, and prop
 * forwarding.
 */

describe('Button', () => {
  describe('default <button> rendering', () => {
    it('renders exactly one <button> with data-slot="button" and the full unconditional cn() base + default variant + default size', () => {
      const { container } = render(<Button data-testid="button-default" />)

      const element = screen.getByTestId('button-default')

      // Exactly one top-level child, no portal / wrapper elements.
      expect(container.children).toHaveLength(1)
      // Default `asChild = false` resolves to a native <button>.
      expect(element.tagName).toBe('BUTTON')
      expect(element).toHaveAttribute('data-slot', 'button')

      // Layout / structural base tokens.
      expect(element).toHaveClass('inline-flex')
      expect(element).toHaveClass('items-center')
      expect(element).toHaveClass('justify-center')
      expect(element).toHaveClass('gap-2')
      expect(element).toHaveClass('whitespace-nowrap')
      expect(element).toHaveClass('text-sm')
      expect(element).toHaveClass('font-medium')
      expect(element).toHaveClass('transition-all')

      // Disabled-state tokens.
      expect(element).toHaveClass('disabled:pointer-events-none')
      expect(element).toHaveClass('disabled:opacity-50')

      // Descendant-svg tokens.
      expect(element).toHaveClass('[&_svg]:pointer-events-none')
      expect(element).toHaveClass("[&_svg:not([class*='size-'])]:size-4")
      expect(element).toHaveClass('shrink-0')
      expect(element).toHaveClass('[&_svg]:shrink-0')

      // Focus-visible ring tokens.
      expect(element).toHaveClass('outline-none')
      expect(element).toHaveClass('focus-visible:ring-2')
      expect(element).toHaveClass('focus-visible:ring-[color:var(--ring)]')
      expect(element).toHaveClass('focus-visible:ring-offset-2')
      expect(element).toHaveClass(
        'focus-visible:ring-offset-[color:var(--background)]'
      )

      // aria-invalid ring / border tokens.
      expect(element).toHaveClass(
        'aria-invalid:ring-[color:var(--destructive)]'
      )
      expect(element).toHaveClass(
        'aria-invalid:border-[color:var(--destructive)]'
      )

      // Default-variant classes (no `variant` prop set).
      expect(element).toHaveClass('bg-[color:var(--primary)]')
      expect(element).toHaveClass('text-[color:var(--primary-foreground)]')
      expect(element).toHaveClass('hover:opacity-90')

      // Default-size classes (no `size` prop set).
      expect(element).toHaveClass('h-9')
      expect(element).toHaveClass('px-4')
      expect(element).toHaveClass('py-2')
      expect(element).toHaveClass('has-[>svg]:px-3')
    })

    it('fires the onClick handler when the rendered <button> is clicked', () => {
      const handleClick = vi.fn()
      render(
        <Button data-testid="button-click" onClick={handleClick}>
          Click me
        </Button>
      )

      const element = screen.getByTestId('button-click')
      fireEvent.click(element)
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('forwards the disabled attribute onto the rendered <button>', () => {
      render(
        <Button data-testid="button-disabled" disabled>
          Disabled
        </Button>
      )

      const element = screen.getByTestId('button-disabled')
      expect(element.tagName).toBe('BUTTON')
      expect(element).toBeDisabled()
    })

    it('forwards type="submit" onto the rendered <button> (overrides the html default of type="button")', () => {
      render(
        <Button data-testid="button-submit" type="submit">
          Submit
        </Button>
      )

      const element = screen.getByTestId('button-submit')
      expect(element.tagName).toBe('BUTTON')
      expect(element).toHaveAttribute('type', 'submit')
    })

    it('forwards id, aria-*, data-* and form attributes onto the rendered <button>', () => {
      render(
        <Button
          aria-label="primary action"
          aria-pressed="false"
          data-testid="button-props"
          data-track="signup"
          form="signup-form"
          id="primary-cta"
          name="primary"
        >
          Forwarded
        </Button>
      )

      const element = screen.getByTestId('button-props')
      expect(element).toHaveAttribute('id', 'primary-cta')
      expect(element).toHaveAttribute('aria-label', 'primary action')
      expect(element).toHaveAttribute('aria-pressed', 'false')
      expect(element).toHaveAttribute('data-track', 'signup')
      expect(element).toHaveAttribute('form', 'signup-form')
      expect(element).toHaveAttribute('name', 'primary')
    })

    it('renders a <button> when asChild={false} is passed explicitly (default branch)', () => {
      render(
        <Button asChild={false} data-testid="button-explicit-no-aschild">
          Explicit
        </Button>
      )

      const element = screen.getByTestId('button-explicit-no-aschild')
      expect(element.tagName).toBe('BUTTON')
      expect(element).toHaveAttribute('data-slot', 'button')
    })
  })

  describe('variant branches (7)', () => {
    describe('destructive variant', () => {
      it('applies the destructive variant classes and keeps the shared base classes', () => {
        render(
          <Button data-testid="button-destructive" variant="destructive">
            Delete
          </Button>
        )

        const element = screen.getByTestId('button-destructive')
        expect(element.tagName).toBe('BUTTON')
        expect(element).toHaveAttribute('data-slot', 'button')

        // Destructive-variant classes from the cva definition.
        expect(element).toHaveClass('bg-[color:var(--destructive)]')
        expect(element).toHaveClass(
          'text-[color:var(--destructive-foreground)]'
        )
        expect(element).toHaveClass('hover:opacity-90')

        // Sanity-check base classes are still applied.
        expect(element).toHaveClass('inline-flex')
        expect(element).toHaveClass('transition-all')
        expect(element).toHaveClass('focus-visible:ring-2')

        // Default-variant classes must NOT be present.
        expect(element).not.toHaveClass('bg-[color:var(--primary)]')
        expect(element).not.toHaveClass(
          'text-[color:var(--primary-foreground)]'
        )
      })
    })

    describe('outline variant', () => {
      it('applies the outline variant classes and keeps the shared base classes', () => {
        render(
          <Button data-testid="button-outline" variant="outline">
            Outline
          </Button>
        )

        const element = screen.getByTestId('button-outline')
        expect(element.tagName).toBe('BUTTON')
        expect(element).toHaveAttribute('data-slot', 'button')

        // Outline-variant classes from the cva definition.
        expect(element).toHaveClass('border')
        expect(element).toHaveClass('bg-[color:var(--background)]')
        expect(element).toHaveClass('shadow-xs')
        expect(element).toHaveClass('hover:bg-[color:var(--accent)]/10')
        expect(element).toHaveClass(
          'hover:text-[color:var(--accent-foreground)]'
        )
        expect(element).toHaveClass('border-[color:var(--border)]')

        // Sanity-check base classes are still applied.
        expect(element).toHaveClass('inline-flex')
        expect(element).toHaveClass('items-center')
        expect(element).toHaveClass('focus-visible:ring-2')

        // Default-variant classes must NOT be present.
        expect(element).not.toHaveClass('bg-[color:var(--primary)]')
        expect(element).not.toHaveClass(
          'text-[color:var(--primary-foreground)]'
        )
      })
    })

    describe('secondary variant', () => {
      it('applies the secondary variant classes and keeps the shared base classes', () => {
        render(
          <Button data-testid="button-secondary" variant="secondary">
            Secondary
          </Button>
        )

        const element = screen.getByTestId('button-secondary')
        expect(element.tagName).toBe('BUTTON')
        expect(element).toHaveAttribute('data-slot', 'button')

        // Secondary-variant classes from the cva definition.
        expect(element).toHaveClass('bg-[color:var(--secondary)]')
        expect(element).toHaveClass('text-[color:var(--secondary-foreground)]')
        expect(element).toHaveClass('hover:opacity-80')

        // Sanity-check base classes are still applied.
        expect(element).toHaveClass('inline-flex')
        expect(element).toHaveClass('items-center')
        expect(element).toHaveClass('focus-visible:ring-2')

        // Default-variant classes must NOT be present.
        expect(element).not.toHaveClass('bg-[color:var(--primary)]')
        expect(element).not.toHaveClass(
          'text-[color:var(--primary-foreground)]'
        )
        expect(element).not.toHaveClass('hover:opacity-90')
      })
    })

    describe('subtle variant', () => {
      it('applies the subtle variant classes and keeps the shared base classes', () => {
        render(
          <Button data-testid="button-subtle" variant="subtle">
            Subtle
          </Button>
        )

        const element = screen.getByTestId('button-subtle')
        expect(element.tagName).toBe('BUTTON')
        expect(element).toHaveAttribute('data-slot', 'button')

        // Subtle-variant classes from the cva definition.
        expect(element).toHaveClass('bg-transparent')
        expect(element).toHaveClass('text-[color:var(--foreground)]')
        expect(element).toHaveClass('hover:bg-[color:var(--secondary)]')

        // Sanity-check base classes are still applied.
        expect(element).toHaveClass('inline-flex')
        expect(element).toHaveClass('items-center')
        expect(element).toHaveClass('focus-visible:ring-2')

        // Default-variant classes must NOT be present.
        expect(element).not.toHaveClass('bg-[color:var(--primary)]')
        expect(element).not.toHaveClass(
          'text-[color:var(--primary-foreground)]'
        )
        expect(element).not.toHaveClass('hover:opacity-90')
      })
    })

    describe('ghost variant', () => {
      it('applies the ghost variant classes and keeps the shared base classes', () => {
        render(
          <Button data-testid="button-ghost" variant="ghost">
            Ghost
          </Button>
        )

        const element = screen.getByTestId('button-ghost')
        expect(element.tagName).toBe('BUTTON')
        expect(element).toHaveAttribute('data-slot', 'button')

        // Ghost-variant classes from the cva definition.
        expect(element).toHaveClass('bg-transparent')
        expect(element).toHaveClass('text-[color:var(--foreground)]')
        expect(element).toHaveClass('hover:bg-[color:var(--accent)]/10')

        // Sanity-check base classes are still applied.
        expect(element).toHaveClass('inline-flex')
        expect(element).toHaveClass('items-center')
        expect(element).toHaveClass('focus-visible:ring-2')

        // Default-variant classes must NOT be present.
        expect(element).not.toHaveClass('bg-[color:var(--primary)]')
        expect(element).not.toHaveClass(
          'text-[color:var(--primary-foreground)]'
        )
        expect(element).not.toHaveClass('hover:opacity-90')
      })
    })

    describe('link variant', () => {
      it('applies the link variant classes and keeps the shared base classes', () => {
        render(
          <Button data-testid="button-link" variant="link">
            Link
          </Button>
        )

        const element = screen.getByTestId('button-link')
        expect(element.tagName).toBe('BUTTON')
        expect(element).toHaveAttribute('data-slot', 'button')

        // Link-variant classes from the cva definition.
        expect(element).toHaveClass('text-[color:var(--primary)]')
        expect(element).toHaveClass('underline-offset-4')
        expect(element).toHaveClass('hover:underline')

        // Sanity-check base classes are still applied.
        expect(element).toHaveClass('inline-flex')
        expect(element).toHaveClass('items-center')
        expect(element).toHaveClass('focus-visible:ring-2')

        // Default-variant classes must NOT be present.
        expect(element).not.toHaveClass(
          'text-[color:var(--primary-foreground)]'
        )
        expect(element).not.toHaveClass('hover:opacity-90')
        // The link variant has no background utility, so the default
        // primary background must also be gone.
        expect(element).not.toHaveClass('bg-[color:var(--primary)]')
      })
    })
  })

  describe('size branches (6)', () => {
    describe('default size', () => {
      it('applies the default size classes (h-9 + px-4 + py-2 + has-[>svg]:px-3)', () => {
        render(<Button data-testid="button-size-default" />)

        const element = screen.getByTestId('button-size-default')
        expect(element).toHaveClass('h-9')
        expect(element).toHaveClass('px-4')
        expect(element).toHaveClass('py-2')
        expect(element).toHaveClass('has-[>svg]:px-3')

        // Non-default size utilities must NOT be present.
        expect(element).not.toHaveClass('h-8')
        expect(element).not.toHaveClass('h-10')
        expect(element).not.toHaveClass('size-9')
        expect(element).not.toHaveClass('size-8')
        expect(element).not.toHaveClass('size-10')
      })
    })

    describe('sm size', () => {
      it('applies the sm size classes (h-8 + gap-1.5 + px-3 + has-[>svg]:px-2.5)', () => {
        render(<Button data-testid="button-size-sm" size="sm" />)

        const element = screen.getByTestId('button-size-sm')
        expect(element).toHaveClass('h-8')
        expect(element).toHaveClass('gap-1.5')
        expect(element).toHaveClass('px-3')
        expect(element).toHaveClass('has-[>svg]:px-2.5')

        // Non-sm size utilities must NOT be present.
        expect(element).not.toHaveClass('h-9')
        expect(element).not.toHaveClass('h-10')
        expect(element).not.toHaveClass('size-9')
        expect(element).not.toHaveClass('size-8')
        expect(element).not.toHaveClass('size-10')
      })
    })

    describe('lg size', () => {
      it('applies the lg size classes (h-10 + px-6 + has-[>svg]:px-4)', () => {
        render(<Button data-testid="button-size-lg" size="lg" />)

        const element = screen.getByTestId('button-size-lg')
        expect(element).toHaveClass('h-10')
        expect(element).toHaveClass('px-6')
        expect(element).toHaveClass('has-[>svg]:px-4')

        // Non-lg size utilities must NOT be present.
        expect(element).not.toHaveClass('h-9')
        expect(element).not.toHaveClass('h-8')
        expect(element).not.toHaveClass('size-9')
        expect(element).not.toHaveClass('size-8')
        expect(element).not.toHaveClass('size-10')
      })
    })

    describe('icon size', () => {
      it('applies the icon size classes (size-9) and no height utility', () => {
        render(<Button data-testid="button-size-icon" size="icon" />)

        const element = screen.getByTestId('button-size-icon')
        expect(element).toHaveClass('size-9')

        // icon size uses size-N, NOT h-N, and no padding.
        expect(element).not.toHaveClass('h-9')
        expect(element).not.toHaveClass('h-8')
        expect(element).not.toHaveClass('h-10')
        expect(element).not.toHaveClass('size-8')
        expect(element).not.toHaveClass('size-10')
        expect(element).not.toHaveClass('px-4')
        expect(element).not.toHaveClass('px-3')
        expect(element).not.toHaveClass('px-6')
        expect(element).not.toHaveClass('py-2')
      })
    })

    describe('icon-sm size', () => {
      it('applies the icon-sm size classes (size-8) and no height utility', () => {
        render(<Button data-testid="button-size-icon-sm" size="icon-sm" />)

        const element = screen.getByTestId('button-size-icon-sm')
        expect(element).toHaveClass('size-8')

        // icon-sm size uses size-N, NOT h-N, and no padding.
        expect(element).not.toHaveClass('h-9')
        expect(element).not.toHaveClass('h-8')
        expect(element).not.toHaveClass('h-10')
        expect(element).not.toHaveClass('size-9')
        expect(element).not.toHaveClass('size-10')
        expect(element).not.toHaveClass('px-4')
        expect(element).not.toHaveClass('px-3')
        expect(element).not.toHaveClass('px-6')
        expect(element).not.toHaveClass('py-2')
      })
    })

    describe('icon-lg size', () => {
      it('applies the icon-lg size classes (size-10) and no height utility', () => {
        render(<Button data-testid="button-size-icon-lg" size="icon-lg" />)

        const element = screen.getByTestId('button-size-icon-lg')
        expect(element).toHaveClass('size-10')

        // icon-lg size uses size-N, NOT h-N, and no padding.
        expect(element).not.toHaveClass('h-9')
        expect(element).not.toHaveClass('h-8')
        expect(element).not.toHaveClass('h-10')
        expect(element).not.toHaveClass('size-9')
        expect(element).not.toHaveClass('size-8')
        expect(element).not.toHaveClass('px-4')
        expect(element).not.toHaveClass('px-3')
        expect(element).not.toHaveClass('px-6')
        expect(element).not.toHaveClass('py-2')
      })
    })
  })

  describe('className merge', () => {
    it('appends a custom className and preserves both base AND default-variant classes', () => {
      // Use non-conflicting utilities — `italic` (font-style) and
      // `underline` (text-decoration) are not the same Tailwind
      // group as the default variant's `text-[color:var(--...)]` /
      // `hover:opacity-90`, so tailwind-merge won't drop the cva
      // output. We deliberately do NOT pass a `text-*` colour here
      // because that would conflict with the default variant and be
      // dropped by twMerge.
      render(
        <Button
          className="custom-class mt-2 italic underline"
          data-testid="button-merged"
        />
      )
      const element = screen.getByTestId('button-merged')

      // Custom classes are appended.
      expect(element).toHaveClass('custom-class')
      expect(element).toHaveClass('mt-2')
      expect(element).toHaveClass('italic')
      expect(element).toHaveClass('underline')

      // Base classes survive the merge.
      expect(element).toHaveClass('inline-flex')
      expect(element).toHaveClass('items-center')
      expect(element).toHaveClass('justify-center')
      expect(element).toHaveClass('gap-2')
      expect(element).toHaveClass('whitespace-nowrap')
      expect(element).toHaveClass('text-sm')
      expect(element).toHaveClass('font-medium')
      expect(element).toHaveClass('transition-all')
      expect(element).toHaveClass('disabled:pointer-events-none')
      expect(element).toHaveClass('disabled:opacity-50')
      expect(element).toHaveClass('focus-visible:ring-2')

      // Default-variant classes survive the merge.
      expect(element).toHaveClass('bg-[color:var(--primary)]')
      expect(element).toHaveClass('text-[color:var(--primary-foreground)]')
      expect(element).toHaveClass('hover:opacity-90')

      // Default-size classes survive the merge.
      expect(element).toHaveClass('h-9')
      expect(element).toHaveClass('px-4')
      expect(element).toHaveClass('py-2')
    })
  })

  describe('asChild Slot branch', () => {
    it('renders the wrapped child element instead of a <button>, still setting data-slot="button" on it', () => {
      render(
        <Button asChild>
          <a data-testid="button-aschild-link" href="/somewhere">
            Link
          </a>
        </Button>
      )

      // Slot forwards data-slot and other Button props onto the child,
      // so the anchor receives data-slot="button" instead of being
      // wrapped in a <button>.
      const element = screen.getByTestId('button-aschild-link')
      expect(element.tagName).toBe('A')
      expect(element).toHaveAttribute('data-slot', 'button')
      expect(element).toHaveAttribute('href', '/somewhere')
      expect(element).toHaveTextContent('Link')

      // Default-variant + default-size cva classes should still be
      // applied to the rendered child element.
      expect(element).toHaveClass('bg-[color:var(--primary)]')
      expect(element).toHaveClass('text-[color:var(--primary-foreground)]')
      expect(element).toHaveClass('inline-flex')
      expect(element).toHaveClass('h-9')
      expect(element).toHaveClass('px-4')
      expect(element).toHaveClass('py-2')
    })

    it('forwards id / aria-label / onClick / disabled onto the wrapped child when asChild is set', () => {
      const handleClick = vi.fn()
      render(
        <Button
          aria-label="anchor label"
          asChild
          data-testid="button-aschild-forwarded"
          disabled
          id="aschild-id"
          onClick={handleClick}
        >
          <button type="button">Trigger</button>
        </Button>
      )

      const button = screen.getByTestId('button-aschild-forwarded')
      expect(button.tagName).toBe('BUTTON')
      expect(button).toHaveAttribute('data-slot', 'button')
      expect(button).toHaveAttribute('id', 'aschild-id')
      expect(button).toHaveAttribute('aria-label', 'anchor label')
      expect(button).toHaveAttribute('type', 'button')
      expect(button).toBeDisabled()

      // Disabled buttons don't fire onClick, so confirm the disabled
      // path: the click is suppressed by the browser before reaching
      // the handler.
      fireEvent.click(button)
      expect(handleClick).not.toHaveBeenCalled()
    })

    it('applies a non-default variant class when asChild is set', () => {
      render(
        <Button asChild variant="destructive">
          <a data-testid="button-aschild-destructive" href="/x">
            Destructive link
          </a>
        </Button>
      )

      const element = screen.getByTestId('button-aschild-destructive')
      expect(element.tagName).toBe('A')
      expect(element).toHaveAttribute('data-slot', 'button')
      expect(element).toHaveClass('bg-[color:var(--destructive)]')
      expect(element).toHaveClass('text-[color:var(--destructive-foreground)]')
      // Default-variant classes must NOT be present.
      expect(element).not.toHaveClass('bg-[color:var(--primary)]')
      expect(element).not.toHaveClass('text-[color:var(--primary-foreground)]')
    })

    it('applies a non-default size class when asChild is set', () => {
      render(
        <Button asChild size="icon">
          <a data-testid="button-aschild-icon" href="/x">
            Icon link
          </a>
        </Button>
      )

      const element = screen.getByTestId('button-aschild-icon')
      expect(element.tagName).toBe('A')
      expect(element).toHaveAttribute('data-slot', 'button')
      expect(element).toHaveClass('size-9')
      // Default-size utilities must NOT be present.
      expect(element).not.toHaveClass('h-9')
      expect(element).not.toHaveClass('px-4')
      expect(element).not.toHaveClass('py-2')
    })
  })

  describe('exported buttonVariants', () => {
    it('returns the expected class string for each (variant, size) pair when called directly', () => {
      // Calling buttonVariants directly (without rendering Button) is
      // supported because cva returns a callable function. The library
      // treats this as part of the public API; we verify it stays
      // callable + returns the cva-formatted class string.
      const classes = buttonVariants({
        size: 'sm',
        variant: 'destructive',
      })
      // The cva result is a space-separated string containing both
      // the base utilities and the variant + size utilities.
      expect(classes).toContain('bg-[color:var(--destructive)]')
      expect(classes).toContain('h-8')
      expect(classes).toContain('inline-flex')
      expect(classes).toContain('focus-visible:ring-2')
    })
  })
})
