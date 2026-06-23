import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockCommands, mockLogger, mockToast } = vi.hoisted(() => ({
  mockCommands: {
    sendNativeNotification: vi.fn(),
  },
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: mockCommands,
}))

vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}))

vi.mock('sonner', () => ({
  toast: mockToast,
}))

import {
  notify,
  notifications,
  success,
  error,
  info,
  warning,
} from './notifications'

describe('notify — toast path', () => {
  beforeEach(() => {
    mockCommands.sendNativeNotification.mockReset()
    mockLogger.debug.mockReset()
    mockLogger.error.mockReset()
    mockToast.success.mockReset()
    mockToast.error.mockReset()
    mockToast.info.mockReset()
    mockToast.warning.mockReset()
  })

  it('routes to toast.success with "Title: message" content', async () => {
    await notify('Saved', 'file persisted', { type: 'success' })
    expect(mockToast.success).toHaveBeenCalledWith('Saved: file persisted', {})
  })

  it('routes to toast.error with no duration option when not provided', async () => {
    await notify('Boom', undefined, { type: 'error' })
    expect(mockToast.error).toHaveBeenCalledWith('Boom', {})
  })

  it('routes to toast.warning for the warning type', async () => {
    await notify('Careful', 'something off', { type: 'warning' })
    expect(mockToast.warning).toHaveBeenCalledWith('Careful: something off', {})
  })

  it('routes to toast.info by default (no type provided)', async () => {
    await notify('FYI', 'just so you know')
    expect(mockToast.info).toHaveBeenCalledWith('FYI: just so you know', {})
  })

  it('omits the message when none is provided', async () => {
    await notify('Just a title')
    expect(mockToast.info).toHaveBeenCalledWith('Just a title', {})
  })

  it('passes a custom duration through to the toast options', async () => {
    await notify('Stays', 'a while', { duration: 0 })
    expect(mockToast.info).toHaveBeenCalledWith('Stays: a while', {
      duration: 0,
    })
  })

  it('does not call the Tauri command on the toast path', async () => {
    await notify('Just', 'toast')
    expect(mockCommands.sendNativeNotification).not.toHaveBeenCalled()
  })
})

describe('notify — native path', () => {
  beforeEach(() => {
    mockCommands.sendNativeNotification.mockReset()
    mockToast.error.mockReset()
  })

  it('forwards to the Tauri command with title and body', async () => {
    mockCommands.sendNativeNotification.mockResolvedValue({
      status: 'ok',
      data: null,
    })
    await notify('Hello', 'world', { native: true })
    expect(mockCommands.sendNativeNotification).toHaveBeenCalledWith(
      'Hello',
      'world'
    )
  })

  it('sends null body when no message is given', async () => {
    mockCommands.sendNativeNotification.mockResolvedValue({
      status: 'ok',
      data: null,
    })
    await notify('Title only', undefined, { native: true })
    expect(mockCommands.sendNativeNotification).toHaveBeenCalledWith(
      'Title only',
      null
    )
  })

  it('falls back to a toast.error when the IPC returns an error', async () => {
    mockCommands.sendNativeNotification.mockResolvedValue({
      status: 'error',
      error: 'permission denied',
    })
    await notify('Hi', 'there', { native: true })
    expect(mockToast.error).toHaveBeenCalledWith('Hi: there')
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('falls back to a toast.error without the message separator when message is missing', async () => {
    mockCommands.sendNativeNotification.mockResolvedValue({
      status: 'error',
      error: 'oops',
    })
    await notify('Bare', undefined, { native: true })
    expect(mockToast.error).toHaveBeenCalledWith('Bare')
  })

  it('falls back to a toast.error if the IPC throws', async () => {
    mockCommands.sendNativeNotification.mockRejectedValue(new Error('crash'))
    await notify('boom', 'hard', { native: true })
    expect(mockToast.error).toHaveBeenCalledWith('boom: hard')
  })

  it('does not toast on success', async () => {
    mockCommands.sendNativeNotification.mockResolvedValue({
      status: 'ok',
      data: null,
    })
    await notify('Fine', 'thanks', { native: true })
    expect(mockToast.success).not.toHaveBeenCalled()
    expect(mockToast.error).not.toHaveBeenCalled()
  })
})

describe('notifications convenience object', () => {
  beforeEach(() => {
    mockToast.success.mockReset()
    mockToast.error.mockReset()
    mockToast.info.mockReset()
    mockToast.warning.mockReset()
  })

  it('success() picks the success type', async () => {
    await notifications.success('Saved', 'file')
    expect(mockToast.success).toHaveBeenCalledWith('Saved: file', {})
  })

  it('error() picks the error type', async () => {
    await notifications.error('Boom', 'hard')
    expect(mockToast.error).toHaveBeenCalledWith('Boom: hard', {})
  })

  it('info() picks the info type', async () => {
    await notifications.info('FYI', 'ok')
    expect(mockToast.info).toHaveBeenCalledWith('FYI: ok', {})
  })

  it('warning() picks the warning type', async () => {
    await notifications.warning('Careful', 'slow down')
    expect(mockToast.warning).toHaveBeenCalledWith('Careful: slow down', {})
  })

  it('routes through native when the native flag is true', async () => {
    mockCommands.sendNativeNotification.mockResolvedValue({
      status: 'ok',
      data: null,
    })
    await notifications.success('Hi', 'world', true)
    expect(mockCommands.sendNativeNotification).toHaveBeenCalledWith(
      'Hi',
      'world'
    )
  })
})

describe('destructured convenience exports', () => {
  beforeEach(() => {
    mockToast.success.mockReset()
    mockToast.error.mockReset()
    mockToast.info.mockReset()
    mockToast.warning.mockReset()
  })

  it('success / error / info / warning all dispatch to the right toast', async () => {
    await success('s', 'x')
    await error('e', 'x')
    await info('i', 'x')
    await warning('w', 'x')
    expect(mockToast.success).toHaveBeenCalled()
    expect(mockToast.error).toHaveBeenCalled()
    expect(mockToast.info).toHaveBeenCalled()
    expect(mockToast.warning).toHaveBeenCalled()
  })
})
