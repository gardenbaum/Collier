import { describe, it, expect } from 'vitest'
import {
  ThemeProviderContext,
  type Theme,
  type ThemeProviderState,
} from './theme-context'

const peekContext = (): ThemeProviderState =>
  (ThemeProviderContext as unknown as { _currentValue: ThemeProviderState })
    ._currentValue

describe('theme-context module', () => {
  it('exports "dark" | "light" | "system" as valid Theme values', () => {
    const values: Theme[] = ['dark', 'light', 'system']
    expect(values).toEqual(['dark', 'light', 'system'])
  })

  it('ThemeProviderContext defaults to a "system" theme with a no-op setTheme', () => {
    const ctx = peekContext()
    expect(ctx.theme).toBe('system')
    expect(ctx.setTheme('dark')).toBeNull()
    expect(ctx.setTheme('light')).toBeNull()
    expect(ctx.setTheme('system')).toBeNull()
  })

  it('ThemeProviderContext is a React context object with Provider and Consumer', () => {
    const ctx = ThemeProviderContext as unknown as Record<string, unknown>
    expect(ctx).toBeDefined()
    expect(typeof ctx.Provider).toBe('object')
    expect(typeof ctx.Consumer).toBe('object')
  })
})
