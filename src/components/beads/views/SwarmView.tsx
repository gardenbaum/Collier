/**
 * SwarmView — read-only list of swarm molecules (T39).
 *
 * ponytail: the plan was two sections (active swarms with current step
 * and all swarms with metadata). v1 is a JSON dump of
 * `bd swarm list --json` in a monospace `<pre>`. v2 will split into the
 * two sections and add the current-step indicator.
 *
 * State onion (per AGENTS.md): server state in TanStack Query
 * (`['beads', 'swarm-list']` keyspace).
 *
 * Hard-edged Bauhaus: mono only, hard edges, inline `style` with design
 * tokens. Mono palette only (AC-14). No animations, no transitions, no shadow,
 * no radius.
 */
import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import { colors, space, type } from '@/lib/design-tokens'

export interface SwarmViewProps {
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

export function SwarmView({ cwd }: SwarmViewProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['beads', 'swarm-list', cwd],
    queryFn: async () => {
      const result = await commands.runBdCommand(
        ['swarm', 'list', '--json'],
        cwd
      )
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  return (
    <section data-testid="swarm-view" style={containerStyle}>
      <h2 style={headingStyle}>Swarms</h2>

      {isLoading ? (
        <div data-testid="swarm-loading" style={messageStyle}>
          Loading…
        </div>
      ) : null}

      {error ? (
        <div data-testid="swarm-error" style={errorStyle} role="alert">
          {formatError(error)}
        </div>
      ) : null}

      {!isLoading && !error && data ? (
        <pre data-testid="swarm-pre" style={preStyle}>
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
  return 'Failed to load swarms.'
}

export default SwarmView
