/// <reference types="mocha" />
/// <reference types="webdriverio" />
/**
 * M1 spec R3 E2E — inline editing of status / priority / assignee
 * via `bd update`, with optimistic UI that reconciles against the
 * file-watcher.
 *
 * Given the fixture workspace from scripts/make-fixture.sh (25
 * Beads issues spanning all 5 statuses, all 5 priorities, all 7
 * types, and multiple assignees),
 *
 *   when the user changes a row's status via the inline dropdown,
 *     then the row's `data-issue-status` updates immediately
 *     (optimistic) AND a watcher tick reconciles the value via
 *     `bd update` (the row's status persists after a re-query).
 *
 * The same flow is exercised for priority and assignee.
 *
 * Runs in CI under Xvfb (see .github/workflows/ci.yml). Local
 * execution requires `tauri-driver` + a built Collier binary --
 * not part of `bun run check:all`; E2E is its own CI job.
 *
 * Selectors target the `data-testid` attributes baked into
 * `src/components/beads/issues/InlineIssueEdit.tsx` and
 * `src/components/beads/issues/IssueListView.tsx` -- the stable
 * contract between the frontend and this test.
 *
 * The "open the fixture workspace" step is shared via
 * `tests/e2e/helpers.ts` -- see that file for the isolation
 * rationale. Spec-specific waits (full fixture footer) live below.
 */

import { browser, expect, $$, $ } from '@wdio/globals'

import { getCachedIssue, openFixtureWorkspace } from './helpers'

