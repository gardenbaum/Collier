/**
 * IssueSummaryRow — a single issue row used by the summary lists
 * (`BlockedView`, `ReadyView`).
 *
 * Why this exists
 * ---------------
 * `BlockedView` and `ReadyView` both render a flat `<ul>` of issues
 * fetched from a `bd ... --json` IPC. The row markup was
 * byte-identical apart from the `blocked-*` / `ready-*` testid
 * prefix and got flagged by `bun run jscpd` as part of a 78-line
 * clone pair between the two views.
 *
 * This component factors out the row markup. The parent supplies the
 * `testidPrefix` and the `Issue`. The keyboard-selection visual is
 * driven by the `isKeyboardSelected` boolean — the parent already
 * computes it from `useWorkspaceStore(s => s.selectedRowId)`.
 *
 * `data-row-id` and `data-issue-id` are emitted as a pair because
 * the M5 keyboard-nav test harness distinguishes row identity
 * (which moves with the cursor) from issue identity (stable across
 * re-renders). `data-testid="${prefix}-row"` is the stable hook the
 * existing `BlockedView.test.tsx` / `ReadyView.test.tsx` suites
 * assert against; it is the *only* surface that varies per view.
 *
 * ponytail: the testid-prefix contract here is what binds this
 * component to its two callers — do not rename `${prefix}-row` to
 * anything else without also updating both test files.
 */
import type { Issue } from '@/lib/bindings'
import { PriorityDot } from './badges/PriorityDot'
import { TypeIcon } from './badges/TypeIcon'
import { StatusPill } from './badges/StatusPill'
import { DependencyBadge } from './badges/DependencyBadge'
import {
  rowStyle,
  rowSelectedStyle,
  titleStyle,
  idStyle,
} from './issue-summary-styles'

export interface IssueSummaryRowProps {
  /** The issue to render. */
  issue: Issue
  /** M5 keyboard navigation: highlights the row matching the cursor. */
  isKeyboardSelected: boolean
  /**
   * Testid prefix; the row emits `data-testid="${testidPrefix}-row"`.
   * Existing callers pass `"blocked"` or `"ready"`.
   */
  testidPrefix: string
}

export function IssueSummaryRow({
  issue,
  isKeyboardSelected,
  testidPrefix,
}: IssueSummaryRowProps) {
  return (
    <li
      data-testid={`${testidPrefix}-row`}
      data-kbd-nav="row"
      data-row-id={issue.id}
      data-issue-id={issue.id}
      data-row-selected={isKeyboardSelected ? 'true' : 'false'}
      aria-selected={isKeyboardSelected}
      style={{
        ...rowStyle,
        ...(isKeyboardSelected ? rowSelectedStyle : null),
      }}
    >
      <PriorityDot priority={issue.priority} />
      <TypeIcon type={issue.issue_type} />
      <StatusPill status={issue.status} />
      <span style={titleStyle}>{issue.title}</span>
      <DependencyBadge
        blockedBy={issue.dependency_count ?? 0}
        blocks={issue.dependent_count ?? 0}
      />
      <span style={idStyle}>{issue.id}</span>
    </li>
  )
}
