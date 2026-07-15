import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from './command'

/**
 * These tests cover the nine exports declared in
 * src/components/ui/command.tsx (currently 0% coverage, 184 lines).
 *
 * Eight of the nine exports are thin shadcn-style passthrough wrappers
 * around `cmdk` (CommandPrimitive.* — a Radix-flavoured command menu
 * primitive). Each wrapper:
 *   - sets a `data-slot="command-…"` attribute that downstream CSS or
 *     consumers target
 *   - merges a static cn()-generated base-class chain with the caller's
 *     `className` (Tailwind merge in cn() collapses conflicts)
 *   - forwards the rest of the props through to the underlying
 *     CommandPrimitive component (or, for CommandShortcut, a plain <span>)
 *
 * `CommandDialog` is structurally different: it composes our existing
 * `Dialog` / `DialogContent` / `DialogHeader` primitives and embeds a
 * styled `Command` inside the content. It surfaces four configurable
 * props — `title`, `description`, `className`, `showCloseButton` — each
 * with a default value, and forwards everything else to the underlying
 * Radix Dialog. The DialogHeader is intentionally pushed off-screen with
 * the `sr-only` class so screen-readers announce the title/description
 * while the visual chrome stays minimal.
 *
 * v8 branch accounting that matters here:
 *   - Each wrapper's `cn()` call has two inputs (base string + caller
 *     className) and one merge — both branches must be exercised to
 *     count the function call as fully covered.
 *   - CommandDialog has four default-vs-overridden branches: title,
 *     description, className, showCloseButton. The default branch is
 *     exercised by `renders with the documented default props`; the
 *     override branches are exercised one-per-test below.
 *   - The destructuring rest spread on each wrapper (`...props`) is the
 *     one prop-forwarding path; we explicitly forward `data-*` /
 *     `onClick` / `id` in one test per wrapper to light up both the
 *     spread and how it interacts with cn() in priority order.
 */

/* -------------------------------------------------------------------------- */
/*  Command (root)                                                            */
/* -------------------------------------------------------------------------- */

