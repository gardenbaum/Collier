/// <reference types="webdriverio" />
/**
 * Shared helpers for the Collier E2E suite.
 *
 * `openFixtureWorkspace` is the single source of truth for the
 * "get the app to the fixture workspace" step. It exists because
 * the app persists the active workspace to localStorage (see
 * src/store/workspace-store.ts) and tauri-driver + WebKitWebDriver
 * keep the Tauri app's data dir alive across the wdio spec run --
 * so the first spec's "Use CWD" click is still visible to every
 * subsequent spec's app launch. Specs that hard-require
 * `data-testid="use-cwd-button"` therefore time out at 30s on
 * every spec after the first.
 *
 * The helper waits for EITHER the bootstrap button OR the issue
 * list to appear, then proceeds down whichever path is actually
 * open. Either way, by the time it returns the issue list view
 * is mounted and at least one row has rendered (the row wait
 * must outlive the app's 120s `bd list` subprocess timeout for
 * Dolt cold-start under CI).
 *
 * `getCachedIssueField` is the read-from-cache counterpart to
 * the DOM-attribute waits every spec used to do. The DOM is a
 * *windowed* projection of the TanStack Query cache (only ~15
 * rows are mounted at a time by `@tanstack/react-virtual`), so a
 * test that polls `data-issue-status` for a row the virtualizer
 * has unmounted will burn its full timeout polling `null` even
 * when the watcher has already patched the cache. Reading the
 * cache directly via the page-context `queryClient` bypasses the
 * virtualizer entirely — the cache always holds every issue
 * regardless of what's in the DOM, and `beads-issue-updated` /
 * `beads-issue-created` / `beads-issue-deleted` patch it
 * synchronously. The handle is exposed by `src/main.tsx` under
 * the build-time `VITE_E2E` flag (production builds do not ship
 * the handle).
 */

import { browser, $, $$ } from '@wdio/globals'

/**
 * Open the workspace switcher dropdown if it is not already open.
 *
 * Why this helper exists: the Radix DropdownMenu renders its content
 * in a portal appended to document.body. Once open, the menu overlay
 * sits on top of the trigger button, and WebdriverIO's element.click()
 * refuses to fire ("element not interactable" — the centre point is
 * owned by the portal, not the trigger). The retry loop burns ~10s per
 * attempt and times the suite out.
 *
 * We dispatch a real DOM `pointerdown` event via `browser.execute`
 * so we bypass the WebDriver interactability check AND hit the
 * Radix DropdownMenuTrigger handler, which listens exclusively for
 * `pointerdown` (NOT `click`) to toggle the menu open — see the
 * Radix source comment in the implementation below. We still gate on
 * the trigger's `data-state="open"` so we don't *toggle* an
 * already-open menu shut. After the click we wait for
 * `[data-testid="workspace-switcher-menu"]` to be displayed so
 * callers can assert against its contents without a race.
 */
export async function openWorkspaceSwitcher(): Promise<void> {
  // ponytail: read `data-state` and trigger via `browser.execute`
  // so the click happens in the page context — WebDriver's
  // `element.click()` refuses to fire when the Radix portal
  // overlays the trigger and the centre point is owned by the
  // menu, not the trigger button. We still gate on the trigger's
  // `data-state` so we don't *toggle* an already-open menu shut.
  const alreadyOpen = await browser.execute(
    () =>
      document
        .querySelector('[data-testid="workspace-switcher-trigger"]')
        ?.getAttribute('data-state') === 'open'
  )
  if (!alreadyOpen) {
    // Dispatch a real `pointerdown` event (NOT a synthetic
    // `element.click()`). Radix `DropdownMenuTrigger` listens
    // exclusively on `pointerdown` to toggle the menu — see
    // node_modules/@radix-ui/react-dropdown-menu/dist/index.mjs:
    //
    //   onPointerDown: composeEventHandlers(props.onPointerDown, (event) => {
    //     if (!disabled && event.button === 0 && event.ctrlKey === false) {
    //       context.onOpenToggle();
    //       if (!context.open) event.preventDefault();
    //     }
    //   })
    //
    // `trigger.click()` only fires a `click` event, so the menu
    // never opens — the post-workspace-switch re-open path of
    // the r9 spec was failing with "workspace-switcher-menu did
    // not appear within 5000ms" because of exactly this gap.
    // Dispatching `pointerdown` with the same options Radix
    // expects (button=0, ctrlKey=false, cancelable=true so the
    // `event.preventDefault()` inside Radix doesn't throw on an
    // un-cancelable event) reaches the handler.
    await browser.execute(() => {
      const trigger = document.querySelector(
        '[data-testid="workspace-switcher-trigger"]'
      ) as HTMLElement | null
      if (!trigger) return
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        ctrlKey: false,
        pointerType: 'mouse',
        isPrimary: true,
      })
      trigger.dispatchEvent(event)
    })
  }
  // Wait for the menu via `browser.execute` rather than wdio's
  // `$().waitForDisplayed`. The Radix portal sometimes re-mounts
  // the menu during the open animation; a wdio element handle
  // captured mid-mount has a stale WebDriver reference and
  // `waitForDisplayed` reports `still not displayed after 5000ms`.
  // Page-context DOM lookup re-queries on every iteration so a
  // transient remount just retries until the menu stabilises.
  await browser.waitUntil(
    async () =>
      (await browser.execute(
        () =>
          document.querySelector('[data-testid="workspace-switcher-menu"]') !==
          null
      )) === true,
    {
      timeout: 5_000,
      interval: 100,
      timeoutMsg: 'workspace-switcher-menu did not appear within 5000ms',
    }
  )
}

