/**
 * issue-summary-styles — shared CSSProperties for the `IssueSummaryRow`
 * and `IssueSummarySkeleton` components, plus the per-view container /
 * heading / error chrome that `BlockedView` and `ReadyView` both use.
 *
 * Why this exists
 * ---------------
 * `BlockedView` and `ReadyView` were byte-identical apart from the
 * `bd blocked` / `bd ready` query, the heading copy, the empty-state
 * copy, and the `blocked-*` / `ready-*` testid prefix. The visual
 * chrome (container, heading, row, skeleton) was 100% identical and
 * got flagged by `bun run jscpd` as a 78-line clone pair plus four
 * secondary clones.
 *
 * This module hoists the shared style constants into a single source
 * of truth. Both views and both summary components import from here.
 *
 * See also
 *   - `./IssueSummaryRow` — the row markup, keyed on `testidPrefix`.
 *   - `./IssueSummarySkeleton` — the 3-row loading skeleton.
 */
import type { CSSProperties } from 'react'
import { colors, space, type } from '@/lib/design-tokens'

export const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
  padding: space[4],
  color: colors.mono0,
  fontFamily: type.fontFamily.sans,
}

export const headingStyle: CSSProperties = {
  fontSize: type.fontSize.xl,
  fontWeight: type.fontWeight.bold,
  lineHeight: type.lineHeight.tight,
  margin: 0,
}

export const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[3],
  padding: space[3],
  backgroundColor: colors.mono9,
  borderTop: `1px solid ${colors.mono7}`,
  fontSize: type.fontSize.sm,
  lineHeight: type.lineHeight.normal,
}

export const titleStyle: CSSProperties = {
  fontWeight: type.fontWeight.medium,
  color: colors.mono0,
}

export const idStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.xs,
  color: colors.mono5,
  marginInlineStart: 'auto',
}

export const errorStyle: CSSProperties = {
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  padding: space[4],
  backgroundColor: colors.mono9,
  borderTop: `1px solid ${colors.mono7}`,
}

export const skeletonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[3],
  padding: space[3],
  backgroundColor: colors.mono9,
  borderTop: `1px solid ${colors.mono7}`,
}

export const skeletonBarStyle: CSSProperties = {
  height: 12,
  backgroundColor: colors.mono7,
}

// ponytail: M5 keyboard cursor indicator — matches the rest of the
// app's selected-row visual.
export const rowSelectedStyle: CSSProperties = {
  backgroundColor: 'rgba(94, 106, 210, 0.18)',
  boxShadow: 'inset 2px 0 0 0 rgb(94, 106, 210)',
}
