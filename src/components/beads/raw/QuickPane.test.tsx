/**
 * Tests for the QuickPane (T44).
 *
 * Contract: QuickPane renders a search input + a recent list + a list
 * of common bd subcommand suggestions. Typing into the input
 * case-insensitively filters suggestions. Clicking a suggestion or
 * recent item invokes `onSelect` and pushes the picked command to the
 * top of the recent list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'

const importSut = () => import('./QuickPane')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('QuickPane', () => {
  it('renders the search input, recent section, and suggestion list', async () => {
    const { QuickPane } = await importSut()
    render(<QuickPane />)

    expect(screen.getByTestId('quick-pane')).toBeInTheDocument()
    expect(screen.getByTestId('quick-pane-input')).toBeInTheDocument()
    expect(screen.getByTestId('quick-pane-recent')).toBeInTheDocument()
    expect(screen.getByTestId('quick-pane-suggestion')).toBeInTheDocument()

    const suggestions = screen.getAllByTestId('quick-pane-suggestion-item')
    expect(suggestions.length).toBeGreaterThan(0)
  })

  it('filters suggestions case-insensitively as the user types', async () => {
    const { QuickPane } = await importSut()
    render(<QuickPane />)

    fireEvent.change(screen.getByTestId('quick-pane-input'), {
      target: { value: 'READY' },
    })

    const filtered = screen.getAllByTestId('quick-pane-suggestion-item')
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.getAttribute('data-cmd')).toBe('ready')
  })

  it('shows the empty-suggestion state when the query has no matches', async () => {
    const { QuickPane } = await importSut()
    render(<QuickPane />)

    fireEvent.change(screen.getByTestId('quick-pane-input'), {
      target: { value: 'zzznomatch' },
    })

    expect(
      screen.getByTestId('quick-pane-suggestion-empty')
    ).toBeInTheDocument()
  })

  it('invokes onSelect and pushes the picked command to the top of recent', async () => {
    const onSelect = vi.fn()
    const { QuickPane } = await importSut()
    render(<QuickPane onSelect={onSelect} />)

    const firstSuggestion = screen.getAllByTestId(
      'quick-pane-suggestion-item'
    )[0]
    if (!firstSuggestion) throw new Error('expected a suggestion item')
    const pickedCmd = firstSuggestion.getAttribute('data-cmd') ?? ''
    fireEvent.click(firstSuggestion)

    expect(onSelect).toHaveBeenCalledWith(pickedCmd)
    const recentItems = screen.getAllByTestId('quick-pane-recent-item')
    expect(recentItems[0]?.getAttribute('data-cmd')).toBe(pickedCmd)
  })

  it('hydrates the recent list from initialRecent', async () => {
    const { QuickPane } = await importSut()
    render(<QuickPane initialRecent={['list', 'show']} />)

    const items = screen.getAllByTestId('quick-pane-recent-item')
    expect(items).toHaveLength(2)
    expect(items[0]?.getAttribute('data-cmd')).toBe('list')
    expect(items[1]?.getAttribute('data-cmd')).toBe('show')
  })

  it('clicks a recent item to invoke onSelect and reorder the list', async () => {
    // ponytail: this test exists specifically to cover the recent-item
    // click handler on QuickPane.tsx L173. The suggestion-click handler
    // is exercised by "invokes onSelect and pushes the picked command
    // to the top of recent" above, but the recent list rendered for
    // initialRecent never had its onClick wired up in any other test,
    // so the closure (`handlePick(cmd)` with `cmd` bound from the recent
    // .map) stayed at 0 hits and pulled the file down to 95.83% lines.
    const onSelect = vi.fn()
    const { QuickPane } = await importSut()
    render(<QuickPane initialRecent={['list', 'show']} onSelect={onSelect} />)

    const items = screen.getAllByTestId('quick-pane-recent-item')
    const secondItem = items[1]
    if (!secondItem) throw new Error('expected a second recent item')
    const pickedCmd = secondItem.getAttribute('data-cmd') ?? ''
    expect(pickedCmd).toBe('show')

    fireEvent.click(secondItem)

    expect(onSelect).toHaveBeenCalledWith('show')
    const reordered = screen.getAllByTestId('quick-pane-recent-item')
    expect(reordered).toHaveLength(2)
    expect(reordered[0]?.getAttribute('data-cmd')).toBe('show')
    expect(reordered[1]?.getAttribute('data-cmd')).toBe('list')
  })

  it('caps the recent list at maxRecent (default 5)', async () => {
    const onSelect = vi.fn()
    const { QuickPane } = await importSut()
    render(
      <QuickPane
        maxRecent={2}
        onSelect={onSelect}
        initialRecent={['a', 'b', 'c']}
      />
    )

    const items = screen.getAllByTestId('quick-pane-recent-item')
    expect(items).toHaveLength(2)
  })

  it('preserves the AC-14 mono palette (no brand colour hex)', async () => {
    const { QuickPane } = await importSut()
    const { container } = render(<QuickPane />)

    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })
})
