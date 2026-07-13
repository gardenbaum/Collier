import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps, ComponentType, ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from './item'

/**
 * These tests cover the ten Item-family display wrappers declared in
 * src/components/ui/item.tsx (193 lines, 10 named exports).
 *
 * Module shape:
 *   ItemGroup       → <div role="list" data-slot="item-group"> + cn() merge
 *   ItemSeparator   → <Separator data-slot="item-separator" orientation="horizontal"> + cn() merge
 *   Item            → cva({variant × size}, defaultVariants=default,default)
 *                     + Slot (asChild) + data-slot="item" + data-variant + data-size
 *   ItemMedia       → cva({variant}, defaultVariants=default) + data-slot="item-media"
 *   ItemContent     → <div data-slot="item-content"> + cn() merge
 *   ItemTitle       → <div data-slot="item-title"> + cn() merge
 *   ItemDescription → <p data-slot="item-description"> + cn() merge
 *   ItemActions     → <div data-slot="item-actions"> + cn() merge
 *   ItemHeader      → <div data-slot="item-header"> + cn() merge
 *   ItemFooter      → <div data-slot="item-footer"> + cn() merge
 *
 * Both cva definitions (itemVariants and itemMediaVariants) are Variant A —
 * the cn() input CHANGES per variant, so `not.toHaveClass(...)` on a
 * non-default variant is TRUE. Confirmed by inspecting cn() at the call
 * sites in item.tsx: cva(...) returns a string per (variant, size) pair,
 * and the cva is invoked with the props the caller supplied, so the
 * className string differs across variants.
 *
 * ItemSeparator wraps the existing Separator from src/components/ui/separator.tsx
 * (covered by separator.test.tsx) — we verify the wrapper passes through
 * orientation="horizontal" + className merge and that the underlying
 * Separator renders with data-slot="separator".
 *
 * Item uses Radix Slot when asChild={true}. Slot forwards data-slot,
 * data-variant, data-size and all other props onto the wrapped child
 * element, so the child receives the cva className alongside its own.
 *
 * Reference pattern: src/components/ui/badge.test.tsx (PR #105) for
 * cva + asChild + Slot, src/components/ui/card.test.tsx for plain
 * div-wrapper cn() merge, src/components/ui/separator.test.tsx for
 * Separator pass-through.
 */

