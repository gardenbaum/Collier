import type { CSSProperties } from 'react'
import type { IssuePriority } from '@/lib/bindings'
import { colors, radius } from '@/lib/design-tokens'

export interface PriorityDotProps {
  /** P0..P4 — P0 is the only priority rendered in accent. */
  priority: IssuePriority
  /** Optional accessible label override. Defaults to the priority token. */
  label?: string
}

// ponytail: IssuePriority is a string literal ("P0".."P4") in bindings.ts;
// index 0..4 drives the colour map below.
const priorityIndex = (p: IssuePriority): number => Number(p[1])

// P0 = accent (the only accent use besides destructive).
// P1..P4 walk a descending mono scale so priority reads at a glance.
const priorityColor = (p: number): string => {
  if (p === 0) return colors.accent
  if (p === 1) return colors.mono0
  if (p === 2) return colors.mono3
  if (p === 3) return colors.mono5
  return colors.mono7
}

/**
 * 8×8 square-edged dot that signals a Beads issue priority.
 *
 * P0 is the only priority that uses the accent colour; the rest are mono.
 * Uses `data-testid="priority-dot"` for QA selectors.
 */
export function PriorityDot({ priority, label }: PriorityDotProps) {
  const style: CSSProperties = {
    width: 8,
    height: 8,
    backgroundColor: priorityColor(priorityIndex(priority)),
    borderRadius: radius.sm,
    display: 'inline-block',
    flexShrink: 0,
  }
  return (
    <span
      data-testid="priority-dot"
      data-priority={priority}
      role="img"
      aria-label={label ?? priority}
      style={style}
    />
  )
}

export default PriorityDot
