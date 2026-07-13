import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { Textarea } from './textarea'

/**
 * These tests cover the Textarea primitive declared in
 * src/components/ui/textarea.tsx (currently 0% coverage).
 *
 * Textarea is a single function component that:
 *  - renders a <textarea> element with `data-slot="textarea"`
 *  - drives its className through a single cn() block:
 *      layout + file/placeholder/disabled tokens + focus-visible:ring-*
 *      + aria-invalid:ring-/border-* tokens
 *  - merges a custom `className` via cn() and spreads the remaining
 *    <textarea> props onto the rendered element
 *
 * The pseudo-class variant classes (disabled:*, focus-visible:*,
 * aria-invalid:*, placeholder:*, md:*) are baked into the cn() input
 * string and always present in cn() output; their activation depends
 * on browser stylesheet matching against the corresponding attribute /
 * pseudo-class, NOT on whether they appear in the className. Mirrors
 * input.test.tsx (PR #111) — drops the type-forwarding block because
 * <textarea> has no `type` prop and swaps the input-only tokens
 * (h-9, min-w-0, py-1, file:*, selection:*) for textarea tokens
 * (flex, field-sizing-content, min-h-16, py-2).
 */

describe('Textarea', () => {
  describe('default rendering', () => {
    it('renders exactly one <textarea> with data-slot="textarea" and the full unconditional cn() base', () => {
      const { container } = render(
        <Textarea data-testid="textarea-default" aria-label="default" />
      )
      const element = screen.getByTestId('textarea-default')

      // Exactly one top-level child, no portal / wrapper elements.
      expect(container.children).toHaveLength(1)
      expect(element.tagName).toBe('TEXTAREA')
      expect(element).toHaveAttribute('data-slot', 'textarea')

      // Layout / structural base tokens.
      expect(element).toHaveClass('flex')
      expect(element).toHaveClass('field-sizing-content')
      expect(element).toHaveClass('min-h-16')
      expect(element).toHaveClass('w-full')
      expect(element).toHaveClass('rounded-[var(--radius)]')
      expect(element).toHaveClass('border')
      expect(element).toHaveClass('border-[color:var(--border)]')
      expect(element).toHaveClass('bg-transparent')
      expect(element).toHaveClass('px-3')
      expect(element).toHaveClass('py-2')
      expect(element).toHaveClass('text-base')
      expect(element).toHaveClass('shadow-xs')
      expect(element).toHaveClass('transition-[color,box-shadow]')
      expect(element).toHaveClass('outline-none')
      expect(element).toHaveClass('md:text-sm')

      // placeholder:* tokens (Tailwind variants, always present in cn() output).
      expect(element).toHaveClass(
        'placeholder:text-[color:var(--muted-foreground)]'
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
      expect(element).toHaveClass('disabled:cursor-not-allowed')
      expect(element).toHaveClass('disabled:opacity-50')
    })
  })

  describe('className merge', () => {
    it('appends a custom className and preserves the base cn() classes', () => {
      render(
        <Textarea
          data-testid="textarea-merged"
          aria-label="merged"
          className="custom-class mt-2"
        />
      )
      const element = screen.getByTestId('textarea-merged')

      // Custom classes are appended.
      expect(element).toHaveClass('custom-class')
      expect(element).toHaveClass('mt-2')

      // Base classes survive the merge.
      expect(element).toHaveClass('flex')
      expect(element).toHaveClass('field-sizing-content')
      expect(element).toHaveClass('min-h-16')
      expect(element).toHaveClass('w-full')
      expect(element).toHaveClass('rounded-[var(--radius)]')
      expect(element).toHaveClass('border')
      expect(element).toHaveClass('bg-transparent')
      expect(element).toHaveClass('px-3')
      expect(element).toHaveClass('py-2')
      expect(element).toHaveClass('focus-visible:ring-2')
      expect(element).toHaveClass(
        'placeholder:text-[color:var(--muted-foreground)]'
      )
    })
  })

  describe('prop forwarding', () => {
    it('forwards id, name, defaultValue, placeholder, aria-* and data-* attributes (uncontrolled)', () => {
      render(
        <Textarea
          data-testid="textarea-props"
          id="my-textarea"
          name="body-field"
          defaultValue="default body"
          placeholder="type something"
          aria-describedby="helper"
          data-track="signup"
          aria-label="forwarded"
        />
      )
      const element = screen.getByTestId('textarea-props')

      expect(element).toHaveAttribute('id', 'my-textarea')
      expect(element).toHaveAttribute('name', 'body-field')
      expect((element as HTMLTextAreaElement).defaultValue).toBe('default body')
      expect(element).toHaveAttribute('placeholder', 'type something')
      expect(element).toHaveAttribute('aria-describedby', 'helper')
      expect(element).toHaveAttribute('aria-label', 'forwarded')
      expect(element).toHaveAttribute('data-track', 'signup')
    })

    it('forwards a controlled value prop when paired with an onChange handler', () => {
      const onChange = vi.fn()
      render(
        <Textarea
          data-testid="textarea-controlled"
          aria-label="controlled"
          value="hello world"
          onChange={onChange}
        />
      )
      const element = screen.getByTestId(
        'textarea-controlled'
      ) as HTMLTextAreaElement

      expect(element.value).toBe('hello world')
    })

    it('forwards readOnly, required, maxLength, minLength, rows, cols and wrap', () => {
      render(
        <Textarea
          data-testid="textarea-constraints"
          aria-label="constraints"
          readOnly
          required
          maxLength={500}
          minLength={10}
          rows={8}
          cols={40}
          wrap="soft"
        />
      )
      const element = screen.getByTestId(
        'textarea-constraints'
      ) as HTMLTextAreaElement

      expect(element.readOnly).toBe(true)
      expect(element.required).toBe(true)
      expect(element.maxLength).toBe(500)
      expect(element.minLength).toBe(10)
      expect(element.rows).toBe(8)
      expect(element.cols).toBe(40)
      expect(element.wrap).toBe('soft')
    })

    it('forwards onChange, onFocus, onBlur, onKeyDown and onClick handlers', () => {
      const onChange = vi.fn()
      const onFocus = vi.fn()
      const onBlur = vi.fn()
      const onKeyDown = vi.fn()
      const onClick = vi.fn()

      render(
        <Textarea
          data-testid="textarea-handlers"
          aria-label="handlers"
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onClick={onClick}
        />
      )
      const element = screen.getByTestId('textarea-handlers')

      fireEvent.click(element)
      expect(onClick).toHaveBeenCalledTimes(1)

      fireEvent.focus(element)
      expect(onFocus).toHaveBeenCalledTimes(1)

      fireEvent.blur(element)
      expect(onBlur).toHaveBeenCalledTimes(1)

      fireEvent.input(element, { target: { value: 'typed text' } })
      expect(onChange).toHaveBeenCalledTimes(1)

      fireEvent.keyDown(element, { key: 'Enter' })
      expect(onKeyDown).toHaveBeenCalledTimes(1)
    })
  })

  describe('disabled state', () => {
    it('renders the disabled attribute when disabled={true} and omits it when disabled={false} or absent', () => {
      const { rerender } = render(
        <Textarea
          data-testid="textarea-disabled-true"
          aria-label="disabled true"
          disabled
        />
      )
      const enabledEl = screen.getByTestId(
        'textarea-disabled-true'
      ) as HTMLTextAreaElement
      expect(enabledEl.disabled).toBe(true)
      expect(enabledEl).toHaveAttribute('disabled')

      rerender(
        <Textarea
          data-testid="textarea-disabled-true"
          aria-label="disabled true"
          disabled={false}
        />
      )
      const explicitlyEnabledEl = screen.getByTestId(
        'textarea-disabled-true'
      ) as HTMLTextAreaElement
      expect(explicitlyEnabledEl.disabled).toBe(false)
      // React does not emit `disabled=""` when the prop is false.
      expect(explicitlyEnabledEl.hasAttribute('disabled')).toBe(false)

      rerender(
        <Textarea
          data-testid="textarea-disabled-true"
          aria-label="disabled true"
        />
      )
      const omittedEl = screen.getByTestId(
        'textarea-disabled-true'
      ) as HTMLTextAreaElement
      expect(omittedEl.disabled).toBe(false)
      expect(omittedEl.hasAttribute('disabled')).toBe(false)
    })

    it('always emits disabled:* classes in cn() output, regardless of the disabled prop', () => {
      render(
        <Textarea
          data-testid="textarea-disabled-classes"
          aria-label="disabled classes"
        />
      )
      const element = screen.getByTestId('textarea-disabled-classes')
      // The disabled:* tokens are in the base cn() block; cn() always
      // emits them. Activation depends on the browser matching the
      // `:disabled` pseudo-class against the disabled attribute, not
      // on the className containing these tokens.
      expect(element).toHaveClass('disabled:cursor-not-allowed')
      expect(element).toHaveClass('disabled:opacity-50')
    })
  })

  describe('invalid state (aria-invalid)', () => {
    it('renders aria-invalid="true" when the prop is the string "true"', () => {
      render(
        <Textarea
          data-testid="textarea-invalid-true"
          aria-label="invalid true"
          aria-invalid="true"
        />
      )
      const element = screen.getByTestId('textarea-invalid-true')
      expect(element).toHaveAttribute('aria-invalid', 'true')
    })

    it('omits the aria-invalid attribute when the prop is absent', () => {
      render(
        <Textarea data-testid="textarea-invalid-omitted" aria-label="omitted" />
      )
      const element = screen.getByTestId('textarea-invalid-omitted')
      // React skips aria-invalid entirely when it is undefined; the
      // implicit default is "false", which React expresses by simply
      // not emitting the attribute.
      expect(element.hasAttribute('aria-invalid')).toBe(false)
    })

    it('always emits aria-invalid:* classes in cn() output, regardless of the aria-invalid prop', () => {
      render(
        <Textarea data-testid="textarea-invalid-classes" aria-label="classes" />
      )
      const element = screen.getByTestId('textarea-invalid-classes')
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
      render(<Textarea data-testid="textarea-focus" aria-label="focus" />)
      const element = screen.getByTestId(
        'textarea-focus'
      ) as HTMLTextAreaElement

      expect(document.activeElement).not.toBe(element)
      element.focus()
      expect(document.activeElement).toBe(element)
    })

    it('always emits focus-visible:* classes in cn() output, regardless of focus state', () => {
      render(<Textarea data-testid="textarea-focus-classes" aria-label="fv" />)
      const element = screen.getByTestId('textarea-focus-classes')
      // focus-visible:* tokens live in the same cn() block as the rest
      // of the base classes. cn() emits them on every render — whether
      // they paint anything is decided by the browser when the
      // :focus-visible pseudo-class matches.
      expect(element).toHaveClass('focus-visible:ring-2')
      expect(element).toHaveClass('focus-visible:ring-[color:var(--ring)]')
      expect(element).toHaveClass('focus-visible:ring-offset-2')
      expect(element).toHaveClass(
        'focus-visible:ring-offset-[color:var(--background)]'
      )
    })
  })
})
