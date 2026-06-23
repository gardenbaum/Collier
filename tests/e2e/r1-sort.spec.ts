/// <reference types="mocha" />
/// <reference types="webdriverio" />
/**
 * M1 spec R1 E2E — sortable column headers.
 *
 * Given the fixture workspace from scripts/make-fixture.sh (25 Beads
 * issues spanning all 5 statuses, all 5 priorities, all 7 types, and
 * multiple assignees),
 *   when the user clicks a sort header on the issue list,
 *     then the rendered row order changes deterministically.
 *   and when the user clicks the same header again,
 *     then the rendered row order reverses.
 *
 * Runs in CI under Xvfb (see .github/workflows/ci.yml). Local
 * execution requires `tauri-driver` + a built Collier binary — not
 * part of `bun run check:all`; E2E is its own CI job.
 *
 * The "deterministic" assertion is satisfied by checking that:
 *   1. After clicking the priority header (asc), the FIRST row's
 *      `data-issue-priority` is `P0` — the highest-priority issue
 *      always sorts first ascending.
 *   2. After clicking it again (desc), the FIRST row's priority
 *      changes to one of the lower-priority buckets.
 *   3. The list of priorities in the windowed slice is monotonically
 *      non-decreasing in asc and non-increasing in desc — proving
 *      the sort is applied, not just a single row swap.
 *
 * Selectors target the `data-testid` attributes baked into
 * `src/components/beads/issues/IssueListView.tsx` — the stable
 * contract between the frontend and this test.
 */

import { browser, expect, $ } from '@wdio/globals'

