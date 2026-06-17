/**
 * Tests for DependencyTreeView.
 *
 * Contract: DependencyTreeView calls `commands.bdDepTree(cwd,
 * issueId)` via TanStack Query, renders a monospace text tree
 * of the returned `Dependency[]` flat list, fires
 * `onOpenIssue(targetId)` when a row is clicked, and exposes:
 *   - `data-testid="dep-tree-view"` (root container)
 *   - `data-testid="dep-tree-loading"` (loading state)
 *   - `data-testid="dep-tree-error"` (error state, role="alert")
 *   - `data-testid="dep-tree-empty"` (empty state, no deps)
 *   - `data-testid="dep-tree-row"` per dep (data-depth, data-target-id,
 *     data-dep-type attributes)
 *   - `data-testid="dep-tree-open"` (clickable child button)
 *
 * Rows cycle through depth 0..2 for visual variety (the Rust
 * `Dependency` struct has no `from_id` so true recursion isn't
 * possible in v1). Depth limit is 3.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { render } from '@/test/test-utils'
import type { Dependency } from '@/lib/bindings'

const { mockBdDepTree } = vi.hoisted(() => ({
  mockBdDepTree: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdDepTree: mockBdDepTree,
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const importSut = () => import('./DependencyTreeView')

const dep1: Dependency = {
  dependency_id: 'beads-77',
  dependency_type: 'blocks',
  blocked_by: true,
}

const dep2: Dependency = {
  dependency_id: 'beads-78',
  dependency_type: 'related',
  blocked_by: null,
}

const dep3: Dependency = {
  dependency_id: 'beads-99',
  dependency_type: 'parent_child',
  blocked_by: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DependencyTreeView', () => {
  it('renders a loading skeleton while the query is pending', async () => {
    mockBdDepTree.mockReturnValue(new Promise<never>(() => undefined))

    const { DependencyTreeView } = await importSut()
    render(
      <DependencyTreeView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={() => undefined}
      />
    )

    expect(screen.getByTestId('dep-tree-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('dep-tree-view')).toBeNull()
    expect(screen.queryByTestId('dep-tree-empty')).toBeNull()
  })

  it('renders tree rows grouped by depth with type and id', async () => {
    mockBdDepTree.mockResolvedValue({
      status: 'ok',
      data: [dep1, dep2, dep3],
    })

    const { DependencyTreeView } = await importSut()
    render(
      <DependencyTreeView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={() => undefined}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('dep-tree-view')).toBeInTheDocument()
    })
    const rows = screen.getAllByTestId('dep-tree-row')
    expect(rows).toHaveLength(3)

    // ponytail: depth cycles 0,1,2 for visual variety (Dependency
    // struct has no from_id so true recursion is impossible in v1).
    expect(rows[0]?.getAttribute('data-depth')).toBe('0')
    expect(rows[1]?.getAttribute('data-depth')).toBe('1')
    expect(rows[2]?.getAttribute('data-depth')).toBe('2')

    expect(rows[0]?.getAttribute('data-target-id')).toBe('beads-77')
    expect(rows[0]?.getAttribute('data-dep-type')).toBe('blocks')
    expect(rows[1]?.getAttribute('data-target-id')).toBe('beads-78')
    expect(rows[1]?.getAttribute('data-dep-type')).toBe('related')
    expect(rows[2]?.getAttribute('data-target-id')).toBe('beads-99')
    expect(rows[2]?.getAttribute('data-dep-type')).toBe('parent_child')

    // Type label + id are rendered as text.
    expect(rows[0]?.textContent).toContain('[blocks]')
    expect(rows[0]?.textContent).toContain('beads-77')
  })

  it('clicking a row fires onOpenIssue with the target id', async () => {
    mockBdDepTree.mockResolvedValue({
      status: 'ok',
      data: [dep1, dep2],
    })

    const onOpenIssue = vi.fn()
    const { DependencyTreeView } = await importSut()
    render(
      <DependencyTreeView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={onOpenIssue}
      />
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('dep-tree-open')).toHaveLength(2)
    })
    const buttons = screen.getAllByTestId('dep-tree-open')
    fireEvent.click(buttons[1] as HTMLElement)
    expect(onOpenIssue).toHaveBeenCalledWith('beads-78')
  })

  it('renders the empty state when no deps', async () => {
    mockBdDepTree.mockResolvedValue({ status: 'ok', data: [] })

    const { DependencyTreeView } = await importSut()
    render(
      <DependencyTreeView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={() => undefined}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('dep-tree-empty')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('dep-tree-view')).toBeNull()
    expect(screen.queryByTestId('dep-tree-row')).toBeNull()
  })

  it('does not use the brand colour anywhere in the rendered output', async () => {
    mockBdDepTree.mockResolvedValue({
      status: 'ok',
      data: [dep1, dep2, dep3],
    })

    const { DependencyTreeView } = await importSut()
    const { container } = render(
      <DependencyTreeView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={() => undefined}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('dep-tree-view')).toBeInTheDocument()
    })
    // ponytail: AC-14 — the brand colour is reserved for destructive
    // actions and the P0 priority badge only. The tree view must not
    // surface the brand colour.
    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })
})
