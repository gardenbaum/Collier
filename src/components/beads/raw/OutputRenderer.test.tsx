/**
 * Tests for the OutputRenderer (T45).
 *
 * Contract: OutputRenderer branches on the shape of `value`:
 *   - error prop → red-equivalent mono panel with the error string
 *   - null/undefined value → "No output."
 *   - string value → `<pre data-testid="output-text">`
 *   - array of objects → `<table data-testid="output-table">` with header
 *   - array of scalars → `<pre data-testid="output-list">` (joined)
 *   - object → `<pre data-testid="output-object">` (pretty JSON)
 *   - scalar → `<pre data-testid="output-scalar">`
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OutputRenderer } from './OutputRenderer'

const wrap = (value: unknown) => ({ type: 'json', value })

describe('OutputRenderer', () => {
  it('renders the error branch when error is provided', () => {
    render(<OutputRenderer error={{ type: 'NonZeroExit', stderr: 'oops' }} />)
    const pre = screen.getByTestId('output-error')
    expect(pre).toBeInTheDocument()
    expect(pre.textContent).toContain('oops')
  })

  it('renders the empty state when value is null', () => {
    render(<OutputRenderer value={null} />)
    expect(screen.getByTestId('output-empty')).toBeInTheDocument()
    expect(screen.getByText('No output.')).toBeInTheDocument()
  })

  it('renders the empty state when value is undefined', () => {
    render(<OutputRenderer value={undefined} />)
    expect(screen.getByTestId('output-empty')).toBeInTheDocument()
  })

  it('renders a string value as a text <pre>', () => {
    render(<OutputRenderer value={wrap('hello\nworld')} />)
    const pre = screen.getByTestId('output-text')
    expect(pre).toBeInTheDocument()
    expect(pre.textContent).toContain('hello')
    expect(pre.textContent).toContain('world')
  })

  it('renders an array of objects as a table with header row', () => {
    render(
      <OutputRenderer
        value={wrap([
          { id: 'a', name: 'one' },
          { id: 'b', name: 'two' },
        ])}
      />
    )
    const table = screen.getByTestId('output-table')
    expect(table).toBeInTheDocument()
    expect(table.textContent).toContain('id')
    expect(table.textContent).toContain('name')
    const rows = screen.getAllByTestId('output-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('a')
    expect(rows[1]?.textContent).toContain('two')
  })

  it('renders an array of scalars as a newline-joined list <pre>', () => {
    render(<OutputRenderer value={wrap(['a', 'b', 'c'])} />)
    const pre = screen.getByTestId('output-list')
    expect(pre).toBeInTheDocument()
    expect(pre.textContent).toBe('a\nb\nc')
  })

  it('renders an empty array as the "(empty list)" list <pre>', () => {
    render(<OutputRenderer value={wrap([])} />)
    const pre = screen.getByTestId('output-list')
    expect(pre).toBeInTheDocument()
    expect(pre.textContent).toBe('(empty list)')
  })

  it('renders null and missing table cells as empty <td>s while still stringifying defined cells', () => {
    render(
      <OutputRenderer
        value={wrap([
          { id: 'a', name: null, note: undefined, tag: 'x' },
          { id: 'b' },
        ])}
      />
    )
    const rows = screen.getAllByTestId('output-row')
    expect(rows).toHaveLength(2)

    // First row: defined cells render as strings, null/undefined cells stay empty.
    const firstRow = rows[0]
    if (!firstRow) throw new Error('expected first output-row to be present')
    const firstCells = firstRow.querySelectorAll('td')
    expect(firstCells).toHaveLength(4)
    expect(firstCells[0]?.textContent).toBe('a')
    expect(firstCells[1]?.textContent).toBe('')
    expect(firstCells[2]?.textContent).toBe('')
    expect(firstCells[3]?.textContent).toBe('x')

    // Second row: only `id` is defined; every other cell is empty.
    const secondRow = rows[1]
    if (!secondRow) throw new Error('expected second output-row to be present')
    const secondCells = secondRow.querySelectorAll('td')
    expect(secondCells).toHaveLength(4)
    expect(secondCells[0]?.textContent).toBe('b')
    expect(secondCells[1]?.textContent).toBe('')
    expect(secondCells[2]?.textContent).toBe('')
    expect(secondCells[3]?.textContent).toBe('')
  })

  it('renders an object value as a pretty-printed <pre>', () => {
    render(<OutputRenderer value={wrap({ id: 'a', nested: { x: 1 } })} />)
    const pre = screen.getByTestId('output-object')
    expect(pre).toBeInTheDocument()
    expect(pre.textContent).toContain('"id": "a"')
    expect(pre.textContent).toContain('"nested"')
    expect(pre.textContent).toContain('"x": 1')
  })

  it('renders a scalar value as a <pre>', () => {
    render(<OutputRenderer value={wrap(42)} />)
    const pre = screen.getByTestId('output-scalar')
    expect(pre).toBeInTheDocument()
    expect(pre.textContent).toBe('42')
  })

  it('preserves the AC-14 mono palette (no brand colour hex)', () => {
    const { container } = render(
      <OutputRenderer
        value={wrap([
          { id: 'a', name: 'one' },
          { id: 'b', name: 'two' },
        ])}
      />
    )
    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })
})
