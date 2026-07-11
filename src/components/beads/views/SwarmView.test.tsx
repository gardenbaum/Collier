/**
 * Tests for SwarmView — v1 read-only swarm activity placeholder.
 *
 * Contract:
 *   - Renders an `<EmptyState>` until bd ships swarm reporting
 *     (v2 will split into active swarms + all swarms with metadata).
 *   - The outer container carries `data-testid="swarm-view"` and
 *     the empty region carries `data-testid="swarm-empty"`, both
 *     read by ViewsRouter's branch tests and the e2e suite.
 *   - The `cwd` prop is documented but unused in v1 — rendering
 *     must not depend on it.
 */
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { SwarmView } from './SwarmView'

describe('SwarmView', () => {
  it('renders the section with the documented swarm testids', () => {
    render(<SwarmView cwd="/fake" />)

    const section = screen.getByTestId('swarm-view')
    expect(section.tagName).toBe('SECTION')

    const empty = screen.getByTestId('swarm-empty')
    expect(empty.tagName).toBe('DIV')
    // The empty region nests inside the section.
    expect(section.contains(empty)).toBe(true)
  })

  it('renders the v1 empty-state copy with the Users icon', () => {
    render(<SwarmView cwd="/fake" />)

    // EmptyState renders title in an <h3> and body in a <p>.
    expect(
      screen.getByRole('heading', { level: 3, name: 'No swarm activity' })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Multi-agent sessions will appear here.')
    ).toBeInTheDocument()
  })

  it('does not depend on the cwd prop for v1 rendering', () => {
    // v1 ignores `cwd`; rendering must succeed with any string.
    // If a future PR couples rendering to cwd, this test catches
    // it before the contract drifts from the documented shape.
    const { rerender } = render(<SwarmView cwd="/repo/a" />)
    expect(screen.getByTestId('swarm-view')).toBeInTheDocument()

    rerender(<SwarmView cwd="/repo/b" />)
    expect(screen.getByTestId('swarm-view')).toBeInTheDocument()
    expect(
      screen.getByText('Multi-agent sessions will appear here.')
    ).toBeInTheDocument()
  })
})
