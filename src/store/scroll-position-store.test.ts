import { describe, it, expect, beforeEach } from 'vitest'
import {
  resetScrollPositionStoreForTests,
  useScrollPositionStore,
} from './scroll-position-store'
import { attachToWorkspaceStore } from './attach-to-workspace-store'

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

describe('useScrollPositionStore', () => {
  beforeEach(() => {
    resetScrollPositionStoreForTests()
  })

  describe('initial state', () => {
    it('starts with empty positions', () => {
      expect(useScrollPositionStore.getState().positions).toEqual({})
      expect(useScrollPositionStore.getState()._activeRepoPath).toBeNull()
    })
  })

  describe('setForView / getForView (single workspace)', () => {
    it('round-trips an offset for the active view', () => {
      attachToWorkspaceStore(
        makeWorkspaceStub('/repo-a'),
        useScrollPositionStore
      )
      useScrollPositionStore.getState().setForView('list', 1234)
      expect(
        useScrollPositionStore.getState().getForView('/repo-a', 'list')
      ).toBe(1234)
    })

    it('isolates positions per view', () => {
      attachToWorkspaceStore(
        makeWorkspaceStub('/repo-a'),
        useScrollPositionStore
      )
      useScrollPositionStore.getState().setForView('list', 100)
      useScrollPositionStore.getState().setForView('graph', 200)
      expect(
        useScrollPositionStore.getState().getForView('/repo-a', 'list')
      ).toBe(100)
      expect(
        useScrollPositionStore.getState().getForView('/repo-a', 'graph')
      ).toBe(200)
    })

    it('returns 0 for an unsaved view', () => {
      attachToWorkspaceStore(
        makeWorkspaceStub('/repo-a'),
        useScrollPositionStore
      )
      expect(
        useScrollPositionStore.getState().getForView('/repo-a', 'list')
      ).toBe(0)
    })

    it('rejects negative offsets', () => {
      attachToWorkspaceStore(
        makeWorkspaceStub('/repo-a'),
        useScrollPositionStore
      )
      useScrollPositionStore.getState().setForView('list', -50)
      expect(
        useScrollPositionStore.getState().getForView('/repo-a', 'list')
      ).toBe(0)
    })

    it('rejects non-finite offsets', () => {
      attachToWorkspaceStore(
        makeWorkspaceStub('/repo-a'),
        useScrollPositionStore
      )
      useScrollPositionStore.getState().setForView('list', Number.NaN)
      expect(
        useScrollPositionStore.getState().getForView('/repo-a', 'list')
      ).toBe(0)
      useScrollPositionStore
        .getState()
        .setForView('list', Number.POSITIVE_INFINITY)
      expect(
        useScrollPositionStore.getState().getForView('/repo-a', 'list')
      ).toBe(0)
    })

    it('is a no-op when no workspace is active', () => {
      // No attach call — activeRepoPath stays null.
      useScrollPositionStore.getState().setForView('list', 500)
      expect(
        useScrollPositionStore.getState().getForView('/whatever', 'list')
      ).toBe(0)
    })
  })

  describe('per-workspace persistence (M4)', () => {
    it('restores positions on a round-trip workspace switch', () => {
      const ws = makeWorkspaceStub('/repo-a')
      attachToWorkspaceStore(ws, useScrollPositionStore)
      useScrollPositionStore.getState().setForView('list', 1234)
      ws.setRepoPath('/repo-b')
      // B has no saved positions yet — list reads as 0.
      expect(
        useScrollPositionStore.getState().getForView('/repo-b', 'list')
      ).toBe(0)
      // Switch back to A — list is restored.
      ws.setRepoPath('/repo-a')
      expect(
        useScrollPositionStore.getState().getForView('/repo-a', 'list')
      ).toBe(1234)
    })

    it('keeps two repos positions isolated', () => {
      const ws = makeWorkspaceStub('/repo-a')
      attachToWorkspaceStore(ws, useScrollPositionStore)
      useScrollPositionStore.getState().setForView('list', 100)
      ws.setRepoPath('/repo-b')
      useScrollPositionStore.getState().setForView('list', 999)
      ws.setRepoPath('/repo-a')
      expect(
        useScrollPositionStore.getState().getForView('/repo-a', 'list')
      ).toBe(100)
      ws.setRepoPath('/repo-b')
      expect(
        useScrollPositionStore.getState().getForView('/repo-b', 'list')
      ).toBe(999)
    })

    it('isolates positions per view across workspaces', () => {
      const ws = makeWorkspaceStub('/repo-a')
      attachToWorkspaceStore(ws, useScrollPositionStore)
      useScrollPositionStore.getState().setForView('list', 100)
      useScrollPositionStore.getState().setForView('graph', 500)
      ws.setRepoPath('/repo-b')
      useScrollPositionStore.getState().setForView('list', 250)
      // B's graph is untouched (saved as 0).
      ws.setRepoPath('/repo-a')
      expect(
        useScrollPositionStore.getState().getForView('/repo-a', 'list')
      ).toBe(100)
      expect(
        useScrollPositionStore.getState().getForView('/repo-a', 'graph')
      ).toBe(500)
      ws.setRepoPath('/repo-b')
      expect(
        useScrollPositionStore.getState().getForView('/repo-b', 'list')
      ).toBe(250)
      expect(
        useScrollPositionStore.getState().getForView('/repo-b', 'graph')
      ).toBe(0)
    })

    it('survives closing the workspace (null) and reopening', () => {
      const ws = makeWorkspaceStub('/repo-a')
      attachToWorkspaceStore(ws, useScrollPositionStore)
      useScrollPositionStore.getState().setForView('list', 777)
      ws.setRepoPath(null)
      // Active repo path is null, but the map still holds /repo-a.
      expect(useScrollPositionStore.getState()._activeRepoPath).toBeNull()
      ws.setRepoPath('/repo-a')
      expect(
        useScrollPositionStore.getState().getForView('/repo-a', 'list')
      ).toBe(777)
    })

    it('attaching twice replaces the previous subscription', () => {
      const ws1 = makeWorkspaceStub('/repo-a')
      attachToWorkspaceStore(ws1, useScrollPositionStore)
      useScrollPositionStore.getState().setForView('list', 100)
      // A second attach must drop ws1's listener.
      const ws2 = makeWorkspaceStub('/repo-b')
      attachToWorkspaceStore(ws2, useScrollPositionStore)
      expect(useScrollPositionStore.getState()._activeRepoPath).toBe('/repo-b')
      // ws1 firing must not change the active repo.
      ws1.setRepoPath('/repo-c')
      expect(useScrollPositionStore.getState()._activeRepoPath).toBe('/repo-b')
    })
  })
})
