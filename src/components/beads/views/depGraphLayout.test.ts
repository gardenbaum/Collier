/**
 * Tests for `depGraphLayout` — pure layout + classification math
 * that drives `DepGraphView`.
 *
 * Why these tests live separately from `DepGraphView.test.tsx`:
 * the layout module has zero React / DOM dependencies, so the
 * assertions don't need a render harness, mocks, or jsdom. Pure
 * function in, pure shape out — the cheapest possible test.
 *
 * Coverage:
 *   - `computeLayout` assigns x/y to every node
 *   - `computeLayout` produces a polyline per edge (and drops
 *     orphan edges whose target is not in the node set)
 *   - `isBlockedNode` flags status=blocked
 *   - `edgeKind` classifies every DependencyType variant
 *   - `clampZoom` respects ZOOM_MIN / ZOOM_MAX
 *   - `zoomAroundPoint` keeps the cursor-pinned point stable
 *   - `centreOnLayout` computes a pan that puts the layout box
 *     roughly in the middle of the viewport
 */
import { describe, it, expect } from 'vitest'
import type { DependencyType, Graph, GraphNode } from '@/lib/bindings'
import {
  centreOnLayout,
  clampZoom,
  computeLayout,
  edgeKind,
  isBlockedNode,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomAroundPoint,
} from './depGraphLayout'

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'n',
    title: 'T',
    status: 'open',
    priority: 'P2',
    issueType: 'task',
    ...overrides,
  }
}

function makeGraph(
  nodes: GraphNode[],
  edges: {
    source: string
    target: string
    depType: DependencyType
  }[]
): Graph {
  return {
    nodes,
    edges: edges.map(e => ({ ...e })),
  }
}

describe('isBlockedNode', () => {
  it('returns true for status=blocked', () => {
    expect(isBlockedNode(makeNode({ status: 'blocked' }))).toBe(true)
  })

  it('returns false for every other status', () => {
    for (const status of [
      'open',
      'in_progress',
      'closed',
      'deferred',
    ] as const) {
      expect(isBlockedNode(makeNode({ status }))).toBe(false)
    }
  })
})

describe('edgeKind', () => {
  it('classifies blocks / conditional_blocks / waits_for as "blocker"', () => {
    expect(edgeKind('blocks')).toBe('blocker')
    expect(edgeKind('conditional_blocks')).toBe('blocker')
    expect(edgeKind('waits_for')).toBe('blocker')
  })

  it('classifies parent_child as "parent"', () => {
    expect(edgeKind('parent_child')).toBe('parent')
  })

  it('classifies the informational kinds as "related"', () => {
    expect(edgeKind('related')).toBe('related')
    expect(edgeKind('tracks')).toBe('related')
    expect(edgeKind('discovered_from')).toBe('related')
    expect(edgeKind('caused_by')).toBe('related')
    expect(edgeKind('validates')).toBe('related')
    expect(edgeKind('supersedes')).toBe('related')
  })
})

describe('clampZoom', () => {
  it('clamps below ZOOM_MIN', () => {
    expect(clampZoom(0)).toBe(ZOOM_MIN)
    expect(clampZoom(-5)).toBe(ZOOM_MIN)
    expect(clampZoom(ZOOM_MIN / 2)).toBe(ZOOM_MIN)
  })

  it('clamps above ZOOM_MAX', () => {
    expect(clampZoom(99)).toBe(ZOOM_MAX)
    expect(clampZoom(ZOOM_MAX * 2)).toBe(ZOOM_MAX)
  })

  it('returns the input unchanged when in range', () => {
    expect(clampZoom(1)).toBe(1)
    expect(clampZoom(0.5)).toBe(0.5)
    expect(clampZoom(2)).toBe(2)
  })

  it('returns 1 for NaN so a bad input cannot poison the state', () => {
    expect(clampZoom(Number.NaN)).toBe(1)
  })
})

describe('zoomAroundPoint', () => {
  it('keeps the cursor-pinned layout point stable after a zoom in', () => {
    const before = { panX: 0, panY: 0, zoom: 1 }
    const cursor = { x: 200, y: 100 }
    // Zoom in by 10%. The layout point under (200, 100) is
    // (200, 100) at zoom=1; after the zoom it should still be
    // under (200, 100).
    const after = zoomAroundPoint(before, cursor, 1.1)
    const layoutXBefore = (cursor.x - before.panX) / before.zoom
    const layoutYBefore = (cursor.y - before.panY) / before.zoom
    const layoutXAfter = (cursor.x - after.panX) / after.zoom
    const layoutYAfter = (cursor.y - after.panY) / after.zoom
    expect(layoutXAfter).toBeCloseTo(layoutXBefore, 6)
    expect(layoutYAfter).toBeCloseTo(layoutYBefore, 6)
  })

  it('keeps the cursor-pinned layout point stable after a zoom out', () => {
    const before = { panX: 100, panY: 50, zoom: 2 }
    const cursor = { x: 400, y: 300 }
    const after = zoomAroundPoint(before, cursor, 1 / 1.2)
    const layoutXBefore = (cursor.x - before.panX) / before.zoom
    const layoutYBefore = (cursor.y - before.panY) / before.zoom
    const layoutXAfter = (cursor.x - after.panX) / after.zoom
    const layoutYAfter = (cursor.y - after.panY) / after.zoom
    expect(layoutXAfter).toBeCloseTo(layoutXBefore, 6)
    expect(layoutYAfter).toBeCloseTo(layoutYBefore, 6)
  })

  it('returns the input unchanged when the zoom delta would breach a clamp', () => {
    const before = { panX: 10, panY: 20, zoom: ZOOM_MAX }
    const cursor = { x: 0, y: 0 }
    // Try to zoom in past ZOOM_MAX — must return current state.
    const after = zoomAroundPoint(before, cursor, 2)
    expect(after).toBe(before)
  })
})