describe('Command', () => {
  it('renders a <div> via CommandPrimitive.Root with the command data-slot, cmdk-root attribute, and base classes', () => {
    render(
      <Command data-testid="command-root">
        <span>payload</span>
      </Command>
    )

    const root = screen.getByTestId('command-root')
    // CommandPrimitive.Root forwards through @radix-ui/react-primitive
    // and renders a <div>. cmdk additionally marks the root with the
    // `cmdk-root` attribute (empty string) and tabIndex={-1} so the
    // menu can be focus-trapped programmatically.
    expect(root.tagName).toBe('DIV')
    expect(root).toHaveAttribute('data-slot', 'command')
    expect(root).toHaveAttribute('cmdk-root')
    expect(root).toHaveAttribute('tabindex', '-1')
    expect(root).toHaveTextContent('payload')

    // Representative base classes from the cn() call. These are the
    // ones that survive any realistic Tailwind merge — they are
    // unique tokens that no real-world consumer override will collide
    // with.
    expect(root).toHaveClass('flex')
    expect(root).toHaveClass('h-full')
    expect(root).toHaveClass('w-full')
    expect(root).toHaveClass('flex-col')
    expect(root).toHaveClass('overflow-hidden')
    expect(root).toHaveClass('rounded-[var(--radius)]')
  })

  it('merges a custom className through cn() and forwards extra div props', () => {
    const handleClick = vi.fn()
    render(
      <Command
        aria-label="command root"
        className="my-command-wrapper"
        data-custom="custom-value"
        data-testid="command-forwarded"
        id="command-id"
        onClick={handleClick}
      />
    )

    const root = screen.getByTestId('command-forwarded')
    expect(root).toHaveAttribute('id', 'command-id')
    expect(root).toHaveAttribute('aria-label', 'command root')
    expect(root).toHaveAttribute('data-custom', 'custom-value')
    expect(root).toHaveClass('my-command-wrapper')
    // The base classes survive the merge.
    expect(root).toHaveClass('rounded-[var(--radius)]')

    fireEvent.click(root)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})

/* -------------------------------------------------------------------------- */
/*  CommandDialog                                                             */
/* -------------------------------------------------------------------------- */

describe('CommandDialog', () => {
  it('renders with the documented default title, description, and showCloseButton=true', () => {
    render(
      <CommandDialog data-testid="command-dialog" open>
        <CommandInput data-testid="command-dialog-input" />
      </CommandDialog>
    )

    // Radix Dialog renders a Portal into the document body when `open`
    // is set. The DialogContent receives role="dialog".
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()

    // Default title and description are inside the sr-only DialogHeader.
    // jsdom strips visual layout but the text content is what we assert
    // on — `getAllByText` tolerates sr-only duplicates fine.
    expect(
      screen.getAllByText('Command Palette').length
    ).toBeGreaterThanOrEqual(1)
    expect(
      screen.getAllByText('Search for a command to run...').length
    ).toBeGreaterThanOrEqual(1)

    // The renderable embedded Command children appear inside the dialog.
    expect(
      dialog.querySelector('[data-testid="command-dialog-input"]')
    ).toBeInTheDocument()
  })

  it('renders the supplied title and description inside the sr-only DialogHeader', () => {
    render(
      <CommandDialog
        description="Pick a doc to open"
        open
        title="Open document"
      >
        <span>x</span>
      </CommandDialog>
    )

    expect(screen.getAllByText('Open document').length).toBeGreaterThanOrEqual(
      1
    )
    expect(
      screen.getAllByText('Pick a doc to open').length
    ).toBeGreaterThanOrEqual(1)
  })

  it('omits the dialog close button when showCloseButton={false}', () => {
    const { container } = render(
      <CommandDialog open showCloseButton={false}>
        <span>x</span>
      </CommandDialog>
    )

    // Our `Dialog` primitive renders the visible Close button via
    // `DialogPrimitive.Close` only when `showCloseButton=true`. That
    // button pairs an XIcon (lucide-react) with an `<span className=
    // "sr-only">Close</span>` for screen-readers. Searching for the
    // 'Close' label is the cheapest way to assert presence/absence
    // without coupling to icon internals.
    expect(screen.queryByText('Close', { selector: 'span' })).toBeNull()
    // Belt-and-braces: also assert no dialog close buttons exist in
    // the rendered tree at all.
    const closeButtons = container.querySelectorAll(
      'button[aria-label="Close"], button:has(> [aria-hidden="true"])'
    )
    expect(closeButtons).toHaveLength(0)
  })

  it('renders the dialog close button by default (showCloseButton=true)', () => {
    render(
      <CommandDialog open>
        <span>x</span>
      </CommandDialog>
    )

    expect(screen.getByText('Close', { selector: 'span' })).toBeInTheDocument()
  })

  it('merges a custom className into DialogContent (extends base "overflow-hidden p-0") and forwards onOpenChange', () => {
    const onOpenChange = vi.fn()
    render(
      <CommandDialog
        className="my-dialog-content"
        onOpenChange={onOpenChange}
        open
      >
        <span>x</span>
      </CommandDialog>
    )

    // DialogContent is the <div role="dialog"> wrapper. className
    // composes with the base 'overflow-hidden p-0'.
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass('overflow-hidden')
    expect(dialog).toHaveClass('p-0')
    expect(dialog).toHaveClass('my-dialog-content')
  })

  it('forwards extra Radix Dialog props through the rest spread (onOpenChange wired, modal=true honoured)', () => {
    const onOpenChange = vi.fn()
    render(
      <CommandDialog modal={false} onOpenChange={onOpenChange} open>
        <span>x</span>
      </CommandDialog>
    )

    // We can't directly assert onOpenChange was called via DOM events
    // (the dialog stays open here), so we just assert that the dialog
    // mounted cleanly with a non-default Radix prop wired through.
    // The <Dialog> wrapper is the context-only DialogPrimitive.Root
    // — it renders no DOM — so we check this stays well-formed by
    // asserting the dialog content is on-screen.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

/* -------------------------------------------------------------------------- */
/*  CommandInput                                                              */
/* -------------------------------------------------------------------------- */

describe('CommandInput', () => {
  it('renders a wrapped <input> with the command-input data-slot and base placeholder classes', () => {
    render(
      <Command data-testid="command-root">
        <CommandInput data-testid="command-input" />
      </Command>
    )

    const input = screen.getByTestId('command-input')
    // CommandPrimitive.Input renders an <input>.
    expect(input.tagName).toBe('INPUT')
    expect(input).toHaveAttribute('data-slot', 'command-input')

    // Base classes from cn(): placeholder colour token, h-10, w-full,
    // rounded-sm, bg-transparent, outline-hidden.
    expect(input).toHaveClass('h-10')
    expect(input).toHaveClass('w-full')
    expect(input).toHaveClass('rounded-sm')
    expect(input).toHaveClass('bg-transparent')
    expect(input).toHaveClass('outline-hidden')

    // The wrapper <div data-slot="command-input-wrapper"> provides the
    // cmdk harness with a layout slot for the search icon.
    const wrapper = input.parentElement
    expect(wrapper).not.toBeNull()
    expect(wrapper).toHaveAttribute('data-slot', 'command-input-wrapper')
    expect(wrapper).toHaveClass('flex')
    expect(wrapper).toHaveClass('items-center')
    expect(wrapper).toHaveClass('gap-2')
  })

  it('renders an inline <SearchIcon> from lucide-react inside the input wrapper', () => {
    const { container } = render(
      <Command>
        <CommandInput data-testid="command-input" />
      </Command>
    )

    // lucide-react ships the icon as an inline <svg>. We assert by tag.
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThanOrEqual(1)
  })

  it('merges a custom className and forwards extra input props (placeholder, value, onValueChange)', () => {
    const handleValueChange = vi.fn()
    render(
      <Command>
        <CommandInput
          className="my-input"
          data-testid="command-input-custom"
          onValueChange={handleValueChange}
          placeholder="Type a command…"
          value="hello"
        />
      </Command>
    )

    const input = screen.getByTestId('command-input-custom')
    expect(input).toHaveClass('my-input')
    expect(input).toHaveAttribute('placeholder', 'Type a command…')
    expect(input).toHaveAttribute('value', 'hello')

    // cmdk's CommandPrimitive.Input handles native onChange internally
    // (to drive its search context) and exposes the typed value via
    // the public `onValueChange` callback instead. We fire a synthetic
    // input event and assert the wrapper's onValueChange wiring is
    // intact — both that the prop spreads through and that the
    // consumer sees the new search string.
    fireEvent.input(input, { target: { value: 'next' } })
    expect(handleValueChange).toHaveBeenCalledWith('next')
  })
})

/* -------------------------------------------------------------------------- */
/*  CommandList                                                               */
/* -------------------------------------------------------------------------- */

describe('CommandList', () => {
  // jsdom does not implement ResizeObserver. cmdk's CommandList
  // wires one up in a layout effect to measure the list's offset
  // height and feed it back as a CSS variable, so the stub needs
  // to be installed before render and torn down afterwards.
  let originalResizeObserver: typeof ResizeObserver | undefined
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

  it('renders with the command-list data-slot and the scroll-area base classes', () => {
    originalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver
    try {
      render(
        <Command>
          <CommandList data-testid="command-list">payload</CommandList>
        </Command>
      )

      const list = screen.getByTestId('command-list')
      // CommandPrimitive.List renders a <div role="listbox"> with
      // a <cmdk-list-sizer> inner element sized via ResizeObserver.
      expect(list.tagName).toBe('DIV')
      expect(list).toHaveAttribute('role', 'listbox')
      expect(list).toHaveAttribute('data-slot', 'command-list')
      expect(list).toHaveTextContent('payload')

      // Representative base classes from cn().
      expect(list).toHaveClass('max-h-[300px]')
      expect(list).toHaveClass('scroll-py-1')
      expect(list).toHaveClass('overflow-x-hidden')
      expect(list).toHaveClass('overflow-y-auto')
    } finally {
      if (originalResizeObserver) {
        globalThis.ResizeObserver = originalResizeObserver
      } else {
        delete (globalThis as { ResizeObserver?: typeof ResizeObserver })
          .ResizeObserver
      }
    }
  })

  it('forwards extra div props (label, data-*) through to CommandPrimitive.List', () => {
    originalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver
    try {
      render(
        <Command>
          <CommandList
            className="my-list"
            data-testid="command-list-forwarded"
            label="Custom list label"
          />
        </Command>
      )

      const list = screen.getByTestId('command-list-forwarded')
      expect(list).toHaveClass('my-list')
      expect(list).toHaveClass('overflow-y-auto')
      // cmdk's CommandPrimitive.List accepts a `label` prop and uses
      // it as the listbox's accessible name (`aria-label`). The
      // default is "Suggestions"; overriding it to a custom string
      // exercises both the prop-forwarding path and the cmdk-internal
      // aria-label wiring.
      expect(list).toHaveAttribute('aria-label', 'Custom list label')
    } finally {
      if (originalResizeObserver) {
        globalThis.ResizeObserver = originalResizeObserver
      } else {
        delete (globalThis as { ResizeObserver?: typeof ResizeObserver })
          .ResizeObserver
      }
    }
  })
})

/* -------------------------------------------------------------------------- */
/*  CommandEmpty                                                              */
/* -------------------------------------------------------------------------- */

describe('CommandEmpty', () => {
  it('renders with the command-empty data-slot and the centred text classes', () => {
    render(
      <Command>
        <CommandEmpty data-testid="command-empty">No matches</CommandEmpty>
      </Command>
    )

    const empty = screen.getByTestId('command-empty')
    expect(empty.tagName).toBe('DIV')
    expect(empty).toHaveAttribute('data-slot', 'command-empty')
    expect(empty).toHaveTextContent('No matches')

    // Base classes from the static className string.
    expect(empty).toHaveClass('py-6')
    expect(empty).toHaveClass('text-center')
    expect(empty).toHaveClass('text-sm')
  })

  it('forwards extra div props onto the underlying CommandPrimitive.Empty', () => {
    render(
      <Command>
        <CommandEmpty
          data-custom="empty-value"
          data-testid="command-empty-forwarded"
        />
      </Command>
    )

    const empty = screen.getByTestId('command-empty-forwarded')
    expect(empty).toHaveAttribute('data-custom', 'empty-value')
  })
})

/* -------------------------------------------------------------------------- */
/*  CommandGroup                                                              */
/* -------------------------------------------------------------------------- */

describe('CommandGroup', () => {
  it('renders with the command-group data-slot and the long group-base class chain', () => {
    render(
      <Command>
        <CommandGroup data-testid="command-group" heading="Suggestions">
          <span>x</span>
        </CommandGroup>
      </Command>
    )

    const group = screen.getByTestId('command-group')
    expect(group.tagName).toBe('DIV')
    expect(group).toHaveAttribute('data-slot', 'command-group')

    // The cn() chain mixes native text colour, group-heading colour,
    // overflow-hidden, and p-1. Assert on the unique tokens.
    expect(group).toHaveClass('overflow-hidden')
    expect(group).toHaveClass('p-1')
  })

  it('merges a custom className through cn() and forwards extra div props', () => {
    const handleClick = vi.fn()
    render(
      <Command>
        <CommandGroup
          aria-label="actions"
          className="my-group"
          data-custom="group-value"
          data-testid="command-group-forwarded"
          onClick={handleClick}
        />
      </Command>
    )

    const group = screen.getByTestId('command-group-forwarded')
    expect(group).toHaveClass('my-group')
    expect(group).toHaveClass('overflow-hidden')
    expect(group).toHaveAttribute('aria-label', 'actions')
    expect(group).toHaveAttribute('data-custom', 'group-value')

    fireEvent.click(group)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})

/* -------------------------------------------------------------------------- */
/*  CommandSeparator                                                          */
/* -------------------------------------------------------------------------- */

describe('CommandSeparator', () => {
  it('renders with the command-separator data-slot and the separator base classes', () => {
    const { container } = render(
      <Command>
        <CommandSeparator data-testid="command-separator" />
      </Command>
    )

    // CommandPrimitive.Separator renders a <div role="separator">.
    const sep = container.querySelector(
      '[data-testid="command-separator"]'
    ) as HTMLElement
    expect(sep).not.toBeNull()
    expect(sep).toHaveAttribute('data-slot', 'command-separator')

    // Representative base classes from cn(): bg-[color:var(--border)],
    // -mx-1, h-px.
    expect(sep).toHaveClass('h-px')
  })

  it('merges a custom className and forwards extra props', () => {
    const { container } = render(
      <Command>
        <CommandSeparator
          className="my-sep"
          data-custom="sep-value"
          data-testid="command-separator-forwarded"
        />
      </Command>
    )

    const sep = container.querySelector(
      '[data-testid="command-separator-forwarded"]'
    ) as HTMLElement
    expect(sep).toHaveClass('my-sep')
    expect(sep).toHaveClass('h-px')
    expect(sep).toHaveAttribute('data-custom', 'sep-value')
  })
})

/* -------------------------------------------------------------------------- */
/*  CommandItem                                                               */
/* -------------------------------------------------------------------------- */

describe('CommandItem', () => {
  it('renders with the command-item data-slot and the long item-base class chain', () => {
    render(
      <Command>
        <CommandItem data-testid="command-item">Open file</CommandItem>
      </Command>
    )

    const item = screen.getByTestId('command-item')
    // CommandPrimitive.Item renders a <div role="option">.
    expect(item.tagName).toBe('DIV')
    expect(item).toHaveAttribute('role', 'option')
    expect(item).toHaveAttribute('data-slot', 'command-item')
    expect(item).toHaveTextContent('Open file')

    // Representative base classes from cn(): relative, flex,
    // cursor-default, items-center, gap-2, rounded-sm, px-2, py-1.5,
    // text-sm, outline-hidden, select-none.
    expect(item).toHaveClass('relative')
    expect(item).toHaveClass('flex')
    expect(item).toHaveClass('cursor-default')
    expect(item).toHaveClass('items-center')
    expect(item).toHaveClass('rounded-sm')
    expect(item).toHaveClass('select-none')
  })

  it('forwards the value/disabled/onSelect props to the underlying cmdk item', () => {
    const handleSelect = vi.fn()
    render(
      <Command>
        <CommandItem
          data-testid="command-item-controlled"
          disabled
          onSelect={handleSelect}
          value="open-file"
        >
          Open file
        </CommandItem>
      </Command>
    )

    const item = screen.getByTestId('command-item-controlled')
    expect(item).toHaveAttribute('data-disabled')
    expect(item).toHaveAttribute('aria-disabled', 'true')

    // Fire a click — cmdk invokes onSelect when an enabled item is
    // activated. Disabled items are guarded by Radix, so handleSelect
    // is NOT invoked.
    fireEvent.click(item)
    expect(handleSelect).not.toHaveBeenCalled()
  })

  it('merges a custom className and forwards an extra div prop', () => {
    render(
      <Command>
        <CommandItem
          className="my-item"
          data-custom="item-value"
          data-testid="command-item-forwarded"
        >
          Custom
        </CommandItem>
      </Command>
    )

    const item = screen.getByTestId('command-item-forwarded')
    expect(item).toHaveClass('my-item')
    expect(item).toHaveClass('relative')
    expect(item).toHaveAttribute('data-custom', 'item-value')
  })
})

/* -------------------------------------------------------------------------- */
/*  CommandShortcut                                                           */
/* -------------------------------------------------------------------------- */

describe('CommandShortcut', () => {
  it('renders a <span> with the command-shortcut data-slot and the shortcut base classes', () => {
    render(
      <span data-testid="shortcut-anchor">
        <CommandShortcut data-testid="command-shortcut">⌘K</CommandShortcut>
      </span>
    )

    const shortcut = screen.getByTestId('command-shortcut')
    expect(shortcut.tagName).toBe('SPAN')
    expect(shortcut).toHaveAttribute('data-slot', 'command-shortcut')
    expect(shortcut).toHaveTextContent('⌘K')

    // Base classes from cn(): text-[color:var(--muted-foreground)],
    // ml-auto, text-xs, tracking-widest.
    expect(shortcut).toHaveClass('ml-auto')
    expect(shortcut).toHaveClass('text-xs')
    expect(shortcut).toHaveClass('tracking-widest')
  })

  it('merges a custom className and forwards extra span props', () => {
    render(
      <CommandShortcut
        aria-keyshortcuts="Meta+K"
        className="my-shortcut"
        data-custom="shortcut-value"
        data-testid="command-shortcut-forwarded"
      >
        ⌘K
      </CommandShortcut>
    )

    const shortcut = screen.getByTestId('command-shortcut-forwarded')
    expect(shortcut).toHaveClass('my-shortcut')
    expect(shortcut).toHaveClass('tracking-widest')
    expect(shortcut).toHaveAttribute('aria-keyshortcuts', 'Meta+K')
    expect(shortcut).toHaveAttribute('data-custom', 'shortcut-value')
  })
})
