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

  it('falls back to 0 when both dependency_count and dependent_count are missing', () => {
    // ponytail: bd show --json omits `dependency_count` /
    // `dependent_count` (see bindings.d.ts L1241+), so the field on
    // the wire is `undefined`. The row guards both with `?? 0`
    // (IssueSummaryRow.tsx L71-72) before forwarding to the badge —
    // this test exercises the RIGHT branch of both `??` operators.
    const { dependency_count: _dc, dependent_count: _dd, ...rest } = sampleIssue
    render(
      <ul>
        <IssueSummaryRow
          // Cast so we can pass an Issue shape where the optional
          // count fields are absent (matches the bd show wire shape).
          issue={
            rest as unknown as Parameters<typeof IssueSummaryRow>[0]['issue']
          }
          isKeyboardSelected={false}
          testidPrefix="ready"
        />
      </ul>
    )

    const row = screen.getByTestId('ready-row')
    // Both fallbacks fire → blockedBy=0, blocks=0 → badge returns null.
    expect(row.querySelector('[data-testid="dep-badge"]')).toBeNull()
  })

  it('falls back to 0 for dependency_count while keeping dependent_count', () => {
    // Asymmetric case — only the INCOMING count is missing. The
    // outgoing count stays populated, so the badge should still
    // render the "blocks N" pill (with its real count) and the
    // "blocked by" pill must stay hidden (its count is the ?? 0
    // fallback = 0). Pins that the missing field never produces a
    // spurious "blocked by 0" chip.
    const { dependency_count: _dc, ...rest } = sampleIssue
    render(
      <ul>
        <IssueSummaryRow
          issue={
            { ...rest, dependent_count: 2 } as unknown as Parameters<
              typeof IssueSummaryRow
            >[0]['issue']
          }
          isKeyboardSelected={false}
          testidPrefix="blocked"
        />
      </ul>
    )

    const row = screen.getByTestId('blocked-row')
    const badge = row.querySelector('[data-testid="dep-badge"]')
    expect(badge).not.toBeNull()
    if (!badge) throw new Error('dep-badge should be present')
    expect(badge.getAttribute('data-blocked-by')).toBeNull()
    expect(badge.getAttribute('data-blocks')).toBe('2')
    expect(row.querySelector('[data-testid="dep-badge-blocked-by"]')).toBeNull()
    expect(row.querySelector('[data-testid="dep-badge-blocks"]')).toBeTruthy()
  })
})
