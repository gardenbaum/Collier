import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface UIState {
  sidebarVisible: boolean
  commandPaletteOpen: boolean
  preferencesOpen: boolean
  lastQuickPaneEntry: string | null

  toggleSidebar: () => void
  setSidebarVisible: (visible: boolean) => void
  toggleCommandPalette: () => void
  setCommandPaletteOpen: (open: boolean) => void
  togglePreferences: () => void
  setPreferencesOpen: (open: boolean) => void
  setLastQuickPaneEntry: (text: string) => void
  setSquareCorners: (enabled: boolean) => void

  /**
   * @deprecated Use `sidebarVisible` instead. Kept as an alias for
   * legacy callers (the right sidebar was removed in the Phase 4
   * app-shell refactor — there is now only one rail).
   */
  leftSidebarVisible: boolean
  setLeftSidebarVisible: (visible: boolean) => void
  toggleLeftSidebar: () => void
}

const writeSidebar = (visible: boolean) => ({
  sidebarVisible: visible,
  leftSidebarVisible: visible,
})

export const useUIStore = create<UIState>()(
  devtools(
    set => ({
      sidebarVisible: true,
      leftSidebarVisible: true,
      commandPaletteOpen: false,
      preferencesOpen: false,
      lastQuickPaneEntry: null,

      toggleSidebar: () =>
        set(
          state => writeSidebar(!state.sidebarVisible),
          undefined,
          'toggleSidebar'
        ),

      setSidebarVisible: visible =>
        set(writeSidebar(visible), undefined, 'setSidebarVisible'),

      toggleLeftSidebar: () =>
        set(
          state => writeSidebar(!state.sidebarVisible),
          undefined,
          'toggleLeftSidebar'
        ),

      setLeftSidebarVisible: visible =>
        set(writeSidebar(visible), undefined, 'setLeftSidebarVisible'),

      toggleCommandPalette: () =>
        set(
          state => ({ commandPaletteOpen: !state.commandPaletteOpen }),
          undefined,
          'toggleCommandPalette'
        ),

      setCommandPaletteOpen: open =>
        set({ commandPaletteOpen: open }, undefined, 'setCommandPaletteOpen'),

      togglePreferences: () =>
        set(
          state => ({ preferencesOpen: !state.preferencesOpen }),
          undefined,
          'togglePreferences'
        ),

      setPreferencesOpen: open =>
        set({ preferencesOpen: open }, undefined, 'setPreferencesOpen'),

      setLastQuickPaneEntry: text =>
        set({ lastQuickPaneEntry: text }, undefined, 'setLastQuickPaneEntry'),

      setSquareCorners: (enabled: boolean) => {
        document.documentElement.classList.toggle('square-corners', enabled)
      },
    }),
    {
      name: 'ui-store',
    }
  )
)
