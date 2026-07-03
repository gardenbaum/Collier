/**
 * StatusOverviewView — per-status counts as clickable cards.
 *
 * M2 R6 in the milestone. Reads the full issue list via
 * `commands.bdList(cwd, {})` (the Rust command passes `--all` so
 * closed issues are visible by default — see
 * src-tauri/src/beads/list.rs), tallies a count per status, and
 * renders the results as a card grid:
 *
 *   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
 *   │ Open   │ │ In prog│ │ Blocked│ │ Deferr │ │ Closed │
 *   │  10    │ │   3    │ │   2    │ │   2    │ │   8    │
 *   │ ████░░ │ │ ██░░░░ │ │ █░░░░░ │ │ █░░░░░ │ │ ██████ │
 *   └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
 *
 * Each card is a button. Clicking it:
 *   1. sets the workspace view to 'list' so the user lands on the
 *      filtered table instead of staying on the overview page
 *      (which would be empty after the click), and
 *   2. sets the issue-filter store's `status` dimension to a
 *      single-element array with this status. AND-composition with
 *      other dimensions is preserved (priority / type / labels /
 *      assignees survive the click).
 *
 * Statuses are derived from the data, not hardcoded — the Beads
 * schema allows user-defined custom statuses in v2 (per
 * docs/CONSTITUTION.md §3). The 5 known statuses render first in
 * lifecycle order (open → in_progress → blocked → deferred →
 * closed) so the layout is deterministic across workspaces, then
 * any extra statuses discovered in the data append in alphabetical
 * order with a default palette color so the E2E contract doesn't
 * regress when a custom status sneaks in.
 *
 * State onion: server state lives in TanStack Query
 * (`['beads', 'list', cwd, {}]` keyspace); UI state (loading,
 * error, empty, grid) is derived in the component. The filter
 * store is the only mutable side-effect (click handler).
 */
import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BarChart3 } from 'lucide-react'
import { commands } from '@/lib/tauri-bindings'
import type { Issue } from '@/lib/bindings'
import { colors, palette, radius, space, type } from '@/lib/design-tokens'
import { formatError } from '@/lib/error-format'
import { EmptyState } from '@/components/atoms'
import { useWorkspaceStore } from '@/store/workspace-store'
import { useIssueFilterStore } from '@/store/issue-filter-store'

export interface StatusOverviewViewProps {
  /** Repository root passed to `bd list`. */
  cwd: string
}

/**
 * Lifecycle order for the canonical v1 statuses — matches
 * IssueListView's `statusRank` so the overview reads the same way
 * as the list. Stored as a `string[]` because `IssueStatus` is
 * now a plain string on the wire (custom statuses are first-class
 * per `docs/CONSTITUTION.md §3`).
 */
const KNOWN_STATUS_ORDER: readonly string[] = [
  'open',
  'in_progress',
  'blocked',
  'deferred',
  'closed',
]

/**
 * Default palette color per canonical v1 status. Custom statuses
 * fall back to `palette.textMuted` so they still render readably
 * even though we have no opinion about their colour.
 */
const STATUS_COLOR: Record<string, string> = {
  open: palette.statusOpen,
  in_progress: palette.statusInProgress,
  blocked: palette.statusBlocked,
  deferred: palette.statusDeferred,
  closed: palette.statusClosed,
}

/** i18n key suffix per canonical v1 status — maps to
 * `beads.status.<key>` in every locale. Custom statuses get their
 * raw string as the label (no i18n entry). */
const STATUS_I18N_KEY: Record<string, string> = {
  open: 'open',
  in_progress: 'inProgress',
  blocked: 'blocked',
  deferred: 'deferred',
  closed: 'closed',
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  color: colors.mono0,
  fontFamily: type.fontFamily.sans,
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: space[3],
  padding: space[4],
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
}

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
  padding: space[4],
  backgroundColor: palette.surface,
  border: `1px solid ${colors.mono3}`,
  borderRadius: radius.md,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'start',
  color: colors.mono0,
  transition: 'border-color 120ms ease-out, transform 120ms ease-out',
}

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[2],
}

