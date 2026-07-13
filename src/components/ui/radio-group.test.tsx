import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { RadioGroup, RadioGroupItem } from './radio-group'

/**
 * These tests cover the RadioGroup primitive declared in
 * src/components/ui/radio-group.tsx (currently 0% coverage, 43 lines).
 *
 * RadioGroup is a small composition of two wrapper components around
 * `@radix-ui/react-radio-group`:
 *   - `RadioGroup` — a `<div role="radiogroup">` driven by Radix's
 *     `RadioGroupPrimitive.Root`, decorated with `data-slot="radio-group"`
 *     and the cn() base classes (`grid gap-3`). Arbitrary Root props
 *     (defaultValue, value, onValueChange, name, aria-label, ...) are
 *     spread onto the rendered div.
 *   - `RadioGroupItem` — a `<button role="radio">` driven by Radix's
 *     `RadioGroupPrimitive.Item`, decorated with `data-slot="radio-group-item"`,
 *     the long cn()-merged className string (border / focus / ring /
 *     aria-invalid / disabled state utilities), and an internal
 *     `RadioGroupPrimitive.Indicator` that mounts a `CircleIcon` SVG
 *     from lucide-react only when the item is checked. Indicator
 *     carries `data-slot="radio-group-indicator"`.
 *
 * Mirrors the layout of checkbox.test.tsx (PR #107) and
 * switch.test.tsx (PR #106): one describe per component, one describe
 * per behaviour axis, unconditional cn() base assertions, className
 * merge, prop forwarding, state-conditional class tokens always
 * present in the className (cn() is stateless — runtime CSS rule is
 * gated on the data-state / aria-invalid attribute).
 */
