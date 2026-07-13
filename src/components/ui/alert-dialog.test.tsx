import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog'

/**
 * These tests cover the thin shadcn-style Radix AlertDialog wrappers
 * declared in src/components/ui/alert-dialog.tsx (11 exports).
 * Coverage before these tests: 0% across the module.
 *
 * Module shape:
 *   AlertDialog          → Root passthrough (data-slot="alert-dialog")
 *   AlertDialogTrigger   → Trigger passthrough (data-slot="alert-dialog-trigger")
 *   AlertDialogPortal    → Portal passthrough (data-slot="alert-dialog-portal")
 *   AlertDialogOverlay   → Overlay with animated bg-black/50 + cn() merge
 *   AlertDialogContent   → Portal + Overlay + Content with cn() merge
 *   AlertDialogHeader    → flex-col gap-2 text-center sm:text-start + cn() merge
 *   AlertDialogFooter    → flex-col-reverse gap-2 sm:flex-row sm:justify-end + cn() merge
 *   AlertDialogTitle     → text-lg font-semibold + cn() merge
 *   AlertDialogDescription → text-[color:var(--muted-foreground)] text-sm + cn() merge
 *   AlertDialogAction    → buttonVariants() (Variant A cva, default button) + cn() merge
 *   AlertDialogCancel    → buttonVariants({variant:'outline'}) (Variant A cva) + cn() merge
 *
 * Reference pattern: src/components/ui/dialog.test.tsx (PR #115), which is
 * the same Radix-Dialog-based 9-export suite; AlertDialog is built on the
 * same primitives plus Action / Cancel with cva-variant button styling.
 *
 * Radix quirks we work around here (same as dialog.test.tsx):
 *   - `AlertDialogPrimitive.Root` is a context-only provider — no DOM
 *     element, so `data-slot="alert-dialog"` never reaches the DOM. We
 *     assert coverage by verifying children mount and downstream
 *     consumers (Trigger + Content) behave correctly when wrapped.
 *   - `AlertDialogPrimitive.Content` only mounts its Portal subtree
 *     once the parent AlertDialog is in an open state. For Content
 *     tests we render the open tree explicitly via `open={true}`.
 *   - `AlertDialogPrimitive.Content` renders inside a Radix Portal at
 *     `document.body`; its DOM does NOT live under the `container`
 *     returned by `render`. All assertions go through `screen` (which
 *     defaults to body) and `closest(...)` lookups.
 *   - `AlertDialogPrimitive.Portal` (Radix Portal) does NOT render a
 *     DOM element of its own — children are teleported to <body>
 *     via createPortal, so the portal-slot attribute is consumed but
 *     invisible at body level. We exercise the wrapper by rendering it
 *     directly around an Overlay + a marker span and checking the
 *     teleported subtree landed at body level.
 *   - `AlertDialogAction` / `AlertDialogCancel` are Radix primitives
 *     that render as plain <button> elements by default. Unlike the
 *     other wrappers they do NOT carry a `data-slot` attribute (see
 *     lines 119–141 of alert-dialog.tsx) — we identify them via their
 *     rendered text and assert via their button className instead.
 *
 * cva note (Variant A — input changes per variant → className differs):
 *   AlertDialogAction calls `cn(buttonVariants())` — default variant
 *     (solid `bg-[color:var(--primary)]`), no `border`.
 *   AlertDialogCancel calls `cn(buttonVariants({variant:'outline'}))`
 *     — outline variant, has `border` AND `bg-[color:var(--background)]`.
 *   Both share the same base button classes (`inline-flex items-center
 *   justify-center gap-2 whitespace-nowrap text-sm font-medium …`).
 *   cn() calls twMerge, so a custom className still merges alongside
 *   the cva output and overrides on conflict.
 */

