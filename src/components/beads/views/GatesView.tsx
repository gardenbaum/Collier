/**
 * GatesView — read-only list of async workflow gates.
 *
 * M6 R-Gates-UI: surface `bd gate list` in the GUI so the operator
 * can see what's blocking their workflow without dropping to the
 * CLI. Gates are issues with `issue_type == "gate"` (see
 * `IssueType::Gate` in src-tauri/src/beads/types.rs) and the Rust
 * `bd_gate_list` command wraps `bd gate list [--all] --json`,
 * returning one `GateEntry { issue, is_closed }` per row.
 *
 * Write actions (`bd gate resolve`, `bd gate create`) are out of
 * scope for this card — the M6 goal is to *make gates visible* so
 * the operator can answer "what is blocking my workflow right
 * now" without leaving the GUI. Resolving a gate remains a CLI
 * action until a follow-up card lands the write path.
 *
 * Default scope: open gates only (`includeClosed: false`). The
 * "Show closed" toggle expands to the full history view, matching
 * the CLI's own default scope semantics. The toggle is a UI-only
 * mutation (the query key embeds `includeClosed` so the cache
 * stays correct across toggles).
 *
 * The view reuses the canonical Issue shape from the bindings —
 * each row renders the gate's title, status pill, priority dot,
 * and age. Clicking the row opens the gate's detail drawer via
 * `onOpenIssue(id)` so the operator can read the full
 * description + the issues it blocks. Per M5 keyboard nav, the
 * row buttons are focusable; the view itself does not need its
 * own keyboard layer (the global j/k layer lives on
 * IssueListView, not here — gates are a low-frequency browse).
 *
 * State onion: server state lives in TanStack Query
 * (`['beads', 'gates', cwd, includeClosed]` keyspace); UI state
 * (loading, error, empty, list) is derived in the component.
 */
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Hourglass } from 'lucide-react'
import { commands } from '@/lib/tauri-bindings'
import type { GateEntry, Issue } from '@/lib/bindings'
import { colors, palette, radius, space, type } from '@/lib/design-tokens'
import { EmptyState } from '@/components/atoms'
import { StatusPill } from '@/components/beads/issues/badges/StatusPill'
import { PriorityDot } from '@/components/beads/issues/badges/PriorityDot'

export interface GatesViewProps {
  /** Repository root passed to `bd gate list`. */
  cwd: string
  /** Called when a row is activated. */
  onOpenIssue: (id: string) => void
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  color: colors.mono0,
  fontFamily: type.fontFamily.sans,
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${space[2]}px ${space[4]}px`,
  borderBottom: `1px solid ${colors.mono3}`,
  backgroundColor: palette.surface,
  fontFamily: type.fontFamily.mono,
  fontSize: type.fontSize.xs,
  color: colors.mono5,
}

const toggleStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[2],
  background: 'transparent',
  border: `1px solid ${colors.mono3}`,
  borderRadius: radius.sm,
  padding: `${space[1]}px ${space[2]}px`,
  color: colors.mono5,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'inherit',
}

const toggleStyleActive: CSSProperties = {
  ...toggleStyle,
  borderColor: palette.accent,
  color: palette.accent,
}

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
}

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto auto',
  alignItems: 'center',
  gap: space[3],
  padding: `${space[2]}px ${space[4]}px`,
  borderBottom: `1px solid ${colors.mono3}`,
  background: 'transparent',
  border: 'none',
  borderBottomStyle: 'solid',
  borderBottomColor: colors.mono3,
  textAlign: 'start',
  cursor: 'pointer',
  width: '100%',
  color: colors.mono0,
  fontFamily: 'inherit',
}

const rowTitleStyle: CSSProperties = {
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.medium,
}

const rowMetaStyle: CSSProperties = {
  fontSize: type.fontSize.xs,
  color: colors.mono5,
  fontFamily: type.fontFamily.mono,
}

const rowClosedStyle: CSSProperties = {
  ...rowStyle,
  opacity: 0.55,
}

const errorStyle: CSSProperties = {
  fontSize: type.fontSize.sm,
  color: palette.danger,
  padding: space[4],
}

const loadingRowStyle: CSSProperties = {
  height: 36,
  backgroundColor: colors.mono3,
  opacity: 0.5,
  margin: space[2],
  borderRadius: radius.sm,
}

/** Format an ISO timestamp as a short relative "5m ago" / "2d ago"
 * label. The bd wire format is RFC 3339; we parse it with `Date`
 * (no chrono on the TS side) so the render works in any timezone
 * the user happens to be in. */
function relativeAge(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const diffMs = Date.now() - t
  if (diffMs < 60_000) return 'just now'
  if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)}m ago`
  if (diffMs < 86_400_000) return `${Math.round(diffMs / 3_600_000)}h ago`
  return `${Math.round(diffMs / 86_400_000)}d ago`
}

