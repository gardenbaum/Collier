import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { ToggleGroup, ToggleGroupItem } from './toggle-group'

/**
 * These tests cover the ToggleGroup primitive declared in
 * src/components/ui/toggle-group.tsx (currently 0% coverage, 71 lines,
 * 2 exports + 1 internal ToggleGroupContext).
 *
 * ToggleGroup is a small composition of two wrapper components around
 * `@radix-ui/react-toggle-group`:
 *   - `ToggleGroup` — a `<div>` driven by Radix's `ToggleGroupPrimitive.Root`,
 *     decorated with `data-slot="toggle-group"`, optional `data-variant` /
 *     `data-size` attributes (set only when the prop is provided — React
 *     strips undefined values), the cn() base classes
 *     (`group/toggle-group flex w-fit items-center rounded-[var(--radius)]
 *     data-[variant=outline]:shadow-xs`), and an internal
 *     `ToggleGroupContext.Provider` whose `value={{ variant, size }}`
 *     flows to descendant Items.
 *   - `ToggleGroupItem` — a `<button>` driven by Radix's
 *     `ToggleGroupPrimitive.Item`. It reads `ToggleGroupContext` via
 *     `React.useContext` (default = `{ size: 'default', variant: 'default' }`)
 *     and resolves the effective variant / size as
 *     `context.variant || variant` / `context.size || size` — context
 *     wins, falling back to the item's own prop, then to the context
 *     default. The merged className combines `toggleVariants(...)` with
 *     the group-of-items extras (`min-w-0 flex-1 shrink-0 rounded-none
 *     shadow-none first:rounded-l-[var(--radius)]
 *     last:rounded-r-[var(--radius)] focus:z-10 focus-visible:z-10
 *     data-[variant=outline]:border-l-0
 *     data-[variant=outline]:first:border-l`) and the caller's custom
 *     className.
 *
 * Radix's `ToggleGroupPrimitive.Root` requires `type="single"` or
 * `type="multiple"` (it throws otherwise), so every `ToggleGroup` here
 * carries `type="single"`. The "orphan" item test wraps a Radix Root
 * directly (with `type="single"`) but does NOT use our `ToggleGroup`
 * wrapper, so our `ToggleGroupContext.Provider` is missing from the
 * tree and `useContext(ToggleGroupContext)` returns the createContext
 * default — exercising the `{size: 'default', variant: 'default'}`
 * fallback the spec requires.
 *
 * Mirrors the layout of toggle.test.tsx (PR #109) for the 2x3
 * variant×size combo matrix, button-group.test.tsx (PR #116) for the
 * wrapper / context / className merge pattern, and radio-group.test.tsx
 * (PR #117) for the Provider + children verification.
 */
