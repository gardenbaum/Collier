// Bauhaus + Swiss design tokens
// Hard edges enforced: radius is 0 everywhere via useSquareCornersEffect

// accent uses: (1) destructive actions (delete/close-with-data-loss), (2) P0 priority badge only
export const colors = {
  // Mono scale 0-9
  mono0: '#0a0a0a',
  mono1: '#171717',
  mono2: '#262626',
  mono3: '#404040',
  mono4: '#525252',
  mono5: '#737373',
  mono6: '#a3a3a3',
  mono7: '#d4d4d4',
  mono8: '#e5e5e5',
  mono9: '#fafafa',
  // Semantic
  accent: '#c2410c', // Only for: destructive actions, P0 priority badge
} as const

// Space scale: multiples of 4px (0, 4, 8, 12, 16, 24, 32, 48, 64, 96)
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
  24: 96,
} as const

export const grid = {
  columns: 8,
  base: 4, // 4px base unit
  gutter: 16,
} as const

export const type = {
  fontFamily: {
    sans: 'Inter, system-ui, sans-serif',
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    bold: 700,
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 20,
    xl: 24,
    '2xl': 32,
    '3xl': 48,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    loose: 1.8,
  },
} as const

// All radius values are 0 - hard edges enforced
export const radius = {
  sm: 0,
  md: 0,
  lg: 0,
  full: 0,
} as const

// Bauhaus is flat - no shadows
export const shadow = {} as const

export const motion = {
  duration: {
    fast: 100,
    normal: 200,
    slow: 300,
  },
  easing: 'cubic-bezier(0,0,0.2,1)',
} as const
