import { render, screen } from '@testing-library/react'
import type { ComponentType, HTMLAttributes, ReactNode } from 'react'
import { describe, it, expect } from 'vitest'

import { Button } from './button'
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './breadcrumb'

// The data-driven loop below renders each wrapper through a permissive
// `ComponentType<HTMLAttributes<HTMLElement>>`. The wrappers themselves
// forward very different underlying element props (`<nav>`, `<ol>`,
// `<li>`, `<a>`, `<span>`) and the loop only cares about the shape the
// wrappers expose uniformly (data-slot, merged className, forwarded
// props). Using `HTMLAttributes<HTMLElement>` as the props type is the
// narrowest type that lets every wrapper be assigned without an `any`
// cast while still covering the props the loop actually passes.
type AnyComponent = ComponentType<HTMLAttributes<HTMLElement>>

interface WrapperSpec {
  Component: AnyComponent
  assertChildren?: boolean
  baseClasses: string[]
  name: string
  slot: string
  children?: ReactNode
}

const simpleWrappers: WrapperSpec[] = [
  {
    Component: Breadcrumb as AnyComponent,
    baseClasses: [],
    name: 'Breadcrumb',
    slot: 'breadcrumb',
  },
  {
    Component: BreadcrumbList as AnyComponent,
    baseClasses: ['flex', 'flex-wrap', 'items-center', 'gap-1.5', 'sm:gap-2.5'],
    name: 'BreadcrumbList',
    slot: 'breadcrumb-list',
  },
  {
    Component: BreadcrumbItem as AnyComponent,
    baseClasses: ['inline-flex', 'items-center', 'gap-1.5'],
    name: 'BreadcrumbItem',
    slot: 'breadcrumb-item',
  },
  {
    Component: BreadcrumbPage as AnyComponent,
    baseClasses: ['text-[color:var(--foreground)]', 'font-normal'],
    name: 'BreadcrumbPage',
    slot: 'breadcrumb-page',
  },
  {
    Component: BreadcrumbSeparator as AnyComponent,
    baseClasses: ['[&>svg]:size-3.5'],
    name: 'BreadcrumbSeparator',
    slot: 'breadcrumb-separator',
  },
  {
    // BreadcrumbEllipsis hardcodes its inner content (MoreHorizontal
    // icon + sr-only "More" label) rather than forwarding children,
    // so the data-driven loop skips the children-content assertion
    // here and the dedicated test below verifies the actual markup.
    assertChildren: false,
    Component: BreadcrumbEllipsis as AnyComponent,
    baseClasses: ['flex', 'size-9', 'items-center', 'justify-center'],
    name: 'BreadcrumbEllipsis',
    slot: 'breadcrumb-ellipsis',
  },
]

/**
 * These tests cover the seven thin Breadcrumb wrappers declared in
 * src/components/ui/breadcrumb.tsx. The wrappers are shadcn-style
 * pass-throughs that add a stable `data-slot` attribute, merge Tailwind
 * utility classes through `cn()`, and forward the underlying element
 * props (`<nav>`, `<ol>`, `<li>`, `<a>`, `<span>`) unchanged.
 *
 * `BreadcrumbLink` is the only one with conditional rendering — it
 * swaps between an `<a>` element and a Radix `Slot` based on the
 * `asChild` prop — and `BreadcrumbSeparator` has a `children ??
 * <ChevronRight />` fallback for its icon. Both branches get their own
 * dedicated tests below; the data-driven loop covers the rest.
 */
