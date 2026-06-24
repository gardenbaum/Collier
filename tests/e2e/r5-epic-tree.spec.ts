/// <reference types="mocha" />
/// <reference types="webdriverio" />
/**
 * M2 spec R5 E2E — EpicView: collapsible tree with progress bars.
 *
 * Given the fixture workspace from scripts/make-fixture.sh
 * (2 epics: EPIC_AUTH with 3 children incl. 1 closed, EPIC_PERF
 * with 2 children and 0 closed; see .fixture-ids.json after the
 * fixture is generated),
 *
 *   when the user switches to the Epics view,
 *     then one row per epic renders, each with a progress bar.
 *   and when the user expands an epic,
 *     then its children render in a nested list with status pills
 *     and a clickable child row opens the issue detail drawer.
 *   and when the user clicks the chevron,
 *     then the children collapse, leaving the progress bar visible.
 *
 * Runs in CI under Xvfb (see .github/workflows/ci.yml). Local
 * execution requires `tauri-driver` + a built Collier binary --
 * not part of `bun run check:all`; E2E is its own CI job.
 *
 * The fixture data contract (see scripts/make-fixture.sh):
 *   - EPIC_AUTH (P1) → 3 children: Login form (closed),
 *     OAuth setup (in_progress), Password reset (open).
 *     Progress: 1/3 (33%).
 *   - EPIC_PERF (P2) → 2 children: Profile cache (open),
 *     Optimize queries (blocked). Progress: 0/2 (0%).
 *
 * Selectors target the `data-testid` attributes baked into
 * `src/components/beads/views/EpicView.tsx` -- the stable contract
 * between the frontend and this test.
 *
 * The "open the fixture workspace" step is shared via
 * `tests/e2e/helpers.ts` -- see that file for the isolation
 * rationale. Spec-specific waits (full fixture footer) live below.
 */

import { browser, expect, $, $$ } from '@wdio/globals'

import { openFixtureWorkspace } from './helpers'

describe('Collier M2 R5 epic tree with progress bars', () => {
  before(async () => {
    await openFixtureWorkspace('r5')

    // The fixture is fully loaded once the issue-list footer reports
    // 25 issues. The Epics view derives its tree from the same list
    // (commands.bdList), so waiting for the list to be complete
    // guarantees the epic tree will render with all epics and
    // children on first paint.
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

  it('renders one row per epic with a progress bar', async () => {
    // -- When: switch to the Epics view via the sidebar --
    const epicTab = await $('[data-testid="sidebar-view-epic"]')
    await epicTab.waitForDisplayed({ timeout: 5_000 })
    await epicTab.click()

    // -- Then: the EpicView mounts with one row per epic --
    const epicView = await $('[data-testid="epic-view"]')
    await epicView.waitForDisplayed({ timeout: 10_000 })

    const rows = await $$('[data-testid="epic-row"]')
    expect(rows.length).toBe(2)
    const authRow = rows[0] as unknown as WebdriverIO.Element
    if (!authRow) throw new Error('authRow is undefined')

    // -- And: each row carries a progress bar with aria-valuenow --
    const progressBars = await $$('[data-testid="epic-progress-bar"]')
    expect(progressBars.length).toBe(2)
    for (const bar of progressBars) {
      const role = await bar.getAttribute('role')
      expect(role).toBe('progressbar')
      const valuenow = await bar.getAttribute('aria-valuenow')
      expect(valuenow).not.toBeNull()
    }

    // -- And: the progress label encodes the closed/total counts --
    const labels = await $$('[data-testid="epic-progress"]')
    expect(labels.length).toBe(2)
    // The fixture seeds EPIC_AUTH with 1 closed of 3 children → 33%.
    const authId = await authRow.getAttribute('data-epic-id')
    expect(authId).toBeTruthy()
    // The first epic in the rendered order is the highest-priority one
    // (EPIC_AUTH, P1). Find the matching progress label by traversing
    // the row.
    const authLabel = (await authRow.$(
      '[data-testid="epic-progress"]'
    )) as unknown as WebdriverIO.Element
    expect(await authLabel.getAttribute('data-closed')).toBe('1')
    expect(await authLabel.getAttribute('data-total')).toBe('3')
    // aria-valuenow reflects 1/3 ≈ 33%.
    const authBar = (await authRow.$(
      '[data-testid="epic-progress-bar"]'
    )) as unknown as WebdriverIO.Element
    expect(await authBar.getAttribute('aria-valuenow')).toBe('33')
  })

  it('renders children when the epic is expanded (default) and supports collapse', async () => {
    // Re-navigate so this test is independent of any collapse done
    // by a sibling test (the same wdio worker may run multiple
    // `it` blocks sequentially).
    const epicTab = await $('[data-testid="sidebar-view-epic"]')
    await epicTab.click()
    const epicView = await $('[data-testid="epic-view"]')
    await epicView.waitForDisplayed({ timeout: 5_000 })

    const authRow = (await $$('[data-testid="epic-row"]'))[0]
    if (!authRow) throw new Error('no epic rows rendered')
    // Expanded by default → 3 children visible.
    let childRows = await authRow.$$('[data-testid="epic-child-row"]')
    expect(childRows.length).toBe(3)

    // The auth epic's first child (sorted by id) is "Login form".
    const firstChild = childRows[0] as unknown as WebdriverIO.Element
    if (!firstChild) throw new Error('firstChild is undefined')
    const firstChildId = await firstChild.getAttribute('data-issue-id')
    expect(firstChildId).toBeTruthy()

    // -- When: click the chevron to collapse --
    const chevron = await authRow.$('[data-testid="epic-chevron"]')
    await chevron.click()

    // -- Then: children are gone, but the progress label still renders --
    childRows = await authRow.$$('[data-testid="epic-child-row"]')
    expect(childRows.length).toBe(0)
    const progressAfter = await authRow.$('[data-testid="epic-progress"]')
    expect(await progressAfter.getAttribute('data-closed')).toBe('1')
    expect(await progressAfter.getAttribute('data-total')).toBe('3')
  })

  it('opens the issue detail drawer when a child row is clicked', async () => {
    const epicTab = await $('[data-testid="sidebar-view-epic"]')
    await epicTab.click()
    const epicView = await $('[data-testid="epic-view"]')
    await epicView.waitForDisplayed({ timeout: 5_000 })

    const authRow = (await $$('[data-testid="epic-row"]'))[0]
    if (!authRow) throw new Error('no epic rows rendered')

    // Ensure expanded (a sibling test may have collapsed it).
    const chevron = await authRow.$('[data-testid="epic-chevron"]')
    if ((await chevron.getAttribute('data-expanded')) !== 'true') {
      await chevron.click()
    }

    const childRow = (await authRow.$$('[data-testid="epic-child-row"]'))[0]
    if (!childRow) throw new Error('no child rows rendered')
    const childId = await childRow.getAttribute('data-issue-id')
    expect(childId).toBeTruthy()
    await childRow.click()

    // The IssueDetailDrawer mounts an element with data-testid
    // "issue-detail-view" (R4 uses the same selector). Wait for it
    // explicitly so the assertion doesn't race React's commit: the
    // screenshot in the failure artifact showed the drawer was open
    // moments later, but the query returned null on the first read.
    const drawer = await $('[data-testid="issue-detail-view"]')
    await drawer.waitForDisplayed({ timeout: 5_000 })
  })
})
