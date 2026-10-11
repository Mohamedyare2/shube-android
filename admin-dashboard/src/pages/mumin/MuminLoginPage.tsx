import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import MuminLogo from '../../components/mumin/MuminLogo'

export default function MuminLoginPage() {
  const navigate = useNavigate()
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      let email = usernameOrEmail.trim()
      
      // If entered username, lookup profile email or use username@shube.internal
      if (!email.includes('@')) {
        const { data: opData } = await supabase
          .from('operators')
          .select('profile_id, username')
          .ilike('username', email)
          .maybeSingle()

        if (opData?.profile_id) {
          const { data: profData } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', opData.profile_id)
            .maybeSingle()
          
          email = `${email.toLowerCase()}@shube.app`
        } else {
          email = `${email.toLowerCase()}@shube.app`
        }
      }

      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authErr) {
        // Try fallback with raw email if @shube.app failed
        if (email.endsWith('@shube.app')) {
          const rawName = usernameOrEmail.trim()
          const { data: fallbackData, error: fallbackErr } = await supabase.auth.signInWithPassword({
            email: `${rawName.toLowerCase()}@shube.internal`,
            password,
          })
          if (fallbackErr) {
            throw new Error('Magaca ama sirta (Password) ma saxna. Fadlan hubi.')
          }
        } else {
          throw new Error('Magaca ama sirta (Password) ma saxna. Fadlan hubi.')
        }
      }

      // Check user operator authorization for Mu'min App
      const { data: session } = await supabase.auth.getSession()
      const currentUserId = session?.session?.user?.id

      if (currentUserId) {
        // Check profile role
        const { data: prof } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', currentUserId)
          .maybeSingle()

        if (prof?.role === 'admin') {
          // Super admin always authorized
          navigate('/mumin', { replace: true })
          return
        }

        // Check operator permissions
        const { data: op } = await supabase
          .from('operators')
          .select('id, app_type, mumin_enabled')
          .eq('profile_id', currentUserId)
          .maybeSingle()

        if (op) {
          let allowed = op.app_type === 'mumin' || op.mumin_enabled === true
          if (!allowed) {
            const { data: fa } = await supabase
              .from('operator_feature_access')
              .select('status')
              .eq('operator_id', op.id)
              .eq('feature_key', 'mumin_app')
              .maybeSingle()
            if (fa && fa.status === 'active') allowed = true
          }

          if (!allowed) {
            setError('Akoonkaaga looma fasixin Mu\'min App. Fadlan la xiriir maamulaha si laguu hawlgeliyo.')
            await supabase.auth.signOut()
            setLoading(false)
            return
          }
        }
      }

      navigate('/mumin', { replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Galitaanka wuu fashilmay')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <MuminLogo size="xl" showWordmark={false} />
          </div>
          <h1 style={styles.title}>Mu'min App</h1>
          <p style={styles.subtitle}>
            Direct Recipient Data Gateway · Galitaanka Operator-ka
          </p>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Username ama Email</label>
            <input
              style={styles.input}
              placeholder="Geli magacaaga operator-ka"
              value={usernameOrEmail}
              onChange={e => setUsernameOrEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password (Furaha Sirta)</label>
            <input
              style={styles.input}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.submitBtn,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Fadlan sug...' : 'Geli Mu\'min App 🚀'}
          </button>
        </form>

        <div style={styles.footerNote}>
          <p style={{ color: '#94A3B8', fontSize: '0.8rem', margin: '16px 0 8px' }}>
            Isticmaal akoonkaaga jira ee Shube si aad u gasho.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            style={styles.switchLink}
          >
            ← U gudub Shube App Login
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'radial-gradient(circle at 50% 20%, #064E3B 0%, #022C22 60%, #011913 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: 'rgba(6, 78, 59, 0.45)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(52, 211, 153, 0.35)',
    borderRadius: 24,
    padding: '36px 28px',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 800,
    color: '#FFFFFF',
    margin: '0 0 6px',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#A7F3D0',
    margin: 0,
    lineHeight: 1.5,
  },
  errorBox: {
    background: 'rgba(239, 68, 68, 0.2)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    color: '#FCA5A5',
    borderRadius: 12,
    padding: '12px 14px',
    fontSize: '0.85rem',
    marginBottom: 20,
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  formGroup: {
    marginBottom: 18,
  },
  label: {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#D1FAE5',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    background: 'rgba(2, 44, 34, 0.8)',
    border: '1.5px solid rgba(52, 211, 153, 0.3)',
    borderRadius: 12,
    color: '#FFFFFF',
    fontSize: '0.95rem',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  submitBtn: {
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    border: 'none',
    borderRadius: 12,
    color: '#FFFFFF',
    fontSize: '1rem',
    fontWeight: 700,
    marginTop: 8,
    boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)',
  },
  footerNote: {
    textAlign: 'center',
    marginTop: 12,
    borderTop: '1px solid rgba(52, 211, 153, 0.15)',
    paddingTop: 8,
  },
  switchLink: {
    background: 'none',
    border: 'none',
    color: '#34D399',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'underline',
  },
}
