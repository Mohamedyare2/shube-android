import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface NavItem {
  path: string
  icon: string
  label: string
  section?: string
  badge?: number
}

const ADMIN_NAV_ITEMS: NavItem[] = [
  { section: 'Overview',     path: '/dashboard',    icon: '📊', label: 'Global Dashboard' },
  { path: '/transactions',   icon: '💳', label: 'All Transactions' },
  { section: 'Management',   path: '/operators',    icon: '👤', label: 'Operators' },
  { path: '/devices',        icon: '📱', label: 'All Devices' },
  { path: '/customers',      icon: '👥', label: 'Customers' },
  { path: '/bundles',        icon: '📦', label: 'Bundle Rules' },
  { section: 'Configuration',path: '/ussd-config',  icon: '⚙️', label: 'USSD Config' },
  { path: '/sms-parser',     icon: '📩', label: 'SMS Parser' },
  { section: 'Reporting',    path: '/reports',      icon: '📈', label: 'Reports' },
  { path: '/audit-logs',     icon: '📋', label: 'Audit Logs' },
  { path: '/settings',       icon: '🔧', label: 'Settings' },
]

const OPERATOR_NAV_ITEMS: NavItem[] = [
  { section: 'My Business',  path: '/dashboard',    icon: '📊', label: 'Dashboard' },
  { path: '/transactions',   icon: '💳', label: 'My Transactions' },
  { path: '/devices',        icon: '📱', label: 'My Devices' },
]

export default function Sidebar() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const initials = profile?.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? (isAdmin ? 'AD' : 'OP')

  const navItems = isAdmin ? ADMIN_NAV_ITEMS : OPERATOR_NAV_ITEMS
  const roleLabel = isAdmin ? 'Admin' : 'Operator'

  return (
    <aside className="sidebar">
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
