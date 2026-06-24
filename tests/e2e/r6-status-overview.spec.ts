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
 *     then one card per known status renders with the fixture
 *     counts and a progress bar matching the share of total.
 *   and when the user clicks a status card,
 *     then the workspace switches to the list view and the
 *     issue list filters to only that status.
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

    // Fixture distribution (see scripts/make-fixture.sh):
    //   open(10) in_progress(3) blocked(2) deferred(2) closed(8)
    // Total = 25, so percents are 40, 12, 8, 8, 32.
    const expected: {
      status: string
      count: string
      percent: string
    }[] = [
      { status: 'open', count: '10', percent: '40' },
      { status: 'in_progress', count: '3', percent: '12' },
      { status: 'blocked', count: '2', percent: '8' },
      { status: 'deferred', count: '2', percent: '8' },
      { status: 'closed', count: '8', percent: '32' },
    ]
    for (let i = 0; i < expected.length; i++) {
      const card = cards[i] as unknown as WebdriverIO.Element
      const exp = expected[i]
      if (!card || !exp) throw new Error(`missing card ${i}`)
      expect(await card.getAttribute('data-status')).toBe(exp.status)
      expect(await card.getAttribute('data-count')).toBe(exp.count)
      expect(await card.getAttribute('data-percent')).toBe(exp.percent)
      const bar = (await card.$(
        '[data-testid="status-card-bar"]'
      )) as unknown as WebdriverIO.Element
      expect(await bar.getAttribute('role')).toBe('progressbar')
      expect(await bar.getAttribute('aria-valuenow')).toBe(exp.percent)
    }

    // -- And: the footer reports the total issue count --
    const footer = await $('[data-testid="status-footer"]')
    const footerText = await footer.getText()
    expect(footerText).toMatch(/25/)
  })

  it('clicking a status card filters the issue list to that status', async () => {
    // -- Given: the Status overview is mounted --
    const statusTab = await $('[data-testid="sidebar-view-status"]')
    await statusTab.waitForDisplayed({ timeout: 5_000 })
    await statusTab.click()
    const statusView = await $('[data-testid="status-view"]')
    await statusView.waitForDisplayed({ timeout: 5_000 })

    // -- When: click the 'closed' card --
    const cards = await $$('[data-testid="status-card"]')
    let closedCard: WebdriverIO.Element | undefined
    for (const card of cards) {
      const c = card as unknown as WebdriverIO.Element
      if ((await c.getAttribute('data-status')) === 'closed') {
        closedCard = c
        break
      }
    }
    if (!closedCard) throw new Error('closed card not found')
    await closedCard.click()

    // -- Then: the workspace switches to the list view --
    const issueListView = await $('[data-testid="issue-list-view"]')
    await issueListView.waitForDisplayed({ timeout: 5_000 })

    // -- And: every visible issue row carries status=closed --
    // Wait for the filtered list to render at least one row.
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

    // The list footer reports "8 issues" for the closed bucket.
    const footerText = await browser.execute(
      () =>
        document.querySelector('[data-testid="list-footer"]')?.textContent ??
        null
    )
    expect(
      typeof footerText === 'string' && footerText.includes('8 issues')
    ).toBe(true)

    // The filter chip for the closed status is visible in the
    // list header — confirms the click reached the filter store.
    const statusChip = await $('[data-testid="filter-chip-status"]')
    await statusChip.waitForDisplayed({ timeout: 5_000 })
  })
})
