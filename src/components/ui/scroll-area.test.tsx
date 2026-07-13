import * as React from 'react'
import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

/**
 * The Radix `@radix-ui/react-scroll-area` primitives are mocked here so
 * the auto scrollbar (ScrollAreaScrollbarAuto, which decides whether to
 * render based on a ResizeObserver-driven overflow detection — a real
 * layout-time measurement jsdom does not provide) always emits its
 * DOM. We are testing the wrapper logic of
 * src/components/ui/scroll-area.tsx, not Radix's overflow detection.
 *
 * The mock preserves every prop the source code passes through
 * (data-slot, className, orientation, ...rest) so all assertions on
 * composition / className merge / prop forwarding remain valid.
 *
 * Mock-only attributes that aid assertions:
 *   - `data-radix-mock="<ComponentName>"` so we can verify which Radix
 *     primitive was hit.
 *   - Corner gets `data-slot="scroll-area-corner"` (the real Radix
 *     Corner doesn't set a data-slot, but adding one in the mock lets
 *     us assert that the Corner slot was reached from the source).
 */
vi.mock('@radix-ui/react-scroll-area', () => {
  const passthrough = (
    displayName: string,
    extraProps: Record<string, unknown> = {}
  ) => {
    type DivProps = ComponentProps<'div'>
    const C = React.forwardRef<HTMLDivElement, DivProps>((props, ref) =>
      React.createElement('div', {
        ...props,
        ref,
        'data-radix-mock': displayName,
        ...extraProps,
      })
    )
    C.displayName = displayName
    return C
  }

  const Root = passthrough('ScrollAreaRoot')
  const Viewport = passthrough('ScrollAreaViewport')
  type ScrollbarProps = ComponentProps<'div'> & {
    orientation?: 'horizontal' | 'vertical'
  }
  const ScrollAreaScrollbar = React.forwardRef<HTMLDivElement, ScrollbarProps>(
    ({ orientation, ...props }, ref) =>
      React.createElement('div', {
        ...props,
        ref,
        'data-radix-mock': 'ScrollAreaScrollbar',
        'data-orientation': orientation,
      })
  )
  ScrollAreaScrollbar.displayName = 'ScrollAreaScrollbar'
  const ScrollAreaThumb = passthrough('ScrollAreaThumb')
  const Corner = passthrough('ScrollAreaCorner', {
    'data-slot': 'scroll-area-corner',
  })

  return {
    __esModule: true,
    Root,
    Viewport,
    ScrollAreaScrollbar,
    ScrollAreaThumb,
    Corner,
  }
})

import { ScrollArea, ScrollBar } from './scroll-area'

/**
 * These tests cover the ScrollArea display primitive declared in
 * src/components/ui/scroll-area.tsx (currently 0% coverage, 56 lines,
 * 2 named exports: ScrollArea, ScrollBar).
 *
 * ScrollArea is a thin composition of two wrappers around the Radix
 * `@radix-ui/react-scroll-area` primitives:
 *
 *   - `ScrollArea` wraps `ScrollAreaPrimitive.Root` (data-slot="scroll-area",
 *     cn base class `relative`), embeds a `ScrollAreaPrimitive.Viewport`
 *     (data-slot="scroll-area-viewport", carrying the focus-visible
 *     ring/offset/outline tokens plus `size-full rounded-[inherit]
 *     transition-[color,box-shadow] outline-none`), always renders a
 *     default `<ScrollBar />` (vertical) and `<ScrollAreaPrimitive.Corner
 *     />`. Children flow into the Viewport verbatim — no portal, no
 *     wrapper. `...props` spread onto the Root.
 *
 *   - `ScrollBar` wraps `ScrollAreaPrimitive.ScrollAreaScrollbar`
 *     (data-slot="scroll-area-scrollbar", default orientation='vertical').
 *     The cn() call concatenates the always-on base classes
 *     (`flex touch-none p-px transition-colors select-none`) with the
 *     orientation-conditional class token via `&&` boolean, so clsx
 *     filters out the non-matching orientation — only the matching
 *     orientation class lands in the final className. Inside the
 *     ScrollAreaScrollbar the component renders a
 *     `ScrollAreaPrimitive.ScrollAreaThumb` (data-slot="scroll-area-thumb",
 *     `bg-[color:var(--border)] relative flex-1 rounded-full`).
 *
 * Both components spread `...props` and apply `cn(base, className)` so
 * className merging AND prop forwarding (id, aria-*, data-*,
 * style, event handlers) are exercised explicitly.
 *
 * Mirrors the layout of `separator.test.tsx` (PR #108),
 * `radio-group.test.tsx` (PR #118), and the other UI primitive
 * coverage tests: one describe per component, one describe per
 * behaviour axis, unconditional cn() base assertions, className
 * merge, prop forwarding.
 */
