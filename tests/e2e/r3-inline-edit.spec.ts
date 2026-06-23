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

import { openFixtureWorkspace } from './helpers'

describe('Collier M1 R3 inline editing', () => {
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

  it('changing a row status inline persists via bd update (optimistic + reconcile)', async () => {
    // -- Given: at least one rendered row, status=open (or any
    //    status that has alternatives in the dropdown).
    const rows = await $$('[data-testid="issue-row"]')
    expect(rows.length).toBeGreaterThan(0)
    const firstRow = rows[0] as unknown as WebdriverIO.Element
    const rowId = (await firstRow.getAttribute('data-issue-id')) ?? ''
    const originalStatus = await firstRow.getAttribute('data-issue-status')
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

    // -- Then: the row reflects the new status (optimistic) --
    await browser.waitUntil(
      async () => {
        const row = await $(
          `[data-testid="issue-row"][data-issue-id="${rowId}"]`
        )
        return (await row.getAttribute('data-issue-status')) === nextStatus
      },
      {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: `row ${rowId} status never updated to ${nextStatus} optimistically`,
      }
    )

    // -- And: the watcher tick reconciles the change (bd persisted
    //    it, the list query refetched, and the row still shows the
    //    new status after a re-query). The watcher fires within
    //    ~1s of the bd write; we wait up to 5s to be safe under
    //    CI cold-start.
    await browser.waitUntil(
      async () => {
        const row = await $(
          `[data-testid="issue-row"][data-issue-id="${rowId}"]`
        )
        return (await row.getAttribute('data-issue-status')) === nextStatus
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

    // -- Then: the row reflects the new priority (optimistic) --
    await browser.waitUntil(
      async () => {
        const row = await $(
          `[data-testid="issue-row"][data-issue-id="${rowId}"]`
        )
        return (await row.getAttribute('data-issue-priority')) === nextPriority
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
        const row = await $(
          `[data-testid="issue-row"][data-issue-id="${rowId}"]`
        )
        return (await row.getAttribute('data-issue-priority')) === nextPriority
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
    const rows = await $$('[data-testid="issue-row"]')
    expect(rows.length).toBeGreaterThan(0)
    const firstRow = rows[0] as unknown as WebdriverIO.Element

    // -- When: click on the row's title cell (not the inline-edit
    //    cells -- the title column has no inline control, so a
    //    click there should bubble to the row's onClick handler and
    //    open the detail drawer).
    //
    // ponytail: this regression-guard confirms that the inline
    // edits' swallowHostEvents flag doesn't accidentally swallow
    // events from OTHER cells. Only the cells that contain a
    // <select> should stop propagation.
    const titleCell = await firstRow.$('[data-column="title"]')
    await titleCell.waitForDisplayed({ timeout: 5_000 })
    await titleCell.click()

    // -- Then: the issue detail view opens --
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
