import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { listen } from '@tauri-apps/api/event'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'

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
  // queryClient is the singleton provided by QueryClientProvider; it is
  // stable for the provider's lifetime, so capturing it in the effect
  // closure is safe. `useQueryClient` is the canonical TanStack Query
  // pattern (per AGENTS.md: "read queryClient via useQueryClient()").
  const queryClient = useQueryClient()

  // Refs survive re-renders without re-running the effect, so we don't
  // tear down and re-create the listener on every parent render.
  const lastToastAtRef = useRef<number>(0)
  const pendingToastRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let isMounted = true
    let unlisten: (() => void) | null = null

    const showRefreshToast = () => {
      const now = Date.now()
      const elapsed = now - lastToastAtRef.current
      if (elapsed >= 1000) {
        // Outside the debounce window — fire immediately
        lastToastAtRef.current = now
        toast.info('Data refreshed')
        return
      }
      // Inside the window — schedule a single trailing toast
      if (pendingToastRef.current !== null) return
      pendingToastRef.current = setTimeout(() => {
        pendingToastRef.current = null
        lastToastAtRef.current = Date.now()
        toast.info('Data refreshed')
      }, 1000 - elapsed)
    }

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['beads'] })
      showRefreshToast()
    }

    listen<{ repo_path: string; timestamp: number }>(
      'beads-data-changed',
      () => {
        logger.debug('beads-data-changed event received')
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
  }, [queryClient])
}
