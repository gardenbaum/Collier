/**
 * IssueListView — virtualized, sortable, columnar table of issues
 * backed by `bd list --json`.
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
 * Spec R1 (M1 issue-core) — the rows are rendered as a CSS-grid table
 * with explicit columns (id, title, status, priority, type, assignee)
 * and the existing badges/icons. Headers for status / priority / type
 * / assignee / id are sortable; clicking a header flips the sort
 * direction; clicking a different header resets to `asc`. Virtualization
 * is preserved because the row layout (CSS grid template) is purely
 * visual — the virtualizer's `translateY` is the only positioning, and
 * it works on a grid row the same way it worked on the old flex row.
 *
 * Hard-edged Bauhaus: mono scale only, hard edges (radius 0), inline
 * `style` with design tokens. No animations, no transitions. The brand
 * colour is reserved for destructive + P0 per AC-14; this component
 * never reaches for it.
 */
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ArrowUpDown, X } from 'lucide-react'
import { commands } from '@/lib/tauri-bindings'
import type { Issue, ListFilters } from '@/lib/bindings'
import { useIssueFilterStore } from '@/store/issue-filter-store'
import { colors, radius, space, type } from '@/lib/design-tokens'
import { TypeIcon } from './badges/TypeIcon'
import { LabelChip } from './badges/LabelChip'
import { DependencyBadge } from './badges/DependencyBadge'
import {
  InlineAssigneeEdit,
  InlinePriorityEdit,
  InlineStatusEdit,
} from './InlineIssueEdit'

const ROW_HEIGHT = 40
const HEADER_HEIGHT = 32
// 5 overscan rows on each side of the viewport. Matches the previous
// manual-windowing constant so the existing test's `< 20` assertion
// still holds.
const OVERSCAN = 5

// ponytail: the column order is the spec R1 contract — id, title,
// status, priority, type, assignee. The same template is used by the
// header row and every body row so the columns align by construction.
// Widths are tuned for a 1200px viewport: id + the 4 narrow columns
// sum to ~470px, leaving ~730px for the title column.
const GRID_TEMPLATE = '100px minmax(0, 1fr) 130px 64px 96px 140px'

export interface IssueListViewProps {
  /** Repository root passed to `bd list`. */
  cwd: string
  /** Called when the user clicks (or Enter/Spaces on) a row. */
  onOpenIssue: (id: string) => void
  /** Optional override for the default windowing container height. */
  containerHeight?: number
}

// ponytail: SortKey is the closed set of sortable columns. Title is
// intentionally absent — the spec only requires sort for the 5
// categorical / identifier columns. `SortDirection` is `asc | desc`
// and is toggled by clicking the active header or flipped on a fresh
// header click.
export type SortKey = 'id' | 'status' | 'priority' | 'type' | 'assignee'
export type SortDirection = 'asc' | 'desc'

interface SortState {
  key: SortKey
  direction: SortDirection
}

// ponytail: each SortKey has a stable rank function so ascending
// sorts put the most natural value first. Status uses the lifecycle
// order (open → in_progress → blocked → deferred → closed) rather
// than alphabetical; priority puts P0 (highest urgency) first. Null
// assignees sink to the bottom of `asc` so unassigned issues never
// crowd out assigned ones when the user is looking for "what's
// mine".
const statusRank: Record<Issue['status'], number> = {
  open: 0,
  in_progress: 1,
  blocked: 2,
  deferred: 3,
  closed: 4,
}

// ponytail: `IssuePriority` is `#[repr(u8)] Serialize_repr` on the Rust
// side, so `bd list --json` emits priority as the bare integer 0..4
// at runtime even though the generated TS type advertises the
// "P0"|"P1"|...|"P4" string union. The sort runs in the browser over
// the live data, so the lookup keys MUST be numbers — string keys
// resolve to `undefined`, `undefined - undefined === NaN`, and the
// sort treats every pair as equal, silently leaving the list in bd's
// native order. Mirrors the EpicView priorityRank.
const priorityRank: Record<number, number> = {
  0: 0, // P0
  1: 1, // P1
  2: 2, // P2
  3: 3, // P3
  4: 4, // P4,
}

