import React from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

import { supabase } from '../lib/supabase'

interface NavItem {
  path: string
  icon: string
  label: string
  section?: string
  badge?: number
}

const ADMIN_NAV_ITEMS: NavItem[] = [
  { section: 'Overview',     path: '/dashboard',        icon: '📊', label: 'Global Dashboard' },
  { path: '/transactions',   icon: '💳', label: 'All Transactions' },
  { section: 'Management',   path: '/operators',        icon: '🧑‍💼', label: 'Sarif Operators' },
  { path: '/premium-features', icon: '⭐', label: 'Premium Features' },
  { path: '/devices',        icon: '📱', label: 'All Devices' },
  { path: '/customers',      icon: '👥', label: 'Customers' },
  { path: '/referral-link',  icon: '🔗', label: 'Registration Link' },
  { path: '/bundles',        icon: '📦', label: 'Bundle Rules' },
  { section: 'Configuration',path: '/ussd-config',      icon: '⚙️', label: 'USSD Config' },
  { path: '/sms-parser',     icon: '📩', label: 'SMS Parser' },
  { section: 'Reporting',    path: '/reports',          icon: '📈', label: 'Reports' },
  { path: '/audit-logs',     icon: '📋', label: 'Audit Logs' },
  { path: '/settings',       icon: '🔧', label: 'Settings' },
  { section: 'Downloads',    path: '/download',         icon: '📥', label: 'Downloads' },
]

const OPERATOR_NAV_ITEMS: NavItem[] = [
  { section: 'Overview',      path: '/dashboard',     icon: '📊', label: 'Dashboard' },
  { path: '/transactions',    icon: '💳', label: 'Transactions' },
  { section: 'Management',   path: '/devices',        icon: '📱', label: 'My Devices' },
  { path: '/customers',       icon: '👥', label: 'Customers' },
  { path: '/referral-link',   icon: '🔗', label: 'My Registration Link' },
  { path: '/bundles',         icon: '📦', label: 'Bundle Rules' },
  { section: 'Configuration', path: '/ussd-config',   icon: '⚙️', label: 'USSD Config' },
  { path: '/sms-parser',      icon: '📩', label: 'SMS Parser' },
  { section: 'Reporting',     path: '/reports',       icon: '📈', label: 'Reports' },
  { path: '/audit-logs',      icon: '📋', label: 'Audit Logs' },
  { section: 'Downloads',     path: '/download',      icon: '📥', label: 'Downloads' },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { profile, user, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [hasReferralAccess, setHasReferralAccess] = React.useState(false)

  // Check operator premium entitlement for registration_via_link
  React.useEffect(() => {
    if (isAdmin) {
      setHasReferralAccess(true)
      return
    }
    if (!user?.id) return

    // Query RLS-safe entitlement
    supabase
      .from('operator_feature_access')
      .select('status, expires_at')
      .eq('feature_key', 'registration_via_link')
      .maybeSingle()
      .then(({ data }) => {
        if (data && data.status === 'active') {
          const valid = !data.expires_at || new Date(data.expires_at).getTime() > Date.now()
          setHasReferralAccess(valid)
        } else {
          setHasReferralAccess(false)
        }
      })
      .catch(() => setHasReferralAccess(false))
  }, [user?.id, isAdmin])

  // Close sidebar on navigation (mobile)
  React.useEffect(() => {
    onClose?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  const initials = profile?.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? (isAdmin ? 'AD' : 'OP')

  const baseItems = isAdmin ? ADMIN_NAV_ITEMS : OPERATOR_NAV_ITEMS
  // Hide referral link from operators who are not authorized
  const navItems = baseItems.filter(item => {
    if (item.path === '/referral-link' && !isAdmin && !hasReferralAccess) {
      return false
    }
    return true
  })
  const roleLabel = isAdmin ? 'Admin' : 'Operator'

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">S</div>
        <div>
          <div className="sidebar-logo-text">SHUBE</div>
          <div className="sidebar-logo-sub">{isAdmin ? 'Admin Portal' : 'Operator Portal'}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item, idx) => (
          <React.Fragment key={idx}>
            {item.section && <div className="nav-section-label">{item.section}</div>}
            <NavLink
              to={item.path}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
            </NavLink>
          </React.Fragment>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user" onClick={handleSignOut} title="Click to sign out">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <div className="user-name">{profile?.full_name ?? roleLabel}</div>
            <div className="user-role">{roleLabel} · Sign Out</div>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>↪</span>
        </div>
      </div>
    </aside>
  )
}
