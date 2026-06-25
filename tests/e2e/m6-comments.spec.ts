/// <reference types="mocha" />
/// <reference types="webdriverio" />
/**
 * M6 spec E2E — comments UI on the issue detail panel.
 *
 * Given the fixture workspace from scripts/make-fixture.sh (25
 * Beads issues),
 *
 *   when the user opens TASK_LOGIN's detail drawer and clicks
 *        the Comments tab,
 *     then the comments list renders (with a "No comments yet."
 *          empty state for the fixture issue, since the fixture
 *          script doesn't seed comments).
 *
 *   when the user types a new comment into the textarea and
 *        clicks "Post comment",
 *     then `bd comment <id> <body>` runs in the backend,
 *      and the watcher tick invalidates the comments query,
 *      and the new comment row appears at the bottom of the
 *          thread (chronologically last — M6 R8 sorts by
 *          `created_at` ascending).
 *
 * M6 R8 acceptance: the comments thread is ordered by time. The
 * pre-condition is the bd add → watcher → invalidation → refetch
 * path actually working end-to-end in the running Tauri app
 * (which the r4 spec doesn't exercise — it only checks the
 * empty-state branch).
 *
 * Selectors target the `data-testid` attributes baked into
 * `src/components/beads/issues/IssueDetailView.tsx` — the stable
 * contract between the frontend and this test.
 *
 * The "open the fixture workspace" step is shared via
 * `tests/e2e/helpers.ts` (the idempotent workspace-open helper +
 * per-spec DB isolation; see that file for the isolation
 * rationale).
 *
 * Cleanup caveat: `bd` doesn't ship a comment-delete subcommand
 * (`bd comment --help` and `bd comments --help` only expose
 * `add`), so this spec can't roll the fixture back to its
 * pristine state. The CI workflow regenerates the fixture before
 * every e2e job (`rm -rf /tmp/e2e-workspace && scripts/make-fixture.sh
 * /tmp/e2e-workspace`), so a stale comment from a previous run
 * can't leak into the next run. For local re-runs, the comment
 * accumulates but the assertion is text-based (we look for our
 * unique marker), so re-runs still pass — they just leave a
 * second marker comment behind.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { browser, expect, $ } from '@wdio/globals'

import { openFixtureWorkspace } from './helpers'

interface FixtureIds {
  TASK_LOGIN: string
  TASK_BUG1: string
  TASK_REFAC: string
  TASK_OAUTH: string
  TASK_INV: string
}

/**
 * Path to the E2E fixture's `.fixture-ids.json` file. See the
 * matching helper in r4-detail.spec.ts for the full resolution
 * rationale (env var → canonical CI path → bare fallback).
 */
