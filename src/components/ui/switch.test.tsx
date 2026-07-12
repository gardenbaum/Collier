import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { Switch } from './switch'

/**
 * These tests cover the Switch primitive declared in
 * src/components/ui/switch.tsx (currently 0% coverage).
 *
 * Switch is a single function component that:
 *  - renders a Radix `SwitchPrimitive.Root` (which itself renders a
 *    real `<button>` with `role="switch"`) decorated with
 *    `data-slot="switch"` and a long `cn()`-merged className string
 *  - nests a Radix `SwitchPrimitive.Thumb` with `data-slot="switch-thumb"`
 *    and its own `cn()`-merged className string
 *  - exposes a `className` prop that is merged via `cn()` alongside the
 *    shared base classes
 *  - forwards arbitrary Root props (id, aria-*, name, value,
 *    onCheckedChange, disabled, …) onto the rendered button
 *
 * Implementation note about state-conditional classes: unlike the
 * cva-driven Badge or Alert (which return a DIFFERENT class string
 * per variant), Switch's cn() call concatenates ALL classes for BOTH
 * the unchecked and checked states into a single string and relies on
 * tailwind's `data-[state=…]:` selectors to activate the right rule at
 * runtime. The actual selection happens via the `data-state` attribute
 * on the Root / Thumb, not via string-level className presence or
 * absence. So a test like "the checked bg class is NOT present on the
 * unchecked Root" would be a misconception of the implementation —
 * the className token is ALWAYS present, only its CSS rule is gated.
 *
 * Tests therefore assert:
 *  - the unconditional base layout / focus / disabled classes are
 *    present on the Root (and Thumb) for every render
 *  - both state-conditional class tokens are present in the
 *    className string for the Root and Thumb (this is what cn()
 *    produces — the runtime CSS rule is gated via `data-state`)
 *  - the `data-state` attribute on the Root and Thumb reflects the
 *    actual checked/unchecked state being rendered
 *  - aria-checked reflects the same state for assistive tech
 *
 * The "default unchecked → checked, no cva branches" structure means
 * this file uses a single describe-block per behaviour axis (mirrors
 * the structural test/skeleton-spinner-kbd pattern, which also wraps
 * a single Radix primitive without cva variants).
 */

