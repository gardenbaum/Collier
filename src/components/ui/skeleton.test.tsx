import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { Skeleton } from './skeleton'

/**
 * These tests cover the `Skeleton` display primitive declared in
 * src/components/ui/skeleton.tsx (1 function, currently at 0% coverage).
 *
 * `Skeleton` is a tiny presentational wrapper: a plain `<div>` that
 * applies a `data-slot` attribute, a default Tailwind utility class set
 * via cn(), and forwards all remaining HTML div props (className, id,
 * aria-*, data-*, event handlers, ...).
 *
 * What we assert:
 *  - The wrapper renders a real DOM element (a div) with `data-slot="skeleton"`.
 *  - The base Tailwind classes from the cn() base string are present.
 *  - A caller-supplied `className` is merged in via twMerge (so both the
 *    base classes AND the user class appear on the rendered element).
 *  - Plain HTML attributes (id, aria-*, data-*) and React event handlers
 *    pass through unchanged via the {...props} spread.
 *  - The wrapper does not inject extra wrapper elements (single child
 *    of the render root).
 */
describe('Skeleton', () => {
  it('renders a div with data-slot="skeleton"', () => {
    render(<Skeleton data-testid="skel" />)
    const el = screen.getByTestId('skel')
    expect(el.tagName).toBe('DIV')
    expect(el).toHaveAttribute('data-slot', 'skeleton')
  })

  it('applies the default Tailwind utility classes from cn(base)', () => {
    render(<Skeleton data-testid="skel" />)
    const el = screen.getByTestId('skel')
    // Tailwind class names are stable identifiers we can assert on.
    expect(el).toHaveClass('bg-[color:var(--accent)]')
    expect(el).toHaveClass('animate-pulse')
    expect(el).toHaveClass('rounded-[var(--radius)]')
  })

  it('merges a custom className via cn(...) (twMerge keeps both)', () => {
    render(<Skeleton data-testid="skel" className="custom-skel-class" />)
    const el = screen.getByTestId('skel')
    // The base classes must remain AND the user class must be added.
    expect(el).toHaveClass('animate-pulse')
    expect(el).toHaveClass('custom-skel-class')
  })

  it('forwards arbitrary HTML attributes (id, aria-*, data-*) via props spread', () => {
    render(
      <Skeleton
        data-testid="skel"
        id="my-skeleton"
        aria-label="placeholder content"
        data-custom="hello"
      />
    )
    const el = screen.getByTestId('skel')
    expect(el).toHaveAttribute('id', 'my-skeleton')
    expect(el).toHaveAttribute('aria-label', 'placeholder content')
    expect(el).toHaveAttribute('data-custom', 'hello')
  })

  it('forwards a ref to the underlying div via React 19 ref-as-prop', () => {
    // React 19 lets refs be passed as regular props. We assert the
    // wrapper does not swallow or strip the ref.
    let captured: HTMLDivElement | null = null
    render(
      <Skeleton
        ref={node => {
          captured = node
        }}
        data-testid="skel"
      />
    )
    const el = screen.getByTestId('skel')
    expect(captured).toBe(el)
  })
})
