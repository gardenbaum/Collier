/// <reference types="mocha" />
/// <reference types="webdriverio" />
/**
 * M1 spec R2 E2E — filter sidebar wired to the issue list.
 *
 * Given the fixture workspace from scripts/make-fixture.sh
 * (25 Beads issues with statuses: open(10) in_progress(3)
 * blocked(2) deferred(2) closed(8)),
 *   when the user toggles a status filter chip in the sidebar,
 *     then only issues with that status remain in the list
 *     (verified via the footer count + the data-issue-status
 *     attribute on every rendered row).
 *   and when the user clicks "Clear all",
 *     then every dimension is cleared and the full list returns.
 *
 * The "deterministic" assertion is satisfied by:
 *   1. After clicking `sidebar-filter-status-open`, the list
 *      footer's count equals the fixture's open count (10),
 *      and every rendered row carries `data-issue-status="open"`.
 *   2. After clicking `filter-clear-all`, the footer count
 *      returns to the full fixture count (25), and the row
 *      statuses are no longer uniform.
 *
 * Runs in CI under Xvfb (see .github/workflows/ci.yml). Local
 * execution requires `tauri-driver` + a built Collier binary --
 * not part of `bun run check:all`; E2E is its own CI job.
 *
 * Selectors target the `data-testid` attributes baked into
 * `src/components/layout/Sidebar.tsx` and
 * `src/components/beads/issues/IssueListView.tsx` -- the stable
 * contract between the frontend and this test.
 *
 * The "open the fixture workspace" step is shared via
 * `tests/e2e/helpers.ts` -- see that file for the isolation
 * rationale. Spec-specific waits (full fixture footer) live below.
 */

import { browser, expect, $ } from '@wdio/globals'

import { openFixtureWorkspace } from './helpers'

// Fixture contract (from scripts/make-fixture.sh):
//   open=10 in_progress=3 blocked=2 deferred=2 closed=8
//   total=25
const TOTAL_FIXTURE = 25
const OPEN_FIXTURE = 10

