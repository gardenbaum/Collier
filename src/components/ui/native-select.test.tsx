import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from './native-select'

/**
 * These tests cover the NativeSelect primitive declared in
 * src/components/ui/native-select.tsx (currently 0% coverage, 48 lines).
 *
 * NativeSelect is a small cluster of three function components:
 *  - NativeSelect renders a <div data-slot="native-select-wrapper"> that
 *    wraps a <select data-slot="native-select"> and a decorative
 *    <ChevronDownIcon aria-hidden="true" data-slot="native-select-icon">.
 *  - NativeSelectOption is a thin <option data-slot="native-select-option">
 *    wrapper that forwards every prop.
 *  - NativeSelectOptGroup is a thin <optgroup data-slot="native-select-optgroup">
 *    wrapper that merges a custom className via cn() and forwards the rest.
 *
 * The select's className is built from a single cn() block:
 *   1. base (layout + border/placeholder/selection/disabled tokens)
 *   2. focus-visible:ring-* tokens
 *   3. aria-invalid:ring-/border-* tokens
 *   4. the custom className passed in by the caller
 *
 * The wrapper div carries the unconditional has-[select:disabled]:opacity-50
 * class — activation depends on the browser matching the descendant
 * :disabled pseudo-class against the nested <select>'s disabled
 * attribute, NOT on whether the className contains the token (cn() always
 * emits it). Mirrors the input.test.tsx (PR #111) / textarea.test.tsx
 * (PR #112) layout — adds the wrapper-div describe and the
 * Option/OptGroup cluster describe.
 */

