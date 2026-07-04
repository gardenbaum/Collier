/**
 * useBeadList — read the full bead (issue) list for the active
 * workspace.
 *
 * M2 R5/R6 in the milestone. Both `EpicView` (the collapsible
 * epic tree with progress bars) and `StatusOverviewView` (the
 * per-status card grid) need the full issue set to render — the
 * Rust command passes `--all` so closed issues are visible by
 * default (see `src-tauri/src/beads/list.rs`). Two consumers with
 * identical fetch shape → one hook.
 *
 * The hook returns the raw TanStack Query shape:
 *   - `data`: the issue list when loaded, otherwise `undefined`.
 *   - `isLoading`: true while the initial fetch is in flight.
 *   - `error`: the typed error from the failed fetch, or null.
 *
 * Consumers decide what "no data yet" means for their UI — the
 * epic tree renders a skeleton row, the status grid renders a
 * 5-skeleton card row. Both reads of `data ?? []` collapse to the
 * same shape so the loading skeletons stay consistent across
 * views.
 *
 * **Keyspace note**: the realtime sync + invalidation hooks
 * (`useBeadsRealtimeSync`, `useBeadsInvalidation`) watch the
 * `['beads', 'list', cwd]` 3-segment prefix, and the show cache
 * lives at `['beads', 'show', cwd, id]`. The 4-segment
 * `['beads', 'list', cwd, {}]` key this hook uses is therefore a
 * **sub-query** of the realtime sync keyspace — the
 * `setQueriesData({ queryKey: ['beads', 'list', cwd] })` call in
 * the realtime sync matches it via prefix, so a `created` /
 * `updated` / `deleted` event from the watcher lands on the
 * EpicView / StatusOverviewView cache in ≤1s without the
 * consumers having to subscribe themselves.
 *
 * Same hook is used by `IssueListView`, but that view passes a
 * non-empty filter object (`filters`) so it stays on its own
 * query key (`['beads', 'list', cwd, filters]`) and doesn't share
 * the cache with the overview views — the realtime patch still
 * lands on it via the same 3-segment prefix match.
 */
import { useQuery } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import type { Issue } from '@/lib/bindings'

/**
 * Return shape of [`useBeadList`]. Kept flat — the hook is a thin
 * wrapper over `useQuery` and the consumers (`EpicView`,
 * `StatusOverviewView`) only read `data`, `isLoading`, and
 * `error`. No fallback values: each view renders its own
 * skeleton / empty / error state so the UI stays specific.
 */
export interface BeadListState {
  /** Full issue list — `undefined` while loading or on error. */
  data: Issue[] | undefined
  /** True only on the initial fetch. */
  isLoading: boolean
  /** Typed error from a failed fetch, or null. */
  error: unknown
}

/**
 * Read the full bead list for `cwd`. Pass `null` to disable the
 * query (e.g. before the workspace is selected — the bootstrap
 * flow shows a folder picker, never the beads views).
 *
 * The 4-segment `['beads', 'list', cwd, {}]` query key is
 * intentional: the realtime sync + invalidation hooks key off
 * the 3-segment prefix `['beads', 'list', cwd]` and patch every
 * cached list variant in place, so the empty-filter variant
 * stays in sync without a per-view subscription. `{}` is a
 * stable identity so the key doesn't reshuffle between renders.
 */
export function useBeadList(cwd: string | null): BeadListState {
  return useQuery({
    queryKey: ['beads', 'list', cwd, {}],
    queryFn: async () => {
      // Defensive — `enabled: cwd !== null` below already gates
      // the query, but the explicit throw keeps the contract
      // obvious in stack traces if the gate ever regresses.
      if (cwd === null) {
        throw new Error('useBeadList: cwd is null')
      }
      const result = await commands.bdList(cwd, {})
      if (result.status === 'ok') return result.data
      throw result.error
    },
    enabled: cwd !== null,
  })
}
