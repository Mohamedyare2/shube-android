import React from 'react'

interface MuminLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showWordmark?: boolean
  subtitle?: string
}

export default function MuminLogo({ size = 'md', showWordmark = true, subtitle = 'Data Gateway' }: MuminLogoProps) {
  const pixelSizes = {
    sm: 32,
    md: 44,
    lg: 64,
    xl: 88,
  }

  const px = pixelSizes[size]

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: size === 'sm' ? 8 : 12 }}>
      <img
        src="/mumin-logo.png"
        alt="Mu'min App Logo"
        style={{
          width: px,
          height: px,
          borderRadius: px * 0.28,
          boxShadow: '0 4px 18px rgba(5, 150, 105, 0.4)',
          border: '1.5px solid rgba(245, 158, 11, 0.45)',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />

      {showWordmark && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: size === 'sm' ? '1rem' : size === 'lg' ? '1.5rem' : '1.25rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: '#FFFFFF',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              Mu'min <span style={{ color: '#10B981' }}>App</span>
            </span>
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '2px 6px',
                borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#34D399',
                border: '1px solid rgba(52, 211, 153, 0.3)',
                letterSpacing: '0.05em',
              }}
            >
              Direct
            </span>
          </div>
          {subtitle && (
            <span
              style={{
                fontSize: size === 'sm' ? '0.7rem' : '0.75rem',
                color: 'rgba(255, 255, 255, 0.65)',
                fontWeight: 500,
                marginTop: -1,
              }}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
