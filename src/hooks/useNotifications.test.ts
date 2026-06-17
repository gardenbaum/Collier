/**
 * Tests for `useNotifications`.
 *
 * Contract: the returned callback calls `commands.bdNotify(title, body)`
 * with the provided args. Errors from the IPC layer (or from
 * `bdNotify` returning an error result) are silently swallowed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { commands } from '@/lib/tauri-bindings'
import { useNotifications } from './useNotifications'

const { mockBdNotify } = vi.hoisted(() => ({
  mockBdNotify: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdNotify: mockBdNotify,
  },
}))

const mockedBdNotify = vi.mocked(commands.bdNotify)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useNotifications', () => {
  it('returns a stable callback that calls commands.bdNotify with the given args', async () => {
    mockedBdNotify.mockResolvedValue({ status: 'ok', data: null })

    const { result } = renderHook(() => useNotifications())
    const notify = result.current

    await act(async () => {
      await notify('Gate resolved', 'beads-123 is unblocked')
    })

    expect(mockedBdNotify).toHaveBeenCalledTimes(1)
    expect(mockedBdNotify).toHaveBeenCalledWith(
      'Gate resolved',
      'beads-123 is unblocked'
    )
  })

  it('returns the same callback reference across renders (stable identity)', () => {
    mockedBdNotify.mockResolvedValue({ status: 'ok', data: null })

    const { result, rerender } = renderHook(() => useNotifications())
    const first = result.current

    rerender()
    const second = result.current

    expect(second).toBe(first)
  })

  it('swallows errors thrown by the IPC layer', async () => {
    mockedBdNotify.mockRejectedValue(new Error('IPC broken'))

    const { result } = renderHook(() => useNotifications())

    // The call must not throw, even when the underlying command
    // rejects. The whole point of the hook is best-effort.
    await act(async () => {
      await expect(result.current('Test', 'body')).resolves.toBeUndefined()
    })
  })
})
