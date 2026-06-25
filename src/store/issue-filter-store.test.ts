import { describe, it, expect, beforeEach } from 'vitest'
import {
  attachToWorkspaceStore,
  getIssueFilterCounts,
  resetIssueFilterStoreForTests,
  useIssueFilterStore,
} from './issue-filter-store'

// Minimal workspace-store stand-in. The real store has more fields,
// but `attachToWorkspaceStore` only reads `repoPath` via `getState()`
// and subscribes to changes, so a thin wrapper exposing both is
// enough. `setRepoPath` mutates the stub's own `repoPath` field
// and fires every subscriber with the new value, mimicking the
// real store's subscribe / setState contract.
function makeWorkspaceStub(initialPath: string | null = null): {
  repoPath: string | null
  getState: () => { repoPath: string | null }
  subscribe: (
    listener: (state: { repoPath: string | null }) => void
  ) => () => void
  setRepoPath: (path: string | null) => void
} {
  const listeners = new Set<(state: { repoPath: string | null }) => void>()
  const state: { repoPath: string | null } = { repoPath: initialPath }
  return {
    repoPath: state.repoPath,
    getState: () => state,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setRepoPath: path => {
      state.repoPath = path
      listeners.forEach(l => l({ repoPath: path }))
    },
  }
}

describe('useIssueFilterStore', () => {
  beforeEach(() => {
    resetIssueFilterStoreForTests()
  })

  describe('initial state', () => {
    it('starts with empty filter arrays on every dimension', () => {
      const state = useIssueFilterStore.getState()
      expect(state.status).toEqual([])
      expect(state.priority).toEqual([])
      expect(state.type).toEqual([])
      expect(state.labels).toEqual([])
      expect(state.assignees).toEqual([])
    })
  })

  describe('toggleStatus', () => {
    it('adds a status when not present', () => {
      useIssueFilterStore.getState().toggleStatus('open')
      expect(useIssueFilterStore.getState().status).toEqual(['open'])
    })

    it('removes a status when already present', () => {
      useIssueFilterStore.setState({ status: ['open', 'in_progress'] })
      useIssueFilterStore.getState().toggleStatus('open')
      expect(useIssueFilterStore.getState().status).toEqual(['in_progress'])
    })

    it('preserves order of remaining values', () => {
      useIssueFilterStore.getState().toggleStatus('closed')
      useIssueFilterStore.getState().toggleStatus('open')
      useIssueFilterStore.getState().toggleStatus('closed')
      expect(useIssueFilterStore.getState().status).toEqual(['open'])
    })
  })

  describe('togglePriority', () => {
    it('adds and removes priorities', () => {
      const { togglePriority } = useIssueFilterStore.getState()
      togglePriority('P0')
      togglePriority('P1')
      expect(useIssueFilterStore.getState().priority).toEqual(['P0', 'P1'])
      togglePriority('P0')
      expect(useIssueFilterStore.getState().priority).toEqual(['P1'])
    })
  })

  describe('toggleType', () => {
    it('adds and removes types', () => {
      const { toggleType } = useIssueFilterStore.getState()
      toggleType('bug')
      toggleType('feature')
      expect(useIssueFilterStore.getState().type).toEqual(['bug', 'feature'])
      toggleType('bug')
      expect(useIssueFilterStore.getState().type).toEqual(['feature'])
    })
  })

  describe('toggleLabel', () => {
    it('adds and removes label names', () => {
      const { toggleLabel } = useIssueFilterStore.getState()
      toggleLabel('urgent')
      toggleLabel('frontend')
      expect(useIssueFilterStore.getState().labels).toEqual([
        'urgent',
        'frontend',
      ])
      toggleLabel('urgent')
      expect(useIssueFilterStore.getState().labels).toEqual(['frontend'])
    })
  })

  describe('toggleAssignee', () => {
    it('adds and removes assignees', () => {
      const { toggleAssignee } = useIssueFilterStore.getState()
      toggleAssignee('alice')
      toggleAssignee('bob')
      expect(useIssueFilterStore.getState().assignees).toEqual(['alice', 'bob'])
      toggleAssignee('alice')
      expect(useIssueFilterStore.getState().assignees).toEqual(['bob'])
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
      useIssueFilterStore.getState().clearAll()
      const s = useIssueFilterStore.getState()
      expect(s.status).toEqual([])
      expect(s.priority).toEqual([])
      expect(s.type).toEqual([])
      expect(s.labels).toEqual([])
      expect(s.assignees).toEqual([])
    })
  })

  describe('per-workspace persistence (M4)', () => {
    // Workspace stub + attach() helper. Every test starts with a
    // fresh workspace stub and a fresh store reset — the
    // subscription wiring is what we're exercising.
    function bootWorkspace(initial: string | null) {
      const ws = makeWorkspaceStub(initial)
      attachToWorkspaceStore(ws)
      return ws
    }

    it('loads the saved filter when a workspace is attached', () => {
      // Pre-seed the persisted map by toggling under one workspace,
      // then attaching a fresh workspace that points at the same
      // path — the filter must come back.
      const wsA = bootWorkspace('/repo-a')
      useIssueFilterStore.getState().toggleStatus('open')
      useIssueFilterStore.getState().togglePriority('P1')
      expect(useIssueFilterStore.getState().status).toEqual(['open'])

      // Switch to a different repo: filter clears.
      wsA.setRepoPath('/repo-b')
      expect(useIssueFilterStore.getState().status).toEqual([])
      expect(useIssueFilterStore.getState()._activeRepoPath).toBe('/repo-b')

      // Switch back to A: filter restores.
      wsA.setRepoPath('/repo-a')
      expect(useIssueFilterStore.getState().status).toEqual(['open'])
      expect(useIssueFilterStore.getState().priority).toEqual(['P1'])
      expect(useIssueFilterStore.getState()._activeRepoPath).toBe('/repo-a')
    })

    it("keeps two repos' filters isolated", () => {
      const ws = bootWorkspace('/repo-a')
      useIssueFilterStore.getState().toggleStatus('open')
      ws.setRepoPath('/repo-b')
      useIssueFilterStore.getState().toggleStatus('blocked')
      useIssueFilterStore.getState().togglePriority('P0')
      ws.setRepoPath('/repo-a')
      expect(useIssueFilterStore.getState().status).toEqual(['open'])
      expect(useIssueFilterStore.getState().priority).toEqual([])
      ws.setRepoPath('/repo-b')
      expect(useIssueFilterStore.getState().status).toEqual(['blocked'])
      expect(useIssueFilterStore.getState().priority).toEqual(['P0'])
    })

    it('handles a switch to a fresh workspace (no saved filter)', () => {
      const ws = bootWorkspace('/repo-a')
      useIssueFilterStore.getState().toggleStatus('open')
      ws.setRepoPath('/brand-new-repo')
      expect(useIssueFilterStore.getState().status).toEqual([])
      // Round-trip back: /repo-a's filter survives.
      ws.setRepoPath('/repo-a')
      expect(useIssueFilterStore.getState().status).toEqual(['open'])
    })

    it('handles a switch to null (closing the workspace)', () => {
      const ws = bootWorkspace('/repo-a')
      useIssueFilterStore.getState().toggleStatus('open')
      ws.setRepoPath(null)
      expect(useIssueFilterStore.getState().status).toEqual([])
      expect(useIssueFilterStore.getState()._activeRepoPath).toBeNull()
      // The persisted map still holds /repo-a — reattaching with
      // the same path must restore the filter.
      ws.setRepoPath('/repo-a')
      expect(useIssueFilterStore.getState().status).toEqual(['open'])
    })

    it('attaching twice replaces the previous subscription (no leaks)', () => {
      const ws1 = bootWorkspace('/repo-a')
      useIssueFilterStore.getState().toggleStatus('open')
      // ws2 is the second workspace stub; we keep a handle to it
      // so the variable is used (bootWorkspace already wired the
      // subscription via its return value).
      void bootWorkspace('/repo-b')
      // ws2's attach should have replaced ws1's. Setting ws1's path
      // must NOT swap the filter; only the latest subscription
      // should fire.
      expect(useIssueFilterStore.getState()._activeRepoPath).toBe('/repo-b')
      // Toggle under /repo-b
      useIssueFilterStore.getState().togglePriority('P2')
      expect(useIssueFilterStore.getState().priority).toEqual(['P2'])
      // Setting ws1 to a new path must not affect the store.
      ws1.setRepoPath('/repo-c')
      expect(useIssueFilterStore.getState().priority).toEqual(['P2'])
    })

    it('clearAll in workspace A does not affect workspace B', () => {
      const ws = bootWorkspace('/repo-a')
      useIssueFilterStore.getState().toggleStatus('open')
      ws.setRepoPath('/repo-b')
      useIssueFilterStore.getState().toggleStatus('blocked')
      ws.setRepoPath('/repo-a')
      useIssueFilterStore.getState().clearAll()
      // A is now empty
      expect(useIssueFilterStore.getState().status).toEqual([])
      ws.setRepoPath('/repo-b')
      // B still has its 'blocked' selection.
      expect(useIssueFilterStore.getState().status).toEqual(['blocked'])
    })
  })
})

describe('getIssueFilterCounts', () => {
  beforeEach(() => {
    resetIssueFilterStoreForTests()
  })

  it('returns zero on every dimension for the default state', () => {
    expect(getIssueFilterCounts()).toEqual({
      status: 0,
      priority: 0,
      type: 0,
      labels: 0,
      assignees: 0,
    })
  })

  it('reflects the current filter state', () => {
    useIssueFilterStore.setState({
      status: ['open', 'in_progress'],
      priority: ['P0'],
      type: ['bug', 'feature', 'task'],
      labels: ['urgent'],
      assignees: [],
    })
    expect(getIssueFilterCounts()).toEqual({
      status: 2,
      priority: 1,
      type: 3,
      labels: 1,
      assignees: 0,
    })
  })
})
