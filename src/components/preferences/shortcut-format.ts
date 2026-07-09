import { getPlatform } from '@/hooks/use-platform'

/**
 * Formats a shortcut string for display with nice symbols.
 * Converts "CommandOrControl+Shift+." to "⌘⇧." on macOS or "Ctrl+Shift+." on other platforms.
 *
 * Extracted from `ShortcutPicker.tsx` so the visual mapping is
 * unit-testable without rendering the component. The component
 * imports and calls this same function for its visible label.
 *
 * NOTE: a pre-existing substring-matching ordering quirk means
 * `Backslash` collides with `Slash` (yielding `Back/`) and
 * `Backquote` collides with `Quote` (yielding `Back'`). Those are
 * out of scope for this coverage PR — the formatter has worked
 * that way since the picker was introduced and changing it now
 * would shift visible labels for any user who happens to have a
 * shortcut bound to either name.
 */
export function formatShortcutForDisplay(shortcut: string): string {
  const isMac = getPlatform() === 'macos'

  let formatted = shortcut
    // Handle CommandOrControl first
    .replace(/CommandOrControl/gi, isMac ? '⌘' : 'Ctrl')
    .replace(/CmdOrCtrl/gi, isMac ? '⌘' : 'Ctrl')
    // Then handle individual modifiers
    .replace(/Command/gi, '⌘')
    .replace(/Control/gi, isMac ? '⌃' : 'Ctrl')
    .replace(/Ctrl/gi, isMac ? '⌃' : 'Ctrl')
    .replace(/Shift/gi, isMac ? '⇧' : 'Shift')
    .replace(/Alt/gi, isMac ? '⌥' : 'Alt')
    .replace(/Super/gi, isMac ? '⌘' : 'Win')
    // Handle common key names
    .replace(/Period/gi, '.')
    .replace(/Comma/gi, ',')
    .replace(/Slash/gi, '/')
    .replace(/Backslash/gi, '\\')
    .replace(/BracketLeft/gi, '[')
    .replace(/BracketRight/gi, ']')
    .replace(/Semicolon/gi, ';')
    .replace(/Quote/gi, "'")
    .replace(/Backquote/gi, '`')
    .replace(/Minus/gi, '-')
    .replace(/Equal/gi, '=')
    .replace(/Space/gi, 'Space')
    .replace(/Enter/gi, '↵')
    .replace(/Escape/gi, 'Esc')
    .replace(/Backspace/gi, '⌫')
    .replace(/Delete/gi, '⌦')
    .replace(/ArrowUp/gi, '↑')
    .replace(/ArrowDown/gi, '↓')
    .replace(/ArrowLeft/gi, '←')
    .replace(/ArrowRight/gi, '→')
    .replace(/Tab/gi, '⇥')

  // On Mac, join with no separator for modifier symbols
  if (isMac) {
    // Replace + between symbols with nothing for compact display
    formatted = formatted.replace(/\+/g, '')
  }

  return formatted
}

/**
 * Converts a KeyboardEvent to a shortcut string format that Tauri understands.
 * Returns null if no valid shortcut (e.g., just a modifier key).
 *
 * Extracted from `ShortcutPicker.tsx` so the keyboard-to-shortcut
 * mapping is unit-testable without rendering the capture-mode
 * `useEffect`. The component imports and calls this same function
 * inside `handleKeyDown`.
 */
export function keyEventToShortcut(e: KeyboardEvent): string | null {
  // Don't capture if only modifier keys are pressed
  const modifierKeys = ['Control', 'Shift', 'Alt', 'Meta', 'ContextMenu', 'OS']
  if (modifierKeys.includes(e.key)) {
    return null
  }

  // Build the shortcut string
  const parts: string[] = []

  // Use CommandOrControl for cross-platform compatibility
  if (e.metaKey || e.ctrlKey) {
    parts.push('CommandOrControl')
  }
  if (e.shiftKey) {
    parts.push('Shift')
  }
  if (e.altKey) {
    parts.push('Alt')
  }

  // Must have at least one modifier for a global shortcut
  if (parts.length === 0) {
    return null
  }

  // Map key to Tauri-compatible format
  let key = e.code

  // Handle special keys
  if (key.startsWith('Key')) {
    key = key.slice(3) // KeyA -> A
  } else if (key.startsWith('Digit')) {
    key = key.slice(5) // Digit1 -> 1
  } else if (key.startsWith('Numpad')) {
    key = 'Num' + key.slice(6) // Numpad1 -> Num1
  }

  parts.push(key)

  return parts.join('+')
}
