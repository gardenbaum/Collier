/**
 * IssueDetailDrawer — slide-in drawer that wraps `IssueDetailView`.
 *
 * Renders as a fixed-position overlay so the list behind stays in place
 * and resizable. Closes on backdrop click or on the view's own close
 * button. The drawer is mounted only when `issueId` is non-null, so
 * closing is just "unmount"; no DOM clutter when no issue is open.
 *
 * Accessibility:
 *  - `role="dialog" aria-modal="true"` on the panel.
 *  - On open, focus moves to the panel header's close button.
 *  - Tab / Shift+Tab are trapped between the first and last focusable
 *    elements inside the panel so a keyboard user can't escape into the
 *    dimmed list behind the drawer.
 *  - On close, focus is restored to the element that triggered the open
 *    (typically the row in the list view that was clicked).
 *  - Escape closes the drawer (macOS / Windows modal sheet convention).
 */
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { IssueDetailView } from './issues/IssueDetailView'
import { Button } from '@/components/ui/button'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface IssueDetailDrawerProps {
  cwd: string
  issueId: string
  onClose: () => void
  onOpenIssue?: (id: string) => void
}

export function IssueDetailDrawer({
  cwd,
  issueId,
  onClose,
  onOpenIssue,
}: IssueDetailDrawerProps) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  // Open: capture the previously-focused element (likely the row the
  // user just clicked) and move focus to the close button. The user
  // can Tab forward into the issue body or Shift+Tab back to the close
  // button. Close: restore focus to that element.
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    return () => {
      // On unmount only — not on every effect — restore focus. This
      // runs when the parent sets `selectedIssueId = null` or
      // `repoPath = null`, both of which unmount this component.
      previouslyFocusedRef.current?.focus()
    }
  }, [])

  // Escape closes (matches the macOS / Windows modal sheet convention).
  // Also handles Tab / Shift+Tab to keep focus inside the panel.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (panel === null) return
      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusable.item(0)
      const last = focusable.item(focusable.length - 1)
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/40"
      onClick={onClose}
      data-testid="issue-detail-drawer"
    >
      <div
        ref={panelRef}
        className="h-full w-full max-w-2xl overflow-y-auto border-l bg-background shadow-xl"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('beads.issueDetail.title', 'Issue details')}
        tabIndex={-1}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-4 py-2">
          <h2 className="text-sm font-semibold">
            {t('beads.issueDetail.title', 'Issue details')}
          </h2>
          <Button
            ref={closeButtonRef}
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={t('common.close', 'Close')}
            data-testid="issue-detail-close"
          >
            <X className="size-4" />
          </Button>
        </div>
        <IssueDetailView
          cwd={cwd}
          issueId={issueId}
          onClose={onClose}
          onOpenIssue={onOpenIssue}
        />
      </div>
    </div>
  )
}
