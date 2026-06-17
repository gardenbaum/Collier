import { describe, it, expect } from 'vitest'
import { colors, space, grid, radius } from './design-tokens'

describe('design-tokens', () => {
  describe('radius', () => {
    it('should have all radius values set to 0', () => {
      const radiusKeys = Object.keys(radius) as (keyof typeof radius)[]
      expect(radiusKeys.length).toBeGreaterThan(0)
      for (const key of radiusKeys) {
        expect(radius[key]).toBe(0)
      }
    })
  })

  describe('grid', () => {
    it('should have 8 columns', () => {
      expect(grid.columns).toBe(8)
    })
  })

  describe('colors', () => {
    it('should have accent color #c2410c', () => {
      expect(colors.accent).toBe('#c2410c')
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
