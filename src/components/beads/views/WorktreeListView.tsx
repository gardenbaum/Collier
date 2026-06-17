/**
 * WorktreeListView — read-only list of worktrees / branches (T40).
 *
 * ponytail: the plan called for `bd worktree list --json`. bd 1.0.5 has
 * no `worktree` subcommand; the closest is `bd branch --json` which
 * returns `{ branches: [...], current: "main", schema_version: 1 }`.
 * v1 dumps that JSON in a monospace `<pre>`. v2 will render the table
 * with path / branch / current / last-activity columns. No
 * create/remove/switch UI per the plan's OUT list — opening a worktree
 * in a new window requires Tauri WindowBuilder and is deferred.
 *
 * State onion (per AGENTS.md): server state in TanStack Query
 * (`['beads', 'worktrees']` keyspace).
 *
 * Hard-edged Bauhaus: mono only, hard edges, inline `style` with design
 * tokens. Mono palette only (AC-14). No animations, no transitions, no shadow,
 * no radius.
 */
import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import { colors, space, type } from '@/lib/design-tokens'

export interface WorktreeListViewProps {
  /** Repository root. */
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
  fontSize: type.fontSize.lg,
  fontWeight: type.fontWeight.bold,
  lineHeight: type.lineHeight.tight,
  margin: 0,
}

const preStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.sm,
  lineHeight: type.lineHeight.normal,
  color: colors.mono0,
  backgroundColor: colors.mono9,
  borderTop: `1px solid ${colors.mono7}`,
  padding: space[3],
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

const messageStyle: CSSProperties = {
  fontSize: type.fontSize.sm,
  color: colors.mono3,
  padding: space[4],
}

const errorStyle: CSSProperties = {
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  padding: space[4],
  backgroundColor: colors.mono9,
  borderTop: `1px solid ${colors.mono7}`,
}

function unwrap(output: { type: string; value: unknown } | undefined): string {
  if (!output) return ''
  if (output.type === 'text' && typeof output.value === 'string') {
    return output.value
  }
  return JSON.stringify(output.value, null, 2)
}

export function WorktreeListView({ cwd }: WorktreeListViewProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['beads', 'worktrees', cwd],
    queryFn: async () => {
      // ponytail: bd 1.0.5 has no `bd worktree`; `bd branch` is the
      // closest read-only list and shares the schema.
      const result = await commands.runBdCommand(['branch', '--json'], cwd)
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  return (
    <section data-testid="worktree-list-view" style={containerStyle}>
      <h2 style={headingStyle}>Worktrees / Branches</h2>

      {isLoading ? (
        <div data-testid="worktree-loading" style={messageStyle}>
          Loading…
        </div>
      ) : null}

      {error ? (
        <div data-testid="worktree-error" style={errorStyle} role="alert">
          {formatError(error)}
        </div>
      ) : null}

      {!isLoading && !error && data ? (
        <pre data-testid="worktree-pre" style={preStyle}>
          {unwrap(data)}
        </pre>
      ) : null}
    </section>
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
  return 'Failed to load worktrees.'
}

export default WorktreeListView
