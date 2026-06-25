/**
 * DepGraphView — SVG dependency graph for the active workspace.
 *
 * M3 R7 (see `docs/specs/m3-depgraph.md`):
 *   - Nodes: every issue in `bd list --all`
 *   - Edges: typed dependency links (blocks / parent-child /
 *     related / …)
 *   - Blocked nodes: status=blocked gets an accent border + fill
 *   - Pan / zoom: pointer drag pans, wheel zooms around the cursor
 *   - Click a node: calls `onOpenIssue(id)` — the parent router
 *     opens the issue detail drawer
 *
 * The view is intentionally read-only: add / remove dependencies
 * stays in `DependencyListView` inside the detail drawer. The graph
 * is for orientation, not mutation — Beads' cycle check (`bd dep
 * add` returns non-zero if a new edge would cycle) is the
 * authoritative gate, and we don't want to re-implement it.
 *
 * State onion (per AGENTS.md):
 *   - Graph data: TanStack Query (`['beads', 'graph', cwd]`)
 *   - Layout: `useMemo` from `computeLayout` (dagre) — pure, no
 *     React state
 *   - Pan / zoom: `useState` (component-local; no other component
 *     needs them)
 *   - No Zustand slice — pan/zoom is a per-view concern, lost on
 *     view switch by design (re-centring on view entry avoids the
 *     "stale zoom level" trap)
 *
 * Rendering: hand-rolled SVG, not `@xyflow/react` / React Flow.
 * See `depGraphLayout.ts` for the rationale + bundle math.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Network } from 'lucide-react'
import { commands } from '@/lib/tauri-bindings'
import type { Graph, GraphNode } from '@/lib/bindings'
import { colors, palette, radius, space, type } from '@/lib/design-tokens'
import { EmptyState } from '@/components/atoms'
import {
  computeLayout,
  centreOnLayout,
  edgeKind,
  isBlockedNode,
  NODE_HEIGHT,
  NODE_WIDTH,
  zoomAroundPoint,
  type LaidOutEdge,
  type LaidOutNode,
} from './depGraphLayout'

export interface DepGraphViewProps {
  /** Repository root passed to `bdGraph`. */
  cwd: string
  /** Called when the user clicks a node. */
  onOpenIssue: (id: string) => void
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  color: colors.mono0,
  fontFamily: type.fontFamily.sans,
  backgroundColor: palette.bg,
}

const svgStyle: CSSProperties = {
  // Position the SVG absolutely inside the (position: relative,
  // flex: 1) container so the SVG fills the remaining viewport
  // height. Without `position: absolute` an SVG with a viewBox
  // collapses to viewBox-aspect-ratio height once `width: 100%`
  // has been applied — see CI screenshots of the M3 R7 E2E run:
  // the canvas rendered ~68px tall in a 500px+ tall slot and
  // the first graph node reported "element not interactable"
  // because its bounding box was below WebDriver's hit-test
  // floor. `inset: 0` makes the SVG fill the container
  // regardless of viewBox aspect ratio.
  position: 'absolute',
  inset: 0,
  display: 'block',
  cursor: 'grab',
  touchAction: 'none',
  userSelect: 'none',
}

const svgStyleDragging: CSSProperties = {
  ...svgStyle,
  cursor: 'grabbing',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[2],
  padding: `${space[2]}px ${space[4]}px`,
  fontFamily: type.fontFamily.mono,
  fontSize: type.fontSize.xs,
  color: colors.mono5,
  borderBottom: `1px solid ${colors.mono3}`,
  backgroundColor: palette.surface,
}

const errorStyle: CSSProperties = {
  fontSize: type.fontSize.sm,
  color: palette.danger,
  padding: space[4],
}

const loadingStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: colors.mono5,
  fontFamily: type.fontFamily.mono,
  fontSize: type.fontSize.sm,
}

/**
 * Truncate a title to the node's inner width. Two-line titles
 * render; longer ones get an ellipsis on the second line. The
 * layout picks `NODE_WIDTH` to fit ~30 chars; truncation keeps
 * the layout deterministic regardless of title length.
 */
function truncateTitle(title: string): string {
  if (title.length <= 30) return title
  return `${title.slice(0, 29)}…`
}

