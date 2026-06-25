/**
 * ReadyView — lists issues that have no open dependencies (bd ready --json).
 *
 * ponytail: simple list of `Issue` rows fetched via `commands.bdReady({ cwd })`.
 * The plan called for this to be a thin wrapper over `IssueListView` (T15),
 * but T15 doesn't exist yet, so this is a self-contained list. Refactor to
 * wrap `IssueListView` when T15 lands — see the deviation note in the
 * notepad.
 *
 * State onion (per AGENTS.md): server state lives in TanStack Query
 * (`['beads', 'ready']` keyspace), no local component state beyond the
 * loading / error / empty / populated branch.
 *
 * Hardcoded English: matches the Wave 1 / T20 bootstrap pattern. i18n
 * keys for the issues namespace are a future task.
 */
import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Inbox } from 'lucide-react'
import { commands } from '@/lib/tauri-bindings'
import type { Issue } from '@/lib/bindings'
import { useWorkspaceStore } from '@/store/workspace-store'
import { colors, space, type } from '@/lib/design-tokens'
import { EmptyState } from '@/components/atoms'
import { StatusPill } from './badges/StatusPill'
import { PriorityDot } from './badges/PriorityDot'
import { TypeIcon } from './badges/TypeIcon'
import { DependencyBadge } from './badges/DependencyBadge'

export interface ReadyViewProps {
  /** Repository root. Hardcoded to '/fake' in the bootstrap pattern; the
   *  Wave 8 layout will thread the real selected repo through. */
  cwd: string
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
  padding: space[4],
  color: colors.mono0,
  fontFamily: type.fontFamily.sans,
}

const headingStyle: CSSProperties = {
  fontSize: type.fontSize.xl,
  fontWeight: type.fontWeight.bold,
  lineHeight: type.lineHeight.tight,
  margin: 0,
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[3],
  padding: space[3],
  backgroundColor: colors.mono9,
  borderTop: `1px solid ${colors.mono7}`,
  fontSize: type.fontSize.sm,
  lineHeight: type.lineHeight.normal,
}

const titleStyle: CSSProperties = {
  fontWeight: type.fontWeight.medium,
  color: colors.mono0,
}

const idStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.xs,
  color: colors.mono5,
  marginInlineStart: 'auto',
}

const errorStyle: CSSProperties = {
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  padding: space[4],
  backgroundColor: colors.mono9,
  borderTop: `1px solid ${colors.mono7}`,
}

const skeletonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[3],
  padding: space[3],
  backgroundColor: colors.mono9,
  borderTop: `1px solid ${colors.mono7}`,
}

const skeletonBarStyle: CSSProperties = {
  height: 12,
  backgroundColor: colors.mono7,
}

// ponytail: M5 keyboard cursor indicator — matches the rest of the
// app's selected-row visual.
const rowSelectedStyle: CSSProperties = {
  backgroundColor: 'rgba(94, 106, 210, 0.18)',
  boxShadow: 'inset 2px 0 0 0 rgb(94, 106, 210)',
}

/**
 * List view for `bd ready`. Skeleton → error → empty → populated.
 */
export function ReadyView({ cwd }: ReadyViewProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['beads', 'ready', cwd],
    queryFn: async () => {
      const result = await commands.bdReady(cwd)
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  const issues = data ?? []
  const count = issues.length
  // M5 keyboard navigation: the cursor highlights the active row
  // so j/k + Enter are visual as well as functional.
  const selectedRowId = useWorkspaceStore(s => s.selectedRowId)

  return (
    <section data-testid="ready-view" style={containerStyle}>
      <h2 style={headingStyle}>Ready ({count})</h2>

      {isLoading ? <ReadySkeleton /> : null}

      {error ? (
        <div data-testid="ready-error" style={errorStyle} role="alert">
          {formatError(error)}
        </div>
      ) : null}

      {!isLoading && !error && count === 0 ? (
        <div data-testid="ready-empty">
          <EmptyState
            icon={Inbox}
            title="No ready work"
            body="When issues are unblocked, they'll show up here."
          />
        </div>
      ) : null}

      {!isLoading && !error && count > 0 ? (
        <ul
          data-testid="ready-list"
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
        >
          {issues.map(issue => (
            <ReadyRow
              key={issue.id}
              issue={issue}
              isKeyboardSelected={issue.id === selectedRowId}
            />
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function ReadyRow({
  issue,
  isKeyboardSelected,
}: {
  issue: Issue
  /** M5 keyboard navigation: highlights the row matching the cursor. */
  isKeyboardSelected: boolean
}) {
  return (
    <li
      data-testid="ready-row"
      data-kbd-nav="row"
      data-row-id={issue.id}
      data-issue-id={issue.id}
      data-row-selected={isKeyboardSelected ? 'true' : 'false'}
      aria-selected={isKeyboardSelected}
      style={{
        ...rowStyle,
        ...(isKeyboardSelected ? rowSelectedStyle : null),
      }}
    >
      <PriorityDot priority={issue.priority} />
      <TypeIcon type={issue.issue_type} />
      <StatusPill status={issue.status} />
      <span style={titleStyle}>{issue.title}</span>
      <DependencyBadge
        blockedBy={issue.dependency_count ?? 0}
        blocks={issue.dependent_count ?? 0}
      />
      <span style={idStyle}>{issue.id}</span>
    </li>
  )
}

function ReadySkeleton() {
  return (
    <div data-testid="ready-loading" style={containerStyle}>
      {[0, 1, 2].map(i => (
        <div key={i} style={skeletonStyle}>
          <div style={{ ...skeletonBarStyle, width: 8, height: 8 }} />
          <div style={{ ...skeletonBarStyle, width: 14, height: 14 }} />
          <div
            style={{ ...skeletonBarStyle, width: 80, height: 16, flex: 1 }}
          />
        </div>
      ))}
    </div>
  )
}

// ponytail: BdError is a tagged union with 10 variants; we collapse to a
// human-readable string. Falsy values fall through to a generic message so
// the user never sees `undefined`.
function formatError(err: unknown): string {
  if (err && typeof err === 'object' && 'type' in err) {
    const e = err as { type: string; message?: string; stderr?: string }
    if (e.type === 'NonZeroExit' && e.stderr) return `bd failed: ${e.stderr}`
    if ('message' in e && e.message) return e.message
    return e.type
  }
  if (err instanceof Error) return err.message
  return 'Failed to load ready issues.'
}

export default ReadyView
