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
      <div
        style={{
          width: px,
          height: px,
          borderRadius: px * 0.28,
          background: 'linear-gradient(135deg, #064E3B 0%, #065F46 50%, #022C22 100%)',
          border: '1.5px solid rgba(52, 211, 153, 0.4)',
          boxShadow: '0 4px 16px rgba(5, 150, 105, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <svg viewBox="0 0 100 100" width={px * 0.72} height={px * 0.72}>
          <defs>
            <linearGradient id="mEmerald" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="mGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="100%" stopColor="#F59E0B" />
            </linearGradient>
          </defs>

          {/* Golden Crescent Accent */}
          <path
            d="M 30 75 C 18 62 18 38 32 25 C 42 16 58 16 68 22 C 60 20 46 22 38 32 C 30 42 32 62 45 72 Z"
            fill="url(#mGold)"
            opacity="0.9"
          />

          {/* Stylized M Pillars */}
          <rect x="24" y="32" width="10" height="42" rx="5" fill="url(#mEmerald)" />
          <rect x="66" y="32" width="10" height="42" rx="5" fill="url(#mEmerald)" />
          <path d="M 29 34 L 50 60 L 50 67 L 29 41 Z" fill="url(#mEmerald)" />
          <path d="M 71 34 L 50 60 L 50 67 L 71 41 Z" fill="url(#mEmerald)" />

          {/* Golden Locked Node (Represents matched sender & recipient) */}
          <circle cx="50" cy="62" r="6" fill="url(#mGold)" />
          <circle cx="50" cy="62" r="2.5" fill="#FFFFFF" />

          {/* WiFi Signals */}
          <path d="M 40 22 A 14 14 0 0 1 60 22" fill="none" stroke="url(#mGold)" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 35 16 A 21 21 0 0 1 65 16" fill="none" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
        </svg>
      </div>

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
