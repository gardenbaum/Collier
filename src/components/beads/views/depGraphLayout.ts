/**
 * depGraphLayout — pure layout + pan/zoom math for `DepGraphView`.
 *
 * Extracted from the React component so the same code paths can be
 * exercised by Vitest (unit) without spinning up the full view tree
 * (or the Tauri IPC layer, which mocks `commands.bdGraph` in tests).
 *
 * Three concerns live here:
 *   1. `computeLayout(graph, opts?)` — runs dagre over the nodes /
 *      edges, returns `{ nodes, edges, width, height }` in viewport
 *      coordinates. Deterministic for the same input (dagre is
 *      pure-functional; we never mutate the input graph).
 *   2. `isBlockedNode(node)` — single source of truth for "this node
 *      should render as blocked", so the SVG component and the unit
 *      test never drift.
 *   3. `edgeIsSolid(type)` / `edgeKind(type)` — classify each
 *      DependencyType into the two visual treatments: solid
 *      (blocks / parent_child — the structural edges) vs dashed
 *      (everything else — informational).
 *
 * No React, no DOM — only the math + classification. Imports stay
 * ESM-friendly so the bundler tree-shakes dagre into the view chunk
 * only when DepGraphView is mounted.
 */
import dagre from '@dagrejs/dagre'
import type { Graph, GraphNode, DependencyType } from '@/lib/bindings'

/** Dimensions of one rendered node card in viewport units. */
export const NODE_WIDTH = 200
export const NODE_HEIGHT = 56

/** Spacing between nodes — dagre's `ranksep` / `nodesep`. */
const RANK_SEP = 80
const NODE_SEP = 40

/**
 * Default layout direction. `TB` (top → bottom) maps cleanly onto
 * "upstream blockers at the top, downstream work below" — the
 * mental model Beads users get from `bd dep --blocks`. `LR` was
 * a candidate but reads less naturally with long titles.
 */
const RANKDIR = 'TB' as const

export interface LaidOutNode {
  /** Same id as the input GraphNode. */
  id: string
  /** Center-x in layout coordinates (after dagre settled). */
  x: number
  /** Center-y in layout coordinates. */
  y: number
  /** The original GraphNode so the renderer can label / colour. */
  data: GraphNode
}

export interface LaidOutEdge {
  /** Same source/target/depType as the input GraphEdge. */
  source: string
  target: string
  depType: DependencyType
  /**
   * Polyline points in layout coordinates, one vertex per element.
   * `points[0]` is at the source end, `points[last]` at the target
   * end. Empty array means the edge was dropped by dagre (target
   * not in the node set) — the renderer should skip rendering.
   */
  points: ReadonlyArray<{ x: number; y: number }>
}

export interface LaidOutGraph {
  nodes: LaidOutNode[]
  edges: LaidOutEdge[]
  /** Total layout width (the renderer uses this to size the canvas). */
  width: number
  /** Total layout height. */
  height: number
}

/**
 * Decide whether a node should render with the "blocked" highlight.
 *
 * bd already sets `status = blocked` when an issue has an open
 * blocker, so the Rust side surfaces it on the `GraphNode`. We
 * delegate to that field — no client-side recomputation, no race
 * with the file-watcher, and the unit test reads the same flag
 * the renderer does.
 */
export function isBlockedNode(node: GraphNode): boolean {
  return node.status === 'blocked'
}

/**
 * Visual treatment for an edge. `solid` = primary structural edge
 * (blocker / parent → child). `dashed` = informational edge
 * (related, tracks, …). The colour is decided by `edgeKind` so
 * the renderer picks from a stable palette per kind.
 */
export type EdgeKind = 'blocker' | 'parent' | 'related'

export function edgeKind(depType: DependencyType): EdgeKind {
  switch (depType) {
    case 'blocks':
    case 'conditional_blocks':
    case 'waits_for':
      return 'blocker'
    case 'parent_child':
      return 'parent'
    case 'related':
    case 'tracks':
    case 'discovered_from':
    case 'caused_by':
    case 'validates':
    case 'supersedes':
      return 'related'
  }
}

/**
 * Compute the viewport-coordinate layout of a Graph using dagre.
 *
 * **Edge direction reversal.** The Rust `GraphEdge` carries the bd
 * `Dependency` semantics: each edge points FROM the dependent
 * issue (the one that "needs" `target`) TO the issue being
 * depended on. That's the right wire shape for "X depends on Y"
 * bookkeeping, but it lays out backwards in a DAG visual —
 * blockers should sit ABOVE the work they're blocking, not
 * below. Before handing the graph to dagre we swap source ↔
 * target so dagre's `rankdir: TB` puts the dependency (the
 * blocker / parent epic) on top. The returned `LaidOutEdge`
 * then carries the swapped (source = blocker, target =
 * dependent) orientation, which the SVG renderer uses as the
 * arrow's start / end — so the arrow visually reads
 * "blocker → blocked" and the layout matches the user's mental
 * model.
 *
 * Edges that point to a node id absent from the node set (an
 * orphan — possible if a dep was added to a now-deleted issue)
 * get an empty `points` array; the renderer drops them. dagre
 * itself would throw on a missing target, so we drop them at the
 * input boundary.
 */