describe('Collier M1 R1 sortable columns', () => {
  before(async () => {
    // -- Given: app launches and the fixture list is rendered --
    //
    // Window title comes from tauri.conf.json -> app.windows[0].title
    // (and from index.html's <title>; both are "Collier").
    const title = await browser.execute(() => document.title)
    expect(title).toBe('Collier')

    // The bootstrap screen (RepoSelection) gates the issue list.
    // When `bd` is on PATH and `.beads/` exists in CWD, the
    // "Use CWD" button appears — click it to load the fixture.
    const useCwdButton = await $('[data-testid="use-cwd-button"]')
    await useCwdButton.waitForDisplayed({ timeout: 30_000 })
    await useCwdButton.click()

    // Wait for the React Query behind <IssueListView /> to resolve
    // — the first `bd list` call on a fresh fixture pays the
    // Dolt cold-start cost (~5-30s on CI). The list-loading /
    // list-error / list-empty divs are mutually exclusive siblings
    // of the virtualised rows; whichever is present tells us what
    // state the query is in. We log them on the way past so the CI
    // log shows whether we hit a real error or just a slow data
    // load.
    const list = await $('[data-testid="issue-list-view"]')
    await list.waitForDisplayed({ timeout: 30_000 })

    const loading = await $('[data-testid="list-loading"]')
    const errorDiv = await $('[data-testid="list-error"]')
    if (await loading.isExisting()) {
      console.log('[e2e:r1] list-loading is visible (query in flight)')
    }
    if (await errorDiv.isExisting()) {
      const err = await errorDiv.getText()
      console.log(`[e2e:r1] list-error is visible: ${err}`)
    }

    // The fixture ships 25 issues (acceptance: >=1). Wait for at
    // least one row to mount before sampling. The budget must exceed
    // the app's bd subprocess timeout (120s) so a slow first Dolt
    // cold-start query under CI still resolves in time; steady-state
    // is ~1-2s.
    const firstRow = await $('[data-testid="issue-row"]')
    await firstRow.waitForDisplayed({ timeout: 150_000 })

    // The header row is a sibling of the scroll container inside
    // the issue-list-view — wait for it explicitly so the click
    // below doesn't race the React commit.
    const header = await $('[data-testid="issue-list-headers"]')
    await header.waitForDisplayed({ timeout: 5_000 })
  })

  it('clicking the priority header reorders the rendered rows', async () => {
    // -- When: click the priority header --
    const priorityHeader = await $('[data-testid="sort-header-priority"]')
    await priorityHeader.waitForDisplayed({ timeout: 5_000 })
    await priorityHeader.click()

    // -- Then: the header reports ascending --
    await expect(priorityHeader).toHaveAttribute('data-sort-direction', 'asc')

    // Read the priorities of the rendered (windowed) slice BEFORE
    // and AFTER the click. The fixture (scripts/make-fixture.sh)
    // ships 25 issues with priorities in {1,2,3,4} (P1..P4 — no P0)
    // so the most-urgent bucket in this dataset is P1. Ascending
    // sort must therefore put P1 at the top of the rendered slice.
    const topPrioritiesAsc = await readRenderedPriorities(15)
    console.log(
      `[e2e:r1] top priorities after asc: ${topPrioritiesAsc.join(',')}`
    )

    // First row is the highest-urgency bucket present in the fixture.
    expect(topPrioritiesAsc[0]).toBe('P1')

    // Subsequent priorities are monotonically non-decreasing
    // (P-rank-wise: P1 < P2 < P3 < P4). This proves the sort is
    // applied across the list, not a single-row swap.
    for (let i = 1; i < topPrioritiesAsc.length; i++) {
      const prev = priorityRank(topPrioritiesAsc[i - 1] as string)
      const cur = priorityRank(topPrioritiesAsc[i] as string)
      expect(cur).toBeGreaterThanOrEqual(prev)
    }

    // -- When: click the same header again --
    await priorityHeader.click()

    // -- Then: header reports descending, order reverses --
    await expect(priorityHeader).toHaveAttribute('data-sort-direction', 'desc')

    const topPrioritiesDesc = await readRenderedPriorities(15)
    console.log(
      `[e2e:r1] top priorities after desc: ${topPrioritiesDesc.join(',')}`
    )

    // First row is the LEAST-urgent bucket in the fixture.
    expect(topPrioritiesDesc[0]).toBe('P4')

    // Subsequent priorities are monotonically non-increasing.
    for (let i = 1; i < topPrioritiesDesc.length; i++) {
      const prev = priorityRank(topPrioritiesDesc[i - 1] as string)
      const cur = priorityRank(topPrioritiesDesc[i] as string)
      expect(cur).toBeLessThanOrEqual(prev)
    }

    // Determinism: the two orderings must be different — the
    // single-line proof that the click actually re-sorted the list.
    expect(topPrioritiesAsc.join(',')).not.toBe(topPrioritiesDesc.join(','))
  })

  it('clicking a different header resets the previous sort to none', async () => {
    // -- Given: priority is sorted (desc from the previous test) --
    const priorityHeader = await $('[data-testid="sort-header-priority"]')
    await expect(priorityHeader).toHaveAttribute('data-sort-direction', 'desc')

    // -- When: click the status header --
    const statusHeader = await $('[data-testid="sort-header-status"]')
    await statusHeader.click()

    // -- Then: status is asc, priority is none --
    await expect(statusHeader).toHaveAttribute('data-sort-direction', 'asc')
    await expect(priorityHeader).toHaveAttribute('data-sort-direction', 'none')

    // Sanity: status header advertises a real sort via aria-sort.
    const ariaSort = await statusHeader.getAttribute('aria-sort')
    expect(ariaSort).toBe('ascending')
  })
})

/**
 * Read the priority attribute from the first N rendered (windowed)
 * rows. The list is virtualised so we only see a slice of the total,
 * but the slice is large enough (~10 rows) to confirm the sort is
 * applied across the whole list, not just a single-row swap.
 */
async function readRenderedPriorities(n: number): Promise<string[]> {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const row = await $(`[data-testid="issue-row"]:nth-of-type(${i + 1})`)
    if (!(await row.isExisting())) {
      // Windowed slice is shorter than N — stop.
      break
    }
    const p = await row.getAttribute('data-issue-priority')
    if (p) out.push(p)
  }
  return out
}

/** Numeric rank for a priority string — mirrors the component's sort. */
function priorityRank(p: string): number {
  switch (p) {
    case 'P0':
      return 0
    case 'P1':
      return 1
    case 'P2':
      return 2
    case 'P3':
      return 3
    case 'P4':
      return 4
    default:
      return Number.MAX_SAFE_INTEGER
  }
}
