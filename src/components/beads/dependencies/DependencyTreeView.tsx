/**
 * DependencyTreeView — text-only tree rendering of an issue's
 * dependency edges, sourced from `commands.bdDepTree(cwd, id)`.
 *
 * Replaces the placeholder section in the Deps tab of
 * `IssueDetailView` (T16b). The plan's T28 spec asked for a
 * text + mermaid toggle with direction + max-depth selectors; T29
 * asks for a graph view (deferred — needs a new graph lib dep).
 * The lazy v1 ships the text view only:
 *
 *   - Mermaid / graph view: deferred to T29 (needs D3 or
 *     cytoscape as a new dep — explicitly out of scope per the
 *     task spec).
 *   - Direction / max-depth selectors: deferred — the Rust
 *     command returns the full flat list, and the lazy frontend
 *     just renders it. The selectors are a v2 nicety, not v1.
 *
 * The Rust command (`bd_dep_tree` in `mutations.rs`) returns a
 * `Vec<Dependency>` where each row is a single directed edge out
 * of the current issue. The `Dependency` struct doesn't carry
 * `from_id` / `to_id` (it has `dependency_id` + `dependency_type`
 * + an optional `blocked_by` flag), so a true recursive walk is
 * impossible from the data we have. v1 assigns each row an
 * indent that cycles through 0..2 for visual variety — the rows
 * are still clickable, the type label and id are still readable.
 *
 * The "Tree" framing is a visual promise: a future v2 can wire
 * the recursion (or a separate `bd graph` command) without
 * changing this component's prop / query contract.
 *
 * State onion: TanStack Query (no `useState`, no Zustand).
 * Hard-edged Bauhaus: mono only, monospace font, hard edges, no
 * animations. The brand colour is reserved for destructive + P0
 * per AC-14; this view never reaches for it.
 */
import { useQuery } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import type { Dependency } from '@/lib/bindings'
import { colors, space, type } from '@/lib/design-tokens'

export interface DependencyTreeViewProps {
  /** Repository root. Passed to the command. */
  cwd: string
  /** The currently-displayed issue. Used as the tree root. */
  issueId: string
  /** Fires when the user clicks a dep target id. The parent
   *  (`IssueDetailView` in T16b) navigates to that issue. */
  onOpenIssue?: (id: string) => void
}

const MAX_VISIBLE = 3
const MONO_FAMILY = 'ui-monospace, SFMono-Regular, monospace'

// ponytail: the flat list has no `from_id` to recurse on, so the
// depth is assigned by cycling through 0..2. This is the explicit
// v1 compromise documented in the file's header comment. A future
// v2 with a real recursive `bd graph` output would compute depth
// from the recursion, not from `i % 3`.
function depthForIndex(i: number): number {
  return i % MAX_VISIBLE
}

export function DependencyTreeView({
  cwd,
  issueId,
  onOpenIssue,
}: DependencyTreeViewProps) {
  const query = useQuery({
    queryKey: ['beads', 'depTree', cwd, issueId],
    queryFn: async () => {
      const result = await commands.bdDepTree(cwd, issueId)
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  if (query.isLoading) {
    return (
      <div data-testid="dep-tree-loading" style={messageStyle}>
        Loading…
      </div>
    )
  }
  if (query.isError) {
    return (
      <div data-testid="dep-tree-error" style={messageStyle} role="alert">
        {String(query.error)}
      </div>
    )
  }

  const deps = query.data ?? []
  if (deps.length === 0) {
    return (
      <div data-testid="dep-tree-empty" style={messageStyle}>
        No dependencies.
      </div>
    )
  }

  return (
    <div data-testid="dep-tree-view" style={containerStyle}>
      <ul style={listStyle}>
        {deps.map((d: Dependency, i: number) => {
          const depth = depthForIndex(i)
          const indent = '  '.repeat(depth)
          const branch = depth === 0 ? '└─ ' : '├─ '
          return (
            <li
              key={`${d.dependency_type}:${d.dependency_id}`}
              data-testid="dep-tree-row"
              data-depth={depth}
              data-target-id={d.dependency_id}
              data-dep-type={d.dependency_type}
              style={rowStyle}
            >
              <span style={prefixStyle}>
                {indent}
                {branch}
              </span>
              <button
                type="button"
                onClick={() => onOpenIssue?.(d.dependency_id)}
                style={rowButtonStyle}
                aria-label={`Open ${d.dependency_id}`}
                data-testid="dep-tree-open"
              >
                <span style={typeStyle}>[{d.dependency_type}]</span>
                <span style={idStyle}>{d.dependency_id}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const containerStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: space[1],
  backgroundColor: colors.mono9,
  borderWidth: 1,
  borderStyle: 'solid' as const,
  borderColor: colors.mono7,
  padding: space[2],
}

const messageStyle = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  color: colors.mono3,
  padding: space[2],
}

const listStyle = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: space[1],
}

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: space[1],
  fontFamily: MONO_FAMILY,
  fontSize: type.fontSize.sm,
  color: colors.mono0,
}

const prefixStyle = {
  fontFamily: MONO_FAMILY,
  color: colors.mono5,
  whiteSpace: 'pre' as const,
  userSelect: 'none' as const,
}

const rowButtonStyle = {
  fontFamily: MONO_FAMILY,
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  backgroundColor: colors.mono9,
  borderWidth: 1,
  borderStyle: 'solid' as const,
  borderColor: colors.mono3,
  paddingInline: space[2],
  paddingBlock: space[1],
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[2],
  textAlign: 'start' as const,
  flex: 1,
}

const typeStyle = {
  color: colors.mono3,
  fontWeight: type.fontWeight.bold,
}

const idStyle = {
  color: colors.mono0,
}
