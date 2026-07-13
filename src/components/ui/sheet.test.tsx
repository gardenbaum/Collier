import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet'

/**
 * These tests cover the thin shadcn-style Radix Dialog Sheet wrappers
 * declared in src/components/ui/sheet.tsx (139 lines, 9 named symbols —
 * 8 exported and 2 internal helpers used by SheetContent).
 *
 * Coverage before these tests: 0% across the module.
 *
 * Module shape (mirrors alert-dialog.tsx / dialog.tsx, built on
 * @radix-ui/react-dialog):
 *   Sheet            → Root passthrough (data-slot="sheet")
 *   SheetTrigger     → Trigger passthrough (data-slot="sheet-trigger")
 *   SheetClose       → Close passthrough (data-slot="sheet-close")
 *   SheetContent     → Portal + Overlay + Content with side variant
 *                       (top/right/bottom/left, default right) + cn() merge
 *                       + built-in Close button (XIcon + sr-only "Close")
 *   SheetHeader      → flex-col gap-1.5 p-4 + cn() merge
 *   SheetFooter      → mt-auto flex-col gap-2 p-4 + cn() merge
 *   SheetTitle       → text-[color:var(--foreground)] font-semibold + cn() merge
 *   SheetDescription → text-[color:var(--muted-foreground)] text-sm + cn() merge
 *
 * Internal-only (not exported, exercised via SheetContent):
 *   SheetPortal      → Portal passthrough (data-slot="sheet-portal")
 *   SheetOverlay     → Overlay with animated bg-black/50 + cn() merge
 *
 * Reference pattern: src/components/ui/alert-dialog.test.tsx (PR #120) —
 * same Radix-Dialog family, identical testing quirks.
 *
 * Radix quirks we work around here:
 *   - `SheetPrimitive.Root` is a context-only provider — no DOM element,
 *     so `data-slot="sheet"` never reaches the DOM. We assert coverage
 *     by verifying children mount and downstream consumers (Trigger,
 *     Content, Close) behave correctly when wrapped.
 *   - `SheetPrimitive.Content` only mounts its Portal subtree once the
 *     parent Sheet is in an open state. For Content tests we render the
 *     open tree explicitly via `open={true}`.
 *   - `SheetPrimitive.Content` renders inside a Radix Portal at
 *     `document.body`; its DOM does NOT live under the `container`
 *     returned by `render`. All assertions go through `screen` (which
 *     defaults to body) and `document.querySelector` lookups.
 *   - `SheetPrimitive.Portal` does NOT render a DOM element of its own —
 *     children are teleported to <body> via createPortal, so the
 *     portal-slot attribute (`data-slot="sheet-portal"`) is set on the
 *     Portal primitive but is invisible at body level. We exercise the
 *     SheetPortal wrapper by rendering SheetContent (which composes it
 *     internally) and verifying the teleported subtree landed at body.
 *   - SheetContent composes SheetPortal + SheetOverlay + Content
 *     internally. SheetPortal and SheetOverlay are NOT exported — we
 *     reach them via the Content's DOM (`data-slot="sheet-overlay"`
 *     lands on the Overlay element because Radix Overlay renders a
 *     real DOM node, unlike Radix Portal).
 *   - SheetContent's built-in Close button uses Radix DialogPrimitive.Close
 *     (NOT our SheetClose wrapper) and includes an XIcon + sr-only "Close"
 *     text. We verify both pieces in the SheetContent test group.
 */

// Tiny helper: render an open Sheet with all required parts so Radix
// stops complaining about missing a11y slots. The body text lets each
// test assert against a stable string the test owns.
function renderOpenSheet(
  ui: (handleOpenChange?: (next: boolean) => void) => React.ReactNode,
  options?: { handleOpenChange?: (next: boolean) => void }
) {
  return render(
    <Sheet open={true} onOpenChange={options?.handleOpenChange}>
      <SheetContent>
        <SheetTitle>sheet title</SheetTitle>
        <SheetDescription>sheet description</SheetDescription>
        {ui(options?.handleOpenChange)}
      </SheetContent>
    </Sheet>
  )
}

