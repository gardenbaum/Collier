/// <reference types="mocha" />
/// <reference types="webdriverio" />
/**
 * M4 spec R10 E2E — targeted per-issue real-time sync.
 *
 * Given the fixture workspace from scripts/make-fixture.sh (25
 * Beads issues spanning all 5 statuses),
 *
 *   when an external `bd update <id> --status=<alt>` lands on
 *   the fixture,
 *     then the matching entry in the TanStack Query list cache
 *     reflects the new value within ~1 s, **without** any user
 *     interaction (no manual refresh, no click, no focus).
 *
 * R10's value proposition is that the Rust watcher diffs the
 * JSONL and emits per-issue events (`beads-issue-updated`),
 * which the React side uses to patch the matching TanStack
 * Query cache entry in-place via `setQueryData`. The E2E
 * test exercises the whole path end-to-end: an external `bd`
 * process writes to `.beads/issues.jsonl`, the watcher detects
 * the change within ~250 ms (debounce), the React side patches
 * the list cache.
 *
 * Why we read the cache, not the DOM:
 *   `IssueListView` is virtualized with `@tanstack/react-virtual`
 *   (10-row viewport + 5-row overscan on each side). The DOM
 *   only ever mounts ~15-20 of the 25 fixture rows; the rest
 *   are virtualized away. Polling `data-issue-status` for a row
 *   the virtualizer has unmounted races with the test's
 *   `waitUntil` loop and times out at 1500 ms even when the
 *   watcher already patched the cache. The TanStack Query
 *   cache, by contrast, holds every issue regardless of what's
 *   mounted, and `beads-issue-updated` patches it
 *   synchronously on the watcher event. `getCachedIssue`
 *   (`tests/e2e/helpers.ts`) reads it via the page-context
 *   `queryClient` handle exposed by `src/main.tsx` under the
 *   build-time `VITE_E2E` flag. The fixture still asserts the
 *   full 25-issue list has loaded (via the footer) so the
 *   "precondition" contract is unchanged.
 *
 * The M3 spec established the "wait for full fixture before
 * sampling" pattern — we follow it here so the row we pick
 * is actually mounted before we mutate it.
 *
 * Runs in CI under Xvfb (see .github/workflows/ci.yml). Local
 * execution requires `tauri-driver` + a built Collier binary --
 * not part of `bun run check:all`; E2E is its own CI job.
 *
 * The "open the fixture workspace" step is shared via
 * `tests/e2e/helpers.ts` -- see that file for the isolation
 * rationale. The cleanup (`after`) reverts the row's status
 * via `bd update <id> --status=<original>` so subsequent specs
 * see the original fixture distribution. Note this is the
 * ONLY spec that mutates the fixture via `bd update` from the
 * test process; the other specs that mutate do it through
 * the UI (r3, r8) or via direct JSONL edits (which is not
 * allowed per the constitution's "never write `.beads/` files
 * directly" rule).
 */
import { browser, expect, $, $$ } from '@wdio/globals'
import { readFileSync } from 'node:fs'

import { getCachedIssue, openFixtureWorkspace } from './helpers'

const FIXTURE_IDS_PATH = '/tmp/e2e-workspace/.fixture-ids.json'

type FixtureIds = Record<string, string>

