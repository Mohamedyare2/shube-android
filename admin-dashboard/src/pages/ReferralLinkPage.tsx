import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { formatDate } from '../lib/utils'
import type { FeatureAccessStatus, OperatorFeatureAccess } from '../types/database'

interface ReferralStats {
  total_visits: number
  total_customers: number
  referral_customers: number
}

interface BundleSlot {
  slot: number
  bundle_name: string
  bundle_price: string  // keep as string in form for editing
}

const EMPTY_BUNDLES: BundleSlot[] = [1, 2, 3, 4, 5].map(slot => ({ slot, bundle_name: '', bundle_price: '' }))

export default function ReferralLinkPage() {
  const { user, isOperator, isAdmin } = useAuth()
  const { toast } = useToast()

  const [operatorId, setOperatorId] = useState<string | null>(null)
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [welcomeMsg, setWelcomeMsg] = useState('')
  const [referralActive, setReferralActive] = useState(true)
  const [featureAccess, setFeatureAccess] = useState<OperatorFeatureAccess | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingBundles, setSavingBundles] = useState(false)
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [copied, setCopied] = useState(false)

  // Bundle state
  const [bundles, setBundles] = useState<BundleSlot[]>(EMPTY_BUNDLES)

  const baseUrl = window.location.origin
  const referralUrl = referralCode ? `${baseUrl}/register/${referralCode}` : null

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      // 1. Get operator record
      const { data: op } = await supabase
        .from('operators')
        .select('id, referral_code, referral_welcome_message, referral_active')
        .eq('profile_id', user.id)
        .maybeSingle()

      if (op) {
        setOperatorId(op.id)
        setReferralCode(op.referral_code)
        setWelcomeMsg(op.referral_welcome_message || '')
        setReferralActive(op.referral_active ?? true)

        // 2. Query feature access entitlement
        try {
          const { data: faData } = await supabase
            .from('operator_feature_access')
            .select('*')
            .eq('operator_id', op.id)
            .eq('feature_key', 'registration_via_link')
            .maybeSingle()

          if (faData) {
            setFeatureAccess(faData)
          }
        } catch (faErr) {
          console.warn('Could not load operator_feature_access:', faErr)
        }

        // 3. Load bundle slots
        try {
          const { data: bundleData } = await supabase
            .from('operator_bundles')
            .select('slot, bundle_name, bundle_price')
            .eq('operator_id', op.id)
            .order('slot', { ascending: true })

          if (bundleData && bundleData.length > 0) {
            // Merge fetched data into 5-slot array
            const merged: BundleSlot[] = [1, 2, 3, 4, 5].map(slot => {
              const found = bundleData.find(b => b.slot === slot)
              return {
                slot,
                bundle_name: found?.bundle_name || '',
                bundle_price: found?.bundle_price !== null && found?.bundle_price !== undefined
                  ? String(found.bundle_price)
                  : '',
              }
            })
            setBundles(merged)
          }
        } catch (bErr) {
          console.warn('Could not load operator_bundles:', bErr)
        }

        // 4. Load stats
        try {
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
        } catch (_) {}
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

  async function handleSaveBundles() {
    if (!operatorId) return

    // Validate prices
    for (const b of bundles) {
      if (b.bundle_price !== '') {
        const price = parseFloat(b.bundle_price)
        if (isNaN(price) || price < 0) {
          toast(`Bundle ${b.slot}: Price must be a valid non-negative number`, 'error')
          return
        }
      }
    }

    setSavingBundles(true)
    try {
      // Upsert all 5 slots
      const upsertData = bundles.map(b => ({
        operator_id: operatorId,
        slot: b.slot,
        bundle_name: b.bundle_name.trim() || null,
        bundle_price: b.bundle_price !== '' ? parseFloat(b.bundle_price) : null,
        updated_at: new Date().toISOString(),
      }))

      const { error } = await supabase
        .from('operator_bundles')
        .upsert(upsertData, { onConflict: 'operator_id,slot' })

      if (error) throw error
      toast('Bundles saved successfully!', 'success')
      load()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to save bundles', 'error')
    } finally {
      setSavingBundles(false)
    }
  }

  function updateBundle(slot: number, field: 'bundle_name' | 'bundle_price', value: string) {
    setBundles(prev => prev.map(b => b.slot === slot ? { ...b, [field]: value } : b))
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

  // Check authorization
  const isAuthorized = isAdmin || Boolean(
    featureAccess &&
    featureAccess.status === 'active' &&
    (!featureAccess.expires_at || new Date(featureAccess.expires_at).getTime() > Date.now())
  )

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
          <h1 className="page-title">Registration via Link</h1>
        </div>
        <div className="card">
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        </div>
      </div>
    )
  }

  // ── Unauthorized State ────────────────────────────────────────────
  if (!isAuthorized) {
    const status: FeatureAccessStatus = featureAccess?.status || 'inactive'
    const isExpired = status === 'active' && featureAccess?.expires_at && new Date(featureAccess.expires_at).getTime() <= Date.now()
    const effStatus = isExpired ? 'expired' : status

    return (
      <div className="page-container">
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.5rem' }}>⭐</span>
              <h1 className="page-title">Registration via Link</h1>
            </div>
            <p className="page-subtitle">Unique self-service referral link for your customers</p>
          </div>
        </div>

        <div className="card" style={{ maxWidth: 680, margin: '20px auto', padding: '36px 32px', textAlign: 'center' }}>
          <div style={{
            width: 72, height: 72,
            background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(249, 115, 22, 0.15) 100%)',
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 34, margin: '0 auto 20px',
          }}>
            🔒
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>
            Adeeggan waa Premium (Paid Feature)
          </h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.95rem', marginBottom: 24 }}>
            Feature-ka <strong>Registration via Link</strong> wuxuu kuu oggolaanayaa inaad hesho link gaar ah oo aad ku wadaagto WhatsApp, TikTok, ama Facebook.
          </p>

          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '16px 20px', textAlign: 'left', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Xaaladda Akoonkaaga:</span>
              <span style={{ background: effStatus === 'suspended' ? '#ef4444' : effStatus === 'expired' ? '#f59e0b' : 'var(--bg-page)', color: effStatus === 'inactive' ? 'var(--text-muted)' : '#fff', padding: '2px 10px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700 }}>
                {effStatus === 'suspended' ? 'SUSPENDED' : effStatus === 'expired' ? 'EXPIRED' : 'NOT ACTIVATED'}
              </span>
            </div>
            {effStatus === 'expired' && featureAccess?.expires_at && (
              <p style={{ fontSize: '0.8rem', color: '#ef4444', margin: '4px 0 0' }}>
                Waqtigii adeeggaagu wuxuu dhacay {formatDate(featureAccess.expires_at)}. Fadlan cusboonaysii.
              </p>
            )}
            {effStatus === 'suspended' && (
              <p style={{ fontSize: '0.8rem', color: '#ef4444', margin: '4px 0 0' }}>
                Adeeggaaga si ku-meel-gaar ah ayaa loo hakiyay. Sabab: {featureAccess?.notes || 'Contact Admin'}
              </p>
            )}
            {effStatus === 'inactive' && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                Adeeggan wali laguma furin akoonkaaga. Fadlan la xiriir Super Admin-ka si laguugu hawlgeliyo.
              </p>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 20 }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
              Sida Loo Furto / Contact Admin:
            </h4>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
              <a href="https://wa.me/252634284015?text=Asc%20Super%20Admin,%20waxaan%20rabaa%20in%20la%20ii%20furo%20Registration%20via%20Link" target="_blank" rel="noreferrer" className="btn btn-primary" style={{ background: '#25d366', borderColor: '#25d366' }}>
                💬 Kala Xiriir WhatsApp
              </a>
              <a href="tel:+2520634284015" className="btn btn-secondary">📞 063 4284015</a>
              <a href="tel:+2520657575175" className="btn btn-secondary">📞 0657575175</a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Authorized State ─────────────────────────────────────────────
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.5rem' }}>⭐</span>
            <h1 className="page-title">My Registration Link</h1>
          </div>
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="badge badge-success">PREMIUM ACTIVE</span>
            <span className={`badge ${referralActive ? 'badge-success' : 'badge-danger'}`}>
              {referralActive ? 'LINK ACCEPTING' : 'LINK PAUSED'}
            </span>
          </div>
        </div>

        {referralUrl ? (
          <>
            <div style={{ background: 'var(--bg-secondary)', border: '1.5px solid var(--border-color)', borderRadius: 10, padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.875rem', color: 'var(--text-primary)', wordBreak: 'break-all', marginBottom: 14 }}>
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

      {/* ── My Data Bundles ─────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: '1.3rem' }}>📦</span>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>My Data Bundles</h2>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 20 }}>
          Configure up to 5 bundles. These will be shown to customers on your registration page.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border-color)', width: 50 }}>#</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border-color)' }}>Bundle Name</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border-color)', width: 160 }}>Price (SL)</th>
              </tr>
            </thead>
            <tbody>
              {bundles.map(b => (
                <tr key={b.slot}>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 600 }}>{b.slot}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <input
                      className="form-input"
                      style={{ margin: 0, fontSize: '0.9rem' }}
                      placeholder={`Bundle ${b.slot} name (e.g. 1GB Daily)`}
                      value={b.bundle_name}
                      onChange={e => updateBundle(b.slot, 'bundle_name', e.target.value)}
                    />
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <input
                      className="form-input"
                      style={{ margin: 0, fontSize: '0.9rem' }}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={b.bundle_price}
                      onChange={e => updateBundle(b.slot, 'bundle_price', e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={handleSaveBundles} disabled={savingBundles}>
            {savingBundles ? 'Saving Bundles...' : '💾 Save Bundles'}
          </button>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 12 }}>
            Leave rows blank to hide them from your registration page.
          </span>
        </div>
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
          <span className="form-hint">Leave blank to use the default service description</span>
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
              Registration link active (allow visitors to register via this link)
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
