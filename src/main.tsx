import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { i18n } from './i18n/config'
import './i18n'
import App from './App'
import { commands } from './lib/tauri-bindings'
import type { Issue, UpdateInput } from './lib/bindings'
import { queryClient } from './lib/query-client'
import { installQueryClient, useWorkspaceStore } from './store/workspace-store'

// Set the `<html lang>` synchronously from the saved preference
// (or the i18n default) so screen readers announce the correct
// language on the first frame. Without this, `index.html`'s
// hardcoded `lang="en"` leaks through for the first paint, then
// the i18n `languageChanged` handler in `i18n/config.ts` updates
// the attribute ~1 frame later. The duplication is intentional:
// we can't trust the i18n event for the boot frame.
const rtlLanguages = ['ar', 'he', 'fa', 'ur']
const initialLng = i18n.language || 'en'
document.documentElement.lang = initialLng
document.documentElement.dir = rtlLanguages.includes(initialLng) ? 'rtl' : 'ltr'

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error(
    'Collier could not mount: #root element is missing from index.html'
  )
}

// Wire the singleton queryClient into the workspace store so
// `switchWorkspace` can drop the old workspace's `['beads']` query
// cache. Must happen before `App` mounts (so the bootstrap path's
// `setRepoPath` calls don't race the install); we do it here at the
// QueryClientProvider boundary.
installQueryClient(queryClient)

