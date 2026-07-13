import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { Input } from './input'

/**
 * These tests cover the Input primitive declared in
 * src/components/ui/input.tsx (currently 0% coverage).
 *
 * Input is a single function component that:
 *  - renders an `<input>` element with `data-slot="input"`
 *  - forwards `type` (default React behaviour: omitted -> 'text')
 *  - drives its className through three cn() blocks:
 *      1. base (layout + file/placeholder/selection/disabled tokens)
 *      2. focus-visible:ring-* tokens
 *      3. aria-invalid:ring-/border-* tokens
 *  - merges a custom `className` via cn() and spreads the remaining
 *    <input> props onto the rendered element
 *
 * The pseudo-class variant classes (disabled:*, focus-visible:*,
 * aria-invalid:*, file:*, placeholder:*, selection:*, md:*) are baked
 * into the cn() input string and always present in cn() output; their
 * activation depends on browser stylesheet matching against the
 * corresponding attribute / pseudo-class, NOT on whether they appear
 * in the className. Mirrors Badge.test.tsx / Alert.test.tsx /
 * Toggle.test.tsx layout (PRs #105 / #104 / #109).
 */

describe('Input', () => {
  describe('default rendering', () => {
    it('renders exactly one <input> with data-slot="input" and the full unconditional cn() base', () => {
      const { container } = render(
        <Input data-testid="input-default" aria-label="default" />
      )
      const element = screen.getByTestId('input-default')

      // Exactly one top-level child, no portal / wrapper elements.
      expect(container.children).toHaveLength(1)
      expect(element.tagName).toBe('INPUT')
      expect(element).toHaveAttribute('data-slot', 'input')

      // No type prop -> React default 'text' on the rendered element.
      expect((element as HTMLInputElement).type).toBe('text')

      // Layout / structural base tokens.
      expect(element).toHaveClass('h-9')
      expect(element).toHaveClass('w-full')
      expect(element).toHaveClass('min-w-0')
      expect(element).toHaveClass('rounded-[var(--radius)]')
      expect(element).toHaveClass('border')
      expect(element).toHaveClass('border-[color:var(--border)]')
      expect(element).toHaveClass('bg-transparent')
      expect(element).toHaveClass('px-3')
      expect(element).toHaveClass('py-1')
      expect(element).toHaveClass('text-base')
      expect(element).toHaveClass('shadow-xs')
      expect(element).toHaveClass('transition-[color,box-shadow]')
      expect(element).toHaveClass('outline-none')
      expect(element).toHaveClass('md:text-sm')

      // file:* tokens (Tailwind variants, always present in cn() output).
      expect(element).toHaveClass('file:inline-flex')
      expect(element).toHaveClass('file:h-7')
      expect(element).toHaveClass('file:border-0')
      expect(element).toHaveClass('file:bg-transparent')
      expect(element).toHaveClass('file:text-sm')
      expect(element).toHaveClass('file:font-medium')
      expect(element).toHaveClass('file:text-[color:var(--foreground)]')

      // placeholder:* and selection:* tokens.
      expect(element).toHaveClass(
        'placeholder:text-[color:var(--muted-foreground)]'
      )
      expect(element).toHaveClass('selection:bg-[color:var(--primary)]')
      expect(element).toHaveClass(
        'selection:text-[color:var(--primary-foreground)]'
      )

      // focus-visible:* tokens (always in cn() output; CSS activates
      // them on actual focus).
      expect(element).toHaveClass('focus-visible:ring-2')
      expect(element).toHaveClass('focus-visible:ring-[color:var(--ring)]')
      expect(element).toHaveClass('focus-visible:ring-offset-2')
      expect(element).toHaveClass(
        'focus-visible:ring-offset-[color:var(--background)]'
      )

      // aria-invalid:* tokens (always in cn() output).
      expect(element).toHaveClass(
        'aria-invalid:ring-[color:var(--destructive)]'
      )
      expect(element).toHaveClass(
        'aria-invalid:border-[color:var(--destructive)]'
      )

      // disabled:* tokens are unconditionally emitted by cn() — they
      // activate only when the browser sees the `disabled` attribute.
      // We re-verify this in the "disabled state" describe below; here
      // we just confirm they are in the base class list.
      expect(element).toHaveClass('disabled:pointer-events-none')
      expect(element).toHaveClass('disabled:cursor-not-allowed')
      expect(element).toHaveClass('disabled:opacity-50')
    })
  })

  describe('type forwarding', () => {
    it('defaults to type="text" when no `type` prop is passed', () => {
      render(<Input data-testid="input-no-type" aria-label="no type" />)
      const element = screen.getByTestId('input-no-type') as HTMLInputElement
      // React emits no `type` attribute when `type` is undefined; the
      // browser then treats the input as type="text".
      expect(element.type).toBe('text')
      expect(element.hasAttribute('type')).toBe(false)
    })

    it('forwards type="email" to the rendered <input>', () => {
      render(
        <Input data-testid="input-email" aria-label="email" type="email" />
      )
      const element = screen.getByTestId('input-email') as HTMLInputElement
      expect(element.type).toBe('email')
      expect(element).toHaveAttribute('type', 'email')
    })

    it('forwards type="password" to the rendered <input>', () => {
      render(
        <Input
          data-testid="input-password"
          aria-label="password"
          type="password"
        />
      )
      const element = screen.getByTestId('input-password') as HTMLInputElement
      expect(element.type).toBe('password')
      expect(element).toHaveAttribute('type', 'password')
    })

    it('forwards type="number" to the rendered <input>', () => {
      render(
        <Input data-testid="input-number" aria-label="number" type="number" />
      )
      const element = screen.getByTestId('input-number') as HTMLInputElement
      expect(element.type).toBe('number')
      expect(element).toHaveAttribute('type', 'number')
    })
  })

  describe('className merge', () => {
    it('appends a custom className and preserves the base cn() classes', () => {
      render(
        <Input
          data-testid="input-merged"
          aria-label="merged"
          className="custom-class mt-2"
        />
      )
      const element = screen.getByTestId('input-merged')

      // Custom classes are appended.
      expect(element).toHaveClass('custom-class')
      expect(element).toHaveClass('mt-2')

      // Base classes survive the merge.
      expect(element).toHaveClass('h-9')
      expect(element).toHaveClass('w-full')
      expect(element).toHaveClass('rounded-[var(--radius)]')
      expect(element).toHaveClass('border')
      expect(element).toHaveClass('bg-transparent')
      expect(element).toHaveClass('px-3')
      expect(element).toHaveClass('py-1')
      expect(element).toHaveClass('focus-visible:ring-2')
    })
  })

  describe('prop forwarding', () => {
    it('forwards id, name, placeholder, defaultValue, aria-* and data-* attributes', () => {
      render(
        <Input
          data-testid="input-props"
          id="my-input"
          name="email-field"
          placeholder="you@example.com"
          defaultValue="hello"
          aria-describedby="helper"
          data-track="signup"
          aria-label="forwarded"
        />
      )
      const element = screen.getByTestId('input-props')

      expect(element).toHaveAttribute('id', 'my-input')
      expect(element).toHaveAttribute('name', 'email-field')
      expect(element).toHaveAttribute('placeholder', 'you@example.com')
      expect((element as HTMLInputElement).defaultValue).toBe('hello')
      expect(element).toHaveAttribute('aria-describedby', 'helper')
      expect(element).toHaveAttribute('aria-label', 'forwarded')
      expect(element).toHaveAttribute('data-track', 'signup')
    })

    it('forwards readOnly, required, autoComplete, maxLength, minLength and pattern', () => {
      render(
        <Input
          data-testid="input-constraints"
          aria-label="constraints"
          readOnly
          required
          autoComplete="email"
          maxLength={32}
          minLength={2}
          pattern="[a-z]+"
        />
      )
      const element = screen.getByTestId(
        'input-constraints'
      ) as HTMLInputElement

      expect(element.readOnly).toBe(true)
      expect(element.required).toBe(true)
      expect(element).toHaveAttribute('autocomplete', 'email')
      expect(element.maxLength).toBe(32)
      expect(element.minLength).toBe(2)
      expect(element).toHaveAttribute('pattern', '[a-z]+')
    })

    it('forwards onChange, onFocus, onBlur, onKeyDown and onClick handlers', () => {
      const onChange = vi.fn()
      const onFocus = vi.fn()
      const onBlur = vi.fn()
      const onKeyDown = vi.fn()
      const onClick = vi.fn()

      render(
        <Input
          data-testid="input-handlers"
          aria-label="handlers"
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onClick={onClick}
        />
      )
      const element = screen.getByTestId('input-handlers')

      fireEvent.click(element)
      expect(onClick).toHaveBeenCalledTimes(1)

      fireEvent.focus(element)
      expect(onFocus).toHaveBeenCalledTimes(1)

      fireEvent.blur(element)
      expect(onBlur).toHaveBeenCalledTimes(1)

      fireEvent.change(element, { target: { value: 'x' } })
      expect(onChange).toHaveBeenCalledTimes(1)

      fireEvent.keyDown(element, { key: 'Enter' })
      expect(onKeyDown).toHaveBeenCalledTimes(1)
    })
  })

  describe('disabled state', () => {
    it('renders the disabled attribute when disabled={true} and omits it when disabled={false} or absent', () => {
      const { rerender } = render(
        <Input
          data-testid="input-disabled-true"
          aria-label="disabled true"
          disabled
        />
      )
      const enabledEl = screen.getByTestId(
        'input-disabled-true'
      ) as HTMLInputElement
      expect(enabledEl.disabled).toBe(true)
      expect(enabledEl).toHaveAttribute('disabled')

      rerender(
        <Input
          data-testid="input-disabled-true"
          aria-label="disabled true"
          disabled={false}
        />
      )
      const explicitlyEnabledEl = screen.getByTestId(
        'input-disabled-true'
      ) as HTMLInputElement
      expect(explicitlyEnabledEl.disabled).toBe(false)
      // React does not emit `disabled=""` when the prop is false.
      expect(explicitlyEnabledEl.hasAttribute('disabled')).toBe(false)

      rerender(
        <Input data-testid="input-disabled-true" aria-label="disabled true" />
      )
      const omittedEl = screen.getByTestId(
        'input-disabled-true'
      ) as HTMLInputElement
      expect(omittedEl.disabled).toBe(false)
      expect(omittedEl.hasAttribute('disabled')).toBe(false)
    })

    it('always emits disabled:* classes in cn() output, regardless of the disabled prop', () => {
      render(
        <Input
          data-testid="input-disabled-classes"
          aria-label="disabled classes"
        />
      )
      const element = screen.getByTestId('input-disabled-classes')
      // The disabled:* tokens are in the base cn() block; cn() always
      // emits them. Activation depends on the browser matching the
      // `:disabled` pseudo-class against the disabled attribute, not
      // on the className containing these tokens.
      expect(element).toHaveClass('disabled:pointer-events-none')
      expect(element).toHaveClass('disabled:cursor-not-allowed')
      expect(element).toHaveClass('disabled:opacity-50')
    })
  })

  describe('invalid state (aria-invalid)', () => {
    it('renders aria-invalid="true" when the prop is the string "true"', () => {
      render(
        <Input
          data-testid="input-invalid-true"
          aria-label="invalid true"
          aria-invalid="true"
        />
      )
      const element = screen.getByTestId('input-invalid-true')
      expect(element).toHaveAttribute('aria-invalid', 'true')
    })

    it('omits the aria-invalid attribute when the prop is absent', () => {
      render(<Input data-testid="input-invalid-omitted" aria-label="omitted" />)
      const element = screen.getByTestId('input-invalid-omitted')
      // React skips aria-invalid entirely when it is undefined; the
      // implicit default is "false", which React expresses by simply
      // not emitting the attribute.
      expect(element.hasAttribute('aria-invalid')).toBe(false)
    })

    it('always emits aria-invalid:* classes in cn() output, regardless of the aria-invalid prop', () => {
      render(<Input data-testid="input-invalid-classes" aria-label="classes" />)
      const element = screen.getByTestId('input-invalid-classes')
      expect(element).toHaveClass(
        'aria-invalid:ring-[color:var(--destructive)]'
      )
      expect(element).toHaveClass(
        'aria-invalid:border-[color:var(--destructive)]'
      )
    })
  })

  describe('focus interaction', () => {
    it('receives focus on .focus() and becomes the document active element', () => {
      render(<Input data-testid="input-focus" aria-label="focus" />)
      const element = screen.getByTestId('input-focus') as HTMLInputElement

      expect(document.activeElement).not.toBe(element)
      element.focus()
      expect(document.activeElement).toBe(element)
    })

    it('always emits focus-visible:* classes in cn() output, regardless of focus state', () => {
      render(<Input data-testid="input-focus-classes" aria-label="fv" />)
      const element = screen.getByTestId('input-focus-classes')
      // focus-visible:* tokens live in their own cn() block. cn() emits
      // them on every render — whether they paint anything is decided
      // by the browser when the :focus-visible pseudo-class matches.
      expect(element).toHaveClass('focus-visible:ring-2')
      expect(element).toHaveClass('focus-visible:ring-[color:var(--ring)]')
      expect(element).toHaveClass('focus-visible:ring-offset-2')
      expect(element).toHaveClass(
        'focus-visible:ring-offset-[color:var(--background)]'
      )
    })
  })
})
