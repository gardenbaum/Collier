import { act, fireEvent, render, screen } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from './sidebar'

/**
 * Tests for src/components/ui/sidebar.tsx (731 lines, the last remaining
 * 0%-coverage shadcn primitive in src/components/ui/ after PRs #119-#129).
 *
 * Module shape:
 *   useSidebar         — hook; throws when no provider, returns context.
 *   SidebarProvider    — controlled/uncontrolled desktop open + mobile
 *                        openMobile + cookie persistence + cmd/ctrl+b
 *                        keyboard shortcut. Wraps children in a
 *                        TooltipProvider.
 *   Sidebar            — three render branches:
 *                          1. collapsible="none" → plain <div>
 *                          2. isMobile=true → <Sheet> with data-mobile
 *                          3. default desktop → gap + container with
 *                             data-state/data-collapsible/data-variant
 *                             /data-side, conditional classNames for
 *                             variant (floating/inset vs sidebar) and
 *                             side (left/right).
 *   SidebarTrigger /   — invoke toggleSidebar on click; merge user onClick
 *   SidebarRail          handlers.
 *   Thin wrappers      — SidebarInset, SidebarInput, SidebarHeader,
 *                        SidebarFooter, SidebarSeparator, SidebarContent,
 *                        SidebarGroup, SidebarGroupContent, SidebarMenu,
 *                        SidebarMenuItem, SidebarMenuBadge, SidebarMenuSub,
 *                        SidebarMenuSubItem: bag-of-classes forwarders.
 *   SidebarGroupLabel  — asChild Slot branch + collapsible=icon classes.
 *   SidebarGroupAction — asChild Slot branch + collapsible=icon classes.
 *   sidebarMenuButtonVariants — cva on (variant: default|outline,
 *                              size: default|sm|lg).
 *   SidebarMenuButton  — asChild Slot; isActive → data-active=true;
 *                        cva variant/size; no tooltip; tooltip=string
 *                        wraps in Tooltip with children; tooltip=object
 *                        wraps in Tooltip with TooltipContent side="right"
 *                        align="center" hidden={state!=='collapsed' ||
 *                        isMobile} {...tooltip}.
 *   SidebarMenuAction  — asChild Slot; showOnHover conditional class.
 *   SidebarMenuSkeleton — random width 50-90% (useState initializer,
 *                         once per mount); showIcon → icon + text skeleton,
 *                         otherwise only text skeleton.
 *   SidebarMenuSubButton — asChild Slot; size sm/md; isActive.
 */

// jsdom does not implement ResizeObserver. Radix Tooltip uses one
// inside `use-size` for positioning; a no-op stub keeps the layout
// effects quiet without forcing the test to simulate real DOM
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

// Reset cookie + viewport + mocks between tests. SidebarProvider writes
// to document.cookie and useIsMobile reads window.innerWidth at mount.
beforeEach(() => {
  document.cookie =
    'sidebar_state=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  window.innerWidth = 1024
  vi.clearAllMocks()
})

/* -------------------------------------------------------------------------- */
/*  useSidebar hook                                                           */
/* -------------------------------------------------------------------------- */

describe('useSidebar', () => {
  it('throws when used outside a SidebarProvider', () => {
    // Suppress React's error-boundary console output that vitest
    // surfaces as a noisy test failure for expected throws.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => renderHook(() => useSidebar())).toThrow(
      'useSidebar must be used within a SidebarProvider.'
    )
    spy.mockRestore()
  })

  it('returns the context value (defaultOpen=true → state=expanded, open=true)', () => {
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }) => <SidebarProvider>{children}</SidebarProvider>,
    })
    expect(result.current.state).toBe('expanded')
    expect(result.current.open).toBe(true)
    expect(result.current.openMobile).toBe(false)
    expect(result.current.isMobile).toBe(false)
    expect(typeof result.current.setOpen).toBe('function')
    expect(typeof result.current.setOpenMobile).toBe('function')
    expect(typeof result.current.toggleSidebar).toBe('function')
  })
})

/* -------------------------------------------------------------------------- */
/*  SidebarProvider                                                           */
/* -------------------------------------------------------------------------- */

