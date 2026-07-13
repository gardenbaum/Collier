import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { Checkbox } from './checkbox'

/**
 * These tests cover the Checkbox primitive declared in
 * src/components/ui/checkbox.tsx (currently 0% coverage).
 *
 * Checkbox is a single function component that:
 *  - renders a Radix `CheckboxPrimitive.Root` (which itself renders a
 *    real `<button type="button" role="checkbox">`) decorated with
 *    `data-slot="checkbox"` and a long `cn()`-merged className string
 *  - nests a Radix `CheckboxPrimitive.Indicator` with
 *    `data-slot="checkbox-indicator"` (rendered via `<Presence>` — DOM
 *    is only emitted when checked or indeterminate) and a
 *    `cn()`-merged className plus an inline `pointerEvents: "none"`
 *    style
 *  - inside the Indicator, renders a `<CheckIcon>` from lucide-react
 *    (an `<svg>` with the icon's own `size-3.5` className)
 *  - exposes a `className` prop that is merged via `cn()` alongside
 *    the shared base classes
 *  - forwards arbitrary Root props (id, aria-*, name, value,
 *    onCheckedChange, disabled, required, defaultChecked, checked,
 *    …) onto the rendered button
 *
 * Implementation note about state-conditional classes: like Switch,
 * cn() concatenates ALL classes for BOTH the unchecked and checked
 * states (and the aria-invalid path) into a single string and relies
 * on tailwind's `data-[state=…]:` / `aria-invalid:` selectors to
 * activate the right rule at runtime. The actual selection happens
 * via the corresponding attribute on the Root, not via string-level
 * className presence or absence. So a test like "the checked bg
 * class is NOT present on the unchecked Root" would be a
 * misconception of the implementation — the className token is
 * ALWAYS present, only its CSS rule is gated.
 *
 * Tests therefore assert:
 *  - the unconditional base layout / focus / disabled classes are
 *    present on the Root for every render
 *  - the `data-[state=checked]:bg-…` class token is present in the
 *    cn()-merged className (always; runtime CSS rule gated on
 *    `data-state="checked"`)
 *  - the `aria-invalid:` class tokens are present in the
 *    cn()-merged className (always; runtime CSS rule gated on
 *    `aria-invalid="true"`)
 *  - the `data-state` attribute on the Root reflects the actual
 *    checked/unchecked state being rendered, and the Indicator span
 *    is only emitted (via Radix Presence) when checked or
 *    indeterminate
 *  - aria-checked reflects the same state for assistive tech
 *
 * The "default unchecked → checked, no cva branches" structure means
 * this file uses a single describe-block per behaviour axis (mirrors
 * the Switch.test pattern, which wraps a single Radix primitive
 * without cva variants).
 */

