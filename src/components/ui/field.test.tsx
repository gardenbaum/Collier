import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from './field'

/**
 * These tests cover the ten thin wrappers declared in
 * src/components/ui/field.tsx (currently 0% coverage, 249 lines).
 *
 * Layout:
 *  - FieldSet / FieldGroup / Field / FieldContent / FieldLabel / FieldTitle /
 *    FieldDescription are bag-of-classes forwarders: each test asserts the
 *    data-slot attribute, the unconditional cn() base classes (the :has /
 *    :data-* / @container selectors are baked into the cn() input string so
 *    they always reach the DOM), and that a custom className merges and
 *    extra props spread.
 *  - FieldLegend takes a `variant: 'legend' | 'label'` prop. The default is
 *    'legend'; both branches must be exercised because the cva-style
 *    `data-variant=legend:text-base` vs `data-variant=label:text-sm`
 *    activation toggles on the attribute and v8 counts each variant switch
 *    case separately.
 *  - Field toggled by `fieldVariants` (cva) on `orientation: vertical |
 *    horizontal | responsive`. Default is vertical; we explicitly exercise
 *    the horizontal and responsive branches to light up all three cases
 *    inside the cva switch.
 *  - FieldSeparator has a conditional children-rendering branch driven by
 *    `data-content={!!children}`. Both with-children and without-children
 *    paths must be covered so the ternary, the `data-content` attribute
 *    branches, and the conditional `<span>` all show as covered.
 *  - FieldError is the only component with non-trivial logic: a `useMemo`
 *    with five branches (children wins, no errors returns null, a single
 *    unique error renders the message, multiple unique errors render a
 *    `<ul>`, message text deduplication). v8 counts each `if` and the
 *    early-return separately, and the role=alert wrapper only renders when
 *    content is non-null.
 *
 * Pattern mirrors label.test.tsx (PR #113), input-group.test.tsx (PR #127),
 * and tag-input.test.tsx (PR #125).
 */

/* -------------------------------------------------------------------------- */
/*  FieldSet                                                                  */
/* -------------------------------------------------------------------------- */

describe('FieldSet', () => {
  it('renders a <fieldset> with the field-set data-slot and base classes', () => {
    render(
      <FieldSet data-testid="field-set-default">
        <legend>Legend</legend>
      </FieldSet>
    )

    const root = screen.getByTestId('field-set-default')
    expect(root.tagName).toBe('FIELDSET')
    expect(root).toHaveAttribute('data-slot', 'field-set')

    // Base layout tokens.
    expect(root).toHaveClass('flex')
    expect(root).toHaveClass('flex-col')
    expect(root).toHaveClass('gap-6')
    // :has selectors baked into the cn() input string and always emitted.
    expect(root).toHaveClass('has-[>[data-slot=checkbox-group]]:gap-3')
    expect(root).toHaveClass('has-[>[data-slot=radio-group]]:gap-3')
  })

  it('merges a custom className through cn() and forwards extra props', () => {
    render(
      <FieldSet
        aria-label="fieldset label"
        className="my-custom-fieldset"
        data-custom="custom-value"
        data-testid="field-set-forwarded"
        disabled
        id="fs-id"
      />
    )

    const root = screen.getByTestId('field-set-forwarded')
    expect(root).toHaveClass('my-custom-fieldset')
    expect(root).toHaveAttribute('id', 'fs-id')
    expect(root).toHaveAttribute('aria-label', 'fieldset label')
    expect(root).toHaveAttribute('data-custom', 'custom-value')
    expect(root).toHaveAttribute('disabled')
  })
})

/* -------------------------------------------------------------------------- */
/*  FieldLegend                                                               */
/* -------------------------------------------------------------------------- */

