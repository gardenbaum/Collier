/**
 * StatusOverviewView — read-only dashboard of issue counts (T42).
 *
 * ponytail: the plan called for 5 sections (total counts, by priority,
 * by type, by assignee, stale) with bar charts. v1 runs three read-only
 * commands (`bd status --json`, `bd count --by-priority --json`,
 * `bd count --by-type --json`) in parallel and renders each as a JSON
 * dump in a monospace `<pre>`. v2 will parse the real shapes and
 * render the bar charts. AC-14: the brand colour is reserved for destructive +
 * P0 only — the eventual P0-only bar must use the brand colour; v1 has
 * no bar chart so it does not reach for the brand colour at all.
 *
 * State onion (per AGENTS.md): three TanStack Query instances under
 * the `['beads', 'status-overview']` keyspace. Independent failures so
 * one slow query does not block the others.
 *
 * Hard-edged Bauhaus: mono only, hard edges, inline `style` with design
 * tokens. Mono palette only (AC-14). No animations, no transitions, no shadow,
 * no radius.
 */
import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import { colors, space, type } from '@/lib/design-tokens'

export interface StatusOverviewViewProps {
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

const subheadingStyle: CSSProperties = {
  fontSize: type.fontSize.base,
  fontWeight: type.fontWeight.medium,
  lineHeight: type.lineHeight.tight,
  margin: 0,
  color: colors.mono2,
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

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
}

function unwrap(output: { type: string; value: unknown } | undefined): string {
  if (!output) return ''
  if (output.type === 'text' && typeof output.value === 'string') {
    return output.value
  }
  return JSON.stringify(output.value, null, 2)
}

export function StatusOverviewView({ cwd }: StatusOverviewViewProps) {
  const statusQuery = useQuery({
    queryKey: ['beads', 'status-overview', 'status', cwd],
    queryFn: async () => {
      const result = await commands.runBdCommand(['status', '--json'], cwd)
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  const priorityQuery = useQuery({
    queryKey: ['beads', 'status-overview', 'priority', cwd],
    queryFn: async () => {
      const result = await commands.runBdCommand(
        ['count', '--by-priority', '--json'],
        cwd
      )
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  const typeQuery = useQuery({
    queryKey: ['beads', 'status-overview', 'type', cwd],
    queryFn: async () => {
      const result = await commands.runBdCommand(
        ['count', '--by-type', '--json'],
        cwd
      )
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  return (
    <section data-testid="status-overview-view" style={containerStyle}>
      <h2 style={headingStyle}>Status Overview</h2>

      <div data-testid="status-total-section" style={sectionStyle}>
        <h3 style={subheadingStyle}>Totals</h3>
        {statusQuery.isLoading ? (
          <div data-testid="status-total-loading" style={messageStyle}>
            Loading…
          </div>
        ) : null}
        {statusQuery.error ? (
          <div data-testid="status-total-error" style={errorStyle} role="alert">
            {formatError(statusQuery.error)}
          </div>
        ) : null}
        {!statusQuery.isLoading && !statusQuery.error && statusQuery.data ? (
          <pre data-testid="status-total-pre" style={preStyle}>
            {unwrap(statusQuery.data)}
          </pre>
        ) : null}
      </div>

      <div data-testid="status-priority-section" style={sectionStyle}>
        <h3 style={subheadingStyle}>By priority</h3>
        {priorityQuery.isLoading ? (
          <div data-testid="status-priority-loading" style={messageStyle}>
            Loading…
          </div>
        ) : null}
        {priorityQuery.error ? (
          <div
            data-testid="status-priority-error"
            style={errorStyle}
            role="alert"
          >
            {formatError(priorityQuery.error)}
          </div>
        ) : null}
        {!priorityQuery.isLoading &&
        !priorityQuery.error &&
        priorityQuery.data ? (
          <pre data-testid="status-priority-pre" style={preStyle}>
            {unwrap(priorityQuery.data)}
          </pre>
        ) : null}
      </div>

      <div data-testid="status-type-section" style={sectionStyle}>
        <h3 style={subheadingStyle}>By type</h3>
        {typeQuery.isLoading ? (
          <div data-testid="status-type-loading" style={messageStyle}>
            Loading…
          </div>
        ) : null}
        {typeQuery.error ? (
          <div data-testid="status-type-error" style={errorStyle} role="alert">
            {formatError(typeQuery.error)}
          </div>
        ) : null}
        {!typeQuery.isLoading && !typeQuery.error && typeQuery.data ? (
          <pre data-testid="status-type-pre" style={preStyle}>
            {unwrap(typeQuery.data)}
          </pre>
        ) : null}
      </div>
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
  return 'Failed to load status overview.'
}

export default StatusOverviewView