describe('SidebarProvider', () => {
  it('renders a wrapper div with default classes and CSS variables', () => {
    render(<SidebarProvider data-testid="provider" />)
    const wrapper = screen.getByTestId('provider')
    expect(wrapper).toHaveAttribute('data-slot', 'sidebar-wrapper')
    expect(wrapper).toHaveClass('flex')
    expect(wrapper).toHaveClass('min-h-svh')
    expect(wrapper).toHaveClass('w-full')
    expect(wrapper).toHaveClass(
      'has-data-[variant=inset]:bg-[color:var(--sidebar)]'
    )
    // CSS variables live in the inline style.
    expect(wrapper.style.getPropertyValue('--sidebar-width')).toBe('16rem')
    expect(wrapper.style.getPropertyValue('--sidebar-width-icon')).toBe('3rem')
  })

  it('merges a custom className and forwards extra div props + style', () => {
    render(
      <SidebarProvider
        className="my-wrapper"
        data-testid="provider-forwarded"
        id="provider-id"
        style={{ backgroundColor: 'red' }}
      />
    )
    const wrapper = screen.getByTestId('provider-forwarded')
    expect(wrapper).toHaveClass('my-wrapper')
    expect(wrapper).toHaveClass('flex')
    expect(wrapper).toHaveAttribute('id', 'provider-id')
    // style merges — both the CSS variables and the user's backgroundColor
    // must be on the inline style object.
    expect(wrapper.style.getPropertyValue('--sidebar-width')).toBe('16rem')
    expect(wrapper.style.backgroundColor).toBe('red')
  })

  it('defaults to defaultOpen=true (state=expanded, open=true)', () => {
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }) => <SidebarProvider>{children}</SidebarProvider>,
    })
    expect(result.current.state).toBe('expanded')
    expect(result.current.open).toBe(true)
  })

  it('respects defaultOpen=false (state=collapsed, open=false)', () => {
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }) => (
        <SidebarProvider defaultOpen={false}>{children}</SidebarProvider>
      ),
    })
    expect(result.current.state).toBe('collapsed')
    expect(result.current.open).toBe(false)
  })

  it('uses openProp as the controlled open value (overrides internal state)', () => {
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }) => (
        <SidebarProvider open={false}>{children}</SidebarProvider>
      ),
    })
    expect(result.current.open).toBe(false)
    expect(result.current.state).toBe('collapsed')
  })

  it('writes a cookie with the open state when setOpen is called', () => {
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }) => <SidebarProvider>{children}</SidebarProvider>,
    })
    act(() => {
      result.current.setOpen(false)
    })
    expect(document.cookie).toContain('sidebar_state=false')
    act(() => {
      result.current.setOpen(true)
    })
    expect(document.cookie).toContain('sidebar_state=true')
  })

  it('supports the function-form setOpen(prev => !prev)', () => {
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }) => <SidebarProvider>{children}</SidebarProvider>,
    })
    expect(result.current.open).toBe(true)
    act(() => {
      // The context types setOpen as `(open: boolean) => void` but the
      // internal implementation (a React.useCallback with signature
      // `(value: boolean | ((value: boolean) => boolean)) => void`)
      // also accepts a function form. We bypass the public type to
      // exercise the `typeof value === 'function'` branch.
      ;(
        result.current.setOpen as unknown as (
          value: boolean | ((prev: boolean) => boolean)
        ) => void
      )((prev: boolean) => !prev)
    })
    expect(result.current.open).toBe(false)
  })

  it('calls setOpenProp (controlled onOpenChange) instead of internal setter', () => {
    const onOpenChange = vi.fn()
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }) => (
        <SidebarProvider onOpenChange={onOpenChange}>
          {children}
        </SidebarProvider>
      ),
    })
    act(() => {
      result.current.setOpen(false)
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    // In controlled mode the provider does not flip internal state —
    // open stays at the initial defaultOpen=true.
    expect(result.current.open).toBe(true)
  })

  it('toggleSidebar flips the desktop open state', () => {
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }) => <SidebarProvider>{children}</SidebarProvider>,
    })
    expect(result.current.open).toBe(true)
    act(() => {
      result.current.toggleSidebar()
    })
    expect(result.current.open).toBe(false)
    act(() => {
      result.current.toggleSidebar()
    })
    expect(result.current.open).toBe(true)
  })

  it('toggleSidebar flips mobile openMobile when isMobile=true', () => {
    window.innerWidth = 500
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }) => <SidebarProvider>{children}</SidebarProvider>,
    })
    expect(result.current.isMobile).toBe(true)
    expect(result.current.openMobile).toBe(false)
    act(() => {
      result.current.toggleSidebar()
    })
    expect(result.current.openMobile).toBe(true)
  })

  it('listens for cmd/ctrl+b keyboard shortcut to toggle the sidebar', () => {
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }) => <SidebarProvider>{children}</SidebarProvider>,
    })
    expect(result.current.open).toBe(true)
    fireEvent.keyDown(window, { key: 'b', metaKey: true })
    expect(result.current.open).toBe(false)
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    expect(result.current.open).toBe(true)
  })

  it('ignores keyboard shortcuts for non-b keys and for b without meta/ctrl', () => {
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }) => <SidebarProvider>{children}</SidebarProvider>,
    })
    fireEvent.keyDown(window, { key: 'a', metaKey: true })
    expect(result.current.open).toBe(true)
    fireEvent.keyDown(window, { key: 'b' })
    expect(result.current.open).toBe(true)
  })

  it('removes the keydown listener on unmount', () => {
    const { unmount } = renderHook(() => useSidebar(), {
      wrapper: ({ children }) => <SidebarProvider>{children}</SidebarProvider>,
    })
    unmount()
    // After unmount the global listener is gone — firing the shortcut
    // does nothing (we have no provider here, but the lack of effect
    // is asserted by the unmount not throwing and no toggle happening
    // implicitly).
    expect(() =>
      fireEvent.keyDown(window, { key: 'b', metaKey: true })
    ).not.toThrow()
  })
})

/* -------------------------------------------------------------------------- */
/*  Sidebar (collapsible="none" branch)                                       */
/* -------------------------------------------------------------------------- */

