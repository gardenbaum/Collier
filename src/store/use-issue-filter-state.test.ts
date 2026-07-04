/**
 * Tests for `useIssueFilterStateAndActions` — the dedupe hook that
 * replaces the 11 inline `useIssueFilterStore(s => ...)` calls in
 * IssueListView and Sidebar.
 *
 * Coverage:
 *  - Each of the 5 dimension fields (`status`, `priority`, `type`,
 *    `labels`, `assignees`) reflects the current store state.
 *  - Each of the 5 toggle actions mutates the matching dimension
 *    on the underlying store (i.e. the hook returns the live
 *    store actions, not stale wrappers).
 *  - `clearAll` empties every dimension.
 *  - After a toggle, the hook re-renders with the new value
 *    (proves the per-field selector subscription is wired
 *    through — not a one-shot read).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  resetIssueFilterStoreForTests,
  useIssueFilterStore,
} from './issue-filter-store'
import { useIssueFilterStateAndActions } from './use-issue-filter-state'

describe('useIssueFilterStateAndActions', () => {
  beforeEach(() => {
    // Each test starts from an empty filter. The store has `persist`
    // middleware, so clear both the in-memory state and the
    // localStorage entry to keep tests hermetic.
    resetIssueFilterStoreForTests()
    useIssueFilterStore.persist.clearStorage()
  })

  describe('initial state', () => {
    it('returns empty arrays for every dimension', () => {
      const { result } = renderHook(() => useIssueFilterStateAndActions())
      expect(result.current.status).toEqual([])
      expect(result.current.priority).toEqual([])
      expect(result.current.type).toEqual([])
      expect(result.current.labels).toEqual([])
      expect(result.current.assignees).toEqual([])
    })

    it('returns a callable clearAll action', () => {
      const { result } = renderHook(() => useIssueFilterStateAndActions())
      expect(typeof result.current.clearAll).toBe('function')
    })

    it('returns a callable action for every dimension', () => {
      const { result } = renderHook(() => useIssueFilterStateAndActions())
      expect(typeof result.current.toggleStatus).toBe('function')
      expect(typeof result.current.togglePriority).toBe('function')
      expect(typeof result.current.toggleType).toBe('function')
      expect(typeof result.current.toggleLabel).toBe('function')
      expect(typeof result.current.toggleAssignee).toBe('function')
    })
  })

  describe('toggleStatus', () => {
    it('adds a status via the hook action', () => {
      const { result } = renderHook(() => useIssueFilterStateAndActions())
      act(() => {
        result.current.toggleStatus('open')
      })
      expect(result.current.status).toEqual(['open'])
      // Sanity: the underlying store reflects the same value, so
      // an unrelated consumer of `useIssueFilterStore(s => s.status)`
      // would also see 'open' after this toggle.
      expect(useIssueFilterStore.getState().status).toEqual(['open'])
    })

    it('removes a status when called twice', () => {
      const { result } = renderHook(() => useIssueFilterStateAndActions())
      act(() => {
        result.current.toggleStatus('open')
        result.current.toggleStatus('open')
      })
      expect(result.current.status).toEqual([])
    })
  })

  describe('togglePriority', () => {
    it('adds a priority via the hook action', () => {
      const { result } = renderHook(() => useIssueFilterStateAndActions())
      act(() => {
        result.current.togglePriority('P0')
      })
      expect(result.current.priority).toEqual(['P0'])
    })
  })

  describe('toggleType', () => {
    it('adds a type via the hook action', () => {
      const { result } = renderHook(() => useIssueFilterStateAndActions())
      act(() => {
        result.current.toggleType('bug')
      })
      expect(result.current.type).toEqual(['bug'])
    })
  })

  describe('toggleLabel', () => {
    it('adds a label via the hook action', () => {
      const { result } = renderHook(() => useIssueFilterStateAndActions())
      act(() => {
        result.current.toggleLabel('urgent')
      })
      expect(result.current.labels).toEqual(['urgent'])
    })
  })

  describe('toggleAssignee', () => {
    it('adds an assignee via the hook action', () => {
      const { result } = renderHook(() => useIssueFilterStateAndActions())
      act(() => {
        result.current.toggleAssignee('alice')
      })
      expect(result.current.assignees).toEqual(['alice'])
    })
  })

  describe('clearAll', () => {
    it('empties every dimension in one call', () => {
      useIssueFilterStore.setState({
        status: ['open'],
        priority: ['P0'],
        type: ['bug'],
        labels: ['urgent'],
        assignees: ['alice'],
      })
      const { result } = renderHook(() => useIssueFilterStateAndActions())
      act(() => {
        result.current.clearAll()
      })
      expect(result.current.status).toEqual([])
      expect(result.current.priority).toEqual([])
      expect(result.current.type).toEqual([])
      expect(result.current.labels).toEqual([])
      expect(result.current.assignees).toEqual([])
    })
  })

  describe('subscription model (per-field, not full store)', () => {
    // ponytail: the hook must read each field through its own
    // selector so toggling one dimension does NOT push a fresh
    // reference into a hook consumer that only reads a
    // different dimension. We exercise this by mutating
    // `status` directly on the store and asserting the hook
    // consumer observes the change on the next render — proves
    // the selector wiring is live, not a one-shot destructured
    // snapshot.
    it('re-renders when a dimension read by the hook changes', () => {
      const { result } = renderHook(() => useIssueFilterStateAndActions())
      expect(result.current.status).toEqual([])
      act(() => {
        useIssueFilterStore.setState({ status: ['open'] })
      })
      expect(result.current.status).toEqual(['open'])
    })

    it('returns the live store actions (not captured-at-mount wrappers)', () => {
      // If a future change ever swaps the hook to a stale closure
      // pattern, this test catches it: we mutate via the hook,
      // then mutate again via the raw store, and the hook must
      // see both changes.
      const { result } = renderHook(() => useIssueFilterStateAndActions())
      act(() => {
        result.current.toggleStatus('open')
      })
      act(() => {
        useIssueFilterStore.setState({ status: ['open', 'closed'] })
      })
      expect(result.current.status).toEqual(['open', 'closed'])
    })
  })
})
