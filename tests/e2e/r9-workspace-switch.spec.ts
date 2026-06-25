/// <reference types="mocha" />
/// <reference types="webdriverio" />
/**
 * M4 spec R9 E2E — multi-workspace switcher.
 *
 * Two fixture workspaces are seeded by the CI workflow:
 *   - /tmp/e2e-workspace   (the standard M0/M1 fixture: 25 issues,
 *                          2 epics, 5 dep edges — see make-fixture.sh)
 *   - /tmp/e2e-workspace-b (a minimal M4 fixture: 5 issues, all
 *                          `open`, with a unique "M4 second workspace
 *                          alpha" title — see make-second-fixture.sh)
 *
 * Both paths are pre-populated into ~/.beads/registry.json so the
 * WorkspaceSwitcher dropdown sees them without a manual `bd init`
 * dance. `openFixtureWorkspace` lands us in /tmp/e2e-workspace
 * (the helper hardcodes the bootstrap path through the active
 * repo).
 *
 *   when the user opens the workspace switcher in the header,
 *     then the dropdown lists the active workspace and the
 *          second fixture's basename.
 *
 *   when the user clicks the second fixture,
 *     then the issue list reloads with the second fixture's
 *          unique "alpha" title visible (proving the bd
 *          subprocess is talking to the new repo, not the old).
 *
 *   when the user switches back to the first fixture,
 *     then the issue list reloads again, and the unique
 *          "alpha" title is gone (so we know the cache and
 *          the bd subprocess are reading from the first
 *          workspace again).
 *
 * The dropdown is rendered through Radix portals, so we click
 * the `data-testid="workspace-switcher-trigger"` to open it and
 * click the matching row by its `data-workspace-path` attribute.
 *
 * Runs in CI under Xvfb (see .github/workflows/ci.yml). Local
 * execution requires `tauri-driver` + a built Collier binary --
 * not part of `bun run check:all`; E2E is its own CI job.
 */

import { browser, expect, $ } from '@wdio/globals'

import { openFixtureWorkspace, openWorkspaceSwitcher } from './helpers'

const SECOND_FIXTURE_PATH = '/tmp/e2e-workspace-b'