/**
 * Open the fixture workspace and wait for the first issue row to
 * render. `specLabel` is a short tag (e.g. "r1", "r3", "smoke")
 * used as a log prefix so the CI log clearly shows which spec
 * each line belongs to.
 *
 * Specs that need the full 25-issue fixture (not just one row)
 * should follow this with their own `browser.waitUntil` against
 * the `[data-testid="list-footer"]` text. Keeping that out of
 * this helper means the M0 smoke spec stays cheap.
 */
export async function openFixtureWorkspace(specLabel: string): Promise<void> {
  // Window title comes from tauri.conf.json -> app.windows[0].title
  // (and from index.html's <title>; both are "Collier"). Read
  // document.title via execute() because wdio 9's types dropped
  // the W3C getTitle shorthand -- both reach the same string in
  // a Tauri webview. Asserting on the title up front means a
  // spec failure that's actually "the app never launched" shows
  // up here with the right label, not buried in the row wait.
  const title = await browser.execute(() => document.title)
  if (title !== 'Collier') {
    throw new Error(
      `[e2e:${specLabel}] expected window title "Collier" but got "${String(title)}" -- app likely failed to launch`
    )
  }

  // 1. Wait for either the bootstrap button OR the issue list view
  //    to be present in the DOM. Whichever shows up tells us
  //    whether the app is at the bootstrap screen (first spec of
  //    a fresh localStorage) or already inside a persisted
  //    workspace (every spec after the first in a single CI run).
  await browser.waitUntil(
    async () => {
      const useCwd = await $('[data-testid="use-cwd-button"]')
      const list = await $('[data-testid="issue-list-view"]')
      return (await useCwd.isExisting()) || (await list.isExisting())
    },
    {
      timeout: 30_000,
      interval: 250,
      timeoutMsg: 'neither bootstrap button nor issue list appeared within 30s',
    }
  )

  // 2. Click the bootstrap button only if it is present. If the
  //    app is already inside a persisted workspace (the common
  //    case for specs 2-5 in a CI run), proceed straight to
  //    waiting for the issue list.
  const useCwdButton = await $('[data-testid="use-cwd-button"]')
  if (await useCwdButton.isExisting()) {
    console.log(`[e2e:${specLabel}] clicking use-cwd-button (bootstrap path)`)
    await useCwdButton.click()
  } else {
    console.log(
      `[e2e:${specLabel}] already inside a workspace (persisted localStorage)`
    )
  }

  // 3. Wait for the React Query behind <IssueListView /> to mount.
  //    Xvfb start + Dolt cold-start is ~2-5s on CI; the first
  //    `bd list` call after that takes 5-30s.
  const list = await $('[data-testid="issue-list-view"]')
  await list.waitForDisplayed({ timeout: 30_000 })

  // 4. Log the loading / error / empty sibling states for CI
  //    diagnostics. The row wait below is what unblocks the test;
  //    if it never unblocks, these logs tell us whether we hit a
  //    real error, a slow load, or just an empty fixture.
  const loading = await $('[data-testid="list-loading"]')
  const errorDiv = await $('[data-testid="list-error"]')
  const empty = await $('[data-testid="list-empty"]')
  if (await loading.isExisting()) {
    console.log(`[e2e:${specLabel}] list-loading is visible (query in flight)`)
  }
  if (await errorDiv.isExisting()) {
    const err = await errorDiv.getText()
    console.log(`[e2e:${specLabel}] list-error is visible: ${err}`)
  }
  if (await empty.isExisting()) {
    console.log(
      `[e2e:${specLabel}] list-empty is visible (query returned 0 issues)`
    )
  }

  // 5. Reset the persisted filter selection to empty BEFORE the row
  //    wait. Each spec gets a fresh Tauri app launch but the
  //    localStorage (which lives in the Tauri data dir on disk) is
  //    shared across the wdio worker processes within a single CI
  //    run -- so an earlier spec's AND-composition test (r2-filters)
  //    leaves `status=[open] priority=[P1]` persisted, and the next
  //    spec's first `bd list` query is then `bd list --all --status
  //    open --priority 1 --json`. That narrower query never resolves
  //    within 150s on the CI runner (Dolt's hot cache from the
  //    previous spec's subprocess apparently wedges the new one),
  //    so the first-row wait times out. Clicking `filter-clear-all`
  //    BEFORE the row wait is a no-op when no filter is active, and
  //    when a filter IS persisted it both clears the in-memory store
  //    AND writes the empty state back to localStorage (zustand
  //    persist middleware) so this spec's `bd list` (and the next
  //    spec's) fires with the empty filter. The clearAll click
  //    happens before the row wait intentionally: if the row wait
  //    times out anyway, the filter has still been cleared, so the
  //    NEXT spec starts clean.
  const clearAll = await $('[data-testid="filter-clear-all"]')
  if (await clearAll.isExisting()) {
    console.log(
      `[e2e:${specLabel}] clearing persisted filter (filter-clear-all exists)`
    )
    await clearAll.click()
    // Give the persisted clear a beat to flush before we hand off;
    // the React commit + the persist write are async.
    await browser
      .waitUntil(
        async () =>
          (await clearAll.isExisting()) && !(await clearAll.isDisplayed()),
        {
          timeout: 5_000,
          interval: 100,
          timeoutMsg: 'clearAll did not disappear',
        }
      )
      .catch(() => {
        // Best-effort: if the chip doesn't disappear (e.g. layout
        // quirk), the click still fired and the store is cleared.
      })
  }

  // 6. Wait for at least one issue row to mount before handing off.
  //    The budget must exceed the app's 120s `bd list` subprocess
  //    timeout so a slow first Dolt cold-start query under CI
  //    still resolves in time; steady-state is ~1-2s.
  const firstRow = await $('[data-testid="issue-row"]')
  await firstRow.waitForDisplayed({ timeout: 150_000 })

  // Diagnostic: log the total count the footer reports and the
  // rendered row count. Specs that need the "full fixture"
  // assertion read the footer; this log makes a mismatch (e.g.
  // footer says 17 but the fixture seeded 25) visible in the CI
  // log without waiting for the assertion to time out.
  const footerText = await browser.execute(
    () =>
      document.querySelector('[data-testid="list-footer"]')?.textContent ?? null
  )
  const renderedRowCount = (await $$('[data-testid="issue-row"]')).length
  console.log(
    `[e2e:${specLabel}] post-open: footer="${String(footerText)}" renderedRows=${renderedRowCount}`
  )
}

