import { describe, it, expect } from 'vitest'
import {
  inputStyle,
  selectStyle,
  textareaStyle,
  buttonStyle,
  actionButtonStyle,
  primaryButtonStyle,
  buttonDisabledStyle,
  iconButtonStyle,
} from './form-styles'
import { colors, space, type } from './design-tokens'

/**
 * Snapshot tests for the shared form / button style objects.
 *
 * These are deliberately key-by-key assertions rather than
 * `toMatchInlineSnapshot` so a single style change shows up as a
 * named failure in CI rather than a wall of diff. The point is to
 * pin the *contract* — if you intentionally tweak, say,
 * `buttonStyle.paddingBlock`, the diff is readable and reviewable.
 *
 * The comment on each `expect` documents *why* a given key holds
 * the value it does, so future maintainers know which downstream
 * caller to check before changing a token.
 */
describe('form-styles', () => {
  describe('inputStyle (monospace text input)', () => {
    it('uses the monospace font stack for IDs / paths / numerics', () => {
      expect(inputStyle.fontFamily).toBe(
        'ui-monospace, SFMono-Regular, monospace'
      )
    })

    it('shares the form-field baseline (sans + sm + mono9 bg + mono3 border + space[2])', () => {
      expect(inputStyle.fontSize).toBe(type.fontSize.sm)
      expect(inputStyle.color).toBe(colors.mono0)
      expect(inputStyle.backgroundColor).toBe(colors.mono9)
      expect(inputStyle.borderWidth).toBe(1)
      expect(inputStyle.borderStyle).toBe('solid')
      expect(inputStyle.borderColor).toBe(colors.mono3)
      expect(inputStyle.paddingInline).toBe(space[2])
      expect(inputStyle.paddingBlock).toBe(space[2])
      expect(inputStyle.outline).toBe('none')
    })
  })

  describe('selectStyle (sans dropdown)', () => {
    it('matches the form-field baseline without the monospace override', () => {
      expect(selectStyle.fontFamily).toBe(type.fontFamily.sans)
      expect(selectStyle.backgroundColor).toBe(colors.mono9)
      expect(selectStyle.borderColor).toBe(colors.mono3)
      expect(selectStyle.paddingInline).toBe(space[2])
      expect(selectStyle.paddingBlock).toBe(space[2])
      expect(selectStyle.outline).toBe('none')
    })
  })

  describe('textareaStyle (block-level multi-line textarea)', () => {
    it('inherits the form-field baseline', () => {
      expect(textareaStyle.fontFamily).toBe(type.fontFamily.sans)
      expect(textareaStyle.fontSize).toBe(type.fontSize.sm)
      expect(textareaStyle.backgroundColor).toBe(colors.mono9)
      expect(textareaStyle.borderColor).toBe(colors.mono3)
    })

    it('is resizable vertically only (no horizontal drag)', () => {
      expect(textareaStyle.resize).toBe('vertical')
    })

    it('fills its container with a 96px minimum height', () => {
      expect(textareaStyle.width).toBe('100%')
      expect(textareaStyle.minHeight).toBe(96)
    })

    it('uses border-box so padding does not push past 100% width', () => {
      expect(textareaStyle.boxSizing).toBe('border-box')
    })
  })

  describe('buttonStyle (standard form button)', () => {
    it('uses the sans / sm / medium / mono0 text on mono8 bg pattern', () => {
      expect(buttonStyle.fontFamily).toBe(type.fontFamily.sans)
      expect(buttonStyle.fontSize).toBe(type.fontSize.sm)
      expect(buttonStyle.fontWeight).toBe(type.fontWeight.medium)
      expect(buttonStyle.color).toBe(colors.mono0)
      expect(buttonStyle.backgroundColor).toBe(colors.mono8)
    })

    it('uses the default mono3 border + space[3] / space[2] padding', () => {
      expect(buttonStyle.borderWidth).toBe(1)
      expect(buttonStyle.borderStyle).toBe('solid')
      expect(buttonStyle.borderColor).toBe(colors.mono3)
      expect(buttonStyle.paddingInline).toBe(space[3])
      expect(buttonStyle.paddingBlock).toBe(space[2])
    })

    it('shows the pointer cursor so it reads as interactive', () => {
      expect(buttonStyle.cursor).toBe('pointer')
    })
  })

  describe('actionButtonStyle (compact variant for form action rows)', () => {
    it('matches buttonStyle except for a tighter vertical padding', () => {
      expect(actionButtonStyle.fontFamily).toBe(type.fontFamily.sans)
      expect(actionButtonStyle.fontSize).toBe(type.fontSize.sm)
      expect(actionButtonStyle.fontWeight).toBe(type.fontWeight.medium)
      expect(actionButtonStyle.color).toBe(colors.mono0)
      expect(actionButtonStyle.backgroundColor).toBe(colors.mono8)
      expect(actionButtonStyle.borderColor).toBe(colors.mono3)
      expect(actionButtonStyle.cursor).toBe('pointer')
    })

    it('tightens paddingBlock from space[2] to space[1]', () => {
      expect(actionButtonStyle.paddingInline).toBe(space[3])
      expect(actionButtonStyle.paddingBlock).toBe(space[1])
    })
  })

  describe('primaryButtonStyle (wide variant for primary form actions)', () => {
    it('matches buttonStyle except for a wider horizontal padding', () => {
      expect(primaryButtonStyle.fontFamily).toBe(type.fontFamily.sans)
      expect(primaryButtonStyle.fontSize).toBe(type.fontSize.sm)
      expect(primaryButtonStyle.fontWeight).toBe(type.fontWeight.medium)
      expect(primaryButtonStyle.color).toBe(colors.mono0)
      expect(primaryButtonStyle.backgroundColor).toBe(colors.mono8)
      expect(primaryButtonStyle.cursor).toBe('pointer')
    })

    it('widens paddingInline from space[3] to space[4]', () => {
      expect(primaryButtonStyle.paddingInline).toBe(space[4])
      expect(primaryButtonStyle.paddingBlock).toBe(space[2])
    })

    it('keeps the default mono3 border so a mono0 override reads as a highlight', () => {
      expect(primaryButtonStyle.borderColor).toBe(colors.mono3)
    })
  })

  describe('buttonDisabledStyle', () => {
    it('keeps the same dimensions as buttonStyle (no layout shift on disable)', () => {
      expect(buttonDisabledStyle.fontFamily).toBe(type.fontFamily.sans)
      expect(buttonDisabledStyle.fontSize).toBe(type.fontSize.sm)
      expect(buttonDisabledStyle.fontWeight).toBe(type.fontWeight.medium)
      expect(buttonDisabledStyle.backgroundColor).toBe(colors.mono8)
      expect(buttonDisabledStyle.paddingInline).toBe(space[3])
      expect(buttonDisabledStyle.paddingBlock).toBe(space[2])
    })

    it('dims the text and border with mono5 / mono7', () => {
      expect(buttonDisabledStyle.color).toBe(colors.mono5)
      expect(buttonDisabledStyle.borderColor).toBe(colors.mono7)
    })

    it('flips the cursor to not-allowed', () => {
      expect(buttonDisabledStyle.cursor).toBe('not-allowed')
    })
  })

  describe('iconButtonStyle (24×24 dismiss / remove)', () => {
    it('is an inline-flex square of exactly 24×24', () => {
      expect(iconButtonStyle.display).toBe('inline-flex')
      expect(iconButtonStyle.alignItems).toBe('center')
      expect(iconButtonStyle.justifyContent).toBe('center')
      expect(iconButtonStyle.width).toBe(24)
      expect(iconButtonStyle.height).toBe(24)
    })

    it('zeroes padding + margin so the glyph centres inside the 24×24 box', () => {
      expect(iconButtonStyle.padding).toBe(0)
      expect(iconButtonStyle.margin).toBe(0)
      expect(iconButtonStyle.lineHeight).toBe(1)
    })

    it('uses the same mono0/mono8/mono3 palette as buttonStyle for visual consistency', () => {
      expect(iconButtonStyle.color).toBe(colors.mono0)
      expect(iconButtonStyle.backgroundColor).toBe(colors.mono8)
      expect(iconButtonStyle.borderWidth).toBe(1)
      expect(iconButtonStyle.borderStyle).toBe('solid')
      expect(iconButtonStyle.borderColor).toBe(colors.mono3)
    })

    it('shows the pointer cursor', () => {
      expect(iconButtonStyle.cursor).toBe('pointer')
    })
  })
})
