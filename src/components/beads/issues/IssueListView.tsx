/**
 * IssueListView — virtualized list of issues backed by `bd list --json`.
 *
 * ponytail: pulls the active filter selection from `useIssueFilterStore`
 * (T17), turns it into a `ListFilters` payload, and hands both to a
 * `useQuery` whose key is `['beads', 'list', cwd, filters]`. Toggling
 * any filter checkbox in the sidebar re-keys the query and re-fetches
 * — no extra wiring.
 *
 * The list is windowed with `@tanstack/react-virtual`: the virtualizer
 * measures the scroll container, tracks the scroll position, and hands
 * us only the `getVirtualItems()` that are in (or near) the viewport.
 * At 1000 issues the DOM only ever mounts ~15 rows (5 visible + 2 *
 * OVERSCAN), regardless of how big `data` gets, and a watcher tick
 * that re-fetches the query only re-renders the windowed slice — never
 * the full list.
 *
 * Hard-edged Bauhaus: mono scale only, hard edges (radius 0), inline
 * `style` with design tokens. No animations, no transitions. The brand
 * colour is reserved for destructive + P0 per AC-14; this component
 * never reaches for it.
 */
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useQuery } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import type { Issue, ListFilters } from '@/lib/bindings'
import { useIssueFilterStore } from '@/store/issue-filter-store'
import { colors, radius, space, type } from '@/lib/design-tokens'
import { PriorityDot } from './badges/PriorityDot'
import { StatusPill } from './badges/StatusPill'
import { TypeIcon } from './badges/TypeIcon'
import { LabelChip } from './badges/LabelChip'

const ROW_HEIGHT = 40
// 5 overscan rows on each side of the viewport. Matches the previous
// manual-windowing constant so the existing test's `< 20` assertion
// still holds.
const OVERSCAN = 5

export interface IssueListViewProps {
  /** Repository root passed to `bd list`. */
  cwd: string
  /** Called when the user clicks (or Enter/Spaces on) a row. */
  onOpenIssue: (id: string) => void
  /** Optional override for the default windowing container height. */
  containerHeight?: number
}

