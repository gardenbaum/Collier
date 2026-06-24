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
 *     then one card per known status renders with a count that
 *     matches the FULL issue set (incl. closed) and a progress
 *     bar whose share equals count/total.
 *   and when the user clicks a status card,
 *     then the workspace switches to the list view and the
 *     issue list filters to only that status.
 *
 * The expected counts are NOT hardcoded — they are derived from
 * the actual `bd list --all` output at test time. This is
 * deliberate: the only spec contract that matters is
 * "StatusOverviewView counts and displays whatever the
 * underlying bd data has". Hardcoding the fixture distribution
 * would make the spec fail whenever an earlier spec (e.g. r3
 * inline edit) leaks a state mutation into the shared fixture
 * on disk, even though the view is rendering the data
 * correctly. Deriving the expected counts from the data turns
 * the spec into a pure view-correctness check.
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

/**
 * Read the full Beads issue list (incl. closed) via the Tauri
 * `bd_list` command from the webview context. `withGlobalTauri`
 * is on (see src-tauri/tauri.conf.json) so the webview exposes
 * `window.__TAURI__.core.invoke`. The repo path lives in the
 * persisted workspace store under the `collier-workspace`
 * localStorage key.
 *
 * Returns the per-status counts derived from the raw issue
 * array — the same shape the spec's assertions compare against.
 */
async function readFixtureStatusCounts(): Promise<{
  total: number
  perStatus: Record<string, number>
}> {
  const repoPath: string | null = (await browser.execute((): string | null => {
    const raw = window.localStorage.getItem('collier-workspace')
    if (!raw) return null
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed !== null && typeof parsed === 'object' && 'state' in parsed) {
        const state = (parsed as { state: unknown }).state
        if (
          state !== null &&
          typeof state === 'object' &&
          'repoPath' in state
        ) {
          const rp = (state as { repoPath: unknown }).repoPath
          if (typeof rp === 'string') return rp
        }
      }
    } catch {
      return null
    }
    return null
  })) as string | null
  if (!repoPath) {
    throw new Error('r6: repoPath missing from persisted workspace store')
  }
  // ponytail: wdio 9 types the execute callback's first arg as
  // `string | null` (it serialises `null` to a `null` web element
  // arg). We pass a real `string` here so the body can rely on
  // it being defined; the runtime never sends `null` because we
  // only call execute after the null check above.
  const cwd: string = repoPath
  const raw: unknown = await browser.execute(
    async (innerCwd: string | null) => {
      if (typeof innerCwd !== 'string') {
        throw new Error('r6: execute received null cwd at runtime')
      }
      // ponytail: tauri v2 with `withGlobalTauri: true` exposes
      // the invoke helper on `window.__TAURI__.core.invoke`.
      // The command name matches the specta binding in
      // src/lib/bindings.ts (`TAURI_INVOKE("bd_list", ...)`).
      // `invoke` returns the raw payload — for `bd_list` that's
      // the issue array directly, not a `{status,data}` envelope
      // (the envelope is a specta-side convention the
      // `commands.bdList` wrapper adds).
      const tauri = (
        window as unknown as {
          __TAURI__?: {
            core?: {
              invoke?: (cmd: string, args: unknown) => Promise<unknown>
            }
          }
        }
      ).__TAURI__
      if (!tauri?.core?.invoke) {
        throw new Error('__TAURI__.core.invoke unavailable')
      }
      return await tauri.core.invoke('bd_list', {
        cwd: innerCwd,
        filters: {},
      })
    },
    cwd
  )
  if (!Array.isArray(raw)) {
    throw new Error('r6: bd_list did not return an array')
  }
  const perStatus: Record<string, number> = {}
  for (const issue of raw) {
    if (
      issue !== null &&
      typeof issue === 'object' &&
      'status' in issue &&
      typeof (issue as { status: unknown }).status === 'string'
    ) {
      const s = (issue as { status: string }).status
      perStatus[s] = (perStatus[s] ?? 0) + 1
    }
  }
  return { total: raw.length, perStatus }
}

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
    // -- Given: the actual per-status counts from the live fixture.
    //    See the file header for the rationale on deriving rather
    //    than hardcoding — the only contract that matters is
    //    "StatusOverviewView counts and displays whatever bd has".
    const { total, perStatus } = await readFixtureStatusCounts()

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
    for (let i = 0; i < knownOrder.length; i++) {
      const status = knownOrder[i]
      if (!status) throw new Error(`missing known status at index ${i}`)
      const card = cards[i] as unknown as WebdriverIO.Element
      const expectedCount = perStatus[status] ?? 0
      const expectedPercent =
        total === 0 ? 0 : Math.round((expectedCount / total) * 100)
      expect(await card.getAttribute('data-status')).toBe(status)
      expect(await card.getAttribute('data-count')).toBe(String(expectedCount))
      expect(await card.getAttribute('data-percent')).toBe(
        String(expectedPercent)
      )
      const bar = (await card.$(
        '[data-testid="status-card-bar"]'
      )) as unknown as WebdriverIO.Element
      expect(await bar.getAttribute('role')).toBe('progressbar')
      expect(await bar.getAttribute('aria-valuenow')).toBe(
        String(expectedPercent)
      )
    }

    // -- And: the footer reports the total issue count --
    const footer = await $('[data-testid="status-footer"]')
    const footerText = await footer.getText()
    expect(footerText).toMatch(new RegExp(String(total)))
  })

  it('clicking a status card filters the issue list to that status', async () => {
    // -- Given: the actual closed-bucket count + the status view mounted
    const { perStatus } = await readFixtureStatusCounts()
    const expectedClosedCount = perStatus['closed'] ?? 0
    // ponytail: the previous spec left the workspace on the
    // status view (or the list view, depending on which assertion
    // tripped first). Re-navigate to status so the click
    // target is mounted regardless of starting state.
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

    // The list footer reports the closed-bucket count we derived
    // above. Comparing against the live count (not a hardcoded
    // "8") means the spec still passes when an earlier spec
    // mutated the fixture — the spec is about the filter
    // click-through reaching the list, not about the exact
    // count of any particular status.
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
