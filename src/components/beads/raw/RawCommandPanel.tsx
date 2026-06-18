/**
 * RawCommandPanel — escape-hatch UI for invoking an arbitrary `bd`
 * subcommand. Lives outside the "v1 views" set (Epic, Swarm, etc.)
 * so users have a way to exercise the full CLI surface until the
 * real views land in v1.1.
 *
 * State onion (per AGENTS.md): local input/history → `useState`,
 * server data → TanStack Query, persistent prefs → Tauri commands.
 * The history list is a `useState<string[]>` (not `useRef`) so the
 * "History: N" hint line is reactive and we never read a ref
 * during render (the React Compiler / `react-hooks/refs` lint
 * rejects ref-during-render).
 */
import { useState, useRef, type CSSProperties, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { commands } from '@/lib/tauri-bindings'
import { logger } from '@/lib/logger'
import { OutputRenderer } from './OutputRenderer'

const HISTORY_MAX = 50

interface RawCommandPanelProps {
  cwd: string
  initialCommand?: string
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '16px',
  background: 'var(--background)',
  border: '1px solid var(--border)',
}
const formStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
}
const inputStyle: CSSProperties = {
  flex: 1,
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: '13px',
  padding: '6px 8px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
}
const buttonStyle: CSSProperties = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: '13px',
  padding: '6px 12px',
  border: '1px solid var(--foreground)',
  background: 'var(--foreground)',
  color: 'var(--background)',
  cursor: 'pointer',
}
const buttonDisabledStyle: CSSProperties = {
  ...buttonStyle,
  opacity: 0.5,
  cursor: 'not-allowed',
}
const hintStyle: CSSProperties = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: '11px',
  color: 'var(--muted-foreground)',
}

/**
 * `commands.runBdCommand` returns a `Result<T, BdError>`. The
 * mutation `onError` callback receives the error that TanStack
 * Query surfaces after our `throw new Error(...)` — which is the
 * string we already extracted, not the original `BdError`. We
 * re-extract defensively so the toast + the OutputRenderer's
 * `error` prop both render a human-readable message regardless
 * of whether the error came via `mutationFn` (BdError-shaped) or
 * via `onError` (Error-shaped).
 */
function bdErrorToMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'type' in error) {
    const e = error as {
      type: string
      message?: string
      stdout?: string
      stderr?: string
    }
    if (e.type === 'NonZeroExit' && e.stderr) return `bd failed: ${e.stderr}`
    if (e.type === 'NonZeroExit' && e.stdout) return `bd failed: ${e.stdout}`
    if (e.message) return e.message
    return e.type
  }
  if (error instanceof Error) return error.message
  return String(error)
}

export function RawCommandPanel({ cwd, initialCommand }: RawCommandPanelProps) {
  const [input, setInput] = useState(initialCommand ?? '')
  const [history, setHistory] = useState<string[]>([])

  // `lastInvoked` is a ref because it's an out-of-band "what did the
  // user just submit" signal for tests; reading it during render
  // is not a path we need.
  const lastInvokedRef = useRef<string[]>([])

  const runMutation = useMutation({
    mutationFn: async (args: string[]) => {
      const result = await commands.runBdCommand(args, cwd)
      if (result.status === 'ok') return result.data
      throw new Error(bdErrorToMessage(result.error))
    },
    onError: error => {
      const message = bdErrorToMessage(error)
      logger.error('RawCommandPanel mutation failed', { error: message })
      toast.error('bd command failed', { description: message })
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    const args = trimmed.split(/\s+/)
    lastInvokedRef.current = args
    setHistory(prev => [...prev, trimmed].slice(-HISTORY_MAX))
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
        History: {history.length}
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
