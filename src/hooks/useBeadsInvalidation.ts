import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { listen } from '@tauri-apps/api/event'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import { useWorkspaceStore } from '@/store/workspace-store'

/**
 * Hook that wires the Tauri-side `.beads/` fs-watch to TanStack Query.
 *
 * Listens for the `beads-data-changed` event emitted by the Rust watcher
 * (src-tauri/src/beads/watcher.rs) and invalidates the `['beads']` query
 * key so every active beads query refetches against fresh disk state.
 *
 * Also re-invalidates on `window` focus, so swapping back to the app
 * catches changes made in an external editor or CLI.
 *
 * A "data refreshed" toast is shown on every invalidation, but debounced
 * to at most one toast per second to avoid spamming the user during
 * bursty file activity (e.g. `bd sync` rewriting the JSONL).
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

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['beads'] })
      showRefreshToast()
    }

    listen<{ repo_path: string; timestamp: number }>(
      'beads-data-changed',
      event => {
        logger.debug('beads-data-changed event received', {
          repo_path: event.payload.repo_path,
        })
        // Drop events from a different workspace than the one
        // currently active. Single-workspace today, but the contract
        // is in place for the v1.1 multi-workspace work (the Rust
        // watcher already filters at the source — this is a
        // belt-and-braces FE filter so cross-workspace invalidation
        // can't sneak in via a misrouted event). Per AGENTS.md: read
        // store state via `getState()` inside the callback so the
        // effect doesn't have to re-subscribe on repo changes.
        const activeRepoPath = useWorkspaceStore.getState().repoPath
        if (event.payload.repo_path !== activeRepoPath) {
          return
        }
        invalidate()
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
      logger.debug('window focus — invalidating beads queries')
      invalidate()
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
