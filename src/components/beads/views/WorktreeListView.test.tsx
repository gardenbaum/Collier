/**
 * Tests for WorktreeListView — v1 read-only worktree list placeholder.
 *
 * Contract:
 *   - Renders an `<EmptyState>` because bd 1.0.5 has no `worktree`
 *     subcommand. v2 will render `git worktree list`-style info
 *     once `bd worktree` ships.
 *   - The outer container carries `data-testid="worktree-view"` and
 *     the empty region carries `data-testid="worktree-empty"`, both
 *     read by ViewsRouter's branch tests and the e2e suite.
 *   - The `cwd` prop is documented but unused in v1 — rendering
 *     must not depend on it.
 */
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WorktreeListView } from './WorktreeListView'

describe('WorktreeListView', () => {
  it('renders the section with the documented worktree testids', () => {
    render(<WorktreeListView cwd="/fake" />)

    const section = screen.getByTestId('worktree-view')
    expect(section.tagName).toBe('SECTION')

    const empty = screen.getByTestId('worktree-empty')
    expect(empty.tagName).toBe('DIV')
    // The empty region nests inside the section.
    expect(section.contains(empty)).toBe(true)
  })

  it('renders the v1 empty-state copy with the GitBranch icon', () => {
    render(<WorktreeListView cwd="/fake" />)

    // EmptyState renders title in an <h3> and body in a <p>.
    expect(
      screen.getByRole('heading', { level: 3, name: 'No worktrees' })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Run `git worktree add` to create one.')
    ).toBeInTheDocument()
  })

  it('does not depend on the cwd prop for v1 rendering', () => {
    // v1 ignores `cwd`; rendering must succeed with any string.
    // If a future PR couples rendering to cwd, this test catches
    // it before the contract drifts from the documented shape.
    const { rerender } = render(<WorktreeListView cwd="/repo/a" />)
    expect(screen.getByTestId('worktree-view')).toBeInTheDocument()

    rerender(<WorktreeListView cwd="/repo/b" />)
    expect(screen.getByTestId('worktree-view')).toBeInTheDocument()
    expect(
      screen.getByText('Run `git worktree add` to create one.')
    ).toBeInTheDocument()
  })
})