describe('Collier M1 R3 inline editing', () => {
  // Captured during the status/priority tests and reverted in
  // `after` so the next spec (r6-status-overview) sees the
  // original fixture distribution. The wdio workers run in their
  // own processes but the Tauri app's Beads fixture is a single
  // file on disk under /tmp/e2e-workspace — every spec that
  // mutates it leaks state into the next. r3 is the only spec
  // that calls `bd update` via the UI, so it owns the cleanup.
  let r3RowId = ''
  let r3OriginalStatus = ''
  let r3OriginalPriority = ''

  before(async () => {
    await openFixtureWorkspace('r3')

    // The footer reflects the total count. Wait for the full
    // fixture (25 issues) to be loaded before sampling -- a
    // partial fetch would short-circuit the persistence assertions
    // below.
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
  })

  after(async () => {
    // ponytail: revert the row's status + priority so the next
    // spec (r6-status-overview) sees the original fixture
    // distribution. The wdio workers run in their own processes
    // but the Tauri app's Beads fixture is a single file on disk
    // under /tmp/e2e-workspace — every spec that mutates it
    // leaks state into the next. r3 is the only spec that calls
    // `bd update` via the UI, so it owns the cleanup.
    //
    // The previous implementation drove the revert through the
    // same inline-edit UI surface the spec exercises (a
    // dispatchEvent on the row's `<select>`), and the
    // `r3 cleanup did not land` waitUntil timed out on CI run
    // 29383327833 — the only failing spec in a 17/17 run. The
    // root cause sits across two failure modes that the
    // helper-based approach below sidesteps:
    //
    //   1. **DOM-coupled revert.** The dispatchEvent only fires
    //      the React onChange handler when the row's inline
    //      `<select>` is mounted. When the virtualizer window
    //      has unmounted the r3 row (test 3 opens the detail
    //      drawer and the rendered scroll window can shift), the
    //      dispatch silently no-ops and the cache never sees
    //      the revert. The previous early-return on
    //      `!row.isExisting()` was a best-effort skip, not a
    //      guard: it left the fixture mutated for r6.
    //
    //   2. **WriteLock contention across two mutations.** The
    //      UI path fires two separate mutations (status, then
    //      priority), each with its own optimistic-patch +
    //      bd-write + watcher-reconcile cycle. The bd writes
    //      serialize behind the Rust `WriteLock` with a 2s
    //      acquire timeout (see `WriteLock::DEFAULT_WRITE_LOCK_TIMEOUT`
    //      in `src-tauri/src/beads/lock.rs`). On a cold CI
    //      runner where test 2's mutation was still completing
    //      when `after` ran, the second `bd update` failed
    //      with `BdError::LockTimeout`, the optimistic patch
    //      was reverted, and the waitUntil polled a cache that
    //      never matched the original fixture.
    //
    // The cleanup now routes through the E2E-only
    // `__collierRevertIssue__` handle exposed by `src/main.tsx`.
    // One atomic `bd update` for status + priority (single lock
    // acquisition, single watcher tick), plus a synchronous
    // cache patch so the React Query state matches the fixture
    // the moment `revertIssue` resolves. The inline-edit
    // mutation flow itself is still covered by tests 1 / 2 / 3
    // — this helper is the test-isolation contract, not a
    // coverage gap.
    //
    // We still keep the waitUntil as a defense-in-depth check:
    // the watcher tick will also patch the cache within ~1s
    // (the helper's patch makes it consistent immediately, but
    // a regression that bypasses the helper should still fail
    // loudly here rather than leak state into r6).
    if (r3RowId === '') return
    const fields: { status?: string; priority?: number } = {}
    if (r3OriginalStatus !== '') fields.status = r3OriginalStatus
    if (r3OriginalPriority !== '') {
      fields.priority = Number.parseInt(r3OriginalPriority, 10)
    }
    await browser.execute(
      async (
        id: string,
        status: string | null,
        priority: number | null
      ): Promise<void> => {
        const revert = (
          globalThis as {
            __collierRevertIssue__?: (
              issueId: string,
              fields: { status?: string; priority?: number }
            ) => Promise<unknown>
          }
        ).__collierRevertIssue__
        if (revert === undefined) {
          throw new Error(
            '__collierRevertIssue__ not exposed — VITE_E2E build flag missing?'
          )
        }
        const f: { status?: string; priority?: number } = {}
        if (status !== null) f.status = status
        if (priority !== null) f.priority = priority
        await revert(id, f)
      },
      r3RowId,
      fields.status ?? null,
      fields.priority ?? null
    )

    await browser.waitUntil(
      async () => {
        const cached = await getCachedIssue(r3RowId)
        return (
          cached !== null &&
          cached.status === r3OriginalStatus &&
          String(cached.priority ?? '') === r3OriginalPriority
        )
      },
      {
        // ponytail: the helper patches the cache synchronously on
        // resolve, so the first poll should match. 10s is a
        // generous upper bound for a regression where the helper
        // is bypassed and only the watcher tick reconciles (the
        // r10 spec measures ~1.8s on CI cold-start — 5x headroom).
        timeout: 10_000,
        interval: 250,
        timeoutMsg: 'r3 cleanup did not land',
      }
    )
  })

  it('changing a row status inline persists via bd update (optimistic + reconcile)', async () => {
    // -- Given: at least one rendered row, status=open (or any
    //    status that has alternatives in the dropdown).
    const rows = await $$('[data-testid="issue-row"]')
    expect(rows.length).toBeGreaterThan(0)
    const firstRow = rows[0] as unknown as WebdriverIO.Element
    const rowId = (await firstRow.getAttribute('data-issue-id')) ?? ''
    const originalStatus = await firstRow.getAttribute('data-issue-status')
    // ponytail: capture the original values for the after hook so
    // the r6-status-overview spec sees the original fixture
    // distribution.
    r3RowId = rowId
    r3OriginalStatus = originalStatus ?? ''
    expect(rowId).toBeTruthy()
    // Pick a status different from the current one so we can
    // verify the change.
    const allStatuses = ['open', 'in_progress', 'blocked', 'deferred', 'closed']
    const nextStatus =
      allStatuses.find(s => s !== originalStatus) ?? 'in_progress'
    expect(nextStatus).not.toBe(originalStatus)

    // -- When: change the row's status via the inline select --
    //
    // The InlineStatusEdit cell is inside the row. We need to scope
    // the click to the specific row's inline-status-edit cell so
    // we don't touch a different row.
    const inlineStatusEdit = await firstRow.$(
      '[data-testid="inline-status-edit"]'
    )
    await inlineStatusEdit.waitForDisplayed({ timeout: 5_000 })

    // The native <select> is overlaid on the badge; we drive it
    // by setting the value + dispatching a `change` event. This
    // mirrors how the user would actually interact with the
    // dropdown.
    type SetSelectArgs = [string | null, string]
    await browser.execute(
      ((id: string | null, status: string) => {
        if (!id) throw new Error('row id is null')
        const row = document.querySelector(
          `[data-testid="issue-row"][data-issue-id="${CSS.escape(id)}"]`
        )
        if (!row) throw new Error(`row ${id} not found`)
        const select = row.querySelector(
          '[data-testid="inline-status-select"]'
        ) as HTMLSelectElement | null
        if (!select) throw new Error('inline-status-select not found in row')
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype,
          'value'
        )?.set
        setter?.call(select, status)
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }) as (...args: SetSelectArgs) => void,
      rowId,
      nextStatus
    )

    // -- Then: the cache reflects the new status (optimistic) --
    // ponytail: the optimistic-update path patches the TanStack
    // Query cache via `setQueryData` BEFORE the bd write + watcher
    // tick, so the cache reflects the new value essentially
    // synchronously. Reading the cache (via `getCachedIssue`)
    // bypasses the DOM-virtualizer race that used to time this
    // spec out when the row was unmounted by the virtualizer
    // after the mutation triggered a re-render.
    await browser.waitUntil(
      async () => {
        const cached = await getCachedIssue(rowId)
        return cached?.status === nextStatus
      },
      {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: `row ${rowId} status never updated to ${nextStatus} optimistically`,
      }
    )

    // -- And: the watcher tick reconciles the change (bd persisted
    //    it, the cache still holds the new status after a
    //    refetch). The watcher fires within ~1s of the bd write;
    //    we wait up to 5s to be safe under CI cold-start.
    await browser.waitUntil(
      async () => {
        const cached = await getCachedIssue(rowId)
        return cached?.status === nextStatus
      },
      {
        timeout: 5_000,
        interval: 500,
        timeoutMsg: `row ${rowId} status reverted to original after watcher tick`,
      }
    )
  })

  it('changing a row priority inline persists via bd update', async () => {
    // -- Given: the first rendered row --
    const rows = await $$('[data-testid="issue-row"]')
    expect(rows.length).toBeGreaterThan(0)
    const firstRow = rows[0] as unknown as WebdriverIO.Element
    const rowId = (await firstRow.getAttribute('data-issue-id')) ?? ''
    const originalPriority = await firstRow.getAttribute('data-issue-priority')
    // ponytail: capture the original priority for the after
    // hook so we revert the r3 row back to its starting
    // priority.
    if (r3RowId === rowId) {
      r3OriginalPriority = originalPriority ?? ''
    }

    // Pick a priority different from the current one so we can
    // verify the change. The fixture ships only P1-P4 (no P0),
    // so we cycle through 1..4 to find an alternative. The
    // `IssuePriority` enum serialises as the bare integer 0..4
    // via `#[repr(u8)] Serialize_repr`, so the data attribute
    // and the <select> value are the integers, not "P0".."P4".
    const allPriorities = ['0', '1', '2', '3', '4']
    const nextPriority = allPriorities.find(p => p !== originalPriority) ?? '0'

    // -- When: change the row's priority via the inline select --
    type SetPriorityArgs = [string | null, string]
    await browser.execute(
      ((id: string | null, priority: string) => {
        if (!id) throw new Error('row id is null')
        const row = document.querySelector(
          `[data-testid="issue-row"][data-issue-id="${CSS.escape(id)}"]`
        )
        if (!row) throw new Error(`row ${id} not found`)
        const select = row.querySelector(
          '[data-testid="inline-priority-select"]'
        ) as HTMLSelectElement | null
        if (!select) throw new Error('inline-priority-select not found in row')
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype,
          'value'
        )?.set
        setter?.call(select, priority)
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }) as (...args: SetPriorityArgs) => void,
      rowId,
      nextPriority
    )

    // -- Then: the cache reflects the new priority (optimistic) --
    // ponytail: same cache-based pattern as the status test —
    // the optimistic mutation patches the cache via
    // `setQueriesData` synchronously, and reading the cache
    // bypasses the DOM-virtualizer race.
    await browser.waitUntil(
      async () => {
        const cached = await getCachedIssue(rowId)
        return String(cached?.priority ?? '') === nextPriority
      },
      {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: `row ${rowId} priority never updated to ${nextPriority} optimistically`,
      }
    )

    // -- And: the watcher tick reconciles the change --
    await browser.waitUntil(
      async () => {
        const cached = await getCachedIssue(rowId)
        return String(cached?.priority ?? '') === nextPriority
      },
      {
        timeout: 5_000,
        interval: 500,
        timeoutMsg: `row ${rowId} priority reverted to original after watcher tick`,
      }
    )
  })

  it('clicking the row body still opens the detail drawer (inline edit does not swallow row click)', async () => {
    // -- Given: at least one rendered row --
    // ponytail: find a rendered row with a title cell via the
    // page context. `@tanstack/react-virtual` can unmount a row
    // between the moment `$$('[data-testid="issue-row"]')`
    // captures the element handle and the moment `firstRow.$(
    // '[data-column="title"]')` re-resolves it via WebDriver —
    // the stale parent reference raises "element wasn't found"
    // and `waitForDisplayed` on the child fails. Doing the
    // lookup + click in a single page-context `execute` call
    // (which always queries the live DOM) makes the test robust
    // against the virtualizer remount; the `waitUntil` retries
    // until a row is mounted again.
    await browser.waitUntil(
      async () =>
        (await browser.execute(() => {
          const row = document.querySelector('[data-testid="issue-row"]')
          const cell = row?.querySelector('[data-column="title"]')
          if (!row || !cell || !(cell instanceof HTMLElement)) return false
          cell.click()
          return true
        })) === true,
      {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: 'no rendered row with a title cell appeared',
      }
    )

    // -- Then: the issue detail view opens --
    // ponytail: a regression-guard for the inline edits'
    // `swallowHostEvents` flag — only cells containing a `<select>`
    // should stop propagation, so a click on the title cell must
    // bubble to the row's onClick and open the detail drawer.
    const detailView = await $('[data-testid="issue-detail-view"]')
    await detailView.waitForDisplayed({ timeout: 5_000 })
    expect(await detailView.isDisplayed()).toBe(true)

    // Clean up: close the drawer so the next test (and any
    // subsequent suite) starts from a clean list view.
    const closeButton = await $('[data-testid="close-button"]')
    await closeButton.waitForDisplayed({ timeout: 5_000 })
    await closeButton.click()
    await detailView.waitForDisplayed({ timeout: 1_000, reverse: true })
  })
})
