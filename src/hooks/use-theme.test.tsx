/**
 * Tests for the `useTheme` hook, which is a thin React-Context
 * wrapper around `ThemeProviderContext`.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTheme } from './use-theme'
import {
  ThemeProviderContext,
  type ThemeProviderState,
} from '@/lib/theme-context'
import type { ReactNode } from 'react'

const wrapWithContext = (value: ThemeProviderState) => {
  // A `wrapper` callback that supplies a custom ThemeProviderContext
  // value; we use the public Provider so React tracks context changes
  // through the normal mechanism.
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
  Wrapper.displayName = 'ThemeWrapper'
  return Wrapper
}

describe('useTheme', () => {
  it('returns the context value when a provider supplies one', () => {
    const setTheme = (): void => undefined
    const wrapper = wrapWithContext({ theme: 'dark', setTheme })
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('dark')
    expect(result.current.setTheme).toBe(setTheme)
  })

  it('uses the no-op setTheme default when no provider is present', () => {
    // Default context: theme='system', setTheme is a no-op.
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('system')
    expect(result.current.setTheme).toBeDefined()
    // The default setTheme returns null; it should not throw.
    expect(result.current.setTheme('light')).toBeNull()
  })

  it('throws a descriptive error if the context is explicitly undefined', () => {
    // Override the default with an explicit undefined value.
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ThemeProviderContext.Provider
        value={undefined as unknown as ThemeProviderState}
      >
        {children}
      </ThemeProviderContext.Provider>
    )
    // Suppress React's error logging for this expected throw.
    const errSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    expect(() => renderHook(() => useTheme(), { wrapper })).toThrow(
      /useTheme must be used within a ThemeProvider/
    )
    errSpy.mockRestore()
  })
})
