import { describe, it, expect } from 'vitest'
import {
  colors,
  space,
  grid,
  radius,
  motion,
  vibrancy,
  palette,
} from './design-tokens'

describe('design-tokens', () => {
  describe('grid', () => {
    it('should have 8 columns', () => {
      expect(grid.columns).toBe(8)
    })
  })

  describe('space', () => {
    it('should have step of 4px (space[4] / space[1] === 4)', () => {
      // space is 0,1,2,3,4,6,8,12,16,24 in multiples of 4px
      // so space[4] should be 16 (4*4) and space[1] should be 4 (1*4)
      expect(space[4]).toBe(16)
      expect(space[1]).toBe(4)
      expect(space[4] / space[1]).toBe(4)
    })
  })
})

describe('design tokens — palette', () => {
  it('exposes the Linear-purple accent', () => {
    expect(palette.accent).toBe('#5e6ad2')
  })
  it('exposes danger = #ef4444 (P0 / destructive only)', () => {
    expect(palette.danger).toBe('#ef4444')
  })
  it('exposes status colors', () => {
    expect(palette.statusInProgress).toBe('#5e6ad2')
    expect(palette.statusBlocked).toBe('#fb923c')
  })
  it('exposes dark surface scale', () => {
    expect(palette.bg).toBe('#0a0a0a')
    expect(palette.surface).toBe('#141414')
  })
  it('exposes text scale', () => {
    expect(palette.textPrimary).toBe('#fafafa')
    expect(palette.textMuted).toBe('#a3a3a3')
  })
})

describe('design tokens — radius', () => {
  it('uses non-zero radii (macOS style)', () => {
    expect(radius.sm).toBe(6)
    expect(radius.md).toBe(8)
    expect(radius.lg).toBe(10)
    expect(radius.xl).toBe(12)
  })
})

describe('design tokens — motion', () => {
  it('defines standard easing', () => {
    expect(motion.easing.standard).toBe('cubic-bezier(0.2, 0, 0, 1)')
  })
  it('defines durations', () => {
    expect(motion.duration.fast).toBe(80)
    expect(motion.duration.sheet).toBe(280)
  })
})

describe('design tokens — vibrancy', () => {
  it('exposes sidebar vibrancy color', () => {
    expect(vibrancy.sidebar).toMatch(/rgba\(20, 20, 20, 0\.72\)/)
  })
})

describe('design tokens — legacy colors alias', () => {
  it('keeps colors.mono9 mapping to palette.bg for backward compat', () => {
    expect(colors.mono9).toBe(palette.bg)
  })
  it('keeps colors.accent mapping to palette.danger (P0 only)', () => {
    expect(colors.accent).toBe(palette.danger)
  })
})