describe('RadioGroup', () => {
  describe('default <div role="radiogroup"> rendering', () => {
    it('renders a single <div> with role="radiogroup", data-slot="radio-group", and the cn() base classes (grid gap-3)', () => {
      const { container } = render(
        <RadioGroup data-testid="radio-group-default">
          <RadioGroupItem value="a" />
          <RadioGroupItem value="b" />
        </RadioGroup>
      )

      const root = screen.getByTestId('radio-group-default')

      // Exactly one top-level child rendered — no portal / wrapper.
      expect(container.children).toHaveLength(1)

      // Radix RadioGroupPrimitive.Root renders as a <div> with the
      // aria role set explicitly to "radiogroup".
      expect(root.tagName).toBe('DIV')
      expect(root).toHaveAttribute('role', 'radiogroup')
      expect(root).toHaveAttribute('data-slot', 'radio-group')

      // cn() base layout classes always present.
      expect(root).toHaveClass('grid')
      expect(root).toHaveClass('gap-3')
    })

    it('renders its children verbatim inside the radiogroup div (no portal)', () => {
      render(
        <RadioGroup data-testid="radio-group-children">
          <span data-testid="rg-child-1">first</span>
          <span data-testid="rg-child-2">second</span>
        </RadioGroup>
      )

      const root = screen.getByTestId('radio-group-children')
      expect(root).toContainElement(screen.getByTestId('rg-child-1'))
      expect(root).toContainElement(screen.getByTestId('rg-child-2'))
    })
  })

  describe('className merge', () => {
    it('appends a custom className alongside the cn() base classes', () => {
      render(
        <RadioGroup
          className="custom-group-class mt-4"
          data-testid="radio-group-merged"
        />
      )

      const root = screen.getByTestId('radio-group-merged')
      // Custom classes are appended.
      expect(root).toHaveClass('custom-group-class')
      expect(root).toHaveClass('mt-4')
      // Base classes survive the merge.
      expect(root).toHaveClass('grid')
      expect(root).toHaveClass('gap-3')
    })
  })

  describe('prop forwarding', () => {
    it('forwards id, aria-*, data-*, defaultValue, and onValueChange onto the rendered <div>', () => {
      const handleChange = vi.fn()
      render(
        <RadioGroup
          aria-label="plan selection"
          aria-required="true"
          data-custom="custom-value"
          data-testid="radio-group-forwarded"
          defaultValue="monthly"
          id="plan-rg"
          onValueChange={handleChange}
        >
          <RadioGroupItem value="monthly" />
          <RadioGroupItem value="yearly" />
        </RadioGroup>
      )

      const root = screen.getByTestId('radio-group-forwarded')
      expect(root).toHaveAttribute('id', 'plan-rg')
      expect(root).toHaveAttribute('aria-label', 'plan selection')
      expect(root).toHaveAttribute('aria-required', 'true')
      expect(root).toHaveAttribute('data-custom', 'custom-value')
      // Radix RadioGroup does NOT surface `name` on the Root div —
      // the `name` prop is lifted onto the hidden <input type="radio">
      // siblings Radix renders for form submission. (The hidden
      // inputs are exercised below in the Item describe.)
      expect(root).not.toHaveAttribute('name')
    })

    it('invokes onValueChange on the Root with the selected Item value when an Item is clicked', () => {
      const handleChange = vi.fn()
      render(
        <RadioGroup
          data-testid="radio-group-interactive"
          onValueChange={handleChange}
        >
          <RadioGroupItem data-testid="rgi-a" value="a" />
          <RadioGroupItem data-testid="rgi-b" value="b" />
        </RadioGroup>
      )

      fireEvent.click(screen.getByTestId('rgi-b'))
      // Radix forwards the Item's `value` to the Root's onValueChange.
      expect(handleChange).toHaveBeenCalledTimes(1)
      expect(handleChange.mock.calls[0]?.[0]).toBe('b')
    })

    it('respects a controlled `value` prop — Items reflect the controlled selection and do not flip on click', () => {
      const { rerender } = render(
        <RadioGroup data-testid="radio-group-controlled" value="a">
          <RadioGroupItem data-testid="rgi-ctrl-a" value="a" />
          <RadioGroupItem data-testid="rgi-ctrl-b" value="b" />
        </RadioGroup>
      )

      expect(screen.getByTestId('rgi-ctrl-a')).toHaveAttribute(
        'data-state',
        'checked'
      )
      expect(screen.getByTestId('rgi-ctrl-b')).toHaveAttribute(
        'data-state',
        'unchecked'
      )

      // Click the other Item — Radix fires onValueChange but the
      // controlled `value` is still "a", so the Item's data-state
      // does NOT flip (the parent owns the state).
      fireEvent.click(screen.getByTestId('rgi-ctrl-b'))
      expect(screen.getByTestId('rgi-ctrl-a')).toHaveAttribute(
        'data-state',
        'checked'
      )
      expect(screen.getByTestId('rgi-ctrl-b')).toHaveAttribute(
        'data-state',
        'unchecked'
      )

      // Once the parent updates the controlled value, the selection
      // visibly moves.
      rerender(
        <RadioGroup data-testid="radio-group-controlled" value="b">
          <RadioGroupItem data-testid="rgi-ctrl-a" value="a" />
          <RadioGroupItem data-testid="rgi-ctrl-b" value="b" />
        </RadioGroup>
      )
      expect(screen.getByTestId('rgi-ctrl-a')).toHaveAttribute(
        'data-state',
        'unchecked'
      )
      expect(screen.getByTestId('rgi-ctrl-b')).toHaveAttribute(
        'data-state',
        'checked'
      )
    })
  })
})

