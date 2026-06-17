/**
 * Issue-filter store — Zustand slice for the FilterSidebar.
 *
 * ponytail: persists the active filter selection to localStorage via
 * `zustand/middleware/persist`. Per-repo persistence is a v2 concern
 * (Tauri preferences); one global filter set covers the v1 single-repo
 * bootstrap flow.
 *
 * The data fields are persisted; the action functions are not (functions
 * don't survive JSON round-trip, and the factory re-creates them on every
 * module load). `partialize` makes the persist boundary explicit so a
 * future maintainer reading this won't wonder whether functions are
 * stored in localStorage.
 *
 * Selector pattern (per AGENTS.md): never destructure the whole store in
 * a component — `useIssueFilterStore(state => state.status)` for the
 * dimension you need.
 */
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { IssuePriority, IssueStatus, IssueType } from '@/lib/bindings'

export interface IssueFilter {
  status: IssueStatus[]
  priority: IssuePriority[]
  type: IssueType[]
  labels: string[]
  assignees: string[]
}

interface IssueFilterState extends IssueFilter {
  toggleStatus: (s: IssueStatus) => void
  togglePriority: (p: IssuePriority) => void
  toggleType: (t: IssueType) => void
  toggleLabel: (l: string) => void
  toggleAssignee: (a: string) => void
  clearAll: () => void
}

const EMPTY: IssueFilter = {
  status: [],
  priority: [],
  type: [],
  labels: [],
  assignees: [],
}

export const useIssueFilterStore = create<IssueFilterState>()(
  devtools(
    persist(
      set => ({
        ...EMPTY,
        toggleStatus: s =>
          set(
            state => ({
              status: state.status.includes(s)
                ? state.status.filter(x => x !== s)
                : [...state.status, s],
            }),
            false,
            'toggleStatus'
          ),
        togglePriority: p =>
          set(
            state => ({
              priority: state.priority.includes(p)
                ? state.priority.filter(x => x !== p)
                : [...state.priority, p],
            }),
            false,
            'togglePriority'
          ),
        toggleType: t =>
          set(
            state => ({
              type: state.type.includes(t)
                ? state.type.filter(x => x !== t)
                : [...state.type, t],
            }),
            false,
            'toggleType'
          ),
        toggleLabel: l =>
          set(
            state => ({
              labels: state.labels.includes(l)
                ? state.labels.filter(x => x !== l)
                : [...state.labels, l],
            }),
            false,
            'toggleLabel'
          ),
        toggleAssignee: a =>
          set(
            state => ({
              assignees: state.assignees.includes(a)
                ? state.assignees.filter(x => x !== a)
                : [...state.assignees, a],
            }),
            false,
            'toggleAssignee'
          ),
        clearAll: () => set({ ...EMPTY }, false, 'clearAll'),
      }),
      {
        name: 'collier-issue-filter',
        partialize: state => ({
          status: state.status,
          priority: state.priority,
          type: state.type,
          labels: state.labels,
          assignees: state.assignees,
        }),
      }
    ),
    { name: 'issue-filter-store' }
  )
)

/**
 * Snapshot of every dimension's active count. Lives outside the store so
 * it never lands in localStorage and so callers don't need to subscribe
 * to the store just to read lengths.
 */
export interface IssueFilterCounts {
  status: number
  priority: number
  type: number
  labels: number
  assignees: number
}

// ponytail: read latest state via getState(). The store is module-level
// so by the time this helper is called the store is fully initialised —
// no TDZ or circular reference.
export const getIssueFilterCounts = (): IssueFilterCounts => {
  const s = useIssueFilterStore.getState()
  return {
    status: s.status.length,
    priority: s.priority.length,
    type: s.type.length,
    labels: s.labels.length,
    assignees: s.assignees.length,
  }
}
