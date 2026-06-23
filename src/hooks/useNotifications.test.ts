/**
 * Tests for `useNotifications`.
 *
 * Contract: the returned callback calls `commands.sendNativeNotification(title, body)`
 * with the provided args. Errors from the IPC layer (or from
 * `sendNativeNotification` returning an error result) are silently swallowed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { commands } from '@/lib/tauri-bindings'
import { useNotifications } from './useNotifications'

const { mockSendNativeNotification } = vi.hoisted(() => ({
  mockSendNativeNotification: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    sendNativeNotification: mockSendNativeNotification,
  },
}))

const mockedSendNativeNotification = vi.mocked(commands.sendNativeNotification)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useNotifications', () => {
  it('returns a stable callback that calls sendNativeNotification with the given args', async () => {
    mockedSendNativeNotification.mockResolvedValue({ status: 'ok', data: null })

    const { result } = renderHook(() => useNotifications())
    const notify = result.current

    await act(async () => {
      await notify('Gate resolved', 'beads-123 is unblocked')
    })

    expect(mockedSendNativeNotification).toHaveBeenCalledTimes(1)
    expect(mockedSendNativeNotification).toHaveBeenCalledWith(
      'Gate resolved',
      'beads-123 is unblocked'
    )
  })

  it('returns the same callback reference across renders (stable identity)', () => {
    mockedSendNativeNotification.mockResolvedValue({ status: 'ok', data: null })

    const { result, rerender } = renderHook(() => useNotifications())
    const first = result.current

    rerender()
    const second = result.current

    expect(second).toBe(first)
  })

  it('swallows errors thrown by the IPC layer', async () => {
    mockedSendNativeNotification.mockRejectedValue(new Error('IPC broken'))

    const { result } = renderHook(() => useNotifications())

    await act(async () => {
      await expect(result.current('Test', 'body')).resolves.toBeUndefined()
    })
  })

  it('swallows error results from the command', async () => {
    mockedSendNativeNotification.mockResolvedValue({
      status: 'error',
      error: { type: 'IoError', message: 'permission denied' },
    })

    const { result } = renderHook(() => useNotifications())

    await act(async () => {
      await expect(result.current('Test', 'body')).resolves.toBeUndefined()
    })
  })
})