const dotStyle = (color: string): CSSProperties => ({
  width: 10,
  height: 10,
  borderRadius: 9999,
  backgroundColor: color,
  flexShrink: 0,
})

const labelStyle: CSSProperties = {
  fontSize: type.fontSize.xs,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: colors.mono5,
  fontWeight: type.fontWeight.semibold,
}

const valueStyle = (color: string): CSSProperties => ({
  fontSize: '32px',
  fontWeight: type.fontWeight.semibold,
  color,
  lineHeight: 1.1,
  fontVariantNumeric: 'tabular-nums',
})

const trackStyle: CSSProperties = {
  position: 'relative',
  height: 6,
  width: '100%',
  backgroundColor: colors.mono3,
  borderRadius: radius.sm,
  overflow: 'hidden',
}

const fillStyle = (percent: number, color: string): CSSProperties => ({
  position: 'absolute',
  insetBlockStart: 0,
  insetInlineStart: 0,
  height: '100%',
  width: `${Math.max(0, Math.min(100, percent))}%`,
  backgroundColor: color,
  transition: 'width 120ms ease-out',
})

const percentStyle: CSSProperties = {
  fontSize: type.fontSize.xs,
  color: colors.mono5,
  fontFamily: type.fontFamily.mono,
  fontVariantNumeric: 'tabular-nums',
}

const errorStyle: CSSProperties = {
  fontSize: type.fontSize.sm,
  color: palette.danger,
  padding: space[4],
}

const loadingStyle: CSSProperties = {
  padding: space[4],
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: space[3],
}

const skeletonCardStyle: CSSProperties = {
  height: 96,
  backgroundColor: colors.mono3,
  borderRadius: radius.md,
  opacity: 0.6,
}

const footerStyle: CSSProperties = {
  padding: `${space[2]}px ${space[4]}px`,
  fontSize: type.fontSize.xs,
  color: colors.mono5,
  borderTop: `1px solid ${colors.mono3}`,
  backgroundColor: palette.surface,
  fontFamily: type.fontFamily.mono,
}

interface StatusCard {
  /** Wire enum value (or custom string from data). */
  key: string
  /** User-facing label. */
  label: string
  /** Tailwind-safe accent color. */
  color: string
  /** Issue count for this status. */
  count: number
  /** Share of total issues (0-100), rounded for the progress bar. */
  percent: number
}

/** Compute the per-status cards. Known statuses appear in
 * lifecycle order first; any custom statuses (per Beads v2 schema)
 * discovered in the data append alphabetically. Cards with zero
 * issues still render so the user sees the full status universe
 * and can click into empty buckets. */
function computeCards(
  issues: Issue[],
  total: number,
  labelFor: (status: string) => string
): StatusCard[] {
  const counts = new Map<string, number>()
  for (const issue of issues) {
    counts.set(issue.status, (counts.get(issue.status) ?? 0) + 1)
  }

  const knownCards: StatusCard[] = KNOWN_STATUS_ORDER.map(status => {
    const count = counts.get(status) ?? 0
    return {
      key: status,
      label: labelFor(status),
      color: STATUS_COLOR[status] ?? palette.textMuted,
      count,
      percent: total === 0 ? 0 : Math.round((count / total) * 100),
    }
  })

  const customKeys = Array.from(counts.keys())
    .filter(k => !(KNOWN_STATUS_ORDER as readonly string[]).includes(k))
    .sort()

  const customCards: StatusCard[] = customKeys.map(key => {
    const count = counts.get(key) ?? 0
    return {
      key,
      label: key,
      color: palette.textMuted,
      count,
      percent: total === 0 ? 0 : Math.round((count / total) * 100),
    }
  })

  return [...knownCards, ...customCards]
}

