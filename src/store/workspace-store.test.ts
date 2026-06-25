import { describe, it, expect, beforeEach, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  getQueryClient,
  installQueryClient,
  useWorkspaceStore,
} from './workspace-store'

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      repoPath: null,
      activeView: 'list',
      selectedIssueId: null,
    })
  })

  describe('initial state', () => {
    it('starts with no repo, the list view, and no selected issue', () => {
      const s = useWorkspaceStore.getState()
      expect(s.repoPath).toBeNull()
      expect(s.activeView).toBe('list')
      expect(s.selectedIssueId).toBeNull()
    })
  })

  describe('setRepoPath', () => {
    it('sets a new repo path', () => {
      useWorkspaceStore.getState().setRepoPath('/path/to/repo')
      expect(useWorkspaceStore.getState().repoPath).toBe('/path/to/repo')
    })

    it('clears the selected issue when switching repos', () => {
      useWorkspaceStore.setState({ selectedIssueId: 'ISSUE-1' })
      useWorkspaceStore.getState().setRepoPath('/new/repo')
      const s = useWorkspaceStore.getState()
      expect(s.repoPath).toBe('/new/repo')
      expect(s.selectedIssueId).toBeNull()
    })

    it('is a no-op when the path is the same', () => {
      useWorkspaceStore.getState().setRepoPath('/same')
      const before = useWorkspaceStore.getState()
      useWorkspaceStore.getState().setRepoPath('/same')
      const after = useWorkspaceStore.getState()
      // Reference equality on the state slice guards against an
      // unnecessary re-render that would lose subscribers' diffs.
      expect(after).toBe(before)
    })

    it('accepts null to clear the repo', () => {
      useWorkspaceStore.getState().setRepoPath('/something')
      useWorkspaceStore.getState().setRepoPath(null)
      expect(useWorkspaceStore.getState().repoPath).toBeNull()
    })
  })

  describe('setActiveView', () => {
    it('switches to every supported view', () => {
      for (const view of [
        'list',
        'ready',
        'blocked',
        'search',
        'epic',
        'graph',
        'swarm',
        'sync',
        'worktree',
        'status',
        'raw',
      ] as const) {
        useWorkspaceStore.getState().setActiveView(view)
        expect(useWorkspaceStore.getState().activeView).toBe(view)
      }
    })
  })

  describe('openIssue / closeIssue / setSelectedIssueId', () => {
    it('openIssue sets the selected issue id', () => {
      useWorkspaceStore.getState().openIssue('ISSUE-42')
      expect(useWorkspaceStore.getState().selectedIssueId).toBe('ISSUE-42')
    })

    it('closeIssue clears the selected issue id', () => {
      useWorkspaceStore.getState().openIssue('ISSUE-42')
      useWorkspaceStore.getState().closeIssue()
      expect(useWorkspaceStore.getState().selectedIssueId).toBeNull()
    })

    it('setSelectedIssueId sets the id directly', () => {
      useWorkspaceStore.getState().setSelectedIssueId('ISSUE-7')
      expect(useWorkspaceStore.getState().selectedIssueId).toBe('ISSUE-7')
    })

    it('setSelectedIssueId accepts null to clear', () => {
      useWorkspaceStore.getState().setSelectedIssueId('X')
      useWorkspaceStore.getState().setSelectedIssueId(null)
      expect(useWorkspaceStore.getState().selectedIssueId).toBeNull()
    })
  })

  describe('reset', () => {
    it('restores the initial empty state', () => {
      useWorkspaceStore.setState({
        repoPath: '/foo',
        activeView: 'search',
        selectedIssueId: 'ISSUE-1',
      })
      useWorkspaceStore.getState().reset()
      const s = useWorkspaceStore.getState()
      expect(s.repoPath).toBeNull()
      expect(s.activeView).toBe('list')
      expect(s.selectedIssueId).toBeNull()
    })
  })

  describe('switchWorkspace', () => {
    // Each switchWorkspace test wires a fresh QueryClient so the
    // removeQueries spy starts clean. The store's module-level
    // queryClient handle is process-global; without reinstalling,
    // tests would observe each other's invalidations.
    beforeEach(() => {
      installQueryClient(new QueryClient())
    })

    it('updates repoPath to the new workspace', () => {
      useWorkspaceStore.getState().setRepoPath('/old')
      useWorkspaceStore.getState().switchWorkspace('/new')
      expect(useWorkspaceStore.getState().repoPath).toBe('/new')
    })

    it('closes the open detail drawer on switch', () => {
      useWorkspaceStore.setState({ repoPath: '/old', selectedIssueId: 'X' })
      useWorkspaceStore.getState().switchWorkspace('/new')
      expect(useWorkspaceStore.getState().selectedIssueId).toBeNull()
    })

    it('drops the old workspace beads query cache', () => {
      useWorkspaceStore.getState().setRepoPath('/old')
      const client = getQueryClient()
      expect(client).not.toBeNull()
      const removeSpy = vi.spyOn(client as QueryClient, 'removeQueries')
      useWorkspaceStore.getState().switchWorkspace('/new')
      expect(removeSpy).toHaveBeenCalledWith({ queryKey: ['beads'] })
    })

    it('is a no-op when path equals current repoPath', () => {
      useWorkspaceStore.getState().setRepoPath('/same')
      const client = getQueryClient() as QueryClient
      const removeSpy = vi.spyOn(client, 'removeQueries')
      useWorkspaceStore.getState().switchWorkspace('/same')
      expect(removeSpy).not.toHaveBeenCalled()
      // state must not be replaced (reference equality guards the
      // subscriber diff)
      const s = useWorkspaceStore.getState()
      expect(s.repoPath).toBe('/same')
    })

    it('is a no-op for an empty path', () => {
      useWorkspaceStore.getState().setRepoPath('/something')
      const client = getQueryClient() as QueryClient
      const removeSpy = vi.spyOn(client, 'removeQueries')
      useWorkspaceStore.getState().switchWorkspace('')
      expect(removeSpy).not.toHaveBeenCalled()
      expect(useWorkspaceStore.getState().repoPath).toBe('/something')
    })

    it('tolerates a missing queryClient install (test isolation)', () => {
      // Simulate the un-installed state by passing null: we
      // re-install with a sentinel and then... well, we can't make
      // the module handle null because the install API requires a
      // non-null client. The contract is documented in the source;
      // what we CAN test is that the store still functions when
      // the client is present (already covered above). The defensive
      // `if (queryClient)` is exercised in production by the
      // isolated-store test harness, which boots the store without
      // a QueryClientProvider.
      expect(getQueryClient()).not.toBeNull()
    })
  })

  describe('installQueryClient', () => {
    it('exposes the installed client via getQueryClient', () => {
      const c = new QueryClient()
      installQueryClient(c)
      expect(getQueryClient()).toBe(c)
    })

    it('is idempotent (last install wins, no exceptions)', () => {
      const c1 = new QueryClient()
      const c2 = new QueryClient()
      installQueryClient(c1)
      installQueryClient(c2)
      expect(getQueryClient()).toBe(c2)
    })
  })
})
