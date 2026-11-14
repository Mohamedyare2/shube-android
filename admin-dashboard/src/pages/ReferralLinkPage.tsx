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
  bundle_price: string
}

interface OperatorSummary {
  id: string
  username: string
  referral_code: string | null
  referral_welcome_message: string | null
  referral_active: boolean | null
}

const EMPTY_BUNDLES: BundleSlot[] = [1, 2, 3, 4, 5].map(slot => ({ slot, bundle_name: '', bundle_price: '' }))

export default function ReferralLinkPage() {
  const { user, isOperator, isAdmin } = useAuth()
  const { toast } = useToast()

  const [adminOperators, setAdminOperators] = useState<OperatorSummary[]>([])
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null)

  const [operatorId, setOperatorId] = useState<string | null>(null)
  const [operatorUsername, setOperatorUsername] = useState<string>('')
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [welcomeMsg, setWelcomeMsg] = useState('')
  const [referralActive, setReferralActive] = useState(true)
  const [featureAccess, setFeatureAccess] = useState<OperatorFeatureAccess | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingBundles, setSavingBundles] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [copied, setCopied] = useState(false)

  // Bundle state
  const [bundles, setBundles] = useState<BundleSlot[]>(EMPTY_BUNDLES)

  const baseUrl = window.location.origin
  const referralUrl = referralCode ? `${baseUrl}/register/${referralCode}` : null

  // 1. Initial admin operator list load
  useEffect(() => {
    if (!isAdmin) return
    supabase
      .from('operators')
      .select('id, username, referral_code, referral_welcome_message, referral_active')
      .order('username')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setAdminOperators(data)
          if (!selectedOpId) {
            setSelectedOpId(data[0].id)
          }
        }
      })
  }, [isAdmin])

  // 2. Load operator details
  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      let targetOp: OperatorSummary | null = null

      if (isAdmin) {
        if (selectedOpId) {
          const found = adminOperators.find(o => o.id === selectedOpId)
          if (found) {
            targetOp = found
          } else {
            const { data } = await supabase
              .from('operators')
              .select('id, username, referral_code, referral_welcome_message, referral_active')
              .eq('id', selectedOpId)
              .maybeSingle()
            targetOp = data
          }
        } else {
          const { data: firstOp } = await supabase
            .from('operators')
            .select('id, username, referral_code, referral_welcome_message, referral_active')
            .order('username')
            .limit(1)
            .maybeSingle()
          targetOp = firstOp
          if (firstOp) setSelectedOpId(firstOp.id)
        }
      } else {
        const { data: op } = await supabase
          .from('operators')
          .select('id, username, referral_code, referral_welcome_message, referral_active')
          .eq('profile_id', user.id)
          .maybeSingle()
        targetOp = op
      }

      if (targetOp) {
        setOperatorId(targetOp.id)
        setOperatorUsername(targetOp.username)
        let activeCode = targetOp.referral_code
        if (!activeCode && targetOp.username) {
          activeCode = targetOp.username.toLowerCase().replace(/[^a-z0-9]/g, '-')
          supabase
            .from('operators')
            .update({ referral_code: activeCode })
            .eq('id', targetOp.id)
            .then(() => {})
        }
        setReferralCode(activeCode)
        setWelcomeMsg(targetOp.referral_welcome_message || '')
        setReferralActive(targetOp.referral_active ?? true)

        // Query feature access entitlement
        try {
          const { data: faData } = await supabase
            .from('operator_feature_access')
            .select('*')
            .eq('operator_id', targetOp.id)
            .eq('feature_key', 'registration_via_link')
            .maybeSingle()

          if (faData) {
            setFeatureAccess(faData)
          } else if (isAdmin) {
            // Admin automatically granted view
            setFeatureAccess({
              id: 'admin',
              operator_id: targetOp.id,
              feature_key: 'registration_via_link',
              status: 'active',
              granted_at: new Date().toISOString(),
              expires_at: null,
              payment_reference: null,
              granted_by: user.id,
              notes: 'Admin access'
            } as OperatorFeatureAccess)
          } else {
            setFeatureAccess(null)
          }
        } catch (faErr) {
          console.warn('Could not load operator_feature_access:', faErr)
        }

        // Load bundle slots
        try {
          const { data: bundleData } = await supabase
            .from('operator_bundles')
            .select('slot, bundle_name, bundle_price')
            .eq('operator_id', targetOp.id)
            .order('slot', { ascending: true })

          if (bundleData && bundleData.length > 0) {
            const merged: BundleSlot[] = [1, 2, 3, 4, 5].map(slot => {
              const found = bundleData.find(b => b.slot === slot)
              return {
                slot,
                bundle_name: found?.bundle_name || '',
                bundle_price: found?.bundle_price != null ? String(found.bundle_price) : '',
              }
            })
            setBundles(merged)
          } else {
            setBundles(EMPTY_BUNDLES)
          }
        } catch (bErr) {
          console.warn('Could not load operator_bundles:', bErr)
          setBundles(EMPTY_BUNDLES)
        }

        // Load referral stats
        try {
          const { count: visitCount } = await supabase
            .from('referral_visits')
            .select('id', { count: 'exact', head: true })
            .eq('operator_id', targetOp.id)

          const { count: allCustCount } = await supabase
            .from('customers')
            .select('id', { count: 'exact', head: true })
            .eq('referred_by_operator_id', targetOp.id)

          const { count: refCustCount } = await supabase
            .from('customers')
            .select('id', { count: 'exact', head: true })
            .eq('referred_by_operator_id', targetOp.id)
            .eq('registration_source', 'referral_link')

          setStats({
            total_visits: visitCount || 0,
            total_customers: allCustCount || 0,
            referral_customers: refCustCount || 0,
          })
        } catch (stErr) {
          console.warn('Could not load referral stats:', stErr)
        }
      }
    } catch (err: unknown) {
      console.error('Error loading referral link data:', err)
      toast(err instanceof Error ? err.message : 'Failed to load referral data', 'error')
    } finally {
      setLoading(false)
    }
  }, [user?.id, isAdmin, selectedOpId, adminOperators])

  useEffect(() => { load() }, [load])

  async function saveConfig() {
    if (!operatorId) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('operators')
        .update({
          referral_welcome_message: welcomeMsg || null,
          referral_active: referralActive,
        })
        .eq('id', operatorId)

      if (error) throw error
      toast('Settings saved successfully', 'success')
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveBundles() {
    if (!operatorId) return
    setSavingBundles(true)
    try {
      const upserts = bundles
        .filter(b => b.bundle_name.trim() !== '')
        .map(b => ({
          operator_id: operatorId,
          slot: b.slot,
          bundle_name: b.bundle_name.trim(),
          bundle_price: b.bundle_price.trim() !== '' ? parseFloat(b.bundle_price) : null,
          active: true,
          updated_at: new Date().toISOString(),
        }))

      const activeSlots = upserts.map(u => u.slot)
      if (activeSlots.length > 0) {
        await supabase
          .from('operator_bundles')
          .delete()
          .eq('operator_id', operatorId)
          .not('slot', 'in', `(${activeSlots.join(',')})`)
      } else {
        await supabase
          .from('operator_bundles')
          .delete()
          .eq('operator_id', operatorId)
      }

      if (upserts.length > 0) {
        const { error } = await supabase
          .from('operator_bundles')
          .upsert(upserts, { onConflict: 'operator_id,slot' })
        if (error) throw error
      }

      toast('Bundle settings saved!', 'success')
      load()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to save bundles', 'error')
    } finally {
      setSavingBundles(false)
    }
  }

  function updateBundleField(slot: number, field: 'bundle_name' | 'bundle_price', val: string) {
    setBundles(prev => prev.map(b => b.slot === slot ? { ...b, [field]: val } : b))
  }

  function copyLink() {
    if (!referralUrl) return
    navigator.clipboard.writeText(referralUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast('Link copied!', 'success')
  }

  function shareWhatsApp() {
    if (!referralUrl) return
    const msg = encodeURIComponent(`📶 Hel Internet Degdeg ah!\n\nGuji linkiga hoose si aad isu diiwaangeliso:\n${referralUrl}`)
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  async function generateCode() {
    if (!operatorId) return
    setGenerating(true)
    try {
      const baseName = operatorUsername || user?.email?.split('@')[0] || `op-${operatorId.slice(0, 8)}`
      const generated = baseName.toLowerCase().replace(/[^a-z0-9]/g, '-')
      const { error } = await supabase
        .from('operators')
        .update({ referral_code: generated })
        .eq('id', operatorId)
      if (error) throw error
      setReferralCode(generated)
      toast('Registration link generated successfully!', 'success')
      load()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to generate link', 'error')
    } finally {
      setGenerating(false)
    }
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
          <div className="empty-desc">This page is only available for operators and admins.</div>
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

  // Unauthorized State (for Operators without feature)
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
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>
            Premium Feature: Macmiil Is-Diiwaangeliye (Self-Registration)
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, maxWidth: 520, margin: '0 auto 20px' }}>
            Awood u yeelo in macaamiishaadu ay si toos ah isku diiwaangeliyaan iyaga oo isticmaalaya link gaar kuu ah oo aad ku wadaagto WhatsApp ama baraha bulshada.
          </p>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 99, fontSize: '0.85rem', fontWeight: 600,
            background: effStatus === 'expired' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(234, 179, 8, 0.12)',
            color: effStatus === 'expired' ? '#ef4444' : '#eab308',
            marginBottom: 24,
          }}>
            <span>●</span>
            <span>Xaaladda: {effStatus === 'expired' ? 'Waqtigu wuu dhacay' : effStatus === 'suspended' ? 'Waa la hakiyay' : 'Wali laguma darin'}</span>
          </div>

          <div style={{
            background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, textAlign: 'left',
            marginBottom: 24, fontSize: '0.9rem',
          }}>
            <strong style={{ display: 'block', marginBottom: 8 }}>Faa'iidooyinka Feature-kan:</strong>
            <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <li>Link gaar ah oo magacaaga wata: <code>{baseUrl}/register/magacaaga</code></li>
              <li>Macaamiishu waxay dooran karaan xidhmooyinka internetka ee aad u diyaarisay</li>
              <li>Lacag bixinta tooska ah ee ZAAD adiga oo aan gacanta waxba ku gelin</li>
              <li>Xisaab xidhkoodu si toos ah ayuu ugu dhacayaa Gateway-gaaga</li>
            </ul>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 20 }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
              Si laguu furo feature-kan, fadlan la xidhiidh Maamulka (Admin):
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a
                href="https://wa.me/252634284015?text=Asc%20Admin%2C%20waxaan%20doonayaa%20in%20la%20ii%20furo%20Registration%20via%20Link%20feature."
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
                style={{ background: '#25D366', borderColor: '#25D366' }}
              >
                💬 Kala Xidhiidh WhatsApp (+252 63 4284015)
              </a>
              <a href="tel:+252634284015" className="btn btn-secondary">
                📞 Wac Admin
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.5rem' }}>🔗</span>
            <h1 className="page-title">{isAdmin ? 'Registration Links (Macaamiisha)' : 'Registration Link-gayga'}</h1>
          </div>
          <p className="page-subtitle">
            {isAdmin ? 'Xakamee oo arag linkiyada diiwaangelinta macaamiisha ee operator-kasta' : 'Link-ga gaarka ah ee macaamiishaadu isku diiwaangeliyaan'}
          </p>
        </div>
      </div>

      {/* Admin Operator Switcher */}
      {isAdmin && adminOperators.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>👤 Dooro Operator:</span>
            <select
              className="form-input"
              value={selectedOpId || ''}
              onChange={e => setSelectedOpId(e.target.value)}
              style={{ maxWidth: 360 }}
            >
              {adminOperators.map(o => (
                <option key={o.id} value={o.id}>
                  {o.username} {o.referral_code ? `(${o.referral_code})` : '— (No link yet)'}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── Link Card ─────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="card-header">
          <div className="card-title">🔗 Link-ga Diiwaangelinta {operatorUsername ? `(${operatorUsername})` : ''}</div>
        </div>

        {referralCode ? (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)', marginBottom: 'var(--space-3)',
              flexWrap: 'wrap',
            }}>
              <code style={{
                flex: 1, minWidth: 200, fontSize: '0.95rem',
                color: 'var(--brand-primary)', wordBreak: 'break-all',
              }}>
                {referralUrl}
              </code>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button className="btn btn-primary btn-sm" onClick={copyLink}>
                  {copied ? '✅ Copied!' : '📋 Copy Link'}
                </button>
                <button
                  className="btn btn-sm"
                  style={{ background: '#25D366', color: '#fff', border: 'none' }}
                  onClick={shareWhatsApp}
                >
                  💬 WhatsApp
                </button>
                <a
                  href={referralUrl || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                >
                  ↗ Test Link
                </a>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <span>Code: <strong style={{ color: 'var(--text-primary)' }}>{referralCode}</strong></span>
              <span>Status: <strong style={{ color: referralActive ? 'var(--brand-success)' : 'var(--brand-danger)' }}>{referralActive ? 'Active' : 'Disabled'}</strong></span>
              {featureAccess?.expires_at && (
                <span>Wuxuu dhacayaa: <strong style={{ color: 'var(--text-primary)' }}>{formatDate(featureAccess.expires_at)}</strong></span>
              )}
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--text-muted)', padding: '16px 0', textAlign: 'center' }}>
            <p style={{ margin: '0 0 12px' }}>Wali laguu ma xilsaarin Referral Code gaar ah.</p>
            <button className="btn btn-primary" onClick={generateCode} disabled={generating}>
              {generating ? 'Generating...' : '✨ Samee Link Hadda'}
            </button>
          </div>
        )}
      </div>

      {/* ── Stats Card ────────────────────────────────────────── */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <div className="card" style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--brand-primary)' }}>{stats.total_visits}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Dadka Soo Booqday Link-ga</div>
          </div>
          <div className="card" style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--brand-success)' }}>{stats.referral_customers}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Macaamiisha Ku Diiwaangashay</div>
          </div>
          <div className="card" style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>
              {stats.total_visits > 0 ? `${((stats.referral_customers / stats.total_visits) * 100).toFixed(1)}%` : '0%'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Heerka Is-Diiwaangelinta (Conversion)</div>
          </div>
        </div>
      )}

      {/* ── Welcome Message & Active Toggle ───────────────────── */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="card-header">
          <div className="card-title">⚙️ Habaynta Fariinta & Xaaladda</div>
        </div>
        <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
          <label className="form-label">Fariinta Soo Dhaweynta (Welcome Message)</label>
          <input
            className="form-input"
            value={welcomeMsg}
            onChange={e => setWelcomeMsg(e.target.value)}
            placeholder="Tusaale: Kusoo dhawow Adeegga Xawaaraha Sare ee Internetka!"
          />
          <span className="form-hint">Fariintan waxay u muuqanaysaa macmiilka marka uu link-ga furo.</span>
        </div>

        <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
          <label className="toggle-wrapper">
            <div className={`toggle-track${referralActive ? ' on' : ''}`} onClick={() => setReferralActive(a => !a)}>
              <div className="toggle-thumb" />
            </div>
            <span style={{ fontSize: '0.875rem' }}>Link-gu wuu shaqaynayaa (Active)</span>
          </label>
        </div>

        <button className="btn btn-primary" onClick={saveConfig} disabled={saving}>
          {saving ? 'Saving...' : '💾 Keydi Fariinta'}
        </button>
      </div>

      {/* ── Bundle Slots Configuration ────────────────────────── */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="card-title">📦 Xidhmooyinka Internetka (Bundles)</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Macaamiishaadu waxay dooran karaan xidhmooyinkan marka ay is diiwaangelinayaan.
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={saveBundles} disabled={savingBundles}>
            {savingBundles ? 'Saving...' : '💾 Keydi Xidhmooyinka'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {bundles.map(b => (
            <div key={b.slot} style={{
              display: 'flex', gap: 'var(--space-3)', alignItems: 'center',
              padding: 'var(--space-2) var(--space-3)',
              background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
              flexWrap: 'wrap',
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--brand-primary)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', fontWeight: 700,
              }}>
                {b.slot}
              </span>
              <input
                className="form-input"
                style={{ flex: 2, minWidth: 160 }}
                value={b.bundle_name}
                onChange={e => updateBundleField(b.slot, 'bundle_name', e.target.value)}
                placeholder={`Xidhmada ${b.slot} (Tusaale: 1 GB - Maalin)`}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 120 }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>$</span>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={b.bundle_price}
                  onChange={e => updateBundleField(b.slot, 'bundle_price', e.target.value)}
                  placeholder="0.50"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