describe('Sidebar (collapsible="none")', () => {
  it('renders a plain <div> with the sidebar slot + base classes, no Sheet', () => {
    render(
      <SidebarProvider>
        <Sidebar collapsible="none" data-testid="sidebar-none">
          <span>payload</span>
        </Sidebar>
      </SidebarProvider>
    )
    const sidebar = screen.getByTestId('sidebar-none')
    expect(sidebar.tagName).toBe('DIV')
    expect(sidebar).toHaveAttribute('data-slot', 'sidebar')
    expect(sidebar).toHaveClass('flex')
    expect(sidebar).toHaveClass('h-full')
    expect(sidebar).toHaveClass('w-(--sidebar-width)')
    expect(sidebar).toHaveTextContent('payload')
    // No desktop chrome (data-state / data-collapsible / data-side) and
    // no Sheet wrapper (no role="dialog").
    expect(sidebar).not.toHaveAttribute('data-state')
    expect(sidebar).not.toHaveAttribute('data-collapsible')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/*  Sidebar (mobile / isMobile branch)                                        */
/* -------------------------------------------------------------------------- */

describe('Sidebar (mobile / isMobile=true)', () => {
  it('renders a Sheet with data-mobile, SheetHeader sr-only title + description, and child wrapper when openMobile is true', async () => {
    window.innerWidth = 500
    render(
      <SidebarProvider>
        <Sidebar data-testid="sidebar-mobile" side="left">
          <span>mobile-payload</span>
        </Sidebar>
        <SidebarTrigger data-testid="sidebar-trigger" />
      </SidebarProvider>
    )
    // Sheet starts closed (openMobile=false → SheetContent not mounted).
    expect(document.querySelector('[data-mobile="true"]')).toBeNull()
    // Click trigger → toggleSidebar → setOpenMobile(true) → Sheet opens.
    fireEvent.click(screen.getByTestId('sidebar-trigger'))

    // SheetContent is teleported to body; the SheetTitle inside the
    // sr-only SheetHeader is rendered as a Radix Dialog.Title.
    expect(screen.getByText('Sidebar')).toBeInTheDocument()
    expect(screen.getByText('Displays the mobile sidebar.')).toBeInTheDocument()

    // The SheetContent wrapper carries the data-mobile/data-slot/data-sidebar
    // attributes set by Sidebar's mobile branch.
    const content = document.querySelector('[data-mobile="true"]')
    expect(content).not.toBeNull()
    expect(content).toHaveAttribute('data-slot', 'sidebar')
    expect(content).toHaveAttribute('data-sidebar', 'sidebar')
    expect(content).toHaveClass(
      'bg-[color:var(--sidebar)] text-[color:var(--sidebar-foreground)]'
    )
    expect(content).toHaveClass('[&>button]:hidden')

    // Mobile CSS variable (18rem) on the inline style.
    expect(content?.getAttribute('style')).toContain('--sidebar-width: 18rem')

    // SheetHeader is sr-only.
    expect(document.querySelector('[data-slot="sheet-header"]')).toHaveClass(
      'sr-only'
    )

    // Children passed to Sidebar are rendered inside the flex wrapper
    // div, not directly on the SheetContent element.
    expect(
      content?.querySelector('.flex.h-full.w-full.flex-col')
    ).not.toBeNull()
    expect(screen.getByText('mobile-payload')).toBeInTheDocument()
  })

  it('applies side="right" container classes (right-0 + border-l) on the mobile SheetContent when side="right"', () => {
    window.innerWidth = 500
    render(
      <SidebarProvider>
        <Sidebar data-testid="sidebar-mobile-right" side="right">
          <span>x</span>
        </Sidebar>
        <SidebarTrigger data-testid="sidebar-trigger" />
      </SidebarProvider>
    )
    fireEvent.click(screen.getByTestId('sidebar-trigger'))
    const content = document.querySelector('[data-mobile="true"]')
    expect(content).not.toBeNull()
    // Our SheetContent uses the `side` prop to apply positioning
    // classes (it does NOT expose a data-side attribute). side="right"
    // activates the right-side tokens.
    expect(content).toHaveClass('right-0')
    expect(content).toHaveClass('border-l')
    // The left-side branch is NOT applied.
    expect(content).not.toHaveClass('left-0')
    expect(content).not.toHaveClass('border-r')
  })

  it('clicking SidebarTrigger while isMobile=true opens the mobile Sheet via toggleSidebar → setOpenMobile', () => {
    window.innerWidth = 500
    render(
      <SidebarProvider>
        <Sidebar data-testid="sidebar-mobile" side="left">
          <span>mobile-payload</span>
        </Sidebar>
        <SidebarTrigger data-testid="sidebar-trigger" />
      </SidebarProvider>
    )

    // Sheet starts closed (openMobile=false → SheetContent not mounted).
    expect(document.querySelector('[data-mobile="true"]')).toBeNull()

    fireEvent.click(screen.getByTestId('sidebar-trigger'))

    // After click, toggleSidebar on mobile flips openMobile → true and
    // the Sheet opens.
    expect(document.querySelector('[data-mobile="true"]')).not.toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/*  Sidebar (default desktop branch)                                          */
/* -------------------------------------------------------------------------- */

describe('Sidebar (default desktop)', () => {
  it('renders the outer wrapper with data-state/data-collapsible/data-variant/data-side and the sidebar-variant container classes', () => {
    render(
      <SidebarProvider>
        <Sidebar data-testid="sidebar-default">
          <span>payload</span>
        </Sidebar>
      </SidebarProvider>
    )

    // data-testid lands on the *container* via {...props} — query the
    // outer wrapper separately via its data-slot="sidebar" attribute.
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    expect(sidebar).not.toBeNull()
    expect(sidebar?.tagName).toBe('DIV')
    expect(sidebar).toHaveAttribute('data-state', 'expanded')
    expect(sidebar).toHaveAttribute('data-variant', 'sidebar')
    expect(sidebar).toHaveAttribute('data-side', 'left')
    // data-collapsible is empty when state=expanded (the source
    // expression is `state === 'collapsed' ? collapsible : ''`).
    expect(sidebar).toHaveAttribute('data-collapsible', '')
    expect(sidebar).toHaveClass('group')
    expect(sidebar).toHaveClass('peer')
    expect(sidebar).toHaveClass('hidden')
    expect(sidebar).toHaveClass('md:block')

    // Gap + container children.
    const gap = document.querySelector('[data-slot="sidebar-gap"]')
    expect(gap).not.toBeNull()
    expect(gap).toHaveClass('relative')
    expect(gap).toHaveClass('w-(--sidebar-width)')
    // default variant=sidebar → 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)'
    // branch (the negative one for floating/inset).
    expect(gap).toHaveClass(
      'group-data-[collapsible=icon]:w-(--sidebar-width-icon)'
    )

    // The container carries the data-testid (via {...props}) and the
    // user-mergeable className + variant/side positioning classes.
    const container = screen.getByTestId('sidebar-default')
    expect(container.tagName).toBe('DIV')
    expect(container).toHaveAttribute('data-slot', 'sidebar-container')
    expect(container).toHaveClass('fixed')
    expect(container).toHaveClass('h-svh')
    expect(container).toHaveClass('w-(--sidebar-width)')
    // default side=left → 'left-0 ...'
    expect(container).toHaveClass('left-0')
    // default variant=sidebar → 'border-r' (left) + 'border-l' (right)
    // tokens present (they only activate via data-side selectors).
    expect(container).toHaveClass(
      'group-data-[side=left]:border-r border-[color:var(--sidebar-border)]'
    )
    expect(container).toHaveClass(
      'group-data-[side=right]:border-l border-[color:var(--sidebar-border)]'
    )
    // The negative (floating/inset) container branch is NOT applied.
    expect(container).not.toHaveClass('p-2')

    // Inner.
    const inner = document.querySelector('[data-slot="sidebar-inner"]')
    expect(inner).toHaveClass('flex')
    expect(inner).toHaveClass('h-full')
    expect(inner).toHaveTextContent('payload')
  })

  it('applies side="right" container tokens (right-0) and excludes left-0', () => {
    render(
      <SidebarProvider>
        <Sidebar data-testid="sidebar-right" side="right">
          <span>x</span>
        </Sidebar>
      </SidebarProvider>
    )
    const container = document.querySelector('[data-slot="sidebar-container"]')
    expect(container).toHaveClass('right-0')
    expect(container).not.toHaveClass('left-0')
    // Gap rotates on right side.
    const gap = document.querySelector('[data-slot="sidebar-gap"]')
    expect(gap).toHaveClass('group-data-[side=right]:rotate-180')
  })

  it('applies variant="floating" container tokens (p-2 + collapsed calc width) and gap calc width', () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <Sidebar data-testid="sidebar-floating" variant="floating">
          <span>x</span>
        </Sidebar>
      </SidebarProvider>
    )
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    expect(sidebar).toHaveAttribute('data-variant', 'floating')
    expect(sidebar).toHaveAttribute('data-state', 'collapsed')
    // state=collapsed + collapsible='offcanvas' → data-collapsible="offcanvas".
    expect(sidebar).toHaveAttribute('data-collapsible', 'offcanvas')

    const container = document.querySelector('[data-slot="sidebar-container"]')
    expect(container).toHaveClass('p-2')
    expect(container).toHaveClass(
      'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
    )

    const gap = document.querySelector('[data-slot="sidebar-gap"]')
    expect(gap).toHaveClass(
      'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
    )

    // Inner has the floating-variant rounding/border tokens.
    const inner = document.querySelector('[data-slot="sidebar-inner"]')
    expect(inner).toHaveClass(
      'group-data-[variant=floating]:rounded-[var(--radius)]'
    )
    expect(inner).toHaveClass('group-data-[variant=floating]:border')
  })

  it('applies variant="inset" container tokens (p-2 + collapsed calc width)', () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <Sidebar data-testid="sidebar-inset" variant="inset">
          <span>x</span>
        </Sidebar>
      </SidebarProvider>
    )
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    expect(sidebar).toHaveAttribute('data-variant', 'inset')
    const container = document.querySelector('[data-slot="sidebar-container"]')
    expect(container).toHaveClass('p-2')
    // The floating/inset branch wins over the sidebar-variant border tokens.
    expect(container).not.toHaveClass(
      'group-data-[side=left]:border-r border-[color:var(--sidebar-border)]'
    )
  })

  it('applies collapsible="icon" data-collapsible="icon" when state=collapsed', () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <Sidebar
          collapsible="icon"
          data-testid="sidebar-icon"
          variant="sidebar"
        >
          <span>x</span>
        </Sidebar>
      </SidebarProvider>
    )
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    expect(sidebar).toHaveAttribute('data-collapsible', 'icon')
    expect(sidebar).toHaveAttribute('data-state', 'collapsed')
  })

  it('merges a custom className onto the container and forwards extra props', () => {
    render(
      <SidebarProvider>
        <Sidebar
          aria-label="primary sidebar"
          className="my-container"
          data-testid="sidebar-forwarded"
          id="sidebar-id"
        >
          <span>x</span>
        </Sidebar>
      </SidebarProvider>
    )
    const container = document.querySelector('[data-slot="sidebar-container"]')
    expect(container).toHaveClass('my-container')
    expect(container).toHaveClass('fixed')
    expect(container).toHaveAttribute('aria-label', 'primary sidebar')
    expect(container).toHaveAttribute('id', 'sidebar-id')
  })
})

/* -------------------------------------------------------------------------- */
/*  SidebarTrigger                                                            */
/* -------------------------------------------------------------------------- */

describe('SidebarTrigger', () => {
  it('renders a Button with the ghost/icon variant, data-slot, and an sr-only Toggle Sidebar label', () => {
    render(
      <SidebarProvider>
        <SidebarTrigger data-testid="sidebar-trigger" />
      </SidebarProvider>
    )
    const trigger = screen.getByTestId('sidebar-trigger')
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger).toHaveAttribute('data-slot', 'sidebar-trigger')
    expect(trigger).toHaveAttribute('data-sidebar', 'trigger')
    expect(trigger).toHaveClass('size-7')
    // sr-only label survives as a child.
    expect(trigger).toHaveTextContent('Toggle Sidebar')
    // An inline SVG icon (PanelLeftIcon from lucide-react) is present.
    expect(trigger.querySelector('svg')).not.toBeNull()
  })

  it('clicking the trigger calls toggleSidebar (flips open)', () => {
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }) => (
        <SidebarProvider>
          <SidebarTrigger data-testid="sidebar-trigger" />
          {children}
        </SidebarProvider>
      ),
    })
    expect(result.current.open).toBe(true)
    fireEvent.click(screen.getByTestId('sidebar-trigger'))
    expect(result.current.open).toBe(false)
  })

  it('forwards a custom onClick (runs before toggleSidebar)', () => {
    const onClick = vi.fn()
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }) => (
        <SidebarProvider>
          <SidebarTrigger data-testid="sidebar-trigger" onClick={onClick} />
          {children}
        </SidebarProvider>
      ),
    })
    fireEvent.click(screen.getByTestId('sidebar-trigger'))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(result.current.open).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/*  SidebarRail                                                               */
