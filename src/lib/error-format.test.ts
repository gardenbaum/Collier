import { describe, it, expect } from 'vitest'
import { formatError } from './error-format'

describe('formatError', () => {
  describe('Tauri / bd tagged-union errors', () => {
    it('prefixes NonZeroExit stderr with "bd failed: "', () => {
      const err = {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: 'no workspace',
      }
      expect(formatError(err)).toBe('bd failed: no workspace')
    })

    it('falls through when NonZeroExit has no stderr', () => {
      const err = { type: 'NonZeroExit', code: 1, stdout: '', stderr: '' }
      // No `message` on the variant either — falls back to type discriminator.
      expect(formatError(err)).toBe('NonZeroExit')
    })

    it('returns e.message for tagged variants with a message', () => {
      const err = { type: 'WorkspaceNotFound', message: 'no .beads directory' }
      expect(formatError(err)).toBe('no .beads directory')
    })

    it('returns e.message even for NonZeroExit variants (message beats empty stderr)', () => {
      const err = {
        type: 'NonZeroExit',
        code: 1,
        message: 'fallback message',
        stderr: '',
      }
      // The NonZeroExit branch only triggers when stderr is truthy; otherwise
      // we fall through to the message branch.
      expect(formatError(err)).toBe('fallback message')
    })

    it('returns the type discriminator when no message and no stderr', () => {
      const err = { type: 'PermissionDenied' }
      expect(formatError(err)).toBe('PermissionDenied')
    })
  })

  describe('Error instances', () => {
    it('returns err.message for a standard Error', () => {
      expect(formatError(new Error('network unreachable'))).toBe(
        'network unreachable'
      )
    })

    it('returns an empty string for an Error with no message', () => {
      expect(formatError(new Error(''))).toBe('')
    })

    it('returns the message for a TypeError', () => {
      expect(formatError(new TypeError('bad shape'))).toBe('bad shape')
    })
  })

  describe('fallback behaviour', () => {
    it('returns the fallback for primitives', () => {
      expect(formatError('boom', 'Something failed')).toBe('Something failed')
      expect(formatError(42, 'Something failed')).toBe('Something failed')
      expect(formatError(null, 'Something failed')).toBe('Something failed')
      expect(formatError(undefined, 'Something failed')).toBe(
        'Something failed'
      )
      expect(formatError(true, 'Something failed')).toBe('Something failed')
    })

    it('returns String(err) when no fallback is supplied', () => {
      expect(formatError('boom')).toBe('boom')
      expect(formatError(42)).toBe('42')
      expect(formatError(null)).toBe('null')
      expect(formatError(undefined)).toBe('undefined')
    })

    it('returns String(err) for non-tagged plain objects when no fallback is supplied', () => {
      // Not a Tauri union (no `type` discriminator) → fall through to
      // String(err), which yields `[object Object]`.
      const obj = { foo: 1 }
      expect(formatError(obj)).toBe('[object Object]')
    })

    it('returns the fallback for non-tagged plain objects when supplied', () => {
      const obj = { foo: 1 }
      expect(formatError(obj, 'Render failed')).toBe('Render failed')
    })
  })

  describe('integration — BdError variants from the Rust side', () => {
    // Mirrors the actual BdError enum shape surfaced via tauri-specta.
    // We test the most common variants the views encounter.

    it('formats WorkspaceNotFound', () => {
      expect(
        formatError(
          { type: 'WorkspaceNotFound', message: 'no .beads directory' },
          'fallback'
        )
      ).toBe('no .beads directory')
    })

    it('formats NotBeadsRepo', () => {
      expect(
        formatError(
          { type: 'NotBeadsRepo', message: 'cwd is not a beads repo' },
          'fallback'
        )
      ).toBe('cwd is not a beads repo')
    })

    it('formats InvalidInput', () => {
      expect(
        formatError(
          { type: 'InvalidInput', message: 'title is required' },
          'fallback'
        )
      ).toBe('title is required')
    })

    it('formats a NonZeroExit with stderr from a real bd command failure', () => {
      const err = {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: 'no workspace',
      }
      // The mutation views rely on this prefix so the toast/alert surfaces
      // a hint about the CLI failure source — the user reads "bd failed:"
      // and knows where to look.
      expect(formatError(err, 'Action failed.')).toBe('bd failed: no workspace')
    })
  })

  describe('priority order — which branch wins for an unusual shape', () => {
    it('prefers NonZeroExit+stderr over the message field', () => {
      const err = {
        type: 'NonZeroExit',
        message: 'ignored',
        stderr: 'real stderr',
      }
      expect(formatError(err)).toBe('bd failed: real stderr')
    })

    it('prefers the message field over the type discriminator', () => {
      const err = { type: 'SomeVariant', message: 'specific message' }
      expect(formatError(err)).toBe('specific message')
    })

    it('prefers the type discriminator over the fallback for tagged objects', () => {
      const err = { type: 'SomeVariant' }
      expect(formatError(err, 'fallback')).toBe('SomeVariant')
    })

    it('prefers the fallback over String(err) for unrecognised shapes', () => {
      expect(formatError({ random: 'object' }, 'render failed')).toBe(
        'render failed'
      )
    })
  })
})
