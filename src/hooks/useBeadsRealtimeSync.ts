/**
 * useBeadsRealtimeSync — targeted per-issue cache patches.
 *
 * Subscribes to the per-issue events emitted by the Rust watcher
 * (`src-tauri/src/beads/watcher.rs`) and patches the matching
 * TanStack Query cache entries in-place, so external mutations
 * (`bd update …` from a sibling shell, an editor save that
 * rewrites `.beads/issues.jsonl`, a sync hook) flow into the
 * active view in ≤ ~1 s **without** invalidating every beads
 * query.
 *
 * Events consumed:
 *   - `beads-data-reset`     — broad `['beads']` invalidation
 *                              (first observation of a repo, no
 *                              baseline yet on the Rust side)
 *   - `beads-issue-created`  — patch the new issue into every
 *                              cached list variant + show cache
 *   - `beads-issue-updated`  — replace the matching issue in
 *                              every cached list variant + show
 *                              cache
 *   - `beads-issue-deleted`  — remove the issue from every cached
 *                              list variant + drop its show cache
 *
 * The legacy `beads-data-changed` event is handled by
 * `useBeadsInvalidation` (it only surfaces a "Data refreshed"
 * toast now; the broad invalidation has moved here, gated on the
 * targeted events).
 *
 * Sibling to `useBeadsInvalidation` and mounted alongside it
 * inside `MainWindowContent` so every view / drawer benefits
 * without each one re-subscribing.
 */
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { listen } from '@tauri-apps/api/event'
import type { Issue } from '@/lib/bindings'
import { logger } from '@/lib/logger'
import { useWorkspaceStore } from '@/store/workspace-store'

interface BeadsIssuePayload {
  repo_path: string
  issue: Issue
}

interface BeadsIssueDeletedPayload {
  repo_path: string
  issue_id: string
}

interface BeadsDataResetPayload {
  repo_path: string
  count: number
}

/**
 * Patch the matching issue into every cached list variant for
 * `cwd` and update the matching `['beads','show',cwd,id]`
 * cache entry. Used for both `created` and `updated` — the
 * merge semantics are correct for both:
 *
 *   - If the issue ID is already in the cached list, replace
 *     the matching row (handles the case where the watcher
 *     re-sends `created` for an already-known ID, e.g. after
 *     a snapshot reset).
 *   - If the issue ID is NOT in the cached list, append it
 *     (the `created` case).
 *
 * The `show` cache is always overwritten with the freshest
 * payload so a detail drawer already mounted reflects the
 * change instantly.
 */
function patchIssueIntoLists(
  queryClient: ReturnType<typeof useQueryClient>,
  cwd: string,
  issue: Issue
): void {
  queryClient.setQueriesData<Issue[]>(
    { queryKey: ['beads', 'list', cwd] },
    prev => {
      if (!prev) return prev
      const idx = prev.findIndex(i => i.id === issue.id)
      if (idx === -1) {
        return [...prev, issue]
      }
      const next = prev.slice()
      next[idx] = issue
      return next
    }
  )
  queryClient.setQueryData<Issue>(['beads', 'show', cwd, issue.id], issue)
}

/**
 * Remove the matching issue from every cached list variant for
 * `cwd` and drop its dedicated `['beads', 'show', cwd, id]`
 * cache entry so a re-mount refetches from disk.
 */
function removeIssueFromCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  cwd: string,
  issueId: string
): void {
  queryClient.setQueriesData<Issue[]>(
    { queryKey: ['beads', 'list', cwd] },
    prev => (prev ? prev.filter(i => i.id !== issueId) : prev)
  )
  queryClient.removeQueries({ queryKey: ['beads', 'show', cwd, issueId] })
}

export function useBeadsRealtimeSync(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    let isMounted = true
    const unlistenFns: (() => void)[] = []

    const setupListener = async <T>(
      eventName: string,
      handler: (payload: T) => void
    ): Promise<void> => {
      try {
        const unlisten = await listen<T>(eventName, evt => handler(evt.payload))
        if (!isMounted) {
          unlisten()
        } else {
          unlistenFns.push(unlisten)
        }
      } catch (error) {
        logger.error(`Failed to setup ${eventName} listener`, { error })
      }
    }

    // Filter helper: drop events whose `repo_path` doesn't match
    // the active workspace. Uses `getState()` so the effect
    // doesn't have to re-subscribe on repo changes.
    const activeRepoPath = (): string | null =>
      useWorkspaceStore.getState().repoPath

    // ponytail: E2E diagnostic counters under `import.meta.env.VITE_E2E` —
    // see `src/main.tsx` for the gate. Counters track every event
    // the React side processes (or drops on a repo_path mismatch)
    // so a future E2E timeout points at the layer that lost the
    // event without needing to attach a debugger.
    //
    // Returns the bumped counter (or undefined if the diag surface
    // isn't exposed — production builds). The `bump` helper avoids
    // `no-unused-expressions` and `no-non-null-assertion` rules by
    // keeping the conditional inline.
    const bump = (key: string): void => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (globalThis as any).__collierDiag__ as
        | Record<string, number>
        | undefined
      if (d !== undefined) {
        d[key] = (d[key] ?? 0) + 1
      }
    }

    void setupListener<BeadsDataResetPayload>('beads-data-reset', payload => {
      bump('dataReset')
      if (payload.repo_path !== activeRepoPath()) {
        bump('droppedRepoMismatch')
        return
      }
      logger.debug('beads-data-reset event received', {
        count: payload.count,
      })
      queryClient.invalidateQueries({ queryKey: ['beads'] })
    })

    // -- beads-issue-created --
    void setupListener<BeadsIssuePayload>('beads-issue-created', payload => {
      bump('issueCreated')
      if (payload.repo_path !== activeRepoPath()) {
        bump('droppedRepoMismatch')
        return
      }
      patchIssueIntoLists(queryClient, payload.repo_path, payload.issue)
    })

    // -- beads-issue-updated --
    void setupListener<BeadsIssuePayload>('beads-issue-updated', payload => {
      bump('issueUpdated')
      if (payload.repo_path !== activeRepoPath()) {
        bump('droppedRepoMismatch')
        return
      }
      logger.debug('beads-issue-updated', { id: payload.issue.id })
      patchIssueIntoLists(queryClient, payload.repo_path, payload.issue)
    })

    // -- beads-issue-deleted --
    void setupListener<BeadsIssueDeletedPayload>(
      'beads-issue-deleted',
      payload => {
        bump('issueDeleted')
        if (payload.repo_path !== activeRepoPath()) {
          bump('droppedRepoMismatch')
          return
        }
        logger.debug('beads-issue-deleted', { id: payload.issue_id })
        removeIssueFromCaches(queryClient, payload.repo_path, payload.issue_id)
      }
    )

    return () => {
      isMounted = false
      for (const unlisten of unlistenFns) {
        unlisten()
      }
    }
  }, [queryClient])
}