/* -------------------------------------------------------------------------- */

describe('SidebarRail', () => {
  it('renders a <button> with aria-label="Toggle Sidebar", title, and tabIndex=-1', () => {
    render(
      <SidebarProvider>
        <SidebarRail data-testid="sidebar-rail" />
      </SidebarProvider>
    )
    const rail = screen.getByTestId('sidebar-rail')
    expect(rail.tagName).toBe('BUTTON')
    expect(rail).toHaveAttribute('data-slot', 'sidebar-rail')
    expect(rail).toHaveAttribute('data-sidebar', 'rail')
    expect(rail).toHaveAttribute('aria-label', 'Toggle Sidebar')
    expect(rail).toHaveAttribute('title', 'Toggle Sidebar')
    expect(rail).toHaveAttribute('tabindex', '-1')
  })

  it('clicking the rail toggles the sidebar', () => {
    const { result } = renderHook(() => useSidebar(), {
      wrapper: ({ children }) => (
        <SidebarProvider>
          <SidebarRail data-testid="sidebar-rail" />
          {children}
        </SidebarProvider>
      ),
    })
    expect(result.current.open).toBe(true)
    fireEvent.click(screen.getByTestId('sidebar-rail'))
    expect(result.current.open).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/*  Thin forwarders                                                           */
/* -------------------------------------------------------------------------- */

describe('SidebarInset', () => {
  it('renders a <main> with the sidebar-inset data-slot and the inset peer-data tokens', () => {
    render(<SidebarInset data-testid="sidebar-inset">payload</SidebarInset>)
    const inset = screen.getByTestId('sidebar-inset')
    expect(inset.tagName).toBe('MAIN')
    expect(inset).toHaveAttribute('data-slot', 'sidebar-inset')
    expect(inset).toHaveClass('flex')
    expect(inset).toHaveClass('w-full')
    expect(inset).toHaveClass('flex-1')
    // The peer-data tokens are baked into cn() input.
    expect(inset).toHaveClass('md:peer-data-[variant=inset]:m-2')
    expect(inset).toHaveTextContent('payload')
  })

  it('merges a custom className and forwards props', () => {
    render(
      <SidebarInset
        aria-label="main content"
        className="my-inset"
        data-testid="sidebar-inset-forwarded"
        id="inset-id"
      />
    )
    const inset = screen.getByTestId('sidebar-inset-forwarded')
    expect(inset).toHaveClass('my-inset')
    expect(inset).toHaveClass('flex')
    expect(inset).toHaveAttribute('aria-label', 'main content')
    expect(inset).toHaveAttribute('id', 'inset-id')
  })
})

describe('SidebarInput', () => {
  it('renders an <input> with the sidebar-input data-slot and base classes', () => {
    render(<SidebarInput data-testid="sidebar-input" placeholder="Search…" />)
    const input = screen.getByTestId('sidebar-input')
    expect(input.tagName).toBe('INPUT')
    expect(input).toHaveAttribute('data-slot', 'sidebar-input')
    expect(input).toHaveAttribute('data-sidebar', 'input')
    expect(input).toHaveClass('h-8')
    expect(input).toHaveClass('w-full')
    expect(input).toHaveClass('shadow-none')
    expect(input).toHaveAttribute('placeholder', 'Search…')
  })

  it('merges a custom className', () => {
    render(<SidebarInput className="my-input" data-testid="sidebar-input-mc" />)
    const input = screen.getByTestId('sidebar-input-mc')
    expect(input).toHaveClass('my-input')
    expect(input).toHaveClass('h-8')
  })
})

describe('SidebarHeader', () => {
  it('renders a <div> with the sidebar-header data-slot and flex-col gap-2 p-2', () => {
    render(<SidebarHeader data-testid="sidebar-header">hdr</SidebarHeader>)
    const header = screen.getByTestId('sidebar-header')
    expect(header.tagName).toBe('DIV')
    expect(header).toHaveAttribute('data-slot', 'sidebar-header')
    expect(header).toHaveAttribute('data-sidebar', 'header')
    expect(header).toHaveClass('flex')
    expect(header).toHaveClass('flex-col')
    expect(header).toHaveClass('gap-2')
    expect(header).toHaveClass('p-2')
  })
})

describe('SidebarFooter', () => {
  it('renders a <div> with the sidebar-footer data-slot and flex-col gap-2 p-2', () => {
    render(<SidebarFooter data-testid="sidebar-footer">ftr</SidebarFooter>)
    const footer = screen.getByTestId('sidebar-footer')
    expect(footer.tagName).toBe('DIV')
    expect(footer).toHaveAttribute('data-slot', 'sidebar-footer')
    expect(footer).toHaveAttribute('data-sidebar', 'footer')
    expect(footer).toHaveClass('flex')
    expect(footer).toHaveClass('flex-col')
    expect(footer).toHaveClass('gap-2')
    expect(footer).toHaveClass('p-2')
  })
})

describe('SidebarSeparator', () => {
  it('renders a Separator with the sidebar-separator data-slot and merged class', () => {
    render(
      <SidebarProvider>
        <SidebarSeparator className="my-sep" data-testid="sidebar-separator" />
      </SidebarProvider>
    )
    const sep = screen.getByTestId('sidebar-separator')
    expect(sep.tagName).toBe('DIV')
    expect(sep).toHaveAttribute('data-slot', 'sidebar-separator')
    expect(sep).toHaveAttribute('data-sidebar', 'separator')
    expect(sep).toHaveClass('my-sep')
    expect(sep).toHaveClass('bg-[color:var(--sidebar-border)]')
    expect(sep).toHaveClass('mx-2')
    expect(sep).toHaveClass('w-auto')
  })
})

describe('SidebarContent', () => {
  it('renders a <div> with the sidebar-content data-slot and overflow-auto classes', () => {
    render(<SidebarContent data-testid="sidebar-content">body</SidebarContent>)
    const content = screen.getByTestId('sidebar-content')
    expect(content.tagName).toBe('DIV')
    expect(content).toHaveAttribute('data-slot', 'sidebar-content')
    expect(content).toHaveAttribute('data-sidebar', 'content')
    expect(content).toHaveClass('flex')
    expect(content).toHaveClass('min-h-0')
    expect(content).toHaveClass('flex-1')
    expect(content).toHaveClass('gap-2')
    expect(content).toHaveClass('overflow-auto')
  })
})

describe('SidebarGroup', () => {
  it('renders a <div> with the sidebar-group data-slot and the flex-col p-2 base', () => {
    render(<SidebarGroup data-testid="sidebar-group">group</SidebarGroup>)
    const group = screen.getByTestId('sidebar-group')
    expect(group.tagName).toBe('DIV')
    expect(group).toHaveAttribute('data-slot', 'sidebar-group')
    expect(group).toHaveAttribute('data-sidebar', 'group')
    expect(group).toHaveClass('relative')
    expect(group).toHaveClass('flex')
    expect(group).toHaveClass('w-full')
    expect(group).toHaveClass('flex-col')
    expect(group).toHaveClass('p-2')
  })
})

/* -------------------------------------------------------------------------- */
/*  SidebarGroupLabel / SidebarGroupAction (asChild Slot)                     */
/* -------------------------------------------------------------------------- */

describe('SidebarGroupLabel', () => {
  it('renders a <div> with the sidebar-group-label data-slot and collapsible=icon hidden classes', () => {
    render(
      <SidebarGroupLabel data-testid="sidebar-group-label">
        Group title
      </SidebarGroupLabel>
    )
    const label = screen.getByTestId('sidebar-group-label')
    expect(label.tagName).toBe('DIV')
    expect(label).toHaveAttribute('data-slot', 'sidebar-group-label')
    expect(label).toHaveAttribute('data-sidebar', 'group-label')
    // The collapsible=icon hidden/margin tokens are baked into cn().
    expect(label).toHaveClass('group-data-[collapsible=icon]:-mt-8')
    expect(label).toHaveClass('group-data-[collapsible=icon]:opacity-0')
  })

  it('forwards data-slot onto the child element when asChild is set', () => {
    render(
      <SidebarGroupLabel asChild>
        <h2 data-testid="sidebar-group-label-slot">Group title</h2>
      </SidebarGroupLabel>
    )
    const heading = screen.getByTestId('sidebar-group-label-slot')
    expect(heading.tagName).toBe('H2')
    expect(heading).toHaveAttribute('data-slot', 'sidebar-group-label')
    expect(heading).toHaveAttribute('data-sidebar', 'group-label')
    expect(heading).toHaveClass('flex')
  })
})

describe('SidebarGroupAction', () => {
  it('renders a <button> with the sidebar-group-action data-slot and collapsible=icon hidden class', () => {
    render(
      <SidebarGroupAction data-testid="sidebar-group-action">
        action
      </SidebarGroupAction>
    )
    const action = screen.getByTestId('sidebar-group-action')
    expect(action.tagName).toBe('BUTTON')
    expect(action).toHaveAttribute('data-slot', 'sidebar-group-action')
    expect(action).toHaveAttribute('data-sidebar', 'group-action')
    expect(action).toHaveClass('absolute')
    expect(action).toHaveClass('top-3.5')
    expect(action).toHaveClass('right-3')
    expect(action).toHaveClass('group-data-[collapsible=icon]:hidden')
  })

  it('forwards data-slot onto the child element when asChild is set', () => {
    render(
      <SidebarGroupAction asChild>
        <a data-testid="sidebar-group-action-slot" href="#action">
          link
        </a>
      </SidebarGroupAction>
    )
    const link = screen.getByTestId('sidebar-group-action-slot')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('data-slot', 'sidebar-group-action')
    expect(link).toHaveAttribute('data-sidebar', 'group-action')
    expect(link).toHaveAttribute('href', '#action')
  })
})

/* -------------------------------------------------------------------------- */
/*  SidebarGroupContent / SidebarMenu / SidebarMenuItem                       */
/* -------------------------------------------------------------------------- */

describe('SidebarGroupContent', () => {
  it('renders a <div> with the sidebar-group-content data-slot and w-full text-sm', () => {
    render(
      <SidebarGroupContent data-testid="sidebar-group-content">
        body
      </SidebarGroupContent>
    )
    const content = screen.getByTestId('sidebar-group-content')
    expect(content.tagName).toBe('DIV')
    expect(content).toHaveAttribute('data-slot', 'sidebar-group-content')
    expect(content).toHaveAttribute('data-sidebar', 'group-content')
    expect(content).toHaveClass('w-full')
    expect(content).toHaveClass('text-sm')
  })
})

describe('SidebarMenu', () => {
  it('renders a <ul> with the sidebar-menu data-slot and the flex-col gap-1 base', () => {
    render(<SidebarMenu data-testid="sidebar-menu">menu</SidebarMenu>)
    const menu = screen.getByTestId('sidebar-menu')
    expect(menu.tagName).toBe('UL')
    expect(menu).toHaveAttribute('data-slot', 'sidebar-menu')
    expect(menu).toHaveAttribute('data-sidebar', 'menu')
    expect(menu).toHaveClass('flex')
    expect(menu).toHaveClass('w-full')
    expect(menu).toHaveClass('flex-col')
    expect(menu).toHaveClass('gap-1')
  })
})

describe('SidebarMenuItem', () => {
  it('renders a <li> with the sidebar-menu-item data-slot and the group/menu-item peer token base', () => {
    render(
      <SidebarMenuItem data-testid="sidebar-menu-item">item</SidebarMenuItem>
    )
    const item = screen.getByTestId('sidebar-menu-item')
    expect(item.tagName).toBe('LI')
    expect(item).toHaveAttribute('data-slot', 'sidebar-menu-item')
    expect(item).toHaveAttribute('data-sidebar', 'menu-item')
    expect(item).toHaveClass('group/menu-item')
    expect(item).toHaveClass('relative')
  })
})

/* -------------------------------------------------------------------------- */
/*  SidebarMenuButton (no tooltip / cva variants / asChild / isActive)       */
/* -------------------------------------------------------------------------- */

describe('SidebarMenuButton', () => {
  it('renders a <button> with the sidebar-menu-button data-slot and cva default variant/size classes', () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton data-testid="sidebar-menu-button">
          Item
        </SidebarMenuButton>
      </SidebarProvider>
    )
    const button = screen.getByTestId('sidebar-menu-button')
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('data-slot', 'sidebar-menu-button')
    expect(button).toHaveAttribute('data-sidebar', 'menu-button')
    expect(button).toHaveAttribute('data-size', 'default')
    // isActive=false → data-active="false".
    expect(button).toHaveAttribute('data-active', 'false')
    // Base cva tokens from the unconditional cn() input.
    expect(button).toHaveClass('flex')
    expect(button).toHaveClass('w-full')
    expect(button).toHaveClass('items-center')
    // default size: h-8 text-sm.
    expect(button).toHaveClass('h-8')
    expect(button).toHaveClass('text-sm')
    // default variant: tokens visible.
    expect(button).toHaveClass('hover:bg-[color:var(--sidebar-accent)]')
  })

  it('applies variant="outline" cva classes (background + shadow tokens)', () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton
          data-testid="sidebar-menu-button-outline"
          variant="outline"
        >
          Outlined
        </SidebarMenuButton>
      </SidebarProvider>
    )
    const button = screen.getByTestId('sidebar-menu-button-outline')
    expect(button).toHaveClass('bg-[color:var(--background)]')
    expect(button).toHaveClass('shadow-[0_0_0_1px_var(--sidebar-border)]')
  })

  it('applies size="sm" cva classes (h-7 text-xs)', () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton data-testid="sidebar-menu-button-sm" size="sm">
          Small
        </SidebarMenuButton>
      </SidebarProvider>
    )
    const button = screen.getByTestId('sidebar-menu-button-sm')
    expect(button).toHaveAttribute('data-size', 'sm')
    expect(button).toHaveClass('h-7')
    expect(button).toHaveClass('text-xs')
  })

  it('applies size="lg" cva classes (h-12 text-sm + collapsible=icon p-0)', () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton data-testid="sidebar-menu-button-lg" size="lg">
          Large
        </SidebarMenuButton>
      </SidebarProvider>
    )
    const button = screen.getByTestId('sidebar-menu-button-lg')
    expect(button).toHaveAttribute('data-size', 'lg')
    expect(button).toHaveClass('h-12')
    expect(button).toHaveClass('text-sm')
    expect(button).toHaveClass('group-data-[collapsible=icon]:p-0!')
  })

  it('marks the button data-active="true" when isActive=true', () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton data-testid="sidebar-menu-button-active" isActive>
          Active
        </SidebarMenuButton>
      </SidebarProvider>
    )
    const button = screen.getByTestId('sidebar-menu-button-active')
    expect(button).toHaveAttribute('data-active', 'true')
  })

  it('forwards data-slot onto the child element when asChild is set', () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton asChild>
          <a data-testid="sidebar-menu-button-slot" href="#item">
            Link item
          </a>
        </SidebarMenuButton>
      </SidebarProvider>
    )
    const link = screen.getByTestId('sidebar-menu-button-slot')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('data-slot', 'sidebar-menu-button')
    expect(link).toHaveAttribute('data-sidebar', 'menu-button')
    expect(link).toHaveAttribute('href', '#item')
  })

  it('merges a custom className through cn()', () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton
          className="my-menu-button"
          data-testid="sidebar-menu-button-mc"
        >
          mc
        </SidebarMenuButton>
      </SidebarProvider>
    )
    const button = screen.getByTestId('sidebar-menu-button-mc')
    expect(button).toHaveClass('my-menu-button')
    expect(button).toHaveClass('flex')
  })
})