describe('FieldLegend', () => {
  it('defaults to variant="legend" and applies the legend-only base classes', () => {
    render(<FieldLegend data-testid="legend-default">Title</FieldLegend>)

    const legend = screen.getByTestId('legend-default')
    expect(legend.tagName).toBe('LEGEND')
    expect(legend).toHaveAttribute('data-slot', 'field-legend')
    expect(legend).toHaveAttribute('data-variant', 'legend')

    // Base + legend-specific tokens.
    expect(legend).toHaveClass('mb-3')
    expect(legend).toHaveClass('font-medium')
    expect(legend).toHaveClass('data-[variant=legend]:text-base')
    // The label-variant selector MUST NOT be in the always-on className —
    // Tailwind ships these as part of the cn() input regardless of which
    // variant wins, so we assert presence to lock the cn() output.
    expect(legend).toHaveClass('data-[variant=label]:text-sm')
  })

  it('switches to the label variant when variant="label" is passed', () => {
    render(
      <FieldLegend data-testid="legend-label" variant="label">
        Tiny label
      </FieldLegend>
    )

    const legend = screen.getByTestId('legend-label')
    expect(legend).toHaveAttribute('data-variant', 'label')

    // Switching variant does not strip the base tokens.
    expect(legend).toHaveClass('mb-3')
    expect(legend).toHaveClass('font-medium')
  })

  it('merges a custom className through cn() and forwards children', () => {
    render(
      <FieldLegend
        className="uppercase tracking-widest"
        data-testid="legend-merged"
      >
        <>Combined {`tokens`}</>
      </FieldLegend>
    )

    const legend = screen.getByTestId('legend-merged')
    expect(legend).toHaveClass('uppercase')
    expect(legend).toHaveClass('tracking-widest')
    expect(legend).toHaveTextContent('Combined tokens')
  })
})

/* -------------------------------------------------------------------------- */
/*  FieldGroup                                                                */
/* -------------------------------------------------------------------------- */

