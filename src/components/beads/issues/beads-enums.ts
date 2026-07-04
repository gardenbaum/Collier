/**
 * Closed Beads enums used by the issue form fields.
 *
 * Why this exists
 * ---------------
 * `IssueTypeField` and `IssuePriorityField` both map over a
 * closed enum that was previously re-declared in two parents
 * (`IssueCreateForm` and `IssueUpdatePanel`). To avoid
 * `react-refresh/only-export-components` (which forbids mixing
 * component exports with non-component exports in the same file)
 * the constants live here in a sibling file and are imported by
 * both fields.
 *
 * These enums are part of the v1 Beads schema (`bd create` CLI)
 * and never change at runtime.
 */
import type { IssuePriority, IssueType } from '@/lib/bindings'

/**
 * Closed Beads issue-type enum. Order is the order rendered in the
 * dropdown and matches the v1 schema (`bd create --type`).
 */
export const ISSUE_TYPES: IssueType[] = [
  'bug',
  'feature',
  'task',
  'epic',
  'chore',
  'decision',
  'gate',
]

/**
 * Closed Beads priority enum P0..P4. Order is the order rendered in
 * the radiogroup and matches the v1 schema (`bd create --priority`).
 */
export const PRIORITIES: IssuePriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']
