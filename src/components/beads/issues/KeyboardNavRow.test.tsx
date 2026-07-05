/**
 * Tests for the shared `KeyboardNavRow` wrapper.
 *
 * Contract
 * --------
 * `KeyboardNavRow` is the `<li>` shell that wires the M5 keyboard-
 * navigation contract into the DOM for the flat issue lists
 * (`IssueSummaryRow`, `SearchView`'s `SearchRow`). The contract this
 * suite pins:
 *
 *   - The row element renders as an `<li>` carrying every nav
 *     attribute the `use-keyboard-navigation` hook reads:
 *       * `data-testid`        — caller-supplied (e.g. "blocked-row")
 *       * `data-kbd-nav="row"` — opts into the hook's selector
 *       * `data-row-id`        — used by j/k/Enter
 *       * `data-issue-id`      — used by Enter (same value as rowId)
 *       * `data-row-selected`  — "true" / "false"
 *       * `aria-selected`      — boolean
 *   - The default row visual spreads `rowStyle` + (when selected)
 *     `rowSelectedStyle`. An optional `style` prop merges AFTER those
 *     and wins on conflicting keys.
 *   - Children render inside the row.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { KeyboardNavRow } from './KeyboardNavRow'

describe('KeyboardNavRow', () => {
  it('renders an <li> with all six nav attributes when not selected', () => {
    render(
      <ul>
        <KeyboardNavRow
          testid="blocked-row"
          rowId="beads-42"
          isSelected={false}
        >
          <span>beads-42</span>
        </KeyboardNavRow>
      </ul>
    )

    const row = screen.getByTestId('blocked-row')
    expect(row.tagName).toBe('LI')
    expect(row.getAttribute('data-kbd-nav')).toBe('row')
    expect(row.getAttribute('data-row-id')).toBe('beads-42')
    expect(row.getAttribute('data-issue-id')).toBe('beads-42')
    expect(row.getAttribute('data-row-selected')).toBe('false')
    expect(row.getAttribute('aria-selected')).toBe('false')
  })

  it('emits selected="true" on every nav attribute when isSelected=true', () => {
    render(
      <ul>
        <KeyboardNavRow testid="ready-row" rowId="beads-7" isSelected={true}>
          <span>beads-7</span>
        </KeyboardNavRow>
      </ul>
    )

    const row = screen.getByTestId('ready-row')
    expect(row.getAttribute('data-row-selected')).toBe('true')
    expect(row.getAttribute('aria-selected')).toBe('true')
  })

  it('renders children inside the row', () => {
    render(
      <ul>
        <KeyboardNavRow
          testid="search-result-row"
          rowId="beads-9"
          isSelected={false}
        >
          <span data-testid="child-marker">hello</span>
        </KeyboardNavRow>
      </ul>
    )

    const row = screen.getByTestId('search-result-row')
    expect(screen.getByTestId('child-marker')).toBe(row.firstChild)
  })

  it('applies the selected style when isSelected=true', () => {
    render(
      <ul>
        <KeyboardNavRow testid="x" rowId="x-1" isSelected={true}>
          x
        </KeyboardNavRow>
      </ul>
    )

    const row = screen.getByTestId('x')
    // rowSelectedStyle = { backgroundColor: 'rgba(94, 106, 210, 0.18)',
    //                       boxShadow: 'inset 2px 0 0 0 rgb(94, 106, 210)' }
    const style = row.getAttribute('style') ?? ''
    expect(style).toContain('rgba(94, 106, 210, 0.18)')
    expect(style).toContain('inset 2px 0 0 0 rgb(94, 106, 210)')
  })

  it('omits the selected style when isSelected=false', () => {
    render(
      <ul>
        <KeyboardNavRow testid="y" rowId="y-1" isSelected={false}>
          y
        </KeyboardNavRow>
      </ul>
    )

    const row = screen.getByTestId('y')
    const style = row.getAttribute('style') ?? ''
    expect(style).not.toContain('rgba(94, 106, 210, 0.18)')
  })

  it('merges an optional style override after the default spread', () => {
    render(
      <ul>
        <KeyboardNavRow
          testid="z"
          rowId="z-1"
          isSelected={false}
          style={{ paddingInline: 99 }}
        >
          z
        </KeyboardNavRow>
      </ul>
    )

    const row = screen.getByTestId('z')
    const style = row.getAttribute('style') ?? ''
    // Override must be present AND the base rowStyle's padding must too.
    expect(style).toContain('padding-inline: 99')
    expect(style).toMatch(/padding:\s*var\(--space-3\)|padding:\s*[^;]+/)
  })
})
