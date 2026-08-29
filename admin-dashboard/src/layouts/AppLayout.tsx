import { useState, useEffect } from 'react'
import { Outlet, Navigate, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from '../components/Sidebar'

const BOTTOM_NAV_ADMIN = [
  { path: '/dashboard',    icon: '📊', label: 'Overview' },
  { path: '/transactions', icon: '💳', label: 'Payments' },
  { path: '/devices',      icon: '📱', label: 'Devices' },
  { path: '/bundles',      icon: '📦', label: 'Bundles' },
  { path: '/operators',    icon: '👤', label: 'Operators' },
]

const BOTTOM_NAV_OPERATOR = [
  { path: '/dashboard',    icon: '📊', label: 'Overview' },
  { path: '/transactions', icon: '💳', label: 'Payments' },
  { path: '/devices',      icon: '📱', label: 'Devices' },
  { path: '/bundles',      icon: '📦', label: 'Bundles' },
  { path: '/ussd-config',  icon: '⚙️', label: 'USSD' },
]

export default function AppLayout() {
  const { session, loading, isAdmin, isOperator, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setSidebarOpen(false) }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-page)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto var(--space-4)' }} />
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading SHUBE...</div>
        </div>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  if (!isAdmin && !isOperator) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-page)' }}>
      <div style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
        <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>🔒</div>
        <h1 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>Access Denied</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>This dashboard is for authorized users only.</p>
        <button onClick={async () => { await signOut() }} className="btn btn-secondary">Sign Out</button>
      </div>
    </div>
  )

  const bottomNavItems = isAdmin ? BOTTOM_NAV_ADMIN : BOTTOM_NAV_OPERATOR

  return (
    <div className="app-layout">
      {/* ── Mobile top bar ──────────────────────────────────── */}
      <header className="mobile-topbar">
        <button
          className="hamburger-btn"
          onClick={() => setSidebarOpen(o => !o)}
          aria-label="Toggle navigation"
        >
          <span className={`hamburger-icon ${sidebarOpen ? 'open' : ''}`}>
            <span /><span /><span />
          </span>
        </button>
        <div className="mobile-brand">
          <div className="mobile-brand-icon">S</div>
          <span className="mobile-brand-name">SHUBE</span>
        </div>
        {/* spacer to centre brand */}
        <div style={{ width: 40 }} />
      </header>

      {/* ── Sidebar backdrop (mobile only) ──────────────────── */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* ── Main content ────────────────────────────────────── */}
      <main className="main-content">
        <Outlet />
      </main>

      {/* ── Bottom Navigation Bar (Mobile only) ─────────────── */}
      <nav className="bottom-nav" aria-label="Bottom navigation">
        {bottomNavItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
          >
            <span className="bottom-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
