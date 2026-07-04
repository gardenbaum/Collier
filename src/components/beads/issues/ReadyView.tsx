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
import { useQuery } from '@tanstack/react-query'
import { Inbox } from 'lucide-react'
import { commands } from '@/lib/tauri-bindings'
import { useWorkspaceStore } from '@/store/workspace-store'
import { formatError } from '@/lib/error-format'
import { EmptyState } from '@/components/atoms'
import { IssueSummaryRow } from './IssueSummaryRow'
import { IssueSummarySkeleton } from './IssueSummarySkeleton'
import {
  containerStyle,
  headingStyle,
  errorStyle,
} from './issue-summary-styles'

export interface ReadyViewProps {
  /** Repository root. Hardcoded to '/fake' in the bootstrap pattern; the
   *  Wave 8 layout will thread the real selected repo through. */
  cwd: string
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

      {isLoading ? <IssueSummarySkeleton testidPrefix="ready" /> : null}

      {error ? (
        <div data-testid="ready-error" style={errorStyle} role="alert">
          {formatError(error, 'Failed to load ready issues.')}
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
            <IssueSummaryRow
              key={issue.id}
              issue={issue}
              isKeyboardSelected={issue.id === selectedRowId}
              testidPrefix="ready"
            />
          ))}
        </ul>
      ) : null}
    </section>
  )
}
