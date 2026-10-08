import { useState, useEffect } from 'react'
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function PublicLayout() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { session } = useAuth()
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false) }, [location])

  const navLinks = [
    { to: '/',             label: 'Home' },
    { to: '/about',        label: 'About' },
    { to: '/downloads',    label: 'Downloads' },
    { to: '/contact',      label: 'Contact' },
    { to: '/privacy',      label: 'Privacy Policy' },
  ]

  return (
    <div className="pub-root">
      {/* ── Navbar ──────────────────────────────────────────── */}
      <nav className={`pub-nav${scrolled ? ' pub-nav--scrolled' : ''}`}>
        <div className="pub-nav-inner">
          {/* Brand */}
          <Link to="/" className="pub-brand">
            <div className="pub-brand-icon">S</div>
            <span className="pub-brand-name">Shube</span>
          </Link>

          {/* Desktop links */}
          <ul className="pub-nav-links">
            {navLinks.map(link => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.to === '/'}
                  className={({ isActive }) => `pub-nav-link${isActive ? ' pub-nav-link--active' : ''}`}
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>

          {/* Sign In button */}
          <div className="pub-nav-actions">
            {session ? (
              <Link to="/dashboard" className="pub-btn pub-btn-primary">
                Dashboard →
              </Link>
            ) : (
              <Link to="/login" className="pub-btn pub-btn-primary">
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className={`pub-hamburger${mobileOpen ? ' pub-hamburger--open' : ''}`}
            onClick={() => setMobileOpen(o => !o)}
            aria-label="Toggle menu"
          >
            <span /><span /><span />
          </button>
        </div>

        {/* Mobile menu */}
        <div className={`pub-mobile-menu${mobileOpen ? ' pub-mobile-menu--open' : ''}`}>
          {navLinks.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) => `pub-mobile-link${isActive ? ' pub-mobile-link--active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
          <div className="pub-mobile-divider" />
          {session ? (
            <Link to="/dashboard" className="pub-btn pub-btn-primary pub-mobile-cta">Dashboard →</Link>
          ) : (
            <Link to="/login" className="pub-btn pub-btn-primary pub-mobile-cta">Sign In</Link>
          )}
        </div>
      </nav>

      {/* ── Page content ────────────────────────────────────── */}
      <main className="pub-main">
        <Outlet />
      </main>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="pub-footer">
        <div className="pub-footer-inner">
          <div className="pub-footer-grid">
            <div className="pub-footer-brand">
              <div className="pub-footer-logo">
                <div className="pub-brand-icon pub-brand-icon--sm">S</div>
                <span className="pub-brand-name">Shube</span>
              </div>
              <p className="pub-footer-tagline">
                Smart mobile money automation for modern businesses.
              </p>
              <p className="pub-footer-company">
                By <strong>Salaam Solution</strong>
              </p>
            </div>

            <div className="pub-footer-col">
              <h4 className="pub-footer-heading">Navigation</h4>
              <ul className="pub-footer-links">
                {navLinks.map(link => (
                  <li key={link.to}>
                    <Link to={link.to}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pub-footer-col">
              <h4 className="pub-footer-heading">Apps</h4>
              <ul className="pub-footer-links">
                <li><Link to="/downloads">Shube App</Link></li>
                <li><Link to="/downloads">Geesh App</Link></li>
              </ul>
            </div>

            <div className="pub-footer-col">
              <h4 className="pub-footer-heading">Contact</h4>
              <ul className="pub-footer-links">
                <li><a href="tel:+2520634284015">063 4284015</a></li>
                <li><a href="tel:+2520657575175">0657575175</a></li>
                <li><a href="mailto:msayid@proton.me">msayid@proton.me</a></li>
              </ul>
            </div>
          </div>

          <div className="pub-footer-bottom">
            <p>© {new Date().getFullYear()} Salaam Solution. All rights reserved.</p>
            <div className="pub-footer-bottom-links">
              <Link to="/privacy">Privacy Policy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
