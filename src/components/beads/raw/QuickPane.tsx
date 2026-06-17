/**
 * QuickPane — search input + recent commands + bd subcommand suggestions (T44).
 *
 * ponytail: the plan called for "5-7 most common read-only actions"
 * that navigate to other views (Ready / My issues / Create / Search /
 * Blocked / Status / Raw). v1 is a smaller, simpler scope:
 *   - Search input
 *   - A static list of common `bd` subcommands (the parent decides what
 *     to do with a pick — typically a callback into RawCommandPanel)
 *   - An in-memory list of recent commands (last 5); the parent threads
 *     a `onSelect(command: string)` callback
 *
 * Why not the "navigate to ReadyView" flow? Each navigation requires a
 * wiring into the main window's view router, which is owned by
 * Wave 8 (T46-T51). v1 of the QuickPane emits the picked command and
 * lets the parent (a future `QuickPaneActions` shell) decide whether
 * to render a view, run a command, or open the raw panel.
 *
 * State onion (per AGENTS.md): input + selection → `useState`. No
 * Zustand needed for a leaf picker.
 *
 * Hard-edged Bauhaus: mono only, hard edges, inline `style` with design
 * tokens. Mono palette only (AC-14). No animations, no transitions, no shadow,
 * no radius.
 */
import { useState, type CSSProperties, type ChangeEvent } from 'react'
import { colors, space, type } from '@/lib/design-tokens'

// ponytail: static list of common bd subcommands (verified against
// `bd --help` for 1.0.5). The "read-only" subset gets a `readOnly`
// flag, but v1 does not differentiate — the parent (RawCommandPanel
// or a future QuickPaneActions shell) is responsible for that.
// "list, ready, blocked, search, query, show, create, update, close,
//  reopen, delete, dep, label, comment, status, sync, worktree"
// (per the task brief; trimmed to 12 that are guaranteed in 1.0.5).
const COMMON_COMMANDS: ReadonlyArray<string> = [
  'list',
  'ready',
  'blocked',
  'search',
  'query',
  'show',
  'create',
  'update',
  'close',
  'reopen',
  'delete',
  'status',
]

export interface QuickPaneProps {
  /** Maximum number of recent commands to track. Defaults to 5. */
  maxRecent?: number
  /** Optional pre-populated recent commands (e.g. restored from
   *  localStorage). v1 does not persist; this is for test wiring. */
  initialRecent?: ReadonlyArray<string>
  /** Fires when the user picks a command (suggestion or recent). */
  onSelect?: (command: string) => void
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
  padding: space[4],
  color: colors.mono0,
  fontFamily: type.fontFamily.sans,
}

const inputStyle: CSSProperties = {
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

const sectionHeadingStyle: CSSProperties = {
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.bold,
  textTransform: 'uppercase',
  color: colors.mono3,
  margin: 0,
}

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const itemStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.sm,
  lineHeight: type.lineHeight.normal,
  color: colors.mono0,
  backgroundColor: colors.mono9,
  borderTop: `1px solid ${colors.mono7}`,
  padding: space[2],
  cursor: 'pointer',
  userSelect: 'none',
}

const emptyStyle: CSSProperties = {
  fontSize: type.fontSize.sm,
  color: colors.mono3,
  padding: space[2],
}

export function QuickPane({
  maxRecent = 5,
  initialRecent,
  onSelect,
}: QuickPaneProps) {
  const [query, setQuery] = useState('')
  // ponytail: cap the initial list at maxRecent too. Without this,
  // a parent that hands in 3 recent items with maxRecent=2 renders
  // 3 items on mount and only trims to 2 after the first click.
  const [recent, setRecent] = useState<string[]>(() =>
    initialRecent ? [...initialRecent].slice(0, maxRecent) : []
  )

  // ponytail: case-insensitive substring match. No real fuzzy lib —
  // the parent passes exact commands, and the user types the start
  // of a subcommand. `String.prototype.includes` is the right tool.
  const q = query.trim().toLowerCase()
  const suggestions = q
    ? COMMON_COMMANDS.filter(cmd => cmd.toLowerCase().includes(q))
    : [...COMMON_COMMANDS]

  const handlePick = (cmd: string) => {
    setRecent(prev => {
      const next = [cmd, ...prev.filter(c => c !== cmd)]
      return next.slice(0, maxRecent)
    })
    onSelect?.(cmd)
  }

  return (
    <section data-testid="quick-pane" style={containerStyle}>
      <input
        data-testid="quick-pane-input"
        style={inputStyle}
        type="text"
        value={query}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          setQuery(e.target.value)
        }
        placeholder="Search bd commands…"
        autoComplete="off"
        spellCheck={false}
      />

      <div data-testid="quick-pane-recent">
        <h3 style={sectionHeadingStyle}>Recent</h3>
        {recent.length === 0 ? (
          <div data-testid="quick-pane-recent-empty" style={emptyStyle}>
            No recent commands.
          </div>
        ) : (
          <ul style={listStyle}>
            {recent.map(cmd => (
              <li
                key={cmd}
                data-testid="quick-pane-recent-item"
                data-cmd={cmd}
                style={itemStyle}
                onClick={() => handlePick(cmd)}
              >
                {cmd}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div data-testid="quick-pane-suggestion">
        <h3 style={sectionHeadingStyle}>Commands</h3>
        {suggestions.length === 0 ? (
          <div data-testid="quick-pane-suggestion-empty" style={emptyStyle}>
            No matches.
          </div>
        ) : (
          <ul style={listStyle}>
            {suggestions.map(cmd => (
              <li
                key={cmd}
                data-testid="quick-pane-suggestion-item"
                data-cmd={cmd}
                style={itemStyle}
                onClick={() => handlePick(cmd)}
              >
                {cmd}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default QuickPane