describe('computeLayout', () => {
  it('assigns x/y to every input node', () => {
    const graph = makeGraph(
      [makeNode({ id: 'a' }), makeNode({ id: 'b' }), makeNode({ id: 'c' })],
      []
    )
    const layout = computeLayout(graph)
    expect(layout.nodes.length).toBe(3)
    for (const node of layout.nodes) {
      expect(typeof node.x).toBe('number')
      expect(typeof node.y).toBe('number')
    }
  })

  it('returns a polyline per edge between known nodes', () => {
    const graph = makeGraph(
      [makeNode({ id: 'a' }), makeNode({ id: 'b' })],
      [{ source: 'a', target: 'b', depType: 'blocks' }]
    )
    const layout = computeLayout(graph)
    expect(layout.edges.length).toBe(1)
    expect(layout.edges[0]?.points.length).toBeGreaterThanOrEqual(2)
  })

  it('drops edges whose target is not in the node set', () => {
    const graph = makeGraph(
      [makeNode({ id: 'a' })],
      [
        { source: 'a', target: 'ghost', depType: 'blocks' },
        { source: 'ghost2', target: 'a', depType: 'related' },
      ]
    )
    const layout = computeLayout(graph)
    // Both edges are filtered (source or target missing).
    for (const edge of layout.edges) {
      expect(edge.points.length).toBe(0)
    }
  })

  it('handles an empty graph without throwing', () => {
    const layout = computeLayout({ nodes: [], edges: [] })
    expect(layout.nodes).toEqual([])
    expect(layout.edges).toEqual([])
    expect(layout.width).toBe(0)
    expect(layout.height).toBe(0)
  })

  it('lays out parent-child edges so the parent epic sits above the child (TB direction)', () => {
    // Three levels: parent → child → grandchild. The Rust edge
    // is `(child → parent)` per bd's "child depends on parent"
    // semantics; computeLayout reverses it before dagre so the
    // parent lands upstream in TB (parent y < child y).
    const graph = makeGraph(
      [makeNode({ id: 'p' }), makeNode({ id: 'c' }), makeNode({ id: 'g' })],
      [
        { source: 'c', target: 'p', depType: 'parent_child' },
        { source: 'g', target: 'c', depType: 'parent_child' },
      ]
    )
    const layout = computeLayout(graph)
    const byId = new Map(layout.nodes.map(n => [n.id, n]))
    const py = byId.get('p')?.y ?? Number.NaN
    const cy = byId.get('c')?.y ?? Number.NaN
    const gy = byId.get('g')?.y ?? Number.NaN
    // Parent sits above child which sits above grandchild.
    expect(py).toBeLessThan(cy)
    expect(cy).toBeLessThan(gy)
    // The LaidOutEdge reports the swapped direction (blocker →
    // dependent) so the SVG arrow tail/head line up with the
    // "X blocks Y" mental model.
    const pcEdge = layout.edges.find(e => e.depType === 'parent_child')
    expect(pcEdge?.source).toBe('p')
    expect(pcEdge?.target).toBe('c')
  })

  it('is deterministic: same input yields the same coordinates', () => {
    const graph = makeGraph(
      [makeNode({ id: 'a' }), makeNode({ id: 'b' }), makeNode({ id: 'c' })],
      [
        { source: 'b', target: 'a', depType: 'blocks' },
        { source: 'c', target: 'b', depType: 'blocks' },
      ]
    )
    const first = computeLayout(graph)
    const second = computeLayout(graph)
    expect(second.nodes.map(n => ({ id: n.id, x: n.x, y: n.y }))).toEqual(
      first.nodes.map(n => ({ id: n.id, x: n.x, y: n.y }))
    )
  })
})

describe('centreOnLayout', () => {
  it('centres the layout box in the viewport at zoom=1', () => {
    const layout = {
      nodes: [],
      edges: [],
      width: 1000,
      height: 500,
    }
    const viewport = { width: 1200, height: 800 }
    const result = centreOnLayout(layout, viewport)
    expect(result.zoom).toBe(1)
    // panX = (viewport.width - layout.width) / 2 = (1200-1000)/2 = 100
    expect(result.panX).toBe(100)
    expect(result.panY).toBe((800 - 500) / 2)
  })

  it('returns the origin for a zero-sized layout (no centering move)', () => {
    const result = centreOnLayout(
      { nodes: [], edges: [], width: 0, height: 0 },
      { width: 800, height: 600 }
    )
    expect(result).toEqual({ panX: 0, panY: 0, zoom: 1 })
  })
})
