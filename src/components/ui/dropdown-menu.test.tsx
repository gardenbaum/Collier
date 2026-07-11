import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu'

/**
 * These tests cover the shadcn-style Radix dropdown-menu wrappers
 * (CheckboxItem / RadioGroup / RadioItem / Shortcut / Sub / SubTrigger /
 * SubContent) declared in src/components/ui/dropdown-menu.tsx. The
 * wrappers are pass-throughs to @radix-ui/react-dropdown-menu that add
 * a stable `data-slot` attribute, wire icons into the Radix
 * ItemIndicator slot, and forward `inset` / `className` through. The
 * 7 uncovered functions account for the remaining 9 statements / 6
 * functions not exercised by the rest of the suite.
 *
 * Render pattern: open the menu with `defaultOpen` so children mount.
 * Radix portals Content and SubContent to `document.body`, so all
 * assertions go through `screen` queries (which default to body) and
 * the `closest('[data-slot]')` lookup, instead of `container.querySelector`
 * (which only sees the wrapper div returned by `render`).
 */
describe('DropdownMenu wrappers (Radix)', () => {
  it('CheckboxItem: applies data-slot, forwards `checked`, and shows the CheckIcon indicator when checked', () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked={true}>
            Show notifications
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    const label = screen.getByText('Show notifications')
    const item = label.closest('[data-slot="dropdown-menu-checkbox-item"]')
    expect(item).not.toBeNull()
    // Radix wires the controlled `checked` prop into its data-state
    // attribute on the wrapper element.
    expect(item).toHaveAttribute('data-state', 'checked')
    // The ItemIndicator span renders the lucide-react CheckIcon as <svg>.
    expect(item?.querySelector('svg')).toBeInTheDocument()
  })

  it('RadioGroup: applies data-slot and wraps RadioItems', () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value="two">
            <DropdownMenuRadioItem value="one">One</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="two">Two</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    const group = screen
      .getByText('One')
      .closest('[data-slot="dropdown-menu-radio-group"]')
    expect(group).toBeInTheDocument()

    expect(
      screen.getByText('One').closest('[data-slot="dropdown-menu-radio-item"]')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Two').closest('[data-slot="dropdown-menu-radio-item"]')
    ).toBeInTheDocument()
  })

  it('RadioItem: shows the CircleIcon indicator only on the selected item', () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value="two">
            <DropdownMenuRadioItem value="one">One</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="two">Two</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    const selected = screen
      .getByText('Two')
      .closest('[data-slot="dropdown-menu-radio-item"]')
    expect(selected).toHaveAttribute('data-state', 'checked')
    // lucide-react CircleIcon renders as <svg> inside ItemIndicator
    expect(selected?.querySelector('svg')).toBeInTheDocument()

    const unselected = screen
      .getByText('One')
      .closest('[data-slot="dropdown-menu-radio-item"]')
    expect(unselected).toHaveAttribute('data-state', 'unchecked')
    expect(unselected?.querySelector('svg')).not.toBeInTheDocument()
  })

  it('Shortcut: renders a <span> with data-slot, muted-foreground styling, and forwards className', () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuShortcut className="custom-shortcut">
            ⌘K
          </DropdownMenuShortcut>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    const shortcut = screen.getByText('⌘K')
    expect(shortcut.tagName).toBe('SPAN')
    expect(shortcut).toHaveAttribute('data-slot', 'dropdown-menu-shortcut')
    expect(shortcut).toHaveClass('text-[color:var(--muted-foreground)]')
    expect(shortcut).toHaveClass('custom-shortcut')
  })

  it('Sub: renders the Radix Sub context (SubTrigger and SubContent mount inside it)', () => {
    // Radix's `Sub` is a context-only provider — Popper.Root wraps
    // a MenuProvider and renders no DOM element of its own, so the
    // shim's `data-slot="dropdown-menu-sub"` does not surface in the
    // DOM. We verify the wrapper ran by asserting that its children
    // (SubTrigger / SubContent) are mounted, which they only can be
    // because Sub provided the surrounding context.
    //
    // Note: Radix's MenuSub destructures only `open` (not
    // `defaultOpen`) for its initial-state prop, so we drive Sub open
    // controlled with `open={true}` once the parent menu is open.
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub open={true}>
            <DropdownMenuSubTrigger>More options</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <span>Nested item</span>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    expect(
      screen
        .getByText('More options')
        .closest('[data-slot="dropdown-menu-sub-trigger"]')
    ).toBeInTheDocument()
    expect(
      screen
        .getByText('Nested item')
        .closest('[data-slot="dropdown-menu-sub-content"]')
    ).toBeInTheDocument()
  })

  it('SubTrigger: forwards `inset` to data-inset and renders the ChevronRightIcon', () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub open={true}>
            <DropdownMenuSubTrigger inset>More</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <span>Nested</span>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    const trigger = screen
      .getByText('More')
      .closest('[data-slot="dropdown-menu-sub-trigger"]')
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveAttribute('data-inset', 'true')
    // lucide-react ChevronRightIcon renders as <svg> inside the trigger.
    expect(trigger?.querySelector('svg')).toBeInTheDocument()
  })

  // `DropdownMenuPortal` and `DropdownMenuGroup` are not consumed by any
  // other component in the app, so the rest of the suite never exercises
  // them. The row target in the kanban acceptance criteria is
  // 100/100/100/100, so the dedicated tests below close out the last
  // two uncovered statements (lines 18 and 57) and keep the file green.

  it('Portal: renders inside the Menu context without errors', () => {
    // Radix's `MenuPortal` uses `asChild: true` Slot forwarding to a
    // generic portal wrapper — the shim's `data-slot="dropdown-menu-portal"`
    // does not surface as a DOM attribute on any element. We assert
    // that calling the wrapper inside an open DropdownMenu renders
    // cleanly (no "MenuPortal must be used within Menu" exception) and
    // that the rendered child is mounted. That is sufficient to cover
    // the wrapper's two statements at lines 18-19.
    expect(() =>
      render(
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuPortal>
            <p>Portalled child</p>
          </DropdownMenuPortal>
        </DropdownMenu>
      )
    ).not.toThrow()

    expect(screen.getByText('Portalled child')).toBeInTheDocument()
  })

  it('Group: applies data-slot and groups its children', () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuItem>Alpha</DropdownMenuItem>
            <DropdownMenuItem>Beta</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    const group = screen
      .getByText('Alpha')
      .closest('[data-slot="dropdown-menu-group"]')
    expect(group).toBeInTheDocument()
    expect(group).toContainElement(screen.getByText('Alpha'))
    expect(group).toContainElement(screen.getByText('Beta'))
  })
})
