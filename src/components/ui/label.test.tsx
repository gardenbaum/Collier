import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { Label } from './label'

/**
 * These tests cover the Label primitive declared in
 * src/components/ui/label.tsx (currently 0% coverage).
 *
 * Label is a single function component that:
 *  - wraps `@radix-ui/react-label`'s Root
 *  - applies data-slot="label"
 *  - drives its className through a single cn() block:
 *      layout tokens + group-data-[disabled=true]:* + peer-disabled:*
 *      tokens (all concatenated unconditionally — the Tailwind attribute
 *      selectors activate at render time when the parent group/peer
 *      carries `data-disabled="true"` or `disabled`, not by conditional
 *      class injection)
 *  - merges a custom `className` via cn() and spreads the remaining
 *    Radix Root props onto the rendered element (which is `<label>` by
 *    default, or the wrapped child element when `asChild` is set)
 *
 * The Radix `asChild` prop toggles the underlying Primitive from
 * `<label>` to Radix's Slot — see src/components/ui/badge.test.tsx for
 * the same pattern in another primitive. Mirrors the
 * separator.test.tsx (PR #108) and textarea.test.tsx (PR #112) layout:
 * unconditional cn() base assertions, className merge, prop
 * forwarding, and the asChild branch.
 */
describe('Label', () => {
  describe('default rendering', () => {
    it('renders exactly one <label> with data-slot="label" and the full unconditional cn() base', () => {
      const { container } = render(<Label data-testid="label-default" />)

      const element = screen.getByTestId('label-default')

      // Exactly one top-level child, no portal / wrapper elements.
      expect(container.children).toHaveLength(1)
      // Radix Primitive.label renders a native <label> by default.
      expect(element.tagName).toBe('LABEL')
      expect(element).toHaveAttribute('data-slot', 'label')

      // Layout / structural base tokens.
      expect(element).toHaveClass('flex')
      expect(element).toHaveClass('items-center')
      expect(element).toHaveClass('gap-2')
      expect(element).toHaveClass('text-sm')
      expect(element).toHaveClass('leading-none')
      expect(element).toHaveClass('font-medium')
      expect(element).toHaveClass('select-none')

      // group-data-[disabled=true]:* tokens — these are Tailwind
      // attribute selectors baked into the cn() input string and always
      // emitted. Activation depends on a parent `group` carrying
      // `data-disabled="true"` — the selector is in the className either
      // way.
      expect(element).toHaveClass(
        'group-data-[disabled=true]:pointer-events-none'
      )
      expect(element).toHaveClass('group-data-[disabled=true]:opacity-50')

      // peer-disabled:* tokens — Tailwind variant selectors baked into
      // the cn() input string and always emitted. Activation depends on
      // a preceding sibling `peer` element carrying `disabled`.
      expect(element).toHaveClass('peer-disabled:cursor-not-allowed')
      expect(element).toHaveClass('peer-disabled:opacity-50')
    })
  })

  describe('className merge', () => {
    it('appends a custom className and preserves the base cn() classes', () => {
      render(
        <Label
          data-testid="label-merged"
          className="custom-class mt-2 text-red-500"
        />
      )
      const element = screen.getByTestId('label-merged')

      // Custom classes are appended.
      expect(element).toHaveClass('custom-class')
      expect(element).toHaveClass('mt-2')
      expect(element).toHaveClass('text-red-500')

      // Base classes survive the merge.
      expect(element).toHaveClass('flex')
      expect(element).toHaveClass('items-center')
      expect(element).toHaveClass('gap-2')
      expect(element).toHaveClass('text-sm')
      expect(element).toHaveClass('leading-none')
      expect(element).toHaveClass('font-medium')
      expect(element).toHaveClass('select-none')
      expect(element).toHaveClass(
        'group-data-[disabled=true]:pointer-events-none'
      )
      expect(element).toHaveClass('group-data-[disabled=true]:opacity-50')
      expect(element).toHaveClass('peer-disabled:cursor-not-allowed')
      expect(element).toHaveClass('peer-disabled:opacity-50')
    })
  })

  describe('prop forwarding', () => {
    it('forwards htmlFor onto the rendered <label> (the whole point of a label)', () => {
      render(
        <>
          <Label data-testid="label-htmlfor" htmlFor="email-input">
            Email
          </Label>
          <input id="email-input" type="email" />
        </>
      )

      const element = screen.getByTestId('label-htmlfor')
      // React's `htmlFor` prop becomes the `for` attribute on the
      // rendered <label>. This is the only mechanism that ties the
      // label to its associated input — verify it lands on the DOM
      // node, not just in React's prop tree.
      expect(element).toHaveAttribute('for', 'email-input')
      expect(element.tagName).toBe('LABEL')
      expect(element).toHaveTextContent('Email')
    })

    it('forwards id, name (where applicable), aria-* and data-* attributes', () => {
      render(
        <Label
          aria-describedby="helper"
          aria-label="Email address"
          data-testid="label-props"
          data-track="signup"
          id="email-label"
        />
      )
      const element = screen.getByTestId('label-props')

      expect(element).toHaveAttribute('id', 'email-label')
      expect(element).toHaveAttribute('aria-describedby', 'helper')
      expect(element).toHaveAttribute('aria-label', 'Email address')
      expect(element).toHaveAttribute('data-track', 'signup')
    })

    it('forwards event handlers (onClick, onMouseDown) onto the rendered <label>', () => {
      const onClick = vi.fn()
      const onMouseDown = vi.fn()

      render(
        <Label
          data-testid="label-handlers"
          onClick={onClick}
          onMouseDown={onMouseDown}
        />
      )
      const element = screen.getByTestId('label-handlers')

      fireEvent.click(element)
      expect(onClick).toHaveBeenCalledTimes(1)

      fireEvent.mouseDown(element)
      expect(onMouseDown).toHaveBeenCalledTimes(1)
    })

    it('renders arbitrary children inside the <label>', () => {
      render(
        <Label data-testid="label-children">
          <span data-testid="label-inner">Inner</span>
        </Label>
      )
      const element = screen.getByTestId('label-children')
      const inner = screen.getByTestId('label-inner')

      expect(element).toContainElement(inner)
      expect(inner).toHaveTextContent('Inner')
    })
  })

  describe('asChild (Radix Slot)', () => {
    it('renders the wrapped child element instead of a <label>, still setting data-slot="label" on it', () => {
      render(
        <Label asChild>
          <span data-testid="label-aschild-span">Click target</span>
        </Label>
      )

      const element = screen.getByTestId('label-aschild-span')
      // Radix Slot forwards data-slot onto the child instead of
      // wrapping it in a <label>.
      expect(element.tagName).toBe('SPAN')
      expect(element).toHaveAttribute('data-slot', 'label')
      expect(element).toHaveTextContent('Click target')

      // The unconditional cn() base classes still land on the child
      // because Slot merges props onto whatever element it renders.
      expect(element).toHaveClass('flex')
      expect(element).toHaveClass('items-center')
      expect(element).toHaveClass('gap-2')
      expect(element).toHaveClass('text-sm')
      expect(element).toHaveClass('leading-none')
      expect(element).toHaveClass('font-medium')
      expect(element).toHaveClass('select-none')
      expect(element).toHaveClass(
        'group-data-[disabled=true]:pointer-events-none'
      )
      expect(element).toHaveClass('group-data-[disabled=true]:opacity-50')
      expect(element).toHaveClass('peer-disabled:cursor-not-allowed')
      expect(element).toHaveClass('peer-disabled:opacity-50')
    })

    it('forwards id / htmlFor-equivalent / onClick onto the wrapped child when asChild is set', () => {
      const handleClick = vi.fn()
      render(
        <Label
          aria-label="aschild label"
          asChild
          data-testid="label-aschild-forwarded"
          id="aschild-id"
          onClick={handleClick}
        >
          <button type="button">Trigger</button>
        </Label>
      )

      const button = screen.getByTestId('label-aschild-forwarded')
      expect(button.tagName).toBe('BUTTON')
      expect(button).toHaveAttribute('data-slot', 'label')
      expect(button).toHaveAttribute('id', 'aschild-id')
      expect(button).toHaveAttribute('aria-label', 'aschild label')
      expect(button).toHaveAttribute('type', 'button')

      fireEvent.click(button)
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('renders a <label> when asChild={false} is passed explicitly (default branch)', () => {
      render(
        <Label asChild={false} data-testid="label-explicit-no-aschild">
          Explicit
        </Label>
      )

      const element = screen.getByTestId('label-explicit-no-aschild')
      expect(element.tagName).toBe('LABEL')
      expect(element).toHaveAttribute('data-slot', 'label')
    })
  })
})