/**
 * Convert an `IssuePriority` (string union "P0".."P4") to the
 * bare-integer wire format Rust's `bd_list` deserializer expects.
 * Accepts both shapes on the way in (string OR number) so a
 * caller that already converted once is a no-op.
 */
function priorityToWire(p: string | number): number {
  if (typeof p === 'number') return p
  if (typeof p === 'string' && p.startsWith('P')) {
    return Number.parseInt(p.slice(1), 10)
  }
  return Number(p)
}

function compareIssues(a: Issue, b: Issue, sort: SortState): number {
  const sign = sort.direction === 'asc' ? 1 : -1
  switch (sort.key) {
    case 'id':
      return a.id.localeCompare(b.id) * sign
    case 'status':
      return (statusRank[a.status] - statusRank[b.status]) * sign
    case 'priority': {
      const pa = priorityRank[Number(a.priority)] ?? Number.MAX_SAFE_INTEGER
      const pb = priorityRank[Number(b.priority)] ?? Number.MAX_SAFE_INTEGER
      if (pa !== pb) return (pa - pb) * sign
      // Stable tiebreaker: by id so the E2E spec can assert on the
      // first row id when two rows share a priority bucket.
      return a.id.localeCompare(b.id) * sign
    }
    case 'type':
      return a.issue_type.localeCompare(b.issue_type) * sign
    case 'assignee': {
      // ponytail: unassigned issues sort consistently — sink to the
      // bottom of `asc`, top of `desc`. Achieved by giving `null`
      // a rank of `+Infinity` and inverting the comparison for the
      // null-on-both-sides case.
      const aOwner = a.owner ?? null
      const bOwner = b.owner ?? null
      if (aOwner === null && bOwner === null) return 0
      if (aOwner === null) return sign
      if (bOwner === null) return -sign
      return aOwner.localeCompare(bOwner) * sign
    }
  }
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
  const toggleStatus = useIssueFilterStore(s => s.toggleStatus)
  const togglePriority = useIssueFilterStore(s => s.togglePriority)
  const toggleType = useIssueFilterStore(s => s.toggleType)
  const toggleLabel = useIssueFilterStore(s => s.toggleLabel)
  const toggleAssignee = useIssueFilterStore(s => s.toggleAssignee)
  const clearAll = useIssueFilterStore(s => s.clearAll)

  // Build the ListFilters payload. `useMemo` keeps the queryKey stable
  // when the user toggles a checkbox on and off (the resulting array
  // is a new reference each call, but only the dimensions the user
  // actually changes do).
  //
  // ponytail: the filter store holds `IssuePriority` as the specta
  // string union ("P0".."P4"), but the specta-generated Rust
  // deserializer for `IssuePriority` (a `#[repr(u8)] Serialize_repr`
  // enum) reads a `u8` off the wire. The store's string values reach
  // the backend as `"P1"` and Tauri's command dispatcher rejects the
  // call with `invalid type: string "P1", expected u8` — the
  // AND-composition r2 spec hit this and surfaced it as
  // `Failed to load: invalid args 'filters'`. Map every priority
  // value to its bare integer form (0..4) at the IPC boundary so
  // the wire format matches the Rust `to_args` shape (which writes
  // `--priority 1`, `--priority 2`, …). The TS type can't be
  // widened without regenerating the bindings, so we cast through
  // `unknown` at the call site — the value is still a valid
  // `IssuePriority` from Rust's perspective (its custom
  // `Deserialize` impl accepts both the string and the integer
  // shape, see src-tauri/src/beads/types.rs).
  const filters: ListFilters = useMemo(
    () => ({
      status: status.length > 0 ? status : undefined,
      priority:
        priority.length > 0
          ? (priority.map(p =>
              priorityToWire(p)
            ) as unknown as ListFilters['priority'])
          : undefined,
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
  // ponytail: wrap in useMemo so the `sort` useMemo's dependency
  // array stays referentially stable. `query.data ?? []` creates a
  // new `[]` on every render when the query is loading — that would
  // invalidate the sort's dep array on each render and run the sort
  // comparison for every store update. Memoizing on `query.data`
  // alone keeps the reference stable for the lifetime of the data.
  const rawIssues = useMemo<Issue[]>(() => query.data ?? [], [query.data])
  const total = rawIssues.length

  // ponytail: sort state lives in component state (not Zustand) because
  // it's pure view state — nothing else in the app needs to react to
  // it, and the active sort shouldn't survive a reload. Clicking the
  // active header toggles asc/desc; clicking a different header
  // resets to `asc` so the user gets a predictable first read.
  const [sort, setSort] = useState<SortState | null>(null)
  const onSortClick = (key: SortKey) => {
    setSort(prev =>
      prev && prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    )
  }

  // ponytail: sort the windowed slice's source array in a useMemo.
  // When `sort` is null, the array keeps bd's native order so the
  // user can fall back to "as loaded" with one click on a different
  // column (clear-sort would be a follow-up card).
  const issues = useMemo(() => {
    if (sort === null) return rawIssues
    // ponytail: copy before sort — `Array.prototype.sort` mutates in
    // place and `rawIssues` is the TanStack Query cache value. We
    // MUST NOT mutate the cache; doing so would re-render the whole
    // app on the next query invalidation (the cache reference stays
    // the same but its contents are now sorted differently than any
    // other consumer expects).
    return [...rawIssues].sort((a, b) => compareIssues(a, b, sort))
  }, [rawIssues, sort])

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
  // Each chip carries a remove button (`×`) that clears that
  // dimension in one click; the trailing "Clear all" chip clears
  // every dimension. The store's per-dimension toggle actions are
  // intentionally NOT used here — a chip × removes the entire
  // dimension, not a single value (toggling N times to remove N
  // values is the wrong affordance).
  const hasAnyFilter =
    status.length > 0 ||
    priority.length > 0 ||
    storeType.length > 0 ||
    labels.length > 0 ||
    assignees.length > 0

  const removeStatus = () => {
    for (const s of [...status]) toggleStatus(s)
  }
  const removePriority = () => {
    for (const p of [...priority]) togglePriority(p)
  }
  const removeType = () => {
    for (const t of [...storeType]) toggleType(t)
  }
  const removeLabels = () => {
    for (const l of [...labels]) toggleLabel(l)
  }
  const removeAssignees = () => {
    for (const a of [...assignees]) toggleAssignee(a)
  }

  return (
    <section data-testid="issue-list-view" style={containerStyle}>
      {hasAnyFilter ? (
        <div data-testid="filter-chips" style={chipsRowStyle}>
          {status.length > 0 ? (
            <RemovableChip
              testid="filter-chip-status"
              label="Status"
              count={status.length}
              onRemove={removeStatus}
            />
          ) : null}
          {priority.length > 0 ? (
            <RemovableChip
              testid="filter-chip-priority"
              label="Priority"
              count={priority.length}
              onRemove={removePriority}
            />
          ) : null}
          {storeType.length > 0 ? (
            <RemovableChip
              testid="filter-chip-type"
              label="Type"
              count={storeType.length}
              onRemove={removeType}
            />
          ) : null}
          {labels.length > 0 ? (
            <RemovableChip
              testid="filter-chip-labels"
              label="Labels"
              count={labels.length}
              onRemove={removeLabels}
            />
          ) : null}
          {assignees.length > 0 ? (
            <RemovableChip
              testid="filter-chip-assignees"
              label="Assignees"
              count={assignees.length}
              onRemove={removeAssignees}
            />
          ) : null}
          <button
            type="button"
            data-testid="filter-clear-all"
            onClick={() => clearAll()}
            style={clearAllButtonStyle}
            aria-label="Clear all filters"
          >
            Clear all
          </button>
        </div>
      ) : null}

      <ColumnHeaders sort={sort} onSortClick={onSortClick} />

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
                  cwd={cwd}
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

interface ColumnHeadersProps {
  sort: SortState | null
  onSortClick: (key: SortKey) => void
}

/**
 * Column header row. Six columns in spec R1 order: id, title, status,
 * priority, type, assignee. Five are sortable (id, status, priority,
 * type, assignee); the title column has no header affordance because
 * it's intentionally not sortable.
 *
 * The header row uses the same CSS-grid template as the body rows so
 * columns line up by construction. Each sortable header is a real
 * `<button>` for keyboard activation (Enter/Space), with
 * `aria-sort` reflecting the current sort state for screen readers.
 */
function ColumnHeaders({ sort, onSortClick }: ColumnHeadersProps) {
  const cellBase: CSSProperties = {
    fontFamily: type.fontFamily.sans,
    fontSize: type.fontSize.xs,
    color: colors.mono5,
    fontWeight: type.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: type.letterSpacing.wide,
    paddingInline: space[2],
    display: 'flex',
    alignItems: 'center',
    height: '100%',
  }

  return (
    <div data-testid="issue-list-headers" role="row" style={headerRowStyle}>
      <SortableHeader
        label="ID"
        sortKey="id"
        sort={sort}
        onClick={onSortClick}
        style={cellBase}
        align="left"
      />
      <div role="columnheader" style={{ ...cellBase, cursor: 'default' }}>
        Title
      </div>
      <SortableHeader
        label="Status"
        sortKey="status"
        sort={sort}
        onClick={onSortClick}
        style={cellBase}
        align="left"
      />
      <SortableHeader
        label="Priority"
        sortKey="priority"
        sort={sort}
        onClick={onSortClick}
        style={cellBase}
        align="left"
      />
      <SortableHeader
        label="Type"
        sortKey="type"
        sort={sort}
        onClick={onSortClick}
        style={cellBase}
        align="left"
      />
      <SortableHeader
        label="Assignee"
        sortKey="assignee"
        sort={sort}
        onClick={onSortClick}
        style={cellBase}
        align="left"
      />
    </div>
  )
}

interface SortableHeaderProps {
  label: string
  sortKey: SortKey
  sort: SortState | null
  onClick: (key: SortKey) => void
  style: CSSProperties
  align: 'left' | 'right'
}

/**
 * Single sortable header cell. Renders a real `<button>` for keyboard
 * activation, with the current sort state encoded as `aria-sort` and
 * a small arrow icon next to the label. Inactive headers show a
 * neutral up/down indicator so the column advertises its sortability
 * without visual noise.
 */
function SortableHeader({
  label,
  sortKey,
  sort,
  onClick,
  style,
  align,
}: SortableHeaderProps) {
  const isActive = sort?.key === sortKey
  const direction: SortDirection | null = isActive ? sort.direction : null
  const ariaSort: 'ascending' | 'descending' | 'none' = direction
    ? direction === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none'

  const Icon =
    direction === 'asc'
      ? ArrowUp
      : direction === 'desc'
        ? ArrowDown
        : ArrowUpDown

  return (
    <div
      role="columnheader"
      data-testid={`sort-header-${sortKey}-column`}
      aria-sort={ariaSort}
      style={{
        ...style,
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      }}
    >
      <button
        type="button"
        data-testid={`sort-header-${sortKey}`}
        data-sort-key={sortKey}
        data-sort-direction={direction ?? 'none'}
        onClick={() => onClick(sortKey)}
        style={headerButtonStyle}
      >
        <span>{label}</span>
        <Icon
          size={11}
          aria-hidden="true"
          color={isActive ? colors.mono0 : colors.mono5}
        />
      </button>
    </div>
  )
}

interface IssueRowProps {
  issue: Issue
  onClick: () => void
  /** Repository root — passed to the inline-edit selects so
   *  `bd update` resolves against the right cwd. */
  cwd: string
  /**
   * Position+size style injected by the virtualizer (absolute,
   * translateY(start), explicit height). Merged after the row's own
   * styles so the virtualizer's positioning always wins.
   */
  positionStyle: CSSProperties
}

function IssueRow({ issue, onClick, cwd, positionStyle }: IssueRowProps) {
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
      data-issue-status={issue.status}
      data-issue-priority={issue.priority}
      data-issue-type={issue.issue_type}
      data-issue-assignee={issue.owner ?? ''}
      style={{
        ...rowStyle,
        ...(hovered ? rowHoverStyle : null),
        ...positionStyle,
      }}
    >
      <span data-column="id" style={idCellStyle}>
        {issue.id}
      </span>
      <span data-column="title" style={titleCellStyle}>
        <span style={titleTextStyle}>{issue.title}</span>
        {issue.labels.length > 0 ? (
          <span style={labelsStyle}>
            {issue.labels.map(l => (
              <LabelChip key={l.name} label={l.name} />
            ))}
          </span>
        ) : null}
        <DependencyBadge
          blockedBy={issue.dependency_count ?? 0}
          blocks={issue.dependent_count ?? 0}
        />
      </span>
      <span data-column="status" style={badgeCellStyle}>
        <InlineStatusEdit cwd={cwd} issue={issue} swallowHostEvents />
      </span>
      <span data-column="priority" style={badgeCellStyle}>
        <InlinePriorityEdit cwd={cwd} issue={issue} swallowHostEvents />
      </span>
      <span data-column="type" style={badgeCellStyle}>
        <TypeIcon type={issue.issue_type} />
      </span>
      <span data-column="assignee" style={assigneeCellStyle}>
        <InlineAssigneeEdit cwd={cwd} issue={issue} swallowHostEvents />
      </span>
    </div>
  )
}

interface RemovableChipProps {
  testid: string
  label: string
  count: number
  onRemove: () => void
}

/**
 * Active-filter chip with a remove button. One chip per non-empty
 * dimension; the × button clears the whole dimension in one click.
 *
 * The chip itself is a plain `<span>` (not a button) — the only
 * interactive element is the ×. Clicking the label body does
 * nothing; the affordance is "remove this dimension's filter".
 * That mirrors the LabelFilterChip pattern (T36).
 */
function RemovableChip({ testid, label, count, onRemove }: RemovableChipProps) {
  return (
    <span data-testid={testid} style={chipStyle}>
      <span style={chipLabelStyle}>
        {label} ({count})
      </span>
      <button
        type="button"
        data-testid={`${testid}-remove`}
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        style={chipRemoveButtonStyle}
      >
        <X size={10} aria-hidden="true" />
      </button>
    </span>
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
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[1],
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  color: colors.mono2,
  backgroundColor: colors.mono8,
  paddingInline: space[2],
  paddingBlock: space[1],
  borderRadius: radius.sm,
}

const chipLabelStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  color: colors.mono2,
}

const chipRemoveButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 14,
  padding: 0,
  margin: 0,
  background: 'transparent',
  border: 0,
  color: colors.mono3,
  cursor: 'pointer',
}

const clearAllButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 22,
  paddingInline: space[2],
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  color: colors.mono5,
  backgroundColor: 'transparent',
  border: `1px solid ${colors.mono7}`,
  borderRadius: radius.sm,
  cursor: 'pointer',
}

// ponytail: the header row is a separate flex child, NOT a sticky
// overlay over the scroll container. The body uses a translateY-
// positioned absolute child for virtualization, and a sticky
// inside-the-scroll-container header would fight react-virtual's
// measurement. Putting the header above the scroll container (a
// sibling, not a child) keeps both simple — the cost is that the
// header scrolls out of view with the body, which matches every
// other data-table convention the user has ever seen.
const headerRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: GRID_TEMPLATE,
  height: HEADER_HEIGHT,
  borderTop: `1px solid ${colors.mono7}`,
  borderBottom: `1px solid ${colors.mono7}`,
  backgroundColor: colors.mono8,
  borderRadius: radius.sm,
}

const headerButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[1],
  background: 'transparent',
  border: 0,
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  textTransform: 'inherit',
  letterSpacing: 'inherit',
  cursor: 'pointer',
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
  display: 'grid',
  gridTemplateColumns: GRID_TEMPLATE,
  alignItems: 'center',
  height: ROW_HEIGHT,
  paddingInline: space[3],
  backgroundColor: 'transparent',
  cursor: 'pointer',
}

const rowHoverStyle: CSSProperties = {
  backgroundColor: 'rgba(94, 106, 210, 0.08)',
}

// ponytail: each cell uses the grid's column alignment but constrains
// its inner content so longer values (titles, ids) clip or ellipsize
// instead of pushing the grid out of shape. Title is the only
// `minmax(0, 1fr)` column so it can absorb any extra horizontal
// space.
const idCellStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.xs,
  color: colors.mono5,
  paddingInline: space[2],
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const titleCellStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[2],
  paddingInline: space[2],
  minWidth: 0,
}

const titleTextStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  minWidth: 0,
}

const labelsStyle: CSSProperties = {
  display: 'flex',
  gap: space[1],
  flexShrink: 0,
}

const badgeCellStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  paddingInline: space[2],
  minWidth: 0,
  overflow: 'hidden',
}

const assigneeCellStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  paddingInline: space[2],
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  color: colors.mono2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export default IssueListView
