/**
 * useCopyToClipboard — copy a string to the clipboard and surface a
 * transient "copied" flag that auto-resets after `resetMs`.
 *
 * The hook handles the timer cleanup so callers don't leak a
 * `setTimeout` when the component unmounts during the "copied"
 * window. Best-effort: a denied clipboard (some webviews) leaves
 * `copied` as `false` and returns `success: false`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export function useCopyToClipboard(resetMs = 1500) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  // Clear any pending timer on unmount so React doesn't log a
  // "state update on unmounted component" warning if the user
  // navigates away within the reset window.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  const copy = useCallback(
    async (text: string): Promise<{ success: boolean }> => {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current)
        }
        timerRef.current = window.setTimeout(() => {
          setCopied(false)
          timerRef.current = null
        }, resetMs)
        return { success: true }
      } catch {
        return { success: false }
      }
    },
    [resetMs]
  )

  return { copied, copy }
}
