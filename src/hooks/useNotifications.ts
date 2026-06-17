/**
 * Hook for sending desktop notifications from the beads namespace.
 *
 * Wraps the Rust `bd_notify` tauri command (task 49) in a stable
 * `useCallback` so consumers can list it in a `useEffect` dep array
 * without re-subscribing on every render. The callback is
 * best-effort: an error response from Rust (or a thrown IPC error)
 * is silently swallowed because the UI does not need to know a
 * notification failed to display.
 *
 * ponytail: a no-op `try/catch` is the entire "best-effort" story.
 * No retry queue, no toast-on-failure — the use case (gate resolved,
 * fs-watch fired) is low-stakes. A retry queue would be premature.
 */
import { useCallback } from 'react'
import { commands } from '@/lib/tauri-bindings'

/**
 * Returns a stable callback that fires a desktop notification.
 * Errors are intentionally swallowed — see the file docstring.
 */
export function useNotifications(): (
  title: string,
  body: string
) => Promise<void> {
  return useCallback(async (title: string, body: string) => {
    try {
      await commands.bdNotify(title, body)
    } catch {
      // best-effort; the UI doesn't need to fail when the
      // notification subsystem is unavailable
    }
  }, [])
}
