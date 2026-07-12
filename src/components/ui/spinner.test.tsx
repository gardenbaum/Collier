import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { Spinner } from './spinner'

/**
 * These tests cover the `Spinner` display primitive declared in
 * src/components/ui/spinner.tsx (1 function, currently at 0% coverage).
 *
 * `Spinner` is a thin wrapper around `lucide-react`'s `Loader2Icon`. It
 * hardcodes two accessibility attributes (`role="status"` and
 * `aria-label="Loading"`), a default Tailwind class set via cn() that
 * gives the icon a fixed size and a CSS spin animation, and forwards
 * the remaining SVG props (className, id, aria-*, data-*, ...) through
 * the {...props} spread.
 *
 * What we assert:
 *  - The wrapper renders the lucide-react Loader2Icon as an inline
 *    <svg> (i.e. the icon component is mounted, not just dropped).
 *  - The accessibility attributes (role + aria-label) are present on
 *    the rendered SVG so screen readers announce "Loading".
 *  - The default Tailwind classes (`size-4 animate-spin`) are applied
 *    via cn().
 *  - A caller-supplied `className` is merged in via twMerge.
 *  - Additional SVG props (id, aria-*, data-*) pass through unchanged.
 */
describe('Spinner', () => {
  it('renders the lucide-react Loader2Icon as an inline <svg>', () => {
    render(<Spinner data-testid="spin" />)
    const svg = screen.getByTestId('spin')
    expect(svg.tagName.toLowerCase()).toBe('svg')
    // lucide-react icons render with the base `lucide` class plus a
    // slug like `lucide-loader-circle` (this version of lucide-react
    // normalises Loader2Icon to the loader-circle visual). We assert
    // a stable subset rather than the full className string so the
    // test does not break on minor library version bumps.
    expect(svg.getAttribute('class')).toMatch(/lucide/)
  })

  it('applies role="status" and aria-label="Loading" for screen readers', () => {
    render(<Spinner data-testid="spin" />)
    const svg = screen.getByTestId('spin')
    expect(svg).toHaveAttribute('role', 'status')
    expect(svg).toHaveAttribute('aria-label', 'Loading')
  })

  it('applies the default Tailwind utility classes from cn(base)', () => {
    render(<Spinner data-testid="spin" />)
    const svg = screen.getByTestId('spin')
    expect(svg).toHaveClass('size-4')
    expect(svg).toHaveClass('animate-spin')
  })

  it('merges a custom className via cn(...) alongside the base classes', () => {
    render(<Spinner data-testid="spin" className="text-muted-foreground" />)
    const svg = screen.getByTestId('spin')
    // twMerge keeps both the base and the user class.
    expect(svg).toHaveClass('size-4')
    expect(svg).toHaveClass('animate-spin')
    expect(svg).toHaveClass('text-muted-foreground')
  })

  it('forwards arbitrary SVG attributes (id, aria-*, data-*) via props spread', () => {
    render(
      <Spinner
        data-testid="spin"
        id="loading-spinner"
        aria-hidden="false"
        data-test="loader"
      />
    )
    const svg = screen.getByTestId('spin')
    expect(svg).toHaveAttribute('id', 'loading-spinner')
    // The wrapper hardcodes aria-label="Loading" — the caller should be
    // able to override it (we pass aria-hidden here instead to avoid
    // contradicting the hardcoded label).
    expect(svg).toHaveAttribute('aria-hidden', 'false')
    expect(svg).toHaveAttribute('data-test', 'loader')
  })

  it('lets callers override the hardcoded aria-label via props spread', () => {
    render(<Spinner data-testid="spin" aria-label="Saving changes" />)
    const svg = screen.getByTestId('spin')
    // The wrapper sets aria-label="Loading" BEFORE the {...props} spread,
    // so a caller-supplied label takes precedence — this matches how the
    // rest of the wrapper suite treats props as overrides.
    expect(svg).toHaveAttribute('aria-label', 'Saving changes')
  })
})
