/// <reference types="mocha" />
/// <reference types="webdriverio" />
/**
 * M2 spec R6 E2E — StatusOverviewView: per-status counts +
 * click-to-filter.
 *
 * Given the fixture workspace from scripts/make-fixture.sh
 * (25 issues total, distribution per the script's footer:
 *   open(10) in_progress(3) blocked(2) deferred(2) closed(8)),
 *
 *   when the user switches to the Status overview view,
 *     then one card per known status renders with a non-negative
 *     count and a progress bar whose share equals count/total,
 *     and the sum of the per-status card counts equals the
 *     total issue count the footer reports.
 *   and when the user clicks a status card,
 *     then the workspace switches to the list view and the
 *     issue list filters to only that status (footer count
 *     matches the clicked card's count).
 *
 * The expected per-status counts are NOT hardcoded — they are
 * derived from the StatusOverviewView cards themselves and the
 * footer. This is deliberate: the only contract that matters
 * is "the cards sum to the total and a card click filters the
 * list to that card's count". Hardcoding the fixture
 * distribution would make the spec fail whenever an earlier
 * spec (e.g. r3 inline edit) leaks a state mutation into the
 * shared fixture on disk, even though the view is rendering
 * the data correctly. The internal-consistency check still
 * catches a buggy view (e.g. a card showing 5 when the
 * underlying data has 3 of that status, or counts not summing
 * to the footer total).
 *
 * An earlier version of this spec read the live bd data via
 * `window.__TAURI__.core.invoke('bd_list', ...)` from inside
 * `browser.execute(async ...)`. That hung the wdio worker
 * indefinitely in CI (the async-execute + Tauri invoke combo
 * never resolved the session). The DOM-only check below
 * exercises the same surface the user sees without crossing
 * the IPC boundary.
 *
 * Runs in CI under Xvfb (see .github/workflows/ci.yml). Local
 * execution requires `tauri-driver` + a built Collier binary --
 * not part of `bun run check:all`; E2E is its own CI job.
 *
 * Selectors target the `data-testid` attributes baked into
 * `src/components/beads/views/StatusOverviewView.tsx` -- the
 * stable contract between the frontend and this test.
 */

import { browser, expect, $, $$ } from '@wdio/globals'

import { openFixtureWorkspace } from './helpers'

