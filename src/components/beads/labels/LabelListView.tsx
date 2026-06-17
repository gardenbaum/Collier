/**
 * LabelListView — searchable list of every label in the repo,
 * sourced from `bd label list-all --json` (T35).
 *
 * Layout:
 *   1. A search input that filters the visible labels by
 *      case-insensitive substring match on the label name.
 *   2. A flat list, one row per `LabelWithCount`, with the count
 *      rendered to the right. The list is already sorted by name
 *      on the Rust side (see `bd_label_list_all`), so the
 *      frontend renders rows in the order they arrive.
 *
 * State onion (per AGENTS.md):
 *   - Search input text → `useState` (component-local).
 *   - The full label list query → TanStack Query.
 *   - No Zustand needed.
 *
 * Hard-edged Bauhaus: mono only, hard edges, inline `style` with
 * design tokens. The brand colour is reserved for destructive + P0
 * per AC-14 — label UI never reaches for it. No animations, no
 * transitions, no shadow, no radius.
 *
 * Out of scope (per T35's "Must NOT do"): no label create/rename,
 * no bulk operations, no per-label detail view. Each row is a
 * passive display.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import type { LabelWithCount } from '@/lib/bindings'
import { colors, space, type } from '@/lib/design-tokens'

export interface LabelListViewProps {
  /** Repository root. Passed to `bdLabelListAll`. */
  cwd: string
}

export function LabelListView({ cwd }: LabelListViewProps) {
  const listAllQuery = useQuery({
    queryKey: ['beads', 'labelListAll', cwd],
    queryFn: async () => {
      const result = await commands.bdLabelListAll(cwd)
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  const [search, setSearch] = useState('')

  // ponytail: case-insensitive substring filter, computed from the
  // already-sorted `data`. Empty search shows everything.
  const filtered: LabelWithCount[] = useMemo(() => {
    const rows = listAllQuery.data ?? []
    const q = search.trim().toLowerCase()
    if (q.length === 0) return rows
    return rows.filter(r => r.label.toLowerCase().includes(q))
  }, [listAllQuery.data, search])

  if (listAllQuery.isLoading) {
    return (
      <section data-testid="label-list-view" style={containerStyle}>
        <div data-testid="label-list-loading" style={messageStyle}>
          Loading…
        </div>
      </section>
    )
  }
  if (listAllQuery.isError) {
    return (
      <section data-testid="label-list-view" style={containerStyle}>
        <div data-testid="label-list-error" style={messageStyle} role="alert">
          {formatError(listAllQuery.error)}
        </div>
      </section>
    )
  }

  return (
    <section data-testid="label-list-view" style={containerStyle}>
      <header style={headerStyle}>
        <h2 style={headingStyle}>
          Labels <span style={countStyle}>({filtered.length})</span>
        </h2>
        <input
          data-testid="label-list-search"
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search labels…"
          style={searchInputStyle}
          autoComplete="off"
          spellCheck={false}
          aria-label="Search labels"
        />
      </header>

      {filtered.length === 0 ? (
        <div data-testid="label-list-empty" style={messageStyle}>
          {search.trim().length === 0
            ? 'No labels yet.'
            : 'No labels match the current search.'}
        </div>
      ) : (
        <ul data-testid="label-list-rows" style={listStyle}>
          {filtered.map(row => (
            <li
              key={row.label}
              data-testid="label-list-row"
              data-label={row.label}
              data-count={row.count}
              style={rowStyle}
            >
              <span style={labelTextStyle}>{row.label}</span>
              <span style={countBadgeStyle} aria-label="Usage count">
                {row.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
  padding: space[3],
  backgroundColor: colors.mono9,
  color: colors.mono0,
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[2],
  flexWrap: 'wrap',
  paddingBottom: space[2],
  borderBottom: `1px solid ${colors.mono7}`,
}

const headingStyle: CSSProperties = {
  fontSize: type.fontSize.lg,
  fontWeight: type.fontWeight.bold,
  lineHeight: type.lineHeight.tight,
  margin: 0,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
}

const countStyle: CSSProperties = {
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.regular,
  color: colors.mono5,
}

const searchInputStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  backgroundColor: colors.mono9,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[2],
  paddingBlock: space[1],
  outline: 'none',
  minWidth: 180,
  flex: '1 1 180px',
}

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: space[1],
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[2],
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono7,
  paddingInline: space[2],
  paddingBlock: space[1],
}

const labelTextStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.sm,
  color: colors.mono0,
}

const countBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 24,
  height: 18,
  paddingInline: space[2],
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.medium,
  color: colors.mono0,
  backgroundColor: colors.mono9,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
}

const messageStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  color: colors.mono5,
  padding: space[2],
}

function formatError(err: unknown): string {
  if (err && typeof err === 'object' && 'type' in err) {
    const e = err as { type: string; message?: string; stderr?: string }
    if (e.type === 'NonZeroExit' && e.stderr) return e.stderr
    if ('message' in e && e.message) return e.message
    return e.type
  }
  if (err instanceof Error) return err.message
  return 'Action failed.'
}

export default LabelListView
