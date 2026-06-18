/**
 * Design tokens — Dark Dev-Power / Linear-Raycast.
 * The Bauhaus mono-only palette is preserved as a legacy alias below;
 * the new `palette` object is the canonical source.
 */

export const palette = {
  // Surface scale (dark is the new default)
  bg: '#0a0a0a',
  surface: '#141414',
  surfaceAlt: '#1a1a1a',
  surfaceHigh: '#262626',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',

  // Text scale
  textPrimary: '#fafafa',
  textSecondary: '#d4d4d4',
  textMuted: '#a3a3a3',
  textDisabled: '#737373',

  // Brand
  accent: '#5e6ad2',
  accentHover: '#7080e0',
  accentActive: '#4d59c0',
  accentText: '#ffffff',
  accentMuted: 'rgba(94, 106, 210, 0.18)',

  // Semantic
  success: '#22c55e',
  warning: '#fb923c',
  danger: '#ef4444',
  info: '#5e6ad2',

  // Status (issue pipeline)
  statusOpen: '#a3a3a3',
  statusInProgress: '#5e6ad2',
  statusBlocked: '#fb923c',
  statusClosed: '#525252',
  statusDeferred: '#737373',

  // Priority
  priorityP0: '#ef4444',
  priorityP1: '#fafafa',
  priorityP2: '#d4d4d4',
  priorityP3: '#a3a3a3',
  priorityP4: '#737373',
} as const

// Legacy alias — keeps `colors.monoN` and `colors.accent` working until
// every consumer is ported. The Bauhaus `mono9` (lightest) now maps to
// `palette.bg` (darkest) so consumers that set `backgroundColor: colors.mono9`
// get the new dark background without a per-call rewrite.
export const colors = {
  mono0: palette.textPrimary,
  mono1: '#171717',
  mono2: palette.surfaceHigh,
  mono3: '#404040',
  mono4: '#525252',
  mono5: palette.textMuted,
  mono6: palette.statusOpen,
  mono7: '#d4d4d4',
  mono8: palette.surface,
  mono9: palette.bg,
  accent: palette.danger,
} as const

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
  base: 4,
  gutter: 16,
} as const

export const type = {
  fontFamily: {
    sans: '-apple-system, "SF Pro Display", "Inter", system-ui, sans-serif',
    mono: '"SF Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  fontWeight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  fontSize: {
    xs: 11,
    sm: 12,
    base: 13,
    md: 14,
    lg: 16,
    xl: 20,
    '2xl': 28,
    '3xl': 40,
  },
  lineHeight: { tight: 1.2, normal: 1.5, loose: 1.7 },
  letterSpacing: {
    tight: '-0.01em',
    normal: '0',
    wide: '0.04em',
    caps: '0.08em',
  },
} as const

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  '2xl': 16,
  full: 9999,
} as const

export const shadow = {
  sm: '0 1px 0 rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.16)',
  md: '0 1px 0 rgba(0, 0, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.24)',
  lg: '0 1px 0 rgba(0, 0, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.32)',
  xl: '0 1px 0 rgba(0, 0, 0, 0.3), 0 16px 48px rgba(0, 0, 0, 0.4)',
  focus: '0 0 0 2px rgba(94, 106, 210, 0.5)',
} as const

export const motion = {
  duration: { fast: 80, normal: 140, slow: 220, sheet: 280 },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    decel: 'cubic-bezier(0, 0, 0.2, 1)',
    accel: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const

export const vibrancy = {
  sidebar: 'rgba(20, 20, 20, 0.72)',
  popover: 'rgba(26, 26, 26, 0.82)',
  modal: 'rgba(20, 20, 20, 0.88)',
  titleBar: 'rgba(20, 20, 20, 0.6)',
  drawer: 'rgba(20, 20, 20, 0.92)',
} as const
