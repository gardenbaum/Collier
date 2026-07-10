import { describe, it, expect, vi } from 'vitest'
import {
  attachToWorkspaceStore,
  type PerRepoStore,
} from './attach-to-workspace-store'
import { makeWorkspaceStub } from '@/test/workspace-stub'

/**
 * Minimal per-repo-store stub. The helper reads `_setActiveRepoPath`
 * (and optionally `_unsubscribeWorkspace`) from `getState()`, and writes
 * back to `_unsubscribeWorkspace` via `setState`. We expose a shared
 * mock for `_setActiveRepoPath` so tests can assert on call shape.
 */
function makePerRepoStoreStub(): {
  store: PerRepoStore
  setActiveCalls: (string | null)[]
  getCurrentUnsubscribe: () => (() => void) | undefined
} {
  const setActiveCalls: (string | null)[] = []
  const state = {
    _setActiveRepoPath: vi.fn((path: string | null) => {
      setActiveCalls.push(path)
    }),
    _unsubscribeWorkspace: undefined as (() => void) | undefined,
  }
  return {
    setActiveCalls,
    getCurrentUnsubscribe: () => state._unsubscribeWorkspace,
    store: {
      getState: () => state,
      setState: partial => {
        if ('_unsubscribeWorkspace' in partial) {
          state._unsubscribeWorkspace = partial._unsubscribeWorkspace
        }
      },
    },
  }
}

describe('attachToWorkspaceStore', () => {
  describe('initial sync', () => {
    it('does not call _setActiveRepoPath when the workspace has no repoPath', () => {
      const ws = makeWorkspaceStub(null)
      const { store, setActiveCalls } = makePerRepoStoreStub()

      attachToWorkspaceStore(ws, store)

      expect(setActiveCalls).toEqual([])
    })

    it('calls _setActiveRepoPath exactly once with the active repoPath when set', () => {
      const ws = makeWorkspaceStub('/repo-a')
      const { store, setActiveCalls } = makePerRepoStoreStub()

      attachToWorkspaceStore(ws, store)

      expect(setActiveCalls).toEqual(['/repo-a'])
    })
  })

  describe('subscribe wiring', () => {
    it('forwards subsequent repoPath changes to _setActiveRepoPath', () => {
      const ws = makeWorkspaceStub('/repo-a')
      const { store, setActiveCalls } = makePerRepoStoreStub()

      attachToWorkspaceStore(ws, store)
      expect(setActiveCalls).toEqual(['/repo-a'])

      ws.setRepoPath('/repo-b')
      expect(setActiveCalls).toEqual(['/repo-a', '/repo-b'])

      ws.setRepoPath(null)
      expect(setActiveCalls).toEqual(['/repo-a', '/repo-b', null])
    })
  })

  describe('idempotent re-attach', () => {
    it('tears down the prior subscription before attaching a new one', () => {
      const ws1 = makeWorkspaceStub('/repo-a')
      const { store, setActiveCalls } = makePerRepoStoreStub()

      attachToWorkspaceStore(ws1, store)
      expect(setActiveCalls).toEqual(['/repo-a'])

      // Re-attach to a different workspace; the helper must call the
      // previously-stored unsubscribe fn from the per-repo store,
      // removing ws1's listener before subscribing to ws2.
      const ws2 = makeWorkspaceStub('/repo-b')
      attachToWorkspaceStore(ws2, store)

      // The re-attach ran initial sync on ws2 → /repo-b.
      expect(setActiveCalls).toEqual(['/repo-a', '/repo-b'])

      // ws1 is no longer wired. A change there must NOT fire.
      ws1.setRepoPath('/repo-c')
      expect(setActiveCalls).toEqual(['/repo-a', '/repo-b'])

      // ws2 is the live subscription — its changes still fire.
      ws2.setRepoPath('/repo-d')
      expect(setActiveCalls).toEqual(['/repo-a', '/repo-b', '/repo-d'])
    })

    it('is safe when re-attaching to the same workspace stub (no listener leak)', () => {
      const ws = makeWorkspaceStub('/repo-a')
      const { store, setActiveCalls } = makePerRepoStoreStub()

      attachToWorkspaceStore(ws, store)
      attachToWorkspaceStore(ws, store)

      // Two initial syncs (one per attach), but no listener leak:
      // each subsequent setRepoPath must produce exactly one extra
      // call, not two.
      ws.setRepoPath('/repo-b')
      expect(setActiveCalls).toEqual(['/repo-a', '/repo-a', '/repo-b'])
    })
  })

  describe('returned cleanup fn', () => {
    it('detaches the workspace subscription so further changes do not fire', () => {
      const ws = makeWorkspaceStub('/repo-a')
      const { store, setActiveCalls } = makePerRepoStoreStub()

      const cleanup = attachToWorkspaceStore(ws, store)
      expect(setActiveCalls).toEqual(['/repo-a'])

      cleanup()
      ws.setRepoPath('/repo-b')

      expect(setActiveCalls).toEqual(['/repo-a'])
    })

    it('is the same reference as the fn stored on the per-repo store', () => {
      const ws = makeWorkspaceStub('/repo-a')
      const { store, getCurrentUnsubscribe } = makePerRepoStoreStub()

      const cleanup = attachToWorkspaceStore(ws, store)

      expect(getCurrentUnsubscribe()).toBe(cleanup)
    })

    it('works even when there was no initial sync (workspace starts null)', () => {
      const ws = makeWorkspaceStub(null)
      const { store, setActiveCalls } = makePerRepoStoreStub()

      const cleanup = attachToWorkspaceStore(ws, store)
      expect(setActiveCalls).toEqual([])

      cleanup()
      ws.setRepoPath('/repo-a')

      expect(setActiveCalls).toEqual([])
    })
  })

  describe('stores _unsubscribeWorkspace on the perRepoStore', () => {
    it('records the active unsubscribe fn after attach', () => {
      const ws = makeWorkspaceStub('/repo-a')
      const { store, getCurrentUnsubscribe } = makePerRepoStoreStub()

      expect(getCurrentUnsubscribe()).toBeUndefined()

      const cleanup = attachToWorkspaceStore(ws, store)

      expect(getCurrentUnsubscribe()).toBe(cleanup)
    })

    it('updates the stored fn on re-attach (different reference each time)', () => {
      const ws1 = makeWorkspaceStub('/repo-a')
      const { store, getCurrentUnsubscribe } = makePerRepoStoreStub()

      const firstCleanup = attachToWorkspaceStore(ws1, store)
      expect(getCurrentUnsubscribe()).toBe(firstCleanup)

      const ws2 = makeWorkspaceStub('/repo-b')
      const secondCleanup = attachToWorkspaceStore(ws2, store)

      expect(getCurrentUnsubscribe()).toBe(secondCleanup)
      expect(getCurrentUnsubscribe()).not.toBe(firstCleanup)
    })
  })
})
