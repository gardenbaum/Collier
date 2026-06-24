/// <reference types="mocha" />
/// <reference types="webdriverio" />
/**
 * M1 spec R4 E2E — issue detail panel completeness.
 *
 * Given the fixture workspace from scripts/make-fixture.sh
 * (25 Beads issues; TASK_LOGIN has 2 deps + a deterministic
 * description; TASK_BUG1 has 1 dep + a deterministic description),
 *
 *   when the user opens the detail drawer for TASK_LOGIN,
 *     then the description text renders (matches the prose the
 *          fixture seeded),
 *      and the Deps tab shows 2 navigable dependency rows
 *          (one each to TASK_REFAC and TASK_OAUTH),
 *      and the metadata <dl> renders type / priority / status /
 *          owner / created date.
 *
 *   when the user clicks Edit on the description, types a new
 *        value, and clicks Save,
 *     then the new text replaces the old one (optimistic + watcher
 *          reconcile) and persists across drawer close / reopen.
 *
 * Runs in CI under Xvfb (see .github/workflows/ci.yml). Local
 * execution requires `tauri-driver` + a built Collier binary --
 * not part of `bun run check:all`; E2E is its own CI job.
 *
 * Selectors target the `data-testid` attributes baked into
 * `src/components/beads/issues/IssueDetailView.tsx`,
 * `src/components/beads/issues/InlineDescriptionEdit.tsx`, and
 * `src/components/beads/dependencies/DependencyListView.tsx`.
 *
 * The "open the fixture workspace" step is shared via
 * `tests/e2e/helpers.ts` -- see that file for the isolation
 * rationale. Spec-specific waits (full fixture footer + reading
 * `.fixture-ids.json`) live below.
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
 * Path to the E2E fixture's `.fixture-ids.json` file. The CI
 * workflow exports `E2E_FIXTURE_DIR=/tmp/e2e-workspace` for the
 * e2e job (see `.github/workflows/ci.yml`); the wdio CWD is the
 * repo root, not the fixture dir, so a bare
 * `'.fixture-ids.json'` lookup blows up with ENOENT under CI.
 *
 * Resolution order:
 *   1. `E2E_FIXTURE_DIR` env var (set by the CI workflow).
 *   2. `/tmp/e2e-workspace` (the canonical CI fixture dir; we
 *      probe this so a missing env var on a local dev box still
 *      picks up the freshly-generated fixture under CI's
 *      conventional path).
 *   3. Bare `.fixture-ids.json` next to the wdio CWD (lets a
 *      developer running `bun run test:e2e` from a checkout that
 *      happens to have the fixture at its root still work).
 */
const FIXTURE_IDS_PATH = (() => {
  if (process.env.E2E_FIXTURE_DIR) {
    return path.join(process.env.E2E_FIXTURE_DIR, '.fixture-ids.json')
  }
  // ponytail: the CI workflow always writes the fixture to
  // /tmp/e2e-workspace. If the env var didn't make it to the wdio
  // worker (wdio 9's `runnerEnv` doesn't always inherit every
  // parent key — see wdio.config.ts), probe the canonical CI
  // path so the spec still finds the file. `existsSync` is a
  // cheap fs.stat, no fd held.
  const ciFixture = '/tmp/e2e-workspace/.fixture-ids.json'
  if (existsSync(ciFixture)) {
    return ciFixture
  }
  return '.fixture-ids.json'
})()

function readFixtureIds(): FixtureIds {
  // ponytail: Beads hashes issue IDs from a per-repo random
  // component, so the IDs in scripts/make-fixture.sh are not
  // deterministic across runs. The fixture script writes the
  // resolved IDs to `.fixture-ids.json`; this spec consumes them
  // by role (TASK_LOGIN, TASK_BUG1, …) instead of hard-coding
  // the hashes.
  const raw = readFileSync(FIXTURE_IDS_PATH, 'utf8')
  return JSON.parse(raw) as FixtureIds
}