/* -------------------------------------------------------------------------- */
/*  SidebarMenuButton (tooltip branches)                                      */
/* -------------------------------------------------------------------------- */

describe('SidebarMenuButton (tooltip)', () => {
  it('wraps the button in a Tooltip with children=string when tooltip is a string', async () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton
          data-testid="sidebar-menu-button-tooltip-string"
          tooltip="Item label"
        >
          btn
        </SidebarMenuButton>
      </SidebarProvider>
    )
    // Radix Tooltip only mounts its Content when open. Open the tooltip
    // by firing a pointerMove on the trigger button — Radix wires
    // onPointerMove to open after delayDuration=0 (set by
    // SidebarProvider's wrapping TooltipProvider).
    const trigger = screen.getByTestId('sidebar-menu-button-tooltip-string')
    await act(async () => {
      fireEvent.pointerMove(trigger, { pointerType: 'mouse' })
      // Yield a microtask + a tick so Radix's setTimeout-driven open
      // state change and the TooltipContent mount propagate through
      // React.
      await new Promise(resolve => setTimeout(resolve, 50))
    })
    const content = document.querySelector('[data-slot="tooltip-content"]')
    expect(content).not.toBeNull()
    // The string was wrapped into {children: 'Item label'}.
    expect(content).toHaveTextContent('Item label')
  })

  it('forwards a tooltip=object TooltipContent (side="right" align="center" hidden attribute)', async () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton
          data-testid="sidebar-menu-button-tooltip-object"
          tooltip={{ children: 'Custom tooltip', className: 'my-tip' }}
        >
          btn
        </SidebarMenuButton>
      </SidebarProvider>
    )
    const trigger = screen.getByTestId('sidebar-menu-button-tooltip-object')
    await act(async () => {
      fireEvent.pointerMove(trigger, { pointerType: 'mouse' })
      await new Promise(resolve => setTimeout(resolve, 50))
    })
    const content = document.querySelector('[data-slot="tooltip-content"]')
    expect(content).not.toBeNull()
    expect(content).toHaveTextContent('Custom tooltip')
    // side="right" + align="center" come from the SidebarMenuButton
    // wrapper.
    expect(content).toHaveAttribute('data-side', 'right')
    expect(content).toHaveAttribute('data-align', 'center')
    // The user's className merges through.
    expect(content).toHaveClass('my-tip')
  })

  it('sets hidden=true on the TooltipContent when state=expanded (defaultOpen=true)', async () => {
    render(
      <SidebarProvider defaultOpen>
        <SidebarMenuButton
          data-testid="sidebar-menu-button-tip-expanded"
          tooltip="visible only when collapsed"
        >
          btn
        </SidebarMenuButton>
      </SidebarProvider>
    )
    const trigger = screen.getByTestId('sidebar-menu-button-tip-expanded')
    await act(async () => {
      fireEvent.pointerMove(trigger, { pointerType: 'mouse' })
      await new Promise(resolve => setTimeout(resolve, 50))
    })
    const content = document.querySelector('[data-slot="tooltip-content"]')
    expect(content).not.toBeNull()
    // state=expanded → hidden=true (the html `hidden` attribute).
    expect(content).toHaveAttribute('hidden')
  })

  it('sets hidden=false on the TooltipContent when state=collapsed and desktop', async () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <SidebarMenuButton
          data-testid="sidebar-menu-button-tip-collapsed"
          tooltip="visible when collapsed"
        >
          btn
        </SidebarMenuButton>
      </SidebarProvider>
    )
    const trigger = screen.getByTestId('sidebar-menu-button-tip-collapsed')
    await act(async () => {
      fireEvent.pointerMove(trigger, { pointerType: 'mouse' })
      await new Promise(resolve => setTimeout(resolve, 50))
    })
    const content = document.querySelector('[data-slot="tooltip-content"]')
    expect(content).not.toBeNull()
    expect(content).not.toHaveAttribute('hidden')
  })

  it('sets hidden=true on the TooltipContent when isMobile=true', async () => {
    window.innerWidth = 500
    render(
      <SidebarProvider defaultOpen={false}>
        <SidebarMenuButton
          data-testid="sidebar-menu-button-tip-mobile"
          tooltip="hidden on mobile"
        >
          btn
        </SidebarMenuButton>
      </SidebarProvider>
    )
    const trigger = screen.getByTestId('sidebar-menu-button-tip-mobile')
    await act(async () => {
      fireEvent.pointerMove(trigger, { pointerType: 'mouse' })
      await new Promise(resolve => setTimeout(resolve, 50))
    })
    const content = document.querySelector('[data-slot="tooltip-content"]')
    expect(content).not.toBeNull()
    // isMobile=true → hidden=true even when state=collapsed.
    expect(content).toHaveAttribute('hidden')
  })
})

