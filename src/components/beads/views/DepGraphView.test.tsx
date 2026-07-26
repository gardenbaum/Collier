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
import { act, screen, waitFor, fireEvent } from '@testing-library/react'
import type { RenderOptions } from '@testing-library/react'
import { render } from '@/test/test-utils'
import type { Graph, GraphEdge, GraphNode } from '@/lib/bindings'
import type {
  LaidOutEdge,
  LaidOutGraph,
  LaidOutNode,
  computeLayout,
} from './depGraphLayout'
import type * as DepGraphLayoutModule from './depGraphLayout'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// jsdom does not implement ResizeObserver. The component uses one
// in a useEffect to drive the centre-on-layout behaviour; the spy
// captures the callback so coverage tests can simulate real DOM
// measurements and exercise the centring branch (lines 466-470)
// plus the no-op re-centre branch (line 465). Existing tests
// that don't fire the callback see the same behaviour as the
// original no-op stub.
class ResizeObserverSpy {
  static instances: ResizeObserverSpy[] = []
  callback: ResizeObserverCallback
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb
    ResizeObserverSpy.instances.push(this)
  }
  fire(entries: ResizeObserverEntry[]): void {
    this.callback(entries, this as unknown as ResizeObserver)
  }
}
beforeAll(() => {
  globalThis.ResizeObserver =
    ResizeObserverSpy as unknown as typeof ResizeObserver
})

const { mockBdGraph, mockComputeLayout } = vi.hoisted(() => ({
  mockBdGraph: vi.fn(),
  mockComputeLayout: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdGraph: mockBdGraph,
  },
}))

// Default to the real `computeLayout` so existing tests get the
// genuine dagre output; coverage tests for the polyline / arrow
// helpers inject degenerate point arrays via mockReturnValueOnce.
// The factory captures the real implementation in a closure
// variable so `beforeEach` can restore it after `mockReset()`.
let realComputeLayout: typeof computeLayout | undefined
vi.mock('./depGraphLayout', async importOriginal => {
  const actual = await importOriginal<typeof DepGraphLayoutModule>()
  realComputeLayout = actual.computeLayout
  return {
    ...actual,
    computeLayout: mockComputeLayout.mockImplementation(realComputeLayout),
  }
})

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

function makeLaidOutNode(
  id: string,
  overrides: Partial<LaidOutNode> = {}
): LaidOutNode {
  return {
    id,
    x: 0,
    y: 0,
    data: makeNode({ id }),
    ...overrides,
  }
}

function makeLaidOutEdge(overrides: Partial<LaidOutEdge> = {}): LaidOutEdge {
  return {
    source: 'a',
    target: 'b',
    depType: 'blocks',
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
    ...overrides,
  }
}

function makeLayout(overrides: Partial<LaidOutGraph> = {}): LaidOutGraph {
  return {
    nodes: [makeLaidOutNode('a'), makeLaidOutNode('b')],
    edges: [],
    width: 100,
    height: 100,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  ResizeObserverSpy.instances = []
  // Reset the implementation + queue from previous tests; the
  // factory populates `realComputeLayout` on first import, so
  // skip the reset on the very first beforeEach (the factory
  // hasn't run yet and resetting would leave the mock without
  // an implementation until importSut() is called inside the
  // test).
  if (realComputeLayout) {
    mockComputeLayout.mockReset()
    mockComputeLayout.mockImplementation(realComputeLayout)
  }
})

function makeRect(width: number, height: number): DOMRectReadOnly {
  return {
    width,
    height,
    top: 0,
    left: 0,
    bottom: height,
    right: width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }
}

/**
 * Render the component with React Query's cache pre-populated so
 * `useQuery` returns `data` immediately — the component skips the
 * loading state and the container ref attaches on the FIRST
 * commit, not on a re-render. This is the only way the
 * `useEffect(..., [])` that creates the ResizeObserver ever
 * sees a non-null `containerRef.current` (the production code's
 * effect runs once on mount and never re-runs). Pre-existing
 * limitation; see the trailing comment in the coverage block
 * for the policy.
 */