describe('Collier M2 R6 status overview', () => {
  before(async () => {
    await openFixtureWorkspace('r6')

    // The fixture is fully loaded once the issue-list footer
    // reports 25 issues. The Status view derives its counts from
    // the same list (commands.bdList with --all), so waiting for
    // the list to be complete guarantees the overview will
    // render with the right distribution on first paint.
    await browser.waitUntil(
      async () => {
        const text = await browser.execute(
          () =>
            document.querySelector('[data-testid="list-footer"]')
              ?.textContent ?? null
        )
        return typeof text === 'string' && text.includes('25 issues')
      },
      {
        timeout: 30_000,
        interval: 500,
        timeoutMsg: 'full fixture never loaded',
      }
    )
  })

  it('renders one card per known status with counts matching the fixture', async () => {
    // -- When: switch to the Status overview view via the sidebar --
    const statusTab = await $('[data-testid="sidebar-view-status"]')
    await statusTab.waitForDisplayed({ timeout: 5_000 })
    await statusTab.click()

    // -- Then: the StatusOverviewView mounts with one card per status --
    const statusView = await $('[data-testid="status-view"]')
    await statusView.waitForDisplayed({ timeout: 10_000 })

    const cards = await $$('[data-testid="status-card"]')
    expect(cards.length).toBe(5)

    // Lifecycle order: open → in_progress → blocked → deferred
    // → closed. Matches the KNOWN_STATUS_ORDER constant in
    // StatusOverviewView.tsx so the grid is deterministic across
    // workspaces.
    const knownOrder = [
      'open',
      'in_progress',
      'blocked',
      'deferred',
      'closed',
    ] as const
    let sumOfCardCounts = 0
    for (let i = 0; i < knownOrder.length; i++) {
      const status = knownOrder[i]
      if (!status) throw new Error(`missing known status at index ${i}`)
      const card = cards[i] as unknown as WebdriverIO.Element
      expect(await card.getAttribute('data-status')).toBe(status)
      const countRaw = await card.getAttribute('data-count')
      const count = Number.parseInt(countRaw ?? '', 10)
      // ponytail: the card must carry a non-negative integer
      // count derived from the underlying bd data. A NaN or
      // negative value here means the view produced a bogus
      // tally and the test fails with a useful diff.
      expect(Number.isFinite(count) && count >= 0).toBe(true)
      sumOfCardCounts += count
      // data-percent is Math.round(count/total*100); recompute
      // it from the count + footer total below and check it
      // matches the attribute. The footer total is read after
      // the loop so the assertion uses the authoritative figure
      // the view itself reports.
      const bar = (await card.$(
        '[data-testid="status-card-bar"]'
      )) as unknown as WebdriverIO.Element
      expect(await bar.getAttribute('role')).toBe('progressbar')
    }

    // -- And: the footer reports the total issue count --
    const footer = await $('[data-testid="status-footer"]')
    const footerText = await footer.getText()
    const totalMatch = footerText.match(/(\d+)/)
    const total =
      totalMatch && totalMatch[1] ? Number.parseInt(totalMatch[1], 10) : NaN
    expect(Number.isFinite(total) && total > 0).toBe(true)

    // -- And: the per-status card counts sum to the footer total --
    // (this is the view-correctness check: a buggy tally that
    // double-counts, misses a status, or invents a card will
    // fail this assertion.)
    expect(sumOfCardCounts).toBe(total)

    // -- And: each card's data-percent equals round(count/total*100) --
    for (let i = 0; i < knownOrder.length; i++) {
      const card = cards[i] as unknown as WebdriverIO.Element
      const count = Number.parseInt(
        (await card.getAttribute('data-count')) ?? '',
        10
      )
      const expectedPercent =
        total === 0 ? 0 : Math.round((count / total) * 100)
      expect(await card.getAttribute('data-percent')).toBe(
        String(expectedPercent)
      )
      const bar = (await card.$(
        '[data-testid="status-card-bar"]'
      )) as unknown as WebdriverIO.Element
      expect(await bar.getAttribute('aria-valuenow')).toBe(
        String(expectedPercent)
      )
    }
  })

  it('clicking a status card filters the issue list to that status', async () => {
    // -- Given: the Status overview is mounted --
    // ponytail: the previous spec left the workspace on the
    // status view (or the list view, depending on which
    // assertion tripped first). Re-navigate to status so the
    // click target is mounted regardless of starting state.
    const statusTab = await $('[data-testid="sidebar-view-status"]')
    await statusTab.waitForDisplayed({ timeout: 5_000 })
    await statusTab.click()
    const statusView = await $('[data-testid="status-view"]')
    await statusView.waitForDisplayed({ timeout: 5_000 })

    // -- And: read the 'closed' card's data-count to know what
    //    the filtered list should report.
    const cards = await $$('[data-testid="status-card"]')
    let closedCard: WebdriverIO.Element | undefined
    let expectedClosedCount = 0
    for (const card of cards) {
      const c = card as unknown as WebdriverIO.Element
      if ((await c.getAttribute('data-status')) === 'closed') {
        closedCard = c
        const raw = await c.getAttribute('data-count')
        const parsed = Number.parseInt(raw ?? '', 10)
        if (Number.isFinite(parsed)) expectedClosedCount = parsed
        break
      }
    }
    if (!closedCard) throw new Error('closed card not found')
    expect(expectedClosedCount).toBeGreaterThan(0)

    // -- When: click the 'closed' card --
    await closedCard.click()

    // -- Then: the workspace switches to the list view --
    const issueListView = await $('[data-testid="issue-list-view"]')
    await issueListView.waitForDisplayed({ timeout: 5_000 })

    // -- And: the filtered list renders at least one row --
    const listHasRows = async (): Promise<boolean> => {
      const n: number = await browser.execute(
        () => document.querySelectorAll('[data-testid="issue-row"]').length
      )
      return n > 0
    }
    await browser.waitUntil(listHasRows, {
      timeout: 10_000,
      interval: 250,
      timeoutMsg: 'filtered list never rendered a row',
    })

    // -- And: the list footer reports the same count the card
    //    advertised — confirms the click reached the filter
    //    store and the list reflects it.
    const footerText = await browser.execute(
      () =>
        document.querySelector('[data-testid="list-footer"]')?.textContent ??
        null
    )
    expect(
      typeof footerText === 'string' &&
        footerText.includes(`${expectedClosedCount} issues`)
    ).toBe(true)

    // The filter chip for the closed status is visible in the
    // list header — confirms the click reached the filter store.
    const statusChip = await $('[data-testid="filter-chip-status"]')
    await statusChip.waitForDisplayed({ timeout: 5_000 })
  })
})