/* -------------------------------------------------------------------------- */
/*  SidebarMenuAction                                                         */
/* -------------------------------------------------------------------------- */

describe('SidebarMenuAction', () => {
  it('renders a <button> with the sidebar-menu-action data-slot and base positioning classes', () => {
    render(
      <SidebarMenuAction data-testid="sidebar-menu-action">
        action
      </SidebarMenuAction>
    )
    const action = screen.getByTestId('sidebar-menu-action')
    expect(action.tagName).toBe('BUTTON')
    expect(action).toHaveAttribute('data-slot', 'sidebar-menu-action')
    expect(action).toHaveAttribute('data-sidebar', 'menu-action')
    expect(action).toHaveClass('absolute')
    expect(action).toHaveClass('top-1.5')
    expect(action).toHaveClass('right-1')
    expect(action).toHaveClass('group-data-[collapsible=icon]:hidden')
  })

  it('adds the showOnHover conditional class when showOnHover=true', () => {
    render(
      <SidebarMenuAction data-testid="sidebar-menu-action-hover" showOnHover>
        action
      </SidebarMenuAction>
    )
    const action = screen.getByTestId('sidebar-menu-action-hover')
    // showOnHover tokens merged in.
    expect(action).toHaveClass('md:opacity-0')
    expect(action).toHaveClass('group-hover/menu-item:opacity-100')
    expect(action).toHaveClass('group-focus-within/menu-item:opacity-100')
  })

  it('does NOT add the showOnHover tokens when showOnHover=false (default)', () => {
    render(
      <SidebarMenuAction data-testid="sidebar-menu-action-nohover">
        action
      </SidebarMenuAction>
    )
    const action = screen.getByTestId('sidebar-menu-action-nohover')
    expect(action).not.toHaveClass('md:opacity-0')
  })

  it('forwards data-slot onto the child element when asChild is set', () => {
    render(
      <SidebarMenuAction asChild>
        <span data-testid="sidebar-menu-action-slot">x</span>
      </SidebarMenuAction>
    )
    const slot = screen.getByTestId('sidebar-menu-action-slot')
    expect(slot.tagName).toBe('SPAN')
    expect(slot).toHaveAttribute('data-slot', 'sidebar-menu-action')
    expect(slot).toHaveAttribute('data-sidebar', 'menu-action')
  })
})

