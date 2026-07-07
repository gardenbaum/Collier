/**
 * DependencyListView — sectioned list of an issue's dependencies,
 * with inline add + remove. Replaces the Deps-tab placeholder in
 * `IssueDetailView` (T16b).
 *
 * Sections: one per `DependencyType` variant, in canonical order
 * (blocks, parent_child, conditional_blocks, waits_for, related,
 * tracks, discovered_from, caused_by, validates, supersedes). A
 * section is rendered only if the issue has at least one dep of
 * that type; empty sections are skipped to keep the surface dense.
 *
 * Each row shows the target issue id (clickable → `onOpenIssue`) and
 * a `[X]` remove button. Tapping a row's id opens the target in
 * `IssueDetailView`; the parent's `onOpenIssue` callback (T16b's
 * `IssueDetailViewProps.onOpenIssue?: (id: string) => void`) drives
 * the navigation in Wave 8.
 *
 * The "Add dependency" form is inline, toggled by a single button.
 * When expanded, the user types a target issue id, picks a type from
 * a `<select>`, and submits. Cancel collapses the form and clears
 * the inputs. On success the dep list is refetched and the form
 * collapses automatically.
 *
 * State onion (per AGENTS.md):
 *   - Form open/close + draft state → `useState` (component-local)
 *   - Dep list query + add/remove mutations → TanStack Query
 *   - No Zustand needed.
 *
 * Hard-edged Bauhaus: mono only, hard edges, inline `style` with
 * design tokens. The brand colour is reserved for destructive + P0
 * per AC-14; this component never reaches for it. No animations, no
 * transitions, no shadow, no radius.
 *
 * Out of scope (T28, T29, T32, T33): tree view, graph view, cycle
 * detection, relates-to type. The T31 "remove" flow uses a single
 * click — no typed-identifier gate (deleting a dep is reversible
 * via `bd dep add`, and the per-edge impact is small).
 */
