/**
 * useIssueFilterStateAndActions — single entry point for the
 * 11 selectors that IssueListView and Sidebar both need from
 * `useIssueFilterStore`.
 *
 * Why this exists
 * ---------------
 * Two components consume the full filter surface (5 dimension
 * arrays + 5 toggle actions + clearAll). Pre-refactor each one
 * spelled out the same 11 lines of `useIssueFilterStore(s => …)`
 * verbatim — a 32-line clone pair per `bun run jscpd`. This hook
 * collapses that block into one named entry point so the two
 * callers stay in lockstep (a new dimension added to the store
 * means adding one selector here, not 2× 11 lines).
 *
 * Subscription model (per AGENTS.md)
 * ----------------------------------
 * The hook uses one `useIssueFilterStore(s => …)` call per
 * field. It NEVER destructures the whole store — that would
 * re-render the consumer on every unrelated change (any toggle
 * on any dimension, not just the one the caller reads). The
 * selector syntax keeps each subscription independent, so
 * toggling a status re-renders only components that read
 * `status` (or `clearAll` etc.), not every dimension consumer.
 *
 * The returned object is composed of the 11 individual
 * selector return values, so its reference identity changes
 * every render — callers should destructure the fields they
 * need (not capture the whole object in a memoization dep
 * array), matching the pattern already used inline at the
 * call sites.
 */
import {
  useIssueFilterStore,
  type IssueFilterState,
} from './issue-filter-store'

// ponytail: the hook's public surface is exactly the 11 fields a
// full filter consumer (IssueListView, Sidebar) needs — 5 dimension
// arrays + 5 toggle actions + clearAll. The interface is derived
// from the store's `IssueFilterState` via `Pick` so the two stay in
// lockstep (a new field on the store only needs a one-token edit
// here to expose it). The underscore-prefixed internal fields
// (`_activeRepoPath`, `_persistedByRepo`, `_setActiveRepoPath`,
// `_unsubscribeWorkspace`) are NOT picked — the hook is a public
// API and should not leak the store's internals.
export type IssueFilterStateAndActions = Pick<
  IssueFilterState,
  | 'status'
  | 'priority'
  | 'type'
  | 'labels'
  | 'assignees'
  | 'toggleStatus'
  | 'togglePriority'
  | 'toggleType'
  | 'toggleLabel'
  | 'toggleAssignee'
  | 'clearAll'
>

export function useIssueFilterStateAndActions(): IssueFilterStateAndActions {
  // ponytail: one selector per field. Never `useIssueFilterStore()`
  // (full-store destructure) — see the file-level doc above.
  const status = useIssueFilterStore(s => s.status)
  const priority = useIssueFilterStore(s => s.priority)
  const type = useIssueFilterStore(s => s.type)
  const labels = useIssueFilterStore(s => s.labels)
  const assignees = useIssueFilterStore(s => s.assignees)
  const toggleStatus = useIssueFilterStore(s => s.toggleStatus)
  const togglePriority = useIssueFilterStore(s => s.togglePriority)
  const toggleType = useIssueFilterStore(s => s.toggleType)
  const toggleLabel = useIssueFilterStore(s => s.toggleLabel)
  const toggleAssignee = useIssueFilterStore(s => s.toggleAssignee)
  const clearAll = useIssueFilterStore(s => s.clearAll)

  return {
    status,
    priority,
    type,
    labels,
    assignees,
    toggleStatus,
    togglePriority,
    toggleType,
    toggleLabel,
    toggleAssignee,
    clearAll,
  }
}
