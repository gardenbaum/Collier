/**
 * BlockedView — lists issues that have at least one open dependency
 * (bd blocked --json).
 *
 * ponytail: simple list of `Issue` rows fetched via `commands.bdBlocked`.
 * The plan called for this to be a thin wrapper over `IssueListView` (T15),
 * but T15 doesn't exist yet, so this is a self-contained list. Refactor to
 * wrap `IssueListView` when T15 lands — see the deviation note in the
 * notepad.
 *
 * State onion (per AGENTS.md): server state lives in TanStack Query
 * (`['beads', 'blocked']` keyspace), no local component state beyond the
 * loading / error / empty / populated branch.
 *
 * Hardcoded English: matches the Wave 1 / T20 bootstrap pattern. i18n
 * keys for the issues namespace are a future task.
 */
import { useQuery } from '@tanstack/react-query'
import { Ban } from 'lucide-react'
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

export interface BlockedViewProps {
  /** Repository root. Hardcoded to '/fake' in the bootstrap pattern; the
   *  Wave 8 layout will thread the real selected repo through. */
  cwd: string
}

/**
 * List view for `bd blocked`. Skeleton → error → empty → populated.
 */
export function BlockedView({ cwd }: BlockedViewProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['beads', 'blocked', cwd],
    queryFn: async () => {
      const result = await commands.bdBlocked(cwd)
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
    <section data-testid="blocked-view" style={containerStyle}>
      <h2 style={headingStyle}>Blocked ({count})</h2>

      {isLoading ? <IssueSummarySkeleton testidPrefix="blocked" /> : null}

      {error ? (
        <div data-testid="blocked-error" style={errorStyle} role="alert">
          {formatError(error, 'Failed to load blocked issues.')}
        </div>
      ) : null}

      {!isLoading && !error && count === 0 ? (
        <div data-testid="blocked-empty">
          <EmptyState
            icon={Ban}
            title="Nothing blocked"
            body="Issues blocked by dependencies will appear here."
          />
        </div>
      ) : null}

      {!isLoading && !error && count > 0 ? (
        <ul
          data-testid="blocked-list"
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
        >
          {issues.map(issue => (
            <IssueSummaryRow
              key={issue.id}
              issue={issue}
              isKeyboardSelected={issue.id === selectedRowId}
              testidPrefix="blocked"
            />
          ))}
        </ul>
      ) : null}
    </section>
  )
}
