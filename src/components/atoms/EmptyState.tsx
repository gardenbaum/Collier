import type { ComponentType, CSSProperties, ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'
import { palette } from '@/lib/design-tokens'

export interface EmptyStateProps {
  icon: ComponentType<LucideProps>
  title: string
  body: string
  cta?: ReactNode
  className?: string
  'data-testid'?: string
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  gap: 12,
  padding: '48px 24px',
  color: palette.textSecondary,
  fontFamily: '-apple-system, "SF Pro Display", "Inter", system-ui, sans-serif',
}

const iconWrapStyle: CSSProperties = {
  width: 64,
  height: 64,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: palette.accentMuted,
  borderRadius: 12,
  color: palette.accent,
}

const titleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: palette.textPrimary,
  margin: 0,
  lineHeight: 1.2,
}

const bodyStyle: CSSProperties = {
  fontSize: 13,
  color: palette.textMuted,
  margin: 0,
  lineHeight: 1.5,
  maxWidth: 320,
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  cta,
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div style={containerStyle} className={className} {...rest}>
      <div style={iconWrapStyle}>
        <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h3 style={titleStyle}>{title}</h3>
      <p style={bodyStyle}>{body}</p>
      {cta ? <div>{cta}</div> : null}
    </div>
  )
}
