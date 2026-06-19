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

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    return () => {
      previouslyFocusedRef.current?.focus()
    }
  }, [])

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
      className="fixed inset-0 z-40 flex justify-end bg-black/40 animate-in fade-in-0 duration-200"
      onClick={onClose}
      data-testid="issue-detail-drawer"
    >
      <div
        ref={panelRef}
        className="h-full w-full max-w-[480px] overflow-y-auto border-l border-[color:var(--border)] bg-[color:var(--drawer)] text-[color:var(--foreground)]"
        style={{
          backgroundColor: 'rgba(20, 20, 20, 0.92)',
          backdropFilter: 'blur(24px)',
        }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('beads.issueDetail.title', 'Issue details')}
        tabIndex={-1}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 h-10 border-b border-[color:var(--border)] bg-[color:var(--card)]">
          <h2 className="text-[13px] font-semibold">
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
