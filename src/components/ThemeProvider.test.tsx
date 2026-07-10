/**
 * Tests for the `ThemeProvider` component.
 *
 * Coverage targets (drive src/components/ThemeProvider.tsx from 0% to ~95%):
 *   - useState initializer: localStorage stored value / defaultTheme fallback / storageKey
 *   - useLayoutEffect (preference sync, ref-guarded): no-op / first-run / ref guard
 *   - useEffect (apply theme): 'system' w/ listener + cleanup / 'dark'/'light' w/o / class swap
 *   - setTheme callback: localStorage write / state update / emit('theme-changed', ...)
 *
 * Mocking strategy follows existing patterns in src/services/preferences.test.tsx
 * and src/hooks/useBeadsInvalidation.test.tsx.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useContext } from 'react'
import { act, renderHook, type RenderHookResult } from '@/test/test-utils'
import {
  ThemeProviderContext,
  type Theme,
  type ThemeProviderState,
} from '@/lib/theme-context'
import type { usePreferences } from '@/services/preferences'

import { ThemeProvider } from './ThemeProvider'

const { mockEmit } = vi.hoisted(() => ({ mockEmit: vi.fn() }))
const { mockUsePreferences } = vi.hoisted(() => ({ mockUsePreferences: vi.fn() }))

vi.mock('@tauri-apps/api/event', () => ({ emit: mockEmit }))
vi.mock('@/services/preferences', () => ({ usePreferences: mockUsePreferences }))

interface MatchMediaStub {
  matches: boolean
  media: string
  listeners: ((e: { matches: boolean }) => void)[]
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  dispatchEvent: ReturnType<typeof vi.fn>
  fireChange: (matches: boolean) => void
}

function stubMatchMedia(initialMatches: boolean): MatchMediaStub {
  const listeners: ((e: { matches: boolean }) => void)[] = []
  const stub: MatchMediaStub = {
    matches: initialMatches,
    media: '(prefers-color-scheme: dark)',
    listeners,
    addEventListener: vi.fn(
      (event: string, cb: (e: { matches: boolean }) => void) => {
        if (event === 'change') listeners.push(cb)
      },
    ),
    removeEventListener: vi.fn(
      (event: string, cb: (e: { matches: boolean }) => void) => {
        if (event !== 'change') return
        const idx = listeners.indexOf(cb)
        if (idx >= 0) listeners.splice(idx, 1)
      },
    ),
    dispatchEvent: vi.fn(),
    fireChange: (matches: boolean) => {
      stub.matches = matches
      for (const cb of listeners) cb({ matches })
    },
  }
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(stub))
  return stub
}

function makePreferencesMock(theme: Theme | undefined): void {
  mockUsePreferences.mockReturnValue({
    data:
      theme === undefined
        ? undefined
        : { theme, quick_pane_shortcut: null, language: null },
    isLoading: false,
    isSuccess: theme !== undefined,
    isError: false,
  } as unknown as ReturnType<typeof usePreferences>)
}

// ----------------------------------------------------------------------------
// Render helper — uses renderHook() with a ThemeProvider wrapper. The hook
// callback reads the live ThemeProviderContext; result.current reflects the
// latest context value after every rerender (including state updates
// triggered by useLayoutEffect inside the provider).
// ----------------------------------------------------------------------------

interface ThemeProviderHandle {
  /** Latest theme reported by the context. */
  getTheme: () => Theme
  /** Latest setTheme callback published on the context. */
  getSetTheme: () => ((theme: Theme) => void) | null
  /** documentElement classes — what useEffect actually wrote. */
  getDocumentClasses: () => string[]
  /** Unmount the provider (used to assert cleanup). */
  unmount: () => void
  /** Re-render with the same wrapper (used for ref-guard test). */
  rerender: () => void
}

