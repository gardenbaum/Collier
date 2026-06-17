/**
 * SyncStatusView — read-only sync / vc / dolt status (T41).
 *
 * ponytail: the plan called for three sections (git status, dolt status,
 * last sync timestamp) plus a "Sync now" button. v1 runs the two
 * existing read-only commands (`bd vc status --json` and
 * `bd dolt status --json`) in parallel and renders each as a JSON
 * dump in a monospace `<pre>`. The "Sync now" button is intentionally
 * omitted from v1 — `bd sync` is a write and the plan gates writes
 * behind the typed-identifier confirmation pattern; adding it now
 * would require a separate decision tree. v2 will add the button +
 * a unified sync timestamp.
 *
 * State onion (per AGENTS.md): two TanStack Query instances under the
 * `['beads', 'sync', 'vc' | 'dolt']` keyspace. The two requests are
 * independent — one failure does not block the other.
 *
 * Hard-edged Bauhaus: mono only, hard edges, inline `style` with design
 * tokens. Mono palette only (AC-14). No animations, no transitions, no shadow,
 * no radius.
 */
import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import { colors, space, type } from '@/lib/design-tokens'

export interface SyncStatusViewProps {
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

export function SyncStatusView({ cwd }: SyncStatusViewProps) {
  const vcQuery = useQuery({
    queryKey: ['beads', 'sync', 'vc', cwd],
    queryFn: async () => {
      const result = await commands.runBdCommand(
        ['vc', 'status', '--json'],
        cwd
      )
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  const doltQuery = useQuery({
    queryKey: ['beads', 'sync', 'dolt', cwd],
    queryFn: async () => {
      const result = await commands.runBdCommand(
        ['dolt', 'status', '--json'],
        cwd
      )
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  return (
    <section data-testid="sync-status-view" style={containerStyle}>
      <h2 style={headingStyle}>Sync Status</h2>

      <div data-testid="sync-vc-section" style={sectionStyle}>
        <h3 style={subheadingStyle}>Version control</h3>
        {vcQuery.isLoading ? (
          <div data-testid="sync-vc-loading" style={messageStyle}>
            Loading…
          </div>
        ) : null}
        {vcQuery.error ? (
          <div data-testid="sync-vc-error" style={errorStyle} role="alert">
            {formatError(vcQuery.error)}
          </div>
        ) : null}
        {!vcQuery.isLoading && !vcQuery.error && vcQuery.data ? (
          <pre data-testid="sync-vc-pre" style={preStyle}>
            {unwrap(vcQuery.data)}
          </pre>
        ) : null}
      </div>

      <div data-testid="sync-dolt-section" style={sectionStyle}>
        <h3 style={subheadingStyle}>Dolt</h3>
        {doltQuery.isLoading ? (
          <div data-testid="sync-dolt-loading" style={messageStyle}>
            Loading…
          </div>
        ) : null}
        {doltQuery.error ? (
          <div data-testid="sync-dolt-error" style={errorStyle} role="alert">
            {formatError(doltQuery.error)}
          </div>
        ) : null}
        {!doltQuery.isLoading && !doltQuery.error && doltQuery.data ? (
          <pre data-testid="sync-dolt-pre" style={preStyle}>
            {unwrap(doltQuery.data)}
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
  return 'Failed to load sync status.'
}

export default SyncStatusView
