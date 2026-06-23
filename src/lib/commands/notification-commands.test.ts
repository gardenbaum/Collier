import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { CommandContext } from './types'

const { mockSuccess } = vi.hoisted(() => ({
  mockSuccess: vi.fn(),
}))

vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: mockSuccess,
  },
}))

import { notificationCommands } from './notification-commands'

const createContext = (): CommandContext => ({
  openPreferences: vi.fn(),
  showToast: vi.fn(),
})

describe('notificationCommands', () => {
  beforeEach(() => {
    mockSuccess.mockReset()
  })

  it('exports exactly one test-toast command', () => {
    expect(notificationCommands).toHaveLength(1)
    expect(notificationCommands[0]?.id).toBe('notification.test-toast')
  })

  it('groups the command under "debug" and tags it with sensible keywords', () => {
    const cmd = notificationCommands[0]
    expect(cmd?.group).toBe('debug')
    expect(cmd?.keywords).toEqual(['test', 'toast', 'notification', 'debug'])
    expect(cmd?.labelKey).toBe('commands.testToast.label')
    expect(cmd?.descriptionKey).toBe('commands.testToast.description')
  })

  it('dispatches a success notification with the test payload when executed', async () => {
    mockSuccess.mockResolvedValueOnce(undefined)
    const cmd = notificationCommands[0]
    if (!cmd) throw new Error('notification.test-toast command is missing')
    await cmd.execute(createContext())
    expect(mockSuccess).toHaveBeenCalledWith(
      'Test Toast',
      'This is a test notification'
    )
  })

  it('propagates errors thrown by the notifications service', async () => {
    mockSuccess.mockRejectedValueOnce(new Error('sink offline'))
    const cmd = notificationCommands[0]
    if (!cmd) throw new Error('notification.test-toast command is missing')
    await expect(cmd.execute(createContext())).rejects.toThrow('sink offline')
  })
})
