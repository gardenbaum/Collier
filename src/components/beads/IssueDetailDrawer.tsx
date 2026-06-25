import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { IssueDetailView } from './issues/IssueDetailView'
import { Button } from '@/components/ui/button'
import { useDialogA11y } from '@/hooks/useDialogA11y'

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

  // M5 a11y: focus trap + restoration + Escape handling. The hook
  // mirrors what the inline implementation used to do — capture the
  // trigger on mount, focus the close button, trap Tab inside the
  // drawer, Escape closes, restore focus to the trigger on unmount —
  // but is now shared by every modal dialog in the app.
  useDialogA11y({
    panelRef,
    initialFocusRef: closeButtonRef,
    onClose,
  })

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
