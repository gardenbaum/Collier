import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { listen } from '@tauri-apps/api/event'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import { useWorkspaceStore } from '@/store/workspace-store'

/**
 * Hook that surfaces the legacy `beads-data-changed` Tauri event
 * as a "Data refreshed" toast.
 *
 * R10 split the broadcast event into targeted per-issue events
 * (`beads-issue-created`, `beads-issue-updated`,
 * `beads-issue-deleted`) handled by `useBeadsRealtimeSync`. The
 * watcher still emits `beads-data-changed` for every JSONL touch
 * because the toast is a useful UX cue even when the targeted
 * patch is invisible to the user (e.g. a comment added to an
 * issue whose drawer is closed).
 *
 * What this hook does:
 *  - Listens for `beads-data-changed` and surfaces a debounced
 *    toast (max 1/sec to avoid spamming during bursty activity).
 *  - Re-fires the same toast on window focus so swapping back to
 *    the app catches changes made in an external editor.
 *
 * What this hook deliberately does NOT do anymore:
 *  - Invalidate the `['beads']` query key. R10 moved that
 *    responsibility to `useBeadsRealtimeSync`, which scopes the
 *    invalidation to the affected rows (or to the broad key on
 *    the one-shot `beads-data-reset` first-observation event).
 */
export function useBeadsInvalidation(): void {
  const { t } = useTranslation()
  // queryClient is the singleton provided by QueryClientProvider; it is
  // stable for the provider's lifetime, so capturing it in the effect
  // closure is safe. `useQueryClient` is the canonical TanStack Query
  // pattern (per AGENTS.md: "read queryClient via useQueryClient()").
  const queryClient = useQueryClient()

  // Refs survive re-renders without re-running the effect, so we don't
  // tear down and re-create the listener on every parent render. The
  // timer-ref type follows the explicit rule exception for timer handles.
  const lastToastAtRef = useRef<number>(0)
  const pendingToastRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let isMounted = true
    let unlisten: (() => void) | null = null

    const showRefreshToast = () => {
      const now = Date.now()
      const elapsed = now - lastToastAtRef.current
      const message = t('beads.dataRefreshed', 'Data refreshed')
      if (elapsed >= 1000) {
        // Outside the debounce window — fire immediately
        lastToastAtRef.current = now
        toast.info(message)
        return
      }
      // Inside the window — schedule a single trailing toast
      if (pendingToastRef.current !== null) return
      pendingToastRef.current = setTimeout(() => {
        pendingToastRef.current = null
        lastToastAtRef.current = Date.now()
        toast.info(message)
      }, 1000 - elapsed)
    }

    listen<{ repo_path: string; timestamp: number }>(
      'beads-data-changed',
      event => {
        logger.debug('beads-data-changed event received', {
          repo_path: event.payload.repo_path,
        })
        // Drop events from a different workspace than the one
        // currently active. The Rust watcher already filters at
        // the source (it carries the repo_path of the repo it
        // was attached to); this is a belt-and-braces FE filter
        // so cross-workspace invalidation can't sneak in via a
        // misrouted event. Per AGENTS.md: read store state via
        // `getState()` inside the callback so the effect doesn't
        // have to re-subscribe on repo changes.
        const activeRepoPath = useWorkspaceStore.getState().repoPath
        if (event.payload.repo_path !== activeRepoPath) {
          return
        }
        // R10: the broad query invalidation has moved to
        // `useBeadsRealtimeSync` (gated on the targeted
        // per-issue events). All this hook does now is surface
        // the toast. We still hold the queryClient reference
        // because the focus-handler below keeps using it (the
        // focus path is the one place where a broad invalidate
        // is still appropriate — see the comment on
        // `handleFocus`).
        showRefreshToast()
      }
    )
      .then(unlistenFn => {
        if (!isMounted) {
          unlistenFn()
        } else {
          unlisten = unlistenFn
        }
      })
      .catch(error => {
        logger.error('Failed to setup beads-data-changed listener', { error })
      })

    const handleFocus = () => {
      // Window focus is the legitimate "I don't know what
      // changed while I was away, just refetch everything"
      // trigger. External editors, sibling shells, or sync
      // hooks all bypass the watcher (they don't go through
      // Collier's IPC), so the only signal we get on return is
      // the focus event. The targeted per-issue patches are
      // nice-to-have while the window is visible; the focus
      // path is the safety net for everything else.
      logger.debug('window focus — invalidating beads queries')
      queryClient.invalidateQueries({ queryKey: ['beads'] })
      showRefreshToast()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      isMounted = false
      if (unlisten) {
        unlisten()
      }
      window.removeEventListener('focus', handleFocus)
      if (pendingToastRef.current !== null) {
        clearTimeout(pendingToastRef.current)
        pendingToastRef.current = null
      }
    }
  }, [queryClient, t])
}
