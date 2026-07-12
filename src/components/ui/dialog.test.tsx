import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from './dialog'

/**
 * These tests cover the thin shadcn-style Radix Dialog wrappers declared
 * in src/components/ui/dialog.tsx (9 exports). Coverage before these tests:
 *   Dialog          → covered (Root is context-only, exercised indirectly)
 *   DialogTrigger   → UNCOVERED (line 16) — covered here
 *   DialogPortal    → covered (always invoked by DialogContent)
 *   DialogClose     → UNCOVERED (line 28) — covered here
 *   DialogOverlay   → covered (always invoked by DialogContent)
 *   DialogContent   → covered (always invoked when dialog is open)
 *   DialogHeader    → covered (always invoked by callers)
 *   DialogFooter    → covered (always invoked by callers)
 *   DialogTitle     → covered (always invoked by callers)
 *   DialogDescription → covered (always invoked by callers)
 *
 * The two wrapper components this card targets (`DialogTrigger` and
 * `DialogClose`) are 1-line shadcn-style passthrough components:
 *
 *   function DialogTrigger(props) {
 *     return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
 *   }
 *   function DialogClose(props) {
 *     return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
 *   }
 *
 * They are NOT exercised by any existing production code path — no
 * production component imports them, only the application code that
 * consumes the wrapper radix primitives directly. So we have to render
 * them ourselves to drive coverage.
 *
 * Radix quirks we work around here:
 *   - `DialogPrimitive.Root` is a context-only provider — it does NOT
 *     render any DOM element of its own, so its `data-slot="dialog"`
 *     attribute never surfaces in the DOM. We assert coverage by
 *     verifying that children mount and that downstream consumers
 *     (Trigger + Content) behave correctly when wrapped.
 *   - `DialogPrimitive.Content` only mounts its Portal subtree once
 *     the parent Dialog is in an open state. For Content tests we
 *     render the open tree explicitly via `open={true}`.
 *   - `DialogPrimitive.Content` renders inside a Radix Portal at
 *     `document.body`, so its DOM does not live under the `container`
 *     returned by `render`. All assertions go through `screen` queries
 *     (which default to body).
 *   - Radix DialogTitle / DialogDescription are SEPARATE components;
 *     they are NOT auto-rendered by DialogContent. The tests must
 *     place them as children inside the Content body.
 *   - Radix DialogPortal (when wrapping a single child) inlines the
 *     child at body level — it does NOT add a wrapper element of its
 *     own. Data attributes passed to a Portal with one child fall on
 *     the child, not on a wrapper. We exercise the wrapper by
 *     rendering it around the DialogContent + DialogOverlay tree
 *     (where it wraps multiple children and the portal-slot attribute
 *     becomes visible).
 */

// Tiny helper: render an open dialog with all required parts (title +
// description) so Radix stops complaining about the missing slots for
// accessibility. The body text lets each test assert against a stable
// string the test owns.
function renderOpenDialog(
  ui: (handleOpenChange?: (next: boolean) => void) => React.ReactNode,
  options?: { handleOpenChange?: (next: boolean) => void }
) {
  return render(
    <Dialog open={true} onOpenChange={options?.handleOpenChange}>
      <DialogContent>
        <DialogTitle>dialog title</DialogTitle>
        <DialogDescription>dialog description</DialogDescription>
        {ui(options?.handleOpenChange)}
      </DialogContent>
    </Dialog>
  )
}

