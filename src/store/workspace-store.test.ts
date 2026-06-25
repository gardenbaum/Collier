import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from './workspace-store'

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
})