describe('ScrollArea', () => {
  describe('default <ScrollAreaPrimitive.Root> rendering', () => {
    it('renders a single top-level <div> (no portal) with data-slot="scroll-area" and the cn() base class relative', () => {
      const { container } = render(
        <ScrollArea data-testid="scroll-area-default">
          <p>content</p>
        </ScrollArea>
      )

      const root = screen.getByTestId('scroll-area-default')

      // Exactly one top-level element rendered — no portal.
      expect(container.children).toHaveLength(1)
      expect(container.firstElementChild).toBe(root)

      // Radix ScrollAreaPrimitive.Root renders as a <div> by default.
      expect(root.tagName).toBe('DIV')
      // data-slot is always set on the Root.
      expect(root).toHaveAttribute('data-slot', 'scroll-area')
      // The Radix mock attaches data-radix-mock so we can verify the Root primitive was actually invoked.
      expect(root).toHaveAttribute('data-radix-mock', 'ScrollAreaRoot')
      // cn() base class is always present.
      expect(root).toHaveClass('relative')
    })
  })

  describe('Viewport', () => {
    it('renders exactly one [data-slot="scroll-area-viewport"] inside the Root', () => {
      render(
        <ScrollArea data-testid="scroll-area-viewport">
          <p>content</p>
        </ScrollArea>
      )

      const root = screen.getByTestId('scroll-area-viewport')
      const viewports = root.querySelectorAll(
        '[data-slot="scroll-area-viewport"]'
      )
      expect(viewports).toHaveLength(1)
    })

    it('applies the focus-visible ring/offset/outline tokens, size-full, rounded-[inherit], transition-[color,box-shadow], outline-none to the Viewport', () => {
      render(
        <ScrollArea data-testid="scroll-area-viewport-classes">
          <p>content</p>
        </ScrollArea>
      )

      const viewport = screen
        .getByTestId('scroll-area-viewport-classes')
        .querySelector('[data-slot="scroll-area-viewport"]')
      expect(viewport).not.toBeNull()

      // Layout classes always present.
      expect(viewport).toHaveClass('size-full')
      expect(viewport).toHaveClass('rounded-[inherit]')
      expect(viewport).toHaveClass('transition-[color,box-shadow]')
      expect(viewport).toHaveClass('outline-none')

      // focus-visible ring tokens.
      expect(viewport).toHaveClass('focus-visible:ring-2')
      expect(viewport).toHaveClass('focus-visible:ring-[color:var(--ring)]')
      expect(viewport).toHaveClass('focus-visible:ring-offset-2')
      expect(viewport).toHaveClass(
        'focus-visible:ring-offset-[color:var(--background)]'
      )
      expect(viewport).toHaveClass('focus-visible:outline-1')
    })
  })

  describe('ScrollBar + Corner are always rendered inside the Root', () => {
    it('renders exactly one [data-slot="scroll-area-scrollbar"] (default orientation="vertical") with one [data-slot="scroll-area-thumb"] inside it', () => {
      render(
        <ScrollArea data-testid="scroll-area-scrollbar">
          <p>content</p>
        </ScrollArea>
      )

      const root = screen.getByTestId('scroll-area-scrollbar')

      // Exactly one ScrollBar always rendered.
      const scrollbars = root.querySelectorAll(
        '[data-slot="scroll-area-scrollbar"]'
      )
      expect(scrollbars).toHaveLength(1)

      // The default ScrollBar carries the vertical orientation the source passes to ScrollAreaPrimitive.ScrollAreaScrollbar.
      const scrollbar = scrollbars[0]
      if (!scrollbar) throw new Error('expected exactly one scrollbar')
      expect(scrollbar).toHaveAttribute('data-orientation', 'vertical')

      // Exactly one Thumb inside the ScrollBar.
      const thumbs = scrollbar.querySelectorAll(
        '[data-slot="scroll-area-thumb"]'
      )
      expect(thumbs).toHaveLength(1)
    })

    it('renders a [data-slot="scroll-area-corner"] after the ScrollBar (Corner is always emitted)', () => {
      render(
        <ScrollArea data-testid="scroll-area-corner">
          <p>content</p>
        </ScrollArea>
      )

      const root = screen.getByTestId('scroll-area-corner')

      // Exactly one Corner inside the Root. (The mock attaches
      // data-slot="scroll-area-corner"; the real Radix Corner has no
      // data-slot, but the source always emits it as part of the composition.)
      const corners = root.querySelectorAll('[data-slot="scroll-area-corner"]')
      expect(corners).toHaveLength(1)
    })
  })

  describe('children', () => {
    it('renders children verbatim inside the Viewport (no portal, no wrapper)', () => {
      const { container } = render(
        <ScrollArea data-testid="scroll-area-children">
          <p data-testid="child-1">first</p>
          <span data-testid="child-2">second</span>
        </ScrollArea>
      )

      const root = screen.getByTestId('scroll-area-children')
      const viewport = root.querySelector('[data-slot="scroll-area-viewport"]')
      if (!viewport) throw new Error('expected viewport')

      const child1 = screen.getByTestId('child-1')
      const child2 = screen.getByTestId('child-2')

      // Children live inside the Viewport (no portal — Radix Root
      // does not portal here, so container.firstElementChild === root).
      expect(viewport.contains(child1)).toBe(true)
      expect(viewport.contains(child2)).toBe(true)

      // No portal: container.firstElementChild === root.
      expect(container.firstElementChild).toBe(root)
    })
  })

  describe('className merge', () => {
    it('concatenates the cn() base class relative with the user-supplied className (both present)', () => {
      render(
        <ScrollArea
          data-testid="scroll-area-merge"
          className="custom-class another-class"
        >
          <p>content</p>
        </ScrollArea>
      )

      const root = screen.getByTestId('scroll-area-merge')

      // Base cn() class always present.
      expect(root).toHaveClass('relative')

      // User-supplied classes appended.
      expect(root).toHaveClass('custom-class')
      expect(root).toHaveClass('another-class')
    })
  })

  describe('prop forwarding', () => {
    it('forwards id, aria-label, data-testid onto the rendered Root', () => {
      render(
        <ScrollArea
          id="my-scroll-area"
          aria-label="long document"
          data-testid="scroll-area-forwarding"
        >
          <p>content</p>
        </ScrollArea>
      )

      const root = screen.getByTestId('scroll-area-forwarding')
      expect(root).toHaveAttribute('id', 'my-scroll-area')
      expect(root).toHaveAttribute('aria-label', 'long document')
      expect(root).toHaveAttribute('data-slot', 'scroll-area')
    })

    it('forwards a click handler via onClick and fires it on click', () => {
      const onClick = vi.fn()
      render(
        <ScrollArea data-testid="scroll-area-onclick" onClick={onClick}>
          <p>content</p>
        </ScrollArea>
      )

      const root = screen.getByTestId('scroll-area-onclick')
      fireEvent.click(root)

      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('forwards style onto the rendered Root', () => {
      render(
        <ScrollArea data-testid="scroll-area-style" style={{ color: 'red' }}>
          <p>content</p>
        </ScrollArea>
      )

      const root = screen.getByTestId('scroll-area-style')
      expect(root.style.color).toBe('red')
    })
  })
})

describe('ScrollBar', () => {
  describe('default rendering (orientation="vertical")', () => {
    it('renders a [data-slot="scroll-area-scrollbar"] with data-orientation="vertical" and the unconditional cn() base classes', () => {
      render(<ScrollBar data-testid="scrollbar-vertical" />)

      const scrollbar = screen.getByTestId('scrollbar-vertical')

      expect(scrollbar).toHaveAttribute('data-slot', 'scroll-area-scrollbar')
      // The source passes orientation='vertical' (default) to the ScrollAreaScrollbar primitive; the mock forwards that as data-orientation.
      expect(scrollbar).toHaveAttribute('data-orientation', 'vertical')

      // cn() base classes always present.
      expect(scrollbar).toHaveClass('flex')
      expect(scrollbar).toHaveClass('touch-none')
      expect(scrollbar).toHaveClass('p-px')
      expect(scrollbar).toHaveClass('transition-colors')
      expect(scrollbar).toHaveClass('select-none')
    })

    it('concatenates the vertical orientation-conditional class token (h-full w-2.5 border-l border-l-transparent)', () => {
      render(<ScrollBar data-testid="scrollbar-vertical-tokens" />)

      const scrollbar = screen.getByTestId('scrollbar-vertical-tokens')

      // Vertical orientation classes concatenated for the vertical render.
      expect(scrollbar).toHaveClass('h-full')
      expect(scrollbar).toHaveClass('w-2.5')
      expect(scrollbar).toHaveClass('border-l')
      expect(scrollbar).toHaveClass('border-l-transparent')
    })

    it('renders a [data-slot="scroll-area-thumb"] with bg-[color:var(--border)] relative flex-1 rounded-full', () => {
      render(<ScrollBar data-testid="scrollbar-vertical-thumb" />)

      const scrollbar = screen.getByTestId('scrollbar-vertical-thumb')
      const thumb = scrollbar.querySelector('[data-slot="scroll-area-thumb"]')
      if (!thumb) throw new Error('expected thumb')
      expect(thumb).toHaveAttribute('data-slot', 'scroll-area-thumb')
      expect(thumb).toHaveClass('bg-[color:var(--border)]')
      expect(thumb).toHaveClass('relative')
      expect(thumb).toHaveClass('flex-1')
      expect(thumb).toHaveClass('rounded-full')
    })
  })

  describe('orientation="horizontal"', () => {
    it('renders data-orientation="horizontal" on the ScrollAreaScrollbar and concatenates the horizontal conditional class token (h-2.5 flex-col border-t border-t-transparent)', () => {
      render(
        <ScrollBar
          data-testid="scrollbar-horizontal"
          orientation="horizontal"
        />
      )

      const scrollbar = screen.getByTestId('scrollbar-horizontal')

      expect(scrollbar).toHaveAttribute('data-slot', 'scroll-area-scrollbar')
      expect(scrollbar).toHaveAttribute('data-orientation', 'horizontal')

      // Horizontal orientation classes concatenated.
      expect(scrollbar).toHaveClass('h-2.5')
      expect(scrollbar).toHaveClass('flex-col')
      expect(scrollbar).toHaveClass('border-t')
      expect(scrollbar).toHaveClass('border-t-transparent')

      // Base classes still present (always concatenated).
      expect(scrollbar).toHaveClass('flex')
      expect(scrollbar).toHaveClass('touch-none')
      expect(scrollbar).toHaveClass('p-px')
      expect(scrollbar).toHaveClass('transition-colors')
      expect(scrollbar).toHaveClass('select-none')
    })

    it('does not concatenate the vertical orientation-conditional class token when orientation="horizontal" (cn() && filters the false branch via clsx)', () => {
      render(
        <ScrollBar
          data-testid="scrollbar-horizontal-no-vertical"
          orientation="horizontal"
        />
      )

      const scrollbar = screen.getByTestId('scrollbar-horizontal-no-vertical')

      // Vertical classes must NOT be in the className.
      expect(scrollbar).not.toHaveClass('h-full')
      expect(scrollbar).not.toHaveClass('w-2.5')
      expect(scrollbar).not.toHaveClass('border-l')
      expect(scrollbar).not.toHaveClass('border-l-transparent')
    })

    it('does not concatenate the horizontal orientation-conditional class token when orientation="vertical" (cn() && filters the false branch via clsx)', () => {
      render(<ScrollBar data-testid="scrollbar-vertical-no-horizontal" />)

      const scrollbar = screen.getByTestId('scrollbar-vertical-no-horizontal')

      // Horizontal classes must NOT be in the className.
      expect(scrollbar).not.toHaveClass('h-2.5')
      expect(scrollbar).not.toHaveClass('flex-col')
      expect(scrollbar).not.toHaveClass('border-t')
      expect(scrollbar).not.toHaveClass('border-t-transparent')
    })
  })

  describe('className merge', () => {
    it('concatenates the base/conditional tokens with the user-supplied className (both present)', () => {
      render(
        <ScrollBar
          data-testid="scrollbar-merge"
          className="custom-scroll another-scroll"
        />
      )

      const scrollbar = screen.getByTestId('scrollbar-merge')

      // Base classes.
      expect(scrollbar).toHaveClass('flex')
      expect(scrollbar).toHaveClass('touch-none')
      expect(scrollbar).toHaveClass('p-px')
      expect(scrollbar).toHaveClass('transition-colors')
      expect(scrollbar).toHaveClass('select-none')

      // Vertical conditional classes.
      expect(scrollbar).toHaveClass('h-full')
      expect(scrollbar).toHaveClass('w-2.5')
      expect(scrollbar).toHaveClass('border-l')
      expect(scrollbar).toHaveClass('border-l-transparent')

      // User-supplied classes.
      expect(scrollbar).toHaveClass('custom-scroll')
      expect(scrollbar).toHaveClass('another-scroll')
    })

    it('concatenates the user-supplied className for orientation="horizontal" alongside the horizontal token', () => {
      render(
        <ScrollBar
          data-testid="scrollbar-merge-horizontal"
          orientation="horizontal"
          className="custom-scroll"
        />
      )

      const scrollbar = screen.getByTestId('scrollbar-merge-horizontal')

      expect(scrollbar).toHaveClass('flex')
      expect(scrollbar).toHaveClass('h-2.5')
      expect(scrollbar).toHaveClass('flex-col')
      expect(scrollbar).toHaveClass('border-t')
      expect(scrollbar).toHaveClass('border-t-transparent')
      expect(scrollbar).toHaveClass('custom-scroll')
    })
  })

  describe('prop forwarding', () => {
    it('forwards id and data-testid onto the ScrollAreaScrollbar', () => {
      render(<ScrollBar id="my-scrollbar" data-testid="scrollbar-forwarding" />)

      const scrollbar = screen.getByTestId('scrollbar-forwarding')
      expect(scrollbar).toHaveAttribute('id', 'my-scrollbar')
      expect(scrollbar).toHaveAttribute('data-slot', 'scroll-area-scrollbar')
    })

    it('forwards a pointerdown handler via onPointerDown and fires it on pointerdown', () => {
      const onPointerDown = vi.fn()
      render(
        <ScrollBar
          data-testid="scrollbar-onpointerdown"
          onPointerDown={onPointerDown}
        />
      )

      const scrollbar = screen.getByTestId('scrollbar-onpointerdown')
      fireEvent.pointerDown(scrollbar)

      expect(onPointerDown).toHaveBeenCalledTimes(1)
    })
  })
})
