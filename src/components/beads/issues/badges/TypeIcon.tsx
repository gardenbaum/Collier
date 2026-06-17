import type { CSSProperties } from 'react'
import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import type { IssueType } from '@/lib/bindings'
import {
  Bug,
  GitBranch,
  Lock,
  Mountain,
  Sparkles,
  SquareCheck,
  Wrench,
} from 'lucide-react'
import { colors } from '@/lib/design-tokens'

export interface TypeIconProps {
  /** One of the 7 IssueType variants from bindings.ts. */
  type: IssueType
  /** Pixel size (width + height). Defaults to 14 — matches a row in the list view. */
  size?: number
}

// ponytail: the icon→type mapping lives in one place; `SquareCheck` is the
// modern Lucide name for the old `CheckSquare` (renamed in lucide v0.4xx
// and no longer shipped as a re-export in v1.18.0+). Mono only — the brand
// colour is reserved for destructive + P0 per AC-14.
const typeIcon: Record<IssueType, ComponentType<LucideProps>> = {
  bug: Bug,
  feature: Sparkles,
  task: SquareCheck,
  epic: Mountain,
  chore: Wrench,
  decision: GitBranch,
  gate: Lock,
}

const typeLabel: Record<IssueType, string> = {
  bug: 'bug',
  feature: 'feature',
  task: 'task',
  epic: 'epic',
  chore: 'chore',
  decision: 'decision',
  gate: 'gate',
}

/**
 * Mono-toned Lucide icon that signals a Beads issue type. Seven variants
 * matching the IssueType enum. Renders inline by default with `aria-hidden`
 * (the icon is decorative — the `title` attribute on the wrapper provides
 * the accessible name for screen readers).
 *
 * Uses `data-testid="type-icon"` and `data-type={type}` for QA selectors.
 */
export function TypeIcon({ type, size = 14 }: TypeIconProps) {
  const Icon = typeIcon[type]

  const wrapperStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0,
    lineHeight: 1,
    color: colors.mono0,
  }

  return (
    <span
      data-testid="type-icon"
      data-type={type}
      title={typeLabel[type]}
      style={wrapperStyle}
    >
      <Icon size={size} aria-hidden="true" />
    </span>
  )
}

export default TypeIcon
