import { PriorityBadge } from '@/components/atoms'
import type { IssuePriority } from '@/lib/bindings'

export interface PriorityDotProps {
  /** P0..P4 — P0 is the only priority rendered in danger colour. */
  priority: IssuePriority
}

// ponytail: re-export shim for the new atom. The old PriorityDot
// was a tiny 8×8 square; the new PriorityBadge is an inline text
// badge ("P0", "P1", …) coloured by `palette.danger` for P0 and a
// mono ramp for the rest. Preserves `data-testid="priority-dot"` so
// QA selectors in the list views keep working through the swap.
export function PriorityDot({ priority }: PriorityDotProps) {
  return <PriorityBadge priority={priority} data-testid="priority-dot" />
}

export default PriorityDot