describe('Checkbox', () => {
  describe('default unchecked rendering', () => {
    it('renders a single checkbox button with data-slot="checkbox", role="checkbox", data-state="unchecked", and the shared base classes', () => {
      const { container } = render(<Checkbox data-testid="checkbox-default" />)

      const root = screen.getByTestId('checkbox-default')
      expect(container.children).toHaveLength(1)
      // Radix CheckboxPrimitive.Root renders as a real <button>.
      expect(root.tagName).toBe('BUTTON')
      expect(root).toHaveAttribute('type', 'button')
      expect(root).toHaveAttribute('data-slot', 'checkbox')
      expect(root).toHaveAttribute('role', 'checkbox')
      expect(root).toHaveAttribute('data-state', 'unchecked')
      expect(root).toHaveAttribute('aria-checked', 'false')

      // Representative base classes from the cn() call. We don't
      // enumerate every single one (the string is ~20 tokens long),
      // just enough to lock in the structural classes.
      expect(root).toHaveClass('peer')
      expect(root).toHaveClass('border')
      expect(root).toHaveClass('border-[color:var(--border)]')
      expect(root).toHaveClass('size-4')
      expect(root).toHaveClass('shrink-0')
      expect(root).toHaveClass('rounded-[4px]')
      expect(root).toHaveClass('shadow-xs')
      expect(root).toHaveClass('transition-shadow')
      expect(root).toHaveClass('outline-none')

      // focus-visible ring utilities always present.
      expect(root).toHaveClass('focus-visible:ring-2')
      expect(root).toHaveClass('focus-visible:ring-[color:var(--ring)]')
      expect(root).toHaveClass('focus-visible:ring-offset-2')
      expect(root).toHaveClass(
        'focus-visible:ring-offset-[color:var(--background)]'
      )

      // The checked-state activation class token is present in the
      // cn()-merged className (always; runtime CSS rule gated on
      // data-state="checked").
      expect(root).toHaveClass('data-[state=checked]:bg-[color:var(--primary)]')
      expect(root).toHaveClass(
        'data-[state=checked]:text-[color:var(--primary-foreground)]'
      )

      // The aria-invalid activation class tokens are also present in
      // the cn()-merged className (always; runtime CSS rule gated on
      // aria-invalid="true").
      expect(root).toHaveClass('aria-invalid:ring-[color:var(--destructive)]')
      expect(root).toHaveClass('aria-invalid:border-[color:var(--destructive)]')

      // Disabled-state class tokens are present in the className.
      expect(root).toHaveClass('disabled:cursor-not-allowed')
      expect(root).toHaveClass('disabled:opacity-50')
    })

    it('does NOT render the Indicator span (or its child CheckIcon) when unchecked — Radix Presence returns null', () => {
      const { container } = render(<Checkbox data-testid="checkbox-default" />)

      // The Indicator wraps its children in a Radix `<Presence>` that
      // only mounts when checked or indeterminate. For an unchecked
      // Checkbox, no Indicator span is emitted, and therefore the
      // CheckIcon SVG never renders either.
      const indicator = container.querySelector(
        '[data-slot="checkbox-indicator"]'
      )
      expect(indicator).toBeNull()

      // No <svg> child either.
      const svg = container.querySelector('[data-slot="checkbox-default"] svg')
      expect(svg).toBeNull()
    })
  })

  describe('checked state', () => {
    it('renders the Root with data-state="checked", aria-checked="true" — base classes remain identical to the unchecked path', () => {
      render(<Checkbox checked data-testid="checkbox-checked" />)

      const root = screen.getByTestId('checkbox-checked')
      expect(root.tagName).toBe('BUTTON')
      expect(root).toHaveAttribute('data-slot', 'checkbox')
      expect(root).toHaveAttribute('role', 'checkbox')
      expect(root).toHaveAttribute('data-state', 'checked')
      expect(root).toHaveAttribute('aria-checked', 'true')

      // The checked bg class is still present in the className
      // (cn() is stateless — the token lives in the same string).
      expect(root).toHaveClass('data-[state=checked]:bg-[color:var(--primary)]')
      expect(root).toHaveClass(
        'data-[state=checked]:text-[color:var(--primary-foreground)]'
      )

      // Base layout / focus / ring classes are unchanged.
      expect(root).toHaveClass('peer')
      expect(root).toHaveClass('rounded-[4px]')
      expect(root).toHaveClass('focus-visible:ring-2')
    })

    it('renders the Indicator span with data-state="checked" and the indicator base classes — and emits the CheckIcon SVG as a child', () => {
      const { container } = render(<Checkbox checked />)

      const indicator = container.querySelector(
        '[data-slot="checkbox-indicator"]'
      )
      expect(indicator).not.toBeNull()
      // Radix CheckboxPrimitive.Indicator renders an unstyled <span>.
      expect(indicator?.tagName).toBe('SPAN')
      expect(indicator).toHaveAttribute('data-slot', 'checkbox-indicator')
      expect(indicator).toHaveAttribute('data-state', 'checked')

      // Representative Indicator classes from the cn() call.
      expect(indicator).toHaveClass('flex')
      expect(indicator).toHaveClass('items-center')
      expect(indicator).toHaveClass('justify-center')
      expect(indicator).toHaveClass('text-current')
      expect(indicator).toHaveClass('transition-none')

      // Radix applies an inline `pointerEvents: "none"` style on the
      // Indicator span (so the underlying button still receives the
      // click even when the icon overlaps it). Assert via the DOM
      // property (not a className).
      expect((indicator as HTMLElement | null)?.style.pointerEvents).toBe(
        'none'
      )

      // Inside the Indicator, lucide-react renders a CheckIcon as an
      // <svg> element. The icon carries the `size-3.5` className
      // applied in checkbox.tsx.
      const svg = indicator?.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg).toBeInstanceOf(SVGElement)
      expect(svg).toHaveClass('size-3.5')
    })

    it('also works under defaultChecked (uncontrolled checked initial state)', () => {
      const { container } = render(
        <Checkbox defaultChecked data-testid="checkbox-default-checked" />
      )

      const root = screen.getByTestId('checkbox-default-checked')
      expect(root).toHaveAttribute('data-state', 'checked')
      expect(root).toHaveAttribute('aria-checked', 'true')

      const indicator = container.querySelector(
        '[data-slot="checkbox-indicator"]'
      )
      expect(indicator).not.toBeNull()
      expect(indicator).toHaveAttribute('data-state', 'checked')

      // The Indicator's CheckIcon SVG is rendered for defaultChecked
      // just like for controlled `checked`.
      const svg = indicator?.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg).toHaveClass('size-3.5')
    })

    it('flips from unchecked → checked when the Root is clicked and the state-conditional class tokens remain in the className', () => {
      render(<Checkbox data-testid="checkbox-flippable" />)

      const root = screen.getByTestId('checkbox-flippable')
      expect(root).toHaveAttribute('data-state', 'unchecked')

      fireEvent.click(root)

      expect(root).toHaveAttribute('data-state', 'checked')
      expect(root).toHaveAttribute('aria-checked', 'true')
      // The className is identical across the toggle — cn() is
      // stateless. Only the data-state attribute flips.
      expect(root).toHaveClass('data-[state=checked]:bg-[color:var(--primary)]')
      expect(root).toHaveClass('peer')
    })
  })

  describe('indeterminate state', () => {
    it('renders data-state="indeterminate" and aria-checked="mixed", and the Indicator span IS mounted (Presence considers indeterminate as "present")', () => {
      const { container } = render(
        <Checkbox
          checked="indeterminate"
          data-testid="checkbox-indeterminate"
        />
      )

      const root = screen.getByTestId('checkbox-indeterminate')
      expect(root).toHaveAttribute('data-state', 'indeterminate')
      expect(root).toHaveAttribute('aria-checked', 'mixed')

      const indicator = container.querySelector(
        '[data-slot="checkbox-indicator"]'
      )
      expect(indicator).not.toBeNull()
      expect(indicator).toHaveAttribute('data-state', 'indeterminate')
      // The CheckIcon SVG is also rendered under indeterminate.
      const svg = indicator?.querySelector('svg')
      expect(svg).not.toBeNull()
    })
  })

  describe('disabled state', () => {
    it('renders the Root with the disabled attribute, data-disabled, and the disabled-state classes (no checked-state activation)', () => {
      render(<Checkbox disabled data-testid="checkbox-disabled" />)

      const root = screen.getByTestId('checkbox-disabled')
      // Radix Checkbox forwards `disabled` onto the underlying button
      // AND emits `data-disabled=""` to make it queryable via CSS.
      expect(root.tagName).toBe('BUTTON')
      expect(root).toBeDisabled()
      expect(root).toHaveAttribute('data-disabled', '')
      expect(root).toHaveAttribute('data-slot', 'checkbox')
      // Disabled root is unchecked by default; data-state stays "unchecked".
      expect(root).toHaveAttribute('data-state', 'unchecked')
      expect(root).toHaveAttribute('aria-checked', 'false')

      // Disabled-state tailwind utilities from the cn() call.
      expect(root).toHaveClass('disabled:cursor-not-allowed')
      expect(root).toHaveClass('disabled:opacity-50')

      // The checked-state activation class tokens remain in the
      // className (cn() is stateless — see comment at the top).
      expect(root).toHaveClass('data-[state=checked]:bg-[color:var(--primary)]')
    })

    it('does not flip state on click when disabled — Radix swallows click events on a disabled Root', () => {
      const handleChange = vi.fn()
      render(
        <Checkbox
          data-testid="checkbox-disabled-interactive"
          disabled
          onCheckedChange={handleChange}
        />
      )

      const root = screen.getByTestId('checkbox-disabled-interactive')
      fireEvent.click(root)
      // Radix swallows click events on a disabled Root — the handler
      // is NOT called and the state stays unchecked.
      expect(handleChange).not.toHaveBeenCalled()
      expect(root).toHaveAttribute('data-state', 'unchecked')
    })
  })

  describe('className merge', () => {
    it('merges a custom className into the Root className alongside the shared base classes', () => {
      render(
        <Checkbox
          className="custom-checkbox-class"
          data-testid="checkbox-custom"
        />
      )

      const root = screen.getByTestId('checkbox-custom')
      // cn() merges both — the custom class lands on the same class
      // string as the base layout / focus classes.
      expect(root).toHaveClass('custom-checkbox-class')
      expect(root).toHaveClass('peer')
      expect(root).toHaveClass('rounded-[4px]')
      expect(root).toHaveClass('transition-shadow')
      // State-conditional class tokens remain in className.
      expect(root).toHaveClass('data-[state=checked]:bg-[color:var(--primary)]')
      // aria-invalid class tokens remain in className.
      expect(root).toHaveClass('aria-invalid:ring-[color:var(--destructive)]')
    })

    it('keeps the unchecked-state behaviour intact when a custom className is provided (data-state stays "unchecked")', () => {
      render(
        <Checkbox
          className="custom-checkbox-class"
          data-testid="checkbox-custom"
        />
      )

      const root = screen.getByTestId('checkbox-custom')
      expect(root).toHaveClass('custom-checkbox-class')
      // data-state still reports the underlying state — className does
      // not flip it.
      expect(root).toHaveAttribute('data-state', 'unchecked')
      expect(root).toHaveAttribute('aria-checked', 'false')
    })
  })

  describe('props forwarding', () => {
    it('forwards id, aria-label, value, required, and data-* props onto the Root button', () => {
      render(
        <Checkbox
          aria-label="Accept terms"
          data-custom="custom-value"
          data-testid="checkbox-forwarded"
          id="terms-checkbox"
          required
          value="yes"
        />
      )

      const root = screen.getByTestId('checkbox-forwarded')
      expect(root.tagName).toBe('BUTTON')
      expect(root).toHaveAttribute('id', 'terms-checkbox')
      expect(root).toHaveAttribute('aria-label', 'Accept terms')
      expect(root).toHaveAttribute('value', 'yes')
      expect(root).toHaveAttribute('data-custom', 'custom-value')
      // Radix surfaces `required` as aria-required on the Root button.
      expect(root).toHaveAttribute('aria-required', 'true')
    })

    it('attaches a hidden checkbox <input> sibling carrying `name` and `value` when rendered inside a <form>', () => {
      // Radix Checkbox picks up `name`/`value` from its Root props
      // and renders a hidden `<input type="checkbox">` sibling so the
      // checkbox participates in native form submission. The hidden
      // input is only emitted when Radix detects a `<form>` ancestor
      // (or an explicit `form` prop), so we wrap the Checkbox in one
      // to exercise the path.
      //
      // jsdom does not implement ResizeObserver. Radix Checkbox uses
      // one internally (via @radix-ui/react-use-size, used to size
      // the hidden input to the visible button) when a form is
      // detected — stub it out so the layout effect stays quiet.
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
            <Checkbox
              data-testid="checkbox-form"
              name="terms"
              value="accepted"
            />
          </form>
        )

        const root = screen.getByTestId('checkbox-form')
        // The button itself does NOT carry the `name` attribute (it
        // is lifted to the hidden input Radix renders for form
        // submission). `value` is duplicated on the button too.
        expect(root).not.toHaveAttribute('name')
        expect(root).toHaveAttribute('value', 'accepted')

        // The hidden <input type="checkbox"> sibling carries the
        // form-related props Radix lifted off the Root.
        const hiddenInput = container.querySelector(
          'input[type="checkbox"]'
        ) as HTMLInputElement | null
        expect(hiddenInput).not.toBeNull()
        expect(hiddenInput).toHaveAttribute('name', 'terms')
        expect(hiddenInput).toHaveAttribute('value', 'accepted')
        expect(hiddenInput).toHaveAttribute('aria-hidden', 'true')
        expect(hiddenInput).toHaveAttribute('tabindex', '-1')
      } finally {
        globalThis.ResizeObserver = originalResizeObserver
      }
    })

    it('invokes onCheckedChange when the Root is clicked, with the new checked state', () => {
      const handleChange = vi.fn()
      render(
        <Checkbox
          data-testid="checkbox-interactive"
          onCheckedChange={handleChange}
        />
      )

      const root = screen.getByTestId('checkbox-interactive')
      expect(root).toHaveAttribute('data-state', 'unchecked')

      fireEvent.click(root)
      // Radix's onCheckedChange callback receives the new checked
      // value as its first argument.
      expect(handleChange).toHaveBeenCalledTimes(1)
      expect(handleChange.mock.calls[0]?.[0]).toBe(true)

      // The Root flips to checked after the click.
      expect(root).toHaveAttribute('data-state', 'checked')
    })

    it('passes `false` to onCheckedChange when the Root is clicked a second time (toggles back off)', () => {
      const handleChange = vi.fn()
      render(
        <Checkbox
          defaultChecked
          data-testid="checkbox-toggle"
          onCheckedChange={handleChange}
        />
      )

      const root = screen.getByTestId('checkbox-toggle')
      expect(root).toHaveAttribute('data-state', 'checked')

      fireEvent.click(root)
      expect(handleChange).toHaveBeenCalledTimes(1)
      expect(handleChange.mock.calls[0]?.[0]).toBe(false)
      expect(root).toHaveAttribute('data-state', 'unchecked')
    })
  })

  describe('aria-invalid styling', () => {
    it('forwards aria-invalid="true" onto the Root button — the destructive ring/border class tokens remain in the cn()-merged className', () => {
      render(<Checkbox aria-invalid="true" data-testid="checkbox-invalid" />)

      const root = screen.getByTestId('checkbox-invalid')
      // Radix spreads aria-invalid onto the underlying button via
      // `...checkboxProps`.
      expect(root).toHaveAttribute('aria-invalid', 'true')

      // The aria-invalid activation class tokens are ALWAYS present
      // in the cn()-merged className — the runtime CSS rule is what
      // gates on `aria-invalid="true"`. The tokens must not vanish
      // when aria-invalid is set or unset.
      expect(root).toHaveClass('aria-invalid:ring-[color:var(--destructive)]')
      expect(root).toHaveClass('aria-invalid:border-[color:var(--destructive)]')
      // And the unrelated base / state classes are unchanged.
      expect(root).toHaveClass('peer')
      expect(root).toHaveClass('rounded-[4px]')
      expect(root).toHaveClass('data-[state=checked]:bg-[color:var(--primary)]')
    })

    it('leaves the aria-invalid activation tokens in the className when aria-invalid is NOT set (default behaviour — only the CSS rule changes)', () => {
      render(<Checkbox data-testid="checkbox-default-invalid" />)

      const root = screen.getByTestId('checkbox-default-invalid')
      // Radix Checkbox only forwards `aria-invalid` onto the button
      // when explicitly passed — when the prop is omitted, the
      // attribute is not emitted at all. This is consistent with
      // how a sighted `<input type="checkbox">` behaves (no
      // aria-invalid unless `aria-invalid="true"` is set).
      expect(root).not.toHaveAttribute('aria-invalid')

      // The aria-invalid activation class tokens are STILL present in
      // the cn()-merged className (cn() is stateless — see top comment).
      expect(root).toHaveClass('aria-invalid:ring-[color:var(--destructive)]')
      expect(root).toHaveClass('aria-invalid:border-[color:var(--destructive)]')
    })
  })
})
