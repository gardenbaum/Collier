/**
 * Tests for SyncStatusView — v1 read-only Dolt vs version-control sync status.
 *
 * Contract:
 *   - Renders an `<EmptyState>` until v2 issues both `bd vc status`
 *     and `bd dolt status` in parallel and renders each as a card.
 *   - The outer container carries `data-testid="sync-view"` and
 *     the empty region carries `data-testid="sync-empty"`, both
 *     read by ViewsRouter's branch tests and the e2e suite.
 *   - The `cwd` prop is documented but unused in v1 — rendering
 *     must not depend on it.
 */
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { SyncStatusView } from './SyncStatusView'

describe('SyncStatusView', () => {
  it('renders the section with the documented sync testids', () => {
    render(<SyncStatusView cwd="/fake" />)

    const section = screen.getByTestId('sync-view')
    expect(section.tagName).toBe('SECTION')

    const empty = screen.getByTestId('sync-empty')
    expect(empty.tagName).toBe('DIV')
    // The empty region nests inside the section.
    expect(section.contains(empty)).toBe(true)
  })

  it('renders the v1 empty-state copy with the Cloud icon', () => {
    render(<SyncStatusView cwd="/fake" />)

    // EmptyState renders title in an <h3> and body in a <p>.
    expect(
      screen.getByRole('heading', { level: 3, name: 'Not yet synced' })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Run `bd sync` to push local state.')
    ).toBeInTheDocument()
  })

  it('does not depend on the cwd prop for v1 rendering', () => {
    // v1 ignores `cwd`; rendering must succeed with any string.
    // If a future PR couples rendering to cwd, this test catches
    // it before the contract drifts from the documented shape.
    const { rerender } = render(<SyncStatusView cwd="/repo/a" />)
    expect(screen.getByTestId('sync-view')).toBeInTheDocument()

    rerender(<SyncStatusView cwd="/repo/b" />)
    expect(screen.getByTestId('sync-view')).toBeInTheDocument()
    expect(
      screen.getByText('Run `bd sync` to push local state.')
    ).toBeInTheDocument()
  })
})
