/**
 * Empty state components for the beads namespace.
 *
 * Three named exports cover the three empty-list conditions the
 * beads views can show:
 *   - `NoIssuesEmpty`  — beads is initialized but the issue list is
 *                        empty (Welcome's older sibling, smaller form)
 *   - `NoResultsEmpty` — the active filter narrows the list to nothing
 *   - `NoRepoEmpty`    — the user hasn't selected a repository yet
 *
 * Styling: Bauhaus + Swiss, hard edges, mono only. The brand colour
 * is reserved for destructive actions and the P0 priority badge per
 * AC-14; empty states are informational surfaces, so they stay on the
 * mono scale. `design-tokens` is the single source of truth for
 * colors / spacing / type — no hard-coded literals.
 */
import type { CSSProperties } from 'react'
import { colors, space, type } from '@/lib/design-tokens'

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: space[3],
  padding: space[8],
  color: colors.mono3,
  fontFamily: type.fontFamily.sans,
  textAlign: 'center',
}

const headingStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.lg,
  fontWeight: type.fontWeight.bold,
  lineHeight: type.lineHeight.tight,
  color: colors.mono0,
  margin: 0,
}

const bodyStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.base,
  fontWeight: type.fontWeight.regular,
  lineHeight: type.lineHeight.normal,
  color: colors.mono4,
  margin: 0,
  maxWidth: 480,
}

const buttonStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.base,
  fontWeight: type.fontWeight.medium,
  color: colors.mono9,
  backgroundColor: colors.mono0,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono0,
  paddingInline: space[4],
  paddingBlock: space[2],
  cursor: 'pointer',
}

export interface NoIssuesEmptyProps {
  /** Invoked when the user clicks the "Create issue" button. */
  onCreate: () => void
}

/**
 * Shown when beads is initialized and the issue list is empty.
 * Single CTA → parent's create-issue flow (T21).
 */
export function NoIssuesEmpty({ onCreate }: NoIssuesEmptyProps) {
  return (
    <div data-testid="no-issues-empty" style={containerStyle}>
      <h2 style={headingStyle}>No issues yet</h2>
      <p style={bodyStyle}>Create your first issue to get started.</p>
      <button
        type="button"
        data-testid="no-issues-create"
        onClick={onCreate}
        style={buttonStyle}
      >
        Create issue
      </button>
    </div>
  )
}

export interface NoResultsEmptyProps {
  /** Invoked when the user clicks the "Clear filters" button. */
  onClearFilters: () => void
}

/**
 * Shown when the active filter narrows the issue list to nothing.
 * Single CTA → parent's filter-clear action (T17).
 */
export function NoResultsEmpty({ onClearFilters }: NoResultsEmptyProps) {
  return (
    <div data-testid="no-results-empty" style={containerStyle}>
      <h2 style={headingStyle}>No matches</h2>
      <p style={bodyStyle}>No issues match your filters.</p>
      <button
        type="button"
        data-testid="no-results-clear"
        onClick={onClearFilters}
        style={buttonStyle}
      >
        Clear filters
      </button>
    </div>
  )
}

export interface NoRepoEmptyProps {
  /** Invoked when the user clicks the "Select a repo" button. */
  onSelectRepo: () => void
}

/**
 * Shown when no beads repository is selected. Single CTA → parent's
 * repo-selection gate (T9 / T12).
 */
export function NoRepoEmpty({ onSelectRepo }: NoRepoEmptyProps) {
  return (
    <div data-testid="no-repo-empty" style={containerStyle}>
      <h2 style={headingStyle}>No repository selected</h2>
      <p style={bodyStyle}>Choose a repo to get started.</p>
      <button
        type="button"
        data-testid="no-repo-select"
        onClick={onSelectRepo}
        style={buttonStyle}
      >
        Select a repo
      </button>
    </div>
  )
}
