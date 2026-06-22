import { describe, it, expect } from 'vitest'
import { formatShortcut, getPlatformStrings } from './platform-strings'

describe('getPlatformStrings', () => {
  it('returns macOS strings for macOS platform', () => {
    const strings = getPlatformStrings('macos')
    expect(strings.revealInFileManager).toBe('Reveal in Finder')
    expect(strings.fileManagerName).toBe('Finder')
    expect(strings.modifierKey).toBe('Cmd')
    expect(strings.modifierKeySymbol).toBe('⌘')
    expect(strings.preferencesLabel).toBe('Preferences')
    expect(strings.quitLabel).toBe('Quit')
    expect(strings.trashName).toBe('Trash')
  })

  it('returns Windows strings for windows platform', () => {
    const strings = getPlatformStrings('windows')
    expect(strings.revealInFileManager).toBe('Show in Explorer')
    expect(strings.fileManagerName).toBe('Explorer')
    expect(strings.modifierKey).toBe('Ctrl')
    expect(strings.modifierKeySymbol).toBe('Ctrl')
    expect(strings.preferencesLabel).toBe('Settings')
    expect(strings.quitLabel).toBe('Exit')
    expect(strings.trashName).toBe('Recycle Bin')
  })

  it('returns Linux strings for linux platform', () => {
    const strings = getPlatformStrings('linux')
    expect(strings.revealInFileManager).toBe('Show in Files')
    expect(strings.fileManagerName).toBe('Files')
    expect(strings.modifierKey).toBe('Ctrl')
    expect(strings.modifierKeySymbol).toBe('Ctrl')
    expect(strings.preferencesLabel).toBe('Preferences')
    expect(strings.quitLabel).toBe('Quit')
    expect(strings.trashName).toBe('Trash')
  })

  it('falls back to macOS strings when platform is undefined', () => {
    const strings = getPlatformStrings(undefined)
    expect(strings.modifierKey).toBe('Cmd')
    expect(strings.fileManagerName).toBe('Finder')
  })

  it('returns a complete PlatformStrings shape on every platform', () => {
    for (const platform of ['macos', 'windows', 'linux'] as const) {
      const strings = getPlatformStrings(platform)
      // The contract is "every field is a non-empty string" — a future
      // maintainer adding a new field to PlatformStrings will fail this
      // test until they add the value to all three platform tables.
      expect(strings.revealInFileManager).toBeTruthy()
      expect(strings.fileManagerName).toBeTruthy()
      expect(strings.modifierKey).toBeTruthy()
      expect(strings.modifierKeySymbol).toBeTruthy()
      expect(strings.optionKey).toBeTruthy()
      expect(strings.optionKeySymbol).toBeTruthy()
      expect(strings.preferencesLabel).toBeTruthy()
      expect(strings.quitLabel).toBeTruthy()
      expect(strings.trashName).toBeTruthy()
    }
  })
})

describe('formatShortcut', () => {
  describe('macOS', () => {
    it('formats a single-modifier shortcut with the ⌘ symbol', () => {
      expect(formatShortcut('macos', 'K')).toBe('⌘K')
    })

    it('formats shift+mod in Mac order (shift first)', () => {
      expect(formatShortcut('macos', 'K', ['shift', 'mod'])).toBe('⇧⌘K')
    })

    it('formats alt+mod in Mac order', () => {
      expect(formatShortcut('macos', 'K', ['alt', 'mod'])).toBe('⌥⌘K')
    })

    it('formats all three modifiers in Mac order: shift, alt, mod, key', () => {
      expect(
        formatShortcut('macos', 'K', ['shift', 'alt', 'mod'])
      ).toBe('⇧⌥⌘K')
    })

    it('uses the literal key when no modifiers are provided', () => {
      expect(formatShortcut('macos', 'F1', [])).toBe('F1')
    })

    it('treats a falsy platform as macOS', () => {
      expect(formatShortcut(undefined, 'K')).toBe('⌘K')
    })
  })

  describe('Windows / Linux', () => {
    it('uses "Ctrl+" with a + separator on Windows', () => {
      expect(formatShortcut('windows', 'K')).toBe('Ctrl+K')
    })

    it('uses "Ctrl+" with a + separator on Linux', () => {
      expect(formatShortcut('linux', 'K')).toBe('Ctrl+K')
    })

    it('prefixes with Shift+ on non-mac platforms', () => {
      expect(formatShortcut('windows', 'K', ['shift', 'mod'])).toBe(
        'Shift+Ctrl+K'
      )
    })

    it('prefixes with Alt+ on non-mac platforms', () => {
      expect(formatShortcut('linux', 'K', ['alt', 'mod'])).toBe('Alt+Ctrl+K')
    })

    it('renders the bare key on non-mac platforms when no modifiers', () => {
      expect(formatShortcut('windows', 'Escape', [])).toBe('Escape')
    })
  })
})
