import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'

export default function LoginPage() {
  const { signIn, session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (session) {
    return <Navigate to="/dashboard" replace />
  }

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
      <div className="login-bg" />
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">S</div>
          <div className="login-brand">SHUBE</div>
          <div className="login-tagline">Telesom → Somtel Auto-Recharge System</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Admin Email</label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder="admin@shube.so"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3) var(--space-4)',
              color: 'hsl(0,84%,65%)',
              fontSize: '0.875rem',
              marginBottom: 'var(--space-4)',
            }}>
              ⚠️ {error}
            </div>
          )}

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--space-2)' }}
          >
            {loading ? (
              <><span className="spinner" style={{ width: 16, height: 16 }} /> Signing in...</>
            ) : (
              '🔐 Sign In to Dashboard'
            )}
          </button>
        </form>

        <div style={{
          marginTop: 'var(--space-6)',
          padding: 'var(--space-4)',
          background: 'var(--bg-surface-2)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}>
          🔒 Authorized administrators only. All access is logged.
        </div>
      </div>
    </div>
  )
}