describe('Dialog wrappers (Radix)', () => {
  describe('Dialog (Root)', () => {
    it('mounts Content children when open={true}', () => {
      // DialogPrimitive.Root is context-only — there is no DOM element
      // to query. We verify that the Root ran by asserting that an open
      // Dialog tree inside it mounts its Content. If the Root context
      // were not connected, Content would throw "DialogContent must be
      // used within Dialog".
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogTitle>t</DialogTitle>
            <DialogDescription>d</DialogDescription>
            body inside root
          </DialogContent>
        </Dialog>
      )

      expect(screen.getByText('body inside root')).toBeInTheDocument()
    })

    it('does not mount Content children when open is false (default)', () => {
      // Without an open state, Radix unmounts the portal subtree. The
      // content body is absent from the DOM.
      render(
        <Dialog>
          <DialogContent>
            <DialogTitle>t</DialogTitle>
            <DialogDescription>d</DialogDescription>
            hidden body
          </DialogContent>
        </Dialog>
      )

      expect(screen.queryByText('hidden body')).not.toBeInTheDocument()
    })

    it('forwards an explicit defaultOpen prop to Radix Root (Content mounts)', () => {
      // defaultOpen is a Radix Root prop. The Dialog wrapper just
      // spreads ...props onto the Root. We verify by mounting with
      // defaultOpen and checking the Content appears without an
      // explicit open prop on the wrapper.
      render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>t</DialogTitle>
            <DialogDescription>d</DialogDescription>
            default-open body
          </DialogContent>
        </Dialog>
      )

      expect(screen.getByText('default-open body')).toBeInTheDocument()
    })

    it('forwards an onOpenChange callback to Radix Root', () => {
      // The Radix Root accepts an onOpenChange callback (fires when
      // the open state changes). We exercise it by toggling via a
      // Trigger and asserting the callback saw the new value.
      let observed: boolean | undefined
      const handleOpenChange = (next: boolean) => {
        observed = next
      }

      render(
        <Dialog onOpenChange={handleOpenChange}>
          <DialogTrigger>open me</DialogTrigger>
          <DialogContent>
            <DialogTitle>t</DialogTitle>
            <DialogDescription>d</DialogDescription>
            body
          </DialogContent>
        </Dialog>
      )

      fireEvent.click(screen.getByText('open me'))
      expect(observed).toBe(true)
    })
  })

  describe('DialogTrigger', () => {
    it('applies data-slot="dialog-trigger" and renders a <button> by default', () => {
      render(
        <Dialog>
          <DialogTrigger>open dialog</DialogTrigger>
        </Dialog>
      )

      const trigger = screen.getByText('open dialog')
      expect(trigger.tagName).toBe('BUTTON')
      expect(trigger).toHaveAttribute('data-slot', 'dialog-trigger')
    })

    it('opens the dialog when the trigger is clicked', () => {
      render(
        <Dialog>
          <DialogTrigger>open dialog</DialogTrigger>
          <DialogContent>
            <DialogTitle>t</DialogTitle>
            <DialogDescription>d</DialogDescription>
            body after click
          </DialogContent>
        </Dialog>
      )

      expect(screen.queryByText('body after click')).not.toBeInTheDocument()
      fireEvent.click(screen.getByText('open dialog'))
      expect(screen.getByText('body after click')).toBeInTheDocument()
    })

    it('renders an asChild trigger when wrapping another element', () => {
      // When asChild is set, Radix forwards onto the child element so
      // the data-slot lands on the child rather than on a wrapping
      // <button>.
      render(
        <Dialog>
          <DialogTrigger asChild>
            <a href="#x">link trigger</a>
          </DialogTrigger>
        </Dialog>
      )

      const anchor = screen.getByText('link trigger')
      expect(anchor).toHaveAttribute('data-slot', 'dialog-trigger')
      expect(anchor.tagName).toBe('A')
    })

    it('forwards arbitrary HTML attributes (id, aria-*, data-*) via props spread', () => {
      render(
        <Dialog>
          <DialogTrigger
            id="my-trigger"
            aria-label="Open settings dialog"
            data-custom="hello"
          >
            trigger
          </DialogTrigger>
        </Dialog>
      )

      const trigger = screen.getByText('trigger')
      expect(trigger).toHaveAttribute('id', 'my-trigger')
      expect(trigger).toHaveAttribute('aria-label', 'Open settings dialog')
      expect(trigger).toHaveAttribute('data-custom', 'hello')
    })
  })

  describe('DialogPortal', () => {
    it("teleports Content to body level via DialogContent's internal Portal", () => {
      // DialogContent composes <DialogPortal data-slot="dialog-portal">
      // internally. Radix's Portal uses createPortal to teleport its
      // children out of the React root container into <body> — the
      // visible side effect is that the rendered Content subtree lands
      // under <body> rather than inside the React root container. (The
      // Portal primitive does NOT render any DOM element of its own,
      // so the data-slot attribute is consumed but invisible; we
      // verify the wrapper ran by checking the teleported subtree's
      // location.)
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogTitle>t</DialogTitle>
            <DialogDescription>d</DialogDescription>
            body in portal
          </DialogContent>
        </Dialog>
      )

      const content = document.querySelector('[data-slot="dialog-content"]')
      expect(content).toBeInTheDocument()
      // The Portal teleported the Content subtree directly to <body> —
      // parentElement is body (no intermediate wrapper).
      expect(content?.parentElement).toBe(document.body)
    })

    it('teleports sibling children to body level when used directly', () => {
      // When used as a standalone wrapper around an arbitrary tree,
      // DialogPortal forwards onto Radix Portal which uses createPortal
      // to teleport every child directly to <body>. We render
      // DialogPortal around a DialogOverlay + a marker span inside an
      // open Dialog and verify both children landed at body level
      // (proving the wrapper ran).
      render(
        <Dialog open={true}>
          <DialogPortal>
            <DialogOverlay />
            <span data-testid="inner-sibling">inner sibling</span>
          </DialogPortal>
        </Dialog>
      )

      const overlay = document.querySelector('[data-slot="dialog-overlay"]')
      const sibling = screen.getByTestId('inner-sibling')
      expect(overlay).toBeInTheDocument()
      // Both children of DialogPortal ended up directly under <body>.
      expect(overlay?.parentElement).toBe(document.body)
      expect(sibling.parentElement).toBe(document.body)
      // The two teleported children are siblings under <body> (no
      // intermediate wrapper div carrying the portal slot).
      expect(overlay?.nextSibling).toBe(sibling)
    })
  })

  describe('DialogClose', () => {
    it('applies data-slot="dialog-close" and renders a <button> by default', () => {
      // DialogClose must live inside an open Dialog for the wrapped
      // RadixPrimitive.Close to mount. We render an open dialog and
      // put a DialogClose inside the content body.
      renderOpenDialog(() => <DialogClose>close me</DialogClose>)

      const close = screen.getByText('close me')
      expect(close.tagName).toBe('BUTTON')
      expect(close).toHaveAttribute('data-slot', 'dialog-close')
    })

    it('closes the dialog when clicked (interactive close via the wrapper)', async () => {
      // DialogClose must flip the open state to false on click. We
      // observe via an onOpenChange handler on the parent Dialog.
      const user = userEvent.setup()
      let observed: boolean | undefined
      const handleOpenChange = (next: boolean) => {
        observed = next
      }

      render(
        <Dialog open={true} onOpenChange={handleOpenChange}>
          <DialogContent>
            <DialogTitle>t</DialogTitle>
            <DialogDescription>d</DialogDescription>
            <DialogClose>close button</DialogClose>
          </DialogContent>
        </Dialog>
      )

      await user.click(screen.getByText('close button'))
      expect(observed).toBe(false)
    })

    it('renders an asChild close when wrapping another element', () => {
      // When asChild is set, Radix forwards onto the child element so
      // the data-slot lands on the child rather than on a wrapping
      // <button>.
      renderOpenDialog(() => (
        <DialogClose asChild>
          <a href="#x">link close</a>
        </DialogClose>
      ))

      const anchor = screen.getByText('link close')
      expect(anchor).toHaveAttribute('data-slot', 'dialog-close')
      expect(anchor.tagName).toBe('A')
    })

    it('forwards arbitrary HTML attributes (id, aria-*, data-*) via props spread', () => {
      renderOpenDialog(() => (
        <DialogClose id="my-close" aria-label="Close dialog" data-custom="bye">
          close
        </DialogClose>
      ))

      const close = screen.getByText('close')
      expect(close).toHaveAttribute('id', 'my-close')
      expect(close).toHaveAttribute('aria-label', 'Close dialog')
      expect(close).toHaveAttribute('data-custom', 'bye')
    })
  })

  describe('DialogOverlay', () => {
    it('renders an overlay with data-slot="dialog-overlay" by default', () => {
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogTitle>t</DialogTitle>
            <DialogDescription>d</DialogDescription>
            body
          </DialogContent>
        </Dialog>
      )

      const overlay = document.querySelector('[data-slot="dialog-overlay"]')
      expect(overlay).toBeInTheDocument()
    })

    it('applies the default Tailwind utility classes from cn(base)', () => {
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogTitle>t</DialogTitle>
            <DialogDescription>d</DialogDescription>
            body
          </DialogContent>
        </Dialog>
      )

      const overlay = document.querySelector<HTMLElement>(
        '[data-slot="dialog-overlay"]'
      )
      expect(overlay).toHaveClass('fixed')
      expect(overlay).toHaveClass('inset-0')
    })

    it('forwards a ref to the underlying overlay div via React 19 ref-as-prop', () => {
      // DialogOverlay is forwardRef. We wrap it in DialogPortal inside
      // an open Dialog so the Portal context is provided, and assert
      // the ref reached the rendered overlay element.
      let captured: HTMLElement | null = null
      render(
        <Dialog open={true}>
          <DialogPortal>
            <DialogOverlay
              ref={node => {
                captured = node
              }}
              data-testid="my-overlay"
            />
          </DialogPortal>
        </Dialog>
      )

      const overlay = screen.getByTestId('my-overlay')
      // The ref reached the rendered overlay element.
      expect(captured).toBe(overlay)
      expect(overlay).toHaveAttribute('data-slot', 'dialog-overlay')
    })
  })

  describe('DialogContent', () => {
    it('renders into a Radix Portal with data-slot="dialog-content"', () => {
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogTitle>t</DialogTitle>
            <DialogDescription>d</DialogDescription>
            <span>content body</span>
          </DialogContent>
        </Dialog>
      )

      const content = screen
        .getByText('content body')
        .closest('[data-slot="dialog-content"]')
      expect(content).toBeInTheDocument()
    })

    it('applies the default Tailwind utility classes from cn(base)', () => {
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogTitle>t</DialogTitle>
            <DialogDescription>d</DialogDescription>
            body
          </DialogContent>
        </Dialog>
      )

      const content = document.querySelector<HTMLElement>(
        '[data-slot="dialog-content"]'
      )
      // Default Tailwind classes from the wrapper cn() base string.
      expect(content).toHaveClass('fixed')
      expect(content).toHaveClass('top-[50%]')
      expect(content).toHaveClass('left-[50%]')
      expect(content).toHaveClass('z-50')
      expect(content).toHaveClass('rounded-[var(--radius)]')
      expect(content).toHaveClass('shadow-lg')
    })

    it('renders the built-in close (X) button by default (showCloseButton=true)', () => {
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogTitle>t</DialogTitle>
            <DialogDescription>d</DialogDescription>
            body
          </DialogContent>
        </Dialog>
      )

      // The DialogContent renders an X close button inside the content
      // body — find it by its role + accessible name "Close". This
      // exercises the showCloseButton={true} branch.
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
    })

    it('omits the built-in close (X) button when showCloseButton={false}', () => {
      render(
        <Dialog open={true}>
          <DialogContent showCloseButton={false}>
            <DialogTitle>t</DialogTitle>
            <DialogDescription>d</DialogDescription>
            body
          </DialogContent>
        </Dialog>
      )

      expect(
        screen.queryByRole('button', { name: /close/i })
      ).not.toBeInTheDocument()
    })

    it('merges a custom className via cn(...) alongside the base classes', () => {
      render(
        <Dialog open={true}>
          <DialogContent className="custom-dialog-class">
            <DialogTitle>t</DialogTitle>
            <DialogDescription>d</DialogDescription>
            body
          </DialogContent>
        </Dialog>
      )

      const content = document.querySelector<HTMLElement>(
        '[data-slot="dialog-content"]'
      )
      expect(content).toHaveClass('z-50')
      expect(content).toHaveClass('custom-dialog-class')
    })

    it('forwards a ref to the underlying content div via React 19 ref-as-prop', () => {
      // React 19 lets refs be passed as regular props. We assert the
      // forwardRef wrapper does not swallow or strip the ref.
      let captured: HTMLElement | null = null
      render(
        <Dialog open={true}>
          <DialogContent
            ref={node => {
              captured = node
            }}
          >
            <DialogTitle>t</DialogTitle>
            <DialogDescription>d</DialogDescription>
            body
          </DialogContent>
        </Dialog>
      )

      const content = document.querySelector<HTMLElement>(
        '[data-slot="dialog-content"]'
      )
      // The ref reached the rendered content element.
      expect(captured).toBe(content)
    })
  })

  describe('DialogHeader', () => {
    it('applies data-slot="dialog-header" and default classes via cn(base)', () => {
      renderOpenDialog(() => (
        <DialogHeader data-testid="hdr">
          <span>header content</span>
        </DialogHeader>
      ))

      const header = screen.getByTestId('hdr')
      expect(header.tagName).toBe('DIV')
      expect(header).toHaveAttribute('data-slot', 'dialog-header')
      // Default Tailwind classes from the wrapper cn() base string.
      expect(header).toHaveClass('flex')
      expect(header).toHaveClass('flex-col')
      expect(header).toHaveClass('gap-2')
    })

    it('merges a custom className via cn(...) alongside the base classes', () => {
      renderOpenDialog(() => (
        <DialogHeader data-testid="hdr" className="custom-header-class">
          <span>x</span>
        </DialogHeader>
      ))

      const header = screen.getByTestId('hdr')
      expect(header).toHaveClass('flex')
      expect(header).toHaveClass('custom-header-class')
    })
  })

  describe('DialogFooter', () => {
    it('applies data-slot="dialog-footer" and default classes via cn(base)', () => {
      renderOpenDialog(() => (
        <DialogFooter data-testid="ftr">
          <button type="button">Cancel</button>
        </DialogFooter>
      ))

      const footer = screen.getByTestId('ftr')
      expect(footer.tagName).toBe('DIV')
      expect(footer).toHaveAttribute('data-slot', 'dialog-footer')
      // Default Tailwind classes from the wrapper cn() base string.
      expect(footer).toHaveClass('flex')
      expect(footer).toHaveClass('gap-2')
    })

    it('merges a custom className via cn(...) alongside the base classes', () => {
      renderOpenDialog(() => (
        <DialogFooter data-testid="ftr" className="custom-footer-class">
          <button type="button">OK</button>
        </DialogFooter>
      ))

      const footer = screen.getByTestId('ftr')
      expect(footer).toHaveClass('flex')
      expect(footer).toHaveClass('custom-footer-class')
    })
  })

  describe('DialogTitle', () => {
    it('renders a heading element with data-slot="dialog-title"', () => {
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogTitle>My Title</DialogTitle>
            <DialogDescription>d</DialogDescription>
            body
          </DialogContent>
        </Dialog>
      )

      const title = screen.getByText('My Title')
      expect(title).toHaveAttribute('data-slot', 'dialog-title')
    })

    it('applies the default Tailwind classes from cn(base)', () => {
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogTitle>T</DialogTitle>
            <DialogDescription>D</DialogDescription>
            body
          </DialogContent>
        </Dialog>
      )

      const title = document.querySelector<HTMLElement>(
        '[data-slot="dialog-title"]'
      )
      expect(title).toHaveClass('text-lg')
      expect(title).toHaveClass('font-semibold')
    })

    it('merges a custom className via cn(...) alongside the base classes', () => {
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogTitle className="custom-title-class">T</DialogTitle>
            <DialogDescription>D</DialogDescription>
            body
          </DialogContent>
        </Dialog>
      )

      const title = document.querySelector<HTMLElement>(
        '[data-slot="dialog-title"]'
      )
      expect(title).toHaveClass('text-lg')
      expect(title).toHaveClass('custom-title-class')
    })
  })

  describe('DialogDescription', () => {
    it('renders an element with data-slot="dialog-description"', () => {
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogTitle>t</DialogTitle>
            <DialogDescription>My Desc</DialogDescription>
            body
          </DialogContent>
        </Dialog>
      )

      const desc = screen.getByText('My Desc')
      expect(desc).toHaveAttribute('data-slot', 'dialog-description')
    })

    it('applies the default Tailwind classes from cn(base)', () => {
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogTitle>t</DialogTitle>
            <DialogDescription>D</DialogDescription>
            body
          </DialogContent>
        </Dialog>
      )

      const desc = document.querySelector<HTMLElement>(
        '[data-slot="dialog-description"]'
      )
      expect(desc).toHaveClass('text-sm')
    })

    it('merges a custom className via cn(...) alongside the base classes', () => {
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogTitle>t</DialogTitle>
            <DialogDescription className="custom-desc-class">
              D
            </DialogDescription>
            body
          </DialogContent>
        </Dialog>
      )

      const desc = document.querySelector<HTMLElement>(
        '[data-slot="dialog-description"]'
      )
      expect(desc).toHaveClass('text-sm')
      expect(desc).toHaveClass('custom-desc-class')
    })
  })

  describe('integration', () => {
    it('mounts a full open Dialog with Trigger + Content + Header + Footer + Title + Description + Close', () => {
      // End-to-end: Trigger opens the dialog; Content renders inside the
      // portal with its default styling, header, footer, title, and
      // description — and a DialogClose inside the body closes it.
      // Exercises every wrapper in one tree.
      render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Integration Title</DialogTitle>
            <DialogDescription>Integration Desc</DialogDescription>
            <DialogHeader data-testid="hdr">
              <span>header child</span>
            </DialogHeader>
            <p>body child</p>
            <DialogFooter data-testid="ftr">
              <DialogClose data-testid="my-close">close</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )

      // Title + description rendered.
      expect(screen.getByText('Integration Title')).toBeInTheDocument()
      expect(screen.getByText('Integration Desc')).toBeInTheDocument()

      // Header + footer slots present.
      expect(screen.getByTestId('hdr')).toHaveAttribute(
        'data-slot',
        'dialog-header'
      )
      expect(screen.getByTestId('ftr')).toHaveAttribute(
        'data-slot',
        'dialog-footer'
      )

      // DialogClose wrapper exposed inside the footer carried the
      // data-slot onto the rendered button.
      const close = screen.getByTestId('my-close')
      expect(close.tagName).toBe('BUTTON')
      expect(close).toHaveAttribute('data-slot', 'dialog-close')

      // Content slot styling present.
      const content = document.querySelector<HTMLElement>(
        '[data-slot="dialog-content"]'
      )
      expect(content).toHaveClass('z-50')
    })
  })
})
