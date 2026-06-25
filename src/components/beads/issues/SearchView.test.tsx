/**
 * Tests for the SearchView list component.
 *
 * Contract: SearchView accepts a search input, detects query operators,
 * and routes to either `commands.bdSearch(cwd, q)` (plain text) or
 * `commands.bdQuery(cwd, q)` (operator syntax). Recent searches persist
 * to `localStorage` under `collier-recent-searches`, deduped, capped at 5,
 * newest first.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { hasQueryOperator } from './search-syntax'

// ponytail: hoisted so the vi.mock factory can reference the mock fns.
const { mockBdSearch, mockBdQuery } = vi.hoisted(() => ({
  mockBdSearch: vi.fn(),
  mockBdQuery: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdSearch: mockBdSearch,
    bdQuery: mockBdQuery,
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const importSut = () => import('./SearchView')

const issueA = {
  id: 'beads-1',
  title: 'Ship T19',
  status: 'open' as const,
  priority: 'P1' as const,
  issue_type: 'task' as const,
  created_at: '2026-06-16T00:00:00Z',
  updated_at: null,
  closed_at: null,
  description: null,
  owner: null,
  labels: [],
  dependencies: [],
  dependency_count: 0,
  dependent_count: 0,
  comment_count: 0,
  parent: null,
  acceptance_criteria: null,
  external_ref: null,
}

const issueB = {
  id: 'beads-2',
  title: 'Wire sidebar',
  status: 'in_progress' as const,
  priority: 'P0' as const,
  issue_type: 'bug' as const,
  created_at: '2026-06-16T00:00:00Z',
  updated_at: null,
  closed_at: null,
  description: null,
  owner: null,
  labels: [],
  dependencies: [],
  dependency_count: 0,
  dependent_count: 0,
  comment_count: 0,
  parent: null,
  acceptance_criteria: null,
  external_ref: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('hasQueryOperator', () => {
  it.each([
    ['hello', false],
    ['priority:0', true],
    ['state=open', true],
    ['priority>2', true],
    ['label:bug', true],
    ['owner:alice', true],
    ['plain text with no operators', false],
  ])('returns %s for %s', async (input, expected) => {
    expect(hasQueryOperator(input)).toBe(expected)
  })
})

describe('SearchView', () => {
  it('routes plain text to bdSearch and not bdQuery', async () => {
    mockBdSearch.mockResolvedValue({ status: 'ok', data: [] })
    mockBdQuery.mockResolvedValue({ status: 'ok', data: [] })

    const { SearchView } = await importSut()
    render(<SearchView cwd="/fake" />)

    const input = screen.getByTestId('search-input')
    const submit = screen.getByTestId('search-submit-button')

    // ponytail: change/input event so React's controlled input picks up the value
    input.focus()
    // Use the native setter so React notices the change.
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set
    nativeSetter?.call(input, 'hello')
    input.dispatchEvent(new Event('input', { bubbles: true }))

    submit.click()

    await waitFor(() => {
      expect(mockBdSearch).toHaveBeenCalledWith('/fake', 'hello')
    })
    expect(mockBdQuery).not.toHaveBeenCalled()
  })

  it('routes operator queries to bdQuery and not bdSearch', async () => {
    mockBdSearch.mockResolvedValue({ status: 'ok', data: [] })
    mockBdQuery.mockResolvedValue({ status: 'ok', data: [] })

    const { SearchView } = await importSut()
    render(<SearchView cwd="/fake" />)

    const input = screen.getByTestId('search-input') as HTMLInputElement
    const submit = screen.getByTestId('search-submit-button')

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set
    nativeSetter?.call(input, 'priority:0')
    input.dispatchEvent(new Event('input', { bubbles: true }))

    submit.click()

    await waitFor(() => {
      expect(mockBdQuery).toHaveBeenCalledWith('/fake', 'priority:0')
    })
    expect(mockBdSearch).not.toHaveBeenCalled()
  })

  it('renders one row per issue when bdSearch returns results', async () => {
    mockBdSearch.mockResolvedValue({ status: 'ok', data: [issueA, issueB] })

    const { SearchView } = await importSut()
    render(<SearchView cwd="/fake" />)

    const input = screen.getByTestId('search-input') as HTMLInputElement
    const submit = screen.getByTestId('search-submit-button')

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set
    nativeSetter?.call(input, 'hello')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    submit.click()

    await waitFor(() => {
      expect(screen.getAllByTestId('search-result-row')).toHaveLength(2)
    })

    const rows = screen.getAllByTestId('search-result-row')
    expect(rows[0]?.getAttribute('data-issue-id')).toBe('beads-1')
    expect(rows[1]?.getAttribute('data-issue-id')).toBe('beads-2')
    expect(rows[0]?.textContent).toContain('Ship T19')
    expect(rows[1]?.textContent).toContain('Wire sidebar')
  })

  it('persists recent searches to localStorage and rehydrates on remount', async () => {
    mockBdSearch.mockResolvedValue({ status: 'ok', data: [] })

    const { SearchView } = await importSut()

    const { unmount } = render(<SearchView cwd="/fake" />)

    const input1 = screen.getByTestId('search-input') as HTMLInputElement
    const submit = screen.getByTestId(
      'search-submit-button'
    ) as HTMLButtonElement

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set

    // Submit two queries; "second" should be at index 0 (newest first).
    nativeSetter?.call(input1, 'first')
    input1.dispatchEvent(new Event('input', { bubbles: true }))
    submit.click()

    await waitFor(() => {
      expect(mockBdSearch).toHaveBeenCalledWith('/fake', 'first')
    })

    nativeSetter?.call(input1, 'second')
    input1.dispatchEvent(new Event('input', { bubbles: true }))
    submit.click()

    await waitFor(() => {
      expect(mockBdSearch).toHaveBeenCalledWith('/fake', 'second')
    })

    // localStorage has both, newest first.
    const storedRaw = window.localStorage.getItem('collier-recent-searches')
    expect(storedRaw).not.toBeNull()
    const stored = JSON.parse(storedRaw ?? '[]') as string[]
    expect(stored).toEqual(['second', 'first'])

    // Remount: the recent-searches panel (toggled open) shows both.
    unmount()
    render(<SearchView cwd="/fake" />)

    // Open the recent panel (button only appears when there are recents).
    const toggle = await screen.findByTestId('recent-toggle')
    toggle.click()

    const items = await screen.findAllByTestId('recent-search-item')
    expect(items).toHaveLength(2)
    expect(items[0]?.getAttribute('data-query')).toBe('second')
    expect(items[1]?.getAttribute('data-query')).toBe('first')
  })

  it('renders the empty state when the result is an empty array', async () => {
    mockBdSearch.mockResolvedValue({ status: 'ok', data: [] })

    const { SearchView } = await importSut()
    render(<SearchView cwd="/fake" />)

    const input = screen.getByTestId('search-input') as HTMLInputElement
    const submit = screen.getByTestId('search-submit-button')

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set
    nativeSetter?.call(input, 'nothing')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    submit.click()

    await waitFor(() => {
      expect(screen.getByTestId('search-empty')).toBeInTheDocument()
    })
    expect(screen.getByText('No matches')).toBeInTheDocument()
  })

  it('renders the error state when bdSearch returns an error', async () => {
    mockBdSearch.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: 'no workspace',
      },
    })

    const { SearchView } = await importSut()
    render(<SearchView cwd="/fake" />)

    const input = screen.getByTestId('search-input') as HTMLInputElement
    const submit = screen.getByTestId('search-submit-button')

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set
    nativeSetter?.call(input, 'hello')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    submit.click()

    await waitFor(() => {
      expect(screen.getByTestId('search-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('search-error').textContent).toContain(
      'no workspace'
    )
  })

  it('does not use the accent color anywhere in the rendered output', async () => {
    mockBdSearch.mockResolvedValue({ status: 'ok', data: [issueA, issueB] })

    const { SearchView } = await importSut()
    const { container } = render(<SearchView cwd="/fake" />)

    const input = screen.getByTestId('search-input') as HTMLInputElement
    const submit = screen.getByTestId('search-submit-button')

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set
    nativeSetter?.call(input, 'hello')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    submit.click()

    await waitFor(() => {
      expect(screen.getAllByTestId('search-result-row')).toHaveLength(2)
    })

    // ponytail: AC-14 — the brand colour is reserved for destructive
    // actions and the P0 priority badge only.
    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })

  it('renders the dep badge on a result row that has a blocker', async () => {
    // M3 R8: search results share the row shape with the list /
    // ready / blocked views, so a search hit on a blocked issue
    // (e.g. searching for "OPT") must surface the same dep-badge
    // the user sees in IssueListView. This is the consistency
    // contract: same data, same chip.
    const blockedSearchResult = {
      ...issueA,
      id: 'beads-opt',
      title: 'Optimize queries',
      status: 'blocked' as const,
      dependency_count: 2,
      dependent_count: 1,
    }
    mockBdSearch.mockResolvedValue({
      status: 'ok',
      data: [blockedSearchResult],
    })

    const { SearchView } = await importSut()
    render(<SearchView cwd="/fake" />)

    const input = screen.getByTestId('search-input') as HTMLInputElement
    const submit = screen.getByTestId('search-submit-button')
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set
    nativeSetter?.call(input, 'OPT')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    submit.click()

    await waitFor(() => {
      expect(screen.getByTestId('search-result-row')).toBeInTheDocument()
    })

    const row = screen.getByTestId('search-result-row')
    const badge = row.querySelector('[data-testid="dep-badge"]')
    expect(badge).not.toBeNull()
    expect(badge?.getAttribute('data-blocked-by')).toBe('2')
    expect(badge?.getAttribute('data-blocks')).toBe('1')
    expect(badge?.textContent).toContain('blocked by 2')
    expect(badge?.textContent).toContain('blocks 1')
  })
})
