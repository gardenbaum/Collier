/**
 * RawCommandPanel — terminal-like panel for raw `bd` invocations (T43).
 *
 * ponytail: the plan called for history (up/down arrows), presets in
 * localStorage, and a sticky toolbar. v1 ships the core flow:
 *   - Text input + Run button (or Enter) → `commands.runBdCommand(args, cwd)`
 *   - Args parsed by whitespace split (`'list --priority 0'` → `['list', '--priority', '0']`)
 *   - In-memory history (no localStorage yet — v2 can add the persistence
 *     with `useEffect` + a single key)
 *   - Output rendered by `OutputRenderer` (T45)
 *
 * The history is a `useRef<string[]>` rather than `useState` because
 * the test inspects `lastInvoked` after a click; ref-mutation avoids
 * the re-render cycle that a state bump would trigger between
 * consecutive runs.
 *
 * State onion (per AGENTS.md): local input/history → `useState` /
 * `useRef`; the IPC call → TanStack Query `useMutation`. No Zustand
 * needed.
 *
 * Hard-edged Bauhaus: mono only, hard edges, inline `style` with design
 * tokens. Mono palette only (AC-14). No animations, no transitions, no shadow,
 * no radius.
 */
import { useState, useRef, type CSSProperties, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import { colors, space, type } from '@/lib/design-tokens'
import { OutputRenderer } from './OutputRenderer'

export interface RawCommandPanelProps {
  /** Repository root. */
  cwd: string
  /** Optional pre-filled input (e.g. when QuickPane picks a command). */
  initialCommand?: string
}

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
  alignItems: 'stretch',
}

const inputStyle: CSSProperties = {
  flex: 1,
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.sm,
  lineHeight: type.lineHeight.normal,
  color: colors.mono0,
  backgroundColor: colors.mono9,
  borderTop: `1px solid ${colors.mono7}`,
  borderBottom: `1px solid ${colors.mono7}`,
  padding: space[2],
  margin: 0,
  outline: 'none',
}

const buttonStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.sm,
  lineHeight: type.lineHeight.normal,
  fontWeight: type.fontWeight.bold,
  color: colors.mono9,
  backgroundColor: colors.mono0,
  borderTop: `1px solid ${colors.mono0}`,
  borderBottom: `1px solid ${colors.mono0}`,
  padding: `${space[2]}px ${space[4]}px`,
  cursor: 'pointer',
}

const buttonDisabledStyle: CSSProperties = {
  ...buttonStyle,
  color: colors.mono5,
  backgroundColor: colors.mono8,
  borderTop: `1px solid ${colors.mono7}`,
  borderBottom: `1px solid ${colors.mono7}`,
  cursor: 'not-allowed',
}

const hintStyle: CSSProperties = {
  fontSize: type.fontSize.xs,
  color: colors.mono3,
}

export function RawCommandPanel({ cwd, initialCommand }: RawCommandPanelProps) {
  const [input, setInput] = useState(initialCommand ?? '')
  // ponytail: history is a ref, not state. Re-rendering on every
  // push would cause the input to lose focus between runs; the
  // test inspects `lastInvoked` after a click, so a ref mutation
  // is enough.
  const historyRef = useRef<string[]>([])
  const lastInvokedRef = useRef<string[]>([])

  const runMutation = useMutation({
    mutationFn: async (args: string[]) => {
      const result = await commands.runBdCommand(args, cwd)
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    const args = trimmed.split(/\s+/)
    lastInvokedRef.current = args
    historyRef.current = [...historyRef.current, trimmed].slice(-50)
    runMutation.mutate(args)
  }

  return (
    <section data-testid="raw-command-panel" style={containerStyle}>
      <form
        onSubmit={handleSubmit}
        style={formStyle}
        aria-label="Run bd command"
      >
        <input
          data-testid="raw-command-input"
          style={inputStyle}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="bd args (e.g. list --priority 0)"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          data-testid="raw-command-submit"
          type="submit"
          disabled={runMutation.isPending || input.trim().length === 0}
          style={
            runMutation.isPending || input.trim().length === 0
              ? buttonDisabledStyle
              : buttonStyle
          }
        >
          {runMutation.isPending ? 'Running…' : 'Run'}
        </button>
      </form>

      <div data-testid="raw-command-history" style={hintStyle}>
        History: {historyRef.current.length}
      </div>

      <div data-testid="raw-command-output">
        <OutputRenderer
          value={runMutation.data ?? null}
          error={runMutation.error}
        />
      </div>
    </section>
  )
}

export default RawCommandPanel