import { useState, type CSSProperties, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import type { Dependency, DependencyType } from '@/lib/bindings'
import { colors, space, type } from '@/lib/design-tokens'
import {
  actionButtonStyle,
  buttonStyle,
  iconButtonStyle,
  inputStyle,
  selectStyle,
} from '@/lib/form-styles'
import { formatError } from '@/lib/error-format'

export interface DependencyListViewProps {
  /** Repository root. Passed to every command. */
  cwd: string
  /** The currently-displayed issue. Used as `from_id` for add and
   *  as the namespace key for the query. */
  issueId: string
  /** Fires when the user clicks a target issue id. The parent
   *  (`IssueDetailView` in T16b) navigates to that issue. */
  onOpenIssue: (id: string) => void
}

// ponytail: section order is fixed (deterministic rendering, no
// key churn). The labels are the snake_case → human-readable
// conversion the dep types use in CLI help — `parent-child`,
// `waits-for`, `discovered-from`, etc. — so the on-screen text
// matches the docs and the `--type` flag.
const SECTION_ORDER: { type: DependencyType; label: string }[] = [
  { type: 'blocks', label: 'Blocks' },
  { type: 'parent_child', label: 'Parent-child' },
  { type: 'conditional_blocks', label: 'Conditional-blocks' },
  { type: 'waits_for', label: 'Waits-for' },
  { type: 'related', label: 'Related' },
  { type: 'tracks', label: 'Tracks' },
  { type: 'discovered_from', label: 'Discovered-from' },
  { type: 'caused_by', label: 'Caused-by' },
  { type: 'validates', label: 'Validates' },
  { type: 'supersedes', label: 'Supersedes' },
]

const DEFAULT_DEP_TYPE: DependencyType = 'blocks'

export function DependencyListView({
  cwd,
  issueId,
  onOpenIssue,
}: DependencyListViewProps) {
  const queryClient = useQueryClient()

  const depListQuery = useQuery({
    queryKey: ['beads', 'depList', cwd, issueId],
    queryFn: async () => {
      const result = await commands.bdDepList(cwd, issueId)
      if (result.status === 'ok') return result.data
      throw result.error
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ['beads', 'depList', cwd, issueId],
    })
    // ponytail: also invalidate `show` because the dep count lives
    // on the issue itself (`dependency_count` / `dependent_count`).
    // Cheap, no-op if the issue isn't on screen.
    queryClient.invalidateQueries({
      queryKey: ['beads', 'show', cwd, issueId],
    })
  }

  const removeMutation = useMutation({
    mutationFn: async (targetId: string) => {
      const result = await commands.bdDepRemove(cwd, issueId, targetId)
      if (result.status === 'ok') return result.data
      throw result.error
    },
    onSuccess: () => invalidate(),
  })

  const addMutation = useMutation({
    mutationFn: async (input: {
      targetId: string
      depType: DependencyType
    }) => {
      const result = await commands.bdDepAdd(
        cwd,
        issueId,
        input.targetId,
        input.depType
      )
      if (result.status === 'ok') return result.data
      throw result.error
    },
    onSuccess: () => invalidate(),
  })

  const [addOpen, setAddOpen] = useState(false)
  const [targetDraft, setTargetDraft] = useState('')
  const [depTypeDraft, setDepTypeDraft] =
    useState<DependencyType>(DEFAULT_DEP_TYPE)

  const handleAddSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = targetDraft.trim()
    if (trimmed.length === 0 || addMutation.isPending) return
    addMutation.mutate(
      { targetId: trimmed, depType: depTypeDraft },
      {
        onSuccess: () => {
          setTargetDraft('')
          setDepTypeDraft(DEFAULT_DEP_TYPE)
          setAddOpen(false)
        },
      }
    )
  }

  const handleAddCancel = () => {
    setAddOpen(false)
    setTargetDraft('')
    setDepTypeDraft(DEFAULT_DEP_TYPE)
  }

  const handleRemove = (targetId: string) => {
    if (removeMutation.isPending) return
    removeMutation.mutate(targetId)
  }

  if (depListQuery.isLoading) {
    return (
      <div data-testid="deps-loading" style={messageStyle}>
        Loading…
      </div>
    )
  }
  if (depListQuery.isError) {
    return (
      <div data-testid="deps-error" style={messageStyle} role="alert">
        {String(depListQuery.error)}
      </div>
    )
  }

  const deps = depListQuery.data ?? []

  // Group deps by type. Sections that come back empty are skipped
  // at render time; the map just buckets.
  const grouped: Record<DependencyType, Dependency[]> = {
    blocks: [],
    parent_child: [],
    conditional_blocks: [],
    waits_for: [],
    related: [],
    tracks: [],
    discovered_from: [],
    caused_by: [],
    validates: [],
    supersedes: [],
  }
  for (const d of deps) {
    grouped[d.dependency_type].push(d)
  }

  return (
    <div data-testid="deps-tab" style={containerStyle}>
      {deps.length === 0 ? (
        <div data-testid="deps-empty" style={messageStyle}>
          No dependencies.
        </div>
      ) : null}

      {SECTION_ORDER.map(({ type, label }) => {
        const rows = grouped[type]
        if (rows.length === 0) return null
        return (
          <section
            key={type}
            data-testid={`deps-section-${type}`}
            data-section-type={type}
            style={sectionStyle}
          >
            <h3
              data-testid={`deps-section-heading-${type}`}
              style={sectionHeadingStyle}
            >
              {label} ({rows.length})
            </h3>
            <ul style={listStyle}>
              {rows.map(d => (
                <li
                  key={`${d.dependency_type}:${d.dependency_id}`}
                  data-testid="dep-row"
                  data-dep-type={d.dependency_type}
                  data-target-id={d.dependency_id}
                  style={rowStyle}
                >
                  <button
                    type="button"
                    data-testid="dep-target-id"
                    onClick={() => onOpenIssue(d.dependency_id)}
                    style={targetButtonStyle}
                    aria-label={`Open issue ${d.dependency_id}`}
                  >
                    {d.dependency_id}
                  </button>
                  <button
                    type="button"
                    data-testid="dep-remove"
                    onClick={() => handleRemove(d.dependency_id)}
                    disabled={removeMutation.isPending}
                    style={removeButtonStyle}
                    aria-label={`Remove ${label} dependency to ${d.dependency_id}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <hr style={dividerStyle} />

      {addOpen ? (
        <form
          data-testid="dep-add-form"
          onSubmit={handleAddSubmit}
          style={addFormStyle}
        >
          <label style={addLabelStyle}>
            Target issue id
            <input
              type="text"
              data-testid="dep-add-target-id"
              value={targetDraft}
              onChange={e => setTargetDraft(e.target.value)}
              placeholder="beads-42"
              disabled={addMutation.isPending}
              style={inputStyle}
              autoComplete="off"
              spellCheck={false}
              aria-label="Target issue id"
            />
          </label>
          <label style={addLabelStyle}>
            Type
            <select
              data-testid="dep-add-type"
              value={depTypeDraft}
              onChange={e => setDepTypeDraft(e.target.value as DependencyType)}
              disabled={addMutation.isPending}
              style={selectStyle}
              aria-label="Dependency type"
            >
              {SECTION_ORDER.map(({ type, label }) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div style={addActionsStyle}>
            <button
              type="button"
              data-testid="dep-add-cancel"
              onClick={handleAddCancel}
              disabled={addMutation.isPending}
              style={actionButtonStyle}
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="dep-add-submit"
              disabled={
                addMutation.isPending || targetDraft.trim().length === 0
              }
              style={
                addMutation.isPending || targetDraft.trim().length === 0
                  ? submitButtonDisabledStyle
                  : submitButtonStyle
              }
            >
              {addMutation.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          data-testid="dep-add-toggle"
          onClick={() => setAddOpen(true)}
          style={addToggleStyle}
        >
          + Add dependency
        </button>
      )}

      {addMutation.isError ? (
        <div data-testid="dep-add-error" style={errorBoxStyle} role="alert">
          {formatError(addMutation.error, 'Action failed.')}
        </div>
      ) : null}
    </div>
  )
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
}

const messageStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  color: colors.mono3,
  padding: space[2],
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[1],
}

const sectionHeadingStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.bold,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: colors.mono3,
  margin: 0,
  padding: 0,
}

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: space[1],
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[2],
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono7,
  paddingInline: space[2],
  paddingBlock: space[1],
}

const targetButtonStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  backgroundColor: colors.mono9,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[2],
  paddingBlock: space[1],
  cursor: 'pointer',
  flex: 1,
  textAlign: 'start',
}

const removeButtonStyle = iconButtonStyle

const dividerStyle: CSSProperties = {
  border: 'none',
  borderTop: `1px solid ${colors.mono7}`,
  margin: 0,
}

const addToggleStyle: CSSProperties = {
  ...buttonStyle,
  alignSelf: 'flex-start',
}

const addFormStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  padding: space[3],
}

const addLabelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[1],
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.medium,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: colors.mono3,
}

const addActionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[2],
}

const submitButtonStyle = actionButtonStyle

const submitButtonDisabledStyle: CSSProperties = {
  ...actionButtonStyle,
  color: colors.mono5,
  borderColor: colors.mono7,
  cursor: 'not-allowed',
}

const errorBoxStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  color: colors.mono0,
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[3],
  paddingBlock: space[2],
}
