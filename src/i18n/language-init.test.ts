/**
 * Tests for `initializeLanguage`.
 *
 * Priority order:
 *   1. User's saved language preference (if set and supported)
 *   2. Detected system locale (if supported)
 *   3. English (fallback)
 *
 * Unknown saved languages and unsupported system locales fall
 * through to English. A failing `locale()` call must not crash
 * startup.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import i18n from './config'

const { mockLocale, mockLogger } = vi.hoisted(() => ({
  mockLocale: vi.fn<() => Promise<string | null>>(),
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@tauri-apps/plugin-os', () => ({
  locale: () => mockLocale(),
}))

vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}))

import { initializeLanguage } from './language-init'

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('initializeLanguage', () => {
  it('uses the user-saved language when it is in the available set', async () => {
    await initializeLanguage('fr')

    expect(i18n.language).toBe('fr')
    expect(mockLocale).not.toHaveBeenCalled()
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Language set from user preference',
      { language: 'fr' }
    )
  })

  it('uses the user-saved language even when the system locale would be different', async () => {
    await initializeLanguage('ar')

    expect(i18n.language).toBe('ar')
    expect(mockLocale).not.toHaveBeenCalled()
  })

  it('falls back to English when the saved language is not supported', async () => {
    await initializeLanguage('esperanto')

    expect(i18n.language).toBe('en')
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Saved language not available, using English',
      expect.objectContaining({ savedLanguage: 'esperanto' })
    )
  })

  it('detects language from the system locale when no preference is saved', async () => {
    mockLocale.mockResolvedValueOnce('fr-FR')

    await initializeLanguage(null)

    expect(i18n.language).toBe('fr')
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Language set from system locale',
      expect.objectContaining({ systemLocale: 'fr-FR', language: 'fr' })
    )
  })

  it('extracts the language code from a hyphenated system locale', async () => {
    mockLocale.mockResolvedValueOnce('ar-EG')

    await initializeLanguage(null)

    expect(i18n.language).toBe('ar')
  })

  it('lower-cases the detected language code before matching', async () => {
    mockLocale.mockResolvedValueOnce('EN-GB')

    await initializeLanguage(null)

    expect(i18n.language).toBe('en')
  })

  it('falls back to English when the system locale is not in the available set', async () => {
    mockLocale.mockResolvedValueOnce('xx-YY')

    await initializeLanguage(null)

    expect(i18n.language).toBe('en')
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'System locale not available in translations',
      expect.objectContaining({ langCode: 'xx' })
    )
  })

  it('falls back to English when the system locale is null', async () => {
    mockLocale.mockResolvedValueOnce(null)

    await initializeLanguage(null)

    expect(i18n.language).toBe('en')
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Language set to English (fallback)'
    )
  })

  it('falls back to English and logs when locale() throws', async () => {
    mockLocale.mockRejectedValueOnce(new Error('os plugin gone'))

    await initializeLanguage(null)

    expect(i18n.language).toBe('en')
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to initialize language',
      { error: expect.any(Error) }
    )
  })

  it('falls back to English when changeLanguage throws inside the saved branch', async () => {
    const spy = vi
      .spyOn(i18n, 'changeLanguage')
      .mockRejectedValueOnce(new Error('backend offline'))

    await initializeLanguage('fr')

    expect(i18n.language).toBe('en')
    expect(mockLogger.error).toHaveBeenCalled()
    spy.mockRestore()
  })
})
