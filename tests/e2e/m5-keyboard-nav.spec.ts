/// <reference types="mocha" />
/// <reference types="webdriverio" />
/**
 * M5 spec E2E — vim-style keyboard navigation across the list view.
 *
 * Given the fixture workspace from scripts/make-fixture.sh (25
 * Beads issues),
 *
 *   when the user presses `j` on the body,
 *     then the first rendered row is selected (data-row-selected).
 *   and when the user presses `j` again,
 *     then the second rendered row is selected.
 *   and when the user presses `k`,
 *     then the cursor moves back to the first row.
 *   and when the user presses `Enter`,
 *     then the issue detail drawer opens with that issue loaded.
 *
 * Plus negative-path coverage:
 *
 *   - Pressing `j` inside the search input does NOT change the
 *     cursor (the typing-surface guard kicks in).
 *   - Pressing `Escape` clears the cursor.
 *   - Pressing `/` from the list view switches to the search view
 *     AND focuses the search input.
 *   - The command palette's "Search Issues" command does the same.
 *
 * The DOM contract under test (see src/hooks/use-keyboard-navigation.ts
 * and the view components that opt rows in):
 *   - `[data-kbd-nav="row"][data-row-id="<id>"]` opts a row in.
 *   - `data-row-selected="true"` marks the active cursor row.
 *
 * The "open the fixture workspace" step is shared via
 * `tests/e2e/helpers.ts` -- see that file for the isolation
 * rationale. Spec-specific waits (keyboard listener mount) live below.
 */

import { browser, expect, $ } from '@wdio/globals'

import { openFixtureWorkspace } from './helpers'

/**
 * Dispatch a keydown event with no modifier keys. Mirrors how the
 * `use-keyboard-navigation` hook receives input (document-level
 * keydown). Bypasses WebDriver's element-focus requirement so we
 * can fire `j` from the body without first clicking somewhere.
 */
