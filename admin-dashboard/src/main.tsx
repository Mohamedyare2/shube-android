import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import AppLayout from './layouts/AppLayout'

// Pages
import LoginPage from './pages/LoginPage'
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
            <Route path="/login" element={<LoginPage />} />
            
            <Route path="/" element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="operators" element={<OperatorsPage />} />
              <Route path="devices" element={<DevicesPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="bundles" element={<BundlesPage />} />
              <Route path="ussd-config" element={<UssdConfigPage />} />
              <Route path="sms-parser" element={<SmsParserPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="audit-logs" element={<AuditLogsPage />} />
              <Route path="settings" element={<Placeholder title="Settings" />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
)