describe('FieldGroup', () => {
  it('renders a <div> with the field-group data-slot and base classes', () => {
    render(<FieldGroup data-testid="field-group-default">children</FieldGroup>)

    const root = screen.getByTestId('field-group-default')
    expect(root.tagName).toBe('DIV')
    expect(root).toHaveAttribute('data-slot', 'field-group')
    expect(root).toHaveTextContent('children')

    // Base layout tokens.
    expect(root).toHaveClass('group/field-group')
    expect(root).toHaveClass('@container/field-group')
    expect(root).toHaveClass('flex')
    expect(root).toHaveClass('w-full')
    expect(root).toHaveClass('flex-col')
    expect(root).toHaveClass('gap-7')
    // Tailwind attribute / descendant selectors baked into the cn() input.
    expect(root).toHaveClass('data-[slot=checkbox-group]:gap-3')
    expect(root).toHaveClass('[&>[data-slot=field-group]]:gap-4')
  })

  it('merges a custom className and forwards extra div props', () => {
    const handleClick = vi.fn()
    render(
      <FieldGroup
        aria-label="group label"
        className="my-custom-group"
        data-custom="custom-value"
        data-testid="field-group-forwarded"
        hidden
        id="fg-id"
        onClick={handleClick}
      />
    )

    const root = screen.getByTestId('field-group-forwarded')
    expect(root).toHaveClass('my-custom-group')
    expect(root).toHaveAttribute('id', 'fg-id')
    expect(root).toHaveAttribute('aria-label', 'group label')
    expect(root).toHaveAttribute('data-custom', 'custom-value')
    expect(root).toHaveAttribute('hidden')

    fireEvent.click(root)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})

/* -------------------------------------------------------------------------- */
/*  Field  (cva-driven orientation variant)                                   */
/* -------------------------------------------------------------------------- */

describe('Field', () => {
  it('defaults to orientation="vertical" and exposes role="group" + data-orientation', () => {
    render(<Field data-testid="field-default">body</Field>)

    const root = screen.getByTestId('field-default')
    expect(root.tagName).toBe('DIV')
    expect(root).toHaveAttribute('role', 'group')
    expect(root).toHaveAttribute('data-slot', 'field')
    expect(root).toHaveAttribute('data-orientation', 'vertical')

    // cva base classes (independent of the variant).
    expect(root).toHaveClass('group/field')
    expect(root).toHaveClass('flex')
    expect(root).toHaveClass('w-full')
    expect(root).toHaveClass('gap-3')
    // vertical-only tokens.
    expect(root).toHaveClass('flex-col')
    expect(root).toHaveClass('[&>*]:w-full')
    expect(root).toHaveClass('[&>.sr-only]:w-auto')
  })

  it('switches to horizontal orientation tokens when orientation="horizontal"', () => {
    render(<Field data-testid="field-horizontal" orientation="horizontal" />)

    const root = screen.getByTestId('field-horizontal')
    expect(root).toHaveAttribute('data-orientation', 'horizontal')

    // cva base classes (still applied — independent of variant).
    expect(root).toHaveClass('group/field')
    expect(root).toHaveClass('flex')
    expect(root).toHaveClass('w-full')
    expect(root).toHaveClass('gap-3')
    // horizontal variant tokens.
    expect(root).toHaveClass('flex-row')
    expect(root).toHaveClass('items-center')
    expect(root).toHaveClass('[&>[data-slot=field-label]]:flex-auto')
    expect(root).toHaveClass('has-[>[data-slot=field-content]]:items-start')
    expect(root).toHaveClass(
      'has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px'
    )
    // The vertical-only tokens MUST NOT bleed in.
    expect(root).not.toHaveClass('flex-col')
  })

  it('switches to responsive orientation tokens when orientation="responsive"', () => {
    render(<Field data-testid="field-responsive" orientation="responsive" />)

    const root = screen.getByTestId('field-responsive')
    expect(root).toHaveAttribute('data-orientation', 'responsive')

    // Base classes still applied.
    expect(root).toHaveClass('group/field')
    expect(root).toHaveClass('flex')
    expect(root).toHaveClass('w-full')
    expect(root).toHaveClass('gap-3')
    // responsive variant tokens (contain @md/field-group: prefixed tokens).
    expect(root).toHaveClass('flex-col')
    expect(root).toHaveClass('[&>*]:w-full')
    expect(root).toHaveClass('[&>.sr-only]:w-auto')
    expect(root).toHaveClass('@md/field-group:flex-row')
    expect(root).toHaveClass('@md/field-group:items-center')
    expect(root).toHaveClass('@md/field-group:[&>*]:w-auto')
    expect(root).toHaveClass(
      '@md/field-group:[&>[data-slot=field-label]]:flex-auto'
    )
    expect(root).toHaveClass(
      '@md/field-group:has-[>[data-slot=field-content]]:items-start'
    )
    expect(root).toHaveClass(
      '@md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px'
    )
    // The horizontal-only tokens MUST NOT bleed in.
    expect(root).not.toHaveClass('items-center')
    // (Both vertical & responsive add items-center; only responsive does via
    // @md — so we instead assert that the responsive prefix is present and
    // that horizontal's bare `flex-row items-center` combination is not.)
    // That is already covered by the @md assertions above.
  })

  it('merges a custom className through cn() and forwards extra props', () => {
    render(
      <Field
        aria-label="field label"
        className="my-custom-field"
        data-custom="custom-value"
        data-testid="field-forwarded"
        id="f-id"
      />
    )

    const root = screen.getByTestId('field-forwarded')
    expect(root).toHaveClass('my-custom-field')
    expect(root).toHaveAttribute('id', 'f-id')
    expect(root).toHaveAttribute('aria-label', 'field label')
    expect(root).toHaveAttribute('data-custom', 'custom-value')
  })
})

/* -------------------------------------------------------------------------- */
/*  FieldContent                                                              */
/* -------------------------------------------------------------------------- */

describe('FieldContent', () => {
  it('renders a <div> with the field-content data-slot and base classes', () => {
    render(
      <FieldContent data-testid="field-content-default">body</FieldContent>
    )

    const root = screen.getByTestId('field-content-default')
    expect(root.tagName).toBe('DIV')
    expect(root).toHaveAttribute('data-slot', 'field-content')

    expect(root).toHaveClass('group/field-content')
    expect(root).toHaveClass('flex')
    expect(root).toHaveClass('flex-1')
    expect(root).toHaveClass('flex-col')
    expect(root).toHaveClass('gap-1.5')
    expect(root).toHaveClass('leading-snug')
  })

  it('merges a custom className and forwards extra div props', () => {
    render(
      <FieldContent
        className="my-custom-content"
        data-custom="custom-value"
        data-testid="field-content-forwarded"
        id="fc-id"
      />
    )

    const root = screen.getByTestId('field-content-forwarded')
    expect(root).toHaveClass('my-custom-content')
    expect(root).toHaveAttribute('id', 'fc-id')
    expect(root).toHaveAttribute('data-custom', 'custom-value')
  })
})

/* -------------------------------------------------------------------------- */
/*  FieldLabel                                                                */
/* -------------------------------------------------------------------------- */

describe('FieldLabel', () => {
  it('renders a <label> with the field-label data-slot and Label classes merged in', () => {
    render(<FieldLabel data-testid="field-label-default">Email</FieldLabel>)

    const label = screen.getByTestId('field-label-default')
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveAttribute('data-slot', 'field-label')
    expect(label).toHaveTextContent('Email')

    // Field-specific tokens.
    expect(label).toHaveClass('group/field-label')
    expect(label).toHaveClass('peer/field-label')
    expect(label).toHaveClass('flex')
    expect(label).toHaveClass('w-fit')
    expect(label).toHaveClass('gap-2')
    expect(label).toHaveClass('leading-snug')
    expect(label).toHaveClass('group-data-[disabled=true]/field:opacity-50')
    // Label primitive tokens that get merged in via cn() on Label.
    expect(label).toHaveClass('text-sm')
    expect(label).toHaveClass('font-medium')
  })

  it('merges a custom className through cn()', () => {
    render(
      <FieldLabel
        className="my-custom-label"
        data-testid="field-label-merged"
      />
    )

    const label = screen.getByTestId('field-label-merged')
    expect(label).toHaveClass('my-custom-label')
    expect(label).toHaveClass('text-sm')
  })

  it('forwards htmlFor and forwards onto the underlying <label>', () => {
    render(
      <>
        <FieldLabel data-testid="field-label-for" htmlFor="email-input">
          Email
        </FieldLabel>
        <input data-testid="email-input" id="email-input" />
      </>
    )

    const label = screen.getByTestId('field-label-for')
    expect(label).toHaveAttribute('for', 'email-input')
  })
})

/* -------------------------------------------------------------------------- */
/*  FieldTitle                                                                */
/* -------------------------------------------------------------------------- */

describe('FieldTitle', () => {
  it('renders a <div> with the field-label data-slot (intentional, mirrors FieldLabel) and base classes', () => {
    render(
      <FieldTitle data-testid="field-title-default">Title text</FieldTitle>
    )

    const root = screen.getByTestId('field-title-default')
    expect(root.tagName).toBe('DIV')
    // FieldTitle intentionally reuses the field-label slot name.
    expect(root).toHaveAttribute('data-slot', 'field-label')
    expect(root).toHaveTextContent('Title text')

    expect(root).toHaveClass('flex')
    expect(root).toHaveClass('w-fit')
    expect(root).toHaveClass('items-center')
    expect(root).toHaveClass('gap-2')
    expect(root).toHaveClass('text-sm')
    expect(root).toHaveClass('leading-snug')
    expect(root).toHaveClass('font-medium')
    expect(root).toHaveClass('group-data-[disabled=true]/field:opacity-50')
  })

  it('merges a custom className and forwards extra div props', () => {
    render(
      <FieldTitle
        className="my-custom-title"
        data-custom="custom-value"
        data-testid="field-title-forwarded"
        id="ft-id"
      />
    )

    const root = screen.getByTestId('field-title-forwarded')
    expect(root).toHaveClass('my-custom-title')
    expect(root).toHaveAttribute('id', 'ft-id')
    expect(root).toHaveAttribute('data-custom', 'custom-value')
  })
})

/* -------------------------------------------------------------------------- */
/*  FieldDescription                                                          */
/* -------------------------------------------------------------------------- */

describe('FieldDescription', () => {
  it('renders a <p> with the field-description data-slot and base classes', () => {
    render(
      <FieldDescription data-testid="field-description-default">
        Help text
      </FieldDescription>
    )

    const root = screen.getByTestId('field-description-default')
    expect(root.tagName).toBe('P')
    expect(root).toHaveAttribute('data-slot', 'field-description')
    expect(root).toHaveTextContent('Help text')

    expect(root).toHaveClass('text-[color:var(--muted-foreground)]')
    expect(root).toHaveClass('text-sm')
    expect(root).toHaveClass('leading-normal')
    expect(root).toHaveClass('font-normal')
    expect(root).toHaveClass(
      'group-has-[[data-orientation=horizontal]]/field:text-balance'
    )
  })

  it('merges a custom className and forwards extra p props', () => {
    render(
      <FieldDescription
        className="my-custom-desc"
        data-custom="custom-value"
        data-testid="field-description-forwarded"
        id="fd-id"
      />
    )

    const root = screen.getByTestId('field-description-forwarded')
    expect(root).toHaveClass('my-custom-desc')
    expect(root).toHaveAttribute('id', 'fd-id')
    expect(root).toHaveAttribute('data-custom', 'custom-value')
  })
})

/* -------------------------------------------------------------------------- */
/*  FieldSeparator                                                            */
/* -------------------------------------------------------------------------- */

describe('FieldSeparator', () => {
  it('renders without children: data-content="false" and no nested <span>', () => {
    const { container } = render(
      <FieldSeparator data-testid="field-separator-empty" />
    )

    const root = screen.getByTestId('field-separator-empty')
    expect(root.tagName).toBe('DIV')
    expect(root).toHaveAttribute('data-slot', 'field-separator')
    expect(root).toHaveAttribute('data-content', 'false')

    // No content <span> should be emitted when children are absent.
    expect(
      container.querySelector('[data-slot="field-separator-content"]')
    ).toBeNull()
  })

  it('renders with children: data-content="true" and the content span receives them', () => {
    render(
      <FieldSeparator data-testid="field-separator-with-text">
        or
      </FieldSeparator>
    )

    const root = screen.getByTestId('field-separator-with-text')
    expect(root).toHaveAttribute('data-content', 'true')

    const content = screen
      .getByTestId('field-separator-with-text')
      .querySelector('[data-slot="field-separator-content"]')
    expect(content).not.toBeNull()
    expect(content).toHaveTextContent('or')
  })

  it('merges a custom className and forwards extra div props', () => {
    render(
      <FieldSeparator
        className="my-custom-separator"
        data-custom="custom-value"
        data-testid="field-separator-forwarded"
        id="fs-id"
      />
    )

    const root = screen.getByTestId('field-separator-forwarded')
    expect(root).toHaveClass('my-custom-separator')
    expect(root).toHaveAttribute('id', 'fs-id')
    expect(root).toHaveAttribute('data-custom', 'custom-value')
    expect(root).toHaveClass('relative')
    expect(root).toHaveClass('-my-2')
  })
})

/* -------------------------------------------------------------------------- */
/*  FieldError  (useMemo with five branches)                                  */
/* -------------------------------------------------------------------------- */

describe('FieldError', () => {
  it('renders nothing at all when neither children nor errors are provided', () => {
    const { container } = render(<FieldError data-testid="field-error-empty" />)

    // FieldError short-circuits BEFORE rendering the wrapper: no element
    // with role="alert" is in the tree.
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(screen.queryByTestId('field-error-empty')).toBeNull()
  })

  it('prefers children over errors when both are provided', () => {
    render(
      <FieldError
        data-testid="field-error-children"
        errors={[{ message: 'A' }]}
      >
        Custom message
      </FieldError>
    )

    const root = screen.getByTestId('field-error-children')
    expect(root).toHaveAttribute('role', 'alert')
    expect(root).toHaveAttribute('data-slot', 'field-error')
    expect(root).toHaveTextContent('Custom message')
    // The injected error MUST NOT be rendered.
    expect(root).not.toHaveTextContent('A')
  })

  it('renders nothing when errors is an empty array (no children either)', () => {
    const { container } = render(
      <FieldError data-testid="field-error-no-errors" errors={[]} />
    )

    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('renders a single <li>-less message when errors has exactly one unique message', () => {
    render(
      <FieldError
        data-testid="field-error-single"
        errors={[{ message: 'Single failure' }]}
      />
    )

    const root = screen.getByTestId('field-error-single')
    expect(root).toHaveAttribute('role', 'alert')
    expect(root).toHaveTextContent('Single failure')
    // No <ul> wrapper when there is only one message.
    expect(root.querySelector('ul')).toBeNull()
    expect(root.querySelector('li')).toBeNull()
  })

  it('deduplicates repeated error messages (multiple errors with identical messages collapse to one)', () => {
    // Map-based dedup in `useMemo` collapses all three 'Same' entries into
    // a single unique error. `uniqueErrors.length === 1` then returns the
    // raw message string — the source uses a separate branch for
    // multi-message errors, NOT the <ul>-with-one-li path.
    render(
      <FieldError
        data-testid="field-error-dedup"
        errors={[{ message: 'Same' }, { message: 'Same' }, { message: 'Same' }]}
      />
    )

    const root = screen.getByTestId('field-error-dedup')
    expect(root).toHaveAttribute('role', 'alert')
    expect(root).toHaveTextContent('Same')
    // Single-message branch returns the bare string — no <ul> / no <li>.
    expect(root.querySelector('ul')).toBeNull()
    expect(root.querySelector('li')).toBeNull()
  })

  it('renders a <ul> with one <li> per unique error message when multiple distinct errors exist', () => {
    render(
      <FieldError
        data-testid="field-error-multi"
        errors={[
          { message: 'Failure A' },
          { message: 'Failure B' },
          { message: 'Failure C' },
        ]}
      />
    )

    const root = screen.getByTestId('field-error-multi')
    expect(root).toHaveAttribute('role', 'alert')

    const list = root.querySelector('ul')
    expect(list).not.toBeNull()
    const items = list?.querySelectorAll('li') ?? []
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Failure A')
    expect(items[1]).toHaveTextContent('Failure B')
    expect(items[2]).toHaveTextContent('Failure C')
  })

  it('skips errors with no message field when deduplicating', () => {
    render(
      <FieldError
        data-testid="field-error-undefined-messages"
        errors={[{}, { message: 'Concrete' }, {}]}
      />
    )

    const root = screen.getByTestId('field-error-undefined-messages')
    expect(root).toHaveAttribute('role', 'alert')
    expect(root).toHaveTextContent('Concrete')
    // No <li> for empty entries (the .filter(Boolean) gate).
    const items = root.querySelectorAll('li')
    expect(items).toHaveLength(1)
  })

  it('renders nothing when every error has no message (defensive branch)', () => {
    // Map keys on `error?.message`; two entries with `undefined` keys
    // collapse to a single entry, so the source short-circuits at the
    // `uniqueErrors.length === 1` branch and returns `undefined` — which
    // the outer `if (!content) return null` guard catches. Result: the
    // wrapper never mounts, matching the no-content behaviour.
    const { container } = render(
      <FieldError data-testid="field-error-all-empty" errors={[{}, {}]} />
    )

    expect(screen.queryByTestId('field-error-all-empty')).toBeNull()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('merges a custom className through cn() and forwards extra div props', () => {
    render(
      <FieldError
        className="my-custom-error"
        data-custom="custom-value"
        data-testid="field-error-merged"
        id="fe-id"
      >
        Boom
      </FieldError>
    )

    const root = screen.getByTestId('field-error-merged')
    expect(root).toHaveClass('my-custom-error')
    expect(root).toHaveClass('text-[color:var(--destructive)]')
    expect(root).toHaveAttribute('id', 'fe-id')
    expect(root).toHaveAttribute('data-custom', 'custom-value')
  })
})
