/**
 * Tests for the beads error-toast helpers.
 *
 * Contract: `showError` and `showErrorWithRetry` both call Sonner's
 * `toast.error` with a `message` arg. `showErrorWithRetry` always
 * attaches a Retry action; `showError` only attaches it when the
 * `retry` option is set. The `details` option is forwarded as the
 * `description` field on the toast.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { showError, showErrorWithRetry } from './ErrorToasts'

const { mockToastError } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

const mockedToastError = vi.mocked(toast.error)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('showError', () => {
  it('calls toast.error with the message and no action when no options are passed', () => {
    showError('Command failed')

    expect(mockedToastError).toHaveBeenCalledTimes(1)
    const [msg, opts] = mockedToastError.mock.calls[0] as [string, object]
    expect(msg).toBe('Command failed')
    expect(opts).toEqual({ action: undefined, description: undefined })
  })

  it('forwards the details string as the toast description', () => {
    showError('bd not in PATH', { details: 'No such file or directory' })

    const [, opts] = mockedToastError.mock.calls[0] as [string, object]
    expect(opts).toMatchObject({ description: 'No such file or directory' })
  })

  it('attaches a Retry action that invokes the provided callback on click', () => {
    const retry = vi.fn()
    showError('Timeout', { retry })

    const [, opts] = mockedToastError.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } | undefined },
    ]
    expect(opts.action).toBeDefined()
    expect(opts.action?.label).toBe('Retry')
    opts.action?.onClick()
    expect(retry).toHaveBeenCalledTimes(1)
  })
})

describe('showErrorWithRetry', () => {
  it('calls toast.error with the message, a Retry action, and an optional description', () => {
    const retry = vi.fn()
    showErrorWithRetry('Network error', retry, 'Connection refused')

    expect(mockedToastError).toHaveBeenCalledTimes(1)
    const [msg, opts] = mockedToastError.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void }; description?: string },
    ]
    expect(msg).toBe('Network error')
    expect(opts.action).toBeDefined()
    expect(opts.action.label).toBe('Retry')
    expect(opts.description).toBe('Connection refused')

    opts.action.onClick()
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('omits the description when not provided', () => {
    const retry = vi.fn()
    showErrorWithRetry('Try again', retry)

    const [, opts] = mockedToastError.mock.calls[0] as [
      string,
      { action: unknown; description?: string },
    ]
    expect(opts.description).toBeUndefined()
  })
})
