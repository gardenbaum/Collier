import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import i18n, { availableLanguages, isRTL } from './config'
import en from '../../locales/en.json'

// The i18n instance is a module-scoped singleton; keep tests order-independent
// by resetting to English before and after each case.
beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('i18n configuration', () => {
  it('is initialized with the expected languages', () => {
    expect(i18n.isInitialized).toBe(true)
    expect(availableLanguages).toEqual(
      expect.arrayContaining(['en', 'ar', 'fr'])
    )
    expect(availableLanguages).toHaveLength(3)
  })

  it('resolves flat dotted keys to real strings, not the key itself', () => {
    // Locale files use flat dotted keys (e.g. "app.name"). Resolution relies on
    // i18next's ignoreJSONStructure behavior — this guards against a regression
    // when bumping i18next across majors.
    const value = i18n.t('app.name')
    expect(value).toBe(en['app.name'])
    expect(value).not.toBe('app.name')
  })

  it('resolves a representative key from each translation group', () => {
    expect(i18n.t('preferences.title')).toBe(en['preferences.title'])
    expect(i18n.t('commandPalette.placeholder')).toBe(
      en['commandPalette.placeholder']
    )
    expect(i18n.t('toast.success.preferencesSaved')).toBe(
      en['toast.success.preferencesSaved']
    )
  })

  it('interpolates variables without leaking the placeholder', () => {
    const result = i18n.t('menu.about', { appName: 'Collier' })
    expect(result).toContain('Collier')
    expect(result).not.toContain('{{')
  })

  it('returns the raw key for unknown lookups', () => {
    expect(i18n.t('this.key.does.not.exist')).toBe('this.key.does.not.exist')
  })

  describe('language switching', () => {
    it('switches to French and resolves French strings', async () => {
      await i18n.changeLanguage('fr')
      expect(i18n.language).toBe('fr')
      const value = i18n.t('preferences.title')
      expect(value).not.toBe('preferences.title')
      expect(value).toBeTruthy()
    })

    it('keeps resolving after switching back to English', async () => {
      await i18n.changeLanguage('fr')
      await i18n.changeLanguage('en')
      expect(i18n.language).toBe('en')
      expect(i18n.t('preferences.title')).toBe(en['preferences.title'])
    })
  })

  describe('text direction', () => {
    it('marks Arabic as RTL and updates the document element', async () => {
      await i18n.changeLanguage('ar')
      expect(isRTL('ar')).toBe(true)
      expect(document.documentElement.dir).toBe('rtl')
      expect(document.documentElement.lang).toBe('ar')
    })

    it('marks French as LTR and updates the document element', async () => {
      await i18n.changeLanguage('fr')
      expect(isRTL('fr')).toBe(false)
      expect(document.documentElement.dir).toBe('ltr')
      expect(document.documentElement.lang).toBe('fr')
    })

    it('classifies known RTL languages even without bundled resources', () => {
      expect(isRTL('he')).toBe(true)
      expect(isRTL('fa')).toBe(true)
      expect(isRTL('ur')).toBe(true)
      expect(isRTL('en')).toBe(false)
    })
  })
})