describe('Switch', () => {
  describe('default unchecked rendering', () => {
    it('renders a single switch button with data-slot="switch", role="switch", data-state="unchecked", and the shared base classes', () => {
      const { container } = render(<Switch data-testid="switch-default" />)

      const root = screen.getByTestId('switch-default')
      expect(container.children).toHaveLength(1)
      // Radix SwitchPrimitive.Root renders as a real <button>.
      expect(root.tagName).toBe('BUTTON')
      expect(root).toHaveAttribute('data-slot', 'switch')
      expect(root).toHaveAttribute('role', 'switch')
      expect(root).toHaveAttribute('data-state', 'unchecked')
      expect(root).toHaveAttribute('aria-checked', 'false')

      // Representative base classes from the cn() call. We don't
      // enumerate every single one (the string is ~22 tokens long),
      // just enough to lock in the structural classes.
      expect(root).toHaveClass('peer')
      expect(root).toHaveClass('inline-flex')
      expect(root).toHaveClass('h-[1.15rem]')
      expect(root).toHaveClass('w-8')
      expect(root).toHaveClass('shrink-0')
      expect(root).toHaveClass('items-center')
      expect(root).toHaveClass('rounded-full')
      expect(root).toHaveClass('border')
      expect(root).toHaveClass('border-transparent')
      expect(root).toHaveClass('shadow-xs')
      expect(root).toHaveClass('transition-all')
      expect(root).toHaveClass('outline-none')

      // focus-visible ring utilities always present.
      expect(root).toHaveClass('focus-visible:ring-2')
      expect(root).toHaveClass('focus-visible:ring-[color:var(--ring)]')
      expect(root).toHaveClass('focus-visible:ring-offset-2')
      expect(root).toHaveClass(
        'focus-visible:ring-offset-[color:var(--background)]'
      )

      // Both state-conditional bg class tokens are present in the
      // cn()-merged className (the runtime selection happens via the
      // `data-state` attribute, not via string-level presence).
      expect(root).toHaveClass('data-[state=unchecked]:bg-[color:var(--input)]')
      expect(root).toHaveClass('data-[state=checked]:bg-[color:var(--primary)]')
    })

    it('renders a single Thumb child carrying data-slot="switch-thumb", the thumb base classes, and BOTH state-conditional translate tokens', () => {
      const { container } = render(<Switch data-testid="switch-default" />)

      const thumb = container.querySelector('[data-slot="switch-thumb"]')
      expect(thumb).not.toBeNull()
      expect(thumb).toBeInstanceOf(HTMLElement)
      expect(thumb).toHaveAttribute('data-slot', 'switch-thumb')
      // Radix SwitchPrimitive.Thumb renders an unstyled <span>.
      expect(thumb?.tagName).toBe('SPAN')
      // Unchecked state propagates to the thumb too.
      expect(thumb).toHaveAttribute('data-state', 'unchecked')

      // Representative thumb base classes from the cn() call.
      expect(thumb).toHaveClass('bg-[color:var(--background)]')
      expect(thumb).toHaveClass('pointer-events-none')
      expect(thumb).toHaveClass('block')
      expect(thumb).toHaveClass('size-4')
      expect(thumb).toHaveClass('rounded-full')
      expect(thumb).toHaveClass('ring-0')
      expect(thumb).toHaveClass('transition-transform')

      // Both state-conditional translate tokens are always in the
      // thumb className (cn() concatenates them unconditionally; the
      // actual selection is via tailwind + the data-state attribute).
      expect(thumb).toHaveClass('data-[state=unchecked]:translate-x-0')
      expect(thumb).toHaveClass(
        'data-[state=checked]:translate-x-[calc(100%-2px)]'
      )
      // And the checked thumb bg class is also always present.
      expect(thumb).toHaveClass(
        'data-[state=checked]:bg-[color:var(--primary-foreground)]'
      )
    })
  })

  describe('checked state', () => {
    it('renders the Root with data-state="checked", aria-checked="true" — base classes remain identical to the unchecked path', () => {
      render(<Switch checked data-testid="switch-checked" />)

      const root = screen.getByTestId('switch-checked')
      expect(root.tagName).toBe('BUTTON')
      expect(root).toHaveAttribute('data-slot', 'switch')
      expect(root).toHaveAttribute('role', 'switch')
      expect(root).toHaveAttribute('data-state', 'checked')
      expect(root).toHaveAttribute('aria-checked', 'true')

      // The checked bg class is still present in the className
      // (cn() is stateless — both tokens live in the same string).
      expect(root).toHaveClass('data-[state=checked]:bg-[color:var(--primary)]')
      // The unchecked bg class is also still present in the
      // className — it just does not activate under data-state="checked".
      expect(root).toHaveClass('data-[state=unchecked]:bg-[color:var(--input)]')

      // Base layout / focus / ring classes are unchanged.
      expect(root).toHaveClass('peer')
      expect(root).toHaveClass('rounded-full')
      expect(root).toHaveClass('focus-visible:ring-2')
    })

    it('renders the Thumb with data-state="checked" — base classes remain identical to the unchecked thumb', () => {
      const { container } = render(<Switch checked />)

      const thumb = container.querySelector('[data-slot="switch-thumb"]')
      expect(thumb).not.toBeNull()
      expect(thumb).toHaveAttribute('data-slot', 'switch-thumb')
      expect(thumb).toHaveAttribute('data-state', 'checked')

      // Both state-conditional bg + translate tokens remain in the
      // className (cn() is stateless — see comment at the top).
      expect(thumb).toHaveClass(
        'data-[state=checked]:bg-[color:var(--primary-foreground)]'
      )
      expect(thumb).toHaveClass(
        'data-[state=checked]:translate-x-[calc(100%-2px)]'
      )
      expect(thumb).toHaveClass('data-[state=unchecked]:translate-x-0')

      // Base thumb classes are unchanged.
      expect(thumb).toHaveClass('bg-[color:var(--background)]')
      expect(thumb).toHaveClass('size-4')
      expect(thumb).toHaveClass('rounded-full')
      expect(thumb).toHaveClass('transition-transform')
    })

    it('also works under defaultChecked (uncontrolled checked initial state)', () => {
      const { container } = render(
        <Switch defaultChecked data-testid="switch-default-checked" />
      )

      const root = screen.getByTestId('switch-default-checked')
      expect(root).toHaveAttribute('data-state', 'checked')

      const thumb = container.querySelector('[data-slot="switch-thumb"]')
      expect(thumb).toHaveAttribute('data-state', 'checked')
      // The thumb translate token is still in className (cn() does
      // not gate it — tailwind does, via data-state).
      expect(thumb).toHaveClass(
        'data-[state=checked]:translate-x-[calc(100%-2px)]'
      )
    })
  })

  describe('disabled state', () => {
    it('renders the Root with the disabled attribute and the disabled-state classes (no checked-state activation)', () => {
      render(<Switch disabled data-testid="switch-disabled" />)

      const root = screen.getByTestId('switch-disabled')
      // Radix Switch forwards `disabled` onto the underlying button.
      expect(root.tagName).toBe('BUTTON')
      expect(root).toBeDisabled()
      expect(root).toHaveAttribute('data-slot', 'switch')
      // Disabled root is unchecked by default; data-state stays "unchecked".
      expect(root).toHaveAttribute('data-state', 'unchecked')
      expect(root).toHaveClass('disabled:cursor-not-allowed')
      expect(root).toHaveClass('disabled:opacity-50')

      // Both state-conditional bg class tokens are still in the
      // className (cn() concatenates them unconditionally — see the
      // implementation note at the top of this file). The unchecked
      // one is the one that activates under data-state="unchecked".
      expect(root).toHaveClass('data-[state=unchecked]:bg-[color:var(--input)]')
      expect(root).toHaveClass('data-[state=checked]:bg-[color:var(--primary)]')
    })

    it('still renders the Thumb child even when disabled', () => {
      const { container } = render(<Switch disabled />)

      const thumb = container.querySelector('[data-slot="switch-thumb"]')
      expect(thumb).not.toBeNull()
      expect(thumb).toHaveAttribute('data-slot', 'switch-thumb')
      expect(thumb).toHaveAttribute('data-state', 'unchecked')
      // Thumb base classes are unaffected by `disabled`.
      expect(thumb).toHaveClass('pointer-events-none')
      expect(thumb).toHaveClass('size-4')
      expect(thumb).toHaveClass('rounded-full')
    })
  })

  describe('className merge', () => {
    it('merges a custom className into the Root className alongside the shared base classes', () => {
      render(
        <Switch className="custom-switch-class" data-testid="switch-custom" />
      )

      const root = screen.getByTestId('switch-custom')
      // cn() merges both — the custom class lands on the same class
      // string as the base layout / focus classes.
      expect(root).toHaveClass('custom-switch-class')
      expect(root).toHaveClass('peer')
      expect(root).toHaveClass('rounded-full')
      expect(root).toHaveClass('transition-all')
      // State-conditional bg class tokens remain in className.
      expect(root).toHaveClass('data-[state=unchecked]:bg-[color:var(--input)]')
      expect(root).toHaveClass('data-[state=checked]:bg-[color:var(--primary)]')
    })

    it('keeps the unchecked-state behaviour intact when a custom className is provided (data-state stays "unchecked")', () => {
      const { container } = render(
        <Switch className="custom-switch-class" data-testid="switch-custom" />
      )

      const root = screen.getByTestId('switch-custom')
      expect(root).toHaveClass('custom-switch-class')
      // data-state still reports the underlying state — className does
      // not flip it.
      expect(root).toHaveAttribute('data-state', 'unchecked')

      const thumb = container.querySelector('[data-slot="switch-thumb"]')
      expect(thumb).toHaveClass('size-4')
      // Both translate tokens remain; cn() is stateless.
      expect(thumb).toHaveClass('data-[state=unchecked]:translate-x-0')
      expect(thumb).toHaveClass(
        'data-[state=checked]:translate-x-[calc(100%-2px)]'
      )
    })
  })

  describe('props forwarding', () => {
    it('forwards id, aria-label, value, and data-* props onto the Root button', () => {
      render(
        <Switch
          aria-label="Toggle dark mode"
          data-custom="custom-value"
          data-testid="switch-forwarded"
          id="theme-switch"
          value="on"
        />
      )

      const root = screen.getByTestId('switch-forwarded')
      expect(root.tagName).toBe('BUTTON')
      expect(root).toHaveAttribute('id', 'theme-switch')
      expect(root).toHaveAttribute('aria-label', 'Toggle dark mode')
      expect(root).toHaveAttribute('value', 'on')
      expect(root).toHaveAttribute('data-custom', 'custom-value')
    })

    it('attaches a hidden checkbox <input> sibling carrying `name` and `value` when rendered inside a <form>', () => {
      // Radix Switch picks up `name`/`value` from its Root props and
      // renders a hidden `<input type="checkbox">` sibling so the
      // switch participates in native form submission. The hidden
      // input is only emitted when Radix detects a `<form>` ancestor,
      // so we wrap the Switch in one to exercise the path.
      //
      // jsdom does not implement ResizeObserver. Radix Switch uses one
      // internally (via @radix-ui/react-use-size) when a hidden input
      // is rendered — stub it out so the layout effect stays quiet.
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
      const originalResizeObserver = globalThis.ResizeObserver
      globalThis.ResizeObserver =
        ResizeObserverStub as unknown as typeof ResizeObserver
      try {
        const { container } = render(
          <form>
            <Switch data-testid="switch-form" name="dark-mode" value="on" />
          </form>
        )

        const root = screen.getByTestId('switch-form')
        // The button itself does NOT carry the `name` attribute (it is
        // lifted to the hidden input Radix renders for form
        // submission). `value` is duplicated on the button too.
        expect(root).not.toHaveAttribute('name')
        expect(root).toHaveAttribute('value', 'on')

        // The hidden <input type="checkbox"> sibling carries the
        // form-related props Radix lifted off the Root.
        const hiddenInput = container.querySelector(
          'input[type="checkbox"]'
        ) as HTMLInputElement | null
        expect(hiddenInput).not.toBeNull()
        expect(hiddenInput).toHaveAttribute('name', 'dark-mode')
        expect(hiddenInput).toHaveAttribute('value', 'on')
        expect(hiddenInput).toHaveAttribute('aria-hidden', 'true')
        expect(hiddenInput).toHaveAttribute('tabindex', '-1')
      } finally {
        globalThis.ResizeObserver = originalResizeObserver
      }
    })

    it('invokes onCheckedChange when the Root is clicked, with the new checked state', () => {
      const handleChange = vi.fn()
      render(
        <Switch
          data-testid="switch-interactive"
          onCheckedChange={handleChange}
        />
      )

      const root = screen.getByTestId('switch-interactive')
      expect(root).toHaveAttribute('data-state', 'unchecked')

      fireEvent.click(root)
      // Radix's onCheckedChange callback receives the new checked value
      // as its first argument.
      expect(handleChange).toHaveBeenCalledTimes(1)
      expect(handleChange.mock.calls[0]?.[0]).toBe(true)

      // The Root flips to checked after the click.
      expect(root).toHaveAttribute('data-state', 'checked')
    })

    it('does not invoke onCheckedChange on a disabled switch click', () => {
      const handleChange = vi.fn()
      render(
        <Switch
          data-testid="switch-disabled-interactive"
          disabled
          onCheckedChange={handleChange}
        />
      )

      const root = screen.getByTestId('switch-disabled-interactive')
      fireEvent.click(root)
      // Radix swallows click events on a disabled Root — the handler
      // is NOT called and the state stays unchecked.
      expect(handleChange).not.toHaveBeenCalled()
      expect(root).toHaveAttribute('data-state', 'unchecked')
    })
  })

  describe('Thumb rendering in checked vs unchecked states', () => {
    it('Thumb carries data-state="unchecked" for an unchecked Root', () => {
      const { container } = render(<Switch data-testid="unchecked-root" />)

      const root = screen.getByTestId('unchecked-root')
      expect(root).toHaveAttribute('data-state', 'unchecked')

      const thumb = container.querySelector('[data-slot="switch-thumb"]')
      expect(thumb).toHaveAttribute('data-slot', 'switch-thumb')
      expect(thumb).toHaveAttribute('data-state', 'unchecked')
      // Base thumb classes are unchanged across states.
      expect(thumb).toHaveClass('pointer-events-none')
      expect(thumb).toHaveClass('size-4')
      expect(thumb).toHaveClass('rounded-full')
      expect(thumb).toHaveClass('transition-transform')
    })

    it('Thumb carries data-state="checked" for a checked Root', () => {
      const { container } = render(
        <Switch checked data-testid="checked-root" />
      )

      const root = screen.getByTestId('checked-root')
      expect(root).toHaveAttribute('data-state', 'checked')

      const thumb = container.querySelector('[data-slot="switch-thumb"]')
      expect(thumb).toHaveAttribute('data-slot', 'switch-thumb')
      expect(thumb).toHaveAttribute('data-state', 'checked')
      // Base thumb classes are unchanged across states.
      expect(thumb).toHaveClass('pointer-events-none')
      expect(thumb).toHaveClass('size-4')
      expect(thumb).toHaveClass('rounded-full')
      expect(thumb).toHaveClass('transition-transform')
    })

    it('Thumb base className string is byte-for-byte identical between unchecked and checked renders (cn() is stateless across state)', () => {
      const { container: uncheckedContainer } = render(
        <Switch data-testid="u" />
      )
      const { container: checkedContainer } = render(
        <Switch checked data-testid="c" />
      )

      const uncheckedThumb = uncheckedContainer.querySelector(
        '[data-slot="switch-thumb"]'
      )
      const checkedThumb = checkedContainer.querySelector(
        '[data-slot="switch-thumb"]'
      )

      // cn() concatenates the same string regardless of state — the
      // only thing that flips between unchecked and checked renders
      // is the data-state attribute on the Root / Thumb.
      expect(uncheckedThumb?.className).toBe(checkedThumb?.className)
    })
  })
})
