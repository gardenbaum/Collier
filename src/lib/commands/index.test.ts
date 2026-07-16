/**
 * Tests for the command-system bootstrap (`src/lib/commands/index.ts`).
 *
 * `initializeCommandSystem()` is the app-startup entry point that
 * registers every command group with the in-memory registry. The
 * function was previously untested (coverage 0%) because:
 *   - the three command-array modules it imports have heavy
 *     Tauri / i18n / Zustand dependencies that the test runner
 *     cannot resolve without mocks, and
 *   - the production call site (`src/main.tsx`) only fires once
 *     during boot — end-to-end coverage is impossible without
 *     mocking the registry itself.
 *
 * Strategy: stub the three command-array modules and replace
 * `registerCommands` with a `vi.fn()` so we can observe the exact
 * call sequence. The `import.meta.env.DEV` console log is
 * toggled via `vi.stubEnv('DEV', …)` plus `vi.resetModules()` so
 * the production code re-evaluates the env on each scenario.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type * as RegistryModule from './registry'
import type { AppCommand } from './types'

const registerCommandsMock = vi.fn<(commands: AppCommand[]) => void>()

vi.mock('./registry', async () => {
  const actual = await vi.importActual<typeof RegistryModule>('./registry')
  return {
    ...actual,
    registerCommands: registerCommandsMock,
  }
})

// Stable sentinels so the assertions can match against the
// exact array references `initializeCommandSystem()` passed.
const NAV_STUB: AppCommand[] = [{ id: 'stub-nav' } as unknown as AppCommand]
const WIN_STUB: AppCommand[] = [{ id: 'stub-win' } as unknown as AppCommand]
const NOTIF_STUB: AppCommand[] = [{ id: 'stub-notif' } as unknown as AppCommand]

vi.mock('./navigation-commands', () => ({
  navigationCommands: NAV_STUB,
}))
vi.mock('./window-commands', () => ({
  windowCommands: WIN_STUB,
}))
vi.mock('./notification-commands', () => ({
  notificationCommands: NOTIF_STUB,
}))

// The re-exported `useCommandContext` hook pulls in the live
// Zustand stores; replace it with a noop so the module under
// test loads cleanly. Empty bodies are flagged by the lint
// rule, so each stub body is a `void` expression instead.
vi.mock('../../hooks/use-command-context', () => ({
  useCommandContext: () => ({
    openPreferences: () => {
      void 0
    },
    showToast: () => {
      void 0
    },
  }),
}))

const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {
  void 0
})

describe('initializeCommandSystem', () => {
  beforeEach(() => {
    registerCommandsMock.mockClear()
    consoleLogSpy.mockClear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('registers every command group with the in-memory registry', async () => {
    const { initializeCommandSystem } = await import('./index')

    initializeCommandSystem()

    expect(registerCommandsMock).toHaveBeenCalledTimes(3)
    expect(registerCommandsMock).toHaveBeenNthCalledWith(1, NAV_STUB)
    expect(registerCommandsMock).toHaveBeenNthCalledWith(2, WIN_STUB)
    expect(registerCommandsMock).toHaveBeenNthCalledWith(3, NOTIF_STUB)
  })

  it('emits a console log when import.meta.env.DEV is true', async () => {
    vi.stubEnv('DEV', true)

    const { initializeCommandSystem } = await import('./index')
    initializeCommandSystem()

    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    expect(consoleLogSpy).toHaveBeenCalledWith('Command system initialized')
  })

  it('stays silent when import.meta.env.DEV is false', async () => {
    vi.stubEnv('DEV', false)

    const { initializeCommandSystem } = await import('./index')
    initializeCommandSystem()

    expect(consoleLogSpy).not.toHaveBeenCalled()
  })

  it('still registers every group when DEV is false', async () => {
    vi.stubEnv('DEV', false)

    const { initializeCommandSystem } = await import('./index')
    initializeCommandSystem()

    // The console.log gate is independent of the registration
    // side-effect; a production build must still wire up the
    // command registry.
    expect(registerCommandsMock).toHaveBeenCalledTimes(3)
    expect(registerCommandsMock).toHaveBeenNthCalledWith(3, NOTIF_STUB)
  })
})