function renderThemeProvider(
  props: {
    defaultTheme?: Theme
    storageKey?: string
    /**
     * Explicitly set the preferences mock for this render. If you
     * call `makePreferencesMock()` yourself before invoking the
     * helper, omit this so the mock is preserved.
     */
    preferencesTheme?: Theme | undefined
  } = {},
): ThemeProviderHandle {
  if ('preferencesTheme' in props) {
    makePreferencesMock(props.preferencesTheme)
  }
  const probe: RenderHookResult<ThemeProviderState, { children: unknown }> =
    renderHook(() => useContext(ThemeProviderContext), {
      wrapper: ({ children }) => (
        <ThemeProvider
          defaultTheme={props.defaultTheme}
          storageKey={props.storageKey ?? 'ui-theme'}
        >
          {children}
        </ThemeProvider>
      ),
    })
  return {
    getTheme: () => probe.result.current.theme,
    getSetTheme: () => probe.result.current.setTheme,
    getDocumentClasses: () =>
      Array.from(document.documentElement.classList).sort(),
    unmount: () => probe.unmount(),
    rerender: () => probe.rerender(),
  }
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    mockEmit.mockReset()
    mockUsePreferences.mockReset()
    // Default: usePreferences returns a query-shaped object with no data
    // (so `const { data } = usePreferences()` destructures cleanly).
    // Individual tests can override via makePreferencesMock(theme).
    mockUsePreferences.mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof usePreferences>)
    // Each test opts in to its own matchMedia stub via stubMatchMedia();
    // tear down any prior stubGlobal before the next test.
    vi.unstubAllGlobals()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('useState initializer (localStorage -> defaultTheme)', () => {
    it('uses the stored value from localStorage when present', () => {
      localStorage.setItem('ui-theme', 'dark')
      const handle = renderThemeProvider({ defaultTheme: 'light' })
      expect(handle.getTheme()).toBe('dark')
      expect(handle.getDocumentClasses()).toEqual(['dark'])
    })

    it('falls back to the defaultTheme prop when localStorage is empty', () => {
      const handle = renderThemeProvider({ defaultTheme: 'light' })
      expect(handle.getTheme()).toBe('light')
      expect(handle.getDocumentClasses()).toEqual(['light'])
    })

    it('falls back to "system" when no defaultTheme is passed and localStorage is empty', () => {
      const stub = stubMatchMedia(true)
      const handle = renderThemeProvider()
      expect(handle.getTheme()).toBe('system')
      expect(handle.getDocumentClasses()).toEqual(['dark'])
      expect(stub.addEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function),
      )
    })

    it('honours the storageKey prop when reading from localStorage', () => {
      localStorage.setItem('app:theme', 'dark')
      const handle = renderThemeProvider({ storageKey: 'app:theme' })
      expect(handle.getTheme()).toBe('dark')
    })
  })

  describe('useLayoutEffect (preference sync, ref-guarded)', () => {
    it('is a no-op when preferences.theme is undefined', () => {
      makePreferencesMock(undefined)
      const handle = renderThemeProvider({ defaultTheme: 'light' })
      expect(handle.getTheme()).toBe('light')
      expect(mockEmit).not.toHaveBeenCalled()
    })

    it('syncs theme to preferences.theme on the first run', () => {
      makePreferencesMock('dark')
      const handle = renderThemeProvider({ defaultTheme: 'light' })
      expect(handle.getTheme()).toBe('dark')
      expect(handle.getDocumentClasses()).toEqual(['dark'])
    })

    it('does not re-sync when preferences.theme changes after the first sync (ref guard)', () => {
      makePreferencesMock('dark')
      const handle = renderThemeProvider({ defaultTheme: 'light' })
      expect(handle.getTheme()).toBe('dark')
      // Flip preferences to 'light'; the ref guard must prevent the
      // second sync from overwriting the theme.
      makePreferencesMock('light')
      act(() => {
        handle.rerender()
      })
      expect(handle.getTheme()).toBe('dark')
    })
  })

  describe('useEffect (apply theme to documentElement)', () => {
    it('applies the OS preference and attaches a change listener when theme is "system"', () => {
      const stub = stubMatchMedia(false)
      const handle = renderThemeProvider()
      expect(handle.getDocumentClasses()).toEqual(['light'])
      expect(stub.addEventListener).toHaveBeenCalledTimes(1)
      expect(stub.addEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function),
      )
      expect(stub.removeEventListener).not.toHaveBeenCalled()
    })

    it('reacts to OS-level changes via the matchMedia listener', () => {
      const stub = stubMatchMedia(false)
      const handle = renderThemeProvider()
      expect(handle.getDocumentClasses()).toEqual(['light'])
      act(() => {
        stub.fireChange(true)
      })
      expect(handle.getDocumentClasses()).toEqual(['dark'])
      act(() => {
        stub.fireChange(false)
      })
      expect(handle.getDocumentClasses()).toEqual(['light'])
    })

    it('detaches the change listener on unmount (cleanup returned by the "system" branch)', () => {
      const stub = stubMatchMedia(false)
      const handle = renderThemeProvider()
      const registeredCb = stub.listeners[0]
      expect(registeredCb).toBeDefined()
      handle.unmount()
      expect(stub.removeEventListener).toHaveBeenCalledWith('change', registeredCb)
      expect(stub.listeners).toHaveLength(0)
    })

    it('applies "dark" and does NOT attach a listener when theme is "dark"', () => {
      localStorage.setItem('ui-theme', 'dark')
      const stub = stubMatchMedia(true)
      const handle = renderThemeProvider()
      expect(handle.getDocumentClasses()).toEqual(['dark'])
      expect(stub.addEventListener).not.toHaveBeenCalled()
    })

    it('applies "light" and does NOT attach a listener when theme is "light"', () => {
      localStorage.setItem('ui-theme', 'light')
      const stub = stubMatchMedia(true)
      const handle = renderThemeProvider()
      expect(handle.getDocumentClasses()).toEqual(['light'])
      expect(stub.addEventListener).not.toHaveBeenCalled()
    })

    it('removes the prior "dark" class before applying "light" (classList.remove before classList.add)', () => {
      document.documentElement.classList.add('dark')
      stubMatchMedia(false)
      const handle = renderThemeProvider({ defaultTheme: 'light' })
      // applyTheme() does classList.remove('light','dark') then add(...).
      expect(handle.getDocumentClasses()).toContain('light')
      expect(handle.getDocumentClasses()).not.toContain('dark')
    })
  })

  describe('setTheme callback (via ThemeProviderContext)', () => {
    it('writes newTheme to localStorage under the storageKey', () => {
      const handle = renderThemeProvider({ storageKey: 'ui-theme' })
      act(() => {
        handle.getSetTheme()?.('dark')
      })
      expect(localStorage.getItem('ui-theme')).toBe('dark')
    })

    it('uses the storageKey prop when writing to localStorage', () => {
      const handle = renderThemeProvider({ storageKey: 'app:theme' })
      act(() => {
        handle.getSetTheme()?.('light')
      })
      expect(localStorage.getItem('app:theme')).toBe('light')
      expect(localStorage.getItem('ui-theme')).toBeNull()
    })

    it('updates React state — the live theme reflects the new value', () => {
      const handle = renderThemeProvider()
      expect(handle.getTheme()).toBe('system')
      act(() => {
        handle.getSetTheme()?.('dark')
      })
      expect(handle.getTheme()).toBe('dark')
      act(() => {
        handle.getSetTheme()?.('light')
      })
      expect(handle.getTheme()).toBe('light')
    })

    it('re-runs the apply-theme effect when setTheme changes the value (no listener for explicit themes)', () => {
      const stub = stubMatchMedia(false)
      const handle = renderThemeProvider()
      expect(handle.getDocumentClasses()).toEqual(['light'])
      expect(stub.addEventListener).toHaveBeenCalledTimes(1)
      // Capture the listener BEFORE setTheme fires — the cleanup that
      // runs on the system -> dark transition removes it from the array.
      const registeredCb = stub.listeners[0]
      expect(registeredCb).toBeDefined()
      act(() => {
        handle.getSetTheme()?.('dark')
      })
      expect(handle.getDocumentClasses()).toEqual(['dark'])
      expect(stub.removeEventListener).toHaveBeenCalledWith('change', registeredCb)
    })

    it('emits the "theme-changed" event with the new theme so other windows can react', () => {
      const handle = renderThemeProvider()
      act(() => {
        handle.getSetTheme()?.('dark')
      })
      expect(mockEmit).toHaveBeenCalledWith('theme-changed', { theme: 'dark' })
      act(() => {
        handle.getSetTheme()?.('light')
      })
      expect(mockEmit).toHaveBeenCalledWith('theme-changed', { theme: 'light' })
      expect(mockEmit).toHaveBeenCalledTimes(2)
    })
  })
})