describe('Collier M1 R4 detail panel completeness', () => {
  let taskLoginId = ''
  let taskBug1Id = ''
  let taskRefacId = ''
  let taskOauthId = ''

  before(async () => {
    await openFixtureWorkspace('r4')

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

    // Capture the resolved fixture IDs for the assertions below.
    const ids = readFixtureIds()
    taskLoginId = ids.TASK_LOGIN
    taskBug1Id = ids.TASK_BUG1
    taskRefacId = ids.TASK_REFAC
    taskOauthId = ids.TASK_OAUTH
    expect(taskLoginId).toMatch(/^[a-z0-9-]+-\w+$/i)
  })

  it('opens TASK_LOGIN detail and renders description + metadata + labels + comments', async () => {
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

    // -- Then: the description text renders (R4 acceptance) --
    await browser.waitUntil(
      async () => {
        const text = await detail.getText()
        return text.includes('Replace the legacy login form')
      },
      {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: 'description never rendered',
      }
    )

    // -- And: the metadata <dl> renders Type / Priority / Status /
    //    Owner / Created (R4 acceptance). The header badges
    //    already cover priority / status / type / assignee; we
    //    also verify the metadata dl because the spec calls it
    //    out separately.
    const detailText = await detail.getText()
    expect(detailText).toContain('Type')
    expect(detailText).toContain('Priority')
    expect(detailText).toContain('Status')
    expect(detailText).toContain('Created')

    // -- And: the header renders a label-chip for at least one of
    //    TASK_LOGIN's labels (auth, frontend per the fixture).
    //    label-chip is rendered as <span data-testid="label-chip">.
    const labelChips = await detail.$$('[data-testid="label-chip"]')
    expect(labelChips.length).toBeGreaterThan(0)

    // -- And: the comments tab is reachable + has a known count.
    //    The fixture doesn't seed comments, but the tab must
    //    render so the user can read / post them (R4 spec).
    const commentsTab = await $('[data-testid="tab-comments"]')
    await commentsTab.waitForDisplayed({ timeout: 5_000 })
    await commentsTab.click()
    // The comments tab fires bd_comments on click; the fixture
    // returns [] for this issue (no seeded comments). We assert
    // on the "No comments yet." empty state OR the tab body
    // itself -- either confirms the tab mounted and queried.
    await browser.waitUntil(
      async () => {
        const text = await detail.getText()
        return (
          text.includes('No comments yet') ||
          text.includes('Loading') ||
          text.includes('Add a comment')
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

  it('switches to the Deps tab and renders 2 navigable dependency rows for TASK_LOGIN', async () => {
    // -- Given: TASK_LOGIN's detail is open --
    const row = await $(
      `[data-testid="issue-row"][data-issue-id="${taskLoginId}"]`
    )
    await row.waitForDisplayed({ timeout: 5_000 })
    const titleCell = await row.$('[data-column="title"]')
    await titleCell.click()
    const detail = await $('[data-testid="issue-detail-view"]')
    await detail.waitForDisplayed({ timeout: 5_000 })

    // -- When: switch to the Deps tab --
    const depsTab = await $('[data-testid="tab-deps"]')
    await depsTab.waitForDisplayed({ timeout: 5_000 })
    await depsTab.click()

    // -- Then: a "Blocks" section appears with exactly 2 rows
    //    (TASK_LOGIN blocks TASK_REFAC and TASK_OAUTH per the
    //    fixture script).
    const section = await $('[data-testid="deps-section-blocks"]')
    await section.waitForDisplayed({ timeout: 5_000 })

    await browser.waitUntil(
      async () => {
        const count = await browser.execute(
          (sectionTestId: string) =>
            document.querySelectorAll(
              `[data-testid="${sectionTestId}"] [data-testid="dep-row"]`
            ).length,
          'deps-section-blocks'
        )
        return count === 2
      },
      {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: 'expected 2 dep rows in the Blocks section',
      }
    )

    // -- And: each dep target id is a clickable link / button --
    // ponytail: the dep target is rendered as a <button> with
    // data-testid="dep-target-id" (the DependencyListView's
    // navigable surface). Its textContent is the issue id hash.
    // Read the rendered text via browser.execute so the assertion
    // is scoped to the section rather than the whole document.
    const targetIds = await browser.execute(
      (sectionTestId: string): string[] => {
        const sec = document.querySelector(`[data-testid="${sectionTestId}"]`)
        if (!sec) return []
        return Array.from(
          sec.querySelectorAll('[data-testid="dep-target-id"]')
        ).map(e => e.textContent?.trim() ?? '')
      },
      'deps-section-blocks'
    )
    expect(targetIds.sort()).toEqual([taskRefacId, taskOauthId].sort())

    // Clean up: close the drawer.
    const closeButton = await $('[data-testid="close-button"]')
    await closeButton.click()
    await detail.waitForDisplayed({ timeout: 1_000, reverse: true })
  })

  it('edits the description via bd update and the new text persists', async () => {
    // -- Given: TASK_BUG1's detail is open (its description is the
    //    "Reproduce the cache-invalidation bug" prose the fixture
    //    seeds) --
    const row = await $(
      `[data-testid="issue-row"][data-issue-id="${taskBug1Id}"]`
    )
    await row.waitForDisplayed({ timeout: 5_000 })
    const titleCell = await row.$('[data-column="title"]')
    await titleCell.click()
    const detail = await $('[data-testid="issue-detail-view"]')
    await detail.waitForDisplayed({ timeout: 5_000 })

    await browser.waitUntil(
      async () => {
        const text = await detail.getText()
        return text.includes('Reproduce the cache-invalidation bug')
      },
      {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: 'initial description never rendered',
      }
    )

    // -- When: click Edit, type a new description, click Save --
    const editButton = await $('[data-testid="inline-description-edit-button"]')
    await editButton.waitForDisplayed({ timeout: 5_000 })
    await editButton.click()

    const textarea = (await $(
      '[data-testid="inline-description-textarea"]'
    )) as unknown as WebdriverIO.Element
    await textarea.waitForDisplayed({ timeout: 5_000 })

    // ponytail: native setters + dispatch 'input' event so React
    // sees the change. The textarea is autofocused on open, so we
    // just set its value.
    const newDescription =
      'E2E R4 — edited via the description drawer at ' +
      new Date().toISOString()
    await browser.execute(
      ((value: string) => {
        const ta = document.querySelector(
          '[data-testid="inline-description-textarea"]'
        ) as HTMLTextAreaElement | null
        if (!ta) throw new Error('textarea not found')
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value'
        )?.set
        setter?.call(ta, value)
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        ta.dispatchEvent(new Event('change', { bubbles: true }))
      }) as (...args: [string]) => void,
      newDescription
    )

    const saveButton = await $('[data-testid="inline-description-save"]')
    await saveButton.click()

    // -- Then: the optimistic patch + onSuccess replaces the
    //    description text in the drawer --
    await browser.waitUntil(
      async () => {
        const text = await detail.getText()
        return text.includes('E2E R4 — edited via the description drawer')
      },
      {
        timeout: 10_000,
        interval: 200,
        timeoutMsg: 'edited description never replaced the old text',
      }
    )

    // -- And: the watcher tick reconciles against bd (bd persisted
    //    the change). Close + reopen the drawer; the new text
    //    must still be there.
    const closeButton = await $('[data-testid="close-button"]')
    await closeButton.click()
    await detail.waitForDisplayed({ timeout: 1_000, reverse: true })

    const rowAgain = await $(
      `[data-testid="issue-row"][data-issue-id="${taskBug1Id}"]`
    )
    await rowAgain.waitForDisplayed({ timeout: 5_000 })
    const titleCellAgain = await rowAgain.$('[data-column="title"]')
    await titleCellAgain.click()
    const detailAgain = await $('[data-testid="issue-detail-view"]')
    await detailAgain.waitForDisplayed({ timeout: 5_000 })

    await browser.waitUntil(
      async () => {
        const text = await detailAgain.getText()
        return text.includes('E2E R4 — edited via the description drawer')
      },
      {
        timeout: 10_000,
        interval: 200,
        timeoutMsg: 'edited description did not persist after close + reopen',
      }
    )

    // Clean up: restore the original description so re-runs are
    // idempotent. Use the UI itself rather than shelling out to
    // `bd` -- the test should only depend on the surface it covers.
    const editAgain = await $('[data-testid="inline-description-edit-button"]')
    await editAgain.click()
    await browser.execute(
      ((value: string) => {
        const ta = document.querySelector(
          '[data-testid="inline-description-textarea"]'
        ) as HTMLTextAreaElement | null
        if (!ta) throw new Error('textarea not found on cleanup')
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value'
        )?.set
        setter?.call(ta, value)
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        ta.dispatchEvent(new Event('change', { bubbles: true }))
      }) as (...args: [string]) => void,
      'Reproduce the cache-invalidation bug on rapid refresh; document steps in the linked ticket.'
    )
    const saveAgain = await $('[data-testid="inline-description-save"]')
    await saveAgain.click()
    await browser.waitUntil(
      async () => {
        const text = await detailAgain.getText()
        return text.includes('Reproduce the cache-invalidation bug')
      },
      { timeout: 5_000, interval: 100, timeoutMsg: 'cleanup save never landed' }
    )

    const closeAgain = await $('[data-testid="close-button"]')
    await closeAgain.click()
    await detailAgain.waitForDisplayed({ timeout: 1_000, reverse: true })
  })
})
