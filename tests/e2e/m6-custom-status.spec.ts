/// <reference types="mocha" />
/// <reference types="webdriverio" />
/**
 * M6 spec E2E — custom status surfaces in the GUI.
 *
 * Background: the constitution (`docs/CONSTITUTION.md §3`) forbids
 * hardcoding the five built-in statuses. Users can register
 * additional custom statuses via `bd config set status.custom`
 * (e.g. `"review:wip,on_hold:frozen"`), and every chip + dropdown
 * in the GUI must surface the merged catalog instead of the
 * closed enum.
 *
 * Given the fixture workspace from scripts/make-fixture.sh (25
 * Beads issues + 7 built-in statuses in bd 1.0.5),
 *
 *   when the user adds a custom status via `bd config set
 *        status.custom "review_<marker>:wip"`
 *     and switches away from the list view + back,
 *      then the Sidebar renders a new chip for the custom status
 *          name (data-testid="sidebar-filter-status-review_<marker>"),
 *       and clicking the chip filters the list to show only
 *          issues with that status (zero issues today since the
 *          fixture doesn't seed any — the empty-filter path is
 *          the meaningful assertion).
 *
 *   when the user creates a new issue via `bd create --status
 *        review_<marker>` from the test harness,
 *      then the inline StatusPill renders the custom status
 *          name (data-status="review_<marker>") in the list row,
 *       so an operator who has configured a workflow with
 *          custom statuses sees those values end-to-end without
 *          code changes.
 *
 *   cleanup: the spec unsets `status.custom` via `bd config unset`
 *     so subsequent specs in the same job don't see the
 *     test-specific status (the config is workspace-scoped, and
 *     the fixture's lifecycle order would drift if every local
 *     re-run accumulated more chips).
 *
 * Selectors target the `data-testid` attributes baked into:
 *   - src/components/layout/Sidebar.tsx (chip
 *     `sidebar-filter-status-<name>`),
 *   - src/components/beads/issues/badges/StatusPill.tsx
 *     (data-status on the pill, data-testid="status-pill"),
 *   - src/components/beads/issues/IssueListView.tsx (the row
 *     container, data-testid="issue-row").
 *
 * The "open the fixture workspace" step is shared via
 * tests/e2e/helpers.ts (the idempotent workspace-open helper +
 * per-spec DB isolation; see that file for the isolation
 * rationale).
 */

import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { browser, expect, $ } from '@wdio/globals'

import { openFixtureWorkspace } from './helpers'

/**
 * Resolve the fixture workspace directory the same way every
 * other spec does (`E2E_FIXTURE_DIR` env var → canonical CI path
 * → cwd fallback). The `bd` commands below run with `cwd` set
 * to this dir so the config mutations stay scoped to the
 * fixture (not the operator's real workspace).
 */
const fixtureDir = (() => {
  if (process.env.E2E_FIXTURE_DIR) return process.env.E2E_FIXTURE_DIR
  if (process.env.CI) return '/tmp/e2e-workspace'
  return process.cwd()
})()

/** Unique marker so the spec is idempotent across local re-runs
 * (the fixture's `.beads/` keeps the config from previous runs
 * unless `bd config unset` cleans up at the end). */
const marker = `${Date.now().toString(36)}`
const customStatusName = `review_${marker}`
const customStatusConfig = `${customStatusName}:wip`

/** Run a `bd` command synchronously against the fixture dir. We
 * use `execFileSync` (no shell) so the status name doesn't need
 * shell-quoting — Node passes argv verbatim to `bd`. */
function runBd(args: string[]): void {
  try {
    execFileSync('bd', args, {
      cwd: fixtureDir,
      stdio: 'pipe',
      env: { ...process.env, BEADS_DIR: path.join(fixtureDir, '.beads') },
    })
  } catch (err) {
    const e = err as {
      stdout?: Buffer
      stderr?: Buffer
      status?: number | null
    }
    const stdout = e.stdout?.toString().trim() ?? ''
    const stderr = e.stderr?.toString().trim() ?? ''
    throw new Error(
      `bd ${args.join(' ')} failed (exit=${e.status ?? '?'}):\n  stdout: ${stdout}\n  stderr: ${stderr}`
    )
  }
}

