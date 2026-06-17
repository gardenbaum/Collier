/**
 * OutputRenderer — polymorphic render of a `BdOutput` (T45).
 *
 * ponytail: `BdOutput` is `{ type: "json", value: JsonValue } | { type: "text", value: string }`.
 * v1 branches on the value shape:
 *   - array of objects → table (first row's keys = header)
 *   - array of scalars → newline-joined `<pre>`
 *   - object → pretty-printed `<pre>`
 *   - string → `<pre>`
 *   - scalar → `<pre>` with the coerced string
 *   - null/undefined → empty-state message
 *   - error prop → red-equivalent mono9 panel with the error string
 *
 * The plan called for a sticky toolbar (Copy / Clear / Format toggle).
 * v1 omits the toolbar — adding a clipboard listener and a format
 * toggle now would require a new useState + a copy-to-clipboard effect
 * + a format memo. The component is a leaf renderer; any chrome
 * belongs in the parent (RawCommandPanel for T43).
 *
 * Hard-edged Bauhaus: mono only, hard edges, inline `style` with design
 * tokens. Mono palette only (AC-14). No animations, no transitions, no shadow,
 * no radius.
 */
import type { CSSProperties } from 'react'
import { colors, space, type } from '@/lib/design-tokens'

export interface OutputRendererProps {
  /** BdOutput to render. Either `value` (success) or `error` (failure)
   *  is expected; the error branch takes precedence when both are set. */
  value?: { type: string; value: unknown } | null
  error?: unknown
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
  fontFamily: type.fontFamily.sans,
  color: colors.mono0,
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

const errorStyle: CSSProperties = {
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

const emptyStyle: CSSProperties = {
  fontSize: type.fontSize.sm,
  color: colors.mono3,
  padding: space[4],
}

const tableStyle: CSSProperties = {
  borderCollapse: 'collapse',
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.sm,
  lineHeight: type.lineHeight.normal,
  color: colors.mono0,
}

const thStyle: CSSProperties = {
  borderTop: `1px solid ${colors.mono7}`,
  borderBottom: `1px solid ${colors.mono7}`,
  padding: space[2],
  textAlign: 'start',
  backgroundColor: colors.mono9,
  fontWeight: type.fontWeight.bold,
}

const tdStyle: CSSProperties = {
  borderTop: `1px solid ${colors.mono7}`,
  padding: space[2],
  textAlign: 'start',
}

function formatError(err: unknown): string {
  if (err && typeof err === 'object' && 'type' in err) {
    const e = err as { type: string; message?: string; stderr?: string }
    if (e.type === 'NonZeroExit' && e.stderr) return `bd failed: ${e.stderr}`
    if ('message' in e && e.message) return e.message
    return e.type
  }
  if (err instanceof Error) return err.message
  return String(err)
}

export function OutputRenderer({ value, error }: OutputRendererProps) {
  if (error !== undefined && error !== null) {
    return (
      <div data-testid="output-error" style={containerStyle}>
        <pre style={errorStyle} role="alert">
          {formatError(error)}
        </pre>
      </div>
    )
  }

  const inner = value?.value

  if (inner === undefined || inner === null) {
    return (
      <div data-testid="output-empty" style={emptyStyle}>
        No output.
      </div>
    )
  }

  if (typeof inner === 'string') {
    return (
      <pre data-testid="output-text" style={preStyle}>
        {inner}
      </pre>
    )
  }

  if (Array.isArray(inner)) {
    if (inner.length === 0) {
      return (
        <pre data-testid="output-list" style={preStyle}>
          (empty list)
        </pre>
      )
    }
    const first = inner[0]
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      const keys = Object.keys(first as Record<string, unknown>)
      return (
        <table data-testid="output-table" style={tableStyle}>
          <thead>
            <tr>
              {keys.map(k => (
                <th key={k} style={thStyle}>
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inner.map((row, i) => {
              const r = row as Record<string, unknown>
              return (
                <tr key={i} data-testid="output-row">
                  {keys.map(k => (
                    <td key={k} style={tdStyle}>
                      {r[k] === undefined || r[k] === null ? '' : String(r[k])}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      )
    }
    return (
      <pre data-testid="output-list" style={preStyle}>
        {inner.map(String).join('\n')}
      </pre>
    )
  }

  if (typeof inner === 'object') {
    return (
      <pre data-testid="output-object" style={preStyle}>
        {JSON.stringify(inner, null, 2)}
      </pre>
    )
  }

  return (
    <pre data-testid="output-scalar" style={preStyle}>
      {String(inner)}
    </pre>
  )
}

export default OutputRenderer
