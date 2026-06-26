import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { StatusPill } from './StatusPill'

describe('StatusPill', () => {
  it('exposes the status as data-status for QA selectors', () => {
    render(<StatusPill status="in_progress" />)
    expect(screen.getByTestId('status-pill').getAttribute('data-status')).toBe(
      'in_progress'
    )
  })

  it('is not pinned to a hard-edged radius', () => {
    render(<StatusPill status="open" />)
    const pill = screen.getByTestId('status-pill')
    expect(pill.style.borderRadius).not.toBe('0px')
  })

  // M6 R-Custom-Status: a workspace can register a custom status
  // via `bd config set status.custom "review:wip"`. The pill must
  // render the custom name without crashing — the inner StatusDot
  // falls back to the muted neutral palette, but the pill wrapper
  // still surfaces the raw status string via data-status so QA
  // selectors can target it. Guards against a future refactor
  // that re-introduces the closed `IssueStatus` enum.
  it('renders custom (non-built-in) status values without crashing', () => {
    render(<StatusPill status="review" />)
    const pill = screen.getByTestId('status-pill')
    expect(pill.getAttribute('data-status')).toBe('review')
  })

  it('renders arbitrary status strings (e.g. on_hold) without crashing', () => {
    // Snake-case custom names — the same path, different input.
    render(<StatusPill status="on_hold" />)
    const pill = screen.getByTestId('status-pill')
    expect(pill.getAttribute('data-status')).toBe('on_hold')
  })
})
