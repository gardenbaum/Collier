/**
 * SearchView — single-input search over the Beads workspace.
 *
 * ponytail: state-onion splits the surface cleanly.
 *   - server data → TanStack Query, key `['beads', 'search', q]`
 *   - UI state (input text, recent searches panel) → `useState`
 *   - persistent recent searches → `localStorage` (no Zustand store needed for v1)
 *
 * Operator detection routes the query to either `bd search` (plain text)
 * or `bd query` (when the input contains `priority:`, `state=`, `>`, `<`, etc.).
 * `hasQueryOperator` is exported so the test file can verify the routing
 * directly without driving the form.
 *
 * Hard-edged Bauhaus: mono only, brand colour reserved for destructive + P0
 * per AC-14, no radius, no animation, hardcoded English. Refactor to
 * wrap a future `IssueListView` (T15) when it lands; the current row
 * pattern mirrors `ReadyView` for visual consistency.
 */
import { useState, type CSSProperties } from 'react'
import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { commands } from '@/lib/tauri-bindings'
import type { Issue } from '@/lib/bindings'
import { colors, space, type } from '@/lib/design-tokens'
import { useWorkspaceStore } from '@/store/workspace-store'
import { EmptyState } from '@/components/atoms'
import { StatusPill } from './badges/StatusPill'
import { PriorityDot } from './badges/PriorityDot'
import { TypeIcon } from './badges/TypeIcon'
import { DependencyBadge } from './badges/DependencyBadge'
import { hasQueryOperator } from './search-syntax'

const RECENT_KEY = 'collier-recent-searches'
const RECENT_MAX = 5

function pushRecent(items: string[], q: string): string[] {
  const trimmed = q.trim()
  if (trimmed.length === 0) return items
  const filtered = items.filter(x => x !== trimmed)
  return [trimmed, ...filtered].slice(0, RECENT_MAX)
}

function readRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x): x is string => typeof x === 'string')
      .slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

function writeRecent(items: string[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(items))
}

const searchInputClass =
  'w-full h-9 px-3 rounded-[var(--radius)] bg-[color:var(--secondary)] border border-[color:var(--border)] text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] focus:ring-offset-2 focus:ring-offset-[color:var(--background)] text-[13px]'

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
  padding: space[4],
  color: colors.mono0,
  fontFamily: type.fontFamily.sans,
}

const formStyle: CSSProperties = {
  display: 'flex',
  gap: space[2],
  alignItems: 'center',
}

const submitStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.medium,
  color: colors.mono0,
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[3],
  paddingBlock: space[2],
  cursor: 'pointer',
}

const recentToggleStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.medium,
  color: colors.mono3,
  backgroundColor: 'transparent',
  borderWidth: 0,
  paddingInline: 0,
  paddingBlock: 0,
  cursor: 'pointer',
  alignSelf: 'flex-start',
}

const recentPanelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[1],
  backgroundColor: colors.mono9,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono7,
  padding: space[2],
}

const recentItemStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.xs,
  color: colors.mono0,
  backgroundColor: 'transparent',
  borderWidth: 0,
  paddingInline: 0,
  paddingBlock: 0,
  textAlign: 'start',
  cursor: 'pointer',
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

