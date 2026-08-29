import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'

export default function LoginPage() {
  const { signIn, session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPass, setShowPass] = useState(false)

  if (session) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) setError(error)
    setLoading(false)
  }

  return (
    <div className="login-page">
      {/* Animated background blobs */}
      <div className="login-blob login-blob-1" />
      <div className="login-blob login-blob-2" />
      <div className="login-blob login-blob-3" />

      {/* Subtle grid overlay */}
      <div className="login-grid" />

      <div className="login-card-glass">
        {/* Brand */}
        <div className="login-logo">
          <div className="login-logo-icon">
            <span style={{ fontSize: '1.75rem' }}>📡</span>
          </div>
          <div className="login-brand">SHUBE</div>
          <div className="login-tagline">Smart Bundle Distribution Platform</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="login-email">Email Address</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: '1rem', pointerEvents: 'none' }}>✉️</span>
              <input
                id="login-email"
                type="email"
                className="form-input login-input"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{ paddingLeft: '2.75rem' }}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="login-password">Password</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: '1rem', pointerEvents: 'none' }}>🔑</span>
              <input
                id="login-password"
                type={showPass ? 'text' : 'password'}
                className="form-input login-input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{ paddingLeft: '2.75rem', paddingRight: '3rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.875rem', padding: '4px' }}
              >
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error">
              ⚠️ {error}
            </div>
          )}

          <button
            id="login-submit"
            type="submit"
            className="login-btn-primary"
            disabled={loading}
          >
            {loading ? (
              <><span className="spinner" style={{ width: 18, height: 18, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} /> Signing in...</>
            ) : (
              <><span>🚀</span> Sign In to Dashboard</>
            )}
          </button>
        </form>

        <div className="login-footer-note">
          🔒 Authorized personnel only · All access is logged
        </div>
      </div>
    </div>
  )
}
