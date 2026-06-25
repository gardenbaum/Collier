/**
 * Tests for `DepGraphView` — the React wrapper around
 * `depGraphLayout`.
 *
 * Coverage:
 *   - Renders a loading skeleton while `commands.bdGraph` is
 *     pending
 *   - Calls `bdGraph(cwd)` with the active workspace root
 *   - Renders the empty state when the resolved graph has 0
 *     nodes
 *   - Renders one SVG node per input graph node, with
 *     `data-node-id` carrying the bd id
 *   - Renders one SVG edge per input graph edge, with
 *     `data-source` / `data-target` carrying the swapped
 *     direction (blocker → dependent)
 *   - Marks `data-blocked="true"` on nodes whose status is
 *     `blocked` and surfaces the count in the header
 *   - Clicking a node calls `onOpenIssue(node.id)`
 *
 * Pan / zoom math is exercised in `depGraphLayout.test.ts` (pure
 * function, no render harness). React Compiler is enabled, so
 * handlers here don't need manual `useCallback`.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import type { Graph, GraphEdge, GraphNode } from '@/lib/bindings'

// jsdom does not implement ResizeObserver. The component uses one
// in a useEffect to drive the centre-on-layout behaviour; a no-op
// stub keeps the effect's contract intact without requiring the
// test to simulate real DOM measurements.
class ResizeObserverStub {
  observe(): void {
    // intentionally empty
  }
  unobserve(): void {
    // intentionally empty
  }
  disconnect(): void {
    // intentionally empty
  }
}
beforeAll(() => {
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver
})

const { mockBdGraph } = vi.hoisted(() => ({
  mockBdGraph: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdGraph: mockBdGraph,
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

const importSut = () => import('./DepGraphView')

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'n1',
    title: 'Node one',
    status: 'open',
    priority: 'P2',
    issueType: 'task',
    ...overrides,
  }
}

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    source: 'a',
    target: 'b',
    depType: 'blocks',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DepGraphView', () => {
  it('renders a loading skeleton while bdGraph is pending', async () => {
    mockBdGraph.mockReturnValue(new Promise<never>(() => undefined))

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    expect(screen.getByTestId('dep-graph-view')).toBeInTheDocument()
    expect(screen.getByTestId('graph-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('graph-canvas')).not.toBeInTheDocument()
  })

  it('calls bdGraph with the provided cwd', async () => {
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: { nodes: [], edges: [] },
    })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/repo/path" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(mockBdGraph).toHaveBeenCalledWith('/repo/path')
    })
  })

  it('renders the empty state when the graph has zero nodes', async () => {
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: { nodes: [], edges: [] },
    })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-empty')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('graph-canvas')).not.toBeInTheDocument()
  })

  it('renders one SVG node per input node with data-node-id', async () => {
    const graph: Graph = {
      nodes: [
        makeNode({ id: 'a', title: 'Alpha' }),
        makeNode({ id: 'b', title: 'Beta' }),
        makeNode({ id: 'c', title: 'Gamma' }),
      ],
      edges: [],
    }
    mockBdGraph.mockResolvedValue({ status: 'ok', data: graph })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    const nodes = screen.getAllByTestId('graph-node')
    expect(nodes.length).toBe(3)
    const ids = nodes.map(n => n.getAttribute('data-node-id')).sort()
    expect(ids).toEqual(['a', 'b', 'c'])
  })

  it('renders one SVG edge per input edge with the swapped direction', async () => {
    // bd semantics: source=dependent, target=blocker. The
    // layout swaps them so the SVG arrow reads "blocker →
    // dependent". Asserting on the swapped source/target in the
    // DOM keeps the visual direction in lockstep with the data.
    const graph: Graph = {
      nodes: [makeNode({ id: 'a' }), makeNode({ id: 'b' })],
      edges: [makeEdge({ source: 'b', target: 'a', depType: 'blocks' })],
    }
    mockBdGraph.mockResolvedValue({ status: 'ok', data: graph })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    const edges = screen.getAllByTestId('graph-edge')
    expect(edges.length).toBe(1)
    const edge = edges[0] as HTMLElement
    expect(edge.getAttribute('data-source')).toBe('a')
    expect(edge.getAttribute('data-target')).toBe('b')
    expect(edge.getAttribute('data-dep-type')).toBe('blocks')
    expect(edge.getAttribute('data-kind')).toBe('blocker')
  })

  it('emits parent_child dep_type as data-dep-type="parent-child" (kebab)', async () => {
    // The DependencyType enum is serialised in snake_case by Rust
    // serde; the E2E spec matches the CLI's kebab-case form on the
    // DOM attribute (`data-dep-type="parent-child"`). The conversion
    // lives next to the edge renderer so the wire format stays
    // snake_case (no contract change for TS consumers) while the
    // test attribute mirrors what `bd dep add --type` accepts.
    const graph: Graph = {
      nodes: [makeNode({ id: 'epic' }), makeNode({ id: 'task' })],
      edges: [
        makeEdge({ source: 'task', target: 'epic', depType: 'parent_child' }),
      ],
    }
    mockBdGraph.mockResolvedValue({ status: 'ok', data: graph })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    const edge = screen.getAllByTestId('graph-edge')[0] as HTMLElement
    expect(edge.getAttribute('data-dep-type')).toBe('parent-child')
    expect(edge.getAttribute('data-kind')).toBe('parent')
  })

  it('marks blocked nodes with data-blocked=true and surfaces the count', async () => {
    const graph: Graph = {
      nodes: [
        makeNode({ id: 'opt', status: 'blocked' }),
        makeNode({ id: 'refac', status: 'blocked' }),
        makeNode({ id: 'login', status: 'closed' }),
      ],
      edges: [],
    }
    mockBdGraph.mockResolvedValue({ status: 'ok', data: graph })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    const opt = document.querySelector('[data-node-id="opt"]')
    const refac = document.querySelector('[data-node-id="refac"]')
    const login = document.querySelector('[data-node-id="login"]')
    expect(opt?.getAttribute('data-blocked')).toBe('true')
    expect(refac?.getAttribute('data-blocked')).toBe('true')
    expect(login?.getAttribute('data-blocked')).toBe('false')

    // Header advertises 2 blocked — the parent blocker click
    // contract depends on the header count being right.
    expect(screen.getByTestId('graph-blocked-count').textContent).toMatch(/2/)
  })

  it('does not show the blocked counter when there are no blocked nodes', async () => {
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: {
        nodes: [makeNode({ id: 'a', status: 'open' })],
        edges: [],
      },
    })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('graph-blocked-count')).not.toBeInTheDocument()
  })

  it('calls onOpenIssue with the node id when a node is clicked', async () => {
    const onOpenIssue = vi.fn()
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: {
        nodes: [
          makeNode({ id: 'a', title: 'Alpha' }),
          makeNode({ id: 'b', title: 'Beta' }),
        ],
        edges: [],
      },
    })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={onOpenIssue} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    const node = document.querySelector(
      '[data-node-id="b"]'
    ) as HTMLElement | null
    expect(node).not.toBeNull()
    // The click handler lives on the inner <rect> (production:
    // WebKitWebDriver's hit-testing for an SVG <g> is unreliable;
    // a <rect> with a known fill paints predictably). Fire the
    // click on the rect so the synthetic event reaches it directly.
    const rect = node?.querySelector('rect') as SVGRectElement | null
    expect(rect).not.toBeNull()
    fireEvent.click(rect as unknown as HTMLElement)

    expect(onOpenIssue).toHaveBeenCalledWith('b')
  })

  it('renders the graph error message when bdGraph rejects', async () => {
    mockBdGraph.mockResolvedValue({
      status: 'error',
      error: { type: 'ParseError', message: 'no graph for you' },
    })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('graph-error').textContent).toContain(
      'no graph for you'
    )
  })

  it('exposes the initial pan/zoom on the canvas data attributes', async () => {
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: {
        nodes: [makeNode({ id: 'a' })],
        edges: [],
      },
    })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })
    const canvas = screen.getByTestId('graph-canvas')
    // Initial values: panX / panY may be 0 (the centre happens
    // after the first ResizeObserver fires in jsdom — which is
    // 0×0 in jsdom, so the layoutEffect guard keeps them at 0).
    // The data attributes themselves must exist so E2E can
    // assert on them.
    expect(canvas.getAttribute('data-pan-x')).not.toBeNull()
    expect(canvas.getAttribute('data-pan-y')).not.toBeNull()
    expect(canvas.getAttribute('data-zoom')).not.toBeNull()
  })
})
