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
import { useState, useRef, type FormEvent } from 'react'
import { Terminal } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { commands } from '@/lib/tauri-bindings'
import { logger } from '@/lib/logger'
import { EmptyState } from '@/components/atoms'
import { OutputRenderer } from './OutputRenderer'

const HISTORY_MAX = 50

interface RawCommandPanelProps {
  cwd: string
  initialCommand?: string
}

const containerClass =
  'flex flex-col gap-3 p-4 bg-[color:var(--background)] border border-[color:var(--border)] rounded-[var(--radius)]'
const formClass = 'flex gap-2 items-center'
const inputClass =
  'flex-1 h-9 px-3 rounded-[var(--radius)] bg-[color:var(--secondary)] border border-[color:var(--border)] font-mono text-[12px] text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] focus:ring-offset-2 focus:ring-offset-[color:var(--background)]'
const submitClass =
  'h-9 px-4 rounded-[var(--radius)] bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:bg-[color:var(--accent)] cursor-pointer font-sans text-[13px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed'
const hintClass = 'font-sans text-[11px] text-[color:var(--muted-foreground)]'
const outputClass =
  'bg-[color:var(--card)] border-l border-[color:var(--border)] font-mono text-[12px] p-3 overflow-y-auto rounded-[var(--radius)] min-h-[120px]'

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

  const showEmpty =
    runMutation.status === 'idle' && !runMutation.data && !runMutation.error

  return (
    <section data-testid="raw-command-panel" className={containerClass}>
      <form
        onSubmit={handleSubmit}
        className={formClass}
        aria-label="Run bd command"
      >
        <input
          data-testid="raw-command-input"
          className={inputClass}
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
          className={submitClass}
        >
          {runMutation.isPending ? 'Running…' : 'Run'}
        </button>
      </form>

      <div data-testid="raw-command-history" className={hintClass}>
        History: {history.length}
      </div>

      <div data-testid="raw-command-output" className={outputClass}>
        {showEmpty ? (
          <EmptyState
            icon={Terminal}
            title="No command run"
            body="Type a `bd` command above to start."
          />
        ) : (
          <OutputRenderer
            value={runMutation.data ?? null}
            error={runMutation.error}
          />
        )}
      </div>
    </section>
  )
}
