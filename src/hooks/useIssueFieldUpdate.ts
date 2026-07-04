/**
 * useIssueFieldUpdate — generic optimistic-update mutation hook
 * for `commands.bdUpdate`. Single source of truth for the
 * "patch every cached list variant + the show slot, revert on
 * error, reconcile on success" pattern shared by every inline
 * edit cell on an issue row (status / priority / assignee /
 * description).
 *
 * Both `InlineIssueEdit` (the hover-to-edit overlay selects) and
 * `InlineDescriptionEdit` (the click-to-edit textarea) used to
 * define their own `useMutation` with this exact lifecycle. Four
 * jscpd-reported clone pairs (29L/183T + 18L/75T + 14L/109T +
 * 23L/97T) collapsed to one hook after the extraction.
 *
 * ponytail: optimistic-update strategy. The issue list view
 * keys its query as `['beads', 'list', cwd, filters]` — the
 * `filters` segment carries the active sidebar selection, so a
 * query exists for EVERY (status, priority, type, label,
 * assignee) combination the user has visited, not just one
 * cache slot. Patching only `['beads', 'list', cwd]` (no
 * filters) leaves the rendered list stale until the watcher
 * tick reconciles, which is exactly what the r3-inline-edit E2E
 * observed as "row X status never updated to open
 * optimistically". We instead walk every list cache variant for
 * this cwd and patch each one in place. The detail drawer
 * (`['beads', 'show', cwd, issueId]`) is single-keyed, so it
 * patches as before.
 *
 * The watcher tick (which always fires after a successful bd
 * write) will refetch every list variant and confirm the
 * optimistic value. On mutation error, we revert every patch we
 * made and toast a message via `formatError`.
 *
 * Callers supply two functions so the generic hook stays
 * domain-agnostic:
 *
 *   - `buildInput(value)` — translate the typed payload into a
 *     minimal `UpdateInput`. The "minimal" part matters: sending
 *     the full struct would cause the CLI to write a no-op
 *     history entry for every unchanged field.
 *
 *   - `applyToIssue(issue, value)` — translate the typed
 *     payload into the matching field on the `Issue` cache
 *     entry. The `Issue` and `UpdateInput` shapes are not
 *     symmetric (e.g. `assignee` on Input vs `owner` on Issue),
 *     so the caller owns the rename.
 *
 * Both functions are passed fresh on every render. The React
 * Compiler memoises the mutation hook for us, so callers don't
 * need to wrap them in `useCallback` / `useMemo`.
 *
 * State onion (per AGENTS.md):
 *   - Optimistic cache patch → TanStack Query `queryClient`
 *   - `bd update` IPC call → TanStack Query `useMutation`
 *   - No Zustand needed.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { commands } from '@/lib/tauri-bindings'
import type { Issue, UpdateInput } from '@/lib/bindings'
import { logger } from '@/lib/logger'
import { formatError } from '@/lib/error-format'

/**
 * Snapshot returned from `onMutate` and replayed in `onError`
 * to roll back the optimistic patch. Typed loosely to match
 * what TanStack's `MutationOptions` infers for `context` (which
 * is `unknown` at the public boundary even though we own the
 * shape end-to-end — see the cast in `onError`).
 */
export interface IssueFieldUpdateContext {
  /** Every list-variant cache entry we patched, keyed by its
   *  full query key, with its pre-update payload. The key set
   *  is whatever `getQueriesData({ queryKey: ['beads', 'list',
   *  cwd] })` matched at onMutate time — typically several
   *  variants when the user has toggled multiple sidebar
   *  filters. */
  previousLists: [readonly unknown[], Issue[] | undefined][]
  /** The single-keyed show slot, or undefined when the detail
   *  drawer was never mounted (we still patch the list
   *  variants; the absence is fine). */
  previousShow: Issue | undefined
}

export interface UseIssueFieldUpdateArgs<V> {
  /** Repository root — passed to `commands.bdUpdate`. */
  cwd: string
  /** The id of the issue being mutated. */
  issueId: string
  /** Translate the typed payload into the minimal-diff
   *  `UpdateInput` that bd writes. Only the field the user just
   *  changed should be set; sending the full struct would
   *  trigger a no-op history entry per unchanged field. */
  buildInput: (value: V) => UpdateInput
  /** Translate the typed payload into the matching field on
   *  the cached `Issue`. Note the `Issue` and `UpdateInput`
   *  shapes are not symmetric — e.g. assignee on Input maps to
   *  `owner` on Issue — so the caller owns the rename. */
  applyToIssue: (issue: Issue, value: V) => Issue
  /** Optional override for the `logger.error` message on
   *  mutation error. Defaults to a generic phrase; callers
   *  that want a more diagnostic label (e.g. "description
   *  update failed") can set it. */
  errorLogMessage?: string
  /** Optional fallback string for the toast when `formatError`
   *  can't extract a human message. Defaults to a generic
   *  "Failed to update issue."; callers that want to brand the
   *  fallback (e.g. "Failed to update description.") can set
   *  it. */
  errorFallback?: string
}

