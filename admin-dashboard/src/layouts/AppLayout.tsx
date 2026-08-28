import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from '../components/Sidebar'

export default function AppLayout() {
  const { session, loading, isAdmin, signOut } = useAuth()

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
  if (!isAdmin) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-page)' }}>
      <div style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
        <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>🔒</div>
        <h1 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>Access Denied</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>This dashboard is for administrators only.</p>
        <button 
          onClick={async () => {
            await signOut()
          }}
          className="btn btn-secondary"
        >
          Sign Out
        </button>
      </div>
    </div>
  )

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