describe('ItemGroup', () => {
  it('renders a div with role="list", data-slot="item-group", and base classes from cn(base)', () => {
    // ItemGroup is a stateless cn() wrapper around <div role="list">.
    const { container } = render(
      <ItemGroup data-testid="item-group-default">group content</ItemGroup>
    )

    const element = screen.getByTestId('item-group-default')
    expect(container.children).toHaveLength(1)
    expect(element.tagName).toBe('DIV')
    expect(element).toHaveAttribute('role', 'list')
    expect(element).toHaveAttribute('data-slot', 'item-group')
    // Base classes from cn('group/item-group flex flex-col', ...).
    expect(element).toHaveClass('group/item-group')
    expect(element).toHaveClass('flex')
    expect(element).toHaveClass('flex-col')
    expect(element).toHaveTextContent('group content')
  })

  it('merges a custom className via cn(...) alongside the base classes', () => {
    // cn(base, className) — twMerge wins individual conflicts but the
    // arbitrary custom className passes through untouched.
    render(
      <ItemGroup
        className="custom-item-group-class"
        data-testid="item-group-custom"
      >
        x
      </ItemGroup>
    )

    const element = screen.getByTestId('item-group-custom')
    expect(element).toHaveClass('flex')
    expect(element).toHaveClass('flex-col')
    expect(element).toHaveClass('custom-item-group-class')
  })

  it('forwards arbitrary div props (id, aria-*, data-*, onClick) via props spread', () => {
    // ItemGroup spreads ...props onto the div after the slot/className
    // overrides, so user-supplied props land on the rendered element.
    const handleClick = vi.fn()
    render(
      <ItemGroup
        aria-label="item group label"
        data-custom="custom-value"
        data-testid="item-group-forwarded"
        id="item-group-id"
        onClick={handleClick}
      >
        body
      </ItemGroup>
    )

    const element = screen.getByTestId('item-group-forwarded')
    expect(element).toHaveAttribute('id', 'item-group-id')
    expect(element).toHaveAttribute('aria-label', 'item group label')
    expect(element).toHaveAttribute('data-custom', 'custom-value')
    expect(element).toHaveTextContent('body')

    fireEvent.click(element)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})

describe('ItemSeparator', () => {
  it('renders the underlying Separator with data-slot="item-separator" and orientation="horizontal"', () => {
    // ItemSeparator wraps Separator with data-slot="item-separator" +
    // orientation="horizontal" + cn('my-0', className). The underlying
    // Separator itself renders with data-slot="separator".
    const { container } = render(
      <ItemSeparator data-testid="item-separator-default" />
    )

    const element = screen.getByTestId('item-separator-default')
    expect(container.children).toHaveLength(1)
    expect(element.tagName).toBe('DIV')
    // Outer wrapper's slot overrides the Separator's data-slot because
    // ItemSeparator spreads {data-slot: 'item-separator'} onto Separator
    // AFTER Separator's default {data-slot: 'separator'}. Both can
    // appear — the outer override wins.
    expect(element).toHaveAttribute('data-slot', 'item-separator')
    // Separator renders the orientation Radix applies.
    expect(element).toHaveAttribute('data-orientation', 'horizontal')
  })

  it('applies the my-0 base class from cn(base)', () => {
    // ItemSeparator always concatenates 'my-0' into the Separator's
    // className via cn('my-0', className).
    render(<ItemSeparator data-testid="item-separator-base" />)

    const element = screen.getByTestId('item-separator-base')
    expect(element).toHaveClass('my-0')
  })

  it('merges a custom className via cn(base, className) alongside my-0', () => {
    // cn('my-0', custom) — twMerge doesn't conflict on these tokens.
    render(
      <ItemSeparator
        className="custom-separator-class"
        data-testid="item-separator-custom"
      />
    )

    const element = screen.getByTestId('item-separator-custom')
    expect(element).toHaveClass('my-0')
    expect(element).toHaveClass('custom-separator-class')
  })

  it('forwards Separator props (e.g. decorative={false}) via props spread', () => {
    // ItemSeparator accepts React.ComponentProps<typeof Separator> so
    // decorative flows through to Separator and flips role="none" →
    // role="separator".
    render(
      <ItemSeparator
        data-testid="item-separator-decorative"
        decorative={false}
      />
    )

    const element = screen.getByTestId('item-separator-decorative')
    expect(element).toHaveAttribute('data-slot', 'item-separator')
    // Separator sets role="separator" when decorative is false.
    expect(element).toHaveAttribute('role', 'separator')
  })
})

describe('Item', () => {
  describe('default rendering (Variant A cva, default × default)', () => {
    it('renders a <div> with data-slot="item", data-variant="default", data-size="default"', () => {
      // Item renders <div> by default (asChild=false) and applies the
      // three data-* attributes that consumers can target with CSS or
      // Radix's group-has-* / [data-slot=…] selectors.
      const { container } = render(<Item data-testid="item-default">body</Item>)

      const element = screen.getByTestId('item-default')
      expect(container.children).toHaveLength(1)
      expect(element.tagName).toBe('DIV')
      expect(element).toHaveAttribute('data-slot', 'item')
      expect(element).toHaveAttribute('data-variant', 'default')
      expect(element).toHaveAttribute('data-size', 'default')
      expect(element).toHaveTextContent('body')
    })

    it('includes the default-variant + default-size base classes from the cva definition', () => {
      // The cva base string + default variant + default size together
      // produce the canonical Item class set.
      render(<Item data-testid="item-default-classes">body</Item>)

      const element = screen.getByTestId('item-default-classes')
      // Base classes (always applied).
      expect(element).toHaveClass('group/item')
      expect(element).toHaveClass('flex')
      expect(element).toHaveClass('items-center')
      expect(element).toHaveClass('border')
      expect(element).toHaveClass('text-sm')
      expect(element).toHaveClass('rounded-[var(--radius)]')
      expect(element).toHaveClass('transition-colors')
      expect(element).toHaveClass('flex-wrap')
      expect(element).toHaveClass('outline-none')
      expect(element).toHaveClass('focus-visible:ring-2')
      expect(element).toHaveClass('focus-visible:ring-[color:var(--ring)]')
      // Default variant + default size tokens.
      expect(element).toHaveClass('bg-transparent')
      expect(element).toHaveClass('p-4')
      expect(element).toHaveClass('gap-4')
    })

    it('does NOT contain the outline variant class (border-[color:var(--border)])', () => {
      // Variant A: outline-only tokens are absent on default renders.
      render(<Item data-testid="item-default-no-outline">body</Item>)

      const element = screen.getByTestId('item-default-no-outline')
      expect(element).not.toHaveClass('border-[color:var(--border)]')
    })

    it('does NOT contain the muted variant class (bg-[color:var(--muted)]/50)', () => {
      // Variant A: muted-only tokens are absent on default renders.
      render(<Item data-testid="item-default-no-muted">body</Item>)

      const element = screen.getByTestId('item-default-no-muted')
      expect(element).not.toHaveClass('bg-[color:var(--muted)]/50')
    })

    it('does NOT contain the sm-size classes (py-3 px-4 gap-2.5)', () => {
      // Variant A: sm-only size tokens are absent on default renders.
      render(<Item data-testid="item-default-no-sm">body</Item>)

      const element = screen.getByTestId('item-default-no-sm')
      expect(element).not.toHaveClass('py-3')
      expect(element).not.toHaveClass('px-4')
      expect(element).not.toHaveClass('gap-2.5')
    })
  })

  describe('per-variant blocks', () => {
    it('variant="outline" → className includes border-[color:var(--border)], excludes default + muted tokens', () => {
      // Variant A: outline-only tokens land in the class set;
      // default + muted variant tokens do NOT.
      render(
        <Item data-testid="item-outline" variant="outline">
          body
        </Item>
      )

      const element = screen.getByTestId('item-outline')
      expect(element).toHaveAttribute('data-variant', 'outline')
      expect(element).toHaveClass('border-[color:var(--border)]')
      // Default variant tokens must NOT be present.
      expect(element).not.toHaveClass('bg-transparent')
      // Muted variant tokens must NOT be present.
      expect(element).not.toHaveClass('bg-[color:var(--muted)]/50')
    })

    it('variant="muted" → className includes bg-[color:var(--muted)]/50, excludes default + outline tokens', () => {
      // Variant A: muted-only tokens land in the class set;
      // default + outline variant tokens do NOT.
      render(
        <Item data-testid="item-muted" variant="muted">
          body
        </Item>
      )

      const element = screen.getByTestId('item-muted')
      expect(element).toHaveAttribute('data-variant', 'muted')
      expect(element).toHaveClass('bg-[color:var(--muted)]/50')
      // Default variant tokens must NOT be present.
      expect(element).not.toHaveClass('bg-transparent')
      // Outline variant tokens must NOT be present.
      expect(element).not.toHaveClass('border-[color:var(--border)]')
    })
  })

  describe('per-size blocks', () => {
    it('size="sm" → className includes py-3 px-4 gap-2.5, excludes the default-size tokens', () => {
      // Variant A: sm-size tokens replace the default-size tokens.
      render(
        <Item data-testid="item-sm" size="sm">
          body
        </Item>
      )

      const element = screen.getByTestId('item-sm')
      expect(element).toHaveAttribute('data-size', 'sm')
      expect(element).toHaveClass('py-3')
      expect(element).toHaveClass('px-4')
      expect(element).toHaveClass('gap-2.5')
      // Default size tokens must NOT be present.
      expect(element).not.toHaveClass('p-4')
      expect(element).not.toHaveClass('gap-4')
    })

    it('combines variant="outline" with size="sm" — both branches of the cva matrix apply together', () => {
      // Variant A: per-variant AND per-size branches can land in the
      // same className simultaneously.
      render(
        <Item data-testid="item-outline-sm" size="sm" variant="outline">
          body
        </Item>
      )

      const element = screen.getByTestId('item-outline-sm')
      expect(element).toHaveAttribute('data-variant', 'outline')
      expect(element).toHaveAttribute('data-size', 'sm')
      expect(element).toHaveClass('border-[color:var(--border)]')
      expect(element).toHaveClass('py-3')
      expect(element).toHaveClass('px-4')
      expect(element).toHaveClass('gap-2.5')
      expect(element).not.toHaveClass('p-4')
      expect(element).not.toHaveClass('gap-4')
      expect(element).not.toHaveClass('bg-transparent')
      expect(element).not.toHaveClass('bg-[color:var(--muted)]/50')
    })
  })

  describe('asChild Slot', () => {
    it('asChild=true wraps child with Slot — renders the <a> child instead of a <div>', () => {
      // When asChild is set, Item swaps <div> for Radix Slot. Slot
      // forwards data-slot + className + all other props onto the
      // child, so the anchor becomes the rendered element.
      render(
        <Item asChild>
          <a data-testid="item-aschild-link" href="/somewhere">
            Link
          </a>
        </Item>
      )

      const element = screen.getByTestId('item-aschild-link')
      expect(element.tagName).toBe('A')
      expect(element).toHaveAttribute('data-slot', 'item')
      expect(element).toHaveAttribute('data-variant', 'default')
      expect(element).toHaveAttribute('data-size', 'default')
      expect(element).toHaveAttribute('href', '/somewhere')
      // Default-variant cva classes still land on the child.
      expect(element).toHaveClass('bg-transparent')
      expect(element).toHaveClass('p-4')
      expect(element).toHaveClass('gap-4')
      expect(element).toHaveClass('group/item')
    })

    it('applies a non-default variant when asChild is set', () => {
      // cva + Slot — Slot still forwards the variant-derived className
      // onto the child element.
      render(
        <Item asChild variant="muted">
          <a data-testid="item-aschild-muted" href="/x">
            Muted link
          </a>
        </Item>
      )

      const element = screen.getByTestId('item-aschild-muted')
      expect(element.tagName).toBe('A')
      expect(element).toHaveAttribute('data-slot', 'item')
      expect(element).toHaveAttribute('data-variant', 'muted')
      expect(element).toHaveClass('bg-[color:var(--muted)]/50')
      expect(element).not.toHaveClass('bg-transparent')
    })

    it('asChild=false (default) renders a <div>', () => {
      // Symmetry check: explicit asChild={false} matches the default
      // behaviour and still renders a div.
      render(
        <Item asChild={false} data-testid="item-explicit-no-aschild">
          body
        </Item>
      )

      const element = screen.getByTestId('item-explicit-no-aschild')
      expect(element.tagName).toBe('DIV')
      expect(element).toHaveAttribute('data-slot', 'item')
    })

    it('forwards id / aria-label / onClick onto the wrapped child when asChild is set', () => {
      // Slot forwards every other prop onto the child too, so an
      // onClick attached to <Item asChild> still fires when the child
      // is clicked.
      const handleClick = vi.fn()
      render(
        <Item
          aria-label="anchor label"
          asChild
          data-testid="item-aschild-forwarded"
          id="aschild-id"
          onClick={handleClick}
        >
          <button type="button">Trigger</button>
        </Item>
      )

      const button = screen.getByTestId('item-aschild-forwarded')
      expect(button.tagName).toBe('BUTTON')
      expect(button).toHaveAttribute('data-slot', 'item')
      expect(button).toHaveAttribute('id', 'aschild-id')
      expect(button).toHaveAttribute('aria-label', 'anchor label')
      expect(button).toHaveAttribute('type', 'button')

      fireEvent.click(button)
      expect(handleClick).toHaveBeenCalledTimes(1)
    })
  })

  describe('className merge', () => {
    it('merges a custom className via cn(itemVariants, className) alongside the cva output', () => {
      // cn(itemVariants({variant, size, className})) — the user-supplied
      // className is merged alongside the cva-derived className.
      render(
        <Item className="custom-item-class" data-testid="item-custom">
          body
        </Item>
      )

      const element = screen.getByTestId('item-custom')
      // Default-variant cva classes still present.
      expect(element).toHaveClass('bg-transparent')
      expect(element).toHaveClass('p-4')
      // Custom className passes through.
      expect(element).toHaveClass('custom-item-class')
    })
  })

  describe('props forwarding + interaction', () => {
    it('forwards id / aria-* / data-* attributes onto the rendered div via props spread', () => {
      render(
        <Item
          aria-label="item label"
          data-custom="custom-value"
          data-testid="item-forwarded"
          id="item-id"
          title="item title"
        >
          body
        </Item>
      )

      const element = screen.getByTestId('item-forwarded')
      expect(element).toHaveAttribute('id', 'item-id')
      expect(element).toHaveAttribute('aria-label', 'item label')
      expect(element).toHaveAttribute('data-custom', 'custom-value')
      expect(element).toHaveAttribute('title', 'item title')
    })

    it('forwards a click event handler onto the rendered div', () => {
      // ...props is spread last, so onClick reaches the <div> as usual.
      const handleClick = vi.fn()
      render(
        <Item data-testid="item-click" onClick={handleClick}>
          body
        </Item>
      )

      const element = screen.getByTestId('item-click')
      fireEvent.click(element)
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('forwards a ref to the underlying div via React 19 ref-as-prop', () => {
      // React 19 lifts refs onto props — no forwardRef wrapper needed.
      let captured: HTMLElement | null = null
      render(
        <Item
          ref={node => {
            captured = node
          }}
        >
          body
        </Item>
      )

      const element = document.querySelector<HTMLElement>('[data-slot="item"]')
      expect(captured).toBe(element)
    })
  })
})

describe('ItemMedia', () => {
  it('renders a div with data-slot="item-media", data-variant="default", and base classes', () => {
    // ItemMedia default rendering: cva base string + default variant.
    const { container } = render(
      <ItemMedia data-testid="item-media-default">media</ItemMedia>
    )

    const element = screen.getByTestId('item-media-default')
    expect(container.children).toHaveLength(1)
    expect(element.tagName).toBe('DIV')
    expect(element).toHaveAttribute('data-slot', 'item-media')
    expect(element).toHaveAttribute('data-variant', 'default')
    // Base classes from the cva definition.
    expect(element).toHaveClass('flex')
    expect(element).toHaveClass('shrink-0')
    expect(element).toHaveClass('items-center')
    expect(element).toHaveClass('justify-center')
    expect(element).toHaveClass('gap-2')
    // Default-variant class.
    expect(element).toHaveClass('bg-transparent')
    expect(element).toHaveTextContent('media')
  })

  it('variant="icon" → className includes size-8 border rounded-sm bg-[color:var(--muted)]', () => {
    // Variant A: icon variant replaces the default with a 32px square.
    render(
      <ItemMedia data-testid="item-media-icon" variant="icon">
        media
      </ItemMedia>
    )

    const element = screen.getByTestId('item-media-icon')
    expect(element).toHaveAttribute('data-variant', 'icon')
    expect(element).toHaveClass('size-8')
    expect(element).toHaveClass('border')
    expect(element).toHaveClass('rounded-sm')
    expect(element).toHaveClass('bg-[color:var(--muted)]')
    // Default-variant bg-transparent must NOT be present.
    expect(element).not.toHaveClass('bg-transparent')
  })

  it('variant="image" → className includes size-10 rounded-sm overflow-hidden', () => {
    // Variant A: image variant replaces the default with a 40px frame
    // for image thumbnails.
    render(
      <ItemMedia data-testid="item-media-image" variant="image">
        media
      </ItemMedia>
    )

    const element = screen.getByTestId('item-media-image')
    expect(element).toHaveAttribute('data-variant', 'image')
    expect(element).toHaveClass('size-10')
    expect(element).toHaveClass('rounded-sm')
    expect(element).toHaveClass('overflow-hidden')
    // Default + icon variant tokens must NOT be present.
    expect(element).not.toHaveClass('bg-transparent')
    expect(element).not.toHaveClass('size-8')
    expect(element).not.toHaveClass('bg-[color:var(--muted)]')
  })

  it('merges a custom className via cn(itemMediaVariants, className) alongside the cva output', () => {
    render(
      <ItemMedia className="custom-media-class" data-testid="item-media-custom">
        media
      </ItemMedia>
    )

    const element = screen.getByTestId('item-media-custom')
    // Default variant + cva base classes still applied.
    expect(element).toHaveClass('flex')
    expect(element).toHaveClass('bg-transparent')
    // Custom className passes through.
    expect(element).toHaveClass('custom-media-class')
  })

  it('forwards arbitrary div props (id, aria-*, data-*, onClick) via props spread', () => {
    // ItemMedia spreads ...props onto the div last.
    const handleClick = vi.fn()
    render(
      <ItemMedia
        aria-label="media label"
        data-custom="custom-value"
        data-testid="item-media-forwarded"
        id="item-media-id"
        onClick={handleClick}
      >
        media
      </ItemMedia>
    )

    const element = screen.getByTestId('item-media-forwarded')
    expect(element).toHaveAttribute('id', 'item-media-id')
    expect(element).toHaveAttribute('aria-label', 'media label')
    expect(element).toHaveAttribute('data-custom', 'custom-value')

    fireEvent.click(element)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})

// Helpers for the remaining four stateless cn() wrappers (ItemContent,
// ItemTitle, ItemDescription, ItemActions, ItemHeader, ItemFooter). They
// share the same shape: <div|p> + data-slot + cn(base, className). A
// table-driven describe keeps the boilerplate low without losing
// per-component clarity in the failure messages.
type StatelessWrapper = ComponentType<ComponentProps<'div'>> & {
  displayName?: string
}

interface StatelessWrapperSpec {
  Component: StatelessWrapper
  baseClasses: string[]
  containerTag: 'div' | 'p'
  name: string
  slot: string
}

const statelessWrappers: StatelessWrapperSpec[] = [
  {
    Component: ItemContent,
    baseClasses: [
      'flex',
      'flex-1',
      'flex-col',
      'gap-1',
      '[&+[data-slot=item-content]]:flex-none',
    ],
    containerTag: 'div',
    name: 'ItemContent',
    slot: 'item-content',
  },
  {
    Component: ItemTitle,
    baseClasses: [
      'flex',
      'w-fit',
      'items-center',
      'gap-2',
      'text-sm',
      'leading-snug',
      'font-medium',
    ],
    containerTag: 'div',
    name: 'ItemTitle',
    slot: 'item-title',
  },
  {
    Component: ItemActions,
    baseClasses: ['flex', 'items-center', 'gap-2'],
    containerTag: 'div',
    name: 'ItemActions',
    slot: 'item-actions',
  },
  {
    Component: ItemHeader,
    baseClasses: [
      'flex',
      'basis-full',
      'items-center',
      'justify-between',
      'gap-2',
    ],
    containerTag: 'div',
    name: 'ItemHeader',
    slot: 'item-header',
  },
  {
    Component: ItemFooter,
    baseClasses: [
      'flex',
      'basis-full',
      'items-center',
      'justify-between',
      'gap-2',
    ],
    containerTag: 'div',
    name: 'ItemFooter',
    slot: 'item-footer',
  },
]

describe('ItemContent', () => {
  it('renders a div with data-slot="item-content" and the base cn() classes', () => {
    // ItemContent is a stateless cn() wrapper around <div>.
    const { container } = render(
      <ItemContent data-testid="item-content-default">content</ItemContent>
    )

    const element = screen.getByTestId('item-content-default')
    expect(container.children).toHaveLength(1)
    expect(element.tagName).toBe('DIV')
    expect(element).toHaveAttribute('data-slot', 'item-content')
    expect(element).toHaveClass('flex')
    expect(element).toHaveClass('flex-1')
    expect(element).toHaveClass('flex-col')
    expect(element).toHaveClass('gap-1')
    expect(element).toHaveClass('[&+[data-slot=item-content]]:flex-none')
    expect(element).toHaveTextContent('content')
  })

  it('merges a custom className via cn(base, className) alongside the base classes', () => {
    render(
      <ItemContent
        className="custom-content-class"
        data-testid="item-content-custom"
      >
        x
      </ItemContent>
    )

    const element = screen.getByTestId('item-content-custom')
    expect(element).toHaveClass('flex')
    expect(element).toHaveClass('custom-content-class')
  })

  it('forwards arbitrary div props (id, aria-*, data-*, onClick) via props spread', () => {
    const handleClick = vi.fn()
    render(
      <ItemContent
        aria-label="content label"
        data-custom="custom-value"
        data-testid="item-content-forwarded"
        id="item-content-id"
        onClick={handleClick}
      >
        body
      </ItemContent>
    )

    const element = screen.getByTestId('item-content-forwarded')
    expect(element).toHaveAttribute('id', 'item-content-id')
    expect(element).toHaveAttribute('aria-label', 'content label')
    expect(element).toHaveAttribute('data-custom', 'custom-value')

    fireEvent.click(element)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})

describe('ItemTitle', () => {
  it('renders a div with data-slot="item-title" and the base cn() classes', () => {
    const { container } = render(
      <ItemTitle data-testid="item-title-default">title</ItemTitle>
    )

    const element = screen.getByTestId('item-title-default')
    expect(container.children).toHaveLength(1)
    expect(element.tagName).toBe('DIV')
    expect(element).toHaveAttribute('data-slot', 'item-title')
    expect(element).toHaveClass('flex')
    expect(element).toHaveClass('w-fit')
    expect(element).toHaveClass('items-center')
    expect(element).toHaveClass('gap-2')
    expect(element).toHaveClass('text-sm')
    expect(element).toHaveClass('leading-snug')
    expect(element).toHaveClass('font-medium')
    expect(element).toHaveTextContent('title')
  })

  it('merges a custom className via cn(base, className) alongside the base classes', () => {
    render(
      <ItemTitle className="custom-title-class" data-testid="item-title-custom">
        x
      </ItemTitle>
    )

    const element = screen.getByTestId('item-title-custom')
    expect(element).toHaveClass('flex')
    expect(element).toHaveClass('custom-title-class')
  })

  it('forwards arbitrary div props (id, aria-*, data-*, onClick) via props spread', () => {
    const handleClick = vi.fn()
    render(
      <ItemTitle
        aria-label="title label"
        data-custom="custom-value"
        data-testid="item-title-forwarded"
        id="item-title-id"
        onClick={handleClick}
      >
        body
      </ItemTitle>
    )

    const element = screen.getByTestId('item-title-forwarded')
    expect(element).toHaveAttribute('id', 'item-title-id')
    expect(element).toHaveAttribute('aria-label', 'title label')
    expect(element).toHaveAttribute('data-custom', 'custom-value')

    fireEvent.click(element)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})

describe('ItemDescription', () => {
  it('renders a <p> with data-slot="item-description" and the base cn() classes', () => {
    // ItemDescription uses <p> (React.ComponentProps<'p'>) instead of <div>
    // because paragraphs are the semantically correct element for
    // free-flowing copy that accompanies an Item.
    const { container } = render(
      <ItemDescription data-testid="item-description-default">
        description
      </ItemDescription>
    )

    const element = screen.getByTestId('item-description-default')
    expect(container.children).toHaveLength(1)
    expect(element.tagName).toBe('P')
    expect(element).toHaveAttribute('data-slot', 'item-description')
    expect(element).toHaveClass('text-[color:var(--muted-foreground)]')
    expect(element).toHaveClass('line-clamp-2')
    expect(element).toHaveClass('text-sm')
    expect(element).toHaveClass('leading-normal')
    expect(element).toHaveClass('font-normal')
    expect(element).toHaveClass('text-balance')
    expect(element).toHaveClass('[&>a:hover]:text-[color:var(--primary)]')
    expect(element).toHaveClass('[&>a]:underline')
    expect(element).toHaveClass('[&>a]:underline-offset-4')
    expect(element).toHaveTextContent('description')
  })

  it('merges a custom className via cn(base, className) alongside the base classes', () => {
    render(
      <ItemDescription
        className="custom-description-class"
        data-testid="item-description-custom"
      >
        x
      </ItemDescription>
    )

    const element = screen.getByTestId('item-description-custom')
    expect(element).toHaveClass('text-[color:var(--muted-foreground)]')
    expect(element).toHaveClass('line-clamp-2')
    expect(element).toHaveClass('custom-description-class')
  })

  it('forwards arbitrary <p> props (id, aria-*, data-*, onClick) via props spread', () => {
    const handleClick = vi.fn()
    render(
      <ItemDescription
        aria-label="description label"
        data-custom="custom-value"
        data-testid="item-description-forwarded"
        id="item-description-id"
        onClick={handleClick}
      >
        body
      </ItemDescription>
    )

    const element = screen.getByTestId('item-description-forwarded')
    expect(element.tagName).toBe('P')
    expect(element).toHaveAttribute('id', 'item-description-id')
    expect(element).toHaveAttribute('aria-label', 'description label')
    expect(element).toHaveAttribute('data-custom', 'custom-value')

    fireEvent.click(element)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})

describe('ItemActions', () => {
  it('renders a div with data-slot="item-actions" and the base cn() classes', () => {
    const { container } = render(
      <ItemActions data-testid="item-actions-default">actions</ItemActions>
    )

    const element = screen.getByTestId('item-actions-default')
    expect(container.children).toHaveLength(1)
    expect(element.tagName).toBe('DIV')
    expect(element).toHaveAttribute('data-slot', 'item-actions')
    expect(element).toHaveClass('flex')
    expect(element).toHaveClass('items-center')
    expect(element).toHaveClass('gap-2')
    expect(element).toHaveTextContent('actions')
  })

  it('merges a custom className via cn(base, className) alongside the base classes', () => {
    render(
      <ItemActions
        className="custom-actions-class"
        data-testid="item-actions-custom"
      >
        x
      </ItemActions>
    )

    const element = screen.getByTestId('item-actions-custom')
    expect(element).toHaveClass('flex')
    expect(element).toHaveClass('custom-actions-class')
  })
})

describe('ItemHeader', () => {
  it('renders a div with data-slot="item-header" and the base cn() classes', () => {
    const { container } = render(
      <ItemHeader data-testid="item-header-default">header</ItemHeader>
    )

    const element = screen.getByTestId('item-header-default')
    expect(container.children).toHaveLength(1)
    expect(element.tagName).toBe('DIV')
    expect(element).toHaveAttribute('data-slot', 'item-header')
    expect(element).toHaveClass('flex')
    expect(element).toHaveClass('basis-full')
    expect(element).toHaveClass('items-center')
    expect(element).toHaveClass('justify-between')
    expect(element).toHaveClass('gap-2')
    expect(element).toHaveTextContent('header')
  })

  it('merges a custom className via cn(base, className) alongside the base classes', () => {
    render(
      <ItemHeader
        className="custom-header-class"
        data-testid="item-header-custom"
      >
        x
      </ItemHeader>
    )

    const element = screen.getByTestId('item-header-custom')
    expect(element).toHaveClass('flex')
    expect(element).toHaveClass('custom-header-class')
  })
})

describe('ItemFooter', () => {
  it('renders a div with data-slot="item-footer" and the base cn() classes', () => {
    const { container } = render(
      <ItemFooter data-testid="item-footer-default">footer</ItemFooter>
    )

    const element = screen.getByTestId('item-footer-default')
    expect(container.children).toHaveLength(1)
    expect(element.tagName).toBe('DIV')
    expect(element).toHaveAttribute('data-slot', 'item-footer')
    expect(element).toHaveClass('flex')
    expect(element).toHaveClass('basis-full')
    expect(element).toHaveClass('items-center')
    expect(element).toHaveClass('justify-between')
    expect(element).toHaveClass('gap-2')
    expect(element).toHaveTextContent('footer')
  })

  it('merges a custom className via cn(base, className) alongside the base classes', () => {
    render(
      <ItemFooter
        className="custom-footer-class"
        data-testid="item-footer-custom"
      >
        x
      </ItemFooter>
    )

    const element = screen.getByTestId('item-footer-custom')
    expect(element).toHaveClass('flex')
    expect(element).toHaveClass('custom-footer-class')
  })
})

// Smoke check: stateless wrappers should round-trip the ReactNode children
// the consumer provides. Keeps coverage honest if a future refactor ever
// forgets to spread children.
describe('stateless wrapper children passthrough', () => {
  it.each(
    statelessWrappers.map(spec => ({
      ...spec,
      child: (name: string): ReactNode => `${name} child`,
    }))
  )(
    '$name renders its ReactNode children verbatim',
    ({ Component, name, slot }) => {
      const testId = `${slot}-children`
      render(<Component data-testid={testId}>{`${name} child`}</Component>)

      const element = screen.getByTestId(testId)
      expect(element).toHaveTextContent(`${name} child`)
      expect(element).toHaveAttribute('data-slot', slot)
    }
  )
})