// ponytail: M5 keyboard cursor indicator — matches the IssueListView
// visual (same neutral palette, same 2px left-edge ring) so the
// cursor feels uniform across views.
const rowSelectedStyle: CSSProperties = {
  backgroundColor: 'rgba(94, 106, 210, 0.18)',
  boxShadow: 'inset 2px 0 0 0 rgb(94, 106, 210)',
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

export interface SearchViewProps {
  /** Repository root. Hardcoded to '/fake' in the bootstrap pattern. */
  cwd: string
  /** Fires when the user clicks a result row. */
  onOpenIssue?: (id: string) => void
}

export function SearchView({ cwd, onOpenIssue }: SearchViewProps) {
  const [input, setInput] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [recent, setRecent] = useState<string[]>(() => readRecent())
  const [showRecent, setShowRecent] = useState(false)
  // M5 keyboard navigation: the input gets focus when the user
  // hits `/` (or runs the "Go to search" command from the palette).
  // We listen for the global focus event dispatched by
  // `use-keyboard-navigation` rather than reading a store, so the
  // view stays decoupled from the hook's internals.
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    // Auto-focus on mount. The keyboard hook dispatches
    // `collier:focus-search-input` synchronously after
    // `setActiveView('search')` — but that event fires before
    // this component has rendered and registered its listener,
    // so the dispatch is lost on the first `/`. Focusing on
    // mount closes that race and matches the user expectation:
    // pressing `/` always lands focus on the search input.
    inputRef.current?.focus()
  }, [])
  useEffect(() => {
    const handler = (): void => {
      inputRef.current?.focus()
    }
    window.addEventListener('collier:focus-search-input', handler)
    return () => {
      window.removeEventListener('collier:focus-search-input', handler)
    }
  }, [])
  const selectedRowId = useWorkspaceStore(s => s.selectedRowId)

  const { data, isLoading, error } = useQuery({
    queryKey: [
      'beads',
      'search',
      submittedQuery,
      hasQueryOperator(submittedQuery) ? 'query' : 'search',
    ],
    queryFn: async () => {
      const router = hasQueryOperator(submittedQuery)
        ? commands.bdQuery
        : commands.bdSearch
      const result = await router(cwd, submittedQuery)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    enabled: submittedQuery.length > 0,
  })

  const issues = data ?? []

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    const q = input.trim()
    if (q.length === 0) return
    setSubmittedQuery(q)
    const next = pushRecent(recent, q)
    setRecent(next)
    writeRecent(next)
  }

  const handleRecentClick = (q: string) => {
    setInput(q)
    setSubmittedQuery(q)
  }

  return (
    <section data-testid="search-view" style={containerStyle}>
      <h2 style={headingStyle}>
        Search{' '}
        {hasQueryOperator(submittedQuery) && submittedQuery
          ? `(Query: ${submittedQuery})`
          : submittedQuery
            ? `(Search: ${submittedQuery})`
            : ''}
      </h2>

      <form onSubmit={handleSubmit} style={formStyle} role="search">
        <input
          ref={inputRef}
          type="search"
          data-testid="search-input"
          placeholder="Search issues..."
          value={input}
          onChange={e => setInput(e.target.value)}
          className={searchInputClass}
          aria-label="Search issues"
        />
        <button
          type="submit"
          data-testid="search-submit-button"
          style={submitStyle}
        >
          Search
        </button>
      </form>

      {recent.length > 0 ? (
        <button
          data-testid="recent-toggle"
          style={recentToggleStyle}
          onClick={() => setShowRecent((s: boolean) => !s)}
        >
          {showRecent ? 'Hide recent' : `Recent (${recent.length})`}
        </button>
      ) : null}
      {showRecent && recent.length > 0 && (
        <div data-testid="recent-searches" style={recentPanelStyle}>
          {recent.map(q => (
            <button
              key={q}
              type="button"
              data-testid="recent-search-item"
              data-query={q}
              onClick={() => handleRecentClick(q)}
              style={recentItemStyle}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div data-testid="search-results">
        {submittedQuery.length === 0 ? (
          <div data-testid="search-prompt">
            <EmptyState
              icon={Search}
              title="Search for issues"
              body="Type a query above to find issues."
            />
          </div>
        ) : isLoading ? (
          <SearchSkeleton />
        ) : error ? (
          <div data-testid="search-error" style={errorStyle} role="alert">
            Search failed: {formatError(error)}
          </div>
        ) : issues.length === 0 ? (
          <div data-testid="search-empty">
            <EmptyState
              icon={Search}
              title="No matches"
              body="Try a different query or check your operators."
            />
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {issues.map(issue => (
              <SearchRow
                key={issue.id}
                issue={issue}
                isKeyboardSelected={issue.id === selectedRowId}
                onClick={() => onOpenIssue?.(issue.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function SearchRow({
  issue,
  onClick,
  isKeyboardSelected,
}: {
  issue: Issue
  onClick: () => void
  /**
   * M5 keyboard navigation: when true, the row gets the same
   * "selected" visual the list / epic views use. The keyboard
   * hook walks search results the same way it walks list rows —
   * `[data-testid="issue-row"][data-issue-id]` — so the only
   * additional contract here is the `data-issue-id` attribute on
   * the `<li>`. Both `search-result-row` and `search-result-button`
   * carry the id so the hook's selector can find either DOM
   * ancestor.
   */
  isKeyboardSelected: boolean
}) {
  return (
    <li
      data-testid="search-result-row"
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
      <button
        type="button"
        onClick={onClick}
        data-testid="search-result-button"
        data-issue-id={issue.id}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space[3],
          backgroundColor: 'transparent',
          borderWidth: 0,
          paddingInline: 0,
          paddingBlock: 0,
          color: colors.mono0,
          fontFamily: type.fontFamily.sans,
          fontSize: type.fontSize.sm,
          cursor: 'pointer',
          flex: 1,
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
      </button>
      <span style={idStyle}>{issue.id}</span>
    </li>
  )
}

function SearchSkeleton() {
  return (
    <div data-testid="search-loading" style={containerStyle}>
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

function formatError(err: unknown): string {
  if (err && typeof err === 'object' && 'type' in err) {
    const e = err as { type: string; message?: string; stderr?: string }
    if (e.type === 'NonZeroExit' && e.stderr) return `bd failed: ${e.stderr}`
    if ('message' in e && e.message) return e.message
    return e.type
  }
  if (err instanceof Error) return err.message
  return 'Search failed.'
}

export default SearchView
