import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  buttonGroupVariants,
} from './button-group'

/**
 * These tests cover the ButtonGroup primitive declared in
 * src/components/ui/button-group.tsx (currently 0% coverage, 83 lines).
 *
 * ButtonGroup is a small composition of three wrapper components and
 * one cva definition:
 *   - `ButtonGroup` \u2014 a `<div role="group" data-slot="button-group">`
 *     driven by a cva call with one variant axis: `orientation`
 *     (`horizontal` | `vertical`). It defaults to `horizontal` via
 *     `defaultVariants` and applies `data-orientation={orientation}`
 *     on the rendered element.
 *   - `ButtonGroupText` \u2014 a `<div>` by default with `data-slot` /
 *     cn() base classes. Swaps the rendered element to Radix `Slot`
 *     when `asChild={true}`, forwarding props onto the wrapped child.
 *   - `ButtonGroupSeparator` \u2014 a thin wrapper around the existing
 *     `Separator` primitive that overrides `data-slot="button-group-separator"`,
 *     defaults `orientation` to `"vertical"`, and appends layout
 *     utilities (`bg-input`, `relative`, `!m-0`, `self-stretch`,
 *     `data-[orientation=vertical]:h-auto`) onto the cn() output.
 *   - `buttonGroupVariants` \u2014 the exported cva. Callable directly to
 *     retrieve the class string for a given variant combination.
 *
 * Mirrors the layout of button.test.tsx (PR #114), badge.test.tsx
 * (PR #105), label.test.tsx (PR #113), and textarea.test.tsx
 * (PR #112): one describe per component + per cva variant axis,
 * unconditional cn() base assertions, className merge, prop
 * forwarding, and a dedicated describe for the exported cva.
 */