export function IssueListView({
  cwd,
  onOpenIssue,
  containerHeight = 600,
}: IssueListViewProps) {
  // ponytail: 5 separate selectors — never destructure the whole store
  // (per AGENTS.md, that would re-render on every unrelated change).
  const status = useIssueFilterStore(s => s.status)
  const priority = useIssueFilterStore(s => s.priority)
  const storeType = useIssueFilterStore(s => s.type)
  const labels = useIssueFilterStore(s => s.labels)
  const assignees = useIssueFilterStore(s => s.assignees)

  // Build the ListFilters payload. `useMemo` keeps the queryKey stable
  // when the user toggles a checkbox on and off (the resulting array
  // is a new reference each call, but only the dimensions the user
  // actually changes do).
  const filters: ListFilters = useMemo(
    () => ({
      status: status.length > 0 ? status : undefined,
      priority: priority.length > 0 ? priority : undefined,
      // ponytail: the store uses `type` (TS-natural) but the Rust
      // struct's `#[serde(rename_all = "camelCase")]` exposes it as
      // `issueType` on the bridge. One-line rename here, no Rust
      // alias needed.
      issueType: storeType.length > 0 ? storeType : undefined,
      labels: labels.length > 0 ? labels : undefined,
      assignees: assignees.length > 0 ? assignees : undefined,
    }),
    [status, priority, storeType, labels, assignees]
  )

  const query = useQuery({
    queryKey: ['beads', 'list', cwd, filters],
    queryFn: async () => {
      const result = await commands.bdList(cwd, filters)
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  // Extract a useful human-readable message from the error object.
  // The Tauri command returns `Result<T, E>` from Rust, which specta
  // serialises as `{ status: 'error', error: <object> }` where
  // `<object>` is a discriminated union of the `BdError` variants
  // (e.g. `{ kind: 'Timeout', seconds: 120 }`). Stringifying that
  // directly gives "[object Object]" -- useless for debugging. The
  // helper below handles both shapes: a plain string (e.g. from a
  // thrown JS error) and the variant-object shape, falling back to
  // JSON for anything we don't recognise.
  const errorMessage = (() => {
    const err = query.error as unknown
    if (err == null) return ''
    if (typeof err === 'string') return err
    if (typeof err === 'object') {
      const obj = err as Record<string, unknown>
      if (typeof obj.message === 'string') return obj.message
      if (typeof obj.error === 'string') return obj.error
      try {
        return JSON.stringify(err)
      } catch {
        return String(err)
      }
    }
    return String(err)
  })()

  // ponytail: react-virtual — the scrollable container is the only
  // source of truth for scroll position. The virtualizer measures it,
  // subscribes to scroll/resize, and computes which indices are in
  // (or just outside) the viewport. We render only those.
  const scrollRef = useRef<HTMLDivElement>(null)
  const issues = query.data ?? []
  const total = issues.length

  // ponytail: `useVirtualizer` returns a non-memoizable object (it
  // re-creates internal callbacks on every render). React Compiler
  // can't safely memoize through it, hence the
  // `incompatible-library` warning. The virtualizer is the
  // authoritative source of truth for `getVirtualItems()` / scroll
  // metrics, so we accept the warning at this single call site.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: total,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  })

  // Active filter chips — one entry per non-empty dimension. Pure
  // projection over the store arrays; nothing persisted or mutated.
  const chips: { label: string; count: number }[] = []
  if (status.length > 0) chips.push({ label: 'Status', count: status.length })
  if (priority.length > 0)
    chips.push({ label: 'Priority', count: priority.length })
  if (storeType.length > 0)
    chips.push({ label: 'Type', count: storeType.length })
  if (labels.length > 0) chips.push({ label: 'Labels', count: labels.length })
  if (assignees.length > 0)
    chips.push({ label: 'Assignees', count: assignees.length })

  return (
    <section data-testid="issue-list-view" style={containerStyle}>
      {chips.length > 0 && (
        <div data-testid="filter-chips" style={chipsRowStyle}>
          {chips.map(chip => (
            <span
              key={chip.label}
              data-testid={`filter-chip-${chip.label.toLowerCase()}`}
              style={chipStyle}
            >
              {chip.label} ({chip.count})
            </span>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        style={{ ...scrollContainerStyle, height: containerHeight }}
        data-testid="issue-list-scroll"
      >
        {query.isLoading ? (
          <div data-testid="list-loading" style={statusStyle}>
            Loading…
          </div>
        ) : null}
        {query.isError ? (
          <div data-testid="list-error" style={statusStyle}>
            Failed to load: {errorMessage}
          </div>
        ) : null}
        {!query.isLoading && !query.isError && total === 0 ? (
          <div data-testid="list-empty" style={statusStyle}>
            No issues match.
          </div>
        ) : null}
        {total > 0 ? (
          // ponytail: the inner div's height is the *total* list
          // height, so the scrollbar reflects the full list. Each
          // virtual row is absolutely positioned at translateY(start)
          // and only the visible ones (plus OVERSCAN) are mounted.
          <div
            data-testid="issue-list-inner"
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: 'relative',
              width: '100%',
            }}
          >
            {rowVirtualizer.getVirtualItems().map(virtualItem => {
              const issue = issues[virtualItem.index]
              if (!issue) return null
              return (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  onClick={() => onOpenIssue(issue.id)}
                  positionStyle={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: virtualItem.size,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                />
              )
            })}
          </div>
        ) : null}
      </div>

      <footer data-testid="list-footer" style={footerStyle}>
        {total} {total === 1 ? 'issue' : 'issues'}
      </footer>
    </section>
  )
}

interface IssueRowProps {
  issue: Issue
  onClick: () => void
  /**
   * Position+size style injected by the virtualizer (absolute,
   * translateY(start), explicit height). Merged after the row's own
   * styles so the virtualizer's positioning always wins.
   */
  positionStyle: CSSProperties
}

function IssueRow({ issue, onClick, positionStyle }: IssueRowProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-testid="issue-row"
      data-issue-id={issue.id}
      style={{
        ...rowStyle,
        ...(hovered ? rowHoverStyle : null),
        ...positionStyle,
      }}
    >
      <PriorityDot priority={issue.priority} />
      <TypeIcon type={issue.issue_type} />
      <StatusPill status={issue.status} />
      <span style={titleStyle}>{issue.title}</span>
      <span style={idStyle}>{issue.id}</span>
      <div style={labelsStyle}>
        {issue.labels.map(l => (
          <LabelChip key={l.name} label={l.name} />
        ))}
      </div>
    </div>
  )
}

// ponytail: hard-coded inline styles, mono only, no brand colour.
// radius is always 0 — the design-token `radius.sm` is already 0,
// but the explicit `0` here makes the intent obvious to the next
// maintainer who reaches for the inspector.
const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
  padding: space[3],
}

const chipsRowStyle: CSSProperties = {
  display: 'flex',
  gap: space[1],
  flexWrap: 'wrap',
}

const chipStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  color: colors.mono2,
  backgroundColor: colors.mono8,
  paddingInline: space[2],
  paddingBlock: space[1],
  borderRadius: radius.sm,
}

const scrollContainerStyle: CSSProperties = {
  overflowY: 'auto',
  border: `1px solid ${colors.mono7}`,
  borderRadius: radius.sm,
}

const statusStyle: CSSProperties = {
  padding: space[4],
  color: colors.mono3,
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
}

const footerStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  color: colors.mono5,
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[2],
  height: ROW_HEIGHT,
  paddingInline: 12,
  borderRadius: 6,
  backgroundColor: 'transparent',
  transition: 'background-color 120ms cubic-bezier(0.2, 0, 0, 1)',
  cursor: 'pointer',
}

const rowHoverStyle: CSSProperties = {
  backgroundColor: 'rgba(94, 106, 210, 0.08)',
}

const titleStyle: CSSProperties = {
  flex: 1,
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const idStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.xs,
  color: colors.mono5,
}

const labelsStyle: CSSProperties = {
  display: 'flex',
  gap: space[1],
}

export default IssueListView