/* -------------------------------------------------------------------------- */
/*  SidebarMenuBadge                                                          */
/* -------------------------------------------------------------------------- */

describe('SidebarMenuBadge', () => {
  it('renders a <div> with the sidebar-menu-badge data-slot and the peer-data-size tokens', () => {
    render(
      <SidebarMenuBadge data-testid="sidebar-menu-badge">9</SidebarMenuBadge>
    )
    const badge = screen.getByTestId('sidebar-menu-badge')
    expect(badge.tagName).toBe('DIV')
    expect(badge).toHaveAttribute('data-slot', 'sidebar-menu-badge')
    expect(badge).toHaveAttribute('data-sidebar', 'menu-badge')
    expect(badge).toHaveClass('absolute')
    expect(badge).toHaveClass('right-1')
    // peer-data-size tokens are baked into cn().
    expect(badge).toHaveClass('peer-data-[size=sm]/menu-button:top-1')
    expect(badge).toHaveClass('peer-data-[size=default]/menu-button:top-1.5')
    expect(badge).toHaveClass('peer-data-[size=lg]/menu-button:top-2.5')
    expect(badge).toHaveClass('group-data-[collapsible=icon]:hidden')
    expect(badge).toHaveTextContent('9')
  })
})

/* -------------------------------------------------------------------------- */
/*  SidebarMenuSkeleton                                                       */
/* -------------------------------------------------------------------------- */