// ponytail: E2E hook — expose the queryClient on `window` so the
// wdio specs can read cache state directly via `page-context`
// JavaScript instead of polling DOM attributes. The DOM is a
// *windowed* projection of the cache (`@tanstack/react-virtual`
// only mounts ~15 rows at a time), so polling the DOM for a row
// the virtualizer has unmounted races with the test's `waitUntil`
// loop and times out at 1500 ms even when the watcher already
// patched the cache. Reading from the cache is race-free: the
// queryClient holds every cached issue regardless of what's
// mounted, and the watcher patches it synchronously on the file
// event. The harness gates on `import.meta.env.VITE_E2E === '1'`
// so production builds don't ship a debugging handle. The flag
// is set by the E2E CI workflow via the build-time Vite env (see
// `.github/workflows/ci.yml` — `E2E_TAURI_EXECUTABLE` is the
// adjacent env var; the Vite flag is independent).
if (import.meta.env.VITE_E2E === '1') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).__collierQueryClient__ = queryClient
  // ponytail: diag surface — track every targeted watcher event
  // the React side processes. `useBeadsRealtimeSync` increments
  // these counters from its `beads-issue-updated` / `created` /
  // `deleted` handlers so an E2E failure points at the layer
  // that dropped the event (zero counters = watcher never
  // fired vs. counter incremented but cache not patched = patch
  // logic dropped the event on a repo_path mismatch). Counters
  // are exposed on globalThis under the same VITE_E2E gate as
  // the queryClient handle.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).__collierDiag__ = {
    issueUpdated: 0,
    issueCreated: 0,
    issueDeleted: 0,
    dataReset: 0,
    dataChanged: 0,
    droppedRepoMismatch: 0,
  }
  // ponytail: release-hardening handle — expose the build-time
  // app metadata (name / version / identifier / updater endpoint /
  // pubkey fingerprint) so the E2E suite can pin the bundled
  // `tauri.conf.json` shape without parsing the binary or the
  // filesystem. Backed by `commands.getAppMetadata()` in
  // src-tauri/src/commands/app_metadata.rs; populated async on
  // mount, so an E2E spec that reads it must wait for the
  // `__collierAppMetadataReady` promise to resolve. Gated on
  // the same VITE_E2E flag as the other handles — production
  // builds do NOT ship this surface.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).__collierAppMetadataReady__ = commands
    .getAppMetadata()
    .then(result => {
      if (result.status === 'ok') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(globalThis as any).__collierAppMetadata__ = result.data
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(globalThis as any).__collierAppMetadata__ = null
      }
      return result
    })
    .catch(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).__collierAppMetadata__ = null
      return null
    })
  // ponytail: E2E revertIssue helper — atomic `bd update` for the
  // r3-inline-edit teardown. The previous implementation drove the
  // revert through the inline-edit `<select>` UI surface (the same
  // mutation hook the spec exercises), but that path has two
  // racy failure modes that the `r3 cleanup did not land` flake
  // surfaced on CI run 29383327833:
  //
  //   1. The DOM-based revert dispatches a `change` event on the
  //      row's inline `<select>`. When the `@tanstack/react-virtual`
  //      window has unmounted the row (test 3 opens the detail
  //      drawer; the r3 row can sit outside the 5 + 2*5 overscan
  //      in some scroll / sort states), the React onChange handler
  //      isn't mounted, the dispatch silently no-ops, and the cache
  //      never sees the revert. The previous guard
  //      (`if (!(await row.isExisting())) return`) is the
  //      corresponding deterministic-fail trapdoor.
  //
  //   2. The UI path fires TWO separate mutations (status, then
  //      priority), each with its own optimistic-patch + bd-write +
  //      watcher-reconcile cycle. The bd writes are serialized
  //      behind the `WriteLock` with a 2s acquire timeout; on a
  //      cold CI runner where test 2's mutation is still completing
  //      when `after` runs, the second `bd update` can fail with
  //      `BdError::LockTimeout`, the optimistic patch is reverted,
  //      and the waitUntil polls a cache that never matches the
  //      original fixture.
  //
  // This helper bypasses both: one `bd update` for status +
  // priority (single lock acquisition, single watcher tick), and
  // a synchronous cache patch so the React Query state matches
  // the fixture the moment `revertIssue` resolves. The mutation
  // flow itself is still covered by tests 1 / 2 / 3 — this
  // helper is the test-isolation contract, not a coverage gap.
  //
  // ponytail: production builds MUST NOT expose this — the
  // surface area (workspace cwd + commands.bdUpdate + cache
  // patch) is too privileged to ship outside CI. Same gate as
  // the other `__collier__` handles (`import.meta.env.VITE_E2E`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).__collierRevertIssue__ = async (
    issueId: string,
    fields: { status?: string; priority?: number }
  ): Promise<Issue> => {
    const cwd = useWorkspaceStore.getState().repoPath
    if (cwd === null) {
      throw new Error('__collierRevertIssue__: no active workspace')
    }
    const input: UpdateInput = {}
    if (fields.status !== undefined) input.status = fields.status
    if (fields.priority !== undefined) {
      // IssuePriority is the specta string union "P0".."P4", but
      // bd reads a bare integer 0..4 off the wire. The same dance
      // `useIssueFieldUpdate` does in applyToIssue — see the
      // ponytail in InlineIssueEdit.tsx for the full story.
      input.priority = fields.priority as unknown as UpdateInput['priority']
    }
    const result = await commands.bdUpdate(cwd, issueId, input)
    if (result.status === 'error') {
      throw new Error(
        `__collierRevertIssue__: bdUpdate failed: ${JSON.stringify(result.error)}`
      )
    }
    const updated = result.data
    // ponytail: patch every cached list variant + the show slot
    // in lockstep with `useIssueFieldUpdate.onSuccess`. The
    // watcher tick will re-emit `beads-issue-updated` within ~1s
    // and patch again with the same value, which is a no-op —
    // we just want the React Query state to be immediately
    // consistent with the disk state so the test's `waitUntil`
    // matches on the first poll instead of waiting for the
    // watcher to fire.
    queryClient.setQueriesData<Issue[]>(
      { queryKey: ['beads', 'list', cwd] },
      prev => (prev ? prev.map(i => (i.id === issueId ? updated : i)) : prev)
    )
    queryClient.setQueryData<Issue>(['beads', 'show', cwd, issueId], updated)
    return updated
  }
}

ReactDOM.createRoot(rootElement).render(
  <QueryClientProvider client={queryClient}>
    <App />
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
)
