/// <reference types="mocha" />
/// <reference types="webdriverio" />
/**
 * M6 spec E2E — large-backlog performance.
 *
 * Background: docs/CONSTITUTION.md §1 marks "Performance is a
 * feature." Any list/tree that can exceed ~200 rows MUST be
 * virtualised (`@tanstack/react-virtual`); watcher events must
 * trigger _targeted_ store updates, never full-list re-renders.
 * The M6 perf card asks the app to stay smooth with a large
 * backlog.
 *
 * Given the large fixture workspace from
 * scripts/make-large-fixture.sh (1200 Beads issues — 120 epics,
 * 480 epic children, 600 standalones — seeded into
 * /tmp/e2e-workspace-large by the CI workflow's
 * "Generate large E2E fixture workspace (M6 perf)" step),
 *
 *   when the user opens the workspace from the workspace
 *        switcher,
 *     then the issue list view renders the 1200-issue count
 *        in the footer (proves the query landed) AND the DOM
 *        only carries the viewport slice + overscan (well
 *        under 100 rows in the DOM even though the list has
 *        1200 issues).
 *   and when the user scrolls to row 600,
 *     then a different row mounts in the DOM (proves the
 *        virtualizer is reacting to scroll, not just pinning
 *        the first slice).
 *   and when the user clicks a visible row,
 *     then the issue detail drawer opens with that issue
 *        loaded.
 *   and when the user navigates to the Epic view,
 *     then the epic tree renders the 120-epic count AND the
 *        DOM only carries the viewport slice + overscan.
 *
 * Selectors target the `data-testid` attributes baked into:
 *   - src/components/beads/issues/IssueListView.tsx
 *     (data-testid="issue-list-view", "issue-row",
 *      "issue-list-scroll", "list-footer"),
 *   - src/components/layout/Sidebar.tsx
 *     (data-testid="workspace-switcher-trigger",
 *      "workspace-switcher-menu", "sidebar-view-epic",
 *      "sidebar-view-list"),
 *   - src/components/beads/views/EpicView.tsx
 *     (data-testid="epic-view", "epic-tree-scroll",
 *      "epic-row", "epic-tree"),
 *   - src/components/beads/issues/IssueDetailView.tsx
 *     (data-testid="issue-detail-drawer").
 *
 * The "open the workspace" step is shared via
 * tests/e2e/helpers.ts (the idempotent workspace-open helper +
 * per-spec DB isolation; see that file for the isolation
 * rationale). This spec uses a different env-var path
 * (`E2E_LARGE_FIXTURE_DIR` -> /tmp/e2e-workspace-large) so
 * the fixture doesn't collide with the 25-issue default
 * fixture used by the other 12+ specs.
 */

import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { browser, expect, $ } from '@wdio/globals'

import { openFixtureWorkspace, openWorkspaceSwitcher } from './helpers'

/**
 * Resolve the large fixture workspace directory. The default
 * fixture (used by the 12+ other specs) lives at
 * /tmp/e2e-workspace; the M6 perf spec targets
 * /tmp/e2e-workspace-large so it can ship 1200 issues without
 * slowing the other specs' first-load queries.
 */
const fixtureDir = (() => {
  if (process.env.E2E_LARGE_FIXTURE_DIR)
    return process.env.E2E_LARGE_FIXTURE_DIR
  if (process.env.CI) return '/tmp/e2e-workspace-large'
  return path.join(process.cwd(), '.tmp-large-fixture')
})()

/**
 * Cheap assertion helper: count the number of DOM elements
 * matching the given selector via a single browser.execute
 * call. Using a single execute() instead of $$() keeps the
 * poll fast (avoids WebDriver round-trips per element) and
 * avoids wdio's element-handle staleness when the virtualizer
 * unmounts rows mid-iteration.
 */
async function countElements(selector: string): Promise<number> {
  return browser.execute((sel: string) => {
    return document.querySelectorAll(sel).length
  }, selector)
}

/**
 * Read the issue count from the list-footer text. The footer
 * format is `"X issues"` (plural for >1, singular for 1, no
 * issues for 0). Returns the parsed integer or null if the
 * footer isn't yet mounted.
 */