/**
 * Read an issue's field from the TanStack Query cache via the
 * page-context `queryClient` handle (exposed by `src/main.tsx`
 * under `import.meta.env.VITE_E2E === '1'`). Returns `null` when
 * the cache doesn't have the issue yet (spec needs to wait) or
 * when the handle isn't exposed (production build — would be a
 * test-environment misconfiguration).
 *
 * The cache key shape is `['beads', 'list', cwd]` where `cwd` is
 * the absolute path of the active workspace. We don't take `cwd`
 * as a parameter and instead iterate every list cache variant:
 * the active workspace's `cwd` is a runtime concern (localStorage
 * / workspace-switcher), and reading from any variant where the
 * issue exists is sufficient for the test's purpose (the spec is
 * asserting "this issue's field changed in the cache" — not
 * "this issue's field changed in the *active workspace's*
 * cache", which would just be an implementation detail of
 * `useWorkspaceList`). Falling back to iterating all list caches
 * makes the helper robust against fixture-path churn (e.g.
 * `/tmp` vs `/private/tmp` on macOS).
 *
 * The list cache stores `Issue[]` so we return either the
 * requested field (`status`, `priority`, …) or the whole issue.
 */
export interface CachedIssueLike {
  id: string
  status?: unknown
  priority?: unknown
  title?: unknown
}

export async function getCachedIssue(
  issueId: string
): Promise<CachedIssueLike | null> {
  return browser.execute((id: string) => {
    // The handle is set by `src/main.tsx` when
    // `import.meta.env.VITE_E2E === '1'`. In a production build
    // it's absent and the helper returns `null` — the spec should
    // fail with a clear "E2E handle not exposed" message rather
    // than a generic timeout.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (globalThis as any).__collierQueryClient__ as
      | {
          getQueryCache: () => {
            getAll: () => {
              queryKey: readonly unknown[]
              state: { data: unknown }
            }[]
          }
        }
      | undefined
    if (!client) return null
    const queries = client.getQueryCache().getAll()
    for (const q of queries) {
      const key = q.queryKey
      // The list cache is `['beads', 'list', ...]` — see
      // `src/store/issue-filter-store.ts` and the
      // `useQuery({ queryKey: ['beads', 'list', cwd, filters] })`
      // call in `IssueListView.tsx`. The show cache is
      // `['beads', 'show', cwd, id]` — both carry the same Issue
      // payload, so we accept either.
      const isBeadsList =
        Array.isArray(key) && key[0] === 'beads' && key[1] === 'list'
      const isBeadsShow =
        Array.isArray(key) && key[0] === 'beads' && key[1] === 'show'
      if (!isBeadsList && !isBeadsShow) continue
      const data = q.state.data as
        | CachedIssueLike[]
        | CachedIssueLike
        | undefined
      if (Array.isArray(data)) {
        const match = data.find(i => i.id === id)
        if (match) return match
      } else if (data && typeof data === 'object' && data.id === id) {
        return data
      }
    }
    return null
  }, issueId)
}