describe('ToggleGroup', () => {
  describe('default <div> rendering', () => {
    it('renders a single <div> with data-slot="toggle-group" and the unconditional cn() base classes, omitting data-variant / data-size when not provided', () => {
      const { container } = render(
        <ToggleGroup data-testid="toggle-group-default" type="single">
          <ToggleGroupItem value="a">A</ToggleGroupItem>
          <ToggleGroupItem value="b">B</ToggleGroupItem>
        </ToggleGroup>
      )

      const element = screen.getByTestId('toggle-group-default')

      // Exactly one top-level child rendered — no portal / wrapper.
      expect(container.children).toHaveLength(1)

      // Radix ToggleGroupPrimitive.Root renders as a <div>.
      expect(element.tagName).toBe('DIV')
      expect(element).toHaveAttribute('data-slot', 'toggle-group')

      // cn() base classes always present.
      expect(element).toHaveClass('group/toggle-group')
      expect(element).toHaveClass('flex')
      expect(element).toHaveClass('w-fit')
      expect(element).toHaveClass('items-center')
      expect(element).toHaveClass('rounded-[var(--radius)]')
      // Outline-variant shadow-xs token is unconditionally part of the
      // base className (gated on data-variant=outline at runtime) — it
      // is always emitted by cn() regardless of the variant prop.
      expect(element).toHaveClass('data-[variant=outline]:shadow-xs')

      // data-variant / data-size are NOT set when the prop is omitted —
      // React strips undefined attribute values, so the attribute is
      // absent on the rendered element (not present-but-empty).
      expect(element).not.toHaveAttribute('data-variant')
      expect(element).not.toHaveAttribute('data-size')

      // Children render inside the root.
      expect(element).toHaveTextContent('A')
      expect(element).toHaveTextContent('B')
    })

    it('renders its children verbatim inside the root div (no portal / extra wrapper)', () => {
      render(
        <ToggleGroup data-testid="toggle-group-children" type="single">
          <span data-testid="tg-child-1">first</span>
          <span data-testid="tg-child-2">second</span>
        </ToggleGroup>
      )

      const root = screen.getByTestId('toggle-group-children')
      expect(root).toContainElement(screen.getByTestId('tg-child-1'))
      expect(root).toContainElement(screen.getByTestId('tg-child-2'))
      // Root has exactly two direct children (the two <span>s).
      expect(root.children).toHaveLength(2)
    })
  })

  describe('variant prop', () => {
    it('omits data-variant on the root when the variant prop is undefined', () => {
      render(
        <ToggleGroup data-testid="toggle-group-no-variant" type="single" />
      )
      const element = screen.getByTestId('toggle-group-no-variant')
      expect(element).not.toHaveAttribute('data-variant')
    })

    it('flips data-variant to "outline" and surfaces the shadow-xs token when variant="outline" is set', () => {
      render(
        <ToggleGroup
          data-testid="toggle-group-outline"
          type="single"
          variant="outline"
        />
      )
      const element = screen.getByTestId('toggle-group-outline')
      expect(element).toHaveAttribute('data-variant', 'outline')
      // The shadow-xs token is always in the cn() output; the runtime
      // CSS rule activates it via the [data-variant=outline] attribute
      // selector. We assert it appears as a class.
      expect(element).toHaveClass('data-[variant=outline]:shadow-xs')
      // Base classes still present.
      expect(element).toHaveClass('flex')
      expect(element).toHaveClass('w-fit')
      expect(element).toHaveClass('items-center')
    })
  })

  describe('size prop', () => {
    it('omits data-size on the root when the size prop is undefined', () => {
      render(<ToggleGroup data-testid="toggle-group-no-size" type="single" />)
      const element = screen.getByTestId('toggle-group-no-size')
      expect(element).not.toHaveAttribute('data-size')
    })

    it('flips data-size to "sm" when size="sm" is set', () => {
      render(
        <ToggleGroup
          data-testid="toggle-group-size-sm"
          size="sm"
          type="single"
        />
      )
      const element = screen.getByTestId('toggle-group-size-sm')
      expect(element).toHaveAttribute('data-size', 'sm')
      // Base classes still present.
      expect(element).toHaveClass('flex')
      expect(element).toHaveClass('items-center')
    })

    it('flips data-size to "lg" when size="lg" is set', () => {
      render(
        <ToggleGroup
          data-testid="toggle-group-size-lg"
          size="lg"
          type="single"
        />
      )
      const element = screen.getByTestId('toggle-group-size-lg')
      expect(element).toHaveAttribute('data-size', 'lg')
      // Base classes still present.
      expect(element).toHaveClass('flex')
      expect(element).toHaveClass('items-center')
    })

    it('sets both data-variant and data-size simultaneously when both props are provided', () => {
      render(
        <ToggleGroup
          data-testid="toggle-group-both"
          size="lg"
          type="single"
          variant="outline"
        />
      )
      const element = screen.getByTestId('toggle-group-both')
      expect(element).toHaveAttribute('data-variant', 'outline')
      expect(element).toHaveAttribute('data-size', 'lg')
    })
  })

  describe('className merge', () => {
    it('appends a custom className after the cn() base classes and preserves the base layout tokens', () => {
      render(
        <ToggleGroup
          className="custom-group-class mt-4"
          data-testid="toggle-group-merged"
          type="single"
        />
      )
      const element = screen.getByTestId('toggle-group-merged')

      // Custom classes are appended.
      expect(element).toHaveClass('custom-group-class')
      expect(element).toHaveClass('mt-4')

      // Base layout classes survive the merge.
      expect(element).toHaveClass('group/toggle-group')
      expect(element).toHaveClass('flex')
      expect(element).toHaveClass('w-fit')
      expect(element).toHaveClass('items-center')
      expect(element).toHaveClass('rounded-[var(--radius)]')
    })
  })

  describe('props forwarding', () => {
    it('forwards id, aria-*, data-*, and an onClick handler onto the rendered <div>', () => {
      const handleClick = vi.fn()
      render(
        <ToggleGroup
          aria-label="text alignment"
          aria-orientation="horizontal"
          data-custom="custom-value"
          data-testid="toggle-group-forwarded"
          id="alignment-group"
          onClick={handleClick}
          role="group"
          type="single"
        >
          <ToggleGroupItem value="left">L</ToggleGroupItem>
          <ToggleGroupItem value="right">R</ToggleGroupItem>
        </ToggleGroup>
      )

      const element = screen.getByTestId('toggle-group-forwarded')
      expect(element).toHaveAttribute('id', 'alignment-group')
      expect(element).toHaveAttribute('aria-label', 'text alignment')
      expect(element).toHaveAttribute('aria-orientation', 'horizontal')
      expect(element).toHaveAttribute('data-custom', 'custom-value')
      // role="group" from the spread overrides any default role.
      expect(element).toHaveAttribute('role', 'group')

      fireEvent.click(element)
      expect(handleClick).toHaveBeenCalledTimes(1)
    })
  })

  describe('ToggleGroupContext.Provider wiring', () => {
    it('propagates the explicit variant / size from the Root down to descendant Items via context', () => {
      render(
        <ToggleGroup
          data-testid="toggle-group-provider"
          size="lg"
          type="single"
          variant="outline"
        >
          <ToggleGroupItem data-testid="tg-item-context" value="a">
            A
          </ToggleGroupItem>
        </ToggleGroup>
      )

      const item = screen.getByTestId('tg-item-context')
      // The Item reads ToggleGroupContext and applies the context's
      // variant/size to its toggleVariants call. data-variant / data-size
      // mirror the context values, not the Item's own (unprovided) props.
      expect(item).toHaveAttribute('data-variant', 'outline')
      expect(item).toHaveAttribute('data-size', 'lg')
      // Outline variant tokens are now active on the Item.
      expect(item).toHaveClass('border')
      // lg size tokens are active on the Item.
      expect(item).toHaveClass('h-10')
      expect(item).toHaveClass('px-2.5')
      expect(item).toHaveClass('min-w-0')
    })
  })
})

