import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const { mockCommands } = vi.hoisted(() => ({
  mockCommands: {
    loadPreferences: vi.fn(),
    savePreferences: vi.fn(),
  },
}))

const { mockToast } = vi.hoisted(() => ({
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: mockCommands,
}))

vi.mock('sonner', () => ({
  toast: mockToast,
}))

vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}))

import {
  usePreferences,
  useSavePreferences,
  preferencesQueryKeys,
} from './preferences'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  Wrapper.displayName = 'QueryWrapper'
  return Wrapper
}

describe('preferencesQueryKeys', () => {
  it('exposes a stable root key', () => {
    expect(preferencesQueryKeys.all).toEqual(['preferences'])
  })

  it('returns a fresh array per call but with the same contents', () => {
    const a = preferencesQueryKeys.preferences()
    const b = preferencesQueryKeys.preferences()
    expect(a).toEqual(b)
    expect(a).not.toBe(b) // fresh array, not a shared reference
  })
})

describe('usePreferences', () => {
  beforeEach(() => {
    mockCommands.loadPreferences.mockReset()
    mockLogger.debug.mockReset()
    mockLogger.info.mockReset()
    mockLogger.warn.mockReset()
  })

  it('returns the loaded preferences on success', async () => {
    const prefs = {
      theme: 'dark',
      quick_pane_shortcut: 'Cmd+K',
      language: 'en',
    }
    mockCommands.loadPreferences.mockResolvedValue({
      status: 'ok',
      data: prefs,
    })
    const { result } = renderHook(() => usePreferences(), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(prefs)
  })

  it('falls back to defaults on backend error and logs a warning', async () => {
    mockCommands.loadPreferences.mockResolvedValue({
      status: 'error',
      error: { type: 'IoError', message: 'no file' },
    })
    const { result } = renderHook(() => usePreferences(), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({
      theme: 'system',
      quick_pane_shortcut: null,
      language: null,
    })
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Failed to load preferences, using defaults',
      expect.objectContaining({ error: expect.anything() })
    )
  })
})

describe('useSavePreferences', () => {
  beforeEach(() => {
    mockCommands.savePreferences.mockReset()
    mockToast.success.mockReset()
    mockToast.error.mockReset()
    mockLogger.debug.mockReset()
    mockLogger.info.mockReset()
    mockLogger.error.mockReset()
  })

  it('forwards the preferences to the backend and toasts success', async () => {
    mockCommands.savePreferences.mockResolvedValue({
      status: 'ok',
      data: null,
    })
    const wrapper = createWrapper()
    const { result } = renderHook(
      () => ({
        save: useSavePreferences(),
      }),
      { wrapper }
    )
    const newPrefs = {
      theme: 'light',
      quick_pane_shortcut: null,
      language: 'fr',
    }
    await act(async () => {
      await result.current.save.mutateAsync(newPrefs)
    })
    expect(mockCommands.savePreferences).toHaveBeenCalledWith(newPrefs)
    expect(mockToast.success).toHaveBeenCalledWith('Preferences saved')
  })

  it('toasts an error and throws when the backend returns an error with a message field', async () => {
    mockCommands.savePreferences.mockResolvedValue({
      status: 'error',
      error: { type: 'IoError', message: 'permission denied' },
    })
    const { result } = renderHook(() => useSavePreferences(), {
      wrapper: createWrapper(),
    })
    const prefs = {
      theme: 'dark',
      quick_pane_shortcut: null,
      language: 'en',
    }
    await act(async () => {
      await expect(result.current.mutateAsync(prefs)).rejects.toThrow(
        'permission denied'
      )
    })
    expect(mockToast.error).toHaveBeenCalledWith(
      'Failed to save preferences',
      expect.objectContaining({ description: 'permission denied' })
    )
  })

  it('stringifies the error when no message field is present', async () => {
    mockCommands.savePreferences.mockResolvedValue({
      status: 'error',
      error: { type: 'NotFound', id: 'whatever' },
    })
    const { result } = renderHook(() => useSavePreferences(), {
      wrapper: createWrapper(),
    })
    const prefs = {
      theme: 'dark',
      quick_pane_shortcut: null,
      language: 'en',
    }
    await act(async () => {
      await expect(result.current.mutateAsync(prefs)).rejects.toThrow()
    })
    // The toast description should contain the stringified form, not
    // the raw object.
    expect(mockToast.error).toHaveBeenCalledWith(
      'Failed to save preferences',
      expect.objectContaining({ description: expect.any(String) })
    )
  })
})