// Tiny helper: render an open AlertDialog with all required parts so
// Radix stops complaining about missing a11y slots. The body text lets
// each test assert against a stable string the test owns.
function renderOpenAlertDialog(
  ui: (handleOpenChange?: (next: boolean) => void) => React.ReactNode,
  options?: { handleOpenChange?: (next: boolean) => void }
) {
  return render(
    <AlertDialog open={true} onOpenChange={options?.handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>alert title</AlertDialogTitle>
        <AlertDialogDescription>alert description</AlertDialogDescription>
        {ui(options?.handleOpenChange)}
      </AlertDialogContent>
    </AlertDialog>
  )
}

describe('AlertDialog wrappers (Radix)', () => {
  describe('AlertDialog (Root)', () => {
    it('mounts Content children when open={true}', () => {
      // AlertDialogPrimitive.Root is context-only — there is no DOM
      // element to query. We verify the Root ran by asserting that an
      // open tree inside it mounts its Content. If the Root context
      // were not connected, Content would throw "AlertDialogContent
      // must be used within AlertDialog".
      render(
        <AlertDialog open={true}>
          <AlertDialogTrigger>open me</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>t</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
            body inside root
          </AlertDialogContent>
        </AlertDialog>
      )

      expect(screen.getByText('body inside root')).toBeInTheDocument()
    })

    it('does not mount Content children when open is false (default)', () => {
      // Without an open state, Radix unmounts the portal subtree.
      render(
        <AlertDialog>
          <AlertDialogTrigger>open me</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>t</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
            hidden body
          </AlertDialogContent>
        </AlertDialog>
      )

      expect(screen.queryByText('hidden body')).not.toBeInTheDocument()
    })

    it('forwards an explicit defaultOpen prop to Radix Root (Content mounts)', () => {
      // defaultOpen is a Radix Root prop. We verify by mounting with
      // defaultOpen and checking the Content appears without an explicit
      // open prop on the wrapper.
      render(
        <AlertDialog defaultOpen>
          <AlertDialogContent>
            <AlertDialogTitle>t</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
            default-open body
          </AlertDialogContent>
        </AlertDialog>
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
        <AlertDialog onOpenChange={handleOpenChange}>
          <AlertDialogTrigger>open me</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>t</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
            body
          </AlertDialogContent>
        </AlertDialog>
      )

      fireEvent.click(screen.getByText('open me'))
      expect(observed).toBe(true)
    })
  })

  describe('AlertDialogTrigger', () => {
    it('applies data-slot="alert-dialog-trigger" and renders a <button> by default', () => {
      // The Trigger wrapper renders a Radix <button> with the slot
      // attribute forwarded onto the rendered element.
      render(
        <AlertDialog>
          <AlertDialogTrigger>open alert</AlertDialogTrigger>
        </AlertDialog>
      )

      const trigger = screen.getByText('open alert')
      expect(trigger.tagName).toBe('BUTTON')
      expect(trigger).toHaveAttribute('data-slot', 'alert-dialog-trigger')
    })

    it('opens the alert dialog when the trigger is clicked', () => {
      // Radix Trigger toggles the Root's open state when clicked.
      render(
        <AlertDialog>
          <AlertDialogTrigger>open alert</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>t</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
            body after click
          </AlertDialogContent>
        </AlertDialog>
      )

      expect(screen.queryByText('body after click')).not.toBeInTheDocument()
      fireEvent.click(screen.getByText('open alert'))
      expect(screen.getByText('body after click')).toBeInTheDocument()
    })

    it('renders an asChild trigger when wrapping another element', () => {
      // When asChild is set, Radix forwards onto the child element
      // so the data-slot lands on the child rather than on a wrapping
      // <button>.
      render(
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <a href="#x">link trigger</a>
          </AlertDialogTrigger>
        </AlertDialog>
      )

      const anchor = screen.getByText('link trigger')
      expect(anchor).toHaveAttribute('data-slot', 'alert-dialog-trigger')
      expect(anchor.tagName).toBe('A')
    })

    it('forwards arbitrary HTML attributes (id, aria-*, data-*) via props spread', () => {
      render(
        <AlertDialog>
          <AlertDialogTrigger
            id="my-trigger"
            aria-label="Open delete alert"
            data-custom="hello"
          >
            trigger
          </AlertDialogTrigger>
        </AlertDialog>
      )

      const trigger = screen.getByText('trigger')
      expect(trigger).toHaveAttribute('id', 'my-trigger')
      expect(trigger).toHaveAttribute('aria-label', 'Open delete alert')
      expect(trigger).toHaveAttribute('data-custom', 'hello')
    })
  })

  describe('AlertDialogPortal', () => {
    it("teleports Content to body level via AlertDialogContent's internal Portal", () => {
      // AlertDialogContent composes <AlertDialogPortal data-slot="alert-dialog-portal">
      // internally. Radix's Portal uses createPortal to teleport its
      // children out of the React root container into <body>.
      render(
        <AlertDialog open={true}>
          <AlertDialogContent>
            <AlertDialogTitle>t</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
            body in portal
          </AlertDialogContent>
        </AlertDialog>
      )

      const content = document.querySelector(
        '[data-slot="alert-dialog-content"]'
      )
      expect(content).toBeInTheDocument()
      // The Portal teleported the Content subtree directly to <body> —
      // parentElement is body (no intermediate wrapper).
      expect(content?.parentElement).toBe(document.body)
    })

    it('teleports sibling children to body level when used directly', () => {
      // When used as a standalone wrapper around an arbitrary tree,
      // AlertDialogPortal forwards onto Radix Portal which uses
      // createPortal to teleport every child directly to <body>. We
      // render AlertDialogPortal around an AlertDialogOverlay + a
      // marker span inside an open AlertDialog and verify both children
      // landed at body level (proving the wrapper ran).
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogOverlay data-testid="teleported-overlay" />
            <span data-testid="inner-sibling">inner sibling</span>
          </AlertDialogPortal>
        </AlertDialog>
      )

      const overlay = screen.getByTestId('teleported-overlay')
      const sibling = screen.getByTestId('inner-sibling')
      expect(overlay).toBeInTheDocument()
      // Both children of AlertDialogPortal ended up directly under <body>.
      expect(overlay.parentElement).toBe(document.body)
      expect(sibling.parentElement).toBe(document.body)
      // The two teleported children are siblings under <body> (no
      // intermediate wrapper div carrying the portal slot).
      expect(overlay.nextSibling).toBe(sibling)
    })
  })

  describe('AlertDialogOverlay', () => {
    it('renders an overlay with data-slot="alert-dialog-overlay" by default', () => {
      // AlertDialogOverlay is always invoked by AlertDialogContent, but
      // we render an explicit standalone Overlay inside an open dialog
      // to exercise the wrapper in isolation.
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogOverlay data-testid="my-overlay" />
          </AlertDialogPortal>
        </AlertDialog>
      )

      const overlay = screen.getByTestId('my-overlay')
      expect(overlay).toHaveAttribute('data-slot', 'alert-dialog-overlay')
    })

    it('applies the default Tailwind utility classes from cn(base)', () => {
      // cn() base string for the Overlay is the animate-in/out fade +
      // fixed inset-0 z-50 bg-black/50 block. We assert a few of the
      // markers that survive the cn() / tailwind compilation.
      render(
        <AlertDialog open={true}>
          <AlertDialogContent>
            <AlertDialogTitle>t</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
            body
          </AlertDialogContent>
        </AlertDialog>
      )

      const overlay = document.querySelector<HTMLElement>(
        '[data-slot="alert-dialog-overlay"]'
      )
      expect(overlay).toHaveClass('fixed')
      expect(overlay).toHaveClass('inset-0')
      expect(overlay).toHaveClass('z-50')
      expect(overlay).toHaveClass('bg-black/50')
    })

    it('merges a custom className via cn(...) alongside the base classes', () => {
      // cn(base, className) — the custom class lands alongside the
      // base classes (twMerge wins any individual conflicts but most
      // arbitrary classNames pass through untouched).
      render(
        <AlertDialog open={true}>
          <AlertDialogPortal>
            <AlertDialogOverlay
              className="custom-overlay-class"
              data-testid="my-overlay"
            />
          </AlertDialogPortal>
        </AlertDialog>
      )

      const overlay = screen.getByTestId('my-overlay')
      expect(overlay).toHaveClass('fixed')
      expect(overlay).toHaveClass('custom-overlay-class')
    })
  })

  describe('AlertDialogContent', () => {
    it('renders inside a Radix Portal with data-slot="alert-dialog-content"', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogContent>
            <AlertDialogTitle>t</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
            <span>content body</span>
          </AlertDialogContent>
        </AlertDialog>
      )

      const content = screen
        .getByText('content body')
        .closest('[data-slot="alert-dialog-content"]')
      expect(content).toBeInTheDocument()
    })

    it('mounts an Overlay as a sibling alongside the Content (Portal composes both)', () => {
      // AlertDialogContent internally renders Portal > [Overlay, Content].
      // Both the overlay and the content mount when the dialog is open
      // and live as siblings under <body>.
      render(
        <AlertDialog open={true}>
          <AlertDialogContent>
            <AlertDialogTitle>t</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
            body
          </AlertDialogContent>
        </AlertDialog>
      )

      const overlay = document.querySelector(
        '[data-slot="alert-dialog-overlay"]'
      )
      const content = document.querySelector(
        '[data-slot="alert-dialog-content"]'
      )
      expect(overlay).toBeInTheDocument()
      expect(content).toBeInTheDocument()
      // Rendered as siblings under <body>.
      expect(overlay?.parentElement).toBe(document.body)
      expect(content?.parentElement).toBe(document.body)
      expect(overlay?.nextSibling).toBe(content)
    })

    it('applies the default Tailwind utility classes from cn(base)', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogContent>
            <AlertDialogTitle>t</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
            body
          </AlertDialogContent>
        </AlertDialog>
      )

      const content = document.querySelector<HTMLElement>(
        '[data-slot="alert-dialog-content"]'
      )
      // Default Tailwind classes from the wrapper cn() base string.
      expect(content).toHaveClass('fixed')
      expect(content).toHaveClass('top-[50%]')
      expect(content).toHaveClass('left-[50%]')
      expect(content).toHaveClass('z-50')
      expect(content).toHaveClass('rounded-[var(--radius)]')
      expect(content).toHaveClass('shadow-lg')
      expect(content).toHaveClass('gap-4')
      expect(content).toHaveClass('p-6')
    })

    it('merges a custom className via cn(...) alongside the base classes', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogContent className="custom-alert-dialog-class">
            <AlertDialogTitle>t</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
            body
          </AlertDialogContent>
        </AlertDialog>
      )

      const content = document.querySelector<HTMLElement>(
        '[data-slot="alert-dialog-content"]'
      )
      expect(content).toHaveClass('z-50')
      expect(content).toHaveClass('custom-alert-dialog-class')
    })

    it('forwards a ref to the underlying content div via React 19 ref-as-prop', () => {
      let captured: HTMLElement | null = null
      render(
        <AlertDialog open={true}>
          <AlertDialogContent
            ref={node => {
              captured = node
            }}
          >
            <AlertDialogTitle>t</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
            body
          </AlertDialogContent>
        </AlertDialog>
      )

      const content = document.querySelector<HTMLElement>(
        '[data-slot="alert-dialog-content"]'
      )
      expect(captured).toBe(content)
    })
  })

  describe('AlertDialogHeader', () => {
    it('applies data-slot="alert-dialog-header" and default classes via cn(base)', () => {
      renderOpenAlertDialog(() => (
        <AlertDialogHeader data-testid="hdr">
          <span>header content</span>
        </AlertDialogHeader>
      ))

      const header = screen.getByTestId('hdr')
      expect(header.tagName).toBe('DIV')
      expect(header).toHaveAttribute('data-slot', 'alert-dialog-header')
      // Default Tailwind classes from the wrapper cn() base string.
      expect(header).toHaveClass('flex')
      expect(header).toHaveClass('flex-col')
      expect(header).toHaveClass('gap-2')
      expect(header).toHaveClass('text-center')
      expect(header).toHaveClass('sm:text-start')
    })

    it('merges a custom className via cn(...) alongside the base classes', () => {
      renderOpenAlertDialog(() => (
        <AlertDialogHeader data-testid="hdr" className="custom-header-class">
          <span>x</span>
        </AlertDialogHeader>
      ))

      const header = screen.getByTestId('hdr')
      expect(header).toHaveClass('flex')
      expect(header).toHaveClass('custom-header-class')
    })
  })

  describe('AlertDialogFooter', () => {
    it('applies data-slot="alert-dialog-footer" and default classes via cn(base)', () => {
      renderOpenAlertDialog(() => (
        <AlertDialogFooter data-testid="ftr">
          <span>footer content</span>
        </AlertDialogFooter>
      ))

      const footer = screen.getByTestId('ftr')
      expect(footer.tagName).toBe('DIV')
      expect(footer).toHaveAttribute('data-slot', 'alert-dialog-footer')
      // Default Tailwind classes from the wrapper cn() base string.
      expect(footer).toHaveClass('flex')
      expect(footer).toHaveClass('flex-col-reverse')
      expect(footer).toHaveClass('gap-2')
      expect(footer).toHaveClass('sm:flex-row')
      expect(footer).toHaveClass('sm:justify-end')
    })

    it('merges a custom className via cn(...) alongside the base classes', () => {
      renderOpenAlertDialog(() => (
        <AlertDialogFooter data-testid="ftr" className="custom-footer-class">
          <span>x</span>
        </AlertDialogFooter>
      ))

      const footer = screen.getByTestId('ftr')
      expect(footer).toHaveClass('flex')
      expect(footer).toHaveClass('custom-footer-class')
    })
  })

  describe('AlertDialogTitle', () => {
    it('renders a heading element with data-slot="alert-dialog-title"', () => {
      // Radix AlertDialogPrimitive.Title renders an <h2> by default —
      // we verify both the tag and the slot attribute.
      render(
        <AlertDialog open={true}>
          <AlertDialogContent>
            <AlertDialogTitle>My Title</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
            body
          </AlertDialogContent>
        </AlertDialog>
      )

      const title = screen.getByText('My Title')
      expect(title.tagName).toBe('H2')
      expect(title).toHaveAttribute('data-slot', 'alert-dialog-title')
    })

    it('applies the default Tailwind classes from cn(base)', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogContent>
            <AlertDialogTitle>T</AlertDialogTitle>
            <AlertDialogDescription>D</AlertDialogDescription>
            body
          </AlertDialogContent>
        </AlertDialog>
      )

      const title = document.querySelector<HTMLElement>(
        '[data-slot="alert-dialog-title"]'
      )
      expect(title).toHaveClass('text-lg')
      expect(title).toHaveClass('font-semibold')
    })

    it('merges a custom className via cn(...) alongside the base classes', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogContent>
            <AlertDialogTitle className="custom-title-class">
              T
            </AlertDialogTitle>
            <AlertDialogDescription>D</AlertDialogDescription>
            body
          </AlertDialogContent>
        </AlertDialog>
      )

      const title = document.querySelector<HTMLElement>(
        '[data-slot="alert-dialog-title"]'
      )
      expect(title).toHaveClass('text-lg')
      expect(title).toHaveClass('custom-title-class')
    })
  })

  describe('AlertDialogDescription', () => {
    it('renders an element with data-slot="alert-dialog-description"', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogContent>
            <AlertDialogTitle>t</AlertDialogTitle>
            <AlertDialogDescription>My Desc</AlertDialogDescription>
            body
          </AlertDialogContent>
        </AlertDialog>
      )

      const desc = screen.getByText('My Desc')
      expect(desc).toHaveAttribute('data-slot', 'alert-dialog-description')
    })

    it('applies the default Tailwind classes from cn(base)', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogContent>
            <AlertDialogTitle>t</AlertDialogTitle>
            <AlertDialogDescription>D</AlertDialogDescription>
            body
          </AlertDialogContent>
        </AlertDialog>
      )

      const desc = document.querySelector<HTMLElement>(
        '[data-slot="alert-dialog-description"]'
      )
      expect(desc).toHaveClass('text-[color:var(--muted-foreground)]')
      expect(desc).toHaveClass('text-sm')
    })

    it('merges a custom className via cn(...) alongside the base classes', () => {
      render(
        <AlertDialog open={true}>
          <AlertDialogContent>
            <AlertDialogTitle>t</AlertDialogTitle>
            <AlertDialogDescription className="custom-desc-class">
              D
            </AlertDialogDescription>
            body
          </AlertDialogContent>
        </AlertDialog>
      )

      const desc = document.querySelector<HTMLElement>(
        '[data-slot="alert-dialog-description"]'
      )
      expect(desc).toHaveClass('text-sm')
      expect(desc).toHaveClass('custom-desc-class')
    })
  })

  describe('AlertDialogAction', () => {
    it('renders a <button> with the default button variant (no border)', () => {
      // AlertDialogAction calls cn(buttonVariants()) — default button
      // variant: solid `bg-[color:var(--primary)]`, no `border` token.
      // It is always rendered inside an open AlertDialog so Radix
      // accepts the wrapper.
      renderOpenAlertDialog(() => (
        <AlertDialogAction>confirm action</AlertDialogAction>
      ))

      const action = screen.getByText('confirm action')
      expect(action.tagName).toBe('BUTTON')
      // Default-variant classes from buttonVariants() (no border).
      expect(action).toHaveClass('bg-[color:var(--primary)]')
      expect(action).toHaveClass('text-[color:var(--primary-foreground)]')
      expect(action).not.toHaveClass('border')
    })

    it('applies the shared button base classes from buttonVariants()', () => {
      // Both Action and Cancel share the cva base string. Assert a few
      // of the markers that prove buttonVariants was the source of the
      // classes (rather than e.g. cn() with hand-rolled tokens).
      renderOpenAlertDialog(() => <AlertDialogAction>go</AlertDialogAction>)

      const action = screen.getByText('go')
      expect(action).toHaveClass('inline-flex')
      expect(action).toHaveClass('items-center')
      expect(action).toHaveClass('justify-center')
      expect(action).toHaveClass('text-sm')
      expect(action).toHaveClass('font-medium')
    })

    it('merges a custom className via cn(...) alongside the buttonVariants() output', () => {
      // cn(buttonVariants(), className) — the custom class lands
      // alongside the variant classes.
      renderOpenAlertDialog(() => (
        <AlertDialogAction className="custom-action-class">
          confirm
        </AlertDialogAction>
      ))

      const action = screen.getByText('confirm')
      expect(action).toHaveClass('bg-[color:var(--primary)]')
      expect(action).toHaveClass('custom-action-class')
    })

    it('forwards arbitrary HTML attributes (id, aria-*, data-*) via props spread', () => {
      renderOpenAlertDialog(() => (
        <AlertDialogAction
          id="my-action"
          aria-label="Confirm destructive action"
          data-custom="action-value"
        >
          confirm
        </AlertDialogAction>
      ))

      const action = screen.getByText('confirm')
      expect(action).toHaveAttribute('id', 'my-action')
      expect(action).toHaveAttribute('aria-label', 'Confirm destructive action')
      expect(action).toHaveAttribute('data-custom', 'action-value')
    })
  })

  describe('AlertDialogCancel', () => {
    it('renders a <button> with the outline button variant (has border + bg)', () => {
      // AlertDialogCancel calls cn(buttonVariants({variant:'outline'}))
      // — outline variant: `border` + `bg-[color:var(--background)]` and
      // NO `bg-[color:var(--primary)]` (the default-variant primary fill).
      renderOpenAlertDialog(() => (
        <AlertDialogCancel>cancel action</AlertDialogCancel>
      ))

      const cancel = screen.getByText('cancel action')
      expect(cancel.tagName).toBe('BUTTON')
      // Outline-variant classes from buttonVariants({variant:'outline'}).
      expect(cancel).toHaveClass('border')
      expect(cancel).toHaveClass('bg-[color:var(--background)]')
      expect(cancel).toHaveClass('border-[color:var(--border)]')
      // Default-variant NOT applied (Variant A — input changes).
      expect(cancel).not.toHaveClass('bg-[color:var(--primary)]')
    })

    it('applies the shared button base classes from buttonVariants()', () => {
      renderOpenAlertDialog(() => <AlertDialogCancel>cancel</AlertDialogCancel>)

      const cancel = screen.getByText('cancel')
      expect(cancel).toHaveClass('inline-flex')
      expect(cancel).toHaveClass('items-center')
      expect(cancel).toHaveClass('justify-center')
      expect(cancel).toHaveClass('text-sm')
      expect(cancel).toHaveClass('font-medium')
    })

    it('merges a custom className via cn(...) alongside the buttonVariants({variant:"outline"}) output', () => {
      renderOpenAlertDialog(() => (
        <AlertDialogCancel className="custom-cancel-class">
          cancel
        </AlertDialogCancel>
      ))

      const cancel = screen.getByText('cancel')
      expect(cancel).toHaveClass('border')
      expect(cancel).toHaveClass('custom-cancel-class')
    })

    it('forwards arbitrary HTML attributes (id, aria-*, data-*) via props spread', () => {
      renderOpenAlertDialog(() => (
        <AlertDialogCancel
          id="my-cancel"
          aria-label="Cancel destructive action"
          data-custom="cancel-value"
        >
          cancel
        </AlertDialogCancel>
      ))

      const cancel = screen.getByText('cancel')
      expect(cancel).toHaveAttribute('id', 'my-cancel')
      expect(cancel).toHaveAttribute('aria-label', 'Cancel destructive action')
      expect(cancel).toHaveAttribute('data-custom', 'cancel-value')
    })
  })

  describe('AlertDialogAction vs AlertDialogCancel', () => {
    it('renders Action and Cancel side-by-side with visibly distinct variant classes (Variant A)', () => {
      // This is the key Variant A assertion: the cva INPUT differs
      // (default vs outline), so the rendered className differs in a
      // visible way. Radix pipes both through cn(buttonVariants(...),
      // className) — neither carries a `data-slot`, so we identify them
      // by their rendered text and by their rendered variant classes.
      renderOpenAlertDialog(() => (
        <>
          <AlertDialogAction>confirm action</AlertDialogAction>
          <AlertDialogCancel>cancel action</AlertDialogCancel>
        </>
      ))

      const action = screen.getByText('confirm action')
      const cancel = screen.getByText('cancel action')

      // Action — default variant.
      expect(action).toHaveClass('bg-[color:var(--primary)]')
      expect(action).not.toHaveClass('border')
      // Cancel — outline variant.
      expect(cancel).toHaveClass('border')
      expect(cancel).toHaveClass('bg-[color:var(--background)]')
      expect(cancel).not.toHaveClass('bg-[color:var(--primary)]')

      // Both share the same base button classes (from the cva base string).
      const sharedMarkers = [
        'inline-flex',
        'items-center',
        'justify-center',
        'gap-2',
        'whitespace-nowrap',
        'text-sm',
        'font-medium',
      ]
      for (const marker of sharedMarkers) {
        expect(action).toHaveClass(marker)
        expect(cancel).toHaveClass(marker)
      }
    })

    it('cancels the open alert dialog (closes) when AlertDialogCancel is clicked', async () => {
      // AlertDialogCancel forwards onto RadixPrimitive.Cancel which
      // sets the open state back to false on click. We observe via an
      // onOpenChange handler on the parent AlertDialog.
      const user = userEvent.setup()
      let observed: boolean | undefined
      const handleOpenChange = (next: boolean) => {
        observed = next
      }

      render(
        <AlertDialog open={true} onOpenChange={handleOpenChange}>
          <AlertDialogContent>
            <AlertDialogTitle>t</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
            <AlertDialogCancel>cancel button</AlertDialogCancel>
          </AlertDialogContent>
        </AlertDialog>
      )

      await user.click(screen.getByText('cancel button'))
      expect(observed).toBe(false)
    })

    it('confirms the open alert dialog (closes) when AlertDialogAction is clicked', async () => {
      // AlertDialogAction also forwards onto a Radix primitive that
      // closes the dialog on click (the action's whole point in an
      // alert dialog is the user has confirmed the destructive choice).
      const user = userEvent.setup()
      let observed: boolean | undefined
      const handleOpenChange = (next: boolean) => {
        observed = next
      }

      render(
        <AlertDialog open={true} onOpenChange={handleOpenChange}>
          <AlertDialogContent>
            <AlertDialogTitle>t</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
            <AlertDialogAction>confirm button</AlertDialogAction>
          </AlertDialogContent>
        </AlertDialog>
      )

      await user.click(screen.getByText('confirm button'))
      expect(observed).toBe(false)
    })
  })

  describe('integration', () => {
    it('mounts a full open AlertDialog with Trigger + Content + Header + Footer + Title + Description + Action + Cancel', () => {
      // End-to-end: Trigger opens the alert dialog; Content renders
      // inside the portal with its default styling, header, footer,
      // title, description, and a pair of Action / Cancel buttons in
      // the footer. Exercises every wrapper in one tree.
      render(
        <AlertDialog defaultOpen>
          <AlertDialogContent>
            <AlertDialogTitle>Integration Title</AlertDialogTitle>
            <AlertDialogDescription>Integration Desc</AlertDialogDescription>
            <AlertDialogHeader data-testid="hdr">
              <span>header child</span>
            </AlertDialogHeader>
            <p>body child</p>
            <AlertDialogFooter data-testid="ftr">
              <AlertDialogCancel data-testid="my-cancel">
                cancel
              </AlertDialogCancel>
              <AlertDialogAction data-testid="my-action">
                confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )

      // Title + description rendered.
      expect(screen.getByText('Integration Title')).toBeInTheDocument()
      expect(screen.getByText('Integration Desc')).toBeInTheDocument()

      // Header + footer slots present and styled.
      expect(screen.getByTestId('hdr')).toHaveAttribute(
        'data-slot',
        'alert-dialog-header'
      )
      expect(screen.getByTestId('ftr')).toHaveAttribute(
        'data-slot',
        'alert-dialog-footer'
      )

      // Action and Cancel rendered as <button>s with their variant
      // classes applied. No data-slot on either (per source), so we
      // reach them via data-testid + the cva output classes.
      const action = screen.getByTestId('my-action')
      const cancel = screen.getByTestId('my-cancel')
      expect(action.tagName).toBe('BUTTON')
      expect(cancel.tagName).toBe('BUTTON')
      expect(action).toHaveClass('bg-[color:var(--primary)]')
      expect(cancel).toHaveClass('border')

      // Content slot styling present.
      const content = document.querySelector<HTMLElement>(
        '[data-slot="alert-dialog-content"]'
      )
      expect(content).toHaveClass('z-50')
    })

    it('opens the dialog via Trigger click in a fully wired tree (state + portal + portal children)', () => {
      // Asserts the open path drives every wrapper into the rendered
      // tree: the Trigger click opens the Root, which causes the
      // Portal-subtree to mount, which renders the Content + Overlay
      // + Header + Footer + Title + Description + Action + Cancel.
      // Use act() around the click to silence the React state-update
      // outside-React warning.
      render(
        <AlertDialog>
          <AlertDialogTrigger>open integration</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Clicked Title</AlertDialogTitle>
            <AlertDialogDescription>Clicked Desc</AlertDialogDescription>
            <AlertDialogHeader data-testid="hdr">hdr</AlertDialogHeader>
            <AlertDialogFooter data-testid="ftr">ftr</AlertDialogFooter>
            <AlertDialogAction data-testid="my-action">go</AlertDialogAction>
            <AlertDialogCancel data-testid="my-cancel">stop</AlertDialogCancel>
          </AlertDialogContent>
        </AlertDialog>
      )

      expect(screen.queryByText('Clicked Title')).not.toBeInTheDocument()
      act(() => {
        fireEvent.click(screen.getByText('open integration'))
      })
      expect(screen.getByText('Clicked Title')).toBeInTheDocument()
      expect(screen.getByTestId('hdr')).toBeInTheDocument()
      expect(screen.getByTestId('ftr')).toBeInTheDocument()
      expect(screen.getByTestId('my-action')).toHaveClass(
        'bg-[color:var(--primary)]'
      )
      expect(screen.getByTestId('my-cancel')).toHaveClass('border')
    })
  })
})