describe('Breadcrumb wrappers', () => {
  it.each(simpleWrappers)(
    '$name renders the expected element with slot metadata, classes, and forwarded props',
    ({ Component, assertChildren = true, baseClasses, name, slot }) => {
      const { container } = render(
        <Component
          aria-label={`${name} label`}
          className="custom-breadcrumb-class"
          data-custom="custom-value"
          data-testid={slot}
          id={`${slot}-id`}
        >
          {assertChildren ? `${name} content` : undefined}
        </Component>
      )

      const element = screen.getByTestId(slot)
      expect(container.children).toHaveLength(1)
      expect(element).toHaveAttribute('data-slot', slot)
      expect(element).toHaveAttribute('id', `${slot}-id`)
      expect(element).toHaveAttribute('aria-label', `${name} label`)
      expect(element).toHaveAttribute('data-custom', 'custom-value')
      if (assertChildren) {
        expect(element).toHaveTextContent(`${name} content`)
      }

      for (const className of baseClasses) {
        expect(element).toHaveClass(className)
      }
      expect(element).toHaveClass('custom-breadcrumb-class')
    }
  )

  it('Breadcrumb: sets aria-label="breadcrumb" on the underlying <nav>', () => {
    render(
      <Breadcrumb data-testid="root">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )

    const nav = screen.getByTestId('root')
    expect(nav.tagName).toBe('NAV')
    expect(nav).toHaveAttribute('aria-label', 'breadcrumb')
  })

  it('BreadcrumbList: renders an <ol> with the layout utility classes', () => {
    render(
      <BreadcrumbList data-testid="list">
        <BreadcrumbItem>One</BreadcrumbItem>
      </BreadcrumbList>
    )

    const list = screen.getByTestId('list')
    expect(list.tagName).toBe('OL')
    expect(list).toHaveClass('text-[color:var(--muted-foreground)]')
    expect(list).toHaveClass('text-sm')
    expect(list).toHaveClass('break-words')
  })

  it('BreadcrumbItem: renders an <li>', () => {
    render(
      <BreadcrumbList>
        <BreadcrumbItem data-testid="item">One</BreadcrumbItem>
      </BreadcrumbList>
    )

    const item = screen.getByTestId('item')
    expect(item.tagName).toBe('LI')
  })

  it('BreadcrumbPage: applies role/aria attributes for the current page marker', () => {
    render(
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage data-testid="page">Settings</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    )

    const page = screen.getByTestId('page')
    expect(page.tagName).toBe('SPAN')
    expect(page).toHaveAttribute('role', 'link')
    expect(page).toHaveAttribute('aria-disabled', 'true')
    expect(page).toHaveAttribute('aria-current', 'page')
  })

  it('BreadcrumbSeparator (default): renders an <li> with the ChevronRight icon', () => {
    render(
      <BreadcrumbList>
        <BreadcrumbItem>One</BreadcrumbItem>
        <BreadcrumbSeparator data-testid="separator" />
        <BreadcrumbItem>Two</BreadcrumbItem>
      </BreadcrumbList>
    )

    const separator = screen.getByTestId('separator')
    expect(separator.tagName).toBe('LI')
    expect(separator).toHaveAttribute('role', 'presentation')
    expect(separator).toHaveAttribute('aria-hidden', 'true')
    // Default-icon path: `children ?? <ChevronRight />`.
    const svg = separator.querySelector('svg')
    expect(svg).toBeInTheDocument()
    // The size-3.5 utility is applied via the parent's
    // `[&>svg]:size-3.5` child-selector class (not as a class on the
    // SVG element itself), so the SVG just needs to be present.
    expect(svg).toHaveClass('lucide-chevron-right')
  })

  it('BreadcrumbSeparator (override): renders the provided child instead of the default icon', () => {
    render(
      <BreadcrumbList>
        <BreadcrumbItem>One</BreadcrumbItem>
        <BreadcrumbSeparator data-testid="separator">
          <span data-testid="custom-sep">/</span>
        </BreadcrumbSeparator>
        <BreadcrumbItem>Two</BreadcrumbItem>
      </BreadcrumbList>
    )

    const separator = screen.getByTestId('separator')
    // Children override path: no ChevronRight <svg> is rendered.
    expect(separator.querySelector('svg')).not.toBeInTheDocument()
    expect(separator).toContainElement(screen.getByTestId('custom-sep'))
  })
})

describe('BreadcrumbLink', () => {
  it('renders a plain <a> with the hover-colour class when asChild is not set', () => {
    render(
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink data-testid="link" href="/docs">
            Docs
          </BreadcrumbLink>
        </BreadcrumbItem>
      </BreadcrumbList>
    )

    const link = screen.getByTestId('link')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/docs')
    expect(link).toHaveClass('hover:text-[color:var(--foreground)]')
    expect(link).toHaveClass('transition-colors')
  })

  it('forwards into its child via Radix Slot when asChild={true}', () => {
    // When asChild is true, BreadcrumbLink renders a Radix Slot that
    // merges its own data-slot + className into the child element,
    // so the underlying <a> becomes the rendered node instead of a
    // wrapping <a><a>...</a></a>.
    render(
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <a data-testid="link" href="/docs">
              Docs
            </a>
          </BreadcrumbLink>
        </BreadcrumbItem>
      </BreadcrumbList>
    )

    const link = screen.getByTestId('link')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('data-slot', 'breadcrumb-link')
    expect(link).toHaveAttribute('href', '/docs')
    expect(link).toHaveClass('hover:text-[color:var(--foreground)]')
    // No double-wrap: the wrapper <a> is gone, only the child <a> remains.
    expect(link.parentElement?.querySelector('a')).toBe(link)
  })

  it('forwards className through cn() when both asChild and a custom class are provided', () => {
    render(
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild className="custom-link-class">
            <Button data-testid="link" variant="ghost" size="sm">
              Button as link
            </Button>
          </BreadcrumbLink>
        </BreadcrumbItem>
      </BreadcrumbList>
    )

    const link = screen.getByTestId('link')
    expect(link).toHaveAttribute('data-slot', 'breadcrumb-link')
    expect(link).toHaveClass('hover:text-[color:var(--foreground)]')
    expect(link).toHaveClass('custom-link-class')
  })
})

describe('BreadcrumbEllipsis', () => {
  it('renders a <span> with the MoreHorizontal icon and an sr-only "More" label', () => {
    render(
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbEllipsis data-testid="ellipsis" />
        </BreadcrumbItem>
      </BreadcrumbList>
    )

    const ellipsis = screen.getByTestId('ellipsis')
    expect(ellipsis.tagName).toBe('SPAN')
    expect(ellipsis).toHaveAttribute('role', 'presentation')
    expect(ellipsis).toHaveAttribute('aria-hidden', 'true')
    // MoreHorizontal from lucide-react renders as <svg class="size-4">.
    const svg = ellipsis.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveClass('size-4')
    // The screen-reader-only label lives in a child <span class="sr-only">.
    const srOnly = ellipsis.querySelector('span.sr-only')
    expect(srOnly).toBeInTheDocument()
    expect(srOnly).toHaveTextContent('More')
  })
})
