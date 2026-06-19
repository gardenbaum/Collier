import { render, screen } from '@/test/test-utils'
import { describe, it, expect } from 'vitest'
import { Sidebar } from './Sidebar'

describe('Sidebar', () => {
  it('renders all 10 view names', () => {
    render(<Sidebar />)
    const views = [
      'list',
      'ready',
      'blocked',
      'search',
      'epic',
      'swarm',
      'sync',
      'worktree',
      'status',
      'raw',
    ] as const
    for (const view of views) {
      expect(screen.getByTestId(`sidebar-view-${view}`)).toBeInTheDocument()
    }
  })

  it('renders the FILTERS section label', () => {
    render(<Sidebar />)
    expect(screen.getByText(/^Filters$/i)).toBeInTheDocument()
  })

  it('renders the LABELS section label', () => {
    render(<Sidebar />)
    expect(screen.getByText(/^Labels$/i)).toBeInTheDocument()
  })

  it('highlights the active view', () => {
    render(<Sidebar />)
    const listItem = screen.getByRole('tab', { name: /List/ })
    expect(listItem.getAttribute('data-active')).toBe('true')
  })
})