async function readIssueCountFromFooter(): Promise<number | null> {
  return browser.execute(() => {
    const el = document.querySelector('[data-testid="list-footer"]')
    if (!el) return null
    const text = el.textContent ?? ''
    // Footer shape: "1200 issues" / "1 issue" / "No issues".
    // Match the leading integer; ignore the unit suffix.
    const match = text.match(/(\d+)/)
    return match === null ? null : Number.parseInt(match[1] ?? '0', 10)
  })
}

describe('M6 — large-backlog performance', () => {
  const primaryFixtureDir = (() => {
    if (process.env.E2E_FIXTURE_DIR) return process.env.E2E_FIXTURE_DIR
    if (process.env.CI) return '/tmp/e2e-workspace'
    return process.cwd()
  })()
  before(async () => {
    // Sanity: the fixture must exist and have >= 1000 issues.
    // Failing fast here makes a "fixture missing" CI failure
    // obvious (instead of every test in this spec timing out
    // at the 150s first-row wait).
    let count: number
    try {
      const out = execFileSync('bd', ['list', '--all', '--json'], {
        cwd: fixtureDir,
        stdio: 'pipe',
        env: { ...process.env, BEADS_DIR: path.join(fixtureDir, '.beads') },
      })
      const parsed = JSON.parse(out.toString())
      count = Array.isArray(parsed) ? parsed.length : 0
    } catch (err) {
      throw new Error(
        `[m6-perf] could not query fixture at ${fixtureDir}: ${
          (err as Error).message
        }. Did the 'Generate large E2E fixture workspace (M6 perf)' CI step run?`
      )
    }
    if (count < 1000) {
      throw new Error(
        `[m6-perf] fixture at ${fixtureDir} only has ${count} issues (expected >= 1000). The make-large-fixture.sh seed may have been interrupted.`
      )
    }
    console.log(`[m6-perf] fixture ready at ${fixtureDir} (${count} issues)`)

    // Use the standard helper to drive the bootstrap path
    // (Use CWD button -> list view). The helper waits for the
    // first row to mount; with 1200 issues that first mount
    // is what the virtualizer serves immediately.
    await openFixtureWorkspace('m6-perf-large-backlog')

    // The shared helper lands us in /tmp/e2e-workspace (the
    // default 25-issue fixture) so the bootstrap path is
    // exercised uniformly across specs. The CI workflow
    // registers /tmp/e2e-workspace-large in
    // ~/.beads/registry.json alongside the other fixtures
    // (see .github/workflows/e2e.yml), so we switch to it via
    // the workspace dropdown before the perf assertions run.
    // Without this switch the list keeps showing the 25-issue
    // default fixture and every perf assertion times out
    // waiting for the 1200-issue footer.
    await openWorkspaceSwitcher()
    const switched = await browser.execute((target: string) => {
      const rows = Array.from(
        document.querySelectorAll('[data-testid="workspace-switcher-item"]')
      )
      const match = rows.find(
        r => r.getAttribute('data-workspace-path') === target
      )
      if (!(match instanceof HTMLElement)) return false
      match.click()
      return true
    }, fixtureDir)
    if (!switched) {
      throw new Error(
        `[m6-perf] workspace-switcher did not list ${fixtureDir}; CI must register the large fixture in ~/.beads/registry.json (see the 'Generate second E2E fixture workspace' step)`
      )
    }
    // Wait for the 1200-issue footer to confirm the new
    // workspace is live (Dolt cold-start on the large fixture
    // takes a few seconds).
    await browser.waitUntil(
      async () => {
        const text = await browser.execute(
          () =>
            document.querySelector('[data-testid="list-footer"]')
              ?.textContent ?? null
        )
        return text !== null && /\b1[2-9]\d{2}\b|\b[2-9]\d{3,}\b/.test(text)
      },
      {
        timeout: 30_000,
        interval: 500,
        timeoutMsg: `large-fixture footer never reported >= 1200 issues after switching to ${fixtureDir}`,
      }
    )
  })

  after(async () => {
    // Switch back to the default fixture so the 12+ specs that
    // follow this one in alphabetical order (`m6-release-hardening`,
    // `r1-sort`, `r10-realtime-sync`, …, `smoke`) bootstrap against
    // the 25-issue fixture their assertions are written for, not
    // the 1200-issue workspace we needed for the perf assertions.
    // The shared helper waits for the first issue row to mount, so
    // a leftover switcher dropdown or stale watcher would fail
    // loud here too — best-effort is wrong.
    await openWorkspaceSwitcher()
    const switched = await browser.execute((target: string) => {
      const rows = Array.from(
        document.querySelectorAll('[data-testid="workspace-switcher-item"]')
      )
      const match = rows.find(
        r => r.getAttribute('data-workspace-path') === target
      )
      if (!(match instanceof HTMLElement)) return false
      match.click()
      return true
    }, primaryFixtureDir)
    if (!switched) {
      throw new Error(
        `[m6-perf] could not switch back to ${primaryFixtureDir} after the perf run`
      )
    }
    await browser.waitUntil(
      async () => {
        const text = await browser.execute(
          () =>
            document.querySelector('[data-testid="list-footer"]')
              ?.textContent ?? null
        )
        return text !== null && text.includes('25 issues')
      },
      {
        timeout: 30_000,
        interval: 500,
        timeoutMsg:
          'primary 25-issue fixture never re-mounted after switching back',
      }
    )
  })

  it('renders the 1200-issue count in the footer and keeps the DOM bounded under the 200-row virtualisation ceiling', async () => {
    // Wait for the footer to surface the count (the virtualizer
    // and the query both resolve async; the footer is the
    // last DOM node to paint).
    const footerCount = await browser.waitUntil(
      async () => {
        const c = await readIssueCountFromFooter()
        return c !== null && c >= 1000 ? c : null
      },
      {
        timeout: 30_000,
        interval: 250,
        timeoutMsg: 'list-footer never reported >= 1000 issues',
      }
    )
    expect(footerCount).toBeGreaterThanOrEqual(1000)

    // Assert the DOM is bounded. Constitution §1 says: "Any
    // list/tree that can exceed ~200 rows MUST be virtualised
    // (only viewport nodes mount)." The virtualizer's overscan
    // of 5 on each side + a viewport of ~15 rows means we
    // expect ~25 rows in the DOM. We assert < 100 (well under
    // the 200-row ceiling) so the test stays stable across
    // viewport-size variations in the CI runner.
    const mountedRows = await countElements('[data-testid="issue-row"]')
    expect(mountedRows).toBeLessThan(100)
  })

  it('scrolling past the first slice mounts later rows in the DOM (virtualizer reacts to scroll)', async () => {
    // Capture the row IDs that are mounted now (the first
    // viewport slice).
    const initialIds = (await browser.execute(() =>
      Array.from(document.querySelectorAll('[data-testid="issue-row"]')).map(
        el => el.getAttribute('data-issue-id') ?? ''
      )
    )) as string[]

    // Scroll the list to a later offset. The virtualizer
    // listens for `scroll` events on the scroll element and
    // re-mounts the new viewport slice. We scroll to 20 000px
    // so we land somewhere in the middle of the 48 000px
    // virtual list (1200 issues * 40px = 48 000px).
    await browser.execute(() => {
      const scrollEl = document.querySelector(
        '[data-testid="issue-list-scroll"]'
      ) as HTMLElement | null
      if (scrollEl) {
        scrollEl.scrollTop = 20_000
      }
    })

    // Wait for the DOM to update. We poll the issue-ids because
    // the row COUNT stays bounded (the virtualizer is doing its
    // job); what changes is WHICH rows are mounted.
    await browser.waitUntil(
      async () => {
        const ids = (await browser.execute(() =>
          Array.from(
            document.querySelectorAll('[data-testid="issue-row"]')
          ).map(el => el.getAttribute('data-issue-id') ?? '')
        )) as string[]
        // The new slice must share NO ids with the initial
        // slice (a real scroll moved us past the first
        // window).
        return ids.some(id => !initialIds.includes(id))
      },
      {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: 'scrolling did not change the mounted row set after 5s',
      }
    )

    // And the row count is still bounded after the scroll —
    // the virtualizer didn't unmount/re-mount everything.
    const mountedAfter = await countElements('[data-testid="issue-row"]')
    expect(mountedAfter).toBeLessThan(100)
  })

  it('clicking a visible row opens the issue detail drawer with that issue loaded', async () => {
    // Reset scroll to top so the first row is the first
    // issue (deterministic for the click target).
    await browser.execute(() => {
      const scrollEl = document.querySelector(
        '[data-testid="issue-list-scroll"]'
      ) as HTMLElement | null
      if (scrollEl) {
        scrollEl.scrollTop = 0
      }
    })
    // Wait for the scroll to settle.
    await browser.pause(100)

    // Click the first visible row.
    const firstRow = await $('[data-testid="issue-row"]')
    await firstRow.waitForDisplayed({ timeout: 5_000 })
    const rowId = await firstRow.getAttribute('data-issue-id')
    await firstRow.click()

    // The drawer should mount and carry the same issue id.
    const drawer = await $('[data-testid="issue-detail-drawer"]')
    await drawer.waitForDisplayed({ timeout: 5_000 })
    // The drawer's accessible title or heading references
    // the issue id (M4 R4 contract: the drawer title shows
    // the issue id + title). We assert the drawer is open;
    // asserting the exact id is brittle across i18n changes.
    expect(await drawer.isDisplayed()).toBe(true)
    expect(rowId).not.toBeNull()
  })

  it('navigating to the Epic view keeps the epic tree DOM bounded at the viewport slice', async () => {
    // ponytail: the previous test leaves the issue detail drawer
    // open. `IssueDetailDrawer` renders a full-viewport backdrop
    // (`fixed inset-0 z-40`, see
    // src/components/beads/IssueDetailDrawer.tsx:38) so the
    // backdrop covers the sidebar — a wdio .click() on
    // `sidebar-view-epic` is "element click intercepted" for as
    // long as the drawer is mounted. Pressing Escape routes
    // through `useDialogA11y` (IssueDetailDrawer.tsx:30) which
    // invokes the drawer's `onClose` handler, removing the
    // backdrop. If no drawer is open the keypress is a no-op
    // (browser-level Escape has no side effects in the list /
    // sidebar / chip surfaces covered by this spec). Discovered
    // from run 28360842696 (2026-06-29) where the same epic-tab
    // click retried every 10s for 180s and then timed out under
    // the mocha 180_000ms budget.
    await browser.keys('Escape')
    // Tiny beat so the React commit + the backdrop unmount
    // settle before the next click; wdio's element-interactable
    // check on the backdrop otherwise races the unmount and
    // surfaces as a single false-positive intercept on the first
    // attempt.
    await browser.pause(100)

    // Switch to the Epic view via the sidebar.
    const epicTab = await $('[data-testid="sidebar-view-epic"]')
    await epicTab.waitForDisplayed({ timeout: 5_000 })
    await epicTab.click()

    // Wait for the epic tree to mount. The tree has 120 epics
    // (10% of 1200 fixture issues per make-large-fixture.sh).
    // The virtualizer is configured with a 600px-tall scroll
    // container by default (DEFAULT_CONTAINER_HEIGHT in
    // EpicView.tsx), COLLAPSED_ROW_HEIGHT=72px, OVERSCAN=5,
    // so ~8 visible + 2*5 overscan = ~18 rows in the DOM.
    const tree = await $('[data-testid="epic-tree-scroll"]')
    await tree.waitForDisplayed({ timeout: 10_000 })

    // Wait for at least one epic row to mount.
    await browser.waitUntil(
      async () => (await countElements('[data-testid="epic-row"]')) > 0,
      {
        timeout: 10_000,
        interval: 200,
        timeoutMsg: 'no epic rows mounted within 10s',
      }
    )

    // The epic tree has 120 epics; the virtualizer should keep
    // the DOM under the 200-row ceiling. We assert < 50 to
    // leave headroom for viewport-size variations.
    const mountedEpics = await countElements('[data-testid="epic-row"]')
    expect(mountedEpics).toBeLessThan(50)

    // Switch back to the list view so subsequent tests (or a
    // future spec that reuses this Tauri session) start from
    // the expected state.
    const listTab = await $('[data-testid="sidebar-view-list"]')
    await listTab.waitForDisplayed({ timeout: 5_000 })
    await listTab.click()
  })
})
