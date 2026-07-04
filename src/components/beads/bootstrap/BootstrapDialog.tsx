/**
 * BootstrapDialog — shared chrome for the three bootstrap blocking
 * modals (BdNotInPath / SchemaCheck / VersionCheck).
 *
 * Why this exists
 * ---------------
 * All three modals render the same Dialog + DialogContent + DialogHeader
 * + DialogTitle + DialogDescription + DialogFooter scaffolding — the
 * only differences are the title/description copy, two optional testids
 * (see "Test contract"), and the body / footer content. `bun run jscpd`
 * flags the resulting 18L/111T + 17L/103T clone pairs between the
 * three files.
 *
 * This component factors out the chrome. Callers supply title, description,
 * body, and (optionally) a custom footer; everything else is fixed.
 *
 * Co-located next to its consumers — bootstrap-only primitive, matches
 * the QuitButton pattern. If a fourth call site outside `bootstrap/`
 * adopts it, promote to `@/components/ui/`.
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { colors, space } from '@/lib/design-tokens'
import { QuitButton } from './QuitButton'

export interface BootstrapDialogProps {
  /** Whether the modal is open. */
  open: boolean
  /**
   * Optional `data-testid` for DialogContent. Set when the caller needs
   * to assert the modal is present in tests (currently only VersionCheck).
   */
  contentTestid?: string
  /**
   * Optional `data-testid` for DialogTitle. Set when the caller needs to
   * assert the title separately (currently only SchemaCheck).
   */
  titleTestid?: string
  /** Title copy (i18n key already resolved). */
  title: ReactNode
  /** Description copy (i18n key already resolved). */
  description: ReactNode
  /** Body content rendered between the header and the footer. */
  children?: ReactNode
  /**
   * Optional footer content. Defaults to `<QuitButton />` when omitted
   * (matches SchemaCheck + VersionCheck; BdNotInPath overrides with
   * Recheck + QuitButton).
   */
  footer?: ReactNode
}

export function BootstrapDialog({
  open,
  contentTestid,
  titleTestid,
  title,
  description,
  children,
  footer,
}: BootstrapDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent
        data-testid={contentTestid}
        showCloseButton={false}
        onEscapeKeyDown={event => event.preventDefault()}
        onPointerDownOutside={event => event.preventDefault()}
        onInteractOutside={event => event.preventDefault()}
        className={cn('max-w-2xl gap-6 p-8', 'border-2', 'rounded-none')}
        style={{
          borderColor: colors.mono0,
          padding: space[8],
          borderRadius: 0,
        }}
      >
        <DialogHeader className="gap-3">
          <DialogTitle
            className="text-2xl font-bold"
            style={{ color: colors.mono0 }}
            data-testid={titleTestid}
          >
            {title}
          </DialogTitle>
          <DialogDescription
            className="text-sm"
            style={{ color: colors.mono3 }}
          >
            {description}
          </DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter className="gap-3 sm:justify-end">
          {footer ?? <QuitButton />}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