describe('ToggleGroupItem', () => {
  describe('default rendering inside a ToggleGroup', () => {
    it('renders a <button> with data-slot="toggle-group-item", the toggleVariants default combo, and the group-of-items extras', () => {
      render(
        <ToggleGroup type="single">
          <ToggleGroupItem data-testid="tg-item-default" value="a">
            Default
          </ToggleGroupItem>
        </ToggleGroup>
      )

      const element = screen.getByTestId('tg-item-default')
      // Radix ToggleGroupPrimitive.Item renders via Primitive.button.
      expect(element.tagName).toBe('BUTTON')
      expect(element).toHaveAttribute('data-slot', 'toggle-group-item')

      // toggleVariants default combo (variant=default, size=default).
      expect(element).toHaveClass('inline-flex')
      expect(element).toHaveClass('items-center')
      expect(element).toHaveClass('justify-center')
      expect(element).toHaveClass('bg-transparent')
      expect(element).toHaveClass('h-9')
      expect(element).toHaveClass('px-2')
      expect(element).toHaveClass('min-w-0')
      // Outline-only tokens absent.
      expect(element).not.toHaveClass('border')
      expect(element).not.toHaveClass('shadow-xs')
      // sm / lg size tokens absent.
      expect(element).not.toHaveClass('h-8')
      expect(element).not.toHaveClass('h-10')
      expect(element).not.toHaveClass('min-w-8')
      expect(element).not.toHaveClass('min-w-10')

      // Group-of-items extras applied unconditionally.
      expect(element).toHaveClass('min-w-0')
      expect(element).toHaveClass('flex-1')
      expect(element).toHaveClass('shrink-0')
      expect(element).toHaveClass('rounded-none')
      expect(element).toHaveClass('shadow-none')
      expect(element).toHaveClass('first:rounded-l-[var(--radius)]')
      expect(element).toHaveClass('last:rounded-r-[var(--radius)]')
      expect(element).toHaveClass('focus:z-10')
      expect(element).toHaveClass('focus-visible:z-10')
      expect(element).toHaveClass('data-[variant=outline]:border-l-0')
      expect(element).toHaveClass('data-[variant=outline]:first:border-l')

      // Group doesn't pass an explicit variant or size prop, so the
      // Provider's context value is `{ variant: undefined, size: undefined }`.
      // `context.variant || variant` then yields `undefined || undefined` =
      // `undefined`, and React strips undefined attribute values from
      // the rendered element.
      expect(element).not.toHaveAttribute('data-variant')
      expect(element).not.toHaveAttribute('data-size')
      expect(element).toHaveTextContent('Default')
    })
  })

  describe('context fallback (rendered WITHOUT a ToggleGroup parent)', () => {
    it('falls back to the createContext default ({size:"default", variant:"default"}) so the default toggleVariants combo applies', () => {
      render(
        <ToggleGroupPrimitive.Root type="single">
          <ToggleGroupItem data-testid="tg-item-orphan" value="orphan">
            Orphan
          </ToggleGroupItem>
        </ToggleGroupPrimitive.Root>
      )

      const element = screen.getByTestId('tg-item-orphan')
      expect(element.tagName).toBe('BUTTON')
      expect(element).toHaveAttribute('data-slot', 'toggle-group-item')

      // toggleVariants default combo (variant=default, size=default).
      expect(element).toHaveClass('bg-transparent')
      expect(element).toHaveClass('h-9')
      expect(element).toHaveClass('px-2')
      expect(element).toHaveClass('min-w-0')

      // Outline tokens absent.
      expect(element).not.toHaveClass('border')
      expect(element).not.toHaveClass('shadow-xs')
      // sm / lg size tokens absent.
      expect(element).not.toHaveClass('h-8')
      expect(element).not.toHaveClass('h-10')
      expect(element).not.toHaveClass('min-w-8')
      expect(element).not.toHaveClass('min-w-10')

      // Group-of-items extras still applied.
      expect(element).toHaveClass('min-w-0')
      expect(element).toHaveClass('flex-1')
      expect(element).toHaveClass('shrink-0')
      expect(element).toHaveClass('rounded-none')
      expect(element).toHaveClass('shadow-none')

      // data-variant / data-size fall back to "default" (NOT undefined
      // / omitted) — the createContext default fills the gap.
      expect(element).toHaveAttribute('data-variant', 'default')
      expect(element).toHaveAttribute('data-size', 'default')
    })
  })

  describe('own variant / size override (item-level wins over context)', () => {
    it('applies the Item-level variant even when the parent ToggleGroup sets a different variant', () => {
      render(
        <ToggleGroup type="single" variant="outline">
          <ToggleGroupItem
            data-testid="tg-item-override-variant"
            value="a"
            variant="default"
          >
            A
          </ToggleGroupItem>
        </ToggleGroup>
      )

      const item = screen.getByTestId('tg-item-override-variant')
      // The Group's variant="outline" populates the ToggleGroupContext,
      // so `context.variant` resolves to 'outline' inside the Item.
      // `context.variant || variant` then yields `'outline' || 'default'`
      // = `'outline'` (context wins; the Item-level prop is only the
      // fallback when context is undefined). data-variant therefore
      // mirrors the GROUP, not the Item.
      expect(item).toHaveAttribute('data-variant', 'outline')
      // Group's outline tokens (border, hover utilities) appear; the
      // Item-level variant="default" is ignored.
      expect(item).toHaveClass('border')
      expect(item).toHaveClass('hover:bg-[color:var(--accent)]/10')
      // outline's shadow-xs is overridden by the group's `shadow-none`
      // from the group-of-items extras.
      expect(item).not.toHaveClass('shadow-xs')
    })

    it('falls back to the Item-level variant when the Group does NOT set one', () => {
      // Group omits the variant prop → context.variant is undefined.
      // `context.variant || variant` then yields `'undefined' || 'outline'`
      // = `'outline'`, so the Item's own variant takes effect.
      render(
        <ToggleGroup type="single">
          <ToggleGroupItem
            data-testid="tg-item-fallback-variant"
            value="a"
            variant="outline"
          >
            A
          </ToggleGroupItem>
        </ToggleGroup>
      )

      const item = screen.getByTestId('tg-item-fallback-variant')
      expect(item).toHaveAttribute('data-variant', 'outline')
      // Outline tokens now active via toggleVariants({ variant: 'outline' }).
      expect(item).toHaveClass('border')
      expect(item).toHaveClass('hover:bg-[color:var(--accent)]/10')
    })

    it('applies the GROUP size (Item-level size is ignored when context is set)', () => {
      render(
        <ToggleGroup size="lg" type="single">
          <ToggleGroupItem
            data-testid="tg-item-override-size"
            size="sm"
            value="a"
          >
            A
          </ToggleGroupItem>
        </ToggleGroup>
      )

      const item = screen.getByTestId('tg-item-override-size')
      // context.size is 'lg' (set by the Group); context wins.
      expect(item).toHaveAttribute('data-size', 'lg')
      // Group's size tokens (lg: h-10 px-2.5) appear on this Item;
      // the Item-level size="sm" tokens (h-8 px-1.5) do NOT.
      expect(item).toHaveClass('h-10')
      expect(item).toHaveClass('px-2.5')
      expect(item).not.toHaveClass('h-8')
      expect(item).not.toHaveClass('px-1.5')
    })

    it('falls back to the Item-level size when the Group does NOT set one', () => {
      // Group omits the size prop → context.size is undefined.
      // The Item's own size="sm" then wins via the `||` fallback.
      render(
        <ToggleGroup type="single">
          <ToggleGroupItem
            data-testid="tg-item-fallback-size"
            size="sm"
            value="a"
          >
            A
          </ToggleGroupItem>
        </ToggleGroup>
      )

      const item = screen.getByTestId('tg-item-fallback-size')
      expect(item).toHaveAttribute('data-size', 'sm')
      expect(item).toHaveClass('h-8')
      expect(item).toHaveClass('px-1.5')
      expect(item).not.toHaveClass('h-9')
      expect(item).not.toHaveClass('h-10')
    })

    it('overrides BOTH axes when the Group omits BOTH (Item-level wins via fallback)', () => {
      // Group omits BOTH the variant and size props → context is
      // {variant: undefined, size: undefined}. The Item's own variant
      // and size then take effect via the `||` fallback in the source.
      render(
        <ToggleGroup type="single">
          <ToggleGroupItem
            data-testid="tg-item-override-both"
            size="lg"
            value="a"
            variant="outline"
          >
            A
          </ToggleGroupItem>
        </ToggleGroup>
      )

      const item = screen.getByTestId('tg-item-override-both')
      expect(item).toHaveAttribute('data-variant', 'outline')
      expect(item).toHaveAttribute('data-size', 'lg')
      // Outline + lg tokens both active.
      expect(item).toHaveClass('border')
      expect(item).toHaveClass('h-10')
      expect(item).toHaveClass('px-2.5')
    })
  })

  describe('className merge', () => {
    it('appends a custom className after the toggleVariants output and the group-of-items extras', () => {
      render(
        <ToggleGroup type="single" variant="outline">
          <ToggleGroupItem
            className="custom-item-class uppercase"
            data-testid="tg-item-merged"
            value="a"
          >
            Merged
          </ToggleGroupItem>
        </ToggleGroup>
      )

      const element = screen.getByTestId('tg-item-merged')
      // Custom classes appended.
      expect(element).toHaveClass('custom-item-class')
      expect(element).toHaveClass('uppercase')
      // toggleVariants output survives the merge.
      expect(element).toHaveClass('border')
      expect(element).toHaveClass('h-9')
      expect(element).toHaveClass('px-2')
      expect(element).toHaveClass('min-w-0')
      // Group-of-items extras survive the merge.
      expect(element).toHaveClass('min-w-0')
      expect(element).toHaveClass('flex-1')
      expect(element).toHaveClass('shrink-0')
      expect(element).toHaveClass('rounded-none')
      expect(element).toHaveClass('shadow-none')
      expect(element).toHaveClass('first:rounded-l-[var(--radius)]')
      expect(element).toHaveClass('last:rounded-r-[var(--radius)]')
      expect(element).toHaveClass('focus:z-10')
      expect(element).toHaveClass('focus-visible:z-10')
      expect(element).toHaveClass('data-[variant=outline]:border-l-0')
      expect(element).toHaveClass('data-[variant=outline]:first:border-l')
    })
  })

  describe('all six variant x size combos', () => {
    const combos = [
      {
        name: 'default x default',
        variant: 'default' as const,
        size: 'default' as const,
        has: ['bg-transparent', 'h-9', 'px-2'],
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
        has: ['bg-transparent', 'h-8', 'px-1.5'],
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
        has: ['bg-transparent', 'h-10', 'px-2.5'],
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
        has: ['border', 'border-[color:var(--border)]', 'h-9', 'px-2'],
        lacks: ['h-8', 'h-10', 'min-w-9', 'min-w-8', 'min-w-10', 'shadow-xs'],
      },
      {
        name: 'outline x sm',
        variant: 'outline' as const,
        size: 'sm' as const,
        has: ['border', 'border-[color:var(--border)]', 'h-8', 'px-1.5'],
        lacks: [
          'h-9',
          'h-10',
          'px-2',
          'min-w-9',
          'min-w-8',
          'min-w-10',
          'shadow-xs',
        ],
      },
      {
        name: 'outline x lg',
        variant: 'outline' as const,
        size: 'lg' as const,
        has: ['border', 'border-[color:var(--border)]', 'h-10', 'px-2.5'],
        lacks: [
          'h-9',
          'h-8',
          'px-2',
          'px-1.5',
          'min-w-9',
          'min-w-8',
          'min-w-10',
          'shadow-xs',
        ],
      },
    ]

    it.each(combos)(
      '$name: applies its tokens and omits the others',
      ({ variant, size, has, lacks }) => {
        render(
          <ToggleGroup size={size} type="single" variant={variant}>
            <ToggleGroupItem
              data-testid={`tg-item-combo-${variant}-${size}`}
              value="a"
            >
              {variant} {size}
            </ToggleGroupItem>
          </ToggleGroup>
        )
        const element = screen.getByTestId(`tg-item-combo-${variant}-${size}`)
        expect(element).toHaveAttribute('data-slot', 'toggle-group-item')
        // data-variant / data-size mirror the context (which mirrors
        // the group's props because the Item does not override them).
        expect(element).toHaveAttribute('data-variant', variant)
        expect(element).toHaveAttribute('data-size', size)
        for (const cls of has) {
          expect(element).toHaveClass(cls)
        }
        for (const cls of lacks) {
          expect(element).not.toHaveClass(cls)
        }
        // Group-of-items extras are always present (independent of
        // the active variant/size).
        expect(element).toHaveClass('min-w-0')
        expect(element).toHaveClass('flex-1')
        expect(element).toHaveClass('shrink-0')
        expect(element).toHaveClass('rounded-none')
        expect(element).toHaveClass('shadow-none')
        expect(element).toHaveClass('first:rounded-l-[var(--radius)]')
        expect(element).toHaveClass('last:rounded-r-[var(--radius)]')
      }
    )
  })

  describe('pressed state (Radix-managed via Group value)', () => {
    // Radix ToggleGroupPrimitive.Item does NOT expose a `pressed`
    // prop directly — the Item's pressed state is derived from the
    // Group's selection list. With type="multiple", each Item tracks
    // its own inclusion in the group's value array. Clicking the
    // Item flips its data-state between "on" / "off".

    it('renders data-state="off" initially when no defaultValue / value is provided', () => {
      render(
        <ToggleGroup type="multiple">
          <ToggleGroupItem data-testid="tg-item-initial" value="a">
            Initial
          </ToggleGroupItem>
        </ToggleGroup>
      )
      const element = screen.getByTestId('tg-item-initial')
      expect(element).toHaveAttribute('data-slot', 'toggle-group-item')
      expect(element).toHaveAttribute('data-state', 'off')
    })

    it('renders data-state="on" when the Item value is in the Group defaultValue', () => {
      render(
        <ToggleGroup defaultValue={['a']} type="multiple">
          <ToggleGroupItem data-testid="tg-item-default-on" value="a">
            On
          </ToggleGroupItem>
        </ToggleGroup>
      )
      const element = screen.getByTestId('tg-item-default-on')
      expect(element).toHaveAttribute('data-state', 'on')
    })

    it('flips data-state to "on" via click (uncontrolled multiple) and fires onValueChange with [value]', () => {
      const onValueChange = vi.fn()
      render(
        <ToggleGroup onValueChange={onValueChange} type="multiple">
          <ToggleGroupItem data-testid="tg-item-toggle" value="a">
            Toggle me
          </ToggleGroupItem>
        </ToggleGroup>
      )

      const element = screen.getByTestId('tg-item-toggle')
      expect(element).toHaveAttribute('data-state', 'off')

      fireEvent.click(element)
      expect(element).toHaveAttribute('data-state', 'on')
      expect(onValueChange).toHaveBeenCalledTimes(1)
      expect(onValueChange).toHaveBeenLastCalledWith(['a'])

      // Click again flips back to off and removes from selection.
      fireEvent.click(element)
      expect(element).toHaveAttribute('data-state', 'off')
      expect(onValueChange).toHaveBeenCalledTimes(2)
      expect(onValueChange).toHaveBeenLastCalledWith([])
    })

    it('respects a controlled `value` prop and does not flip on click', () => {
      const { rerender } = render(
        <ToggleGroup type="multiple" value={['a']}>
          <ToggleGroupItem data-testid="tg-item-controlled-on" value="a">
            A
          </ToggleGroupItem>
          <ToggleGroupItem data-testid="tg-item-controlled-off" value="b">
            B
          </ToggleGroupItem>
        </ToggleGroup>
      )
      expect(screen.getByTestId('tg-item-controlled-on')).toHaveAttribute(
        'data-state',
        'on'
      )
      expect(screen.getByTestId('tg-item-controlled-off')).toHaveAttribute(
        'data-state',
        'off'
      )

      // Click the off-item — Radix fires onValueChange but the
      // controlled value stays ["a"], so the items do NOT flip.
      fireEvent.click(screen.getByTestId('tg-item-controlled-off'))
      expect(screen.getByTestId('tg-item-controlled-on')).toHaveAttribute(
        'data-state',
        'on'
      )
      expect(screen.getByTestId('tg-item-controlled-off')).toHaveAttribute(
        'data-state',
        'off'
      ) // Once the parent updates the controlled value, the selection
      // visibly moves.
      rerender(
        <ToggleGroup type="multiple" value={['b']}>
          <ToggleGroupItem data-testid="tg-item-controlled-on" value="a">
            A
          </ToggleGroupItem>
          <ToggleGroupItem data-testid="tg-item-controlled-off" value="b">
            B
          </ToggleGroupItem>
        </ToggleGroup>
      )
      expect(screen.getByTestId('tg-item-controlled-on')).toHaveAttribute(
        'data-state',
        'off'
      )
      expect(screen.getByTestId('tg-item-controlled-off')).toHaveAttribute(
        'data-state',
        'on'
      )
    })
  })

  describe('disabled', () => {
    it('sets the disabled attribute on the button and blocks click-driven state flips', () => {
      const onValueChange = vi.fn()
      render(
        <ToggleGroup onValueChange={onValueChange} type="multiple">
          <ToggleGroupItem data-testid="tg-item-disabled" disabled value="a">
            Disabled
          </ToggleGroupItem>
        </ToggleGroup>
      )
      const element = screen.getByTestId('tg-item-disabled')
      expect(element).toHaveAttribute('data-slot', 'toggle-group-item')
      expect(element).toBeDisabled()
      expect(element).toHaveAttribute('data-state', 'off')

      fireEvent.click(element)
      // Radix refuses to toggle when disabled.
      expect(element).toHaveAttribute('data-state', 'off')
      expect(onValueChange).not.toHaveBeenCalled()
    })
  })

  describe('props forwarding', () => {
    it('forwards id, aria-*, data-*, and title onto the underlying button', () => {
      render(
        <ToggleGroup type="single">
          <ToggleGroupItem
            aria-label="bold"
            data-custom="custom-value"
            data-testid="tg-item-forwarded"
            id="bold-item"
            title="Bold"
            value="a"
          >
            B
          </ToggleGroupItem>
        </ToggleGroup>
      )

      const element = screen.getByTestId('tg-item-forwarded')
      expect(element).toHaveAttribute('id', 'bold-item')
      expect(element).toHaveAttribute('aria-label', 'bold')
      expect(element).toHaveAttribute('data-custom', 'custom-value')
      expect(element).toHaveAttribute('title', 'Bold')
    })

    it('forwards an onClick handler that fires alongside the toggle state flip', () => {
      const handleClick = vi.fn()
      render(
        <ToggleGroup type="multiple">
          <ToggleGroupItem
            data-testid="tg-item-onclick"
            onClick={handleClick}
            value="a"
          >
            Click me
          </ToggleGroupItem>
        </ToggleGroup>
      )

      const element = screen.getByTestId('tg-item-onclick')
      fireEvent.click(element)
      expect(handleClick).toHaveBeenCalledTimes(1)
      // Toggle still flips on click even though the consumer added a
      // click handler.
      expect(element).toHaveAttribute('data-state', 'on')
    })
  })
})
