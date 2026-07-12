import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from './popover'

// jsdom does not implement ResizeObserver. @radix-ui/react-popover uses
// one inside `use-size` (via @radix-ui/react-popper) to drive
// positioning; a no-op stub keeps the layout effects quiet without
// forcing the test to simulate real DOM measurements.
class ResizeObserverStub {
  observe(): void {
    /* no-op */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver
}

// @radix-ui/react-popover (via @floating-ui/dom) calls scrollIntoView on
// the Content wrapper when it mounts inside a Portal. jsdom does not
// implement it. The Select test suite installs the same no-op polyfill;
// mirror it here so the popover layout effects run quietly.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    // no-op
  }
}

/**
 * These tests cover the thin shadcn-style Radix Popover wrappers declared
 * in src/components/ui/popover.tsx (4 functions: Popover, PopoverTrigger,
 * PopoverContent, PopoverAnchor). All 4 are currently at 0% coverage.
 *
 * Radix quirks we work around here:
 *  - `PopoverPrimitive.Root` is a context-only provider — it does NOT
 *    render any DOM element of its own, so its `data-slot="popover"`
 *    attribute never surfaces in the DOM. We assert coverage by
 *    verifying that children mount and that downstream consumers
 *    (Trigger + Content) behave correctly when wrapped.
 *  - `PopoverPrimitive.Content` only mounts (and only attaches its
 *    Portal) once the parent Popover is in an open state. For Content
 *    tests we render the open tree explicitly via `defaultOpen` or
 *    `open={true}`.
 *  - The `PopoverPrimitive.Content` wrapper renders inside a Radix
 *    Portal at `document.body`, so its DOM does not live under the
 *    `container` returned by `render`. All assertions go through
 *    `screen` queries (which default to body) and the `closest(...)`
 *    lookup, exactly like the Tooltip/Select test suites.
 *  - `PopoverAnchor` is purely a positioning anchor (used to align the
 *    floating Content against an element other than the Trigger); it
 *    renders an empty `<div>` (or whatever the caller passes via
 *    `asChild`) with `data-slot="popover-anchor"`.
 */