describe('ButtonGroup', () => {
  describe('default <div role="group"> rendering', () => {
    it('renders a single <div> with role="group" and data-slot="button-group", without a data-orientation attribute when no orientation prop is passed', () => {
      const { container } = render(
        <ButtonGroup data-testid="button-group-default">
          <button>One</button>
          <button>Two</button>
        </ButtonGroup>
      )

      const element = screen.getByTestId('button-group-default')

      // Exactly one top-level child rendered — no portal / wrapper.
      expect(container.children).toHaveLength(1)

      // role="group" is set explicitly so assistive tech treats the
      // cluster as a single toolbar.
      expect(element.tagName).toBe('DIV')
      expect(element).toHaveAttribute('role', 'group')
      expect(element).toHaveAttribute('data-slot', 'button-group')

      // `data-orientation` reflects the raw `orientation` prop, not
      // the cva defaultVariants resolution. When the caller omits
      // the prop, React strips the attribute and the element carries
      // no data-orientation — even though the cn() output below
      // applies the horizontal variant classes via defaultVariants.
      expect(element).not.toHaveAttribute('data-orientation')
    })

    it('applies the unconditional cn() base classes (flex + w-fit + items-stretch + descendant utilities)', () => {
      render(<ButtonGroup data-testid="button-group-base" />)
      const element = screen.getByTestId('button-group-base')

      // Always-on base layout / structural tokens from the cva base.
      expect(element).toHaveClass('flex')
      expect(element).toHaveClass('w-fit')
      expect(element).toHaveClass('items-stretch')

      // Descendant-selector tokens that apply on every render.
      expect(element).toHaveClass('[&>*]:focus-visible:z-10')
      expect(element).toHaveClass('[&>*]:focus-visible:relative')

      // Descendant-selector for native selects inside the group.
      expect(element).toHaveClass(
        "[&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit"
      )
      expect(element).toHaveClass('[&>input]:flex-1')

      // Compound descendant token (select with aria-hidden=true as
      // last-child triggers a rounded-r-md on the trailing trigger).
      expect(element).toHaveClass(
        'has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-md'
      )

      // Compound descendant token (nested button-group introduces a gap).
      expect(element).toHaveClass('has-[>[data-slot=button-group]]:gap-2')
    })

    it('applies the default horizontal orientation variant classes', () => {
      render(<ButtonGroup data-testid="button-group-horizontal-default" />)
      const element = screen.getByTestId('button-group-horizontal-default')

      // Horizontal orientation collapses rounded corners / borders
      // between siblings so they sit flush.
      expect(element).toHaveClass('[&>*:not(:first-child)]:rounded-l-none')
      expect(element).toHaveClass('[&>*:not(:first-child)]:border-l-0')
      expect(element).toHaveClass('[&>*:not(:last-child)]:rounded-r-none')

      // Vertical-only utility must NOT be present.
      expect(element).not.toHaveClass('flex-col')
      expect(element).not.toHaveClass('[&>*:not(:first-child)]:rounded-t-none')
      expect(element).not.toHaveClass('[&>*:not(:first-child)]:border-t-0')
      expect(element).not.toHaveClass('[&>*:not(:last-child)]:rounded-b-none')
    })
  })

  describe('orientation branches', () => {
    describe('orientation="horizontal"', () => {
      it('flips data-orientation to "horizontal" and keeps the horizontal variant classes', () => {
        render(
          <ButtonGroup
            data-testid="button-group-horizontal"
            orientation="horizontal"
          />
        )
        const element = screen.getByTestId('button-group-horizontal')

        expect(element).toHaveAttribute('data-orientation', 'horizontal')
        expect(element).toHaveClass('[&>*:not(:first-child)]:rounded-l-none')
        expect(element).toHaveClass('[&>*:not(:first-child)]:border-l-0')
        expect(element).toHaveClass('[&>*:not(:last-child)]:rounded-r-none')

        // Vertical-only utilities must NOT leak in.
        expect(element).not.toHaveClass('flex-col')
        expect(element).not.toHaveClass(
          '[&>*:not(:first-child)]:rounded-t-none'
        )
        expect(element).not.toHaveClass('[&>*:not(:first-child)]:border-t-0')
        expect(element).not.toHaveClass('[&>*:not(:last-child)]:rounded-b-none')
      })
    })

    describe('orientation="vertical"', () => {
      it('flips data-orientation to "vertical" and applies the vertical variant classes (flex-col + top/bottom rounding)', () => {
        render(
          <ButtonGroup
            data-testid="button-group-vertical"
            orientation="vertical"
          />
        )
        const element = screen.getByTestId('button-group-vertical')

        expect(element).toHaveAttribute('data-orientation', 'vertical')

        // Vertical orientation switches the group to flex-col and
        // collapses rounded corners / borders along the top/bottom
        // edge so siblings sit flush.
        expect(element).toHaveClass('flex-col')
        expect(element).toHaveClass('[&>*:not(:first-child)]:rounded-t-none')
        expect(element).toHaveClass('[&>*:not(:first-child)]:border-t-0')
        expect(element).toHaveClass('[&>*:not(:last-child)]:rounded-b-none')

        // Horizontal-only utilities must NOT be present.
        expect(element).not.toHaveClass(
          '[&>*:not(:first-child)]:rounded-l-none'
        )
        expect(element).not.toHaveClass('[&>*:not(:first-child)]:border-l-0')
        expect(element).not.toHaveClass('[&>*:not(:last-child)]:rounded-r-none')
      })
    })
  })

  describe('className merge', () => {
    it('appends a custom className and preserves the base + default-horizontal variant classes', () => {
      // Use a non-conflicting utility (`mt-4` margin + arbitrary
      // tag) so tailwind-merge inside cn() won't drop the cva output.
      render(
        <ButtonGroup
          className="custom-group-class mt-4"
          data-testid="button-group-merged"
        />
      )
      const element = screen.getByTestId('button-group-merged')

      // Custom classes are appended.
      expect(element).toHaveClass('custom-group-class')
      expect(element).toHaveClass('mt-4')

      // Base classes survive the merge.
      expect(element).toHaveClass('flex')
      expect(element).toHaveClass('w-fit')
      expect(element).toHaveClass('items-stretch')

      // Default-horizontal variant classes survive the merge.
      expect(element).toHaveClass('[&>*:not(:first-child)]:rounded-l-none')
      expect(element).toHaveClass('[&>*:not(:first-child)]:border-l-0')
      expect(element).toHaveClass('[&>*:not(:last-child)]:rounded-r-none')
    })
  })

  describe('props forwarding', () => {
    it('forwards id, aria-*, data-*, and an onClick handler onto the rendered <div>', () => {
      const handleClick = vi.fn()
      render(
        <ButtonGroup
          aria-label="text formatting toolbar"
          aria-orientation="horizontal"
          data-custom="custom-value"
          data-testid="button-group-forwarded"
          id="button-group-id"
          onClick={handleClick}
          role="toolbar"
        >
          <button>B</button>
        </ButtonGroup>
      )

      const element = screen.getByTestId('button-group-forwarded')
      expect(element).toHaveAttribute('id', 'button-group-id')
      expect(element).toHaveAttribute('aria-label', 'text formatting toolbar')
      expect(element).toHaveAttribute('aria-orientation', 'horizontal')
      expect(element).toHaveAttribute('data-custom', 'custom-value')
      // role="toolbar" from the spread overrides the explicit role="group"
      // because it comes after the default role attribute in the JSX.
      expect(element).toHaveAttribute('role', 'toolbar')

      fireEvent.click(element)
      expect(handleClick).toHaveBeenCalledTimes(1)
    })
  })
})