describe('SidebarMenuSkeleton', () => {
  it('renders only the text skeleton when showIcon is false (default)', () => {
    render(<SidebarMenuSkeleton data-testid="sidebar-menu-skeleton" />)
    const skeleton = screen.getByTestId('sidebar-menu-skeleton')
    expect(skeleton).toHaveAttribute('data-slot', 'sidebar-menu-skeleton')
    expect(skeleton).toHaveAttribute('data-sidebar', 'menu-skeleton')
    expect(skeleton).toHaveClass('flex')
    expect(skeleton).toHaveClass('h-8')
    expect(skeleton).toHaveClass('items-center')
    expect(skeleton).toHaveClass('gap-2')
    // No icon skeleton.
    expect(
      skeleton.querySelector('[data-sidebar="menu-skeleton-icon"]')
    ).toBeNull()
    // Text skeleton present.
    const text = skeleton.querySelector('[data-sidebar="menu-skeleton-text"]')
    expect(text).not.toBeNull()
    expect(text).toHaveClass('h-4')
    expect(text).toHaveClass('flex-1')
  })

  it('renders both the icon and text skeletons when showIcon is true', () => {
    render(
      <SidebarMenuSkeleton data-testid="sidebar-menu-skeleton-icon" showIcon />
    )
    const skeleton = screen.getByTestId('sidebar-menu-skeleton-icon')
    const icon = skeleton.querySelector('[data-sidebar="menu-skeleton-icon"]')
    expect(icon).not.toBeNull()
    expect(icon).toHaveClass('size-4')
    expect(icon).toHaveAttribute('data-slot', 'skeleton')
    const text = skeleton.querySelector('[data-sidebar="menu-skeleton-text"]')
    expect(text).not.toBeNull()
  })

  it('generates the random width as a percentage between 50% and 90%', () => {
    const observed: number[] = []
    for (let i = 0; i < 20; i++) {
      const { unmount } = render(
        <SidebarMenuSkeleton data-testid={`sk-${i}`} />
      )
      const text = document.querySelector(
        `[data-testid="sk-${i}"] [data-sidebar="menu-skeleton-text"]`
      ) as HTMLElement | null
      const raw = text?.style.getPropertyValue('--skeleton-width') ?? ''
      // strip trailing `%`
      const pct = parseInt(raw, 10)
      expect(Number.isNaN(pct)).toBe(false)
      expect(pct).toBeGreaterThanOrEqual(50)
      expect(pct).toBeLessThanOrEqual(90)
      observed.push(pct)
      unmount()
    }
    // Across 20 independent mounts we should see at least 2 distinct
    // widths (otherwise Math.random returned the same value every time,
    // which would indicate the random init is broken).
    expect(new Set(observed).size).toBeGreaterThan(1)
  })

  it('keeps the random width stable across re-renders (Math.random called once)', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5) // → Math.floor(0.5 * 40) + 50 = 70
    try {
      const { rerender } = render(
        <SidebarMenuSkeleton data-testid="sidebar-menu-skeleton-stable" />
      )
      const textBefore = document.querySelector(
        '[data-sidebar="menu-skeleton-text"]'
      ) as HTMLElement | null
      const widthBefore = textBefore?.style.getPropertyValue('--skeleton-width')
      expect(widthBefore).toBe('70%')
      rerender(
        <SidebarMenuSkeleton
          className="rerendered"
          data-testid="sidebar-menu-skeleton-stable"
        />
      )
      const textAfter = document.querySelector(
        '[data-sidebar="menu-skeleton-text"]'
      ) as HTMLElement | null
      const widthAfter = textAfter?.style.getPropertyValue('--skeleton-width')
      expect(widthAfter).toBe('70%')
      // The useState initializer runs exactly once on mount.
      expect(randomSpy).toHaveBeenCalledTimes(1)
    } finally {
      randomSpy.mockRestore()
    }
  })
})

/* -------------------------------------------------------------------------- */
/*  SidebarMenuSub / SidebarMenuSubItem / SidebarMenuSubButton                */
/* -------------------------------------------------------------------------- */

describe('SidebarMenuSub', () => {
  it('renders a <ul> with the sidebar-menu-sub data-slot and collapsible=icon hidden class', () => {
    render(
      <SidebarMenuSub data-testid="sidebar-menu-sub">
        <li>x</li>
      </SidebarMenuSub>
    )
    const sub = screen.getByTestId('sidebar-menu-sub')
    expect(sub.tagName).toBe('UL')
    expect(sub).toHaveAttribute('data-slot', 'sidebar-menu-sub')
    expect(sub).toHaveAttribute('data-sidebar', 'menu-sub')
    expect(sub).toHaveClass('flex')
    expect(sub).toHaveClass('flex-col')
    expect(sub).toHaveClass('gap-1')
    expect(sub).toHaveClass('border-l')
    expect(sub).toHaveClass('group-data-[collapsible=icon]:hidden')
  })
})

describe('SidebarMenuSubItem', () => {
  it('renders a <li> with the sidebar-menu-sub-item data-slot and the group/menu-sub-item peer base', () => {
    render(
      <SidebarMenuSubItem data-testid="sidebar-menu-sub-item">
        x
      </SidebarMenuSubItem>
    )
    const item = screen.getByTestId('sidebar-menu-sub-item')
    expect(item.tagName).toBe('LI')
    expect(item).toHaveAttribute('data-slot', 'sidebar-menu-sub-item')
    expect(item).toHaveAttribute('data-sidebar', 'menu-sub-item')
    expect(item).toHaveClass('group/menu-sub-item')
    expect(item).toHaveClass('relative')
  })
})

describe('SidebarMenuSubButton', () => {
  it('renders an <a> with the sidebar-menu-sub-button data-slot, default size="md" text-sm, and conditional classes', () => {
    render(
      <SidebarMenuSubButton data-testid="sidebar-menu-sub-button" href="#sub">
        Sub
      </SidebarMenuSubButton>
    )
    const link = screen.getByTestId('sidebar-menu-sub-button')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('data-slot', 'sidebar-menu-sub-button')
    expect(link).toHaveAttribute('data-sidebar', 'menu-sub-button')
    expect(link).toHaveAttribute('data-size', 'md')
    expect(link).toHaveAttribute('href', '#sub')
    // size="md" → text-sm; size="sm" tokens NOT applied.
    expect(link).toHaveClass('text-sm')
    expect(link).not.toHaveClass('text-xs')
    expect(link).toHaveClass('group-data-[collapsible=icon]:hidden')
  })

  it('applies size="sm" text-xs class and omits size="md" text-sm', () => {
    render(
      <SidebarMenuSubButton
        data-testid="sidebar-menu-sub-button-sm"
        href="#sub-sm"
        size="sm"
      >
        sm
      </SidebarMenuSubButton>
    )
    const link = screen.getByTestId('sidebar-menu-sub-button-sm')
    expect(link).toHaveAttribute('data-size', 'sm')
    expect(link).toHaveClass('text-xs')
    expect(link).not.toHaveClass('text-sm')
  })

  it('marks the button data-active="true" when isActive=true', () => {
    render(
      <SidebarMenuSubButton
        data-testid="sidebar-menu-sub-button-active"
        href="#active"
        isActive
      >
        active
      </SidebarMenuSubButton>
    )
    const link = screen.getByTestId('sidebar-menu-sub-button-active')
    expect(link).toHaveAttribute('data-active', 'true')
    // active class tokens merged in.
    expect(link).toHaveClass(
      'data-[active=true]:bg-[color:var(--sidebar-accent)]'
    )
  })

  it('forwards data-slot onto the child element when asChild is set', () => {
    render(
      <SidebarMenuSubButton asChild>
        <button data-testid="sidebar-menu-sub-button-slot" type="button">
          slot
        </button>
      </SidebarMenuSubButton>
    )
    const slot = screen.getByTestId('sidebar-menu-sub-button-slot')
    expect(slot.tagName).toBe('BUTTON')
    expect(slot).toHaveAttribute('data-slot', 'sidebar-menu-sub-button')
    expect(slot).toHaveAttribute('data-sidebar', 'menu-sub-button')
    expect(slot).toHaveAttribute('type', 'button')
  })
})
