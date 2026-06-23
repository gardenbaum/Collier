import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from './ui-store'

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      sidebarVisible: true,
      leftSidebarVisible: true,
      commandPaletteOpen: false,
      preferencesOpen: false,
      lastQuickPaneEntry: null,
    })
  })

  describe('initial state', () => {
    it('starts with sidebar visible, palette closed, preferences closed, no recent quick-pane entry', () => {
      const s = useUIStore.getState()
      expect(s.sidebarVisible).toBe(true)
      expect(s.leftSidebarVisible).toBe(true)
      expect(s.commandPaletteOpen).toBe(false)
      expect(s.preferencesOpen).toBe(false)
      expect(s.lastQuickPaneEntry).toBeNull()
    })
  })

  describe('toggleSidebar / setSidebarVisible', () => {
    it('toggleSidebar flips sidebarVisible and the legacy alias', () => {
      useUIStore.getState().toggleSidebar()
      const s = useUIStore.getState()
      expect(s.sidebarVisible).toBe(false)
      expect(s.leftSidebarVisible).toBe(false)
      useUIStore.getState().toggleSidebar()
      expect(useUIStore.getState().sidebarVisible).toBe(true)
    })

    it('setSidebarVisible updates sidebarVisible and the legacy alias together', () => {
      useUIStore.getState().setSidebarVisible(false)
      const s = useUIStore.getState()
      expect(s.sidebarVisible).toBe(false)
      expect(s.leftSidebarVisible).toBe(false)
    })
  })

  describe('legacy left-sidebar aliases', () => {
    it('toggleLeftSidebar flips both sidebarVisible and leftSidebarVisible', () => {
      useUIStore.getState().toggleLeftSidebar()
      const s = useUIStore.getState()
      expect(s.sidebarVisible).toBe(false)
      expect(s.leftSidebarVisible).toBe(false)
    })

    it('setLeftSidebarVisible updates both visibility fields together', () => {
      useUIStore.getState().setLeftSidebarVisible(false)
      const s = useUIStore.getState()
      expect(s.sidebarVisible).toBe(false)
      expect(s.leftSidebarVisible).toBe(false)
    })
  })

  describe('command palette', () => {
    it('toggleCommandPalette flips the open flag', () => {
      useUIStore.getState().toggleCommandPalette()
      expect(useUIStore.getState().commandPaletteOpen).toBe(true)
      useUIStore.getState().toggleCommandPalette()
      expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    })

    it('setCommandPaletteOpen sets the open flag explicitly', () => {
      useUIStore.getState().setCommandPaletteOpen(true)
      expect(useUIStore.getState().commandPaletteOpen).toBe(true)
      useUIStore.getState().setCommandPaletteOpen(false)
      expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    })
  })

  describe('preferences', () => {
    it('togglePreferences flips the preferences-open flag', () => {
      useUIStore.getState().togglePreferences()
      expect(useUIStore.getState().preferencesOpen).toBe(true)
      useUIStore.getState().togglePreferences()
      expect(useUIStore.getState().preferencesOpen).toBe(false)
    })

    it('setPreferencesOpen sets the preferences-open flag explicitly', () => {
      useUIStore.getState().setPreferencesOpen(true)
      expect(useUIStore.getState().preferencesOpen).toBe(true)
      useUIStore.getState().setPreferencesOpen(false)
      expect(useUIStore.getState().preferencesOpen).toBe(false)
    })
  })

  describe('quick-pane history', () => {
    it('setLastQuickPaneEntry stores the latest text and overwrites previous entries', () => {
      useUIStore.getState().setLastQuickPaneEntry('first')
      expect(useUIStore.getState().lastQuickPaneEntry).toBe('first')
      useUIStore.getState().setLastQuickPaneEntry('second')
      expect(useUIStore.getState().lastQuickPaneEntry).toBe('second')
    })

    it('accepts an empty string and a long value without truncation', () => {
      useUIStore.getState().setLastQuickPaneEntry('')
      expect(useUIStore.getState().lastQuickPaneEntry).toBe('')
      const long = 'x'.repeat(512)
      useUIStore.getState().setLastQuickPaneEntry(long)
      expect(useUIStore.getState().lastQuickPaneEntry).toBe(long)
    })
  })

  describe('setSquareCorners', () => {
    it('toggles the "square-corners" class on document.documentElement', () => {
      const root = document.documentElement
      root.classList.remove('square-corners')

      useUIStore.getState().setSquareCorners(true)
      expect(root.classList.contains('square-corners')).toBe(true)

      useUIStore.getState().setSquareCorners(false)
      expect(root.classList.contains('square-corners')).toBe(false)
    })
  })
})