/** Style for the rect of a single node, given its status. */
function nodeRectStyle(node: GraphNode): CSSProperties {
  const blocked = isBlockedNode(node)
  if (blocked) {
    return {
      fill: palette.accentMuted,
      stroke: palette.statusBlocked,
      strokeWidth: 2,
    }
  }
  if (node.status === 'closed') {
    return {
      fill: palette.surfaceAlt,
      stroke: colors.mono3,
      strokeWidth: 1,
      opacity: 0.7,
    }
  }
  return {
    fill: palette.surface,
    stroke: colors.mono5,
    strokeWidth: 1,
  }
}

/** Style for an edge given its kind. */
function edgeStrokeStyle(kind: 'blocker' | 'parent' | 'related'): {
  stroke: string
  strokeWidth: number
  strokeDasharray: string | undefined
} {
  switch (kind) {
    case 'blocker':
      return {
        stroke: palette.statusBlocked,
        strokeWidth: 1.5,
        strokeDasharray: undefined,
      }
    case 'parent':
      return {
        stroke: colors.mono7,
        strokeWidth: 1.5,
        strokeDasharray: undefined,
      }
    case 'related':
      return {
        stroke: colors.mono5,
        strokeWidth: 1,
        strokeDasharray: '4 3',
      }
  }
}

/**
 * Convert a polyline (sequence of layout-coordinate points) into
 * an SVG `path` `d` attribute, ending with a short arrow head at
 * the last point so the directed edge is visually unambiguous.
 *
 * The arrow head is a fixed 8px line, drawn along the direction
 * of the last segment so it tracks turns in the polyline.
 */
