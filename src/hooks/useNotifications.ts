/**
 * Hook for sending desktop notifications from the beads namespace.
 *
 * Wraps the Tauri `send_native_notification` IPC in a stable
 * `useCallback` so consumers can list it in a `useEffect` dep array
 * without re-subscribing on every render. The callback is
 * best-effort: an error response from Rust (or a thrown IPC error)
 * is silently swallowed because the UI does not need to know a
 * notification failed to display.
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
      const result = await commands.sendNativeNotification(title, body)
      if (result.status === 'error') {
        // best-effort; the UI doesn't need to fail when the
        // notification subsystem is unavailable
        return
      }
    } catch {
      // best-effort; swallow IPC errors silently
    }
  }, [])
}
