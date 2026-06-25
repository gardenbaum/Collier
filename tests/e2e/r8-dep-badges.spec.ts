/// <reference types="mocha" />
/// <reference types="webdriverio" />
/**
 * M3 spec R8 E2E — dep badges on issue rows + detail.
 *
 * Given the fixture workspace from scripts/make-fixture.sh
 * (25 Beads issues; see the fixture footer for exact counts),
 *
 *   when the user is on the default List view,
 *     then every issue row that has a non-zero
 *          `dependency_count` (incoming) or `dependent_count`
 *          (outgoing) shows a `data-testid="dep-badge"` inside
 *          its title cell. Rows with both counts at zero have
 *          no badge.
 *
 *   when the user opens the detail drawer for a known-blocked
 *        fixture issue (TASK_REFAC),
 *     then the header carries a `data-testid="dep-badge"`
 *          with `data-variant="header"` and the same counts
 *          surfaced as `data-blocked-by` / `data-blocks`.
 *
 * Counts come from `Issue.dependency_count` / `Issue.dependent_count`
 * on `bd list --json` / `bd show --json` (the Rust side's
 * `bd_list` / `bd_show` commands read them off the wire and the
 * React side never fans out a separate `bd show` per issue to
 * count edges — see the DependencyBadge component docstring for
 * the rationale).
 *
 * Runs in CI under Xvfb (see .github/workflows/ci.yml). Local
 * execution requires `tauri-driver` + a built Collier binary --
 * not part of `bun run check:all`; E2E is its own CI job.
 *
 * The "open the fixture workspace" step is shared via
 * `tests/e2e/helpers.ts` — see that file for the isolation
 * rationale.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { browser, expect, $ } from '@wdio/globals'

import { openFixtureWorkspace } from './helpers'

interface FixtureIds {
  TASK_OPT: string
  TASK_REFAC: string
  TASK_LOGIN: string
  TASK_MIGRATE: string
}

const FIXTURE_IDS_PATH = (() => {
  if (process.env.E2E_FIXTURE_DIR) {
    return path.join(process.env.E2E_FIXTURE_DIR, '.fixture-ids.json')
  }
  // ponytail: same fallback as r4-detail.spec.ts — the CI
  // workflow writes the fixture to /tmp/e2e-workspace and the
  // env var sometimes doesn't make it through wdio's runnerEnv.
  const ciFixture = '/tmp/e2e-workspace/.fixture-ids.json'
  if (existsSync(ciFixture)) {
    return ciFixture
  }
  return '.fixture-ids.json'
})()

function readFixtureIds(): FixtureIds {
  const raw = readFileSync(FIXTURE_IDS_PATH, 'utf8')
  return JSON.parse(raw) as FixtureIds
}

describe('Collier M3 R8 dependency badges everywhere', () => {
  let taskOptId = ''
  let taskRefacId = ''
  let taskLoginId = ''
  let taskMigrateId = ''

  before(async () => {
    await openFixtureWorkspace('r8')

    // The footer reflects the total count. Wait for the full
    // fixture (25 issues) to be loaded before sampling.
    await browser.waitUntil(
      async () => {
        const footer = await $('[data-testid="list-footer"]')
        const text = await footer.getText()
        return text.includes('25 issues')
      },
      {
        timeout: 30_000,
        interval: 500,
        timeoutMsg: 'full fixture never loaded',
      }
    )

    const ids = readFixtureIds()
    taskOptId = ids.TASK_OPT
    taskRefacId = ids.TASK_REFAC
    taskLoginId = ids.TASK_LOGIN
    taskMigrateId = ids.TASK_MIGRATE
  })

  it('renders a dep badge on a known-blocked row in the List view', async () => {
    // -- Given: we are on the default List view (IssueListView).
    // The openFixtureWorkspace helper lands us there.

    // -- And: TASK_OPT (status=blocked, dependency_count=1,
    //    dependent_count=1) is rendered as a row.
    const optRow = await $(
      `[data-testid="issue-row"][data-issue-id="${taskOptId}"]`
    )
    await optRow.waitForDisplayed({ timeout: 5_000 })

    // -- When: we read the title cell's dep-badge --
    const badge = await optRow.$('[data-testid="dep-badge"]')
    await badge.waitForDisplayed({ timeout: 5_000 })

    // -- Then: the badge exposes the issue's blocker and
    //    dependent counts as data attributes. The fixture
    //    seeds TASK_OPT with 1 incoming (MIGRATE) and 1
    //    outgoing (CACHE), so both chips must be present.
    const blockedBy = await badge.getAttribute('data-blocked-by')
    const blocks = await badge.getAttribute('data-blocks')
    expect(blockedBy).toBe('1')
    expect(blocks).toBe('1')

    // -- And: the readable text is wired up correctly.
    const text = (await badge.getText()) ?? ''
    expect(text).toContain('blocked by 1')
    expect(text).toContain('blocks 1')
  })

  it('renders a dep badge on a row that only blocks others', async () => {
    // -- Given: TASK_MIGRATE (status=open, dependency_count=0,
    //    dependent_count=1) is in the fixture.
    const migrateRow = await $(
      `[data-testid="issue-row"][data-issue-id="${taskMigrateId}"]`
    )
    await migrateRow.waitForDisplayed({ timeout: 5_000 })

    // -- Then: a "blocks" chip is present, but no "blocked by"
    //    chip — the issue doesn't depend on anything.
    const badge = await migrateRow.$('[data-testid="dep-badge"]')
    await badge.waitForDisplayed({ timeout: 5_000 })
    const blockedBy = await badge.getAttribute('data-blocked-by')
    const blocks = await badge.getAttribute('data-blocks')
    expect(blockedBy).toBeNull()
    expect(blocks).toBe('1')
  })

  it('renders a header dep badge in the detail drawer for a blocked issue', async () => {
    // -- When: open TASK_REFAC's detail drawer. TASK_REFAC is
    //    status=blocked in the fixture (it's the second of the
    //    two explicit blockers per make-fixture.sh). The drawer
    //    header must surface a header-variant dep badge so the
    //    user sees the same blocker info at a glance as they
    //    would in the list row.
    const row = await $(
      `[data-testid="issue-row"][data-issue-id="${taskRefacId}"]`
    )
    await row.waitForDisplayed({ timeout: 5_000 })
    const titleCell = await row.$('[data-column="title"]')
    await titleCell.click()

    const detail = await $('[data-testid="issue-detail-view"]')
    await detail.waitForDisplayed({ timeout: 5_000 })

    // -- Then: the header dep badge is present with the
    //    variant=header marker.
    const headerBadge = await detail.$('[data-testid="dep-badge"]')
    await headerBadge.waitForDisplayed({ timeout: 5_000 })
    const variant = await headerBadge.getAttribute('data-variant')
    expect(variant).toBe('header')

    // ponytail: clean up the drawer so the next test's sidebar
    // click (sidebar-view-blocked) isn't intercepted by the
    // drawer's `fixed inset-0` backdrop. Same pattern as
    // r3-inline-edit.spec.ts and r4-detail.spec.ts.
    const closeButton = await $('[data-testid="close-button"]')
    await closeButton.waitForDisplayed({ timeout: 5_000 })
    await closeButton.click()
    await detail.waitForDisplayed({ timeout: 1_000, reverse: true })
  })

  it('surfaces a dep badge on every row in the Blocked view', async () => {
    // -- When: switch to the Blocked view via the sidebar.
    const blockedTab = await $('[data-testid="sidebar-view-blocked"]')
    await blockedTab.waitForDisplayed({ timeout: 5_000 })
    await blockedTab.click()

    const blockedList = await $('[data-testid="blocked-list"]')
    await blockedList.waitForDisplayed({ timeout: 5_000 })

    // -- Then: every blocked row carries a dep-badge. The
    //    fixture seeds exactly 2 blocked issues (TASK_OPT,
    //    TASK_REFAC) so the list has 2 rows. Both must have
    //    a badge — the badge is the consistency contract
    //    across all four views.
    const rows = await browser.execute(() =>
      Array.from(document.querySelectorAll('[data-testid="blocked-row"]')).map(
        r => ({
          id: r.getAttribute('data-issue-id'),
          badgeExists: r.querySelector('[data-testid="dep-badge"]') !== null,
          text: r.textContent ?? '',
        })
      )
    )
    expect(rows.length).toBeGreaterThanOrEqual(2)
    rows.forEach(
      (row: { id: string | null; badgeExists: boolean; text: string }) => {
        expect(row.badgeExists).toBe(true)
        // Each row's text mentions at least one of the dep
        // chips ("blocked by" or "blocks"). The fixture
        // shapes are TASK_OPT=blocked_by(1) + blocks(1),
        // TASK_REFAC=blocks(1) (REFAC has no incoming
        // blockers — it IS the blocker for LOGIN). So we
        // assert one of the two strings is present, not
        // both.
        const mentionsDep =
          row.text.includes('blocked by') || row.text.includes('blocks')
        expect(mentionsDep).toBe(true)
      }
    )
  })

  it('renders the dep badge with the right count for TASK_LOGIN (dependency_count=2)', async () => {
    // -- Given: TASK_LOGIN (status=closed, dependency_count=2
    //    because REFAC and OAUTH both block it) is in the
    //    fixture. We can find its row in the List view.
    // First make sure we're back on the List view (the previous
    // test switched to Blocked).
    const listTab = await $('[data-testid="sidebar-view-list"]')
    await listTab.waitForDisplayed({ timeout: 5_000 })
    await listTab.click()

    const listView = await $('[data-testid="issue-list-view"]')
    await listView.waitForDisplayed({ timeout: 5_000 })

    // Wait for the row to be in the DOM (it may be virtualized;
    // scrolling isn't needed because the row exists, it's
    // just possibly out of the viewport).
    await browser.waitUntil(
      async () => {
        const exists = await browser.execute(
          (id: string) =>
            document.querySelector(
              `[data-testid="issue-row"][data-issue-id="${id}"]`
            ) !== null,
          taskLoginId
        )
        return Boolean(exists)
      },
      {
        timeout: 10_000,
        interval: 250,
        timeoutMsg: `TASK_LOGIN row never appeared`,
      }
    )

    // -- Then: the row's dep-badge carries `data-blocked-by="2"`.
    const badge = await browser.execute((id: string) => {
      const row = document.querySelector(
        `[data-testid="issue-row"][data-issue-id="${id}"]`
      )
      if (!row) return null
      const b = row.querySelector('[data-testid="dep-badge"]')
      if (!b) return null
      return {
        blockedBy: b.getAttribute('data-blocked-by'),
        blocks: b.getAttribute('data-blocks'),
        text: b.textContent ?? '',
      }
    }, taskLoginId)
    expect(badge).not.toBeNull()
    expect(badge?.blockedBy).toBe('2')
    expect(badge?.text).toContain('blocked by 2')
  })
})
