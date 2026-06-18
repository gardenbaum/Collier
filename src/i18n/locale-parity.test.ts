import { describe, it, expect } from 'vitest'
import en from '../../locales/en.json'
import de from '../../locales/de.json'
import fr from '../../locales/fr.json'
import ar from '../../locales/ar.json'
/**
 * Completeness guarantees for the translation catalog. English is the reference
 * (it is both the default and the fallback language); every other locale must
 * mirror its key set, provide non-empty values, and preserve interpolation
 * placeholders so no UI string silently falls back or breaks formatting.
 *
 * Catalog values may be either flat strings (e.g. `"app.name": "..."`) or
 * nested objects (e.g. `"titlebar": { "default": "..." }`). i18next resolves
 * dotted keys against either shape, so we flatten the tree to dotted keys for
 * parity checks.
 */
type Catalog = Record<string, unknown>

function flattenCatalog(node: Catalog, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(node)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      out[fullKey] = value
    } else if (value && typeof value === 'object') {
      Object.assign(out, flattenCatalog(value as Catalog, fullKey))
    }
  }
  return out
}

const reference = flattenCatalog(en)
const otherLocales: Record<string, Record<string, string>> = {
  de: flattenCatalog(de),
  fr: flattenCatalog(fr),
  ar: flattenCatalog(ar),
}

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
