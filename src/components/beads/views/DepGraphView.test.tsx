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
    // The click handler + data attributes live on the inner
    // <rect> (production: WebKitWebDriver's hit-testing for an
    // SVG <g> is unreliable; the <rect> is the paintable
    // element WebDriver can interact with — picked up from
    // CI run 28147868610). Fire the click on the node itself,
    // which is now the rect, so the synthetic event reaches the
    // handler directly.
    fireEvent.click(node as unknown as HTMLElement)

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

  // ------------------------------------------------------------------
  // Helper coverage
  // ------------------------------------------------------------------

  it('truncates node titles longer than 30 chars with an ellipsis', async () => {
    const longTitle =
      'A task whose title is intentionally over thirty characters long'
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: {
        nodes: [makeNode({ id: 'long', title: longTitle })],
        edges: [],
      },
    })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    // The title is rendered as the second <text> child of the
    // node group. jsdom carries the textContent verbatim; the
    // truncation appends '…' and slices to 29 chars (30 with
    // the ellipsis).
    const texts = document.querySelectorAll('[data-node-id="long"] ~ text')
    const titleNode = texts[texts.length - 1] as SVGTextElement | undefined
    expect(titleNode).toBeDefined()
    const rendered = titleNode?.textContent ?? ''
    expect(rendered.endsWith('…')).toBe(true)
    // 29 chars + 1 ellipsis = 30 visible chars, never the full title.
    expect(rendered.length).toBe(30)
    expect(rendered.length).toBeLessThan(longTitle.length)
  })

  it('emits data-kind="related" with dashed stroke for related edges', async () => {
    // edgeStrokeStyle returns `strokeDasharray: '4 3'` for the
    // 'related' kind. The two previous dep_type tests cover
    // 'blocker' (solid, statusBlocked) and 'parent' (solid,
    // mono7); 'related' is the third arm and the dashed stroke
    // path was previously uncovered.
    const graph: Graph = {
      nodes: [makeNode({ id: 'a' }), makeNode({ id: 'b' })],
      edges: [makeEdge({ source: 'b', target: 'a', depType: 'related' })],
    }
    mockBdGraph.mockResolvedValue({ status: 'ok', data: graph })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    const edge = screen.getAllByTestId('graph-edge')[0] as HTMLElement
    expect(edge.getAttribute('data-kind')).toBe('related')
    const dashedPath = edge.querySelector('path[stroke-dasharray="4 3"]')
    expect(dashedPath).not.toBeNull()
  })

  // ------------------------------------------------------------------
  // Pointer / wheel event handlers
  // ------------------------------------------------------------------

  it('starts a drag on pointerdown over canvas background', async () => {
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: { nodes: [makeNode({ id: 'a' })], edges: [] },
    })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })
    const canvas = screen.getByTestId('graph-canvas')

    // Dispatch the pointerdown directly on the SVG so the
    // handler's e.target.closest('[data-testid="graph-node"]')
    // lookup yields null (the SVG itself does not carry the
    // graph-node testid).
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 50 })

    // Cursor switches to 'grabbing' while a drag is in flight —
    // see svgStyleDragging in the source.
    expect((canvas as HTMLElement).style.cursor).toBe('grabbing')
  })

  it('ignores pointerdown that starts on a node (does not begin a drag)', async () => {
    // The handler explicitly bails when the pointerdown target
    // is inside a graph-node element — node clicks own that
    // interaction and a node drag would shadow the click
    // handler. Cover the `target.closest(...) !== null` branch.
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: { nodes: [makeNode({ id: 'a' })], edges: [] },
    })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    const node = document.querySelector('[data-node-id="a"]') as Element
    expect(node).not.toBeNull()
    fireEvent.pointerDown(node, { clientX: 50, clientY: 25 })

    const canvas = screen.getByTestId('graph-canvas')
    // Drag was NOT started, so the cursor remains the default
    // 'grab' from svgStyle.
    expect((canvas as HTMLElement).style.cursor).toBe('grab')
  })

  it('updates panX / panY when pointermove fires during a drag', async () => {
    // After pointerdown at (100,50) and pointermove at (140,90),
    // the delta is (+40, +40) and the SVG pan attributes must
    // reflect that. (Initial panX / panY are 0 — the jsdom
    // ResizeObserver stub never delivers a non-zero viewport,
    // so the centring useLayoutEffect never commits.)
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: { nodes: [makeNode({ id: 'a' })], edges: [] },
    })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })
    const canvas = screen.getByTestId('graph-canvas')

    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 50 })
    fireEvent.pointerMove(canvas, { clientX: 140, clientY: 90 })

    // dragStart.panX = 0, dragStart.panY = 0 → next = (0+40, 0+40).
    expect(canvas.getAttribute('data-pan-x')).toBe('40')
    expect(canvas.getAttribute('data-pan-y')).toBe('40')
  })

  it('does not change pan when pointermove fires without an active drag', async () => {
    // handlePointerMove early-returns when dragStart === null.
    // Without a prior pointerdown the pan attributes stay at 0.
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: { nodes: [makeNode({ id: 'a' })], edges: [] },
    })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })
    const canvas = screen.getByTestId('graph-canvas')

    fireEvent.pointerMove(canvas, { clientX: 140, clientY: 90 })

    expect(canvas.getAttribute('data-pan-x')).toBe('0')
    expect(canvas.getAttribute('data-pan-y')).toBe('0')
  })

  it('clears the drag on pointerup (subsequent pointermove is a no-op)', async () => {
    // After pointerdown + pointermove + pointerup, another
    // pointermove must not move the pan further. This proves
    // handlePointerUp actually reset dragStart to null.
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: { nodes: [makeNode({ id: 'a' })], edges: [] },
    })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })
    const canvas = screen.getByTestId('graph-canvas')

    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 50 })
    fireEvent.pointerMove(canvas, { clientX: 120, clientY: 60 })
    fireEvent.pointerUp(canvas)

    // Cursor reverts to 'grab' once the drag ends.
    expect((canvas as HTMLElement).style.cursor).toBe('grab')

    fireEvent.pointerMove(canvas, { clientX: 999, clientY: 999 })
    // Pan stayed at the post-drag value (20, 10); the post-up
    // move did nothing.
    expect(canvas.getAttribute('data-pan-x')).toBe('20')
    expect(canvas.getAttribute('data-pan-y')).toBe('10')
  })

  it('zooms in on wheel with negative deltaY (data-zoom increases)', async () => {
    // wheel: deltaY < 0 → deltaZoom = 1.1, so the new zoom
    // multiplier is 1.1. The handler also re-pans so the
    // point under the cursor stays under the cursor; with
    // initial panX = panY = 0 and rect.left = rect.top = 0
    // (jsdom default), the math is deterministic.
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: { nodes: [makeNode({ id: 'a' })], edges: [] },
    })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })
    const canvas = screen.getByTestId('graph-canvas')

    fireEvent.wheel(canvas, {
      deltaY: -100,
      clientX: 50,
      clientY: 50,
    })

    // zoom 1 → 1.1; panX = 50 - 50*1.1 = -5 (same for Y).
    // The pan math has a tiny floating-point drift; assert
    // closeness on the parsed values rather than the raw
    // string.
    expect(canvas.getAttribute('data-zoom')).toBe('1.1')
    expect(Number(canvas.getAttribute('data-pan-x'))).toBeCloseTo(-5, 6)
    expect(Number(canvas.getAttribute('data-pan-y'))).toBeCloseTo(-5, 6)
  })

  it('zooms out on wheel with positive deltaY (data-zoom decreases)', async () => {
    // wheel: deltaY > 0 → deltaZoom = 1/1.1, so the new zoom
    // multiplier is ~0.909. Note: 0.2 is the ZOOM_MIN clamp,
    // so a single wheel-out from zoom=1 stays above the floor.
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: { nodes: [makeNode({ id: 'a' })], edges: [] },
    })

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })
    const canvas = screen.getByTestId('graph-canvas')

    fireEvent.wheel(canvas, {
      deltaY: 100,
      clientX: 0,
      clientY: 0,
    })

    // 1 / 1.1 ≈ 0.90909…
    const zoom = Number(canvas.getAttribute('data-zoom'))
    expect(zoom).toBeCloseTo(1 / 1.1, 5)
    expect(zoom).toBeLessThan(1)
    // At (0,0) the cursor is at the same point as the pan
    // origin, so the pan math yields (0, 0) unchanged.
    expect(canvas.getAttribute('data-pan-x')).toBe('0')
    expect(canvas.getAttribute('data-pan-y')).toBe('0')
  })
})