describe('Collier M4 R9 multi-workspace switcher', () => {
  before(async () => {
    // The bootstrap path lands us inside /tmp/e2e-workspace
    // (the helper waits for that workspace's 25-issue fixture).
    await openFixtureWorkspace('r9')
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

  it('opens the workspace switcher dropdown from the header', async () => {
    // -- When: we click the switcher trigger in the title bar.
    const trigger = await $('[data-testid="workspace-switcher-trigger"]')
    await trigger.waitForDisplayed({ timeout: 5_000 })
    await trigger.click()

    // -- Then: the dropdown menu mounts. Both the current
    //    workspace and the second fixture should be visible.
    const menu = await $('[data-testid="workspace-switcher-menu"]')
    await menu.waitForDisplayed({ timeout: 5_000 })
  })

  it('lists the current workspace and the second fixture', async () => {
    // -- Given: the dropdown is open from the previous test.
    //    Re-use the idempotent helper so we don't fight the Radix
    //    portal overlay sitting on top of the trigger once open.
    await openWorkspaceSwitcher()

    // -- Then: the current entry is rendered with the "current"
    //    marker and the second fixture's path is in the
    //    items list.
    //
    // ponytail: read the `data-testid` element text via
    // `browser.execute` rather than the wdio `$().getText()`
    // chain. With Radix DropdownMenu's portal the element is
    // briefly re-mounted while the open animation settles; a
    // wdio element handle captured mid-mount has a stale
    // WebDriver reference and returns an empty string for
    // `getText()`. Page-context DOM lookup re-queries on every
    // iteration, so a transient remount just returns empty and
    // we retry until the row stabilises. The `waitUntil` resolves
    // with `true` (and we use that as the assertion's success
    // signal) once the text contains the expected substring.
    await browser.waitUntil(
      async () => {
        const text = await browser.execute(
          () =>
            document
              .querySelector('[data-testid="workspace-switcher-current"]')
              ?.textContent?.toLowerCase() ?? null
        )
        return text !== null && text.includes('e2e-workspace')
      },
      {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: 'workspace-switcher-current text never resolved',
      }
    )

    // Both fixtures should be reachable as rows (current + recents
    // or current + registry, depending on whether recent_repos
    // has been populated yet at the moment of the query).
    const items = await browser.execute(() =>
      Array.from(
        document.querySelectorAll('[data-testid="workspace-switcher-item"]')
      ).map(el => ({
        path: el.getAttribute('data-workspace-path'),
        source: el.getAttribute('data-workspace-source'),
      }))
    )
    const paths = items.map(i => i.path)
    expect(paths).toContain(SECOND_FIXTURE_PATH)
  })

  it('switches to the second fixture and reloads the list', async () => {
    // -- Given: the dropdown is open.
    await openWorkspaceSwitcher()

    // -- When: we click the row whose data-workspace-path
    //    matches the second fixture.
    const secondRow = await browser.execute((targetPath: string) => {
      const rows = Array.from(
        document.querySelectorAll('[data-testid="workspace-switcher-item"]')
      )
      const match = rows.find(
        r => r.getAttribute('data-workspace-path') === targetPath
      )
      if (!match) return null
      // Use the row's bounding rect so we click exactly where
      // WebKitWebDriver's elementClick will land — Radix portals
      // sometimes lay the trigger at a coordinate the browser
      // auto-scrolls away from.
      const rect = match.getBoundingClientRect()
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        text: match.textContent ?? '',
      }
    }, SECOND_FIXTURE_PATH)
    expect(secondRow).not.toBeNull()

    // Use the JS-level click instead of element.click() so we
    // don't fight Radix's focus-management / animation timing.
    await browser.execute((targetPath: string) => {
      const rows = Array.from(
        document.querySelectorAll('[data-testid="workspace-switcher-item"]')
      )
      const match = rows.find(
        r => r.getAttribute('data-workspace-path') === targetPath
      )
      if (match instanceof HTMLElement) match.click()
    }, SECOND_FIXTURE_PATH)

    // -- Then: the list reloads to show the second fixture's
    //    5 issues. We assert by waiting for the unique
    //    "M4 second workspace alpha" title in the *cache* —
    //    reading from the cache (via `getCachedIssue`) bypasses
    //    the virtualizer's windowed-render race (only ~15 rows
    //    are mounted at a time) and the DOM attribute scan that
    //    used to time out at 10 s when the second-fixture Dolt
    //    cold-start took longer than the budget. The cache is
    //    populated by the TanStack Query list refetch the
    //    workspace switch triggers, so the assertion resolves
    //    as soon as bd list returns the new fixture — no DOM
    //    round-trip required.
    //
    // ponytail: we look up by the unique title because the
    // second-fixture IDs are non-deterministic (bd hashes them
    // from repo + creation order + random component). The
    // `getCachedIssue` helper searches every list cache
    // variant for an issue whose title contains the unique
    // marker — see tests/e2e/helpers.ts for the search
    // semantics. If the title is found, the helper returns
    // the issue; we use that as the waitUntil success signal.
    const alphaRow = await browser.waitUntil(
      async () => {
        const queries = await browser.execute(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const client = (globalThis as any).__collierQueryClient__
          if (!client) return []
          return client
            .getQueryCache()
            .getAll()
            .filter(
              (q: { queryKey: readonly unknown[] }) =>
                Array.isArray(q.queryKey) &&
                q.queryKey[0] === 'beads' &&
                q.queryKey[1] === 'list'
            )
            .flatMap((q: { state: { data: unknown } }) => {
              const data = q.state.data
              return Array.isArray(data) ? (data as { title?: string }[]) : []
            })
        })
        const match = queries.find((q: { title?: string }) =>
          (q.title ?? '').toLowerCase().includes('second workspace alpha')
        )
        return match ?? false
      },
      {
        timeout: 15_000,
        interval: 500,
        timeoutMsg: 'second-fixture "alpha" issue row never rendered',
      }
    )
    expect(alphaRow).toBeTruthy()
  })

  it('persists the switch through a re-open of the dropdown', async () => {
    // -- When: we re-open the dropdown after the switch.
    await openWorkspaceSwitcher()

    // -- Then: the "current" entry is now the second fixture
    //    (basename `e2e-workspace-b`), proving switchWorkspace
    //    wrote the new repo to the store.
    const current = await $('[data-testid="workspace-switcher-current"]')
    await current.waitForDisplayed({ timeout: 5_000 })
    const currentText = (await current.getText()).toLowerCase()
    expect(currentText).toContain('e2e-workspace-b')
  })

  it('can switch back to the first fixture and reload', async () => {
    // -- Given: the dropdown is open and the second fixture is
    //    active.
    await openWorkspaceSwitcher()

    // -- When: click the first fixture's row.
    await browser.execute(() => {
      const rows = Array.from(
        document.querySelectorAll('[data-testid="workspace-switcher-item"]')
      )
      const match = rows.find(
        r =>
          r.getAttribute('data-workspace-path') === '/tmp/e2e-workspace' ||
          (r.getAttribute('data-workspace-path') ?? '').endsWith(
            '/e2e-workspace'
          )
      )
      if (match instanceof HTMLElement) match.click()
    })

    // -- Then: the alpha title is gone (we're back to a workspace
    //    that doesn't have it) and the footer reflects the 25-issue
    //    fixture again.
    await browser.waitUntil(
      async () => {
        const alphaRow = await browser.execute(() => {
          const rows = Array.from(
            document.querySelectorAll('[data-testid="issue-row"]')
          )
          return rows.find(r =>
            (r.textContent ?? '').includes('second workspace alpha')
          )
        })
        return alphaRow === null
      },
      {
        timeout: 10_000,
        interval: 500,
        timeoutMsg:
          'list still shows second-fixture content after switching back',
      }
    )

    const footerText = await browser.execute(
      () =>
        document.querySelector('[data-testid="list-footer"]')?.textContent ??
        null
    )
    expect(footerText ?? '').toContain('25 issues')
  })
})