describe('ButtonGroupText', () => {
  describe('default <div> rendering', () => {
    it('renders a single <div> with the unconditional cn() base classes (bg-muted + flex + gap-2 + rounded-md + border + px-4 + text-sm + font-medium + shadow-xs + svg utilities)', () => {
      const { container } = render(
        <ButtonGroupText data-testid="button-group-text-default">
          Text
        </ButtonGroupText>
      )

      const element = screen.getByTestId('button-group-text-default')

      expect(container.children).toHaveLength(1)
      expect(element.tagName).toBe('DIV')

      // Base layout / structural tokens.
      expect(element).toHaveClass('bg-muted')
      expect(element).toHaveClass('flex')
      expect(element).toHaveClass('items-center')
      expect(element).toHaveClass('gap-2')
      expect(element).toHaveClass('rounded-md')
      expect(element).toHaveClass('border')
      expect(element).toHaveClass('px-4')
      expect(element).toHaveClass('text-sm')
      expect(element).toHaveClass('font-medium')
      expect(element).toHaveClass('shadow-xs')

      // Descendant-svg utility tokens.
      expect(element).toHaveClass('[&_svg]:pointer-events-none')
      expect(element).toHaveClass("[&_svg:not([class*='size-'])]:size-4")

      expect(element).toHaveTextContent('Text')
    })

    it('renders a <div> when asChild={false} is passed explicitly (default branch)', () => {
      render(
        <ButtonGroupText
          asChild={false}
          data-testid="button-group-text-explicit-no-aschild"
        >
          Explicit
        </ButtonGroupText>
      )

      const element = screen.getByTestId(
        'button-group-text-explicit-no-aschild'
      )
      expect(element.tagName).toBe('DIV')
    })
  })

  describe('asChild Slot branch', () => {
    it('renders the wrapped child element instead of a <div>, forwarding ButtonGroupText props onto it', () => {
      render(
        <ButtonGroupText asChild>
          <span data-testid="button-group-text-aschild-span">Inline text</span>
        </ButtonGroupText>
      )

      const element = screen.getByTestId('button-group-text-aschild-span')
      // Slot forwards ButtonGroupText props onto the child so the
      // span receives the cn() base classes instead of being wrapped
      // in another <div>.
      expect(element.tagName).toBe('SPAN')
      expect(element).toHaveTextContent('Inline text')

      // cn() base utilities still applied to the rendered child.
      expect(element).toHaveClass('bg-muted')
      expect(element).toHaveClass('flex')
      expect(element).toHaveClass('items-center')
      expect(element).toHaveClass('gap-2')
      expect(element).toHaveClass('rounded-md')
      expect(element).toHaveClass('border')
      expect(element).toHaveClass('px-4')
      expect(element).toHaveClass('text-sm')
      expect(element).toHaveClass('font-medium')
    })

    it('forwards id / aria-label / onClick onto the wrapped child when asChild is set', () => {
      const handleClick = vi.fn()
      render(
        <ButtonGroupText
          aria-label="text label"
          asChild
          data-testid="button-group-text-aschild-forwarded"
          id="text-id"
          onClick={handleClick}
        >
          <button type="button">Trigger</button>
        </ButtonGroupText>
      )

      const button = screen.getByTestId('button-group-text-aschild-forwarded')
      expect(button.tagName).toBe('BUTTON')
      expect(button).toHaveAttribute('id', 'text-id')
      expect(button).toHaveAttribute('aria-label', 'text label')
      expect(button).toHaveAttribute('type', 'button')

      fireEvent.click(button)
      expect(handleClick).toHaveBeenCalledTimes(1)
    })
  })

  describe('className merge', () => {
    it('appends a custom className and preserves the cn() base classes', () => {
      render(
        <ButtonGroupText
          className="custom-text-class uppercase"
          data-testid="button-group-text-merged"
        >
          Merged
        </ButtonGroupText>
      )
      const element = screen.getByTestId('button-group-text-merged')

      // Custom classes are appended.
      expect(element).toHaveClass('custom-text-class')
      expect(element).toHaveClass('uppercase')

      // Base classes survive the merge.
      expect(element).toHaveClass('bg-muted')
      expect(element).toHaveClass('flex')
      expect(element).toHaveClass('items-center')
      expect(element).toHaveClass('gap-2')
      expect(element).toHaveClass('rounded-md')
      expect(element).toHaveClass('border')
      expect(element).toHaveClass('px-4')
      expect(element).toHaveClass('text-sm')
      expect(element).toHaveClass('font-medium')
      expect(element).toHaveClass('shadow-xs')
    })
  })

  describe('props forwarding', () => {
    it('forwards id, aria-*, data-* attributes onto the rendered <div> via props spread', () => {
      render(
        <ButtonGroupText
          aria-label="text section"
          data-custom="custom-value"
          data-testid="button-group-text-forwarded"
          id="text-id-forwarded"
          title="text title"
        >
          Forwarded
        </ButtonGroupText>
      )

      const element = screen.getByTestId('button-group-text-forwarded')
      expect(element).toHaveAttribute('id', 'text-id-forwarded')
      expect(element).toHaveAttribute('aria-label', 'text section')
      expect(element).toHaveAttribute('data-custom', 'custom-value')
      expect(element).toHaveAttribute('title', 'text title')
    })
  })
})