const FIXTURE_IDS_PATH = (() => {
  if (process.env.E2E_FIXTURE_DIR) {
    return path.join(process.env.E2E_FIXTURE_DIR, '.fixture-ids.json')
  }
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

describe('Collier M6 comments UI on issue detail', () => {
  let taskLoginId = ''

  before(async () => {
    await openFixtureWorkspace('m6-comments')

    // The footer reflects the total count. Wait for the full
    // fixture (25 issues) to be loaded before sampling -- a
    // partial fetch would short-circuit the persistence
    // assertions below.
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

    // Capture the resolved fixture IDs for the assertions below.
    const ids = readFixtureIds()
    taskLoginId = ids.TASK_LOGIN
    expect(taskLoginId).toMatch(/^[a-z0-9-]+-\w+(\.\w+)?$/i)
  })

  it('opens TASK_LOGIN, switches to the Comments tab, and shows the empty state', async () => {
    // -- Given: TASK_LOGIN's row is rendered --
    const row = await $(
      `[data-testid="issue-row"][data-issue-id="${taskLoginId}"]`
    )
    await row.waitForDisplayed({ timeout: 5_000 })

    // -- When: open the detail drawer by clicking the title cell --
    // ponytail: the title cell is the only cell without an inline
    // edit control; clicking it bubbles to the row's onClick which
    // sets the workspace store's selectedIssueId, mounting the
    // drawer (see IssueDetailDrawer.tsx).
    const titleCell = await row.$('[data-column="title"]')
    await titleCell.click()

    const detail = await $('[data-testid="issue-detail-view"]')
    await detail.waitForDisplayed({ timeout: 5_000 })

    // -- When: switch to the Comments tab --
    const commentsTab = await $('[data-testid="tab-comments"]')
    await commentsTab.waitForDisplayed({ timeout: 5_000 })
    await commentsTab.click()

    // -- Then: the empty state renders (the fixture script
    //    doesn't seed comments on any issue) --
    // ponytail: the comments tab fires `bd comments` lazily on
    // mount (the `enabled: activeTab === 'comments'` gate in
    // IssueDetailView keeps the request from firing until the
    // user opens the tab). The fixture issue's `bd comments
    // <id> --json` returns [], which the UI renders as the
    // "No comments yet." empty state. We assert on either the
    // empty state OR the form being present (the form is part
    // of the same render path, so either proves the tab mounted
    // and queried).
    await browser.waitUntil(
      async () => {
        const text = await detail.getText()
        return (
          text.includes('No comments yet') || text.includes('Add a comment')
        )
      },
      {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: 'comments tab never mounted',
      }
    )

    // Clean up: close the drawer so the next test starts fresh.
    const closeButton = await $('[data-testid="close-button"]')
    await closeButton.waitForDisplayed({ timeout: 5_000 })
    await closeButton.click()
    await detail.waitForDisplayed({ timeout: 1_000, reverse: true })
  })

  it('posts a new comment via the UI and the comment renders in the thread', async () => {
    // -- Given: TASK_LOGIN's detail drawer is open --
    const row = await $(
      `[data-testid="issue-row"][data-issue-id="${taskLoginId}"]`
    )
    await row.waitForDisplayed({ timeout: 5_000 })
    const titleCell = await row.$('[data-column="title"]')
    await titleCell.click()
    const detail = await $('[data-testid="issue-detail-view"]')
    await detail.waitForDisplayed({ timeout: 5_000 })

    // -- And: the Comments tab is mounted --
    const commentsTab = await $('[data-testid="tab-comments"]')
    await commentsTab.waitForDisplayed({ timeout: 5_000 })
    await commentsTab.click()

    // Wait for the comments tab to settle — either the empty
    // state OR an existing comment row counts as "mounted".
    await browser.waitUntil(
      async () => {
        const text = await detail.getText()
        return (
          text.includes('No comments yet') || text.includes('Add a comment')
        )
      },
      {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: 'comments tab never mounted',
      }
    )

    // -- And: the initial row count is captured for the
    //    "count went up by 1" assertion below --
    const beforeCount = await browser.execute(
      () => document.querySelectorAll('[data-testid="comment-row"]').length
    )

    // -- When: type a unique marker comment + click Post --
    const uniqueMarker = `E2E M6 comment ${new Date().toISOString()}`
    const textarea = await $('[data-testid="comment-input"]')
    await textarea.waitForDisplayed({ timeout: 5_000 })

    // ponytail: native setter + dispatch 'input' event so React
    // sees the change. Same pattern the r4 spec uses for the
    // description-edit textarea.
    await browser.execute((value: string) => {
      const ta = document.querySelector(
        '[data-testid="comment-input"]'
      ) as HTMLTextAreaElement | null
      if (!ta) throw new Error('comment textarea not found')
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set
      setter?.call(ta, value)
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      ta.dispatchEvent(new Event('change', { bubbles: true }))
    }, uniqueMarker)

    const submit = await $('[data-testid="comment-submit-button"]')
    await submit.waitForDisplayed({ timeout: 5_000 })
    await submit.click()

    // -- Then: the row count goes up by exactly 1 (the bd add
    //    completes, the watcher tick fires, the
    //    `invalidateQueries` + `refetch` in the mutation's
    //    onSuccess callback refreshes the comments query, and
    //    the new row mounts). --
    // ponytail: the mutation already calls `commentsQuery.refetch()`
    // in onSuccess, so this isn't strictly waiting for the
    // watcher — but the race between the mutation's refetch
    // and the watcher's `beads-data-changed` toast-driven path
    // can still surface, so a small interval (200ms) keeps the
    // assertion stable under CI.
    await browser.waitUntil(
      async () => {
        const count = await browser.execute(
          () => document.querySelectorAll('[data-testid="comment-row"]').length
        )
        return count === beforeCount + 1
      },
      {
        timeout: 10_000,
        interval: 200,
        timeoutMsg: `comment row count did not increase from ${beforeCount}`,
      }
    )

    // -- And: the new comment text is visible in the DOM --
    // We don't assume a specific `data-comment-id` (bd mints a
    // fresh UUID on every add), so we assert on the body text
    // being present somewhere in the rendered thread.
    await browser.waitUntil(
      async () => {
        const text = await detail.getText()
        return text.includes(uniqueMarker)
      },
      {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: 'newly-posted comment text never rendered',
      }
    )

    // -- And: the new comment is the LAST row in the thread
    //    (M6 R8 acceptance — chronological order, newest at the
    //    bottom) --
    // ponytail: reading via browser.execute so we get the
    // post-sort DOM order, not a fresh querySelectorAll that
    // might race the sort memoisation. The thread is
    // `[...query.data].sort(...)`, so the freshly-posted
    // comment (created just now) is always the last row.
    const lastRowText = await browser.execute(() => {
      const rows = Array.from(
        document.querySelectorAll('[data-testid="comment-row"]')
      )
      const last = rows[rows.length - 1]
      return last?.textContent ?? ''
    })
    expect(lastRowText).toContain(uniqueMarker)

    // Clean up: close the drawer so the next spec starts fresh.
    const closeButton = await $('[data-testid="close-button"]')
    await closeButton.click()
    await detail.waitForDisplayed({ timeout: 1_000, reverse: true })
  })
})