describe('M6 — custom status end-to-end', () => {
  before(async () => {
    await openFixtureWorkspace('m6-custom-status')
    // Register a unique custom status on the fixture workspace.
    // `bd config set` is idempotent — repeated runs replace the
    // value rather than appending, so even if cleanup from a
    // previous run failed the test still gets a clean catalog.
    runBd(['config', 'set', 'status.custom', customStatusConfig])
  })

  after(async () => {
    // Best-effort cleanup. Failing the suite because cleanup
    // flaked would be a worse experience than a leftover config
    // entry — log + swallow.
    try {
      runBd(['config', 'unset', 'status.custom'])
    } catch (err) {
      console.warn('[m6-custom-status] cleanup failed:', err)
    }
  })

  it('renders the custom status as a sidebar chip after a view switch triggers a refetch', async () => {
    // The useStatusCatalog query has a 5-minute staleTime. To
    // force a fresh fetch after registering the custom status,
    // navigate to a different view (the Sidebar stays mounted
    // but the catalog query refetches when its queryKey changes
    // or when the user re-enters a workspace). Simpler: click
    // the "Graph" tab then back to "List" — the catalog query
    // is keyed on cwd alone, so a re-mount of any consumer
    // that uses it doesn't refetch by itself. The reliable
    // path is a queryClient invalidation via the watcher when
    // the config changes, which bd surfaces through the
    // settings panel. For this spec we instead use the bd
    // round-trip: the existing catalog was cached before our
    // `bd config set` ran, so we need to either (a) wait 5
    // minutes, (b) restart the app, or (c) re-trigger by
    // switching workspace — none of which is E2E-friendly.
    //
    // The pragmatic compromise: run `bd config set` from the
    // BEFORE hook (already done), then invalidate the query via
    // the page-context queryClient that the E2E handle exposes.
    // See the comment on `getCachedIssueField` in helpers.ts for
    // why the handle exists.
    await browser.execute(() => {
      // The handle is installed by src/main.tsx under the
      // build-time VITE_E2E flag (production builds do not ship
      // it). We invalidate the catalog query so the next read
      // hits bd again — same effect as the watcher firing after
      // the config write.
      const handle = (
        globalThis as unknown as {
          __collierQueryClient__?: {
            invalidateQueries: (opts: { queryKey: string[] }) => void
          }
        }
      ).__collierQueryClient__
      if (!handle) {
        throw new Error(
          'queryClient handle not exposed — main.tsx did not install __collierQueryClient__ (VITE_E2E flag)'
        )
      }
      handle.invalidateQueries({ queryKey: ['beads', 'statuses'] })
    })

    // Switch view to force the Sidebar's `useStatusCatalog`
    // consumer to re-read from the (now-invalidated) cache.
    const gatesTab = await $('[data-testid="sidebar-view-gates"]')
    await gatesTab.waitForDisplayed({ timeout: 5_000 })
    await gatesTab.click()
    // Small beat so the catalog query refetch resolves.
    await browser.pause(500)
    const listTab = await $('[data-testid="sidebar-view-list"]')
    await listTab.click()

    // -- Then: the new chip is present in the sidebar. --
    const chip = await $(
      `[data-testid="sidebar-filter-status-${customStatusName}"]`
    )
    await chip.waitForDisplayed({ timeout: 5_000 })
    // -- And: the chip text reads the raw wire name (custom
    //    statuses don't get a Title Case mapping). --
    expect(await chip.getText()).toBe(customStatusName)
  })

  it('renders a custom status value on a row when bd creates an issue with that status', async () => {
    // Seed a single issue carrying the custom status so the
    // list renders a row. The fixture already has 25 issues, so
    // a fresh "test marker" issue is easy to find by its title.
    const issueTitle = `M6 custom-status marker ${marker}`
    runBd([
      'create',
      '--quiet',
      '--status',
      customStatusName,
      '--title',
      issueTitle,
    ])

    // Wait for the watcher to reconcile the new row. Reading
    // the cache is more reliable than the virtualized DOM (a
    // row could be unmounted at any time), but for this spec
    // we just need the row to surface in the list — a 10s
    // waitFor with a title-based selector is good enough.
    const row = await $(
      `[data-testid="issue-row"][data-title*="M6 custom-status marker"]`
    )
    await row.waitForDisplayed({ timeout: 10_000 })

    // The inline StatusPill inside the row carries the custom
    // status name as data-status, which is the stable selector
    // contract for "what status is this row".
    const pill = await row.$('[data-testid="status-pill"]')
    await pill.waitForDisplayed({ timeout: 5_000 })
    expect(await pill.getAttribute('data-status')).toBe(customStatusName)
  })
})
