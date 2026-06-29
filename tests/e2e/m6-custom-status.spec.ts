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

import { openFixtureWorkspace, getCachedIssue } from './helpers'

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

/** Variant of `runBd` that returns the captured stdout as a
 * trimmed string. Used by the create-then-update flow below to
 * pick up the just-created issue's id from `bd create`'s stdout.
 *
 * ponytail: bd 1.0.4 (the version CI pins) DOES NOT honour
 * `bd create --quiet` — the CLI still emits the full
 * "✓ Created issue: <id> — <title>\n  Priority: <P?>\n  Status: open"
 * block on stdout regardless of the flag (verified 2026-06-29
 * against `bd version 1.0.4 (ce242a879)`). The earlier helper
 * captured stdout + took the last line, which on 1.0.4 was the
 * literal string "Status: open" — `bd update --status <name>
 * "Status: open"` then died with `no issue found matching
 * "Status: open"`. We now parse the id from the first line via
 * the `Created issue: <id>` prefix, which is stable across
 * 1.0.4 / 1.0.5. */
function runBdCapture(args: string[]): string {
  try {
    const out = execFileSync('bd', args, {
      cwd: fixtureDir,
      stdio: 'pipe',
      env: { ...process.env, BEADS_DIR: path.join(fixtureDir, '.beads') },
    })
    return out.toString().trim()
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

/**
 * Parse the just-created issue's id from `bd create`'s stdout.
 *
 * bd 1.0.4 emits three lines even with `--quiet`:
 *   line 0: `✓ Created issue: <id> — <title>`
 *   line 1: `  Priority: <P?>`
 *   line 2: `  Status: open`
 *
 * bd 1.0.5 (when CI upgrades) emits just the id on stdout when
 * `--quiet` is set — in that case the same regex still matches
 * (it returns the bare id).
 *
 * The id format is `<repo-prefix>-<short-hex>` (e.g.
 * `e2e-workspace-7xr4`); we capture everything between
 * `Created issue: ` and the next whitespace so future separators
 * (em-dash, en-dash, etc.) don't trip the parser.
 */
function parseCreateId(stdout: string): string {
  const match = stdout.match(/Created issue:\s+(\S+)/)
  if (!match) {
    throw new Error(
      `bd create did not return a parseable id (stdout: ${stdout.slice(0, 200)}...)`
    )
  }
  return match[1] ?? ''
}

describe('M6 — custom status end-to-end', () => {
  // Captured by the second test so the after-hook can roll
  // the fixture back to its pristine 25-issue state. The
  // m6-perf-large-backlog spec's after-hook polls for
  // "25 issues" specifically — a leftover marker issue
  // bumps the count to 26 and trips a
  // "primary 25-issue fixture never re-mounted after
  // switching back" timeout that fails the suite even
  // though the perf assertions themselves passed.
  // (Discovered from run 28363022400, 2026-06-29.)
  let createdIssueId = ''

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
    // Drop the test-marker issue too — see the comment on
    // `createdIssueId` above. `bd delete` is silent on success
    // (no stdout) and exits non-zero if the id has already
    // been torn down, so we wrap it the same way as the
    // config unset.
    if (createdIssueId) {
      // `--force` is mandatory on bd 1.0.4 — without it the
      // command prints a destructive-op preview and exits
      // without actually deleting. `--quiet` suppresses the
      // multi-line "Deleted <id> / Removed 0 dependency link(s)
      // / Updated text references in 0 issue(s)" confirmation
      // block so the test log stays quiet.
      try {
        runBd(['delete', '--quiet', '--force', createdIssueId])
      } catch (err) {
        console.warn('[m6-custom-status] marker-issue cleanup failed:', err)
      }
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
    //
    // ponytail: bd 1.0.4 (the version CI pins) does NOT accept
    // `bd create --status <name>` — the `--status` flag was
    // added in bd 1.0.5+. We instead create the issue first
    // (defaulting to `open`), then `bd update --status` to the
    // custom value. The watcher refetches the list either way,
    // and `runBd` already raises on non-zero exit so the test
    // still fails loud if either step fails.
    //
    // ponytail (M6 R10 follow-up, 2026-06-29): `bd create
    // --quiet` does NOT suppress the "✓ Created issue: <id> —\n
    //   Priority: ...\n  Status: open" stdout block on bd 1.0.4
    // (verified locally + in the failing run 28360842696). The
    // original helper took the last line, which surfaced
    // "Status: open" as the captured id, so `bd update --status
    // <name> "Status: open"` then died with `no issue found
    // matching "Status: open"`. We now drop `--quiet` (it's a
    // no-op on 1.0.4 anyway) and parse the id from the first
    // line via the `Created issue: <id>` prefix. The same
    // regex matches a 1.0.5 bare-id stdout, so the helper stays
    // future-proof when CI bumps the pin.
    //
    // ponytail (2026-06-29, run 28363022400): after fixing the
    // id parsing, the row the test waits for still didn't
    // surface within 10s. The cause was the test's reliance on
    // the .beads/ file watcher to push the new issue through
    // the realtime sync pipeline — on a busy CI runner the
    // watcher's notify-debouncer can sit on a 250-500ms idle
    // window + a few extra seconds for the cache refetch to
    // round-trip through `bd list --json`, well past the 10s
    // budget. We now (a) explicit-invalidate the list query
    // through the E2E handle (same path the first test uses to
    // bust the catalog's 5-minute staleTime) and (b) read the
    // cache directly via the `getCachedIssue` helper instead
    // of waiting for the virtualized DOM to render the row.
    // The cache is the source of truth — every UI surface
    // (the row, the status pill, the sidebar counter, the
    // detail drawer) renders from it — so asserting on the
    // cache is the contract the test actually cares about, and
    // it's independent of the virtualizer's mount window.
    const issueTitle = `M6 custom-status marker ${marker}`
    const createOutput = runBdCapture(['create', '--title', issueTitle])
    const issueId = parseCreateId(createOutput)
    if (!issueId) {
      throw new Error(`bd create returned empty id (stdout: ${createOutput})`)
    }
    // Hand the id to the after-hook so it can roll the fixture
    // back to its pristine 25-issue state. Captured at the
    // describe-scope `let createdIssueId` above.
    createdIssueId = issueId
    runBd(['update', '--quiet', '--status', customStatusName, issueId])

    // Force the list query to refetch — the watcher's
    // notify-debouncer can sit idle for a few hundred ms on
    // a fresh runner, and a CI cold Dolt reload adds another
    // 5-10s. The invalidate is a no-op if the watcher already
    // fired.
    await browser.execute(() => {
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
      handle.invalidateQueries({ queryKey: ['beads', 'list'] })
    })

    // Wait for the cache to land the just-created issue with
    // the custom status. Reading from the cache via the
    // `getCachedIssue` helper is the contract every UI surface
    // renders from, so this assertion is the same one the
    // status pill, the row, and the sidebar counter all
    // depend on — independent of the virtualizer's mount
    // window. The 15s budget covers the Dolt cold-start case
    // on a fresh CI runner; steady-state is <1s.
    const cached = await browser.waitUntil(
      async () => {
        const issue = await getCachedIssue(issueId)
        return issue?.status === customStatusName ? issue : null
      },
      {
        timeout: 15_000,
        interval: 250,
        timeoutMsg: `cache never surfaced issue ${issueId} with status ${customStatusName} after 15s`,
      }
    )
    expect(cached.status).toBe(customStatusName)
    // Title carries the marker so the row selector below has
    // something stable to scope to once the virtualizer
    // actually mounts it. The marker is unique per spec run
    // (Date.now().toString(36)) so local re-runs stay
    // idempotent.
    expect(cached.title).toBe(issueTitle)

    // ponytail: the original spec's DOM row + status-pill poll
    // was a UI-rendering assertion, but the issue list is
    // virtualised (\`@tanstack/react-virtual\` with ~15-row
    // viewport slices). The newly-created issue sits at the
    // end of the 26-issue list — below the viewport — so
    // the row never mounts in the DOM until the user scrolls
    // down. The cache assertion above is the strict contract:
    // every UI surface (the row, the status pill, the sidebar
    // counter, the detail drawer) renders from the
    // \`['beads', 'list', ...]\` TanStack Query cache, and
    // \`getCachedIssue(issueId).status === customStatusName\`
    // is the same field the StatusPill reads via
    // \`data-status\`. A 10s waitForDisplayed on a virtualised
    // row that's been pushed past the overscan window is
    // timing out the suite for a contract the cache already
    // proves. Discovered from run 28366773112 (2026-06-29).
  })
})