/** Extract a human-readable message from a bd error union. Mirrors
 * the helpers in EpicView and StatusOverviewView so the rendered
 * text matches what other views show. Kept local — only used
 * inside the error branch. */
function formatError(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as { stderr?: string; message?: string }
    if (typeof e.stderr === 'string' && e.stderr.length > 0) return e.stderr
    if (typeof e.message === 'string' && e.message.length > 0) return e.message
  }
  return String(err)
}

/**
 * Render one row of the gates list. Stateless — the parent owns
 * the data and the click handler. The `issue` shape is the same
 * `Issue` struct the rest of the app reads; we render the title,
 * status pill, priority dot, and an "x min ago" age label.
 */
function GateRow({
  entry,
  onActivate,
}: {
  entry: GateEntry
  onActivate: () => void
}) {
  const issue: Issue = entry.issue
  const isClosed = entry.isClosed
  const style = isClosed ? rowClosedStyle : rowStyle
  return (
    <button
      type="button"
      role="listitem"
      data-testid="gate-row"
      data-gate-id={issue.id}
      data-gate-status={issue.status}
      data-gate-closed={isClosed ? 'true' : 'false'}
      aria-label={issue.title}
      onClick={onActivate}
      style={style}
    >
      <StatusPill status={issue.status} />
      <span style={rowTitleStyle}>
        <span>{issue.title}</span>
        <span style={rowMetaStyle}> · {issue.id}</span>
      </span>
      <PriorityDot priority={issue.priority} />
      <span style={rowMetaStyle}>{relativeAge(issue.created_at)}</span>
    </button>
  )
}

export function GatesView({ cwd, onOpenIssue }: GatesViewProps) {
  const { t } = useTranslation()
  // Toggle is local UI state — flipping it refetches the same
  // command with `includeClosed: true` (the Rust command reads
  // the `include_closed` arg and passes `--all` to `bd gate list`).
  const [includeClosed, setIncludeClosed] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['beads', 'gates', cwd, includeClosed],
    queryFn: async () => {
      const result = await commands.bdGateList(cwd, includeClosed)
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  if (isLoading) {
    return (
      <section data-testid="gates-view" style={containerStyle} aria-busy="true">
        <div data-testid="gates-loading" style={listStyle}>
          {[0, 1, 2].map(i => (
            <div key={i} data-testid="gates-skeleton" style={loadingRowStyle} />
          ))}
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section data-testid="gates-view" style={containerStyle}>
        <div data-testid="gates-error" style={errorStyle} role="alert">
          {formatError(error)}
        </div>
      </section>
    )
  }

  const entries = data ?? []
  const openCount = entries.filter(e => !e.isClosed).length

  return (
    <section
      data-testid="gates-view"
      style={containerStyle}
      aria-label={t('beads.views.gates.title')}
    >
      <div data-testid="gates-toolbar" style={toolbarStyle}>
        <span>
          {includeClosed
            ? t('beads.views.gates.total', { count: entries.length })
            : t('beads.views.gates.openCount', { count: openCount })}
        </span>
        <button
          type="button"
          data-testid="gates-toggle-include-closed"
          data-active={includeClosed ? 'true' : 'false'}
          onClick={() => setIncludeClosed(v => !v)}
          style={includeClosed ? toggleStyleActive : toggleStyle}
        >
          {t('beads.views.gates.includeClosed')}
        </button>
      </div>
      {entries.length === 0 ? (
        <div
          data-testid="gates-empty"
          className="flex flex-1 items-center justify-center"
        >
          <EmptyState
            icon={Hourglass}
            title={t('beads.views.gates.empty.title')}
            body={t('beads.views.gates.empty.body')}
          />
        </div>
      ) : (
        <ul data-testid="gates-list" role="list" style={listStyle}>
          {entries.map(entry => (
            <li key={entry.issue.id} style={{ listStyle: 'none' }}>
              <GateRow
                entry={entry}
                onActivate={() => onOpenIssue(entry.issue.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default GatesView