describe('ButtonGroupSeparator', () => {
  describe('default rendering', () => {
    it('renders a Separator with data-slot="button-group-separator" (overriding Separator internal data-slot) and default vertical orientation', () => {
      render(
        <ButtonGroupSeparator data-testid="button-group-separator-default" />
      )

      const element = screen.getByTestId('button-group-separator-default')

      // The Separator primitive always renders a <div>; the
      // data-slot prop overrides Separator's internal
      // data-slot="separator".
      expect(element.tagName).toBe('DIV')
      expect(element).toHaveAttribute('data-slot', 'button-group-separator')

      // ButtonGroupSeparator defaults orientation to 'vertical' \u2014
      // Radix applies the matching data-orientation attribute.
      expect(element).toHaveAttribute('data-orientation', 'vertical')

      // Decorative defaults to true inside Separator, so Radix
      // applies role="none".
      expect(element).toHaveAttribute('role', 'none')
    })

    it('applies the layout utilities (bg-input + relative + !m-0 + self-stretch + data-[orientation=vertical]:h-auto)', () => {
      render(<ButtonGroupSeparator data-testid="button-group-separator-base" />)
      const element = screen.getByTestId('button-group-separator-base')

      // ButtonGroupSeparator-specific layout utilities that override
      // Separator's neutral `bg-[color:var(--border)]` colour.
      expect(element).toHaveClass('bg-input')
      expect(element).toHaveClass('relative')
      expect(element).toHaveClass('!m-0')
      expect(element).toHaveClass('self-stretch')
      expect(element).toHaveClass('data-[orientation=vertical]:h-auto')

      // bg-input wins over Separator's bg-[color:var(--border)] via
      // tailwind-merge, so the literal border token must NOT be
      // present in the final className.
      expect(element).not.toHaveClass('bg-[color:var(--border)]')
    })
  })

  describe('orientation="horizontal" override', () => {
    it('flips data-orientation to "horizontal" while keeping the layout utilities', () => {
      render(
        <ButtonGroupSeparator
          data-testid="button-group-separator-horizontal"
          orientation="horizontal"
        />
      )

      const element = screen.getByTestId('button-group-separator-horizontal')
      expect(element).toHaveAttribute('data-orientation', 'horizontal')

      // Layout utilities are still applied.
      expect(element).toHaveClass('bg-input')
      expect(element).toHaveClass('relative')
      expect(element).toHaveClass('!m-0')
      expect(element).toHaveClass('self-stretch')
      expect(element).toHaveClass('data-[orientation=vertical]:h-auto')
    })
  })

  describe('className merge', () => {
    it('appends a custom className alongside the layout utilities', () => {
      render(
        <ButtonGroupSeparator
          className="custom-separator-class"
          data-testid="button-group-separator-merged"
        />
      )

      const element = screen.getByTestId('button-group-separator-merged')

      // Custom class is appended.
      expect(element).toHaveClass('custom-separator-class')

      // Layout utilities survive the merge.
      expect(element).toHaveClass('bg-input')
      expect(element).toHaveClass('relative')
      expect(element).toHaveClass('!m-0')
      expect(element).toHaveClass('self-stretch')
      expect(element).toHaveClass('data-[orientation=vertical]:h-auto')
    })
  })

  describe('props forwarding', () => {
    it('forwards decorative={false} onto the wrapped Separator (role flips to "separator")', () => {
      render(
        <ButtonGroupSeparator
          data-testid="button-group-separator-non-decorative"
          decorative={false}
        />
      )

      const element = screen.getByTestId(
        'button-group-separator-non-decorative'
      )
      // Radix flips role to "separator" when decorative is false so
      // assistive tech can announce the boundary.
      expect(element).toHaveAttribute('role', 'separator')
      expect(element).toHaveAttribute('data-orientation', 'vertical')
    })

    it('forwards id / aria-* / data-* attributes onto the rendered Separator', () => {
      render(
        <ButtonGroupSeparator
          aria-label="group separator"
          data-custom="custom-value"
          data-testid="button-group-separator-forwarded"
          id="separator-id"
        />
      )

      const element = screen.getByTestId('button-group-separator-forwarded')
      expect(element).toHaveAttribute('id', 'separator-id')
      expect(element).toHaveAttribute('aria-label', 'group separator')
      expect(element).toHaveAttribute('data-custom', 'custom-value')
    })
  })
})

