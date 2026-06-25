/**
 * useDialogA11y — focus trap + restoration + Escape handling for the
 * modal dialogs (IssueDetailDrawer, IssueCreateForm, IssueUpdatePanel,
 * SettingsPanel).
 *
 * Three responsibilities:
 *
 *   1. **Initial focus.** Move focus to `initialFocusRef.current` when
 *      the dialog mounts; fall back to the first interactive element
 *      inside the panel.
 *
 *   2. **Focus trap.** Tab / Shift+Tab inside the panel cycle through
 *      the panel's focusables — they never escape the dialog. This is
 *      the contract `aria-modal="true"` implies: AT users should not
 *      be able to interact with the page behind the dialog.
 *
 *   3. **Focus restoration.** On unmount, restore focus to the element
 *      that opened the dialog (or `null` to fall back on the body).
 *      The caller passes the previously-focused element via
 *      `triggerRef`, which the hook queries on mount.
 *
 * The hook also wires Escape to `onClose` so the dialog responds to the
 * standard "press Escape to close" affordance without each dialog
 * having to register its own listener.
 *
 * Implementation notes:
 *
 *   - We rely on `document.activeElement` on mount to capture the
 *     trigger. The caller doesn't have to pass a ref — we read
 *     directly from the DOM. The trade-off: callers MUST mount the
 *     hook AFTER they've rendered the dialog's trigger so the
 *     trigger exists at hook-mount time. In practice every caller
 *     uses a render-time `useEffect`, which fires after the trigger
 *     is in the DOM, so this is fine.
 *
 *   - The focusable selector matches a[href], button, textarea, input,
 *     select, and [tabindex]:not([tabindex="-1"]). This matches the
 *     IssueDetailDrawer's existing FOCUSABLE_SELECTOR.
 *
 *   - We listen on `window` (not the panel) for keydown so the
 *     listener survives the panel being scrolled (where a panel-
 *     scoped listener could miss keystrokes fired from inside the
 *     scrolled viewport).
 */
import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface UseDialogA11yOptions {
  /** Panel element ref — focus is trapped within this element. */
  panelRef: React.RefObject<HTMLElement | null>
  /**
   * Element to focus on open. Defaults to the first focusable inside
   * the panel; fall back to the panel itself.
   */
  initialFocusRef?: React.RefObject<HTMLElement | null>
  /**
   * Called when Escape is pressed inside the dialog. The caller is
   * expected to unmount the dialog (which restores focus via this
   * hook's cleanup).
   */
  onClose: () => void
  /**
   * When `false`, the focus trap is disabled (the dialog is still
   * open in the ARIA sense, but focus is allowed to roam). Used
   * during the closing transition if any. Default: true.
   */
  enabled?: boolean
}

export function useDialogA11y({
  panelRef,
  initialFocusRef,
  onClose,
  enabled = true,
}: UseDialogA11yOptions): void {
  // ponytail: capture the trigger element on mount so we can
  // restore focus when the dialog unmounts. `useRef(() => …)` would
  // also work but `useRef(null)` + a manual write keeps the hook
  // compatible with React 18's strict-mode double-invoke (the lazy
  // initializer would otherwise fire twice and discard the first
  // capture).
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!enabled) return undefined
    // Snapshot the trigger on mount. The dialog itself is now in
    // the DOM, but we explicitly grab `document.activeElement` which
    // is whatever the user interacted with right before opening
    // (typically the "New issue" button in the header).
    triggerRef.current = document.activeElement as HTMLElement | null

    // Initial focus: prefer the caller's `initialFocusRef`, then the
    // first focusable inside the panel, then the panel itself.
    const panel = panelRef.current
    const focusFirst = (): void => {
      const explicit = initialFocusRef?.current
      if (explicit !== null && explicit !== undefined) {
        explicit.focus()
        return
      }
      if (panel !== null) {
        const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
        if (first !== null) {
          first.focus()
          return
        }
        panel.focus()
      }
    }
    // Defer one frame so React has committed the panel and the
    // first focusable is reachable via `querySelector`. Without
    // this, panels that mount the first focusable inside a portal
    // miss the query and the focus lands on the panel itself.
    const initialFrame = requestAnimationFrame(focusFirst)

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      if (panel === null) return
      const focusables = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusables.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusables.item(0)
      const last = focusables.item(focusables.length - 1)
      const active = document.activeElement as HTMLElement | null
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      cancelAnimationFrame(initialFrame)
      window.removeEventListener('keydown', handleKeyDown)
      // Restore focus to the trigger on unmount. Guard against the
      // element having been removed from the DOM (a common race when
      // the trigger is inside a list that re-renders).
      const trigger = triggerRef.current
      if (
        trigger !== null &&
        document.body.contains(trigger) &&
        typeof trigger.focus === 'function'
      ) {
        trigger.focus()
      }
    }
  }, [panelRef, initialFocusRef, onClose, enabled])
}