describe('Collier M4 R10 targeted real-time sync', () => {
  // ponytail: every external `bd update` mutates the shared
  // /tmp/e2e-workspace fixture. Capture the row ID + original
  // status so the `after` hook can revert it before the next
  // spec (r3, r6, etc.) reads the fixture. Without this,
  // subsequent specs would see leaked mutations.
  let mutatedRowId = ''
  let originalStatus = ''
  // TASK_MIGRATE is `open` in the fixture by default and is
  // referenced by role (not hash-derived ID) so the test stays
  // robust to `bd init`'s non-deterministic ID generation.
  // Falls back to the first rendered row's ID if the fixture
  // file is missing or TASK_MIGRATE isn't there.
  const TASK_MIGRATE_ROLE = 'TASK_MIGRATE'

  before(async () => {
    await openFixtureWorkspace('r10')

    // Wait for the full 25-issue fixture (same contract as
    // r3, r6, r9). Partial renders would short-circuit the
    // row-selection step below.
    await browser.waitUntil(
      async () => {
        const footer = await $('[data-testid="list-footer"]')
        const text = await footer.getText()
        return text.includes('25 issues')
      },
      {
        timeout: 30_000,
        interval: 500,
        timeoutMsg: 'full primary fixture never loaded',
      }
    )
  })

  after(async () => {
    // ponytail: revert via `bd update` (the same surface the
    // spec exercises — we deliberately do NOT shell out to a
    // direct JSONL edit because the constitution forbids it).
    // If the mutation never landed, there's nothing to revert.
    if (mutatedRowId === '') return
    if (originalStatus === '') return

    // Run `bd update` from the test process via node's child
    // process API. The wdio worker process IS a node process,
    // so we can use Node's stdlib directly without pulling in
    // a shell out.
    const { execFileSync } = await import('node:child_process')
    execFileSync(
      'bd',
      ['update', '--quiet', `--status=${originalStatus}`, mutatedRowId],
      { cwd: '/tmp/e2e-workspace', stdio: 'pipe' }
    )
    // Wait for the watcher tick to reconcile so the next spec
    // sees the original status in the cache (a background
    // mutation while r3's first waitUntil runs would race
    // against r3's row-selector query). Read the cache, not
    // the DOM — the virtualizer may have unmounted the row
    // mid-revert (see the top-of-file comment for why).
    await browser.waitUntil(
      async () => {
        const cached = await getCachedIssue(mutatedRowId)
        return cached?.status === originalStatus
      },
      {
        timeout: 5_000,
        interval: 250,
        timeoutMsg: 'revert did not land before next spec',
      }
    )
  })

  it('a row reflects an external bd update within ~1s (no manual refresh)', async () => {
    // -- Given: pick a known ID from the fixture's
    //    .fixture-ids.json. TASK_MIGRATE is `open` by default
    //    in the fixture, which makes the new value (e.g.
    //    `closed`) easy to assert against.
    let targetId: string
    try {
      const ids = JSON.parse(
        readFileSync(FIXTURE_IDS_PATH, 'utf8')
      ) as FixtureIds
      if (typeof ids[TASK_MIGRATE_ROLE] !== 'string') {
        throw new Error(
          `role ${TASK_MIGRATE_ROLE} missing from ${FIXTURE_IDS_PATH}`
        )
      }
      targetId = ids[TASK_MIGRATE_ROLE]
    } catch {
      // Fallback: use the first rendered row's ID. The test
      // still works (we mutate + revert whatever we find),
      // it's just that the "known role" assertion is lost.
      const rows = await $$('[data-testid="issue-row"]')
      expect(rows.length).toBeGreaterThan(0)
      targetId =
        (await (rows[0] as unknown as WebdriverIO.Element).getAttribute(
          'data-issue-id'
        )) ?? ''
      expect(targetId).toBeTruthy()
    }

    // -- And: the target row is in the cache so we can read
    //    its current status. Read from the cache (not the
    //    DOM) so the test is robust against the virtualizer
    //    unmounting the row.
    const initial = await getCachedIssue(targetId)
    expect(initial).not.toBeNull()
    originalStatus = String(initial?.status ?? '')
    mutatedRowId = targetId
    expect(originalStatus).toBeTruthy()

    // Pick an alternative status (not the current one) so we
    // can verify the change. The IssueStatus enum is the
    // same five values r3 cycles through.
    const allStatuses = ['open', 'in_progress', 'blocked', 'deferred', 'closed']
    const newStatus =
      allStatuses.find(s => s !== originalStatus) ?? 'in_progress'
    expect(newStatus).not.toBe(originalStatus)

    // -- When: an external `bd update` mutates the fixture.
    //    We shell out from the wdio worker process via Node's
    //    child_process (already on stdlib, no extra deps). The
    //    `cwd` is the fixture directory because bd is repo-
    //    scoped — running from a different cwd would either
    //    fail or land on a different repo.
    const { execFileSync } = await import('node:child_process')
    const startedAt = Date.now()
    execFileSync(
      'bd',
      ['update', '--quiet', `--status=${newStatus}`, targetId],
      { cwd: '/tmp/e2e-workspace', stdio: 'pipe' }
    )

    // -- Then: the cache entry for this row reflects
    //    `newStatus` within ~1 s of the bd write. The
    //    1500 ms upper bound leaves headroom for the watcher's
    //    250 ms debounce + the React commit under CI
    //    cold-start. Reading the cache (via
    //    `getCachedIssue`) bypasses the DOM and the
    //    virtualizer's windowed-render race that previously
    //    timed this spec out at 1500 ms with the row
    //    unmounted — see the top-of-file comment for details.
    await browser.waitUntil(
      async () => {
        const cached = await getCachedIssue(targetId)
        return cached?.status === newStatus
      },
      {
        timeout: 1_500,
        interval: 100,
        timeoutMsg: `row ${targetId} status never reflected external bd update within 1500ms`,
      }
    )
    const elapsedMs = Date.now() - startedAt
    console.log(
      `[e2e:r10] external bd update reflected in ${elapsedMs}ms (target <= 1500ms)`
    )
  })

  it('a row reflects an external bd priority change within ~1s', async () => {
    // -- Given: reuse the row mutated by the previous test
    //    (whose revert in `after` is gated on the next spec).
    //    The `mutatedRowId` is still set from the previous
    //    test because wdio runs `it` blocks in serial order
    //    within a `describe`.
    expect(mutatedRowId).toBeTruthy()
    const initial = await getCachedIssue(mutatedRowId)
    expect(initial).not.toBeNull()
    const originalPriority = String(initial?.priority ?? '')
    expect(originalPriority).toBeTruthy()

    // IssuePriority serialises as a bare integer 0..4 via
    // `#[repr(u8)] Serialize_repr`, so the data attribute and
    // the bd --priority value are the integers, not "P0".. "P4".
    const allPriorities = ['0', '1', '2', '3', '4']
    const newPriority = allPriorities.find(p => p !== originalPriority) ?? '0'

    // -- When: external `bd update` mutates the priority.
    const { execFileSync } = await import('node:child_process')
    execFileSync(
      'bd',
      ['update', '--quiet', `--priority=${newPriority}`, mutatedRowId],
      { cwd: '/tmp/e2e-workspace', stdio: 'pipe' }
    )

    // -- Then: the cache entry for this row flips to
    //    `newPriority` within ~1 s. Same 1500 ms ceiling as
    //    the status test. Read the cache — see the top-of-file
    //    comment for why DOM-attribute waits race the
    //    virtualizer.
    await browser.waitUntil(
      async () => {
        const cached = await getCachedIssue(mutatedRowId)
        return cached?.priority === newPriority
      },
      {
        timeout: 1_500,
        interval: 100,
        timeoutMsg: `row ${mutatedRowId} priority never reflected external bd update within 1500ms`,
      }
    )
  })
})
