import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

interface ReferralStats {
  total_visits: number
  total_customers: number
  referral_customers: number
}

export default function ReferralLinkPage() {
  const { user, isOperator, isAdmin } = useAuth()
  const { toast } = useToast()

  const [operatorId, setOperatorId] = useState<string | null>(null)
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [welcomeMsg, setWelcomeMsg] = useState('')
  const [referralActive, setReferralActive] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [copied, setCopied] = useState(false)

  const baseUrl = window.location.origin
  const referralUrl = referralCode ? `${baseUrl}/register/${referralCode}` : null

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      // Get operator record
      const { data: op } = await supabase
        .from('operators')
        .select('id, referral_code, referral_welcome_message, referral_active')
        .eq('profile_id', user.id)
        .single()

      if (op) {
        setOperatorId(op.id)
        setReferralCode(op.referral_code)
        setWelcomeMsg(op.referral_welcome_message || '')
        setReferralActive(op.referral_active ?? true)

        // Load stats
        const [visitsRes, customersRes] = await Promise.all([
          supabase.from('referral_visits').select('id, converted', { count: 'exact' }).eq('operator_id', op.id),
          supabase.from('customers').select('id, registration_source', { count: 'exact' }).eq('created_by', user.id),
        ])

        const visits = visitsRes.data || []
        const customers = customersRes.data || []
        setStats({
          total_visits: visits.length,
          total_customers: customers.length,
          referral_customers: customers.filter(c => c.registration_source === 'referral_link').length,
        })
      }
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    if (!operatorId) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('operators')
        .update({ referral_welcome_message: welcomeMsg || null, referral_active: referralActive })
        .eq('id', operatorId)
      if (error) throw error
      toast('Settings saved!', 'success')
      load()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function copyLink() {
    if (!referralUrl) return
    await navigator.clipboard.writeText(referralUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast('Link copied!', 'success')
  }

  function shareWhatsApp() {
    if (!referralUrl) return
    const msg = encodeURIComponent(`📶 Hel Internet Degdeg ah!\n\nGuji linkiga hoose si aad isu diiwaangeliso:\n${referralUrl}`)
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  if (!isOperator && !isAdmin) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-icon">🔒</div>
          <div className="empty-title">Access Denied</div>
          <div className="empty-desc">This page is only available for operators.</div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">My Registration Link</h1>
        </div>
        <div className="card">
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Registration Link</h1>
          <p className="page-subtitle">Share your unique link so customers can register themselves</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Total Customers', value: stats.total_customers, icon: '👥' },
            { label: 'Via Link', value: stats.referral_customers, icon: '🔗' },
            { label: 'Manual', value: stats.total_customers - stats.referral_customers, icon: '✍️' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: 20, textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: 28 }}>{s.icon}</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0' }}>{s.value}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Link section */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Your Unique Registration Link</h2>
          <span className={`badge ${referralActive ? 'badge-success' : 'badge-danger'}`}>
            {referralActive ? 'ACTIVE' : 'INACTIVE'}
          </span>
        </div>

        {referralUrl ? (
          <>
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1.5px solid var(--border-color)',
              borderRadius: 10,
              padding: '12px 16px',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              color: 'var(--text-primary)',
              wordBreak: 'break-all',
              marginBottom: 14,
            }}>
              🔗 {referralUrl}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={copyLink}>
                {copied ? '✅ Copied!' : '📋 Copy Link'}
              </button>
              <button className="btn btn-secondary" style={{ background: '#25d366', color: 'white', border: 'none' }} onClick={shareWhatsApp}>
                📤 Share on WhatsApp
              </button>
              <button className="btn btn-secondary" onClick={() => window.open(referralUrl, '_blank')}>
                👁️ Preview
              </button>
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--text-muted)', padding: '16px 0' }}>
            No referral code assigned yet. Contact your administrator.
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="card">
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>Customize Your Page</h2>

        <div className="form-group">
          <label className="form-label">Welcome Message (optional)</label>
          <textarea
            className="form-input"
            rows={3}
            placeholder="Enter a custom message to show on your registration page..."
            value={welcomeMsg}
            onChange={e => setWelcomeMsg(e.target.value)}
            style={{ resize: 'vertical' }}
          />
          <span className="form-hint">Leave blank to use the default message</span>
        </div>

        <div className="form-group">
          <label className="toggle-wrapper">
            <div
              className={`toggle-track${referralActive ? ' on' : ''}`}
              onClick={() => setReferralActive(a => !a)}
            >
              <div className="toggle-thumb" />
            </div>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Registration link active (visitors can register)
            </span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
