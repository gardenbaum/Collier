import type { CSSProperties } from 'react'

export interface MonogramProps {
  /** Square edge length in px. Default 22. */
  size?: number
  /** Optional accessible label. Default: "Collier". */
  ariaLabel?: string
  /** Forwarded for QA selectors. */
  'data-testid'?: string
}

/**
 * Monogram — the 22×22 gradient "C" brand mark.
 * Used in the title bar, as the command-palette header, and as the
 * source SVG for icon rasterization. The gradient is the Linear-purple
 * brand pair: #5e6ad2 → #7c3aed.
 */
export function Monogram({
  size = 22,
  ariaLabel = 'Collier',
  ...rest
}: MonogramProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    background: 'linear-gradient(135deg, #5e6ad2 0%, #7c3aed 100%)',
    borderRadius: Math.round(size * 0.23),
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily:
      '-apple-system, "SF Pro Display", "Inter", system-ui, sans-serif',
    fontWeight: 700,
    fontSize: Math.round(size * 0.6),
    lineHeight: 1,
    color: '#ffffff',
    userSelect: 'none',
    flexShrink: 0,
  }
  return (
    <span style={style} aria-label={ariaLabel} role="img" {...rest}>
      C
    </span>
  )
}

export default Monogram
