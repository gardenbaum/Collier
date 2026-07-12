import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip'

// jsdom does not implement ResizeObserver. @radix-ui/react-tooltip uses
// one inside `use-size` to drive positioning; a no-op stub keeps the
// layout effects quiet without forcing the test to simulate real DOM
// measurements.
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

// Helper: Radix Tooltip renders the Content text twice — once as the
// visible body and once inside a VisuallyHidden span keyed to the
// trigger via aria-describedby (for screen-reader announcements). Pick
// the visible occurrence (the first match) and walk up to the
// `data-slot="tooltip-content"` wrapper.
function getTooltipContent(text: string): HTMLElement {
  const matches = screen.getAllByText(text)
  const node = matches[0]
  if (!node) {
    throw new Error(`Tooltip Content text not found: "${text}"`)
  }
  const wrapper = node.closest('[data-slot="tooltip-content"]')
  if (!wrapper) {
    throw new Error(`Tooltip Content wrapper not found for "${text}"`)
  }
  return wrapper as HTMLElement
}

/**
 * These tests cover the thin shadcn-style Radix Tooltip wrappers declared
 * in src/components/ui/tooltip.tsx (4 functions: TooltipProvider,
 * Tooltip, TooltipTrigger, TooltipContent). All 4 are currently at 0%
 * coverage.
 *
 * Radix quirks we work around here:
 *  - `TooltipPrimitive.Provider` and `TooltipPrimitive.Root` are
 *    context-only providers — they do NOT render any DOM element of
 *    their own. Their `data-slot` attribute therefore never surfaces
 *    in the DOM. We assert coverage by verifying that children mount
 *    and that downstream Tooltip consumers (Trigger + Content) behave
 *    correctly when wrapped.
 *  - `TooltipPrimitive.Content` only mounts (and only attaches its
 *    Portal) once `open=true` AND wrapped in a Provider. For Content
 *    tests we render the open tree explicitly.
 *  - Radix duplicates the Content children inside an aria-hidden span
 *    for screen readers, so `screen.getByText` returns multiple
 *    matches. We use a helper that picks the first and walks up to
 *    the content wrapper.
 *  - `TooltipPrimitive.Arrow` renders an inline `<svg>` with the
 *    supplied className.
 */
