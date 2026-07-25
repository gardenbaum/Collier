/**
 * Tests for the SearchView list component.
 *
 * Contract: SearchView accepts a search input, detects query operators,
 * and routes to either `commands.bdSearch(cwd, q)` (plain text) or
 * `commands.bdQuery(cwd, q)` (operator syntax). Recent searches persist
 * to `localStorage` under `collier-recent-searches`, deduped, capped at 5,
 * newest first.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

afterEach(() => {
  // Restore any spies so a throw-mock in one test doesn't bleed
  // into the next and break the localStorage contract the rest
  // of the suite relies on.
  vi.restoreAllMocks()
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

  it('auto-focuses the search input on mount', async () => {
    // The keyboard hook dispatches `collier:focus-search-input`
    // synchronously after `setActiveView('search')`. That event
    // races with SearchView's mount: the view's listener is not
    // registered until its first useEffect runs, so the dispatch
    // is lost on the first `/`. Auto-focusing on mount closes the
    // race so the user lands in the input every time.
    mockBdSearch.mockResolvedValue({ status: 'ok', data: [] })

    const { SearchView } = await importSut()
    render(<SearchView cwd="/fake" />)

    const input = screen.getByTestId('search-input') as HTMLInputElement
    await waitFor(() => {
      expect(document.activeElement).toBe(input)
    })
  })

  it('focuses the search input when the global focus event fires', async () => {
    // The hook listens for `collier:focus-search-input` after the
    // race window, so dispatching the event on `window` must move
    // focus back to the input even if the user has tabbed away.
    mockBdSearch.mockResolvedValue({ status: 'ok', data: [] })

    const { SearchView } = await importSut()
    render(<SearchView cwd="/fake" />)

    const input = screen.getByTestId('search-input') as HTMLInputElement

    // Move focus somewhere else first so we can observe the event
    // pulling it back (otherwise auto-focus already wins).
    document.body.tabIndex = -1
    input.blur()
    document.body.focus()
    expect(document.activeElement).toBe(document.body)

    window.dispatchEvent(new Event('collier:focus-search-input'))

    await waitFor(() => {
      expect(document.activeElement).toBe(input)
    })
  })

  it('ignores submit when the input is whitespace only', async () => {
    // handleSubmit guards on `q.length === 0` after trimming, so a
    // form submission with only spaces must not trigger a search
    // and must not write to localStorage.
    mockBdSearch.mockResolvedValue({ status: 'ok', data: [] })

    const setItemSpy = vi.spyOn(window.localStorage, 'setItem')

    const { SearchView } = await importSut()
    render(<SearchView cwd="/fake" />)

    const input = screen.getByTestId('search-input') as HTMLInputElement
    const submit = screen.getByTestId('search-submit-button')

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set
    nativeSetter?.call(input, '   ')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    submit.click()

    // Give React a tick to flush; the search must NOT have fired
    // and storage must NOT have been touched.
    await new Promise(r => setTimeout(r, 0))
    expect(mockBdSearch).not.toHaveBeenCalled()
    expect(setItemSpy).not.toHaveBeenCalled()
    setItemSpy.mockRestore()
  })

  it('writes the trimmed query to localStorage on submit', async () => {
    // writeRecent receives the already-trimmed value from
    // handleSubmit, so leading/trailing whitespace typed by the
    // user must end up stored without the padding.
    mockBdSearch.mockResolvedValue({ status: 'ok', data: [] })

    const { SearchView } = await importSut()
    render(<SearchView cwd="/fake" />)

    const input = screen.getByTestId('search-input') as HTMLInputElement
    const submit = screen.getByTestId('search-submit-button')

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set
    nativeSetter?.call(input, '\thello\t')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    submit.click()

    await waitFor(() => {
      expect(mockBdSearch).toHaveBeenCalledWith('/fake', 'hello')
    })

    const storedRaw = window.localStorage.getItem('collier-recent-searches')
    expect(storedRaw).not.toBeNull()
    const stored = JSON.parse(storedRaw ?? '[]') as string[]
    expect(stored).toEqual(['hello'])
  })

  it('clicking a recent search resets the input and re-submits', async () => {
    // handleRecentClick sets both `input` and `submittedQuery`,
    // which (a) restores the input value the user can keep editing
    // and (b) triggers a new search via the useQuery refetch.
    mockBdSearch.mockResolvedValue({ status: 'ok', data: [] })

    // Pre-populate the recent-searches slot so the panel renders
    // on mount without needing to drive a full submit first.
    window.localStorage.setItem(
      'collier-recent-searches',
      JSON.stringify(['saved-query'])
    )

    const { SearchView } = await importSut()
    render(<SearchView cwd="/fake" />)

    const toggle = await screen.findByTestId('recent-toggle')
    toggle.click()

    const recentItem = await screen.findByTestId('recent-search-item')
    recentItem.click()

    // Input value resets to the recent query (waitFor so React's
    // state update + DOM commit land before we read the value).
    const input = screen.getByTestId('search-input') as HTMLInputElement
    await waitFor(() => {
      expect(input.value).toBe('saved-query')
    })

    // And a fresh search fires against bdSearch with that query.
    await waitFor(() => {
      expect(mockBdSearch).toHaveBeenCalledWith('/fake', 'saved-query')
    })
  })

  it('invokes onOpenIssue when a result row is clicked', async () => {
    // SearchRow wires the inner button's onClick to
    // `onOpenIssue?.(issue.id)` so the parent view can navigate
    // to the issue detail panel when a search hit is opened.
    mockBdSearch.mockResolvedValue({ status: 'ok', data: [issueA] })

    const onOpenIssue = vi.fn()

    const { SearchView } = await importSut()
    render(<SearchView cwd="/fake" onOpenIssue={onOpenIssue} />)

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
      expect(screen.getByTestId('search-result-row')).toBeInTheDocument()
    })

    const rowButton = screen.getByTestId('search-result-button')
    rowButton.click()

    expect(onOpenIssue).toHaveBeenCalledTimes(1)
    expect(onOpenIssue).toHaveBeenCalledWith('beads-1')
  })

  it('treats a non-array value in localStorage as an empty recent list', async () => {
    // readRecent guards with `if (!Array.isArray(parsed)) return []`
    // so a corrupt or hand-edited entry (object / number / null)
    // must not crash the view or surface bogus buttons.
    mockBdSearch.mockResolvedValue({ status: 'ok', data: [] })

    window.localStorage.setItem(
      'collier-recent-searches',
      JSON.stringify({ not: 'an array' })
    )

    const { SearchView } = await importSut()
    render(<SearchView cwd="/fake" />)

    // The recent toggle only renders when the parsed list has
    // entries — if the shape guard fired, the list is empty and
    // the toggle must be absent.
    expect(screen.queryByTestId('recent-toggle')).not.toBeInTheDocument()
  })

  it('falls back to an empty recent list when localStorage.getItem throws', async () => {
    // readRecent wraps the parse in try/catch and returns [] on
    // failure. We force the throw by storing malformed JSON and
    // letting JSON.parse blow up — that's the natural path that
    // triggers the catch block (a hand-edit of the slot, a
    // half-written value during a crash, etc).
    mockBdSearch.mockResolvedValue({ status: 'ok', data: [] })

    window.localStorage.setItem('collier-recent-searches', '{not json')

    const { SearchView } = await importSut()
    render(<SearchView cwd="/fake" />)

    // Initial view: prompt visible, recent toggle absent.
    expect(screen.getByTestId('search-prompt')).toBeInTheDocument()
    expect(screen.queryByTestId('recent-toggle')).not.toBeInTheDocument()
  })

  it('falls back to an empty recent list when getItem itself throws', async () => {
    // The other failure mode: storage is unavailable, so getItem
    // throws before JSON.parse ever runs. We exercise that path
    // explicitly because some storage backends (Safari private
    // mode, quota-exceeded) surface the error from getItem.
    mockBdSearch.mockResolvedValue({ status: 'ok', data: [] })

    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })

    const { SearchView } = await importSut()
    render(<SearchView cwd="/fake" />)

    expect(screen.getByTestId('search-prompt')).toBeInTheDocument()
    expect(screen.queryByTestId('recent-toggle')).not.toBeInTheDocument()
  })

  it('renders the dep badge with default 0 when an issue omits dependency_count', async () => {
    // DependencyBadge receives `issue.dependency_count ?? 0`; when
    // bd omits the field the default branch must kick in and the
    // chip must hide itself (hasIncoming is 0). The other chip
    // (blocks) is still rendered because dependent_count is set.
    mockBdSearch.mockResolvedValue({
      status: 'ok',
      data: [
        {
          ...issueA,
          id: 'beads-undef',
          dependency_count: undefined,
          dependent_count: 3,
        },
      ],
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
      expect(screen.getByTestId('search-result-row')).toBeInTheDocument()
    })

    const row = screen.getByTestId('search-result-row')
    const badge = row.querySelector('[data-testid="dep-badge"]')
    expect(badge).not.toBeNull()
    // dependency_count defaulted to 0 -> hasIncoming false ->
    // data-blocked-by attribute is omitted entirely.
    expect(badge?.getAttribute('data-blocked-by')).toBeNull()
    // dependent_count is set -> the blocks chip is present.
    expect(badge?.getAttribute('data-blocks')).toBe('3')
    expect(
      badge?.querySelector('[data-testid="dep-badge-blocks"]')
    ).not.toBeNull()
    expect(
      badge?.querySelector('[data-testid="dep-badge-blocked-by"]')
    ).toBeNull()
  })

  it('renders the dep badge with default 0 when an issue omits dependent_count', async () => {
    // Symmetric to the previous case: this exercises the
    // dependent_count default branch (`?? 0`) while keeping
    // dependency_count present so the blocked-by chip shows.
    mockBdSearch.mockResolvedValue({
      status: 'ok',
      data: [
        {
          ...issueA,
          id: 'beads-undef-2',
          dependency_count: 4,
          dependent_count: undefined,
        },
      ],
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
      expect(screen.getByTestId('search-result-row')).toBeInTheDocument()
    })

    const row = screen.getByTestId('search-result-row')
    const badge = row.querySelector('[data-testid="dep-badge"]')
    expect(badge).not.toBeNull()
    // dependency_count is set -> blocked-by chip present.
    expect(badge?.getAttribute('data-blocked-by')).toBe('4')
    // dependent_count defaulted to 0 -> hasOutgoing false ->
    // data-blocks attribute is omitted.
    expect(badge?.getAttribute('data-blocks')).toBeNull()
    expect(
      badge?.querySelector('[data-testid="dep-badge-blocked-by"]')
    ).not.toBeNull()
    expect(badge?.querySelector('[data-testid="dep-badge-blocks"]')).toBeNull()
  })
})

describe('SearchView defensive-guards (jsdom-invisible branches)', () => {
  // These are documented gaps: the source contains `typeof window
  // === 'undefined'` and `if (trimmed.length === 0) return items`
  // guards inside readRecent / writeRecent / pushRecent. jsdom
  // always defines `window` and handleSubmit already trims before
  // calling pushRecent, so the `true` side of these branches is
  // unreachable via observable behaviour. v8 will continue to
  // report them; we do NOT synthesise coverage by mutating the
  // source. See PR body for the rationale.
  //
  // The two readRecent *in-process* guards (non-array shape and
  // the catch-block fallback) ARE reachable via localStorage
  // mocking and are covered in the main `SearchView` describe
  // block above.
  it('documents that the SSR / empty-trim branches are unreachable from jsdom', () => {
    expect(true).toBe(true)
  })
})