describe('NativeSelect', () => {
  describe('default rendering', () => {
    it('renders a wrapper <div data-slot="native-select-wrapper"> containing exactly one <select data-slot="native-select"> and one ChevronDownIcon', () => {
      const { container } = render(
        <NativeSelect data-testid="native-select-default" aria-label="default">
          <NativeSelectOption value="a">A</NativeSelectOption>
          <NativeSelectOption value="b">B</NativeSelectOption>
        </NativeSelect>
      )

      // Exactly one top-level child: the wrapper <div>.
      expect(container.children).toHaveLength(1)

      const wrapper = container.children[0] as HTMLElement
      expect(wrapper.tagName).toBe('DIV')
      expect(wrapper).toHaveAttribute('data-slot', 'native-select-wrapper')

      // Wrapper carries the unconditional layout + descendant-disabled
      // tokens — always in cn() output regardless of the disabled prop.
      expect(wrapper).toHaveClass('group/native-select')
      expect(wrapper).toHaveClass('relative')
      expect(wrapper).toHaveClass('w-fit')
      expect(wrapper).toHaveClass('has-[select:disabled]:opacity-50')

      // Wrapper must contain exactly one <select>.
      const selects = wrapper.querySelectorAll('select')
      expect(selects).toHaveLength(1)
      const select = screen.getByTestId(
        'native-select-default'
      ) as HTMLSelectElement
      expect(select.tagName).toBe('SELECT')
      expect(select).toHaveAttribute('data-slot', 'native-select')

      // Wrapper must contain the decorative ChevronDownIcon (svg).
      const icon = wrapper.querySelector('[data-slot="native-select-icon"]')
      expect(icon).not.toBeNull()
      expect(icon?.tagName).toBe('svg')
      expect(icon).toHaveAttribute('aria-hidden', 'true')

      // Wrapper children = [<select>, <svg>] only — no extras.
      expect(wrapper.children).toHaveLength(2)
    })

    it('renders the select with the full unconditional cn() base classes (layout, border, placeholder, selection, disabled tokens)', () => {
      render(
        <NativeSelect
          data-testid="native-select-base"
          aria-label="base classes"
        >
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      )
      const element = screen.getByTestId('native-select-base')

      // Layout / structural base tokens.
      expect(element).toHaveClass('h-9')
      expect(element).toHaveClass('w-full')
      expect(element).toHaveClass('min-w-0')
      expect(element).toHaveClass('appearance-none')
      expect(element).toHaveClass('rounded-[var(--radius)]')
      expect(element).toHaveClass('border')
      expect(element).toHaveClass('border-[color:var(--border)]')
      expect(element).toHaveClass('bg-transparent')
      expect(element).toHaveClass('px-3')
      expect(element).toHaveClass('py-2')
      // Right padding clears the absolute-positioned chevron icon.
      expect(element).toHaveClass('pr-9')
      expect(element).toHaveClass('text-sm')
      expect(element).toHaveClass('shadow-xs')
      expect(element).toHaveClass('transition-[color,box-shadow]')
      expect(element).toHaveClass('outline-none')

      // placeholder:* and selection:* tokens.
      expect(element).toHaveClass(
        'placeholder:text-[color:var(--muted-foreground)]'
      )
      expect(element).toHaveClass('selection:bg-[color:var(--primary)]')
      expect(element).toHaveClass(
        'selection:text-[color:var(--primary-foreground)]'
      )

      // disabled:* tokens are unconditionally emitted by cn() — they
      // activate only when the browser sees the disabled attribute.
      expect(element).toHaveClass('disabled:pointer-events-none')
      expect(element).toHaveClass('disabled:cursor-not-allowed')
    })

    it('always emits focus-visible:* and aria-invalid:* tokens in cn() output, regardless of focus or aria-invalid state', () => {
      render(
        <NativeSelect data-testid="native-select-tokens" aria-label="tokens">
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      )
      const element = screen.getByTestId('native-select-tokens')

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
    })

    it('renders the chevron icon with the absolute-positioning + opacity classes', () => {
      const { container } = render(
        <NativeSelect data-testid="native-select-icon" aria-label="icon">
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      )
      const icon = container.querySelector(
        '[data-slot="native-select-icon"]'
      ) as HTMLElement
      expect(icon).not.toBeNull()
      expect(icon).toHaveClass('text-[color:var(--muted-foreground)]')
      expect(icon).toHaveClass('pointer-events-none')
      expect(icon).toHaveClass('absolute')
      expect(icon).toHaveClass('top-1/2')
      expect(icon).toHaveClass('right-3.5')
      expect(icon).toHaveClass('size-4')
      expect(icon).toHaveClass('-translate-y-1/2')
      expect(icon).toHaveClass('opacity-50')
      expect(icon).toHaveClass('select-none')
    })
  })

  describe('className merge', () => {
    it('appends a custom className onto the select and preserves the base cn() classes', () => {
      render(
        <NativeSelect
          className="custom-class mt-2"
          data-testid="native-select-merged"
          aria-label="merged"
        >
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      )
      const element = screen.getByTestId('native-select-merged')

      // Custom classes are appended.
      expect(element).toHaveClass('custom-class')
      expect(element).toHaveClass('mt-2')

      // Base classes survive the merge.
      expect(element).toHaveClass('h-9')
      expect(element).toHaveClass('w-full')
      expect(element).toHaveClass('min-w-0')
      expect(element).toHaveClass('rounded-[var(--radius)]')
      expect(element).toHaveClass('border')
      expect(element).toHaveClass('bg-transparent')
      expect(element).toHaveClass('px-3')
      expect(element).toHaveClass('pr-9')
      expect(element).toHaveClass('focus-visible:ring-2')
      expect(element).toHaveClass(
        'aria-invalid:ring-[color:var(--destructive)]'
      )
      expect(element).toHaveClass(
        'placeholder:text-[color:var(--muted-foreground)]'
      )
    })

    it('does not propagate a custom className onto the wrapper div (it stays on the <select>)', () => {
      const { container } = render(
        <NativeSelect
          className="only-on-select"
          data-testid="native-select-wrapper-class"
          aria-label="wrapper class"
        >
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      )
      const wrapper = container.children[0] as HTMLElement
      const select = screen.getByTestId(
        'native-select-wrapper-class'
      ) as HTMLSelectElement

      expect(select).toHaveClass('only-on-select')
      expect(wrapper).not.toHaveClass('only-on-select')
      // Wrapper retains its unconditional classes.
      expect(wrapper).toHaveClass('group/native-select')
      expect(wrapper).toHaveClass('has-[select:disabled]:opacity-50')
    })
  })

  describe('prop forwarding', () => {
    it('forwards id, name, defaultValue, required, aria-* and data-* attributes onto the <select>', () => {
      render(
        <NativeSelect
          aria-describedby="helper"
          aria-label="forwarded"
          data-testid="native-select-props"
          data-track="signup"
          defaultValue="b"
          id="my-select"
          name="region-field"
          required
        >
          <NativeSelectOption value="a">A</NativeSelectOption>
          <NativeSelectOption value="b">B</NativeSelectOption>
        </NativeSelect>
      )
      const element = screen.getByTestId('native-select-props')

      const select = element as HTMLSelectElement
      expect(element).toHaveAttribute('id', 'my-select')
      expect(element).toHaveAttribute('name', 'region-field')
      // <select> does not expose a `defaultValue` DOM property like
      // <input> does; the controlled `defaultValue` prop is reconciled
      // by React by selecting the matching <option>. Verify the
      // selected option carries the expected value.
      expect(select.selectedIndex).toBe(1)
      expect(select.options[1]?.value).toBe('b')
      expect(select.options[1]?.defaultSelected).toBe(true)
      expect(element).toHaveAttribute('required')
      expect(element).toHaveAttribute('aria-describedby', 'helper')
      expect(element).toHaveAttribute('aria-label', 'forwarded')
      expect(element).toHaveAttribute('data-track', 'signup')
    })

    it('forwards a controlled value prop when paired with an onChange handler', () => {
      const onChange = vi.fn()
      render(
        <NativeSelect
          aria-label="controlled"
          data-testid="native-select-controlled"
          onChange={onChange}
          value="b"
        >
          <NativeSelectOption value="a">A</NativeSelectOption>
          <NativeSelectOption value="b">B</NativeSelectOption>
        </NativeSelect>
      )
      const element = screen.getByTestId(
        'native-select-controlled'
      ) as HTMLSelectElement

      expect(element.value).toBe('b')
    })

    it('fires the onChange handler when a different option is selected', () => {
      const onChange = vi.fn()
      render(
        <NativeSelect
          aria-label="onchange"
          data-testid="native-select-onchange"
          onChange={onChange}
        >
          <NativeSelectOption value="a">A</NativeSelectOption>
          <NativeSelectOption value="b">B</NativeSelectOption>
        </NativeSelect>
      )
      const element = screen.getByTestId(
        'native-select-onchange'
      ) as HTMLSelectElement

      fireEvent.change(element, { target: { value: 'b' } })
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('forwards onFocus, onBlur and onKeyDown handlers', () => {
      const onFocus = vi.fn()
      const onBlur = vi.fn()
      const onKeyDown = vi.fn()

      render(
        <NativeSelect
          aria-label="handlers"
          data-testid="native-select-handlers"
          onBlur={onBlur}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
        >
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      )
      const element = screen.getByTestId('native-select-handlers')

      fireEvent.focus(element)
      expect(onFocus).toHaveBeenCalledTimes(1)

      fireEvent.blur(element)
      expect(onBlur).toHaveBeenCalledTimes(1)

      fireEvent.keyDown(element, { key: 'Enter' })
      expect(onKeyDown).toHaveBeenCalledTimes(1)
    })
  })

  describe('disabled state', () => {
    it('renders the disabled attribute when disabled={true} and omits it when absent', () => {
      const { rerender } = render(
        <NativeSelect
          aria-label="disabled true"
          data-testid="native-select-disabled"
          disabled
        >
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      )
      const disabledEl = screen.getByTestId(
        'native-select-disabled'
      ) as HTMLSelectElement
      expect(disabledEl.disabled).toBe(true)
      expect(disabledEl).toHaveAttribute('disabled')

      rerender(
        <NativeSelect
          aria-label="disabled omitted"
          data-testid="native-select-disabled"
        >
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      )
      const omittedEl = screen.getByTestId(
        'native-select-disabled'
      ) as HTMLSelectElement
      expect(omittedEl.disabled).toBe(false)
      expect(omittedEl.hasAttribute('disabled')).toBe(false)
    })

    it('always emits has-[select:disabled]:opacity-50 on the wrapper div, regardless of the disabled prop', () => {
      const { rerender, container } = render(
        <NativeSelect
          aria-label="disabled wrapper classes"
          data-testid="native-select-disabled-classes"
        >
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      )
      const wrapperBefore = container.children[0] as HTMLElement
      // The has-[select:disabled]:* tokens live in the wrapper's
      // unconditional cn() string. cn() always emits them; activation
      // depends on the browser matching the descendant :disabled
      // pseudo-class against the inner <select>'s disabled attribute.
      expect(wrapperBefore).toHaveClass('has-[select:disabled]:opacity-50')

      rerender(
        <NativeSelect
          aria-label="disabled wrapper classes"
          data-testid="native-select-disabled-classes"
          disabled
        >
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      )
      const wrapperAfter = container.children[0] as HTMLElement
      expect(wrapperAfter).toHaveClass('has-[select:disabled]:opacity-50')
    })

    it('always emits disabled:* classes in the select cn() output, regardless of the disabled prop', () => {
      render(
        <NativeSelect
          aria-label="disabled select classes"
          data-testid="native-select-disabled-select-classes"
        >
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      )
      const element = screen.getByTestId(
        'native-select-disabled-select-classes'
      )
      expect(element).toHaveClass('disabled:pointer-events-none')
      expect(element).toHaveClass('disabled:cursor-not-allowed')
    })
  })

  describe('invalid state (aria-invalid)', () => {
    it('renders aria-invalid="true" when the prop is the string "true"', () => {
      render(
        <NativeSelect
          aria-invalid="true"
          aria-label="invalid true"
          data-testid="native-select-invalid-true"
        >
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      )
      const element = screen.getByTestId('native-select-invalid-true')
      expect(element).toHaveAttribute('aria-invalid', 'true')
    })

    it('omits the aria-invalid attribute when the prop is absent', () => {
      render(
        <NativeSelect
          aria-label="invalid omitted"
          data-testid="native-select-invalid-omitted"
        >
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      )
      const element = screen.getByTestId('native-select-invalid-omitted')
      // React skips aria-invalid entirely when it is undefined; the
      // implicit default is "false", which React expresses by simply
      // not emitting the attribute.
      expect(element.hasAttribute('aria-invalid')).toBe(false)
    })

    it('always emits aria-invalid:* classes in cn() output, regardless of the aria-invalid prop', () => {
      render(
        <NativeSelect
          aria-label="invalid classes"
          data-testid="native-select-invalid-classes"
        >
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      )
      const element = screen.getByTestId('native-select-invalid-classes')
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
      render(
        <NativeSelect aria-label="focus" data-testid="native-select-focus">
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      )
      const element = screen.getByTestId(
        'native-select-focus'
      ) as HTMLSelectElement

      expect(document.activeElement).not.toBe(element)
      element.focus()
      expect(document.activeElement).toBe(element)
    })

    it('always emits focus-visible:* classes in cn() output, regardless of focus state', () => {
      render(
        <NativeSelect
          aria-label="focus visible classes"
          data-testid="native-select-focus-classes"
        >
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      )
      const element = screen.getByTestId('native-select-focus-classes')
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

describe('NativeSelectOption', () => {
  it('renders a native <option> with data-slot="native-select-option"', () => {
    render(
      <NativeSelect aria-label="container">
        <NativeSelectOption data-testid="option-default" value="a">
          A
        </NativeSelectOption>
      </NativeSelect>
    )
    const element = screen.getByTestId('option-default')
    expect(element.tagName).toBe('OPTION')
    expect(element).toHaveAttribute('data-slot', 'native-select-option')
  })

  it('forwards value, label, disabled and aria-* attributes onto the <option>', () => {
    render(
      <NativeSelect aria-label="container">
        <NativeSelectOption
          aria-label="option a"
          data-testid="option-props"
          disabled
          label="A label"
          value="a"
        >
          A
        </NativeSelectOption>
      </NativeSelect>
    )
    const element = screen.getByTestId('option-props') as HTMLOptionElement
    expect(element.value).toBe('a')
    expect(element.label).toBe('A label')
    expect(element.disabled).toBe(true)
    expect(element).toHaveAttribute('aria-label', 'option a')
  })

  it('renders the children as the option label', () => {
    render(
      <NativeSelect aria-label="container">
        <NativeSelectOption data-testid="option-children" value="x">
          Hello world
        </NativeSelectOption>
      </NativeSelect>
    )
    const element = screen.getByTestId('option-children')
    expect(element.textContent).toBe('Hello world')
  })
})

describe('NativeSelectOptGroup', () => {
  it('renders a native <optgroup> with data-slot="native-select-optgroup" and forwards label', () => {
    render(
      <NativeSelect aria-label="container">
        <NativeSelectOptGroup data-testid="optgroup-default" label="Group A">
          <NativeSelectOption value="a">A</NativeSelectOption>
          <NativeSelectOption value="b">B</NativeSelectOption>
        </NativeSelectOptGroup>
      </NativeSelect>
    )
    const element = screen.getByTestId('optgroup-default')
    expect(element.tagName).toBe('OPTGROUP')
    expect(element).toHaveAttribute('data-slot', 'native-select-optgroup')
    expect(element).toHaveAttribute('label', 'Group A')
    // Children land inside the optgroup.
    expect(element.children).toHaveLength(2)
    expect(element.children[0]?.tagName).toBe('OPTION')
    expect(element.children[1]?.tagName).toBe('OPTION')
  })

  it('merges a custom className with cn() and forwards disabled + aria-* attributes', () => {
    render(
      <NativeSelect aria-label="container">
        <NativeSelectOptGroup
          aria-label="group x"
          className="custom-group-class italic"
          data-testid="optgroup-merged"
          disabled
          label="Group X"
        >
          <NativeSelectOption value="x">X</NativeSelectOption>
        </NativeSelectOptGroup>
      </NativeSelect>
    )
    const element = screen.getByTestId('optgroup-merged')
    // Custom classes are appended.
    expect(element).toHaveClass('custom-group-class')
    expect(element).toHaveClass('italic')
    // Forwarded props.
    expect(element).toHaveAttribute('aria-label', 'group x')
    expect((element as HTMLOptGroupElement).disabled).toBe(true)
  })

  it('renders without a className when the prop is absent (cn() handles undefined gracefully)', () => {
    render(
      <NativeSelect aria-label="container">
        <NativeSelectOptGroup data-testid="optgroup-no-class" label="Bare">
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelectOptGroup>
      </NativeSelect>
    )
    const element = screen.getByTestId('optgroup-no-class')
    expect(element).toHaveAttribute('data-slot', 'native-select-optgroup')
    // Element renders successfully even without a className; cn() returns
    // an empty string when the only argument is undefined.
    expect(element.tagName).toBe('OPTGROUP')
  })
})