export function computeLayout(graph: Graph): LaidOutGraph {
  // Short-circuit the empty case so callers can rely on
  // `width === 0 && height === 0` meaning "nothing to draw".
  // dagre would otherwise return ~48x48 (the marginx/marginy)
  // for an empty graph, which trips up the centreOnLayout
  // helper's "no centering move" check.
  if (graph.nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 }
  }

  const g = new dagre.graphlib.Graph({
    directed: true,
    multigraph: false,
    compound: false,
  })
  g.setGraph({
    rankdir: RANKDIR,
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
    marginx: 24,
    marginy: 24,
  })
  g.setDefaultEdgeLabel(() => ({}))

  const knownIds = new Set<string>()
  for (const node of graph.nodes) {
    g.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })
    knownIds.add(node.id)
  }

  for (const edge of graph.edges) {
    // dagre throws if either endpoint is missing — filter at the
    // boundary so the layout pass is robust to orphan edges.
    if (!knownIds.has(edge.source) || !knownIds.has(edge.target)) continue
    // Reverse source/target so the dependency (blocker / parent
    // epic) lands upstream in TB layout. See the doc comment for
    // the full rationale.
    g.setEdge(edge.target, edge.source)
  }

  dagre.layout(g)

  const laidOutNodes: LaidOutNode[] = graph.nodes.map(node => {
    const dagreNode = g.node(node.id)
    return {
      id: node.id,
      x: dagreNode?.x ?? 0,
      y: dagreNode?.y ?? 0,
      data: node,
    }
  })

  const laidOutEdges: LaidOutEdge[] = graph.edges
    .filter(e => knownIds.has(e.source) && knownIds.has(e.target))
    .map(edge => {
      const dagreEdge = g.edge({
        v: edge.target,
        w: edge.source,
      })
      const points = (dagreEdge?.points ?? []) as ReadonlyArray<{
        x: number
        y: number
      }>
      return {
        // Swap so the output edges read "blocker → dependent" —
        // the SVG renderer uses source as the arrow's tail.
        source: edge.target,
        target: edge.source,
        depType: edge.depType,
        points,
      }
    })

  // dagre's graph label carries the bounding box of the layout.
  const graphLabel = g.graph() as {
    width?: number
    height?: number
  }
  const width = typeof graphLabel.width === 'number' ? graphLabel.width : 0
  const height = typeof graphLabel.height === 'number' ? graphLabel.height : 0

  return { nodes: laidOutNodes, edges: laidOutEdges, width, height }
}

/**
 * Clamp a zoom factor to a sane range so the user can't shrink the
 * graph to a single pixel or zoom past the renderer. The lower
 * bound keeps the canvas interactive (click targets stay > 8px);
 * the upper bound keeps it from blowing past memory budgets.
 */
export const ZOOM_MIN = 0.2
export const ZOOM_MAX = 3

export function clampZoom(z: number): number {
  if (Number.isNaN(z)) return 1
  if (z < ZOOM_MIN) return ZOOM_MIN
  if (z > ZOOM_MAX) return ZOOM_MAX
  return z
}

/**
 * Wheel-driven zoom math: scale the canvas around the cursor so
 * the point under the cursor stays under the cursor. Standard
 * "zoom-to-cursor" — without it the graph slides around on every
 * wheel tick, which feels broken on a 500-issue workspace.
 *
 * Inputs are in viewport pixels; the resulting `pan` keeps the
 * graph point that was under the cursor before the wheel still
 * under it after the wheel.
 */
export function zoomAroundPoint(
  current: { panX: number; panY: number; zoom: number },
  cursor: { x: number; y: number },
  deltaZoom: number,
): { panX: number; panY: number; zoom: number } {
  const newZoom = clampZoom(current.zoom * deltaZoom)
  // If the clamp swallowed the delta (already at the cap), return
  // the current state unchanged. Skipping the math here keeps the
  // graph pinned when the user wheels past the cap.
  if (newZoom === current.zoom) return current
  // The point under the cursor in layout coords, before the zoom:
  const layoutX = (cursor.x - current.panX) / current.zoom
  const layoutY = (cursor.y - current.panY) / current.zoom
  // New pan keeps that layout point under the cursor.
  const panX = cursor.x - layoutX * newZoom
  const panY = cursor.y - layoutY * newZoom
  return { panX, panY, zoom: newZoom }
}

/**
 * Centre the viewport on the layout's bounding box. Used as the
 * initial pan on first render so the user lands on the graph,
 * not on (0,0) of an SVG that is otherwise off-screen.
 */
export function centreOnLayout(
  layout: LaidOutGraph,
  viewport: { width: number; height: number },
): { panX: number; panY: number; zoom: number } {
  if (layout.width === 0 || layout.height === 0) {
    return { panX: 0, panY: 0, zoom: 1 }
  }
  return {
    panX: (viewport.width - layout.width) / 2,
    panY: (viewport.height - layout.height) / 2,
    zoom: 1,
  }
}