export function StatusOverviewView({ cwd }: StatusOverviewViewProps) {
  const { t } = useTranslation()
  const setActiveView = useWorkspaceStore(s => s.setActiveView)
  const setStatus = useIssueFilterStore(s => s.toggleStatus)

  const { data, isLoading, error } = useQuery({
    queryKey: ['beads', 'list', cwd, {}],
    queryFn: async () => {
      const result = await commands.bdList(cwd, {})
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  const cards = useMemo<StatusCard[]>(
    () =>
      computeCards(data ?? [], data?.length ?? 0, status =>
        t(`beads.status.${STATUS_I18N_KEY[status] ?? status}`)
      ),
    [data, t]
  )

  const total = data?.length ?? 0

  if (isLoading) {
    return (
      <section
        data-testid="status-view"
        style={containerStyle}
        aria-busy="true"
      >
        <div data-testid="status-loading" style={loadingStyle}>
          {[0, 1, 2, 3, 4].map(i => (
            <div
              key={i}
              data-testid="status-skeleton"
              style={skeletonCardStyle}
            />
          ))}
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section data-testid="status-view" style={containerStyle}>
        <div data-testid="status-error" style={errorStyle} role="alert">
          {formatError(error)}
        </div>
      </section>
    )
  }

  if (total === 0) {
    return (
      <section
        data-testid="status-view"
        style={containerStyle}
        aria-label={t('beads.views.status.title')}
      >
        <div
          data-testid="status-empty"
          className="flex flex-1 items-center justify-center"
        >
          <EmptyState
            icon={BarChart3}
            title={t('beads.views.status.empty.title')}
            body={t('beads.views.status.empty.body')}
          />
        </div>
      </section>
    )
  }

  return (
    <section
      data-testid="status-view"
      style={containerStyle}
      aria-label={t('beads.views.status.title')}
    >
      <div data-testid="status-grid" role="list" style={gridStyle}>
        {cards.map(card => (
          <StatusCardButton
            key={card.key}
            card={card}
            onActivate={() => {
              // Filter click — replace any existing status filter
              // with this single status, switch to the list view
              // so the user lands on the filtered table.
              const current = useIssueFilterStore.getState().status
              // Normalise: clear every status currently set, then
              // set exactly this one. `toggleStatus` toggles, so
              // we call it once for every previously-active
              // status to remove them, then once to add the
              // target.
              for (const s of current) {
                if (s !== card.key) setStatus(s)
              }
              if (!current.includes(card.key)) {
                setStatus(card.key)
              }
              setActiveView('list')
            }}
          />
        ))}
      </div>
      <div data-testid="status-footer" style={footerStyle}>
        {t('beads.views.status.total', { count: total })}
      </div>
    </section>
  )
}

interface StatusCardButtonProps {
  card: StatusCard
  onActivate: () => void
}

function StatusCardButton({ card, onActivate }: StatusCardButtonProps) {
  const { t } = useTranslation()
  const ariaLabel = t('beads.views.status.filterAria', {
    label: card.label,
    count: card.count,
  }) as string

  return (
    <button
      type="button"
      role="listitem"
      data-testid="status-card"
      data-status={card.key}
      data-count={card.count}
      data-percent={card.percent}
      aria-label={ariaLabel}
      onClick={onActivate}
      style={cardStyle}
    >
      <span style={cardHeaderStyle}>
        <span style={dotStyle(card.color)} aria-hidden="true" />
        <span style={labelStyle}>{card.label}</span>
      </span>
      <span data-testid="status-card-value" style={valueStyle(card.color)}>
        {card.count}
      </span>
      <span
        data-testid="status-card-bar"
        role="progressbar"
        aria-valuenow={card.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        style={trackStyle}
      >
        <span style={fillStyle(card.percent, card.color)} />
      </span>
      <span data-testid="status-card-percent" style={percentStyle}>
        {card.percent}%
      </span>
    </button>
  )
}