/**
 * Generic TanStack mutation hook for `commands.bdUpdate` with
 * the standard optimistic-patch lifecycle. Returns the
 * `UseMutationResult` directly so callers can fire `.mutate`
 * (fire-and-forget), `.mutateAsync` (awaitable), or read
 * `isPending` / `isError` / `error` / `data`.
 */
export function useIssueFieldUpdate<V>({
  cwd,
  issueId,
  buildInput,
  applyToIssue,
  errorLogMessage = 'issue field update failed',
  errorFallback = 'Failed to update issue.',
}: UseIssueFieldUpdateArgs<V>) {
  const queryClient = useQueryClient()

  return useMutation<Issue, unknown, V, IssueFieldUpdateContext>({
    mutationFn: async (value: V) => {
      // ponytail: build a minimal UpdateInput — only the field
      // the user just edited. Sending the full struct would
      // cause the CLI to write a no-op history entry for every
      // unchanged field.
      const input = buildInput(value)
      const result = await commands.bdUpdate(cwd, issueId, input)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    onMutate: async (value: V) => {
      // ponytail: cancel any in-flight refetch for every list
      // variant for this cwd BEFORE we patch. Otherwise a stale
      // refetch from another filter combination could overwrite
      // our optimistic value between the patch and the cache
      // write. The detail drawer's query is single-keyed.
      await queryClient.cancelQueries({ queryKey: ['beads', 'list', cwd] })
      await queryClient.cancelQueries({
        queryKey: ['beads', 'show', cwd, issueId],
      })

      const showKey = ['beads', 'show', cwd, issueId]
      const previousShow = queryClient.getQueryData<Issue>(showKey)

      const apply = (issue: Issue): Issue => applyToIssue(issue, value)

      // ponytail: `setQueriesData` returns the POST-update
      // data, not the pre-update snapshot — confirmed in the
      // TanStack source (`queryClient.setQueryData` returns
      // the new value). For the optimistic-patch /
      // revert-on-error pattern we need the pre-update
      // snapshot, so we read it from `getQueriesData` first
      // and feed it to the rollback in `onError`. The filter
      // payloads differ across variants (status, priority,
      // type, label, assignee combinations), so the patch
      // applies correctly whether the user has the
      // unfiltered list, a status=open list, or any other
      // open.
      const previousLists = queryClient.getQueriesData<Issue[]>({
        queryKey: ['beads', 'list', cwd],
      })
      queryClient.setQueriesData<Issue[]>(
        { queryKey: ['beads', 'list', cwd] },
        prev => (prev ? prev.map(i => (i.id === issueId ? apply(i) : i)) : prev)
      )
      if (previousShow) {
        queryClient.setQueryData<Issue>(showKey, apply(previousShow))
      }

      return { previousLists, previousShow }
    },
    onError: (err, _value, context) => {
      // ponytail: revert every cache slot we touched. The
      // context is typed as `unknown` by TanStack; we know
      // the shape because we own onMutate. The cast is the
      // standard TanStack escape hatch for the same reason.
      const ctx = context as IssueFieldUpdateContext | undefined
      if (ctx?.previousLists) {
        for (const [key, prev] of ctx.previousLists) {
          queryClient.setQueryData(key, prev)
        }
      }
      if (ctx?.previousShow) {
        queryClient.setQueryData(
          ['beads', 'show', cwd, issueId],
          ctx.previousShow
        )
      }
      logger.error(errorLogMessage, { err })
      toast.error(formatError(err, errorFallback))
    },
    onSuccess: updated => {
      // ponytail: the watcher will fire beads-data-changed
      // within ~1s and TanStack will refetch every list
      // variant. We also patch them with the
      // freshly-returned issue here so the UI is instantly
      // correct even if the watcher is slow.
      queryClient.setQueriesData<Issue[]>(
        { queryKey: ['beads', 'list', cwd] },
        prev =>
          prev ? prev.map(i => (i.id === updated.id ? updated : i)) : prev
      )
      queryClient.setQueryData<Issue>(['beads', 'show', cwd, issueId], updated)
    },
  })
}