describe('exported buttonGroupVariants', () => {
  it('returns the horizontal variant class string when called with orientation="horizontal"', () => {
    const classes = buttonGroupVariants({ orientation: 'horizontal' })
    expect(classes).toContain('flex')
    expect(classes).toContain('w-fit')
    expect(classes).toContain('items-stretch')
    // Horizontal sibling-rounding utilities.
    expect(classes).toContain('[&>*:not(:first-child)]:rounded-l-none')
    expect(classes).toContain('[&>*:not(:first-child)]:border-l-0')
    expect(classes).toContain('[&>*:not(:last-child)]:rounded-r-none')
    // Vertical-only utility must NOT be present.
    expect(classes).not.toContain('flex-col')
  })

  it('returns the vertical variant class string when called with orientation="vertical"', () => {
    const classes = buttonGroupVariants({ orientation: 'vertical' })
    expect(classes).toContain('flex-col')
    expect(classes).toContain('[&>*:not(:first-child)]:rounded-t-none')
    expect(classes).toContain('[&>*:not(:first-child)]:border-t-0')
    expect(classes).toContain('[&>*:not(:last-child)]:rounded-b-none')
    // Horizontal-only utilities must NOT be present.
    expect(classes).not.toContain('[&>*:not(:first-child)]:rounded-l-none')
    expect(classes).not.toContain('[&>*:not(:first-child)]:border-l-0')
    expect(classes).not.toContain('[&>*:not(:last-child)]:rounded-r-none')
  })

  it('falls back to the default horizontal variant when called with no args', () => {
    const classes = buttonGroupVariants()
    // defaultVariants.orientation === 'horizontal' \u2192 horizontal token
    // present, vertical token absent.
    expect(classes).toContain('[&>*:not(:first-child)]:rounded-l-none')
    expect(classes).not.toContain('flex-col')
  })
})
