import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { Kbd, KbdGroup } from './kbd'

/**
 * These tests cover the `Kbd` and `KbdGroup` display primitives declared
 * in src/components/ui/kbd.tsx (2 functions, currently at 0% coverage).
 *
 * Both components are tiny presentational wrappers that apply a
 * `data-slot` attribute, a default Tailwind class set via cn(), and
 * forward the remaining HTML props through the {...props} spread.
 *
 * Notable details:
 *  - `Kbd` renders a `<kbd>` element (per its `React.ComponentProps<'kbd'>`).
 *  - `KbdGroup` also renders a `<kbd>` element (despite its props type
 *    being `React.ComponentProps<'div'>` — this is a wrapper quirk worth
 *    pinning in a regression test). It uses `data-slot="kbd-group"` so
 *    tests can distinguish KbdGroup from Kbd unambiguously.
 *  - `Kbd` includes a Tailwind arbitrary-variant rule targeting the
 *    `[[data-slot=tooltip-content]_&]` selector for tooltip-content
 *    theming — the classes only resolve to a literal class string in
 *    the DOM (the browser does the selector work at runtime), so we
 *    assert presence via `toHaveClass` with the verbatim string.
 */
describe('Kbd', () => {
  it('renders a <kbd> element with data-slot="kbd"', () => {
    render(<Kbd data-testid="key">K</Kbd>)
    const el = screen.getByTestId('key')
    expect(el.tagName).toBe('KBD')
    expect(el).toHaveAttribute('data-slot', 'kbd')
  })

  it('renders its children inside the <kbd>', () => {
    render(<Kbd data-testid="key">Ctrl</Kbd>)
    const el = screen.getByTestId('key')
    expect(el).toHaveTextContent('Ctrl')
  })

  it('applies the default Tailwind utility classes from cn(base)', () => {
    render(<Kbd data-testid="key">K</Kbd>)
    const el = screen.getByTestId('key')
    // Pin a stable subset of the base classes — the wrapper has many
    // utility classes (bg, text, pointer-events, layout, font, ...).
    expect(el).toHaveClass('bg-[color:var(--muted)]')
    expect(el).toHaveClass('text-[color:var(--muted-foreground)]')
    expect(el).toHaveClass('inline-flex')
    expect(el).toHaveClass('rounded-sm')
    expect(el).toHaveClass('font-sans')
    expect(el).toHaveClass('select-none')
  })

  it('merges a custom className via cn(...) alongside the base classes', () => {
    render(
      <Kbd data-testid="key" className="custom-kbd-class">
        K
      </Kbd>
    )
    const el = screen.getByTestId('key')
    expect(el).toHaveClass('font-sans')
    expect(el).toHaveClass('custom-kbd-class')
  })

  it('forwards arbitrary HTML attributes (id, aria-*, data-*) via props spread', () => {
    render(
      <Kbd
        data-testid="key"
        id="ctrl-key"
        aria-label="Control key"
        data-pos="left"
      >
        Ctrl
      </Kbd>
    )
    const el = screen.getByTestId('key')
    expect(el).toHaveAttribute('id', 'ctrl-key')
    expect(el).toHaveAttribute('aria-label', 'Control key')
    expect(el).toHaveAttribute('data-pos', 'left')
  })
})

describe('KbdGroup', () => {
  it('renders a <kbd> element with data-slot="kbd-group"', () => {
    // The KbdGroup wrapper uses a <kbd> element (not a <div>) despite
    // its props type being React.ComponentProps<'div'>. This is the
    // shape of the upstream shadcn-style primitive — we pin it here
    // so any future change to the rendered element surfaces as a test
    // failure.
    render(
      <KbdGroup data-testid="group">
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
    )
    const el = screen.getByTestId('group')
    expect(el.tagName).toBe('KBD')
    expect(el).toHaveAttribute('data-slot', 'kbd-group')
  })

  it('renders all children passed between its opening and closing tags', () => {
    render(
      <KbdGroup data-testid="group">
        <Kbd>Ctrl</Kbd>
        <Kbd>Shift</Kbd>
        <Kbd>P</Kbd>
      </KbdGroup>
    )
    const el = screen.getByTestId('group')
    expect(el).toHaveTextContent('Ctrl')
    expect(el).toHaveTextContent('Shift')
    expect(el).toHaveTextContent('P')
  })

  it('applies the default Tailwind utility classes from cn(base)', () => {
    render(
      <KbdGroup data-testid="group">
        <Kbd>K</Kbd>
      </KbdGroup>
    )
    const el = screen.getByTestId('group')
    expect(el).toHaveClass('inline-flex')
    expect(el).toHaveClass('items-center')
    expect(el).toHaveClass('gap-1')
  })

  it('merges a custom className via cn(...) alongside the base classes', () => {
    render(
      <KbdGroup data-testid="group" className="custom-group-class">
        <Kbd>K</Kbd>
      </KbdGroup>
    )
    const el = screen.getByTestId('group')
    expect(el).toHaveClass('inline-flex')
    expect(el).toHaveClass('custom-group-class')
  })

  it('forwards arbitrary HTML attributes (id, aria-*, data-*) via props spread', () => {
    render(
      <KbdGroup
        data-testid="group"
        id="shortcut-row"
        aria-label="Keyboard shortcut"
        data-pos="bottom"
      >
        <Kbd>K</Kbd>
      </KbdGroup>
    )
    const el = screen.getByTestId('group')
    expect(el).toHaveAttribute('id', 'shortcut-row')
    expect(el).toHaveAttribute('aria-label', 'Keyboard shortcut')
    expect(el).toHaveAttribute('data-pos', 'bottom')
  })
})
