import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { Toggle } from './toggle'

/**
 * Toggle (src/components/ui/toggle.tsx) - currently 0% coverage.
 *
 * Single function component that renders Radix Toggle Root as a
 * <button> with data-slot="toggle", driven by a cva with two axes:
 *   variant: default | outline
 *   size:    default | sm | lg
 * 2 x 3 = 6 combos need truthful per-combo assertions.
 *
 * cn() merges a custom className and forwards button props (id,
 * aria-*, data-*, handlers, disabled, pressed, defaultPressed,
 * onPressedChange).
 *
 * Radix manages data-state="on"|"off". The data-[state=on]:... tokens
 * are baked into the BASE cva string and always present in cn() output;
 * state is asserted via the data-state attribute, NOT toHaveClass.
 *
 * Mirrors Badge.test.tsx (PR #105) / Alert.test.tsx (PR #104) layout.
 */

describe('Toggle', () => {
  describe('default rendering', () => {
    it('renders a single <button> with data-slot=toggle, default variant x size combo, and unconditional cn() base classes', () => {
      const { container } = render(
        <Toggle data-testid="toggle-default">Default</Toggle>
      )
      const element = screen.getByTestId('toggle-default')
      expect(container.children).toHaveLength(1)
      // Radix Root renders via Primitive.button.
      expect(element.tagName).toBe('BUTTON')
      expect(element).toHaveAttribute('data-slot', 'toggle')

      // Default variant x default size tokens.
      expect(element).toHaveClass('bg-transparent')
      expect(element).toHaveClass('h-9')
      expect(element).toHaveClass('px-2')
      expect(element).toHaveClass('min-w-9')

      // Outline-only tokens absent.
      expect(element).not.toHaveClass('border')
      expect(element).not.toHaveClass('border-[color:var(--border)]')
      expect(element).not.toHaveClass('shadow-xs')

      // sm / lg size tokens absent.
      expect(element).not.toHaveClass('h-8')
      expect(element).not.toHaveClass('h-10')
      expect(element).not.toHaveClass('min-w-8')
      expect(element).not.toHaveClass('min-w-10')

      // Representative base classes.
      expect(element).toHaveClass('inline-flex')
      expect(element).toHaveClass('items-center')
      expect(element).toHaveClass('justify-center')
      expect(element).toHaveClass('gap-2')
      expect(element).toHaveClass('rounded-[var(--radius)]')
      expect(element).toHaveClass('text-sm')
      expect(element).toHaveClass('font-medium')
      expect(element).toHaveClass('hover:bg-[color:var(--muted)]')
      expect(element).toHaveClass('hover:text-[color:var(--muted-foreground)]')
      expect(element).toHaveClass('disabled:pointer-events-none')
      expect(element).toHaveClass('disabled:opacity-50')
      expect(element).toHaveClass('focus-visible:ring-2')
      expect(element).toHaveClass('focus-visible:ring-[color:var(--ring)]')
      expect(element).toHaveClass('focus-visible:ring-offset-2')
      expect(element).toHaveClass(
        'focus-visible:ring-offset-[color:var(--background)]'
      )
      expect(element).toHaveClass('outline-none')
      expect(element).toHaveClass('transition-[color,box-shadow]')
      expect(element).toHaveClass(
        'aria-invalid:ring-[color:var(--destructive)]'
      )
      expect(element).toHaveClass(
        'aria-invalid:border-[color:var(--destructive)]'
      )
      expect(element).toHaveClass('whitespace-nowrap')
      expect(element).toHaveClass('[&_svg]:pointer-events-none')
      expect(element).toHaveClass("[&_svg:not([class*='size-'])]:size-4")
      expect(element).toHaveClass('[&_svg]:shrink-0')

      // data-[state=on]:... tokens are in the BASE class string and
      // concatenated by cn() on every render.
      expect(element).toHaveClass('data-[state=on]:bg-[color:var(--accent)]')
      expect(element).toHaveClass(
        'data-[state=on]:text-[color:var(--accent-foreground)]'
      )

      // Initial state with no `pressed` / `defaultPressed` is off.
      expect(element).toHaveAttribute('data-state', 'off')
      expect(element).toHaveTextContent('Default')
    })
  })

  describe('variant: default', () => {
    it('keeps bg-transparent and the default variant block, with no outline tokens', () => {
      render(
        <Toggle data-testid="toggle-default-variant" variant="default">
          Default variant
        </Toggle>
      )
      const element = screen.getByTestId('toggle-default-variant')
      expect(element).toHaveAttribute('data-slot', 'toggle')

      expect(element).toHaveClass('bg-transparent')
      // Outline tokens absent.
      expect(element).not.toHaveClass('border')
      expect(element).not.toHaveClass('border-[color:var(--border)]')
      expect(element).not.toHaveClass('shadow-xs')
      expect(element).not.toHaveClass('hover:bg-[color:var(--accent)]/10')
      expect(element).not.toHaveClass(
        'hover:text-[color:var(--accent-foreground)]'
      )

      // Base classes still applied.
      expect(element).toHaveClass('inline-flex')
      expect(element).toHaveClass('rounded-[var(--radius)]')
    })
  })

  describe('variant: outline', () => {
    it('applies the outline variant tokens (border + shadow-xs + hover utilities) alongside the default base classes', () => {
      render(
        <Toggle data-testid="toggle-outline" variant="outline">
          Outline
        </Toggle>
      )
      const element = screen.getByTestId('toggle-outline')
      expect(element).toHaveAttribute('data-slot', 'toggle')

      // Outline-variant tokens.
      expect(element).toHaveClass('border')
      expect(element).toHaveClass('border-[color:var(--border)]')
      expect(element).toHaveClass('bg-transparent')
      expect(element).toHaveClass('shadow-xs')
      expect(element).toHaveClass('hover:bg-[color:var(--accent)]/10')
      expect(element).toHaveClass('hover:text-[color:var(--accent-foreground)]')

      // Base classes still applied.
      expect(element).toHaveClass('inline-flex')
      expect(element).toHaveClass('rounded-[var(--radius)]')
      expect(element).toHaveClass('focus-visible:ring-2')
    })
  })

  describe('size: default', () => {
    it('applies the default size tokens (h-9 px-2 min-w-9) and omits sm / lg size tokens', () => {
      render(
        <Toggle data-testid="toggle-size-default" size="default">
          Default size
        </Toggle>
      )
      const element = screen.getByTestId('toggle-size-default')
      expect(element).toHaveAttribute('data-slot', 'toggle')

      expect(element).toHaveClass('h-9')
      expect(element).toHaveClass('px-2')
      expect(element).toHaveClass('min-w-9')

      expect(element).not.toHaveClass('h-8')
      expect(element).not.toHaveClass('h-10')
      expect(element).not.toHaveClass('px-1.5')
      expect(element).not.toHaveClass('px-2.5')
      expect(element).not.toHaveClass('min-w-8')
      expect(element).not.toHaveClass('min-w-10')
    })
  })

  describe('size: sm', () => {
    it('applies the sm size tokens (h-8 px-1.5 min-w-8) and omits default / lg size tokens', () => {
      render(
        <Toggle data-testid="toggle-size-sm" size="sm">
          Small
        </Toggle>
      )
      const element = screen.getByTestId('toggle-size-sm')
      expect(element).toHaveAttribute('data-slot', 'toggle')

      expect(element).toHaveClass('h-8')
      expect(element).toHaveClass('px-1.5')
      expect(element).toHaveClass('min-w-8')

      expect(element).not.toHaveClass('h-9')
      expect(element).not.toHaveClass('h-10')
      expect(element).not.toHaveClass('px-2')
      expect(element).not.toHaveClass('px-2.5')
      expect(element).not.toHaveClass('min-w-9')
      expect(element).not.toHaveClass('min-w-10')
    })
  })

  describe('all six variant x size combos', () => {
    // 2 variants x 3 sizes = 6 combos. Each combo's truth table is
    // documented in the data array: tokens that MUST be present
    // (because they belong to the active variant/size) and tokens
    // that MUST be absent (because they belong to the other
    // variant/size).
    const combos = [
      {
        name: 'default x default',
        variant: 'default' as const,
        size: 'default' as const,
        has: ['bg-transparent', 'h-9', 'px-2', 'min-w-9'],
        lacks: [
          'border',
          'border-[color:var(--border)]',
          'shadow-xs',
          'h-8',
          'h-10',
          'min-w-8',
          'min-w-10',
        ],
      },
      {
        name: 'default x sm',
        variant: 'default' as const,
        size: 'sm' as const,
        has: ['bg-transparent', 'h-8', 'px-1.5', 'min-w-8'],
        lacks: [
          'border',
          'shadow-xs',
          'h-9',
          'h-10',
          'px-2',
          'min-w-9',
          'min-w-10',
        ],
      },
      {
        name: 'default x lg',
        variant: 'default' as const,
        size: 'lg' as const,
        has: ['bg-transparent', 'h-10', 'px-2.5', 'min-w-10'],
        lacks: [
          'border',
          'shadow-xs',
          'h-9',
          'h-8',
          'px-2',
          'px-1.5',
          'min-w-9',
          'min-w-8',
        ],
      },
      {
        name: 'outline x default',
        variant: 'outline' as const,
        size: 'default' as const,
        has: [
          'border',
          'border-[color:var(--border)]',
          'shadow-xs',
          'h-9',
          'px-2',
          'min-w-9',
        ],
        lacks: ['h-8', 'h-10', 'min-w-8', 'min-w-10'],
      },
      {
        name: 'outline x sm',
        variant: 'outline' as const,
        size: 'sm' as const,
        has: [
          'border',
          'border-[color:var(--border)]',
          'shadow-xs',
          'h-8',
          'px-1.5',
          'min-w-8',
        ],
        lacks: ['h-9', 'h-10', 'px-2', 'min-w-9', 'min-w-10'],
      },
      {
        name: 'outline x lg',
        variant: 'outline' as const,
        size: 'lg' as const,
        has: [
          'border',
          'border-[color:var(--border)]',
          'shadow-xs',
          'h-10',
          'px-2.5',
          'min-w-10',
        ],
        lacks: ['h-9', 'h-8', 'px-2', 'px-1.5', 'min-w-9', 'min-w-8'],
      },
    ]

    it.each(combos)(
      '$name: applies its tokens and omits the others',
      ({ variant, size, has, lacks }) => {
        render(
          <Toggle
            data-testid={`toggle-combo-${variant}-${size}`}
            size={size}
            variant={variant}
          >
            {variant} {size}
          </Toggle>
        )
        const element = screen.getByTestId(`toggle-combo-${variant}-${size}`)
        expect(element).toHaveAttribute('data-slot', 'toggle')
        for (const cls of has) {
          expect(element).toHaveClass(cls)
        }
        for (const cls of lacks) {
          expect(element).not.toHaveClass(cls)
        }
      }
    )
  })

  describe('pressed prop / data-state', () => {
    it('renders data-state="on" when pressed={true}', () => {
      render(
        <Toggle data-testid="toggle-pressed-on" pressed>
          Pressed on
        </Toggle>
      )
      const element = screen.getByTestId('toggle-pressed-on')
      expect(element).toHaveAttribute('data-slot', 'toggle')
      expect(element).toHaveAttribute('data-state', 'on')
      // Type stays "button" via Primitive.button default.
      expect(element.tagName).toBe('BUTTON')
    })

    it('renders data-state="off" when pressed={false} explicitly', () => {
      render(
        <Toggle data-testid="toggle-pressed-off" pressed={false}>
          Pressed off
        </Toggle>
      )
      const element = screen.getByTestId('toggle-pressed-off')
      expect(element).toHaveAttribute('data-state', 'off')
    })

    it('flips data-state via click when uncontrolled (no `pressed` prop) and fires onPressedChange', () => {
      const onPressedChange = vi.fn()
      render(
        <Toggle
          data-testid="toggle-uncontrolled"
          onPressedChange={onPressedChange}
        >
          Uncontrolled
        </Toggle>
      )
      const element = screen.getByTestId('toggle-uncontrolled')
      expect(element).toHaveAttribute('data-state', 'off')

      fireEvent.click(element)
      expect(element).toHaveAttribute('data-state', 'on')
      expect(onPressedChange).toHaveBeenCalledTimes(1)
      expect(onPressedChange).toHaveBeenCalledWith(true)

      // Click again flips back to off.
      fireEvent.click(element)
      expect(element).toHaveAttribute('data-state', 'off')
      expect(onPressedChange).toHaveBeenCalledTimes(2)
      expect(onPressedChange).toHaveBeenLastCalledWith(false)
    })
  })

  describe('disabled', () => {
    it('sets the disabled attribute on the button and prevents clicks from flipping state', () => {
      const onPressedChange = vi.fn()
      render(
        <Toggle
          data-testid="toggle-disabled"
          disabled
          onPressedChange={onPressedChange}
        >
          Disabled
        </Toggle>
      )
      const element = screen.getByTestId('toggle-disabled')
      expect(element).toHaveAttribute('data-slot', 'toggle')
      expect(element).toBeDisabled()
      // Radix refuses to toggle when disabled.
      expect(element).toHaveAttribute('data-state', 'off')

      fireEvent.click(element)
      // State must NOT have flipped, and onPressedChange must NOT
      // have fired.
      expect(element).toHaveAttribute('data-state', 'off')
      expect(onPressedChange).not.toHaveBeenCalled()
    })
  })

  describe('className merge', () => {
    it('merges a custom className onto the cn() output alongside variant / size tokens', () => {
      render(
        <Toggle
          className="custom-toggle-class"
          data-testid="toggle-custom-class"
          size="sm"
          variant="outline"
        >
          Custom class
        </Toggle>
      )
      const element = screen.getByTestId('toggle-custom-class')
      // Variant + size tokens still present.
      expect(element).toHaveClass('border')
      expect(element).toHaveClass('shadow-xs')
      expect(element).toHaveClass('h-8')
      expect(element).toHaveClass('px-1.5')
      expect(element).toHaveClass('min-w-8')
      // User-supplied class lands alongside.
      expect(element).toHaveClass('custom-toggle-class')
    })
  })

  describe('props forwarding', () => {
    it('forwards id, aria-*, data-*, and title onto the underlying button', () => {
      render(
        <Toggle
          aria-label="toggle label"
          data-custom="custom-value"
          data-testid="toggle-forwarded"
          id="toggle-id"
          title="toggle title"
        >
          Forwarded
        </Toggle>
      )
      const element = screen.getByTestId('toggle-forwarded')
      expect(element).toHaveAttribute('id', 'toggle-id')
      expect(element).toHaveAttribute('aria-label', 'toggle label')
      expect(element).toHaveAttribute('data-custom', 'custom-value')
      expect(element).toHaveAttribute('title', 'toggle title')
    })

    it('forwards onClick and the click handler fires alongside the toggle state flip', () => {
      const handleClick = vi.fn()
      render(
        <Toggle data-testid="toggle-onclick" onClick={handleClick}>
          Click
        </Toggle>
      )
      const element = screen.getByTestId('toggle-onclick')
      fireEvent.click(element)
      expect(handleClick).toHaveBeenCalledTimes(1)
      expect(element).toHaveAttribute('data-state', 'on')
    })

    it('respects defaultPressed for the initial uncontrolled state', () => {
      render(
        <Toggle data-testid="toggle-default-pressed" defaultPressed>
          Default pressed
        </Toggle>
      )
      const element = screen.getByTestId('toggle-default-pressed')
      expect(element).toHaveAttribute('data-slot', 'toggle')
      expect(element).toHaveAttribute('data-state', 'on')
    })
  })
})
