/**
 * DependencyBadge — compact "blocked by N" / "blocks N" chips for
 * issue rows + the detail header.
 *
 * M3 R8 (see `docs/specs/m3-depgraph.md`):
 *   - The data model exposes two integer counts on every `Issue`:
 *     `dependency_count` (how many issues this one depends on, i.e.
 *     "incoming" blockers) and `dependent_count` (how many issues
 *     depend on this one, i.e. "outgoing" dependents). The
 *     full `dependencies` array is only present on `bd show`, not
 *     `bd list --json`, so badges must be derivable from the counts
 *     alone — a row that renders 1000 cells per tick can't afford
 *     a separate `bd show` IPC per issue to count edges.
 *   - The fixture from `scripts/make-fixture.sh` exposes both
 *     shapes: TASK_LOGIN has dependency_count=2 (REFAC + OAUTH),
 *     TASK_MIGRATE has dependent_count=1 (blocks OPT). E2E
 *     asserts on both directions.
 *
 * Design notes (per docs/CONSTITUTION.md):
 *   - Mono scale only; the "blocked by" pill uses
 *     `palette.statusBlocked` (orange) for the icon + text to
 *     match the `StatusDot` for the same status. Brand colour
 *     stays reserved for destructive + P0.
 *   - `data-testid`, `data-blocked-by`, `data-blocks` expose the
 *     counts as data attributes so tests can assert the badge is
 *     present without re-parsing the inner text. `data-variant`
 *     distinguishes the row / header sizing.
 *   - Returns `null` when both counts are 0 — callers don't have
 *     to gate.
 *   - Singular / plural is computed for the *visible* number, the
 *     aria-label uses the same form for screen readers.
 */
import type { CSSProperties } from 'react'
import { Link2, ArrowRight } from 'lucide-react'
import { palette, radius, space, type } from '@/lib/design-tokens'

export interface DependencyBadgeProps {
  /**
   * Number of open issues this issue depends on. `0` hides the
   * "blocked by" chip. The count comes from `Issue.dependency_count`
   * on the wire (defaults to 0 when bd omits the field).
   */
  blockedBy: number
  /**
   * Number of open issues that depend on this one. `0` hides the
   * "blocks" chip. The count comes from `Issue.dependent_count`.
   */
  blocks: number
  /**
   * Sizing preset.
   *   - `row` (default) — compact pill sized to live in the title
   *     column of a 40px-tall list row.
   *   - `header` — slightly larger pill for the issue detail header
   *     next to the other metadata badges.
   */
  variant?: 'row' | 'header'
}

export function DependencyBadge({
  blockedBy,
  blocks,
  variant = 'row',
}: DependencyBadgeProps) {
  const hasIncoming = blockedBy > 0
  const hasOutgoing = blocks > 0
  if (!hasIncoming && !hasOutgoing) return null

  return (
    <span
      data-testid="dep-badge"
      data-blocked-by={hasIncoming ? String(blockedBy) : undefined}
      data-blocks={hasOutgoing ? String(blocks) : undefined}
      data-variant={variant}
      style={containerStyle}
    >
      {hasIncoming ? (
        <span
          data-testid="dep-badge-blocked-by"
          aria-label={`Blocked by ${blockedBy} ${pluralize('issue', blockedBy)}`}
          style={incomingPillStyle}
        >
          <Link2
            size={iconSize(variant)}
            aria-hidden="true"
            color={palette.statusBlocked}
          />
          <span style={incomingTextStyle}>blocked by {blockedBy}</span>
        </span>
      ) : null}
      {hasOutgoing ? (
        <span
          data-testid="dep-badge-blocks"
          aria-label={`Blocks ${blocks} ${pluralize('issue', blocks)}`}
          style={outgoingPillStyle}
        >
          <ArrowRight
            size={iconSize(variant)}
            aria-hidden="true"
            color={palette.textMuted}
          />
          <span style={outgoingTextStyle}>blocks {blocks}</span>
        </span>
      ) : null}
    </span>
  )
}

function pluralize(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`
}

function iconSize(variant: 'row' | 'header'): number {
  return variant === 'header' ? 12 : 10
}

const containerStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[1],
  flexShrink: 0,
}

const pillBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  height: 20,
  paddingInline: space[2],
  borderRadius: radius.sm,
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.medium,
  lineHeight: type.lineHeight.tight,
  whiteSpace: 'nowrap',
}

const incomingPillStyle: CSSProperties = {
  ...pillBase,
  color: palette.statusBlocked,
  backgroundColor: 'rgba(251, 146, 60, 0.10)',
  border: `1px solid rgba(251, 146, 60, 0.28)`,
}

const incomingTextStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.medium,
  lineHeight: type.lineHeight.tight,
  color: palette.statusBlocked,
}

const outgoingPillStyle: CSSProperties = {
  ...pillBase,
  color: palette.textMuted,
  backgroundColor: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
}

const outgoingTextStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.medium,
  lineHeight: type.lineHeight.tight,
  color: palette.textMuted,
}