describe('RadioGroupItem', () => {
  describe('default unchecked rendering', () => {
    it('renders a single <button role="radio"> with data-slot="radio-group-item", data-state="unchecked", and the shared base classes', () => {
      render(
        <RadioGroup>
          <RadioGroupItem data-testid="radio-item-default" value="a" />
        </RadioGroup>
      )

      const item = screen.getByTestId('radio-item-default')
      // Radix RadioGroupPrimitive.Item renders as a real <button>.
      expect(item.tagName).toBe('BUTTON')
      expect(item).toHaveAttribute('type', 'button')
      expect(item).toHaveAttribute('role', 'radio')
      expect(item).toHaveAttribute('data-slot', 'radio-group-item')
      expect(item).toHaveAttribute('data-state', 'unchecked')
      expect(item).toHaveAttribute('aria-checked', 'false')

      // Representative structural / sizing classes from the cn() call.
      expect(item).toHaveClass('aspect-square')
      expect(item).toHaveClass('size-4')
      expect(item).toHaveClass('shrink-0')
      expect(item).toHaveClass('rounded-full')
      expect(item).toHaveClass('border')
      expect(item).toHaveClass('shadow-xs')
      expect(item).toHaveClass('transition-[color,box-shadow]')
      expect(item).toHaveClass('outline-none')

      // Colour tokens always present in the cn()-merged className.
      expect(item).toHaveClass('border-[color:var(--border)]')
      expect(item).toHaveClass('text-[color:var(--primary)]')

      // focus-visible ring utilities always present.
      expect(item).toHaveClass('focus-visible:ring-2')
      expect(item).toHaveClass('focus-visible:ring-[color:var(--ring)]')
      expect(item).toHaveClass('focus-visible:ring-offset-2')
      expect(item).toHaveClass(
        'focus-visible:ring-offset-[color:var(--background)]'
      )

      // aria-invalid activation class tokens present in the cn()
      // className (always; runtime CSS rule gated on aria-invalid).
      expect(item).toHaveClass('aria-invalid:ring-[color:var(--destructive)]')
      expect(item).toHaveClass('aria-invalid:border-[color:var(--destructive)]')

      // Disabled-state class tokens present in the className.
      expect(item).toHaveClass('disabled:cursor-not-allowed')
      expect(item).toHaveClass('disabled:opacity-50')
    })

    it('does NOT render the Indicator span (or its child CircleIcon) when unchecked — Radix Presence returns null', () => {
      const { container } = render(
        <RadioGroup>
          <RadioGroupItem data-testid="radio-item-unchecked" value="a" />
        </RadioGroup>
      )

      // The Indicator wraps its children in a Radix `<Presence>` that
      // only mounts when the item is checked. For an unchecked Item,
      // no Indicator span is emitted, and therefore the CircleIcon
      // SVG never renders either.
      const indicator = container.querySelector(
        '[data-slot="radio-group-indicator"]'
      )
      expect(indicator).toBeNull()

      const svg = container.querySelector(
        '[data-slot="radio-item-unchecked"] svg'
      )
      expect(svg).toBeNull()
    })
  })

  describe('checked state', () => {
    it('renders the Item with data-state="checked", aria-checked="true" — base classes remain identical to the unchecked path', () => {
      render(
        <RadioGroup defaultValue="a">
          <RadioGroupItem data-testid="radio-item-checked" value="a" />
        </RadioGroup>
      )

      const item = screen.getByTestId('radio-item-checked')
      expect(item.tagName).toBe('BUTTON')
      expect(item).toHaveAttribute('data-slot', 'radio-group-item')
      expect(item).toHaveAttribute('role', 'radio')
      expect(item).toHaveAttribute('data-state', 'checked')
      expect(item).toHaveAttribute('aria-checked', 'true')

      // Base layout / focus / ring classes are unchanged.
      expect(item).toHaveClass('aspect-square')
      expect(item).toHaveClass('rounded-full')
      expect(item).toHaveClass('focus-visible:ring-2')
      expect(item).toHaveClass('border-[color:var(--border)]')
    })

    it('renders the Indicator span with data-state="checked" and the indicator base classes — and emits the CircleIcon SVG as a child', () => {
      const { container } = render(
        <RadioGroup defaultValue="a">
          <RadioGroupItem value="a" />
        </RadioGroup>
      )

      const indicator = container.querySelector(
        '[data-slot="radio-group-indicator"]'
      )
      expect(indicator).not.toBeNull()
      // Radix RadioGroupPrimitive.Indicator renders an unstyled <span>.
      expect(indicator?.tagName).toBe('SPAN')
      expect(indicator).toHaveAttribute('data-slot', 'radio-group-indicator')
      expect(indicator).toHaveAttribute('data-state', 'checked')

      // Representative Indicator classes from the cn() call.
      expect(indicator).toHaveClass('relative')
      expect(indicator).toHaveClass('flex')
      expect(indicator).toHaveClass('items-center')
      expect(indicator).toHaveClass('justify-center')

      // Inside the Indicator, lucide-react renders a CircleIcon as an
      // <svg> element. The icon carries the `size-2` className plus
      // the absolute positioning / fill-colour tokens applied in
      // radio-group.tsx.
      const svg = indicator?.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg).toBeInstanceOf(SVGElement)
      expect(svg).toHaveClass('size-2')
      expect(svg).toHaveClass('absolute')
      expect(svg).toHaveClass('top-1/2')
      expect(svg).toHaveClass('left-1/2')
      expect(svg).toHaveClass('-translate-x-1/2')
      expect(svg).toHaveClass('-translate-y-1/2')
      expect(svg).toHaveClass('fill-[color:var(--primary)]')
    })

    it('flips from unchecked → checked when the Item is clicked and the state-conditional class tokens remain in the className', () => {
      render(
        <RadioGroup>
          <RadioGroupItem data-testid="radio-item-flippable" value="a" />
        </RadioGroup>
      )

      const item = screen.getByTestId('radio-item-flippable')
      expect(item).toHaveAttribute('data-state', 'unchecked')

      fireEvent.click(item)

      expect(item).toHaveAttribute('data-state', 'checked')
      expect(item).toHaveAttribute('aria-checked', 'true')
      // Base classes still present after the toggle.
      expect(item).toHaveClass('aspect-square')
      expect(item).toHaveClass('rounded-full')
    })

    it('only one Item can be checked at a time — selecting a different Item moves the data-state="checked" indicator', () => {
      const { container } = render(
        <RadioGroup>
          <RadioGroupItem data-testid="rgi-multi-a" value="a" />
          <RadioGroupItem data-testid="rgi-multi-b" value="b" />
        </RadioGroup>
      )

      const a = screen.getByTestId('rgi-multi-a')
      const b = screen.getByTestId('rgi-multi-b')

      fireEvent.click(a)
      expect(a).toHaveAttribute('data-state', 'checked')
      expect(b).toHaveAttribute('data-state', 'unchecked')

      // First Indicator mounts (for the checked a).
      const indicatorsAfterA = container.querySelectorAll(
        '[data-slot="radio-group-indicator"]'
      )
      expect(indicatorsAfterA).toHaveLength(1)

      fireEvent.click(b)
      expect(a).toHaveAttribute('data-state', 'unchecked')
      expect(b).toHaveAttribute('data-state', 'checked')

      // Indicator moves from a → b. Still exactly one Indicator span
      // mounted in the DOM (Radix Presence unmounts the old one).
      const indicatorsAfterB = container.querySelectorAll(
        '[data-slot="radio-group-indicator"]'
      )
      expect(indicatorsAfterB).toHaveLength(1)
      expect(indicatorsAfterB[0]?.parentElement).toBe(b)
    })
  })

  describe('disabled state', () => {
    it('renders the Item with the disabled attribute, data-disabled, and the disabled-state classes', () => {
      render(
        <RadioGroup>
          <RadioGroupItem
            data-testid="radio-item-disabled"
            disabled
            value="a"
          />
        </RadioGroup>
      )

      const item = screen.getByTestId('radio-item-disabled')
      expect(item.tagName).toBe('BUTTON')
      expect(item).toBeDisabled()
      expect(item).toHaveAttribute('data-disabled', '')
      expect(item).toHaveAttribute('data-slot', 'radio-group-item')
      // Disabled item is unchecked by default; data-state stays "unchecked".
      expect(item).toHaveAttribute('data-state', 'unchecked')
      expect(item).toHaveAttribute('aria-checked', 'false')

      // Disabled-state tailwind utilities from the cn() call.
      expect(item).toHaveClass('disabled:cursor-not-allowed')
      expect(item).toHaveClass('disabled:opacity-50')
    })

    it('does not flip state on click when disabled — Radix swallows click events on a disabled Item', () => {
      const handleChange = vi.fn()
      render(
        <RadioGroup onValueChange={handleChange}>
          <RadioGroupItem
            data-testid="radio-item-disabled-interactive"
            disabled
            value="a"
          />
        </RadioGroup>
      )

      const item = screen.getByTestId('radio-item-disabled-interactive')
      fireEvent.click(item)
      // Radix swallows click events on a disabled Item — the handler
      // is NOT called and the state stays unchecked.
      expect(handleChange).not.toHaveBeenCalled()
      expect(item).toHaveAttribute('data-state', 'unchecked')
    })
  })

  describe('className merge', () => {
    it('merges a custom className into the Item className alongside the shared base classes', () => {
      render(
        <RadioGroup>
          <RadioGroupItem
            className="custom-item-class"
            data-testid="radio-item-custom"
            value="a"
          />
        </RadioGroup>
      )

      const item = screen.getByTestId('radio-item-custom')
      // cn() merges both — the custom class lands on the same class
      // string as the base layout / focus classes.
      expect(item).toHaveClass('custom-item-class')
      expect(item).toHaveClass('aspect-square')
      expect(item).toHaveClass('rounded-full')
      expect(item).toHaveClass('transition-[color,box-shadow]')
      // aria-invalid class tokens remain in className.
      expect(item).toHaveClass('aria-invalid:ring-[color:var(--destructive)]')
    })

    it('keeps the unchecked-state behaviour intact when a custom className is provided (data-state stays "unchecked")', () => {
      render(
        <RadioGroup>
          <RadioGroupItem
            className="custom-item-class"
            data-testid="radio-item-custom-unchecked"
            value="a"
          />
        </RadioGroup>
      )

      const item = screen.getByTestId('radio-item-custom-unchecked')
      expect(item).toHaveClass('custom-item-class')
      // data-state still reports the underlying state — className does
      // not flip it.
      expect(item).toHaveAttribute('data-state', 'unchecked')
      expect(item).toHaveAttribute('aria-checked', 'false')
    })
  })

  describe('props forwarding', () => {
    it('forwards id, aria-label, value, and data-* props onto the Item button', () => {
      render(
        <RadioGroup>
          <RadioGroupItem
            aria-label="monthly plan"
            data-custom="custom-value"
            data-testid="radio-item-forwarded"
            id="plan-monthly"
            value="monthly"
          />
        </RadioGroup>
      )

      const item = screen.getByTestId('radio-item-forwarded')
      expect(item.tagName).toBe('BUTTON')
      expect(item).toHaveAttribute('id', 'plan-monthly')
      expect(item).toHaveAttribute('aria-label', 'monthly plan')
      expect(item).toHaveAttribute('value', 'monthly')
      expect(item).toHaveAttribute('data-custom', 'custom-value')
    })

    it('attaches a hidden radio <input> sibling carrying the Root name + Item value when rendered inside a <form>', () => {
      // jsdom does not implement ResizeObserver. Radix RadioGroup uses
      // one internally (via @radix-ui/react-use-size, used to size
      // the hidden inputs to the visible Items) when a form is
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
            <RadioGroup defaultValue="a" name="plan">
              <RadioGroupItem data-testid="radio-item-form-a" value="a" />
              <RadioGroupItem data-testid="radio-item-form-b" value="b" />
            </RadioGroup>
          </form>
        )

        const itemA = screen.getByTestId('radio-item-form-a')
        // The button itself does NOT carry the `name` attribute (it
        // is lifted to the hidden input Radix renders for form
        // submission). `value` is duplicated on the button too.
        expect(itemA).not.toHaveAttribute('name')
        expect(itemA).toHaveAttribute('value', 'a')

        // The hidden <input type="radio"> siblings carry the
        // form-related props Radix lifted off the Root + Item.
        const hiddenInputs = container.querySelectorAll(
          'input[type="radio"]'
        ) as NodeListOf<HTMLInputElement>
        expect(hiddenInputs).toHaveLength(2)
        const hiddenA = hiddenInputs[0]
        const hiddenB = hiddenInputs[1]
        expect(hiddenA).toHaveAttribute('name', 'plan')
        expect(hiddenA).toHaveAttribute('value', 'a')
        expect(hiddenA).toHaveAttribute('checked')
        expect(hiddenA).toHaveAttribute('aria-hidden', 'true')
        expect(hiddenA).toHaveAttribute('tabindex', '-1')
        expect(hiddenB).toHaveAttribute('name', 'plan')
        expect(hiddenB).toHaveAttribute('value', 'b')
        expect(hiddenB).not.toHaveAttribute('checked')
      } finally {
        globalThis.ResizeObserver = originalResizeObserver
      }
    })

    it('invokes onValueChange on the parent RadioGroup when the Item is clicked, with the Item value', () => {
      const handleChange = vi.fn()
      render(
        <RadioGroup onValueChange={handleChange}>
          <RadioGroupItem data-testid="radio-item-click-a" value="a" />
          <RadioGroupItem data-testid="radio-item-click-b" value="b" />
        </RadioGroup>
      )

      fireEvent.click(screen.getByTestId('radio-item-click-b'))
      // The Root's onValueChange fires with the Item's `value`.
      expect(handleChange).toHaveBeenCalledTimes(1)
      expect(handleChange.mock.calls[0]?.[0]).toBe('b')

      // The clicked Item flips to checked; the other Item stays unchecked.
      expect(screen.getByTestId('radio-item-click-b')).toHaveAttribute(
        'data-state',
        'checked'
      )
      expect(screen.getByTestId('radio-item-click-a')).toHaveAttribute(
        'data-state',
        'unchecked'
      )
    })

    // NOTE: keyboard navigation (ArrowDown / ArrowUp roving focus) and
    // roving-tabindex wiring are owned entirely by
    // @radix-ui/react-roving-focus inside @radix-ui/react-radio-group,
    // not by radio-group.tsx itself. The wrapper here only passes
    // props through — see the body comment at the top of this file.
  })

  describe('aria-invalid styling', () => {
    it('forwards aria-invalid="true" onto the Item button — the destructive ring/border class tokens remain in the cn()-merged className', () => {
      render(
        <RadioGroup>
          <RadioGroupItem
            aria-invalid="true"
            data-testid="radio-item-invalid"
            value="a"
          />
        </RadioGroup>
      )

      const item = screen.getByTestId('radio-item-invalid')
      // Radix spreads aria-invalid onto the underlying button.
      expect(item).toHaveAttribute('aria-invalid', 'true')

      // The aria-invalid activation class tokens are ALWAYS present
      // in the cn()-merged className — the runtime CSS rule is what
      // gates on `aria-invalid="true"`. The tokens must not vanish
      // when aria-invalid is set or unset.
      expect(item).toHaveClass('aria-invalid:ring-[color:var(--destructive)]')
      expect(item).toHaveClass('aria-invalid:border-[color:var(--destructive)]')
      // And the unrelated base / sizing classes are unchanged.
      expect(item).toHaveClass('aspect-square')
      expect(item).toHaveClass('rounded-full')
      expect(item).toHaveClass('border-[color:var(--border)]')
    })

    it('leaves the aria-invalid activation tokens in the className when aria-invalid is NOT set (default behaviour)', () => {
      render(
        <RadioGroup>
          <RadioGroupItem data-testid="radio-item-default-invalid" value="a" />
        </RadioGroup>
      )

      const item = screen.getByTestId('radio-item-default-invalid')
      // Radix RadioGroup only forwards `aria-invalid` onto the button
      // when explicitly passed — when the prop is omitted, the
      // attribute is not emitted at all.
      expect(item).not.toHaveAttribute('aria-invalid')

      // The aria-invalid activation class tokens are STILL present in
      // the cn()-merged className (cn() is stateless).
      expect(item).toHaveClass('aria-invalid:ring-[color:var(--destructive)]')
      expect(item).toHaveClass('aria-invalid:border-[color:var(--destructive)]')
    })
  })
})