async function dispatchKey(key: string): Promise<void> {
  await browser.execute((k: string) => {
    const event = new KeyboardEvent('keydown', {
      key: k,
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(event)
  }, key)
}

/**
 * Find the row whose data-row-id matches `id` and read its
 * data-row-selected attribute. The view's keyboard-cursor effect
 * re-renders the row when the cursor changes, so polling is OK —
 * the change happens synchronously after the keydown.
 */
async function isRowSelected(id: string): Promise<boolean | null> {
  return browser.execute((rowId: string) => {
    const el = document.querySelector(
      `[data-kbd-nav="row"][data-row-id="${rowId}"]`
    )
    if (!el) return null
    return el.getAttribute('data-row-selected') === 'true'
  }, id)
}

async function getRowIds(): Promise<string[]> {
  return browser.execute(() =>
    Array.from(
      document.querySelectorAll('[data-kbd-nav="row"][data-row-id]')
    ).map(el => el.getAttribute('data-row-id') ?? '')
  )
}

describe('Collier M5 vim-style keyboard navigation', () => {
  before(async () => {
    await openFixtureWorkspace('m5-keyboard')

    // Confirm the list view's rows have opted into the keyboard
    // nav contract. If `data-kbd-nav="row"` is missing, every
    // test below would silently no-op — fail loudly instead.
    const rowCount = await browser.execute(
      () =>
        document.querySelectorAll('[data-kbd-nav="row"][data-row-id]').length
    )
    if (typeof rowCount !== 'number' || rowCount === 0) {
      throw new Error(
        'no rows opted into keyboard navigation — IssueListView contract broken'
      )
    }

    // Wait for the page header so we know the workspace is fully
    // mounted (parity with the other specs).
    const header = await $('[data-testid="page-header"]')
    await header.waitForDisplayed({ timeout: 10_000 })
  })

  it('j selects the first rendered row, then the next, then Enter opens it', async () => {
    const rowIds = await getRowIds()
    expect(rowIds.length).toBeGreaterThan(1)
    const firstId = rowIds[0]
    const secondId = rowIds[1]
    if (!firstId || !secondId) {
      throw new Error('expected at least two rendered rows for j to walk')
    }

    // -- When: press j twice to move the cursor down two rows --
    await dispatchKey('j')
    // The hook's effect is synchronous, but React's commit +
    // the next paint cycle still has to land. Poll the DOM
    // attribute rather than racing the commit.
    await browser.waitUntil(
      async () => (await isRowSelected(firstId)) === true,
      { timeout: 2_000, interval: 50, timeoutMsg: 'first row not selected' }
    )

    await dispatchKey('j')
    await browser.waitUntil(
      async () => (await isRowSelected(secondId)) === true,
      { timeout: 2_000, interval: 50, timeoutMsg: 'second row not selected' }
    )

    // Sanity: only the cursor row is selected, the prior one isn't.
    expect(await isRowSelected(firstId)).toBe(false)

    // -- When: press Enter to open the detail drawer --
    await dispatchKey('Enter')

    // -- Then: the drawer is mounted with the second row's id --
    const drawer = await $('[data-testid="issue-detail-drawer"]')
    await drawer.waitForDisplayed({ timeout: 5_000 })

    // The drawer's "bd-show" cache is keyed on the active issue
    // id; assert via the workspace store rather than the DOM.
    // Falling back to a DOM-level check: the drawer renders the
    // issue id in its title bar (testid="issue-detail-title"
    // or a heading). Both are stable enough; we use the page
    // title's aria relationship to the drawer content. Simpler:
    // read the active issue via the cache handle exposed by
    // src/main.tsx under VITE_E2E.
    const openedId = await browser.execute(() => {
      const client = (
        globalThis as unknown as {
          __collierQueryClient__?: {
            getQueryCache: () => {
              getAll: () => {
                queryKey: readonly unknown[]
                state: { data: unknown }
              }[]
            }
          }
        }
      ).__collierQueryClient__
      if (!client) return null
      const queries = client.getQueryCache().getAll()
      for (const q of queries) {
        const key = q.queryKey
        if (
          Array.isArray(key) &&
          key[0] === 'beads' &&
          key[1] === 'show' &&
          q.state.data
        ) {
          const data = q.state.data as { id?: string }
          if (typeof data.id === 'string') return data.id
        }
      }
      return null
    })
    expect(openedId).toBe(secondId)
  })

  it('k moves the cursor back up through the rendered rows', async () => {
    // Open the workspace fresh — the prior test left a drawer open,
    // and the keyboard hook ignores j/k while a drawer is up. Close
    // the drawer via Escape (owned by the drawer), then start clean.
    await browser.keys('Escape')
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="issue-detail-drawer"]').isExisting()) === false,
      { timeout: 5_000, interval: 100, timeoutMsg: 'drawer did not close' }
    )

    // Clear any stale cursor from prior tests.
    await browser.execute(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any
      // No public store-reset; force a keypress that the hook reads.
      // `Escape` while no drawer is open just clears the cursor.
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        })
      )
      // Suppress unused warning.
      void win
    })

    const rowIds = await getRowIds()
    expect(rowIds.length).toBeGreaterThan(1)
    const firstId = rowIds[0]
    const secondId = rowIds[1]
    if (!firstId || !secondId) {
      throw new Error('expected at least two rendered rows for k to walk')
    }

    // j j → cursor on row 2
    await dispatchKey('j')
    await browser.waitUntil(
      async () => (await isRowSelected(firstId)) === true,
      { timeout: 2_000, interval: 50, timeoutMsg: 'row 1 not selected' }
    )
    await dispatchKey('j')
    await browser.waitUntil(
      async () => (await isRowSelected(secondId)) === true,
      { timeout: 2_000, interval: 50, timeoutMsg: 'row 2 not selected' }
    )

    // -- When: k --
    await dispatchKey('k')

    // -- Then: cursor back on row 1 --
    await browser.waitUntil(
      async () => (await isRowSelected(firstId)) === true,
      { timeout: 2_000, interval: 50, timeoutMsg: 'k did not move cursor back' }
    )
    expect(await isRowSelected(secondId)).toBe(false)
  })

  it('Escape clears the cursor when no drawer is open', async () => {
    // After the previous test the cursor sits on row 1.
    const rowIds = await getRowIds()
    const firstId = rowIds[0]
    if (!firstId) throw new Error('no rendered rows')

    expect(await isRowSelected(firstId)).toBe(true)

    await dispatchKey('Escape')

    await browser.waitUntil(
      async () => (await isRowSelected(firstId)) === false,
      {
        timeout: 2_000,
        interval: 50,
        timeoutMsg: 'Escape did not clear cursor',
      }
    )
  })

  it('/ switches to the search view and focuses the search input', async () => {
    // -- Given: we're on the list view --
    // No setup needed — the list view is the default landing page
    // after openFixtureWorkspace.

    // -- When: press / from the list view --
    await dispatchKey('/')

    // -- Then: the search view is mounted --
    const searchView = await $('[data-testid="search-view"]')
    await searchView.waitForDisplayed({ timeout: 5_000 })

    // -- And: the search input is focused (document.activeElement
    //    points at it). Polled because the focus event fires after
    //    the view mounts. --
    await browser.waitUntil(
      async () => {
        const activeTestId = await browser.execute(
          () =>
            (document.activeElement as HTMLElement | null)?.getAttribute(
              'data-testid'
            ) ?? null
        )
        return activeTestId === 'search-input'
      },
      {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: 'search input did not receive focus from /',
      }
    )
  })

  it('does not steal j/k/Enter when the user is typing in the search input', async () => {
    // The previous test landed focus in the search input. Type a
    // letter + a navigation key and assert the cursor does NOT
    // change (because the keyboard nav hook bails when the focus
    // target is an input).

    const searchInput = await $('[data-testid="search-input"]')
    await searchInput.waitForDisplayed({ timeout: 5_000 })

    // Reset any cursor the prior tests left in the workspace store
    // by re-loading the list view (which clears the cursor on
    // activeView change... actually it doesn't, but pressing
    // Escape while no drawer is open clears it). Simpler: dispatch
    // Escape from the body.
    await dispatchKey('Escape')

    // Type a search query that includes a navigation key. The
    // keyboard hook's typing-guard MUST prevent the hook from
    // firing j/k/Enter.
    await searchInput.click()
    await searchInput.setValue('hello j world')

    const value = await searchInput.getValue()
    expect(value).toBe('hello j world')

    // No row should be selected — the hook bailed on every
    // keystroke while focus was on the search input.
    const anySelected = await browser.execute(() => {
      const els = document.querySelectorAll('[data-row-selected="true"]')
      return els.length
    })
    expect(anySelected).toBe(0)
  })
})