describe('Sheet wrappers (Radix)', () => {
  describe('Sheet (Root)', () => {
    it('mounts Content children when open={true}', () => {
      // SheetPrimitive.Root is context-only — there is no DOM element
      // to query. We verify the Root ran by asserting that an open
      // tree inside it mounts its Content. If the Root context were
      // not connected, Content would throw "SheetContent must be used
      // within Sheet".
      render(
        <Sheet open={true}>
          <SheetTrigger>open me</SheetTrigger>
          <SheetContent>
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            body inside root
          </SheetContent>
        </Sheet>
      )

      expect(screen.getByText('body inside root')).toBeInTheDocument()
    })

    it('does not mount Content children when open is false (default)', () => {
      // Without an open state, Radix unmounts the portal subtree.
      render(
        <Sheet>
          <SheetTrigger>open me</SheetTrigger>
          <SheetContent>
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            hidden body
          </SheetContent>
        </Sheet>
      )

      expect(screen.queryByText('hidden body')).not.toBeInTheDocument()
    })

    it('forwards an explicit defaultOpen prop to Radix Root (Content mounts)', () => {
      // defaultOpen is a Radix Root prop. We verify by mounting with
      // defaultOpen and checking the Content appears without an explicit
      // open prop on the wrapper.
      render(
        <Sheet defaultOpen>
          <SheetContent>
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            default-open body
          </SheetContent>
        </Sheet>
      )

      expect(screen.getByText('default-open body')).toBeInTheDocument()
    })

    it('forwards an onOpenChange callback to Radix Root when Trigger is clicked', () => {
      // The Radix Root accepts an onOpenChange callback (fires when
      // the open state changes). We exercise it by toggling via a
      // Trigger and asserting the callback saw the new value.
      let observed: boolean | undefined
      const handleOpenChange = (next: boolean) => {
        observed = next
      }

      render(
        <Sheet onOpenChange={handleOpenChange}>
          <SheetTrigger>open me</SheetTrigger>
          <SheetContent>
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      fireEvent.click(screen.getByText('open me'))
      expect(observed).toBe(true)
    })
  })

  describe('SheetTrigger', () => {
    it('applies data-slot="sheet-trigger" and renders a <button> by default', () => {
      // The Trigger wrapper renders a Radix <button> with the slot
      // attribute forwarded onto the rendered element.
      render(
        <Sheet>
          <SheetTrigger>open sheet</SheetTrigger>
        </Sheet>
      )

      const trigger = screen.getByText('open sheet')
      expect(trigger.tagName).toBe('BUTTON')
      expect(trigger).toHaveAttribute('data-slot', 'sheet-trigger')
    })

    it('opens the sheet when the trigger is clicked', () => {
      // Radix Trigger toggles the Root's open state when clicked.
      render(
        <Sheet>
          <SheetTrigger>open sheet</SheetTrigger>
          <SheetContent>
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            body after click
          </SheetContent>
        </Sheet>
      )

      expect(screen.queryByText('body after click')).not.toBeInTheDocument()
      fireEvent.click(screen.getByText('open sheet'))
      expect(screen.getByText('body after click')).toBeInTheDocument()
    })

    it('renders an asChild trigger when wrapping another element', () => {
      // When asChild is set, Radix forwards onto the child element
      // so the data-slot lands on the child rather than on a wrapping
      // <button>.
      render(
        <Sheet>
          <SheetTrigger asChild>
            <a href="#x">link trigger</a>
          </SheetTrigger>
        </Sheet>
      )

      const anchor = screen.getByText('link trigger')
      expect(anchor).toHaveAttribute('data-slot', 'sheet-trigger')
      expect(anchor.tagName).toBe('A')
    })

    it('forwards arbitrary HTML attributes (id, aria-*, data-*) via props spread', () => {
      render(
        <Sheet>
          <SheetTrigger
            id="my-trigger"
            aria-label="Open sheet"
            data-custom="hello"
          >
            trigger
          </SheetTrigger>
        </Sheet>
      )

      const trigger = screen.getByText('trigger')
      expect(trigger).toHaveAttribute('id', 'my-trigger')
      expect(trigger).toHaveAttribute('aria-label', 'Open sheet')
      expect(trigger).toHaveAttribute('data-custom', 'hello')
    })
  })

  describe('SheetClose', () => {
    it('applies data-slot="sheet-close" and renders a <button> by default', () => {
      // SheetClose is the standalone Close wrapper (separate from the
      // built-in Close button inside SheetContent). Render it inside an
      // open Sheet so Radix accepts the wrapper.
      renderOpenSheet(() => <SheetClose>close me</SheetClose>)

      const close = screen.getByText('close me')
      expect(close.tagName).toBe('BUTTON')
      expect(close).toHaveAttribute('data-slot', 'sheet-close')
    })

    it('closes the open sheet when SheetClose is clicked', async () => {
      // SheetClose forwards onto RadixPrimitive.Close which sets the
      // open state back to false on click. We observe via an
      // onOpenChange handler on the parent Sheet.
      const user = userEvent.setup()
      let observed: boolean | undefined
      const handleOpenChange = (next: boolean) => {
        observed = next
      }

      render(
        <Sheet open={true} onOpenChange={handleOpenChange}>
          <SheetContent>
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            <SheetClose>close button</SheetClose>
          </SheetContent>
        </Sheet>
      )

      await user.click(screen.getByText('close button'))
      expect(observed).toBe(false)
    })

    it('forwards arbitrary HTML attributes (id, aria-*, data-*) via props spread', () => {
      renderOpenSheet(() => (
        <SheetClose
          id="my-close"
          aria-label="Close sheet"
          data-custom="close-value"
        >
          close
        </SheetClose>
      ))

      const close = screen.getByText('close')
      expect(close).toHaveAttribute('id', 'my-close')
      expect(close).toHaveAttribute('aria-label', 'Close sheet')
      expect(close).toHaveAttribute('data-custom', 'close-value')
    })
  })

  describe('SheetContent', () => {
    it('renders inside a Radix Portal with data-slot="sheet-content"', () => {
      render(
        <Sheet open={true}>
          <SheetContent>
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            <span>content body</span>
          </SheetContent>
        </Sheet>
      )

      const content = screen
        .getByText('content body')
        .closest('[data-slot="sheet-content"]')
      expect(content).toBeInTheDocument()
    })

    it('mounts an Overlay as a sibling alongside the Content (Portal composes both)', () => {
      // SheetContent internally renders Portal > [Overlay, Content].
      // Both the overlay and the content mount when the sheet is open
      // and live as siblings under <body>.
      render(
        <Sheet open={true}>
          <SheetContent>
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      const overlay = document.querySelector('[data-slot="sheet-overlay"]')
      const content = document.querySelector('[data-slot="sheet-content"]')
      expect(overlay).toBeInTheDocument()
      expect(content).toBeInTheDocument()
      // Rendered as siblings under <body> (SheetPortal teleports both
      // children directly to body level).
      expect(overlay?.parentElement).toBe(document.body)
      expect(content?.parentElement).toBe(document.body)
      expect(overlay?.nextSibling).toBe(content)
    })

    it('applies the default Tailwind utility classes from cn(base)', () => {
      render(
        <Sheet open={true}>
          <SheetContent>
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      const content = document.querySelector<HTMLElement>(
        '[data-slot="sheet-content"]'
      )
      // Default Tailwind classes from the wrapper cn() base string.
      expect(content).toHaveClass('fixed')
      expect(content).toHaveClass('z-50')
      expect(content).toHaveClass('flex')
      expect(content).toHaveClass('flex-col')
      expect(content).toHaveClass('gap-4')
      expect(content).toHaveClass('shadow-lg')
    })

    it('merges a custom className via cn(...) alongside the base classes', () => {
      render(
        <Sheet open={true}>
          <SheetContent className="custom-sheet-class">
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      const content = document.querySelector<HTMLElement>(
        '[data-slot="sheet-content"]'
      )
      expect(content).toHaveClass('z-50')
      expect(content).toHaveClass('custom-sheet-class')
    })

    it('forwards a ref to the underlying content div via React 19 ref-as-prop', () => {
      let captured: HTMLElement | null = null
      render(
        <Sheet open={true}>
          <SheetContent
            ref={node => {
              captured = node
            }}
          >
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      const content = document.querySelector<HTMLElement>(
        '[data-slot="sheet-content"]'
      )
      expect(captured).toBe(content)
    })

    it('applies side="right" classes by default (right-edge slide-in / slide-out)', () => {
      // side defaults to 'right' (see sheet.tsx line 50). The right
      // variant anchors the sheet to the right edge with full-height
      // width 3/4 and a left border.
      render(
        <Sheet open={true}>
          <SheetContent>
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      const content = document.querySelector<HTMLElement>(
        '[data-slot="sheet-content"]'
      )
      // Right-anchored positioning classes.
      expect(content).toHaveClass('inset-y-0')
      expect(content).toHaveClass('right-0')
      expect(content).toHaveClass('h-full')
      expect(content).toHaveClass('w-3/4')
      expect(content).toHaveClass('border-l')
      expect(content).toHaveClass('sm:max-w-sm')
      // Right slide-in / slide-out direction markers.
      expect(content).toHaveClass('data-[state=closed]:slide-out-to-right')
      expect(content).toHaveClass('data-[state=open]:slide-in-from-right')
      // Sanity: NOT applied for left/top/bottom variants.
      expect(content).not.toHaveClass('inset-x-0')
      expect(content).not.toHaveClass('top-0')
      expect(content).not.toHaveClass('bottom-0')
      expect(content).not.toHaveClass('left-0')
    })

    it('applies side="left" classes when explicitly set', () => {
      render(
        <Sheet open={true}>
          <SheetContent side="left">
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      const content = document.querySelector<HTMLElement>(
        '[data-slot="sheet-content"]'
      )
      // Left-anchored positioning classes.
      expect(content).toHaveClass('inset-y-0')
      expect(content).toHaveClass('left-0')
      expect(content).toHaveClass('h-full')
      expect(content).toHaveClass('w-3/4')
      expect(content).toHaveClass('border-r')
      expect(content).toHaveClass('sm:max-w-sm')
      // Left slide-in / slide-out direction markers.
      expect(content).toHaveClass('data-[state=closed]:slide-out-to-left')
      expect(content).toHaveClass('data-[state=open]:slide-in-from-left')
      // Sanity: NOT applied for right/top/bottom variants.
      expect(content).not.toHaveClass('right-0')
      expect(content).not.toHaveClass('inset-x-0')
      expect(content).not.toHaveClass('top-0')
      expect(content).not.toHaveClass('bottom-0')
    })

    it('applies side="top" classes when explicitly set', () => {
      render(
        <Sheet open={true}>
          <SheetContent side="top">
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      const content = document.querySelector<HTMLElement>(
        '[data-slot="sheet-content"]'
      )
      // Top-anchored positioning classes.
      expect(content).toHaveClass('inset-x-0')
      expect(content).toHaveClass('top-0')
      expect(content).toHaveClass('h-auto')
      expect(content).toHaveClass('border-b')
      // Top slide-in / slide-out direction markers.
      expect(content).toHaveClass('data-[state=closed]:slide-out-to-top')
      expect(content).toHaveClass('data-[state=open]:slide-in-from-top')
      // Sanity: NOT applied for right/left/bottom variants.
      expect(content).not.toHaveClass('inset-y-0')
      expect(content).not.toHaveClass('right-0')
      expect(content).not.toHaveClass('left-0')
      expect(content).not.toHaveClass('bottom-0')
    })

    it('applies side="bottom" classes when explicitly set', () => {
      render(
        <Sheet open={true}>
          <SheetContent side="bottom">
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      const content = document.querySelector<HTMLElement>(
        '[data-slot="sheet-content"]'
      )
      // Bottom-anchored positioning classes.
      expect(content).toHaveClass('inset-x-0')
      expect(content).toHaveClass('bottom-0')
      expect(content).toHaveClass('h-auto')
      expect(content).toHaveClass('border-t')
      // Bottom slide-in / slide-out direction markers.
      expect(content).toHaveClass('data-[state=closed]:slide-out-to-bottom')
      expect(content).toHaveClass('data-[state=open]:slide-in-from-bottom')
      // Sanity: NOT applied for right/left/top variants.
      expect(content).not.toHaveClass('inset-y-0')
      expect(content).not.toHaveClass('right-0')
      expect(content).not.toHaveClass('left-0')
      expect(content).not.toHaveClass('top-0')
    })

    it('renders the built-in Close button with XIcon and sr-only "Close" text', () => {
      // SheetContent's built-in Close button uses
      // SheetPrimitive.Close directly (NOT our SheetClose wrapper) and
      // includes an XIcon (lucide-react) + sr-only "Close" text node.
      render(
        <Sheet open={true}>
          <SheetContent>
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      const content = document.querySelector<HTMLElement>(
        '[data-slot="sheet-content"]'
      )
      expect(content).toBeInTheDocument()

      // Built-in Close: a <button> inside the Content.
      const closeButton = content?.querySelector('button')
      expect(closeButton).toBeInTheDocument()

      // sr-only "Close" label (accessible name).
      const closeLabel = screen.getByText('Close')
      expect(closeLabel).toBeInTheDocument()
      expect(closeLabel.tagName).toBe('SPAN')
      expect(closeLabel).toHaveClass('sr-only')

      // XIcon rendered as an SVG inside the close button.
      const svg = closeButton?.querySelector('svg')
      expect(svg).toBeInTheDocument()
      // lucide-react applies size classes via className (size-4 here).
      expect(svg).toHaveClass('size-4')
    })

    it('closes the sheet when the built-in Close button is clicked', async () => {
      // The built-in Close button (rendered by SheetContent) closes
      // the sheet via Radix DialogPrimitive.Close — observed via the
      // parent Sheet's onOpenChange handler.
      const user = userEvent.setup()
      let observed: boolean | undefined
      const handleOpenChange = (next: boolean) => {
        observed = next
      }

      render(
        <Sheet open={true} onOpenChange={handleOpenChange}>
          <SheetContent>
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      const content = document.querySelector<HTMLElement>(
        '[data-slot="sheet-content"]'
      )
      const closeButton = content?.querySelector('button')
      expect(closeButton).toBeInTheDocument()

      await user.click(closeButton as HTMLElement)
      expect(observed).toBe(false)
    })

    it('forwards arbitrary HTML attributes (id, aria-*, data-*) via props spread', () => {
      render(
        <Sheet open={true}>
          <SheetContent
            id="my-content"
            aria-label="Sheet panel"
            data-custom="content-value"
          >
            <SheetTitle>t</SheetTitle>
            <SheetDescription>d</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      const content = document.querySelector<HTMLElement>(
        '[data-slot="sheet-content"]'
      )
      expect(content).toHaveAttribute('id', 'my-content')
      expect(content).toHaveAttribute('aria-label', 'Sheet panel')
      expect(content).toHaveAttribute('data-custom', 'content-value')
    })
  })

  describe('SheetHeader', () => {
    it('applies data-slot="sheet-header" and default classes via cn(base)', () => {
      renderOpenSheet(() => (
        <SheetHeader data-testid="hdr">
          <span>header content</span>
        </SheetHeader>
      ))

      const header = screen.getByTestId('hdr')
      expect(header.tagName).toBe('DIV')
      expect(header).toHaveAttribute('data-slot', 'sheet-header')
      // Default Tailwind classes from the wrapper cn() base string.
      expect(header).toHaveClass('flex')
      expect(header).toHaveClass('flex-col')
      expect(header).toHaveClass('gap-1.5')
      expect(header).toHaveClass('p-4')
    })

    it('merges a custom className via cn(...) alongside the base classes', () => {
      renderOpenSheet(() => (
        <SheetHeader data-testid="hdr" className="custom-header-class">
          <span>x</span>
        </SheetHeader>
      ))

      const header = screen.getByTestId('hdr')
      expect(header).toHaveClass('flex')
      expect(header).toHaveClass('custom-header-class')
    })
  })

  describe('SheetFooter', () => {
    it('applies data-slot="sheet-footer" and default classes via cn(base)', () => {
      renderOpenSheet(() => (
        <SheetFooter data-testid="ftr">
          <span>footer content</span>
        </SheetFooter>
      ))

      const footer = screen.getByTestId('ftr')
      expect(footer.tagName).toBe('DIV')
      expect(footer).toHaveAttribute('data-slot', 'sheet-footer')
      // Default Tailwind classes from the wrapper cn() base string.
      expect(footer).toHaveClass('mt-auto')
      expect(footer).toHaveClass('flex')
      expect(footer).toHaveClass('flex-col')
      expect(footer).toHaveClass('gap-2')
      expect(footer).toHaveClass('p-4')
    })

    it('merges a custom className via cn(...) alongside the base classes', () => {
      renderOpenSheet(() => (
        <SheetFooter data-testid="ftr" className="custom-footer-class">
          <span>x</span>
        </SheetFooter>
      ))

      const footer = screen.getByTestId('ftr')
      expect(footer).toHaveClass('mt-auto')
      expect(footer).toHaveClass('custom-footer-class')
    })
  })

  describe('SheetTitle', () => {
    it('renders a heading element with data-slot="sheet-title"', () => {
      // Radix DialogPrimitive.Title renders an <h2> by default — we
      // verify both the tag and the slot attribute.
      render(
        <Sheet open={true}>
          <SheetContent>
            <SheetTitle>My Title</SheetTitle>
            <SheetDescription>d</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      const title = screen.getByText('My Title')
      expect(title.tagName).toBe('H2')
      expect(title).toHaveAttribute('data-slot', 'sheet-title')
    })

    it('applies the default Tailwind classes from cn(base)', () => {
      render(
        <Sheet open={true}>
          <SheetContent>
            <SheetTitle>T</SheetTitle>
            <SheetDescription>D</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      const title = document.querySelector<HTMLElement>(
        '[data-slot="sheet-title"]'
      )
      expect(title).toHaveClass('text-[color:var(--foreground)]')
      expect(title).toHaveClass('font-semibold')
    })

    it('merges a custom className via cn(...) alongside the base classes', () => {
      render(
        <Sheet open={true}>
          <SheetContent>
            <SheetTitle className="custom-title-class">T</SheetTitle>
            <SheetDescription>D</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      const title = document.querySelector<HTMLElement>(
        '[data-slot="sheet-title"]'
      )
      expect(title).toHaveClass('font-semibold')
      expect(title).toHaveClass('custom-title-class')
    })
  })

  describe('SheetDescription', () => {
    it('renders an element with data-slot="sheet-description"', () => {
      render(
        <Sheet open={true}>
          <SheetContent>
            <SheetTitle>t</SheetTitle>
            <SheetDescription>My Desc</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      const desc = screen.getByText('My Desc')
      expect(desc).toHaveAttribute('data-slot', 'sheet-description')
    })

    it('applies the default Tailwind classes from cn(base)', () => {
      render(
        <Sheet open={true}>
          <SheetContent>
            <SheetTitle>t</SheetTitle>
            <SheetDescription>D</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      const desc = document.querySelector<HTMLElement>(
        '[data-slot="sheet-description"]'
      )
      expect(desc).toHaveClass('text-[color:var(--muted-foreground)]')
      expect(desc).toHaveClass('text-sm')
    })

    it('merges a custom className via cn(...) alongside the base classes', () => {
      render(
        <Sheet open={true}>
          <SheetContent>
            <SheetTitle>t</SheetTitle>
            <SheetDescription className="custom-desc-class">D</SheetDescription>
            body
          </SheetContent>
        </Sheet>
      )

      const desc = document.querySelector<HTMLElement>(
        '[data-slot="sheet-description"]'
      )
      expect(desc).toHaveClass('text-sm')
      expect(desc).toHaveClass('custom-desc-class')
    })
  })

  describe('integration', () => {
    it('mounts a full open Sheet with Trigger + Content + Header + Footer + Title + Description + Close', () => {
      // End-to-end: Trigger + open Sheet + Content with header, footer,
      // title, description, and a standalone SheetClose button. Exercises
      // every exported wrapper in one tree.
      render(
        <Sheet defaultOpen>
          <SheetContent>
            <SheetTitle>Integration Title</SheetTitle>
            <SheetDescription>Integration Desc</SheetDescription>
            <SheetHeader data-testid="hdr">
              <span>header child</span>
            </SheetHeader>
            <p>body child</p>
            <SheetFooter data-testid="ftr">
              <SheetClose data-testid="my-close">close</SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )

      // Title + description rendered.
      expect(screen.getByText('Integration Title')).toBeInTheDocument()
      expect(screen.getByText('Integration Desc')).toBeInTheDocument()

      // Header + footer slots present and styled.
      expect(screen.getByTestId('hdr')).toHaveAttribute(
        'data-slot',
        'sheet-header'
      )
      expect(screen.getByTestId('ftr')).toHaveAttribute(
        'data-slot',
        'sheet-footer'
      )

      // Standalone SheetClose rendered as <button> with its slot.
      const close = screen.getByTestId('my-close')
      expect(close.tagName).toBe('BUTTON')
      expect(close).toHaveAttribute('data-slot', 'sheet-close')

      // Content slot styling present.
      const content = document.querySelector<HTMLElement>(
        '[data-slot="sheet-content"]'
      )
      expect(content).toHaveClass('z-50')

      // Overlay slot also present (SheetContent composes one internally).
      expect(
        document.querySelector('[data-slot="sheet-overlay"]')
      ).toBeInTheDocument()
    })

    it('opens the sheet via Trigger click in a fully wired tree (state + portal + portal children)', () => {
      // Asserts the open path drives every wrapper into the rendered
      // tree: the Trigger click opens the Root, which causes the
      // Portal-subtree to mount, which renders the Content + Overlay
      // + Header + Footer + Title + Description + built-in Close.
      // Use act() around the click to silence the React state-update
      // outside-React warning.
      render(
        <Sheet>
          <SheetTrigger>open integration</SheetTrigger>
          <SheetContent>
            <SheetTitle>Clicked Title</SheetTitle>
            <SheetDescription>Clicked Desc</SheetDescription>
            <SheetHeader data-testid="hdr">hdr</SheetHeader>
            <SheetFooter data-testid="ftr">ftr</SheetFooter>
            <SheetClose data-testid="my-close">stop</SheetClose>
          </SheetContent>
        </Sheet>
      )

      expect(screen.queryByText('Clicked Title')).not.toBeInTheDocument()
      act(() => {
        fireEvent.click(screen.getByText('open integration'))
      })
      expect(screen.getByText('Clicked Title')).toBeInTheDocument()
      expect(screen.getByTestId('hdr')).toBeInTheDocument()
      expect(screen.getByTestId('ftr')).toBeInTheDocument()
      expect(screen.getByTestId('my-close')).toBeInTheDocument()
    })
  })
})