describe('Popover wrappers (Radix)', () => {
  describe('Popover', () => {
    it('mounts its children inside the Popover context (open popover renders Content)', () => {
      // PopoverPrimitive.Root is context-only — there is no DOM element
      // to query. We verify that the Root ran by asserting that an open
      // Popover tree inside it mounts its Content. If the Root context
      // were not connected, Content would throw "PopoverContent must be
      // used within Popover".
      render(
        <Popover open={true}>
          <PopoverTrigger>open trigger</PopoverTrigger>
          <PopoverContent>body inside root</PopoverContent>
        </Popover>
      )

      expect(screen.getByText('body inside root')).toBeInTheDocument()
    })

    it('does not mount Content children when closed (default open=false)', () => {
      // Without an open state, Radix unmounts the portal subtree. The
      // content text is absent from the DOM.
      render(
        <Popover>
          <PopoverTrigger>open trigger</PopoverTrigger>
          <PopoverContent>hidden body</PopoverContent>
        </Popover>
      )

      expect(screen.queryByText('hidden body')).not.toBeInTheDocument()
    })

    it('forwards an explicit `open` prop to Radix Root (Content mounts)', () => {
      // PopoverPrimitive.Root is also context-only (no DOM element).
      // We assert that an explicit open=true reaches the Root by
      // observing the downstream effect: Content mounts in the DOM.
      render(
        <Popover open={true}>
          <PopoverTrigger>trigger</PopoverTrigger>
          <PopoverContent>visible body</PopoverContent>
        </Popover>
      )

      expect(screen.getByText('visible body')).toBeInTheDocument()
    })

    it('forwards an explicit `defaultOpen` prop to Radix Root (Content mounts)', () => {
      // defaultOpen is a Radix Root prop. The Popover wrapper just
      // spreads ...props onto the Root. We verify by mounting with
      // defaultOpen and checking the Content appears without an
      // explicit open prop on the wrapper.
      render(
        <Popover defaultOpen>
          <PopoverTrigger>trigger</PopoverTrigger>
          <PopoverContent>default-open body</PopoverContent>
        </Popover>
      )

      expect(screen.getByText('default-open body')).toBeInTheDocument()
    })

    it('forwards an `onOpenChange` callback to Radix Root (fires on trigger click)', () => {
      let observed: boolean | undefined
      const handleOpenChange = (next: boolean) => {
        observed = next
      }

      render(
        <Popover onOpenChange={handleOpenChange}>
          <PopoverTrigger>trigger</PopoverTrigger>
          <PopoverContent>body</PopoverContent>
        </Popover>
      )

      fireEvent.click(screen.getByText('trigger'))
      expect(observed).toBe(true)
    })
  })

  describe('PopoverTrigger', () => {
    it('applies data-slot and renders a <button> by default', () => {
      render(
        <Popover>
          <PopoverTrigger>open</PopoverTrigger>
        </Popover>
      )

      const trigger = screen.getByText('open')
      expect(trigger.tagName).toBe('BUTTON')
      expect(trigger).toHaveAttribute('data-slot', 'popover-trigger')
    })

    it('forwards click handlers without consuming them (Radix also listens)', () => {
      let clicks = 0
      const handleClick = () => {
        clicks += 1
      }

      render(
        <Popover>
          <PopoverTrigger onClick={handleClick}>click me</PopoverTrigger>
        </Popover>
      )

      fireEvent.click(screen.getByText('click me'))
      expect(clicks).toBe(1)
    })

    it('opens the Popover Content when clicked', () => {
      render(
        <Popover>
          <PopoverTrigger>trigger</PopoverTrigger>
          <PopoverContent>body after click</PopoverContent>
        </Popover>
      )

      expect(screen.queryByText('body after click')).not.toBeInTheDocument()
      fireEvent.click(screen.getByText('trigger'))
      expect(screen.getByText('body after click')).toBeInTheDocument()
    })

    it('renders an asChild trigger when wrapping another element', () => {
      // When asChild is set, Radix forwards onto the child element so
      // the data-slot lands on the child rather than on a wrapping
      // <button>.
      render(
        <Popover>
          <PopoverTrigger asChild>
            <a href="#x">link trigger</a>
          </PopoverTrigger>
        </Popover>
      )

      const anchor = screen.getByText('link trigger')
      expect(anchor).toHaveAttribute('data-slot', 'popover-trigger')
      expect(anchor.tagName).toBe('A')
    })

    it('forwards arbitrary HTML attributes (id, aria-*, data-*) via props spread', () => {
      render(
        <Popover>
          <PopoverTrigger
            id="my-trigger"
            aria-label="Open settings popover"
            data-custom="hello"
          >
            trigger
          </PopoverTrigger>
        </Popover>
      )

      const trigger = screen.getByText('trigger')
      expect(trigger).toHaveAttribute('id', 'my-trigger')
      expect(trigger).toHaveAttribute('aria-label', 'Open settings popover')
      expect(trigger).toHaveAttribute('data-custom', 'hello')
    })
  })

  describe('PopoverContent', () => {
    it('renders into a Radix Portal with data-slot and default styling', () => {
      render(
        <Popover defaultOpen>
          <PopoverTrigger>trigger</PopoverTrigger>
          <PopoverContent>popover body</PopoverContent>
        </Popover>
      )

      const content = screen
        .getByText('popover body')
        .closest('[data-slot="popover-content"]')
      expect(content).toBeInTheDocument()

      // Default className styling should be applied (sanity-check a
      // few classes from the wrapper cn() base).
      expect(content).toHaveClass('z-50')
      expect(content).toHaveClass('w-72')
      expect(content).toHaveClass('rounded-[var(--radius)]')
      expect(content).toHaveClass('border')
      expect(content).toHaveClass('p-4')
      expect(content).toHaveClass('shadow-lg')

      // Popper.Content (which Popover.Content wraps) is itself rendered
      // inside a `[data-radix-popper-content-wrapper]` div inside the
      // portal. Walk up to that wrapper to assert the Content ends up
      // at body level (portalled out of the React root).
      const popperWrapper = content?.closest(
        '[data-radix-popper-content-wrapper]'
      )
      expect(popperWrapper).toBeInTheDocument()
      expect(popperWrapper?.parentElement).toBe(document.body)
    })

    it('uses align="center" and sideOffset=4 by default (Radix data attributes)', () => {
      // Radix reflects the resolved align / side as data attributes on
      // the Content element. The wrapper's default `align='center'` and
      // `sideOffset={4}` flow through to Radix Popper, which writes
      // them back as `data-align` / `data-side` (side defaults to
      // "bottom" when no anchor is positioned above the trigger).
      render(
        <Popover defaultOpen>
          <PopoverTrigger>trigger</PopoverTrigger>
          <PopoverContent>popover body</PopoverContent>
        </Popover>
      )

      const content = screen
        .getByText('popover body')
        .closest('[data-slot="popover-content"]')
      expect(content).toHaveAttribute('data-align', 'center')
      expect(content).toHaveAttribute('data-side', 'bottom')
    })

    it('accepts an explicit align without crashing', () => {
      // Radix Popper consumes `align` and applies it as a positioning
      // decision — the resolved value surfaces as a `data-align`
      // attribute we can read back. We assert coverage by passing a
      // non-default value and observing the data-align change.
      render(
        <Popover defaultOpen>
          <PopoverTrigger>trigger</PopoverTrigger>
          <PopoverContent align="start">popover body</PopoverContent>
        </Popover>
      )

      const content = screen
        .getByText('popover body')
        .closest('[data-slot="popover-content"]')
      expect(content).toHaveAttribute('data-align', 'start')
    })

    it('accepts an explicit sideOffset without crashing', () => {
      // sideOffset is consumed by Radix Popper and applied as a CSS
      // translate — the raw number does not surface as a DOM
      // attribute. We assert coverage by verifying that passing a
      // custom sideOffset still mounts the Content cleanly. The
      // wrapper default-destructure (sideOffset = 4) is exercised by
      // the first Content test.
      expect(() =>
        render(
          <Popover defaultOpen>
            <PopoverTrigger>trigger</PopoverTrigger>
            <PopoverContent sideOffset={12}>popover body</PopoverContent>
          </Popover>
        )
      ).not.toThrow()

      expect(
        screen
          .getByText('popover body')
          .closest('[data-slot="popover-content"]')
      ).toBeInTheDocument()
    })

    it('merges a custom className via cn(...) alongside the base classes', () => {
      render(
        <Popover defaultOpen>
          <PopoverTrigger>trigger</PopoverTrigger>
          <PopoverContent className="custom-popover-class">
            popover body
          </PopoverContent>
        </Popover>
      )

      const content = screen
        .getByText('popover body')
        .closest('[data-slot="popover-content"]')
      // Both the default styling and the user-provided className
      // should be on the rendered element (cn merges with twMerge).
      expect(content).toHaveClass('z-50')
      expect(content).toHaveClass('custom-popover-class')
    })

    it('forwards additional props (e.g. side, align) to the primitive', () => {
      render(
        <Popover defaultOpen>
          <PopoverTrigger>trigger</PopoverTrigger>
          <PopoverContent side="right" align="end">
            popover body
          </PopoverContent>
        </Popover>
      )

      const content = screen
        .getByText('popover body')
        .closest('[data-slot="popover-content"]')
      expect(content).toBeInTheDocument()
      // Radix reflects the resolved side / align as data attributes on
      // the Content element.
      expect(content).toHaveAttribute('data-side', 'right')
      expect(content).toHaveAttribute('data-align', 'end')
    })
  })

  describe('PopoverAnchor', () => {
    it('renders a <div> with data-slot="popover-anchor" (default)', () => {
      render(
        <Popover>
          <PopoverAnchor data-testid="anchor" />
          <PopoverTrigger>trigger</PopoverTrigger>
        </Popover>
      )

      const anchor = screen.getByTestId('anchor')
      expect(anchor.tagName).toBe('DIV')
      expect(anchor).toHaveAttribute('data-slot', 'popover-anchor')
    })

    it('renders its children inside the anchor wrapper', () => {
      render(
        <Popover>
          <PopoverAnchor data-testid="anchor">
            <span>anchor child</span>
          </PopoverAnchor>
          <PopoverTrigger>trigger</PopoverTrigger>
        </Popover>
      )

      const anchor = screen.getByTestId('anchor')
      expect(anchor).toContainElement(screen.getByText('anchor child'))
    })

    it('forwards arbitrary HTML attributes (id, aria-*, data-*) via props spread', () => {
      render(
        <Popover>
          <PopoverAnchor
            data-testid="anchor"
            id="my-anchor"
            aria-label="Popover anchor"
            data-pos="left"
          />
          <PopoverTrigger>trigger</PopoverTrigger>
        </Popover>
      )

      const anchor = screen.getByTestId('anchor')
      expect(anchor).toHaveAttribute('id', 'my-anchor')
      expect(anchor).toHaveAttribute('aria-label', 'Popover anchor')
      expect(anchor).toHaveAttribute('data-pos', 'left')
    })
  })

  describe('integration', () => {
    it('mounts a full open Popover with Trigger + Content + Anchor', () => {
      // End-to-end: Anchor provides the positioning target, Trigger
      // opens the popover, Content renders inside the portal with
      // its default styling. Exercises every wrapper in one tree.
      render(
        <Popover defaultOpen>
          <PopoverAnchor data-testid="anchor">
            <span>anchor child</span>
          </PopoverAnchor>
          <PopoverTrigger>open</PopoverTrigger>
          <PopoverContent>full integration body</PopoverContent>
        </Popover>
      )

      expect(screen.getByTestId('anchor')).toHaveAttribute(
        'data-slot',
        'popover-anchor'
      )
      expect(screen.getByText('anchor child')).toBeInTheDocument()

      const trigger = screen.getByText('open')
      expect(trigger).toHaveAttribute('data-slot', 'popover-trigger')

      const content = screen
        .getByText('full integration body')
        .closest('[data-slot="popover-content"]')
      expect(content).toBeInTheDocument()
      expect(content).toHaveClass('z-50')
    })
  })
})
