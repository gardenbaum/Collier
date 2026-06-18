/**
 * useCopyAndFlag — copy a string to the clipboard and surface a
 * transient "flag" set to the same value the user copied, that
 * auto-resets after `resetMs`.
 *
 * The hook is the multi-value cousin of `useCopyToClipboard`:
 * instead of a boolean, it returns a `flag` field that matches
 * the value just copied, so callers can check `flag === cmd` per
 * row when rendering a list of copy buttons. The hook also
 * handles the timer cleanup so callers don't leak a `setTimeout`
 * when the component unmounts during the flag window.
 *
 * Best-effort: a denied clipboard (some webviews) leaves the flag
 * as `null` and returns `success: false`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export function useCopyAndFlag<T>(resetMs = 1500) {
  const [flag, setFlag] = useState<T | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  const copy = useCallback(
    async (text: string, value: T): Promise<{ success: boolean }> => {
      try {
        await navigator.clipboard.writeText(text)
        setFlag(value)
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current)
        }
        timerRef.current = window.setTimeout(() => {
          setFlag(null)
          timerRef.current = null
        }, resetMs)
        return { success: true }
      } catch {
        return { success: false }
      }
    },
    [resetMs]
  )

  return { flag, copy }
}
