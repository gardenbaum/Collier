/**
 * StatusListView — shared skeleton/error/empty/rows layout for the
 * per-status issue lists (`BlockedView`, `ReadyView`).
 *
 * Why this exists
 * ---------------
 * `BlockedView` and `ReadyView` were byte-identical apart from the
 * `bd blocked` / `bd ready` IPC call, the heading copy, the empty-state
 * copy, the empty-state icon, the `errorFallback` for `formatError`,
 * and the `blocked-*` / `ready-*` testid prefix. The visual chrome
 * (container, heading, skeleton wrapper, error box, empty-state,
 * row list) was 100% identical and got flagged by `bun run jscpd`
 * as a 14L/52T import-block clone pair plus a 14L/53T useQuery clone
 * pair. The shared style constants already live in
 * `./issue-summary-styles.ts` (extracted earlier) — this component
 * hoists the JSX structure itself.
 *
 * `BlockedView` and `ReadyView` are now thin wrappers that supply
 * the per-status props and render `<StatusListView />`. The two
 * wrappers exist to (a) keep the per-status command keypath
 * (`commands.bdBlocked` vs `commands.bdReady`) discoverable from
 * grep and (b) preserve the two separate React component identities
 * that downstream code may key against.
 *
 * See also
 *   - `./BlockedView` — wrapper for `commands.bdBlocked`.
 *   - `./ReadyView` — wrapper for `commands.bdReady`.
 *   - `./IssueSummaryRow` — the row markup, keyed on `testidPrefix`.
 *   - `./IssueSummarySkeleton` — the 3-row loading skeleton.
 *   - `./issue-summary-styles` — shared CSSProperties for these views.
 */
import type { ComponentType, SVGProps } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useWorkspaceStore } from '@/store/workspace-store'
import { formatError } from '@/lib/error-format'
import { EmptyState } from '@/components/atoms'
import type { Issue, Result } from '@/lib/bindings'
import { IssueSummaryRow } from './IssueSummaryRow'
import { IssueSummarySkeleton } from './IssueSummarySkeleton'
import {
  containerStyle,
  headingStyle,
  errorStyle,
} from './issue-summary-styles'

/** Icon shape accepted by `lucide-react` (and any compatible set). */
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

export interface StatusListViewProps {
  /** Repository root. The view fetches `queryFn(cwd)` for this path. */
  cwd: string
  /**
   * TanStack Query key prefix. The view appends `cwd` to this prefix,
   * so callers pass the bare IPC name (`['beads', 'blocked']` or
   * `['beads', 'ready']`) and the realtime sync + invalidation hooks
   * continue to target the prefix without coupling to this component.
   */
  queryKey: readonly unknown[]
  /**
   * Async IPC fetch returning a Result-shaped promise. The view
   * throws on `result.status === 'error'` so the error surfaces
   * through TanStack Query's `error` channel.
   */
  queryFn: (cwd: string) => Promise<Result<Issue[], unknown>>
  /** Heading copy (e.g. `"Blocked"`, `"Ready"`). */
  heading: string
  /**
   * Testid prefix; the view emits
   * `${testidPrefix}-view` / `-loading` / `-error` / `-empty` / `-list` / `-row`.
   * Existing callers pass `"blocked"` or `"ready"`.
   */
  testidPrefix: string
  /** Icon for the empty-state surface (e.g. `Ban`, `Inbox`). */
  emptyIcon: IconComponent
  /** Title for the empty-state surface. */
  emptyTitle: string
  /** Body copy for the empty-state surface. */
  emptyBody: string
  /** Fallback copy passed to `formatError(error, fallback)` on the error branch. */
  errorFallback: string
}

/**
 * Skeleton → error → empty → populated list for a per-status IPC.
 * Renders the same outer `<section>` chrome as the previous inline
 * versions of `BlockedView` and `ReadyView`, with the per-status
 * variation driven by props rather than copy-paste.
 */
export function StatusListView({
  cwd,
  queryKey,
  queryFn,
  heading,
  testidPrefix,
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyBody,
  errorFallback,
}: StatusListViewProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKey, cwd],
    queryFn: async () => {
      const result = await queryFn(cwd)
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
    <section data-testid={`${testidPrefix}-view`} style={containerStyle}>
      <h2 style={headingStyle}>
        {heading} ({count})
      </h2>

      {isLoading ? <IssueSummarySkeleton testidPrefix={testidPrefix} /> : null}

      {error ? (
        <div
          data-testid={`${testidPrefix}-error`}
          style={errorStyle}
          role="alert"
        >
          {formatError(error, errorFallback)}
        </div>
      ) : null}

      {!isLoading && !error && count === 0 ? (
        <div data-testid={`${testidPrefix}-empty`}>
          <EmptyState icon={EmptyIcon} title={emptyTitle} body={emptyBody} />
        </div>
      ) : null}

      {!isLoading && !error && count > 0 ? (
        <ul
          data-testid={`${testidPrefix}-list`}
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
        >
          {issues.map(issue => (
            <IssueSummaryRow
              key={issue.id}
              issue={issue}
              isKeyboardSelected={issue.id === selectedRowId}
              testidPrefix={testidPrefix}
            />
          ))}
        </ul>
      ) : null}
    </section>
  )
}