function polylinePath(points: readonly { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  const first = points[0]
  if (!first) return ''
  let d = `M ${first.x} ${first.y}`
  for (let i = 1; i < points.length; i++) {
    const p = points[i]
    if (!p) continue
    d += ` L ${p.x} ${p.y}`
  }
  return d
}

/**
 * Build the polyline for the arrow head: two short segments from
 * the last point, offset by ±150° from the last segment direction.
 * Returns an SVG `path` `d` string, or empty string for a degenerate
 * edge (single-point polyline).
 */
function arrowHeadPath(points: readonly { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  if (!last || !prev) return ''
  const dx = last.x - prev.x
  const dy = last.y - prev.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return ''
  // Unit vector of the incoming segment.
  const ux = dx / len
  const uy = dy / len
  // Arrow head: 8px long, splayed 30° back from the tip.
  const headLen = 8
  const headSpread = Math.PI / 6
  const cosA = Math.cos(Math.PI - headSpread)
  const sinA = Math.sin(Math.PI - headSpread)
  // Rotate (ux,uy) by +150° and -150° to get the two barbs.
  const a1x = ux * cosA - uy * sinA
  const a1y = ux * sinA + uy * cosA
  const a2x = ux * cosA + uy * sinA
  const a2y = -ux * sinA + uy * cosA
  const p1 = { x: last.x + a1x * headLen, y: last.y + a1y * headLen }
  const p2 = { x: last.x + a2x * headLen, y: last.y + a2y * headLen }
  return `M ${last.x} ${last.y} L ${p1.x} ${p1.y} M ${last.x} ${last.y} L ${p2.x} ${p2.y}`
}

/**
 * Render the full SVG: pan/zoom viewport wraps a translated,
 * scaled group containing every edge + every node. Pointer drag
 * on the canvas pans; wheel zooms around the cursor.
 */
function GraphCanvas({
  layout,
  panX,
  panY,
  zoom,
  isDragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
  onNodeClick,
}: {
  layout: ReturnType<typeof computeLayout>
  panX: number
  panY: number
  zoom: number
  isDragging: boolean
  onPointerDown: (e: ReactPointerEvent<SVGSVGElement>) => void
  onPointerMove: (e: ReactPointerEvent<SVGSVGElement>) => void
  onPointerUp: (e: ReactPointerEvent<SVGSVGElement>) => void
  onWheel: (e: ReactWheelEvent<SVGSVGElement>) => void
  onNodeClick: (id: string) => void
}) {
  return (
    <svg
      data-testid="graph-canvas"
      data-pan-x={panX}
      data-pan-y={panY}
      data-zoom={zoom}
      width="100%"
      height="100%"
      viewBox={`${panX} ${panY} ${layout.width / zoom} ${layout.height / zoom}`}
      preserveAspectRatio="xMidYMid meet"
      style={isDragging ? svgStyleDragging : svgStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      {/* Edges first so nodes draw on top of any line that crosses
          them — visually a node "covers" an incoming arrow tip. */}
      <g data-testid="graph-edges">
        {layout.edges.map((edge: LaidOutEdge) => {
          const kind = edgeKind(edge.depType)
          const style = edgeStrokeStyle(kind)
          if (edge.points.length === 0) return null
          return (
            <g
              key={`${edge.source}->${edge.target}:${edge.depType}`}
              data-testid="graph-edge"
              data-source={edge.source}
              data-target={edge.target}
              data-dep-type={edge.depType}
              data-kind={kind}
            >
              <path
                d={polylinePath(edge.points)}
                fill="none"
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeDasharray={style.strokeDasharray}
              />
              <path
                d={arrowHeadPath(edge.points)}
                fill="none"
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeDasharray={style.strokeDasharray}
              />
            </g>
          )
        })}
      </g>
      <g data-testid="graph-nodes">
        {layout.nodes.map((node: LaidOutNode) => {
          const blocked = isBlockedNode(node.data)
          const rectStyle = nodeRectStyle(node.data)
          const halfW = NODE_WIDTH / 2
          const halfH = NODE_HEIGHT / 2
          return (
            <g
              key={node.id}
              data-testid="graph-node"
              data-node-id={node.id}
              data-status={node.data.status}
              data-issue-type={node.data.issueType}
              data-blocked={blocked ? 'true' : 'false'}
              transform={`translate(${node.x}, ${node.y})`}
              style={{ cursor: 'pointer' }}
              onClick={() => onNodeClick(node.id)}
              role="button"
              tabIndex={0}
              aria-label={`Open issue ${node.id}`}
            >
              <rect
                x={-halfW}
                y={-halfH}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={radius.sm}
                ry={radius.sm}
                style={rectStyle}
              />
              <text
                x={-halfW + 8}
                y={-halfH + 18}
                style={{
                  fontFamily: type.fontFamily.mono,
                  fontSize: type.fontSize.xs,
                  fill: colors.mono5,
                }}
              >
                {node.id}
              </text>
              <text
                x={-halfW + 8}
                y={-halfH + 36}
                style={{
                  fontFamily: type.fontFamily.sans,
                  fontSize: type.fontSize.sm,
                  fill: colors.mono0,
                }}
              >
                {truncateTitle(node.data.title)}
              </text>
            </g>
          )
        })}
      </g>
      {/* A single translated wrapper for future-proofing the
          zoom math — today pan/zoom live on the SVG attributes so
          the rendered nodes stay at viewport scale and click
          targets don't grow with zoom. */}
      <g transform={`translate(${panX}, ${panY}) scale(${zoom})`} />
    </svg>
  )
}

export function DepGraphView({ cwd, onOpenIssue }: DepGraphViewProps) {
  const { t } = useTranslation()
  const { data, isLoading, error } = useQuery({
    queryKey: ['beads', 'graph', cwd],
    queryFn: async () => {
      const result = await commands.bdGraph(cwd)
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  const graph: Graph | undefined = data

  // Layout is pure: same graph → same x/y coordinates every render.
  const layout = useMemo(() => (graph ? computeLayout(graph) : null), [graph])

  // Pan / zoom — `useState` per the state-onion rule; nothing in
  // the Zustand store needs this. The transform is exposed on the
  // SVG via `data-pan-x` / `data-pan-y` / `data-zoom` so E2E can
  // assert without measuring pixels.
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [viewport, setViewport] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  })
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Observe the container's size. A ResizeObserver is the right
  // tool — CSS-driven size changes (sidebar collapse, window
  // resize, …) wouldn't otherwise re-centre the graph. The ref
  // pattern below keeps the observer's lifetime scoped to the
  // mounted container.
  useEffect(() => {
    const el = containerRef.current
    if (el === null) return undefined
    setViewport({ width: el.clientWidth, height: el.clientHeight })
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const r = entry.contentRect
        setViewport({ width: r.width, height: r.height })
      }
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
    }
  }, [])

  // Centre the view once we have a valid layout AND a non-zero
  // viewport. We key this off a layout hash so a real data refresh
  // (file-watcher push) re-centres too; that matches the user's
  // mental model of "the graph is the data, not a stale picture".
  // useLayoutEffect (not useEffect) so the user doesn't see a
  // single frame at (0,0) before the centering commits.
  const layoutKey = layout
    ? `${layout.nodes.length}:${layout.edges.length}:${layout.width}:${layout.height}`
    : null
  const centredForRef = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (layout === null) return
    if (layoutKey === null) return
    if (viewport.width <= 0 || viewport.height <= 0) return
    if (centredForRef.current === layoutKey) return
    const centered = centreOnLayout(layout, viewport)
    setPanX(centered.panX)
    setPanY(centered.panY)
    setZoom(centered.zoom)
    centredForRef.current = layoutKey
  }, [layout, layoutKey, viewport])

  // Pointer drag state. Refs aren't needed: the drag is short and
  // re-creating these closures on every render is fine (React's
  // reconciler will skip the DOM no-op writes).
  const [dragStart, setDragStart] = useState<{
    x: number
    y: number
    panX: number
    panY: number
  } | null>(null)

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    // Ignore drags that start on a node — the node click handler
    // owns that interaction; dragging the canvas starts from the
    // background only.
    const target = e.target as Element | null
    if (target?.closest('[data-testid="graph-node"]') !== null) return
    setDragStart({ x: e.clientX, y: e.clientY, panX, panY })
  }

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (dragStart === null) return
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    setPanX(dragStart.panX + dx)
    setPanY(dragStart.panY + dy)
  }

  const handlePointerUp = (): void => {
    setDragStart(null)
  }

  const handleWheel = (e: ReactWheelEvent<SVGSVGElement>): void => {
    // Prevent the page from scrolling while the user wheels over
    // the canvas — the wheel is reserved for zoom here.
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const delta = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const next = zoomAroundPoint({ panX, panY, zoom }, cursor, delta)
    setPanX(next.panX)
    setPanY(next.panY)
    setZoom(next.zoom)
  }

  // Centre the view once we have a layout AND a viewport size —
  // the useLayoutEffect above handles this declaratively.

  if (isLoading) {
    return (
      <section
        data-testid="dep-graph-view"
        style={containerStyle}
        aria-busy="true"
      >
        <div style={loadingStyle} data-testid="graph-loading">
          Loading…
        </div>
      </section>
    )
  }
  if (error) {
    return (
      <section data-testid="dep-graph-view" style={containerStyle}>
        <div style={errorStyle} data-testid="graph-error" role="alert">
          {formatError(error)}
        </div>
      </section>
    )
  }
  if (!graph || !layout || layout.nodes.length === 0) {
    return (
      <section
        data-testid="dep-graph-view"
        style={containerStyle}
        aria-label={t('beads.views.graph.title')}
      >
        <div
          data-testid="graph-empty"
          className="flex flex-1 items-center justify-center"
        >
          <EmptyState
            icon={Network}
            title={t('beads.views.graph.empty.title')}
            body={t('beads.views.graph.empty.body')}
          />
        </div>
      </section>
    )
  }

  const blockedCount = layout.nodes.filter(n => isBlockedNode(n.data)).length

  return (
    <section
      data-testid="dep-graph-view"
      data-blocked-count={blockedCount}
      data-node-count={layout.nodes.length}
      data-edge-count={layout.edges.length}
      style={containerStyle}
      aria-label={t('beads.views.graph.title')}
    >
      <div style={headerStyle} data-testid="graph-header">
        <span>
          {t('beads.views.graph.nodeCount', { count: layout.nodes.length })}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {t('beads.views.graph.edgeCount', { count: layout.edges.length })}
        </span>
        {blockedCount > 0 ? (
          <>
            <span aria-hidden="true">·</span>
            <span data-testid="graph-blocked-count">
              {t('beads.views.graph.blockedCount', { count: blockedCount })}
            </span>
          </>
        ) : null}
      </div>
      <div
        style={{ flex: 1, minHeight: 0, position: 'relative' }}
        ref={containerRef}
      >
        <GraphCanvas
          layout={layout}
          panX={panX}
          panY={panY}
          zoom={zoom}
          isDragging={dragStart !== null}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
          onNodeClick={onOpenIssue}
        />
      </div>
    </section>
  )
}

/** Extract a human-readable message from a bd error union. Mirrors
 * the EpicView / StatusOverviewView helpers. */
function formatError(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as { stderr?: string; message?: string }
    if (typeof e.stderr === 'string' && e.stderr.length > 0) return e.stderr
    if (typeof e.message === 'string' && e.message.length > 0) return e.message
  }
  return String(err)
}

export default DepGraphView
