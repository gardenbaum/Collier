/**
 * Smoke tests for the closed Beads enums used by `IssueTypeField`
 * and `IssuePriorityField`. The v1 schema is part of the `bd` CLI
 * contract; if the rendered order ever drifts the Beads GUI would
 * silently produce inputs the CLI does not accept. The arrays are
 * therefore pinned here in test form so a stray edit is caught by
 * CI rather than by a confused user.
 */
import { describe, it, expect } from 'vitest'
import { ISSUE_TYPES, PRIORITIES } from './beads-enums'

describe('beads-enums', () => {
  describe('PRIORITIES (v1 closed priority enum)', () => {
    it('contains exactly 5 entries', () => {
      expect(PRIORITIES).toHaveLength(5)
    })

    it('lists P0..P4 in numeric order', () => {
      expect(PRIORITIES).toEqual(['P0', 'P1', 'P2', 'P3', 'P4'])
    })
  })

  describe('ISSUE_TYPES (v1 closed issue-type enum)', () => {
    it('contains exactly 7 entries', () => {
      expect(ISSUE_TYPES).toHaveLength(7)
    })

    it('lists types in v1 schema order', () => {
      expect(ISSUE_TYPES).toEqual([
        'bug',
        'feature',
        'task',
        'epic',
        'chore',
        'decision',
        'gate',
      ])
    })
  })
})
