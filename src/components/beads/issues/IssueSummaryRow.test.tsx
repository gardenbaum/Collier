/**
 * Tests for the shared `IssueSummaryRow` component.
 *
 * Contract
 * --------
 * `IssueSummaryRow` is the row markup used by both `BlockedView` and
 * `ReadyView`. The two views pin a `testidPrefix` ("blocked" or
 * "ready") and expect the row to emit:
 *
 *   - `data-testid="${prefix}-row"` so the existing view-level suites
 *     (`BlockedView.test.tsx`, `ReadyView.test.tsx`) keep working
 *     byte-identical.
 *   - `data-row-id` and `data-issue-id` (both = `issue.id`) so the
 *     M5 keyboard-nav test harness can drive the cursor.
 *   - `data-row-selected` ("true" / "false") and `aria-selected` for
 *     the keyboard-selection visual.
 *   - Inner `data-testid="status-pill"`, `priority-dot`, `type-icon`,
 *     `dep-badge` slots (the badges carry their own testids).
 *
 * One test per prefix is the minimum that pins the contract without
 * becoming a duplicate of the view-level suites.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { IssueSummaryRow } from './IssueSummaryRow'

const sampleIssue = {
  id: 'beads-42',
  title: 'Tame the dragon',
  status: 'open' as const,
  priority: 'P1' as const,
  issue_type: 'task' as const,
  created_at: '2026-06-16T00:00:00Z',
  updated_at: null,
  closed_at: null,
  description: null,
  owner: null,
  labels: [],
  dependencies: [],
  dependency_count: 1,
  dependent_count: 0,
  comment_count: 0,
  parent: null,
  acceptance_criteria: null,
  external_ref: null,
}

describe('IssueSummaryRow', () => {
  it('emits the blocked-* testid contract', () => {
    render(
      <ul>
        <IssueSummaryRow
          issue={sampleIssue}
          isKeyboardSelected={false}
          testidPrefix="blocked"
        />
      </ul>
    )

    const row = screen.getByTestId('blocked-row')
    expect(row.getAttribute('data-row-id')).toBe('beads-42')
    expect(row.getAttribute('data-issue-id')).toBe('beads-42')
    expect(row.getAttribute('data-row-selected')).toBe('false')
    expect(row.getAttribute('aria-selected')).toBe('false')
    expect(row.getAttribute('data-kbd-nav')).toBe('row')

    // Inner badge slots — emitted by the existing badge components.
    expect(row.querySelector('[data-testid="status-pill"]')).toBeTruthy()
    expect(row.querySelector('[data-testid="priority-dot"]')).toBeTruthy()
    expect(row.querySelector('[data-testid="type-icon"]')).toBeTruthy()
    // dep-badge may be null when both counts are 0; this issue has
    // dependency_count=1 so it must be present.
    expect(row.querySelector('[data-testid="dep-badge"]')).toBeTruthy()
  })

  it('emits the ready-* testid contract', () => {
    render(
      <ul>
        <IssueSummaryRow
          issue={sampleIssue}
          isKeyboardSelected={true}
          testidPrefix="ready"
        />
      </ul>
    )

    const row = screen.getByTestId('ready-row')
    expect(row.getAttribute('data-row-id')).toBe('beads-42')
    expect(row.getAttribute('data-issue-id')).toBe('beads-42')
    expect(row.getAttribute('data-row-selected')).toBe('true')
    expect(row.getAttribute('aria-selected')).toBe('true')
    expect(row.getAttribute('data-kbd-nav')).toBe('row')

    expect(row.querySelector('[data-testid="status-pill"]')).toBeTruthy()
    expect(row.querySelector('[data-testid="priority-dot"]')).toBeTruthy()
    expect(row.querySelector('[data-testid="type-icon"]')).toBeTruthy()
    expect(row.querySelector('[data-testid="dep-badge"]')).toBeTruthy()
  })

  it('omits the dep badge when both counts are zero', () => {
    // ponytail: DependencyBadge returns null when both blockedBy
    // and blocks are 0 — this guarantees the existing
    // `ReadyView.test.tsx:235` test ("omits the dep badge when both
    // counts are zero") continues to hold for the shared row.
    const orphan = { ...sampleIssue, dependency_count: 0, dependent_count: 0 }
    render(
      <ul>
        <IssueSummaryRow
          issue={orphan}
          isKeyboardSelected={false}
          testidPrefix="ready"
        />
      </ul>
    )

    const row = screen.getByTestId('ready-row')
    expect(row.querySelector('[data-testid="dep-badge"]')).toBeNull()
  })
})
