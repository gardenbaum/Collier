import { useRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from './input-group'

/**
 * These tests cover the six thin wrappers declared in
 * src/components/ui/input-group.tsx (currently 0% coverage).
 *
 * `InputGroup` is the root <div> that adds the data-slot, role=group,
 * and a long cn()-merged Tailwind class chain that includes
 * `has-[>...]` selectors for the four addon alignments and the
 * focus/error states. `InputGroupAddon` and `InputGroupButton` are
 * driven by class-variance-authority (align / size respectively) so
 * every variant needs to be exercised to hit 100% branches inside
 * the cva switch. `InputGroupAddon` additionally wires an `onClick`
 * handler that focuses the sibling <input> via `parentElement
 * ?.querySelector('input')?.focus()` — the early-return guard
 * (`closest('button')`) and both sides of the optional chain
 * (parent has input sibling vs. no input child) need explicit
 * positive and negative coverage. `InputGroupText`,
 * `InputGroupInput`, and `InputGroupTextarea` are simple
 * forwarding wrappers around <span>, <Input>, and <Textarea>.
 */

/* -------------------------------------------------------------------------- */
/*  InputGroup (root)                                                         */
/* -------------------------------------------------------------------------- */

describe('InputGroup', () => {
  it('renders a <div role="group"> with the input-group data slot and base classes', () => {
    render(<InputGroup data-testid="input-group">children</InputGroup>)

    const root = screen.getByTestId('input-group')
    expect(root.tagName).toBe('DIV')
    expect(root).toHaveAttribute('role', 'group')
    expect(root).toHaveAttribute('data-slot', 'input-group')
    expect(root).toHaveTextContent('children')

    // Representative base classes from the long cn() call.
    expect(root).toHaveClass('relative')
    expect(root).toHaveClass('flex')
    expect(root).toHaveClass('w-full')
    expect(root).toHaveClass('items-center')
    expect(root).toHaveClass('rounded-[var(--radius)]')
    expect(root).toHaveClass('border')
    expect(root).toHaveClass('shadow-xs')
    expect(root).toHaveClass('h-9')
    expect(root).toHaveClass('min-w-0')
    expect(root).toHaveClass('group/input-group')
    // The :has() selectors used to react to the four addon alignments
    // and to focus / aria-invalid states on the inner control are part
    // of the always-on class chain — assert that the most distinctive
    // ones make it through Tailwind merge.
    expect(root).toHaveClass('has-[>textarea]:h-auto')
    expect(root).toHaveClass(
      'has-[[data-slot=input-group-control]:focus-visible]:ring-2'
    )
  })

  it('merges a custom className through cn() and forwards extra div props', () => {
    const handleClick = vi.fn()
    render(
      <InputGroup
        aria-label="group label"
        className="my-custom-wrapper"
        data-custom="custom-value"
        data-testid="input-group-forwarded"
        hidden
        id="group-id"
        onClick={handleClick}
      >
        body
      </InputGroup>
    )

    const root = screen.getByTestId('input-group-forwarded')
    expect(root).toHaveClass('my-custom-wrapper')
    expect(root).toHaveAttribute('id', 'group-id')
    expect(root).toHaveAttribute('aria-label', 'group label')
    expect(root).toHaveAttribute('data-custom', 'custom-value')
    expect(root).toHaveAttribute('hidden')

    fireEvent.click(root)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})

/* -------------------------------------------------------------------------- */
/*  InputGroupAddon                                                           */
/* -------------------------------------------------------------------------- */

describe('InputGroupAddon', () => {
  it('defaults to align="inline-start" and applies the cva classes for that variant', () => {
    render(<InputGroupAddon data-testid="addon-default">@icon</InputGroupAddon>)

    const addon = screen.getByTestId('addon-default')
    expect(addon.tagName).toBe('DIV')
    expect(addon).toHaveAttribute('data-slot', 'input-group-addon')
    expect(addon).toHaveAttribute('data-align', 'inline-start')
    expect(addon).toHaveClass('order-first')
    expect(addon).toHaveClass('pl-3')
    // Cva base classes — independent of the variant.
    expect(addon).toHaveClass('flex')
    expect(addon).toHaveClass('cursor-text')
    expect(addon).toHaveClass('select-none')
  })

  it('switches to the inline-end alignment when align="inline-end" is passed', () => {
    render(
      <InputGroupAddon align="inline-end" data-testid="addon-inline-end">
        @icon
      </InputGroupAddon>
    )

    const addon = screen.getByTestId('addon-inline-end')
    expect(addon).toHaveAttribute('data-align', 'inline-end')
    expect(addon).toHaveClass('order-last')
    expect(addon).toHaveClass('pr-3')
    // inline-start-only classes must NOT be present.
    expect(addon).not.toHaveClass('order-first')
    expect(addon).not.toHaveClass('pl-3')
  })

  it('switches to block-start alignment when align="block-start" is passed', () => {
    render(
      <InputGroupAddon align="block-start" data-testid="addon-block-start">
        @label
      </InputGroupAddon>
    )

    const addon = screen.getByTestId('addon-block-start')
    expect(addon).toHaveAttribute('data-align', 'block-start')
    expect(addon).toHaveClass('order-first')
    expect(addon).toHaveClass('w-full')
    expect(addon).toHaveClass('justify-start')
    expect(addon).toHaveClass('px-3')
    expect(addon).toHaveClass('pt-3')
  })

  it('switches to block-end alignment when align="block-end" is passed', () => {
    render(
      <InputGroupAddon align="block-end" data-testid="addon-block-end">
        @label
      </InputGroupAddon>
    )

    const addon = screen.getByTestId('addon-block-end')
    expect(addon).toHaveAttribute('data-align', 'block-end')
    expect(addon).toHaveClass('order-last')
    expect(addon).toHaveClass('w-full')
    expect(addon).toHaveClass('justify-start')
    expect(addon).toHaveClass('px-3')
    expect(addon).toHaveClass('pb-3')
  })

  it('merges a custom className and forwards arbitrary div props', () => {
    const handleClick = vi.fn()
    render(
      <InputGroupAddon
        aria-label="addon label"
        className="my-custom-addon"
        data-testid="addon-forwarded"
        id="addon-id"
        onClick={handleClick}
      >
        <span>x</span>
      </InputGroupAddon>
    )

    const addon = screen.getByTestId('addon-forwarded')
    expect(addon).toHaveClass('my-custom-addon')
    expect(addon).toHaveClass('order-first')
    expect(addon).toHaveAttribute('id', 'addon-id')
    expect(addon).toHaveAttribute('aria-label', 'addon label')

    fireEvent.click(addon)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('does NOT focus a sibling <input> when the click target is inside a <button>', () => {
    render(
      <InputGroup>
        <InputGroupAddon align="inline-start" data-testid="addon-with-button">
          <button type="button">focusable child</button>
        </InputGroupAddon>
        <InputGroupInput aria-label="target" />
      </InputGroup>
    )

    const addon = screen.getByTestId('addon-with-button')
    const button = addon.querySelector('button') as HTMLButtonElement

    // Spy on the input's focus method AFTER the render — the spy captures
    // any focus() call made by the addon's onClick handler.
    const target = screen.getByLabelText('target')
    const focusSpy = vi.spyOn(target, 'focus')

    fireEvent.click(button)

    // The addon's onClick should early-return because e.target.closest('button')
    // resolves to the button we just clicked.
    expect(focusSpy).not.toHaveBeenCalled()
  })

  it('focuses a sibling <input> when the click target is not inside a <button>', () => {
    render(
      <InputGroup>
        <InputGroupAddon align="inline-start" data-testid="addon-no-button">
          <span data-testid="addon-icon">@</span>
        </InputGroupAddon>
        <InputGroupInput aria-label="target" />
      </InputGroup>
    )

    const target = screen.getByLabelText('target') as HTMLInputElement
    const focusSpy = vi.spyOn(target, 'focus')

    const icon = screen.getByTestId('addon-icon')
    fireEvent.click(icon)

    // closest('button') returns null for the span, so the handler
    // continues to the parentElement?.querySelector('input')?.focus() line.
    expect(focusSpy).toHaveBeenCalledTimes(1)
  })

  it('tolerates an addon without an input sibling (optional chain short-circuits)', () => {
    // Render an InputGroupAddon without an InputGroupInput/Textarea
    // child — querySelector('input') will return null and the trailing
    // ?.focus() must short-circuit without throwing.
    expect(() => {
      render(
        <InputGroup>
          <InputGroupAddon align="inline-start" data-testid="addon-orphan">
            <span data-testid="orphan-icon">@</span>
          </InputGroupAddon>
        </InputGroup>
      )

      const icon = screen.getByTestId('orphan-icon')
      fireEvent.click(icon)
    }).not.toThrow()
  })
})

/* -------------------------------------------------------------------------- */
/*  InputGroupButton                                                          */
/* -------------------------------------------------------------------------- */

describe('InputGroupButton', () => {
  it('applies default type=button, variant=ghost, and size=xs and forwards to <Button>', () => {
    render(
      <InputGroupButton data-testid="ig-button-default">
        Click me
      </InputGroupButton>
    )

    const button = screen.getByTestId('ig-button-default')
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('type', 'button')
    // The underlying Button sets data-slot="button".
    expect(button).toHaveAttribute('data-slot', 'button')
    // The InputGroupButton wrapper forwards the size via data-size so the
    // cva size classes can be selected from a parent group.
    expect(button).toHaveAttribute('data-size', 'xs')
    // ghost variant + xs cva size classes both come through cn().
    expect(button).toHaveClass('bg-transparent')
    expect(button).toHaveClass('h-6')
  })

  it('propagates the size=sm variant to data-size and cva classes', () => {
    render(
      <InputGroupButton data-testid="ig-button-sm" size="sm">
        Sm
      </InputGroupButton>
    )

    const button = screen.getByTestId('ig-button-sm')
    expect(button).toHaveAttribute('data-size', 'sm')
    expect(button).toHaveClass('h-8')
  })

  it('propagates the size=icon-xs variant', () => {
    render(
      <InputGroupButton data-testid="ig-button-icon-xs" size="icon-xs">
        X
      </InputGroupButton>
    )

    const button = screen.getByTestId('ig-button-icon-xs')
    expect(button).toHaveAttribute('data-size', 'icon-xs')
    expect(button).toHaveClass('size-6')
    expect(button).toHaveClass('p-0')
  })

  it('propagates the size=icon-sm variant', () => {
    render(
      <InputGroupButton data-testid="ig-button-icon-sm" size="icon-sm">
        Y
      </InputGroupButton>
    )

    const button = screen.getByTestId('ig-button-icon-sm')
    expect(button).toHaveAttribute('data-size', 'icon-sm')
    expect(button).toHaveClass('size-8')
    expect(button).toHaveClass('p-0')
  })

  it('forwards explicit type, variant, className, onClick, and disabled to <Button>', () => {
    const handleClick = vi.fn()
    render(
      <InputGroupButton
        className="my-custom-button"
        data-testid="ig-button-explicit"
        disabled
        onClick={handleClick}
        size="sm"
        type="submit"
        variant="default"
      >
        Submit
      </InputGroupButton>
    )

    const button = screen.getByTestId('ig-button-explicit')
    expect(button).toHaveAttribute('type', 'submit')
    expect(button).toHaveAttribute('data-size', 'sm')
    expect(button).toHaveClass('bg-[color:var(--primary)]') // default variant
    expect(button).toHaveClass('h-8') // size=sm
    expect(button).toHaveClass('my-custom-button')
    expect(button).toBeDisabled()

    fireEvent.click(button)
    // disabled buttons don't dispatch click — handler should NOT fire.
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('fires onClick when the button is enabled and clicked', () => {
    const handleClick = vi.fn()
    render(
      <InputGroupButton data-testid="ig-button-click" onClick={handleClick}>
        Go
      </InputGroupButton>
    )

    fireEvent.click(screen.getByTestId('ig-button-click'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})

/* -------------------------------------------------------------------------- */
/*  InputGroupText                                                            */
/* -------------------------------------------------------------------------- */

describe('InputGroupText', () => {
  it('renders a <span> with the expected base classes', () => {
    render(<InputGroupText data-testid="ig-text">info</InputGroupText>)

    const span = screen.getByTestId('ig-text')
    expect(span.tagName).toBe('SPAN')
    expect(span).toHaveClass('flex')
    expect(span).toHaveClass('items-center')
    expect(span).toHaveClass('gap-2')
    expect(span).toHaveClass('text-sm')
    expect(span).toHaveClass('text-[color:var(--muted-foreground)]')
    expect(span).toHaveTextContent('info')
  })

  it('merges a custom className and forwards arbitrary span props', () => {
    const handleClick = vi.fn()
    render(
      <InputGroupText
        className="my-custom-text"
        data-testid="ig-text-forwarded"
        id="text-id"
        onClick={handleClick}
        title="tooltip"
      >
        Press <kbd data-testid="kbd-shortcut">K</kbd>
      </InputGroupText>
    )

    const span = screen.getByTestId('ig-text-forwarded')
    expect(span).toHaveClass('my-custom-text')
    expect(span).toHaveClass('flex')
    expect(span).toHaveAttribute('id', 'text-id')
    expect(span).toHaveAttribute('title', 'tooltip')
    expect(screen.getByTestId('kbd-shortcut')).toHaveTextContent('K')

    fireEvent.click(span)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})

/* -------------------------------------------------------------------------- */
/*  InputGroupInput                                                           */
/* -------------------------------------------------------------------------- */

describe('InputGroupInput', () => {
  it('renders an <input> with data-slot="input-group-control" and neutralises the default Input styling', () => {
    render(<InputGroupInput data-testid="ig-input" />)

    const input = screen.getByTestId('ig-input')
    expect(input.tagName).toBe('INPUT')
    expect(input).toHaveAttribute('data-slot', 'input-group-control')
    // Underlying Input already sets data-slot="input"; the wrapper
    // adds the second one, which is what consumers target with the
    // :has([data-slot=input-group-control]:focus-visible) selectors.
    expect(input).toHaveAttribute('data-slot', 'input-group-control')

    // Classes that the InputGroupInput wrapper prepends to the chain
    // (flex-1 rounded-none border-0 bg-transparent shadow-none
    // focus-visible:ring-0 dark:bg-transparent).
    expect(input).toHaveClass('flex-1')
    expect(input).toHaveClass('rounded-none')
    expect(input).toHaveClass('border-0')
    expect(input).toHaveClass('bg-transparent')
    expect(input).toHaveClass('shadow-none')
    expect(input).toHaveClass('focus-visible:ring-0')
    expect(input).toHaveClass('dark:bg-transparent')
  })

  it('forwards placeholder, value, disabled, type, onChange, and aria-invalid', () => {
    const handleChange = vi.fn()
    render(
      <InputGroupInput
        aria-invalid="true"
        data-testid="ig-input-forwarded"
        onChange={handleChange}
        placeholder="Search…"
        type="search"
        value="initial"
      />
    )

    const input = screen.getByTestId('ig-input-forwarded') as HTMLInputElement
    expect(input).toHaveAttribute('placeholder', 'Search…')
    expect(input).toHaveAttribute('type', 'search')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    // React turns the value prop into the DOM `.value` property — assert
    // via the DOM property API rather than as an HTML attribute.
    expect(input).toHaveValue('initial')

    // Drive the change handler through fireEvent so we exercise the
    // forwarded onChange rather than the React internals.
    fireEvent.change(input, { target: { value: 'updated' } })
    expect(handleChange).toHaveBeenCalledTimes(1)

    // Disabled: render again with disabled set and confirm the prop wiring.
    render(
      <InputGroupInput
        data-testid="ig-input-disabled"
        disabled
        value="locked"
      />
    )
    const disabledInput = screen.getByTestId(
      'ig-input-disabled'
    ) as HTMLInputElement
    expect(disabledInput).toBeDisabled()
    expect(disabledInput).toHaveValue('locked')
  })

  it('merges a custom className alongside the neutralisation classes', () => {
    render(
      <InputGroupInput
        className="my-custom-input"
        data-testid="ig-input-class"
      />
    )

    const input = screen.getByTestId('ig-input-class')
    expect(input).toHaveClass('my-custom-input')
    expect(input).toHaveClass('rounded-none')
    expect(input).toHaveClass('border-0')
  })
})

/* -------------------------------------------------------------------------- */
/*  InputGroupTextarea                                                        */
/* -------------------------------------------------------------------------- */

describe('InputGroupTextarea', () => {
  it('renders a <textarea> with data-slot="input-group-control" and neutralises default Textarea styling', () => {
    render(<InputGroupTextarea data-testid="ig-textarea" />)

    const textarea = screen.getByTestId('ig-textarea')
    expect(textarea.tagName).toBe('TEXTAREA')
    expect(textarea).toHaveAttribute('data-slot', 'input-group-control')

    expect(textarea).toHaveClass('flex-1')
    expect(textarea).toHaveClass('resize-none')
    expect(textarea).toHaveClass('rounded-none')
    expect(textarea).toHaveClass('border-0')
    expect(textarea).toHaveClass('bg-transparent')
    expect(textarea).toHaveClass('py-3')
    expect(textarea).toHaveClass('shadow-none')
    expect(textarea).toHaveClass('focus-visible:ring-0')
    expect(textarea).toHaveClass('dark:bg-transparent')
  })

  it('forwards placeholder, value, disabled, rows, and onChange', () => {
    const handleChange = vi.fn()
    render(
      <InputGroupTextarea
        data-testid="ig-textarea-forwarded"
        onChange={handleChange}
        placeholder="Write something…"
        rows={6}
        value="seed"
      />
    )

    const textarea = screen.getByTestId(
      'ig-textarea-forwarded'
    ) as HTMLTextAreaElement
    expect(textarea).toHaveAttribute('placeholder', 'Write something…')
    expect(textarea).toHaveAttribute('rows', '6')
    // React turns the value prop into the DOM `.value` property, not an
    // HTML attribute — assert via toHaveValue.
    expect(textarea).toHaveValue('seed')

    // Drive the change handler through fireEvent to exercise the
    // forwarded onChange wiring.
    fireEvent.change(textarea, { target: { value: 'edited' } })
    expect(handleChange).toHaveBeenCalledTimes(1)

    // Disabled: render again with disabled set and confirm the prop wiring.
    render(
      <InputGroupTextarea
        data-testid="ig-textarea-disabled"
        disabled
        value="locked"
      />
    )
    const disabledTextarea = screen.getByTestId(
      'ig-textarea-disabled'
    ) as HTMLTextAreaElement
    expect(disabledTextarea).toBeDisabled()
    expect(disabledTextarea).toHaveValue('locked')
  })

  it('merges a custom className alongside the neutralisation classes', () => {
    render(
      <InputGroupTextarea
        className="my-custom-textarea"
        data-testid="ig-textarea-class"
      />
    )

    const textarea = screen.getByTestId('ig-textarea-class')
    expect(textarea).toHaveClass('my-custom-textarea')
    expect(textarea).toHaveClass('rounded-none')
    expect(textarea).toHaveClass('border-0')
  })
})

/* -------------------------------------------------------------------------- */
/*  Integration smoke test                                                    */
/* -------------------------------------------------------------------------- */

describe('InputGroup integration', () => {
  it('composes root + addon + text + input + button into a working control group', () => {
    const handleClick = vi.fn()
    render(
      <InputGroup aria-label="search-group" data-testid="ig-root">
        <InputGroupAddon align="inline-start">
          <InputGroupText data-testid="ig-icon">@</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput aria-label="query" data-testid="ig-query" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton data-testid="ig-go" onClick={handleClick}>
            Go
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    )

    const root = screen.getByTestId('ig-root')
    expect(root).toHaveAttribute('role', 'group')

    const icon = screen.getByTestId('ig-icon')
    expect(icon).toHaveTextContent('@')

    const query = screen.getByLabelText('query') as HTMLInputElement
    expect(query).toHaveAttribute('data-slot', 'input-group-control')

    const go = screen.getByTestId('ig-go')
    fireEvent.click(go)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('renders a textarea variant without crashing', () => {
    // Make sure the textarea path through InputGroupInput's sibling
    // (i.e. the `has-[>textarea]:h-auto` selector on the root) lights
    // up at runtime.
    function Harness() {
      const ref = useRef<HTMLDivElement>(null)
      return (
        <InputGroup data-testid="ig-textarea-root" ref={ref}>
          <InputGroupAddon align="block-start">
            <InputGroupText>label</InputGroupText>
          </InputGroupAddon>
          <InputGroupTextarea
            data-testid="ig-textarea-control"
            placeholder="Notes"
            rows={4}
          />
        </InputGroup>
      )
    }

    render(<Harness />)

    expect(screen.getByTestId('ig-textarea-root')).toBeInTheDocument()
    expect(screen.getByTestId('ig-textarea-control')).toHaveAttribute(
      'rows',
      '4'
    )
  })
})
