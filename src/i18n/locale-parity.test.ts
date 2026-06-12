import { describe, it, expect } from 'vitest'
import en from '../../locales/en.json'
import ar from '../../locales/ar.json'
import fr from '../../locales/fr.json'

/**
 * Completeness guarantees for the translation catalog. English is the reference
 * (it is both the default and the fallback language); every other locale must
 * mirror its key set, provide non-empty values, and preserve interpolation
 * placeholders so no UI string silently falls back or breaks formatting.
 */
const reference: Record<string, string> = en
const otherLocales: Record<string, Record<string, string>> = { ar, fr }

const referenceKeys = Object.keys(reference).sort()

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/{{(.*?)}}/g)]
    .map(match => (match[1] ?? '').trim())
    .sort()
}

describe('locale catalog completeness', () => {
  it('reference locale (en) defines keys and no empty values', () => {
    expect(referenceKeys.length).toBeGreaterThan(0)
    for (const [key, value] of Object.entries(reference)) {
      expect(value, `en.${key} must not be empty`).toBeTruthy()
    }
  })

  for (const [name, translation] of Object.entries(otherLocales)) {
    describe(`${name}.json`, () => {
      it('defines exactly the same keys as en.json', () => {
        expect(Object.keys(translation).sort()).toEqual(referenceKeys)
      })

      it('has no empty values', () => {
        for (const [key, value] of Object.entries(translation)) {
          expect(value, `${name}.${key} must not be empty`).toBeTruthy()
        }
      })

      it('preserves the interpolation placeholders from en.json', () => {
        for (const key of referenceKeys) {
          expect(
            interpolationTokens(translation[key] ?? ''),
            `interpolation tokens differ for ${name}.${key}`
          ).toEqual(interpolationTokens(reference[key] ?? ''))
        }
      })
    })
  }
})
