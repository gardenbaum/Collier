import type { CSSProperties, ReactNode } from 'react'

export interface SectionLabelProps {
  children: ReactNode
  className?: string
  'data-testid'?: string
}

const style: CSSProperties = {
  fontFamily: '-apple-system, "SF Pro Display", "Inter", system-ui, sans-serif',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#a3a3a3',
  padding: '14px 8px 4px',
  display: 'block',
  userSelect: 'none',
}

export function SectionLabel({
  children,
  className,
  ...rest
}: SectionLabelProps) {
  return (
    <span style={style} className={className} {...rest}>
      {children}
    </span>
  )
}

export default SectionLabel
