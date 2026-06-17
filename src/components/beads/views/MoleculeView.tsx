/**
 * MoleculeView — read-only view of a single bd molecule (T37).
 *
 * ponytail: the plan called for a structured view (header / progress /
 * children / wisp sections). v1 is a JSON dump of `bd mol show <id> --json`
 * rendered in a monospace `<pre>`. v2 will parse the real shape once the
 * CLI's response stabilizes and add the progress bar / children list. The
 * test mocks `commands.runBdCommand`, so the command is fixed in test and
 * can be retargeted later without changing the test surface.
 *
 * State onion (per AGENTS.md): server state lives in TanStack Query
 * (`['beads', 'molecule']` keyspace), no local component state beyond
 * the loading / error / populated branch.
 *
 * Hard-edged Bauhaus: mono only, hard edges, inline `style` with design
 * tokens. Mono palette only (AC-14 reserves the brand colour for destructive + P0). No
 * animations, no transitions, no shadow, no radius.
 */
import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import { colors, space, type } from '@/lib/design-tokens'

export interface MoleculeViewProps {
  /** Repository root. */
  cwd: string
  /** Molecule id (e.g. `beads-1`). */
  moleculeId: string
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

// ponytail: BdOutput is `{ type: "json", value } | { type: "text", value }`.
// We pretty-print whichever variant arrives; text is shown as-is.
function unwrap(output: { type: string; value: unknown } | undefined): string {
  if (!output) return ''
  if (output.type === 'text' && typeof output.value === 'string') {
    return output.value
  }
  return JSON.stringify(output.value, null, 2)
}

export function MoleculeView({ cwd, moleculeId }: MoleculeViewProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['beads', 'molecule', cwd, moleculeId],
    queryFn: async () => {
      const result = await commands.runBdCommand(
        ['mol', 'show', moleculeId, '--json'],
        cwd
      )
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  return (
    <section data-testid="molecule-view" style={containerStyle}>
      <h2 style={headingStyle}>Molecule {moleculeId}</h2>

      {isLoading ? (
        <div data-testid="molecule-loading" style={messageStyle}>
          Loading…
        </div>
      ) : null}

      {error ? (
        <div data-testid="molecule-error" style={errorStyle} role="alert">
          {formatError(error)}
        </div>
      ) : null}

      {!isLoading && !error && data ? (
        <pre data-testid="molecule-pre" style={preStyle}>
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
  return 'Failed to load molecule.'
}

export default MoleculeView