describe('Tooltip wrappers (Radix)', () => {
  describe('TooltipProvider', () => {
    it('mounts its children inside the Tooltip context (open tooltip renders Content)', () => {
      // TooltipPrimitive.Provider is context-only — there is no DOM
      // element to query. We instead verify that the Provider ran by
      // asserting that an open Tooltip tree inside it mounts its
      // Content. If the Provider context were not connected, Content
      // would throw "TooltipContent must be used within Tooltip".
      render(
        <TooltipProvider>
          <Tooltip open={true}>
            <TooltipTrigger>trigger</TooltipTrigger>
            <TooltipContent>body inside provider</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )

      expect(screen.getAllByText('body inside provider')[0]).toBeInTheDocument()
    })

    it('exposes its default delayDuration=0 to descendants (no waiting state)', () => {
      // With delayDuration=0 (the wrapper's default), an open Tooltip
      // is in the "instant-open" data-state, not "delayed-open". We
      // assert that by checking the trigger's data-state once the tree
      // is rendered.
      render(
        <TooltipProvider>
          <Tooltip open={true}>
            <TooltipTrigger>trigger</TooltipTrigger>
            <TooltipContent>instant body</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )

      // Radix Tooltip marks the trigger with data-state="instant-open"
      // when the open was not delayed. With delayDuration=0 (default)
      // we get this state.
      const trigger = screen.getByText('trigger')
      expect(trigger).toHaveAttribute('data-state', 'instant-open')
    })

    it('forwards a custom delayDuration to descendants', () => {
      // The wrapper forwards delayDuration to the underlying
      // TooltipPrimitive.Provider via context. The visible DOM effect
      // of a custom delayDuration is the *hover* delay (skipped here
      // because we open the tooltip with open=true), so we assert
      // coverage by verifying the tree mounts cleanly with the
      // non-default value. The Provider-context branch of the wrapper
      // is therefore exercised.
      expect(() =>
        render(
          <TooltipProvider delayDuration={700}>
            <Tooltip open={true}>
              <TooltipTrigger>trigger</TooltipTrigger>
              <TooltipContent>delayed body</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      ).not.toThrow()

      expect(screen.getAllByText('delayed body')[0]).toBeInTheDocument()
    })
  })

  describe('Tooltip', () => {
    it('auto-wraps its children in a TooltipProvider context', () => {
      // No explicit TooltipProvider - the Tooltip wrapper nests one.
      // The Trigger must still mount, proving the context was
      // established by the Tooltip wrapper's internal Provider.
      render(
        <Tooltip>
          <TooltipTrigger>auto trigger</TooltipTrigger>
        </Tooltip>
      )

      const trigger = screen.getByText('auto trigger')
      expect(trigger).toHaveAttribute('data-slot', 'tooltip-trigger')
    })

    it('does not mount Content children when closed (default open=false)', () => {
      // Without an open state, Radix unmounts the portal subtree. The
      // content text and the Content data-slot wrapper are absent
      // from the DOM.
      render(
        <Tooltip>
          <TooltipTrigger>trigger</TooltipTrigger>
          <TooltipContent>hidden body</TooltipContent>
        </Tooltip>
      )

      expect(screen.queryByText('hidden body')).not.toBeInTheDocument()
    })

    it('forwards an explicit `open` prop to Radix Root (Content mounts)', () => {
      // TooltipPrimitive.Root is also context-only (no DOM element).
      // We assert that an explicit open=true reaches the Root by
      // observing the downstream effect: Content mounts in the DOM.
      render(
        <Tooltip open={true}>
          <TooltipTrigger>trigger</TooltipTrigger>
          <TooltipContent>visible body</TooltipContent>
        </Tooltip>
      )

      expect(screen.getAllByText('visible body')[0]).toBeInTheDocument()
    })

    it('forwards extra props to the Radix Root (defaultOpen)', () => {
      // defaultOpen is a Radix Root prop. The Tooltip wrapper just
      // spreads ...props onto the Root. We verify by mounting with
      // defaultOpen and checking the Content appears without an
      // explicit open prop on the wrapper.
      render(
        <Tooltip defaultOpen>
          <TooltipTrigger>trigger</TooltipTrigger>
          <TooltipContent>default-open body</TooltipContent>
        </Tooltip>
      )

      expect(screen.getAllByText('default-open body')[0]).toBeInTheDocument()
    })
  })

  describe('TooltipTrigger', () => {
    it('applies data-slot and forwards click handlers', () => {
      let clicks = 0
      const handleClick = () => {
        clicks += 1
      }

      render(
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger onClick={handleClick}>hover me</TooltipTrigger>
          </Tooltip>
        </TooltipProvider>
      )

      const trigger = screen.getByText('hover me')
      expect(trigger).toHaveAttribute('data-slot', 'tooltip-trigger')
      fireEvent.click(trigger)
      expect(clicks).toBe(1)
    })

    it('renders an asChild trigger when wrapping another element', () => {
      // When asChild is set, Radix forwards onto the child element so
      // the data-slot lands on the child rather than on a wrapping
      // <button>.
      render(
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <a href="#x">link trigger</a>
            </TooltipTrigger>
          </Tooltip>
        </TooltipProvider>
      )

      const anchor = screen.getByText('link trigger')
      expect(anchor).toHaveAttribute('data-slot', 'tooltip-trigger')
      expect(anchor.tagName).toBe('A')
    })
  })

  describe('TooltipContent', () => {
    it('renders into a Radix Portal with data-slot, default styling, and an Arrow child', () => {
      render(
        <TooltipProvider>
          <Tooltip open={true}>
            <TooltipTrigger>trigger</TooltipTrigger>
            <TooltipContent>tooltip body</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )

      const content = getTooltipContent('tooltip body')
      expect(content).toBeInTheDocument()

      // Default className styling should be applied (sanity-check a
      // few classes from the wrapper cn() base).
      expect(content).toHaveClass('z-50')
      expect(content).toHaveClass('rounded-[var(--radius)]')
      expect(content).toHaveClass('px-3')
      expect(content).toHaveClass('py-1.5')

      // Popper.Content (which Tooltip.Content wraps) is itself rendered
      // inside a `[data-radix-popper-content-wrapper]` div inside the
      // portal. Walk up to that wrapper to assert the Content ends up
      // at body level (portalled out of the React root).
      const popperWrapper = content.closest(
        '[data-radix-popper-content-wrapper]'
      )
      expect(popperWrapper).toBeInTheDocument()
      expect(popperWrapper?.parentElement).toBe(document.body)

      // Arrow child: Radix renders <TooltipPrimitive.Arrow> as an
      // inline <svg> with the supplied className.
      const arrow = content.querySelector('svg')
      expect(arrow).toBeInTheDocument()
      expect(arrow).toHaveClass('size-2.5')
    })

    it('accepts an explicit sideOffset without crashing', () => {
      // Radix Popper consumes sideOffset and applies it as a CSS
      // translate - the raw number does not surface as a DOM attribute
      // we can reliably read. We assert coverage by verifying that
      // passing a custom sideOffset still mounts the Content cleanly.
      // The wrapper default-destructure (sideOffset = 0) is
      // exercised by the previous test.
      expect(() =>
        render(
          <TooltipProvider>
            <Tooltip open={true}>
              <TooltipTrigger>trigger</TooltipTrigger>
              <TooltipContent sideOffset={8}>tooltip body</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      ).not.toThrow()

      const content = getTooltipContent('tooltip body')
      expect(content).toBeInTheDocument()
    })

    it('merges a custom className via cn(...)', () => {
      render(
        <TooltipProvider>
          <Tooltip open={true}>
            <TooltipTrigger>trigger</TooltipTrigger>
            <TooltipContent className="custom-tooltip-class">
              tooltip body
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )

      const content = getTooltipContent('tooltip body')
      expect(content).toBeInTheDocument()
      // Both the default styling and the user-provided className
      // should be on the rendered element (cn merges with twMerge).
      expect(content).toHaveClass('z-50')
      expect(content).toHaveClass('custom-tooltip-class')
    })

    it('forwards additional props (e.g. align, side) to the primitive', () => {
      render(
        <TooltipProvider>
          <Tooltip open={true}>
            <TooltipTrigger>trigger</TooltipTrigger>
            <TooltipContent side="right" align="start">
              tooltip body
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )

      const content = getTooltipContent('tooltip body')
      expect(content).toBeInTheDocument()
      // Radix reflects the resolved side / align as data attributes on
      // the Content element.
      expect(content).toHaveAttribute('data-side', 'right')
      expect(content).toHaveAttribute('data-align', 'start')
    })
  })

  describe('integration', () => {
    it('mounts a full open Tooltip with Trigger + Content + Arrow', () => {
      render(
        <TooltipProvider>
          <Tooltip open={true}>
            <TooltipTrigger>hover me</TooltipTrigger>
            <TooltipContent>full integration body</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )

      const trigger = screen.getByText('hover me')
      expect(trigger).toHaveAttribute('data-slot', 'tooltip-trigger')

      const content = getTooltipContent('full integration body')
      expect(content).toBeInTheDocument()
      expect(content.querySelector('svg')).toBeInTheDocument()
    })
  })
})