function renderWithCachedGraph(
  ui: React.ReactElement,
  graph: Graph,
  options?: RenderOptions
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData(['beads', 'graph', '/fake'], graph)
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return render(ui, { wrapper, ...options })
}

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

  // ------------------------------------------------------------------
  // Coverage follow-up: defensive guards + ResizeObserver / centring
  // branches that the original render-fixture tests never reached.
  // The `mockComputeLayout` factory exposes `computeLayout` as a
  // `vi.fn` that delegates to the real dagre-based layout by
  // default; the tests below inject degenerate point arrays via
  // `mockReturnValueOnce` to reach the polyline / arrow guards.
  // ------------------------------------------------------------------

  it('skips rendering an edge when its points array is empty (line 302)', async () => {
    // The renderer short-circuits edges whose `points.length`
    // is zero (dagre drops orphan edges this way). The branch
    // is unreachable from real layouts — dagre never produces
    // a zero-length points array — so inject one explicitly.
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: {
        nodes: [makeNode({ id: 'a' }), makeNode({ id: 'b' })],
        edges: [],
      },
    })
    mockComputeLayout.mockReturnValueOnce(
      makeLayout({
        edges: [
          makeLaidOutEdge({
            source: 'a',
            target: 'b',
            depType: 'blocks',
            points: [],
          }),
        ],
      })
    )

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    // Edge returns null from the renderer → no graph-edge in the
    // DOM. Nodes still render (the layout still has two nodes).
    expect(screen.queryByTestId('graph-edge')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('graph-node').length).toBe(2)
  })

  it('returns an empty polyline path when the first point is undefined', async () => {
    // The `if (!first) return ''` guard exists because TS
    // `noUncheckedIndexedAccess` types `points[0]` as possibly
    // undefined even when `points.length > 0`. dagre never
    // produces a sparse array, so inject one to prove the guard.
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: {
        nodes: [makeNode({ id: 'a' }), makeNode({ id: 'b' })],
        edges: [],
      },
    })
    const sparse: ({ x: number; y: number } | undefined)[] = [
      undefined,
      { x: 0, y: 0 },
    ]
    mockComputeLayout.mockReturnValueOnce(
      makeLayout({
        edges: [
          makeLaidOutEdge({
            source: 'a',
            target: 'b',
            depType: 'blocks',
            points: sparse as unknown as readonly { x: number; y: number }[],
          }),
        ],
      })
    )

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    const edge = screen.getByTestId('graph-edge')
    const paths = edge.querySelectorAll('path')
    // First path is the polyline: `if (!first) return ''` fires.
    expect(paths[0]?.getAttribute('d')).toBe('')
    // Second path is the arrow head: `prev` is also undefined.
    expect(paths[1]?.getAttribute('d')).toBe('')
  })

  it('skips undefined intermediate points in the polyline (continue)', async () => {
    // The `if (!p) continue` guard inside the polyline loop.
    // Middle point is undefined → skipped → only the first and
    // last segments land in the `d` attribute.
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: {
        nodes: [makeNode({ id: 'a' }), makeNode({ id: 'b' })],
        edges: [],
      },
    })
    const sparse: ({ x: number; y: number } | undefined)[] = [
      { x: 0, y: 0 },
      undefined,
      { x: 10, y: 10 },
    ]
    mockComputeLayout.mockReturnValueOnce(
      makeLayout({
        edges: [
          makeLaidOutEdge({
            source: 'a',
            target: 'b',
            depType: 'blocks',
            points: sparse as unknown as readonly { x: number; y: number }[],
          }),
        ],
      })
    )

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    const edge = screen.getByTestId('graph-edge')
    const paths = edge.querySelectorAll('path')
    // Middle undefined is skipped via `continue`: d jumps from
    // (0,0) straight to (10,10).
    expect(paths[0]?.getAttribute('d')).toBe('M 0 0 L 10 10')
    // Arrow head: prev = sparse[1] = undefined → return ''.
    expect(paths[1]?.getAttribute('d')).toBe('')
  })

  it('returns an empty arrow head when the polyline has fewer than two points', async () => {
    // Degenerate edge: dagre normally produces ≥2 points per
    // edge, but the renderer handles the single-point case for
    // robustness. Covers `arrowHeadPath`'s `points.length < 2`
    // early return.
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: { nodes: [makeNode({ id: 'a' })], edges: [] },
    })
    mockComputeLayout.mockReturnValueOnce(
      makeLayout({
        nodes: [makeLaidOutNode('a')],
        edges: [
          makeLaidOutEdge({
            source: 'a',
            target: 'a',
            depType: 'blocks',
            points: [{ x: 5, y: 5 }],
          }),
        ],
      })
    )

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    const edge = screen.getByTestId('graph-edge')
    const paths = edge.querySelectorAll('path')
    // polyline: length=1, first defined → 'M 5 5'.
    expect(paths[0]?.getAttribute('d')).toBe('M 5 5')
    // arrowHead: length < 2 → ''.
    expect(paths[1]?.getAttribute('d')).toBe('')
  })

  it('returns an empty arrow head when the last point is undefined', async () => {
    // Sparse edge where the trailing segment is missing.
    // `arrowHeadPath`'s `!last` branch fires.
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: {
        nodes: [makeNode({ id: 'a' }), makeNode({ id: 'b' })],
        edges: [],
      },
    })
    const sparse: ({ x: number; y: number } | undefined)[] = [
      { x: 0, y: 0 },
      undefined,
    ]
    mockComputeLayout.mockReturnValueOnce(
      makeLayout({
        edges: [
          makeLaidOutEdge({
            source: 'a',
            target: 'b',
            depType: 'blocks',
            points: sparse as unknown as readonly { x: number; y: number }[],
          }),
        ],
      })
    )

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    const edge = screen.getByTestId('graph-edge')
    const paths = edge.querySelectorAll('path')
    // polyline: i=1 undefined → continue → 'M 0 0'.
    expect(paths[0]?.getAttribute('d')).toBe('M 0 0')
    // arrowHead: last = undefined → ''.
    expect(paths[1]?.getAttribute('d')).toBe('')
  })

  it('returns an empty arrow head when the incoming segment has zero length', async () => {
    // Co-located points: dx = dy = 0, len = hypot(0, 0) = 0.
    // Covers `arrowHeadPath`'s `len === 0` early return.
    mockBdGraph.mockResolvedValue({
      status: 'ok',
      data: {
        nodes: [makeNode({ id: 'a' }), makeNode({ id: 'b' })],
        edges: [],
      },
    })
    mockComputeLayout.mockReturnValueOnce(
      makeLayout({
        edges: [
          makeLaidOutEdge({
            source: 'a',
            target: 'b',
            depType: 'blocks',
            points: [
              { x: 5, y: 5 },
              { x: 5, y: 5 },
            ],
          }),
        ],
      })
    )

    const { DepGraphView } = await importSut()
    render(<DepGraphView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    const edge = screen.getByTestId('graph-edge')
    const paths = edge.querySelectorAll('path')
    // polyline: both points equal → 'M 5 5 L 5 5'.
    expect(paths[0]?.getAttribute('d')).toBe('M 5 5 L 5 5')
    // arrowHead: len === 0 → ''.
    expect(paths[1]?.getAttribute('d')).toBe('')
  })

  // ------------------------------------------------------------------
  // ResizeObserver + centring useLayoutEffect. The component's
  // `useEffect(..., [])` runs once on initial mount, but bdGraph
  // is async so the ref attaches on a LATER render — the effect
  // never re-runs and the ResizeObserver is never created in
  // jsdom (and arguably in production, but that's a pre-existing
  // bug separate from this coverage PR). To prove the defensive
  // guards inside the effect body we pre-populate React Query's
  // cache so the component renders the graph view on its first
  // mount with the container ref already attached. The
  // `renderWithCachedGraph` helper builds a fresh QueryClient
  // per call and seeds it via `setQueryData`.
  // ------------------------------------------------------------------

  it('updates the viewport when the ResizeObserver fires', async () => {
    // Cached graph → component renders the graph view on first
    // mount → the `useEffect(..., [])` runs with the container
    // ref attached and constructs the ResizeObserver.
    const graph: Graph = { nodes: [makeNode({ id: 'a' })], edges: [] }
    const { DepGraphView } = await importSut()
    renderWithCachedGraph(
      <DepGraphView cwd="/fake" onOpenIssue={() => undefined} />,
      graph
    )

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    const ro = ResizeObserverSpy.instances[0]
    expect(ro).toBeDefined()
    if (!ro) return

    // Sanity: jsdom's container is 0×0, so the initial pan/zoom
    // stays at (0, 0, 1) because the centring effect's viewport
    // guard at line 464 returns early.
    const canvas = screen.getByTestId('graph-canvas')
    expect(canvas.getAttribute('data-pan-x')).toBe('0')
    expect(canvas.getAttribute('data-pan-y')).toBe('0')
    expect(canvas.getAttribute('data-zoom')).toBe('1')

    act(() => {
      ro.fire([
        {
          contentRect: makeRect(800, 600),
        } as unknown as ResizeObserverEntry,
      ])
    })

    // After the callback fires the viewport is non-zero; the
    // useLayoutEffect runs the centre-on-layout path and
    // panX / panY / zoom take real (non-zero, non-1) values
    // (lines 466-470).
    await waitFor(() => {
      expect(Number(canvas.getAttribute('data-pan-x'))).not.toBe(0)
    })
    expect(Number(canvas.getAttribute('data-pan-y'))).not.toBe(0)
    expect(Number(canvas.getAttribute('data-zoom'))).not.toBe(1)
  })

  it('does not re-centre when the layoutKey matches the previously-centred layout', async () => {
    // After the first centring, `centredForRef.current` is set
    // to `layoutKey`. A subsequent viewport change (new object
    // reference → state update → effect re-runs) sees
    // `centredForRef.current === layoutKey` and returns early
    // at line 465 — pan / zoom stay pinned.
    const graph: Graph = { nodes: [makeNode({ id: 'a' })], edges: [] }
    const { DepGraphView } = await importSut()
    renderWithCachedGraph(
      <DepGraphView cwd="/fake" onOpenIssue={() => undefined} />,
      graph
    )

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    const ro = ResizeObserverSpy.instances[0]
    expect(ro).toBeDefined()
    if (!ro) return

    // First fire: viewport becomes non-zero, layout gets centred.
    act(() => {
      ro.fire([
        {
          contentRect: makeRect(800, 600),
        } as unknown as ResizeObserverEntry,
      ])
    })
    const canvas = screen.getByTestId('graph-canvas')
    await waitFor(() => {
      expect(Number(canvas.getAttribute('data-pan-x'))).not.toBe(0)
    })
    const panX1 = canvas.getAttribute('data-pan-x')
    const panY1 = canvas.getAttribute('data-pan-y')
    const zoom1 = canvas.getAttribute('data-zoom')

    // Second fire: viewport is updated again (new object), but
    // centredForRef.current === layoutKey → early return at
    // line 465. panX / panY / zoom stay pinned.
    act(() => {
      ro.fire([
        {
          contentRect: makeRect(800, 600),
        } as unknown as ResizeObserverEntry,
      ])
    })

    expect(canvas.getAttribute('data-pan-x')).toBe(panX1)
    expect(canvas.getAttribute('data-pan-y')).toBe(panY1)
    expect(canvas.getAttribute('data-zoom')).toBe(zoom1)
  })

  it('keeps the viewport<=0 early-return branch covered with a zero-size callback', async () => {
    // Line 464: `if (viewport.width <= 0 || viewport.height
    // <= 0) return`. Existing tests render in jsdom where the
    // container is 0×0 so the guard fires implicitly; cover it
    // explicitly here by firing the ResizeObserver with a
    // zero-size rect — a real browser can produce this when a
    // flex parent collapses.
    const graph: Graph = { nodes: [makeNode({ id: 'a' })], edges: [] }
    const { DepGraphView } = await importSut()
    renderWithCachedGraph(
      <DepGraphView cwd="/fake" onOpenIssue={() => undefined} />,
      graph
    )

    await waitFor(() => {
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    })

    const ro = ResizeObserverSpy.instances[0]
    expect(ro).toBeDefined()
    if (!ro) return

    act(() => {
      ro.fire([
        {
          contentRect: makeRect(0, 0),
        } as unknown as ResizeObserverEntry,
      ])
    })

    // Viewport is { width: 0, height: 0 } → line 464 guard
    // fires → pan/zoom stay at their initial values.
    const canvas = screen.getByTestId('graph-canvas')
    expect(canvas.getAttribute('data-pan-x')).toBe('0')
    expect(canvas.getAttribute('data-pan-y')).toBe('0')
    expect(canvas.getAttribute('data-zoom')).toBe('1')
  })
})