describe('Collier M1 R2 filter sidebar', () => {
  before(async () => {
    await openFixtureWorkspace('r2')

    // The footer reflects the total count. Wait for the full
    // fixture (25 issues) to be loaded before sampling -- a
    // partial fetch would short-circuit the "Clear all restores
    // to 25" assertion below.
    await browser.waitUntil(
      async () => {
        const footer = await $('[data-testid="list-footer"]')
        const text = await footer.getText()
        return text.includes(`${TOTAL_FIXTURE} issues`)
      },
      {
        timeout: 30_000,
        interval: 500,
        timeoutMsg: 'full fixture never loaded',
      }
    )
  })

  it('applying a status filter reduces the list to only matching issues', async () => {
    // -- Given: full list is loaded (25 issues) --
    const initialFooter = await $('[data-testid="list-footer"]')
    expect(await initialFooter.getText()).toContain(`${TOTAL_FIXTURE} issues`)

    // -- When: click the "open" status chip in the sidebar --
    const openChip = await $('[data-testid="sidebar-filter-status-open"]')
    await openChip.waitForDisplayed({ timeout: 5_000 })
    await openChip.click()

    // The chip row in the issue-list-view now reflects the active
    // status dimension. Wait for it -- the React commit + query
    // refetch are async.
    const chip = await $('[data-testid="filter-chip-status"]')
    await chip.waitForDisplayed({ timeout: 10_000 })

    // -- Then: the footer reports the open count (10) --
    // The footer is inside the list-view, so it re-renders with
    // the new query data. Wait for the count to settle to 10.
    await browser.waitUntil(
      async () => {
        const footer = await $('[data-testid="list-footer"]')
        const text = await footer.getText()
        return text.startsWith('10 ')
      },
      {
        timeout: 30_000,
        interval: 500,
        timeoutMsg: 'list never settled at 10 open issues',
      }
    )

    // Every rendered row carries `data-issue-status="open"`.
    // The list is virtualised (~15 rows in the viewport), but
    // the contract is per-rendered-row: whatever the virtualizer
    // mounts MUST be open. We sample a window of 15 rows to
    // match the M1 R1 spec's pattern.
    const renderedStatuses = await readRenderedStatuses(15)
    console.log(
      `[e2e:r2] rendered statuses after open filter: ${renderedStatuses.join(',')}`
    )
    expect(renderedStatuses.length).toBeGreaterThan(0)
    for (const status of renderedStatuses) {
      expect(status).toBe('open')
    }
  })

  it('Clear all restores every issue', async () => {
    // -- Given: status=open is still active from the previous test --
    const footer = await $('[data-testid="list-footer"]')
    expect(await footer.getText()).toContain('10 issues')

    // -- When: click the Clear all button --
    const clearAll = await $('[data-testid="filter-clear-all"]')
    await clearAll.waitForDisplayed({ timeout: 5_000 })
    await clearAll.click()

    // The chip row disappears when no filter is active.
    await browser.waitUntil(
      async () => {
        const chip = await $('[data-testid="filter-chips"]')
        return !(await chip.isExisting())
      },
      { timeout: 10_000, interval: 250 }
    )

    // -- Then: the footer returns to the full fixture count --
    await browser.waitUntil(
      async () => {
        const text = await footer.getText()
        return text.includes(`${TOTAL_FIXTURE} issues`)
      },
      {
        timeout: 30_000,
        interval: 500,
        timeoutMsg: 'list never returned to 25',
      }
    )

    // Rendered rows are no longer uniform: statuses must
    // include at least one non-open issue (the fixture has
    // closed=8, in_progress=3, blocked=2, deferred=2).
    const renderedStatuses = await readRenderedStatuses(15)
    console.log(
      `[e2e:r2] rendered statuses after clear all: ${renderedStatuses.join(',')}`
    )
    expect(renderedStatuses.length).toBeGreaterThan(0)
    const distinctStatuses = new Set(renderedStatuses)
    // At least 2 distinct statuses in the visible slice --
    // proves the filter was actually cleared (a single-status
    // slice would mean the filter is still active).
    expect(distinctStatuses.size).toBeGreaterThanOrEqual(2)
  })

  it('AND composition: status + priority filters both apply', async () => {
    // ponytail: spec R2 explicitly requires AND composition.
    // The fixture has issues in every (status, priority) bucket,
    // so we can't prove AND by a single status filter alone.
    // Apply status=open AND priority=P1 and verify:
    //   (a) the rendered slice is uniform on BOTH dimensions
    //   (b) the footer count is < the open-only count of 10
    //       (some open issues are P2-P4, not P1).
    const openChip = await $('[data-testid="sidebar-filter-status-open"]')
    await openChip.waitForDisplayed({ timeout: 5_000 })
    await openChip.click()

    const p1Chip = await $('[data-testid="sidebar-filter-priority-P1"]')
    await p1Chip.waitForDisplayed({ timeout: 5_000 })
    await p1Chip.click()

    // Two chips + the Clear all chip should now be visible.
    const statusChip = await $('[data-testid="filter-chip-status"]')
    const priorityChip = await $('[data-testid="filter-chip-priority"]')
    await statusChip.waitForDisplayed({ timeout: 10_000 })
    await priorityChip.waitForDisplayed({ timeout: 10_000 })

    // The list re-keys on every chip click; wait for the count
    // to settle below 10 (the open-only baseline).
    const footer = await $('[data-testid="list-footer"]')
    await browser.waitUntil(
      async () => {
        const text = await footer.getText()
        const match = text.match(/^(\d+)/)
        if (!match) return false
        const count = Number.parseInt(match[1] as string, 10)
        return count > 0 && count < OPEN_FIXTURE
      },
      {
        timeout: 30_000,
        interval: 500,
        timeoutMsg: 'list never settled to a status+priority subset',
      }
    )

    // Every rendered row must carry BOTH data-issue-status=open
    // AND data-issue-priority=1. The data attribute is the bare
    // integer 0..4 — bd serialises IssuePriority via Serialize_repr
    // and the specta-generated TS type advertises the variant-name
    // string, so the assertion must read the integer shape, not
    // "P1" (see r1-sort.spec.ts for the matching convention).
    const rendered = await readRenderedRows(15)
    console.log(
      `[e2e:r2] rendered (status,priority) after AND: ${rendered
        .map(r => `${r.status}/${r.priority}`)
        .join(',')}`
    )
    expect(rendered.length).toBeGreaterThan(0)
    for (const row of rendered) {
      expect(row.status).toBe('open')
      expect(row.priority).toBe('1')
    }

    // Clear up for the next test.
    const clearAll = await $('[data-testid="filter-clear-all"]')
    await clearAll.click()
  })
})

/**
 * Read the `data-issue-status` attribute from the first N rendered
 * (windowed) rows. Stops when the row is no longer in the DOM --
 * the windowed slice is shorter than N when the total count is
 * small. Mirrors `readRenderedPriorities` from r1-sort.spec.ts.
 */
async function readRenderedStatuses(n: number): Promise<string[]> {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const row = await $(`[data-testid="issue-row"]:nth-of-type(${i + 1})`)
    if (!(await row.isExisting())) {
      break
    }
    const s = await row.getAttribute('data-issue-status')
    if (s) out.push(s)
  }
  return out
}

interface RenderedRow {
  status: string
  priority: string
}

/** Read both `data-issue-status` and `data-issue-priority` from
 * the first N rendered rows. Used by the AND-composition test to
 * prove both dimensions apply simultaneously. */
async function readRenderedRows(n: number): Promise<RenderedRow[]> {
  const out: RenderedRow[] = []
  for (let i = 0; i < n; i++) {
    const row = await $(`[data-testid="issue-row"]:nth-of-type(${i + 1})`)
    if (!(await row.isExisting())) {
      break
    }
    const status = await row.getAttribute('data-issue-status')
    const priority = await row.getAttribute('data-issue-priority')
    if (status && priority) {
      out.push({ status, priority })
    }
  }
  return out
}
