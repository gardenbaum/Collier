/**
 * useStatusCatalog — read the merged built-in + custom status set
 * for the active workspace.
 *
 * M6 R-Gates/Custom-Status: the constitution (`docs/CONSTITUTION.md §3`)
 * forbids hardcoding the 5 built-in statuses. This hook is the
 * single read surface for that contract — every component that
 * renders a status picker (sidebar filter chips, inline status edit,
 * issue update panel, status overview cards) goes through here so a
 * workspace with `bd config set status.custom "review:wip"`
 * surfaces the custom value without code changes.
 *
 * The catalog itself is fetched lazily — the query is gated on
 * `cwd !== null` so the bootstrap screen never tries to query a
 * repo path. While the catalog is loading, components that need a
 * list of statuses fall back to a hardcoded `DEFAULT_STATUS_NAMES`
 * (the five built-ins) so the UI is never blank. The fallback
 * matches the v1 lifecycle order so the user's mental model is
 * unchanged during the <100ms it usually takes to load.
 *
 * The hook returns:
 *   - `catalog`: the merged catalog (built-in + custom + ordered
 *     `statusNames` list) when loaded.
 *   - `statusNames`: the flat ordered list. Falls back to the v1
 *     built-ins while the query is pending.
 *   - `isLoading`: true while the initial fetch is in flight.
 *   - `error`: the typed error from the failed fetch, or null.
 *
 * When the active workspace changes, TanStack Query keys the cache
 * by `['beads', 'statuses', cwd]` so a workspace switch refetches
 * the catalog (a workspace with `status.custom = "review:wip"` is
 * genuinely different data from one without). The cache survives
 * tab switches / re-mounts within a workspace via the default
 * 5-minute `staleTime`.
 */
import { useQuery } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import type { StatusCatalog, StatusMeta } from '@/lib/bindings'

/**
 * Fallback status list when the catalog query is pending or has
 * failed. Matches the v1 lifecycle order so the user's mental
 * model of the chip layout is unchanged during the brief window
 * before the catalog resolves.
 */
const DEFAULT_STATUS_NAMES: readonly string[] = [
  'open',
  'in_progress',
  'blocked',
  'deferred',
  'closed',
] as const

/** Fallback metadata for the v1 built-ins while the catalog loads. */
const DEFAULT_BUILTIN_STATUSES: readonly StatusMeta[] =
  DEFAULT_STATUS_NAMES.map(
    name =>
      ({
        name,
        category:
          name === 'closed' ? 'done' : name === 'deferred' ? 'frozen' : 'wip',
        icon: null,
        description: null,
        isBuiltin: true,
      }) as StatusMeta
  )

/**
 * Return shape of [`useStatusCatalog`]. Every consumer reads
 * `statusNames` (the flat ordered list) directly; the full
 * catalog is only needed by callers that distinguish built-in
 * from custom (the status overview cards, for example).
 */
export interface StatusCatalogState {
  /** Full merged catalog — `undefined` while loading. */
  catalog: StatusCatalog | undefined
  /**
   * Flat ordered status names. Always defined: falls back to the
   * v1 built-ins while the catalog query is pending so the UI is
   * never blank.
   */
  statusNames: readonly string[]
  /** Built-in subset, even during loading (fallback). */
  builtin: readonly StatusMeta[]
  /** True only on the initial fetch. */
  isLoading: boolean
  /** Typed error from a failed fetch, or null. */
  error: unknown
}

/**
 * Read the status catalog for `cwd`. Pass `null` to disable the
 * query (e.g. before the workspace is selected). The hook returns
 * the fallback status names during the loading window so consumers
 * never have to special-case "no data yet".
 */
export function useStatusCatalog(cwd: string | null): StatusCatalogState {
  const query = useQuery({
    queryKey: ['beads', 'statuses', cwd],
    queryFn: async () => {
      if (cwd === null) {
        // Defensive — should be guarded by `enabled` below, but the
        // explicit throw keeps the contract obvious in stack traces.
        throw new Error('useStatusCatalog: cwd is null')
      }
      const result = await commands.bdStatuses(cwd)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    enabled: cwd !== null,
    // Bead catalogs change rarely — 5 minute stale window is fine.
    // The file watcher (R10) doesn't emit a specific catalog
    // change event, so this is the only place the user sees
    // updates without restarting.
    staleTime: 5 * 60 * 1000,
  })

  if (query.data) {
    return {
      catalog: query.data,
      statusNames: query.data.statusNames,
      builtin: query.data.builtin,
      isLoading: query.isLoading,
      error: query.error,
    }
  }

  return {
    catalog: undefined,
    statusNames: DEFAULT_STATUS_NAMES,
    builtin: DEFAULT_BUILTIN_STATUSES,
    isLoading: query.isLoading,
    error: query.error,
  }
}

/**
 * Look up a built-in status meta by name from the catalog, with
 * a defensive fallback when the catalog hasn't loaded or the
 * status isn't in the built-in half.
 *
 * Custom statuses return `undefined` — callers should fall back
 * to the neutral palette + raw label path (see `StatusPill`).
 */
export function findBuiltinStatus(
  catalog: StatusCatalog | undefined,
  name: string
): StatusMeta | undefined {
  if (!catalog) return undefined
  return catalog.builtin.find(s => s.name === name)
}
