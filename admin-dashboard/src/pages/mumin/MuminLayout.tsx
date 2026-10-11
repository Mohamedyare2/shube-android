import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import MuminLogo from '../../components/mumin/MuminLogo'

export default function MuminLayout() {
  const { user, profile, isAdmin, isOperator, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  
  const [operator, setOperator] = useState<{ id: string; username: string; card_balance?: number; app_type?: string; mumin_enabled?: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    if (!user) {
      navigate('/mumin/login', { replace: true })
      return
    }

    async function checkAccess() {
      setLoading(true)
      try {
        if (isAdmin) {
          setAuthorized(true)
          setOperator({ id: 'admin', username: 'Super Admin', app_type: 'mumin', mumin_enabled: true })
          setLoading(false)
          return
        }

        // Fetch operator record
        const { data: op, error } = await supabase
          .from('operators')
          .select('id, username, card_balance, app_type, mumin_enabled')
          .eq('profile_id', user.id)
          .maybeSingle()

        if (error || !op) {
          setAuthorized(false)
          setLoading(false)
          return
        }

        setOperator(op)

        // Check if operator has Mu'min permissions:
        // Either app_type === 'mumin' OR mumin_enabled === true OR feature entitlement in operator_feature_access
        let hasAccess = op.app_type === 'mumin' || op.mumin_enabled === true

        if (!hasAccess) {
          // Check operator_feature_access table
          const { data: fa } = await supabase
            .from('operator_feature_access')
            .select('status')
            .eq('operator_id', op.id)
            .eq('feature_key', 'mumin_app')
            .maybeSingle()

          if (fa && fa.status === 'active') {
            hasAccess = true
          }
        }

        setAuthorized(hasAccess)
      } catch (err) {
        console.error('Mu\'min auth check error:', err)
        setAuthorized(false)
      } finally {
        setLoading(false)
      }
    }

    checkAccess()
  }, [user, isAdmin, navigate])

  async function handleLogout() {
    await signOut()
    navigate('/mumin/login', { replace: true })
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingCard}>
          <MuminLogo size="lg" showWordmark={false} />
          <div style={styles.spinner} />
          <p style={{ color: '#A7F3D0', marginTop: 16, fontSize: '0.9rem', fontWeight: 600 }}>
            Loading Mu'min App...
          </p>
        </div>
      </div>
    )
  }

  if (!authorized) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.unauthCard}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ color: '#F87171', fontSize: '1.4rem', fontWeight: 800, marginBottom: 8 }}>
            Mu'min App Access Restricted
          </h2>
          <p style={{ color: '#E2E8F0', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: 20 }}>
            Akoonkaaga (@{operator?.username || profile?.full_name}) wali looma fasixin Mu'min App. 
            Fadlan la xiriir Super Admin-ka si laguugu hawlgeliyo adeeggan.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/dashboard')}
              style={styles.primaryBtn}
            >
              ← Ku noqo Shube Dashboard
            </button>
            <button
              onClick={handleLogout}
              style={styles.secondaryBtn}
            >
              Ka Bax (Logout)
            </button>
          </div>
        </div>
      </div>
    )
  }

  const navItems = [
    { path: '/mumin', label: 'Dashboard', icon: '⚡' },
    { path: '/mumin/transactions', label: 'Transactions', icon: '📋' },
    { path: '/mumin/bundles', label: 'Bundles', icon: '📦' },
  ]

  return (
    <div style={styles.shell}>
      {/* Top Emerald Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <MuminLogo size="md" subtitle="Direct Recipient Gateway" />

          <div style={styles.headerRight}>
            {operator && (
              <div style={styles.operatorBadge}>
                <span style={styles.pulseDot} />
                <span style={{ color: '#E2E8F0', fontWeight: 600, fontSize: '0.85rem' }}>
                  @{operator.username}
                </span>
                {operator.card_balance !== undefined && (
                  <span style={styles.balanceBadge}>
                    {Number(operator.card_balance).toLocaleString()} SLS
                  </span>
                )}
              </div>
            )}

            <button
              onClick={() => navigate('/dashboard')}
              title="Switch to Shube Dashboard"
              style={styles.switchAppBtn}
            >
              🔄 Shube
            </button>

            <button
              onClick={handleLogout}
              style={styles.logoutBtn}
              title="Logout"
            >
              Bax
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <nav style={styles.navBar}>
          <div style={styles.navInner}>
            {navItems.map(item => {
              const isActive = location.pathname === item.path
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/mumin'}
                  style={{
                    ...styles.navTab,
                    color: isActive ? '#FFFFFF' : '#A7F3D0',
                    borderBottom: isActive ? '3px solid #10B981' : '3px solid transparent',
                    background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                    fontWeight: isActive ? 700 : 500,
                  }}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </div>
        </nav>
      </header>

      {/* Main Content Area */}
      <main style={styles.content}>
        <Outlet context={{ operator }} />
      </main>

      {/* Bottom Branding Footer */}
      <footer style={styles.footer}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ color: '#059669', fontSize: 16 }}>🛡️</span>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem' }}>
            <strong>Mu'min App</strong> · Same-Number Automated Data Delivery · Salaam Solution
          </span>
        </div>
      </footer>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: '100vh',
    background: '#04221A',
    color: '#F8FAFC',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    background: 'linear-gradient(180deg, #064E3B 0%, #063C2E 100%)',
    borderBottom: '1px solid rgba(52, 211, 153, 0.2)',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
    position: 'sticky',
    top: 0,
    zIndex: 50,
  },
  headerInner: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '12px 16px 8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  operatorBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'rgba(2, 44, 34, 0.7)',
    border: '1px solid rgba(52, 211, 153, 0.25)',
    padding: '4px 10px',
    borderRadius: 99,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#10B981',
    boxShadow: '0 0 8px #10B981',
    display: 'inline-block',
  },
  balanceBadge: {
    background: '#065F46',
    color: '#34D399',
    fontSize: '0.75rem',
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 99,
    fontFamily: 'monospace',
  },
  switchAppBtn: {
    background: 'rgba(14, 165, 233, 0.2)',
    color: '#38BDF8',
    border: '1px solid rgba(56, 189, 248, 0.3)',
    padding: '5px 10px',
    borderRadius: 8,
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  logoutBtn: {
    background: 'rgba(239, 68, 68, 0.2)',
    color: '#FCA5A5',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    padding: '5px 12px',
    borderRadius: 8,
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  navBar: {
    background: 'rgba(2, 44, 34, 0.6)',
    borderTop: '1px solid rgba(52, 211, 153, 0.1)',
  },
  navInner: {
    maxWidth: 960,
    margin: '0 auto',
    display: 'flex',
    padding: '0 8px',
    overflowX: 'auto',
  },
  navTab: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 18px',
    fontSize: '0.85rem',
    textDecoration: 'none',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
  },
  content: {
    flex: 1,
    maxWidth: 960,
    width: '100%',
    margin: '0 auto',
    padding: '20px 16px 40px',
  },
  footer: {
    background: '#021C15',
    borderTop: '1px solid rgba(52, 211, 153, 0.15)',
    padding: '16px',
    textAlign: 'center',
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#04221A',
    padding: 16,
  },
  loadingCard: {
    background: '#064E3B',
    border: '1px solid rgba(52, 211, 153, 0.3)',
    padding: '40px 32px',
    borderRadius: 24,
    textAlign: 'center',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  unauthCard: {
    background: '#0A2D23',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    padding: '36px 28px',
    borderRadius: 24,
    textAlign: 'center',
    maxWidth: 480,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid rgba(52, 211, 153, 0.2)',
    borderTop: '3px solid #10B981',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '20px auto 0',
  },
  primaryBtn: {
    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    color: '#FFFFFF',
    border: 'none',
    padding: '10px 18px',
    borderRadius: 10,
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  secondaryBtn: {
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#E2E8F0',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    padding: '10px 18px',
    borderRadius: 10,
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
}
