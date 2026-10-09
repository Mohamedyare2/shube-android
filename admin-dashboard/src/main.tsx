import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import AppLayout from './layouts/AppLayout'
import PublicLayout from './layouts/PublicLayout'

// Public pages
import HomePage from './pages/public/HomePage'
import AboutPage from './pages/public/AboutPage'
import PublicDownloadsPage from './pages/public/PublicDownloadsPage'
import ContactPage from './pages/public/ContactPage'
import PrivacyPage from './pages/public/PrivacyPage'

// Auth pages
import LoginPage from './pages/LoginPage'

// Protected pages
import DashboardPage from './pages/DashboardPage'
import OperatorsPage from './pages/OperatorsPage'
import CustomersPage from './pages/CustomersPage'
import BundlesPage from './pages/BundlesPage'
import TransactionsPage from './pages/TransactionsPage'
import DevicesPage from './pages/DevicesPage'
import UssdConfigPage from './pages/UssdConfigPage'
import SmsParserPage from './pages/SmsParserPage'
import ReportsPage from './pages/ReportsPage'
import AuditLogsPage from './pages/AuditLogsPage'
import DownloadPage from './pages/DownloadPage'
import ReferralLinkPage from './pages/ReferralLinkPage'
import ReferralPage from './pages/public/ReferralPage'
import PremiumFeaturesPage from './pages/PremiumFeaturesPage'
import './index.css'

// Placeholder for remaining pages
const Placeholder = ({ title }: { title: string }) => (
  <div className="page-container">
    <div className="page-header"><h1 className="page-title">{title}</h1></div>
    <div className="empty-state">
      <div className="empty-icon">🚧</div>
      <div className="empty-title">Coming Soon</div>
      <div className="empty-desc">This section is currently under development.</div>
    </div>
  </div>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {/* ── Public routes (no auth required) ─────────── */}
            <Route element={<PublicLayout />}>
              <Route path="/"          element={<HomePage />} />
              <Route path="/about"     element={<AboutPage />} />
              <Route path="/downloads" element={<PublicDownloadsPage />} />
              <Route path="/contact"   element={<ContactPage />} />
              <Route path="/privacy"   element={<PrivacyPage />} />
            </Route>

            {/* Public referral registration landing pages (standalone, clean layout) */}
            <Route path="/register/:code" element={<ReferralPage />} />
            <Route path="/operator/:code" element={<ReferralPage />} />

            {/* ── Auth ──────────────────────────────────────── */}
            <Route path="/login" element={<LoginPage />} />

            {/* ── Protected dashboard routes ────────────────── */}
            <Route element={<AppLayout />}>
              <Route path="/dashboard"        element={<DashboardPage />} />
              <Route path="/transactions"     element={<TransactionsPage />} />
              <Route path="/operators"        element={<OperatorsPage />} />
              <Route path="/premium-features" element={<PremiumFeaturesPage />} />
              <Route path="/devices"          element={<DevicesPage />} />
              <Route path="/customers"        element={<CustomersPage />} />
              <Route path="/referral-link"    element={<ReferralLinkPage />} />
              <Route path="/bundles"          element={<BundlesPage />} />
              <Route path="/ussd-config"      element={<UssdConfigPage />} />
              <Route path="/sms-parser"       element={<SmsParserPage />} />
              <Route path="/reports"          element={<ReportsPage />} />
              <Route path="/audit-logs"       element={<AuditLogsPage />} />
              <Route path="/download"         element={<DownloadPage />} />
              <Route path="/settings"         element={<Placeholder title="Settings" />} />
            </Route>

            {/* ── 404 fallback ──────────────────────────────── */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
)
