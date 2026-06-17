/**
 * Global keyboard shortcut registration hook for the beads namespace.
 *
 * Supports single-key shortcuts (e.g. `"j"`, `"o"`, `"/"`) and
 * two-key leader-key combos (e.g. `"g+i"`, `"g+r"`). For a combo
 * like `"g+i"`, the user presses `g` first, then `i` within 1 second.
 *
 * The hook skips events whose `target` is an `<input>`, `<textarea>`,
 * or a `contenteditable` element — typing in a search box must not
 * trigger a navigation shortcut.
 *
 * ponytail: closures over `shortcuts` and `enabled` re-run the effect
 * on prop changes; this is the canonical React pattern. A ref-based
 * "latest props" ref would shave one re-subscribe per render, but
 * the keys-change-cost (a single add/removeEventListener pair) is
 * well below the noise floor for a header-bar hook.
 */
import { useEffect } from 'react'

export type ShortcutHandler = (e: KeyboardEvent) => void

export interface ShortcutMap {
  /**
   * Map of shortcut combo → handler. Single keys (e.g. `"j"`, `"o"`)
   * and leader-key combos (e.g. `"g+i"`, `"g+r"`) share the same key
   * space; the hook detects the leader state by timing.
   */
  [combo: string]: ShortcutHandler
}

const LEADER_TIMEOUT_MS = 1000

/**
 * Register global keyboard shortcuts.
 *
 * Two-key combos (e.g. `"g+i"`) require pressing the first key (`g`)
 * then the second key (`i`) within {@link LEADER_TIMEOUT_MS}.
 * Single-key combos are just the key (`"j"`, `"o"`, `"/"`, `?`, etc.).
 *
 * Shortcuts are suppressed when focus is in an `<input>`,
 * `<textarea>`, or `contenteditable` element. The hook attaches a
 * `keydown` listener to `window` and removes it on unmount.
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutMap,
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) return

    let lastKey: string | null = null
    let lastKeyTime = 0

    const handler = (e: KeyboardEvent) => {
      // Skip when typing in a text input/textarea/contenteditable.
      // `isContentEditable` is the documented DOM check for the
      // `contenteditable` attribute, and `tagName` for the rest.
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return
        }
      }

      const now = Date.now()
      const key = e.key.toLowerCase()
      const withinLeaderWindow =
        lastKey !== null && now - lastKeyTime < LEADER_TIMEOUT_MS
      const combo = withinLeaderWindow ? `${lastKey}+${key}` : key

      const callback = shortcuts[combo] ?? shortcuts[key]
      if (callback) {
        e.preventDefault()
        callback(e)
        lastKey = null
      } else {
        // No match — remember the key as a potential leader for the
        // next keystroke. The 1s timeout is checked above so a
        // subsequent key past the window starts a fresh single-key
        // lookup.
        lastKey = key
        lastKeyTime = now
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [shortcuts, enabled])
}
