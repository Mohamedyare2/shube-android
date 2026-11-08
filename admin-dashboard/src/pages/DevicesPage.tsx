import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Device } from '../types/database'
import { formatDateTime, timeAgo } from '../lib/utils'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

const ADMIN_API_URL = ''

export default function DevicesPage() {
  const { toast } = useToast()
  const { user, isOperator, session } = useAuth()
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)

  // Pairing state
  const [showPairModal, setShowPairModal] = useState(false)
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [pairingLoading, setPairingLoading] = useState(false)
  const [deviceName, setDeviceName] = useState('My Worker Phone')

  // Subscription state
  const [showSubModal, setShowSubModal] = useState(false)
  const [selectedDeviceForSub, setSelectedDeviceForSub] = useState<Device | null>(null)
  const [subDays, setSubDays] = useState<number>(30)
  const [subHours, setSubHours] = useState<number>(0)
  const [subMinutes, setSubMinutes] = useState<number>(0)
  const [subLoading, setSubLoading] = useState(false)
  const [generatedSubCode, setGeneratedSubCode] = useState<string | null>(null)
  const [subDurationSummary, setSubDurationSummary] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('devices')
      .select(`*, operator:operators(username, profile:profiles!operators_profile_id_fkey(full_name))`)
      .order('last_seen', { ascending: false, nullsFirst: false })

    // Operators only see their own devices — look up operators.id via profile_id
    if (isOperator && user?.id) {
      const { data: opRow } = await supabase
        .from('operators').select('id').eq('profile_id', user.id).single()
      if (opRow) query = query.eq('operator_id', opRow.id)
    }

    const { data } = await query
    if (data) setDevices(data as Device[])
    setLoading(false)
  }, [isOperator, user?.id])

  useEffect(() => {
    load()
    const ch = supabase.channel('devices-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  function getDeviceStatus(dev: Device): 'online' | 'offline' | 'disabled' {
    if (dev.revoked || dev.status === 'disabled') return 'disabled'
    if (!dev.last_seen && !dev.last_ping_at) return 'offline'
    const lastSeen = dev.last_ping_at || dev.last_seen
    const diffMs = Date.now() - new Date(lastSeen!).getTime()
    return diffMs < 3 * 60 * 1000 ? 'online' : 'offline'
  }

  // Generate a pairing code via the Admin API
  async function handleGeneratePairingCode() {
    if (!user?.id || !deviceName.trim()) {
      toast('Enter a device name first', 'error'); return
    }
    setPairingLoading(true)
    try {
      // operators.id ≠ auth user.id — look it up first
      const { data: opRow, error: opErr } = await supabase
        .from('operators')
        .select('id')
        .eq('profile_id', user.id)
        .single()
      if (opErr || !opRow) {
        toast('Could not find your operator account. Contact admin.', 'error'); return
      }

      const jwt = session?.access_token
      const res = await fetch(`/api/devices/generate-pairing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`,
        },
        body: JSON.stringify({ device_name: deviceName.trim(), operator_id: opRow.id }),
      })
      const data = await res.json()
      if (!res.ok) { toast(data.error || 'Failed', 'error'); return }
      setPairingCode(data.pairing_code)
      load()
    } catch (e: any) {
      toast('Could not reach Admin API. Is the server running?', 'error')
    } finally {
      setPairingLoading(false)
    }
  }

  async function handleGenerateActivationCode() {
    if (!selectedDeviceForSub) return
    const totalMinutes = (Number(subDays) || 0) * 1440 + (Number(subHours) || 0) * 60 + (Number(subMinutes) || 0)
    if (totalMinutes <= 0) {
      toast('Fadlan geli ugu yaraan 1 daqiiqo ama maalin', 'error')
      return
    }
    setSubLoading(true)
    try {
      const jwt = session?.access_token
      const res = await fetch(`/api/devices/${selectedDeviceForSub.id}/activation-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          days: subDays,
          hours: subHours,
          minutes: subMinutes,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Failed to generate code', 'error')
        return
      }
      setGeneratedSubCode(data.activation_code)
      const parts = []
      if (subDays > 0) parts.push(`${subDays} maalmood`)
      if (subHours > 0) parts.push(`${subHours} saacadood`)
      if (subMinutes > 0) parts.push(`${subMinutes} daqiiqo`)
      setSubDurationSummary(parts.join(', ') || `${data.duration_minutes} daqiiqo`)
      toast('8-da lambar si guul leh baa loo soo saaray!', 'success')
      load()
    } catch (e: any) {
      toast('Server error: ' + e.message, 'error')
    } finally {
      setSubLoading(false)
    }
  }

  async function toggleRevoke(dev: Device) {
    const revoke = !dev.revoked
    const { error } = await supabase.from('devices').update({
      revoked: revoke,
      revoked_at: revoke ? new Date().toISOString() : null,
      revoked_by: revoke ? user?.id : null,
      status: revoke ? 'disabled' : 'offline',
    }).eq('id', dev.id)
    if (error) { toast(error.message, 'error'); return }
    toast(`Device ${revoke ? 'revoked' : 'restored'}`, revoke ? 'warning' : 'success')
    load()
  }

  const onlineCount = devices.filter(d => getDeviceStatus(d) === 'online').length

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">📱 {isOperator ? 'My Devices' : 'All Devices'}</h1>
          <p className="page-subtitle">
            {onlineCount} online · {devices.length} total
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setShowPairModal(true); setPairingCode(null); setDeviceName('My Worker Phone') }}
        >
          + Pair New Device
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
          {Array(4).fill(0).map((_, i) => <div key={i} className="skeleton" style={{ height: 160, borderRadius: 'var(--radius-xl)' }} />)}
        </div>
      ) : devices.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📱</div>
          <div className="empty-title">No Devices Paired</div>
          <div className="empty-desc">Click "Pair New Device" to connect an Android phone.</div>
          <button className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }}
            onClick={() => { setShowPairModal(true); setPairingCode(null) }}>
            Pair Your First Device
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 'var(--space-4)' }}>
          {devices.map(dev => {
            const status = getDeviceStatus(dev)
            const lastActivity = dev.last_ping_at || dev.last_seen
            return (
              <div key={dev.id} className="card" style={{ position: 'relative', overflow: 'hidden' }}>
                {/* Status glow accent */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                  background: status === 'online' ? 'var(--brand-success)' : status === 'disabled' ? 'var(--brand-danger)' : 'var(--border-default)',
                  borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
                }} />

                <div className="card-body" style={{ paddingTop: 'var(--space-5)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-4)' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                        {dev.device_name}
                      </div>
                      {!isOperator && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {(dev as any).operator?.username ?? 'Unlinked'}
                        </div>
                      )}
                    </div>
                    <span className={`badge ${status === 'online' ? 'badge-success' : status === 'disabled' ? 'badge-danger' : 'badge-warning'}`}>
                      {status === 'online' ? '● Online' : status === 'disabled' ? 'Revoked' : '○ Offline'}
                    </span>
                  </div>

                  {/* Battery + Network — always shown when columns exist in DB */}
                  {((dev as any).battery_level !== null && (dev as any).battery_level !== undefined) || (dev as any).network_type ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                      <div style={{ background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>BATTERY</div>
                        <div style={{
                          fontSize: '1.2rem', fontWeight: 700,
                          color: (dev as any).battery_level == null ? 'var(--text-muted)'
                            : (dev as any).battery_level < 20 ? 'var(--brand-danger)'
                            : (dev as any).battery_level < 50 ? 'var(--brand-warning)'
                            : 'var(--brand-success)'
                        }}>
                          {(dev as any).battery_level != null
                            ? `${(dev as any).battery_level}%`
                            : '—'}
                          {(dev as any).is_charging ? ' ⚡' : ''}
                        </div>
                      </div>
                      <div style={{ background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>NETWORK</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--brand-primary)' }}>
                          {(dev as any).network_type || '—'}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Subscription / Ruqsad Info */}
                  <div style={{
                    background: 'var(--bg-surface-2)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 14px',
                    marginBottom: 'var(--space-3)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>RUKHSADDA (SUBSCRIPTION)</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                        {dev.subscription_expires_at ? (
                          new Date(dev.subscription_expires_at).getTime() < Date.now() ? (
                            <span style={{ color: 'var(--brand-danger)' }}>❌ Dhacday ({timeAgo(dev.subscription_expires_at)})</span>
                          ) : (
                            <span style={{ color: 'var(--brand-success)' }}>
                              ✅ Dhacaysa: {new Date(dev.subscription_expires_at).toLocaleDateString()} {new Date(dev.subscription_expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>⚪ Weli lama kicin</span>
                        )}
                      </div>
                    </div>
                    {!isOperator && (
                      <button
                        className="btn btn-primary"
                        style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => {
                          setSelectedDeviceForSub(dev)
                          setSubDays(30)
                          setSubHours(0)
                          setSubMinutes(0)
                          setGeneratedSubCode(null)
                          setShowSubModal(true)
                        }}
                      >
                        🔑 Sii Rukhsad
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Last seen: {lastActivity ? timeAgo(lastActivity) : 'Never'}
                    </span>
                    {!isOperator ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className={`btn ${dev.revoked ? 'btn-secondary' : 'btn-danger'}`}
                          style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                          onClick={() => toggleRevoke(dev)}
                        >
                          {dev.revoked ? 'Restore' : 'Revoke'}
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '4px 12px', fontSize: '0.75rem', background: 'transparent', border: '1px solid var(--brand-danger)', color: 'var(--brand-danger)' }}
                          onClick={async () => {
                            if (!window.confirm("Ma hubtaa inaad tirtirto device-kan si buuxda? (Operator-ka ayaa awoodi doona inuu mid cusub ku xirto)")) return
                            const { error } = await supabase.from('devices').delete().eq('id', dev.id)
                            if (error) toast(error.message, 'error')
                            else { toast("Device la tirtiray", "success"); load() }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-danger"
                        style={{ padding: '4px 12px', fontSize: '0.75rem', background: 'transparent', border: '1px solid var(--brand-danger)', color: 'var(--brand-danger)' }}
                        onClick={async () => {
                          if (!window.confirm("Ma hubtaa inaad tirtirto device-kan?")) return
                          const { error } = await supabase.from('devices').delete().eq('id', dev.id)
                          if (error) toast(error.message, 'error')
                          else { toast("Device la tirtiray", "success"); load() }
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Pair Device Modal ──────────────────────────────────────────────── */}
      {showPairModal && (
        <div className="modal-overlay" onClick={() => setShowPairModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 className="modal-title">📱 Pair New Device</h2>
              <button className="modal-close" onClick={() => setShowPairModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {pairingCode ? (
                /* ── Show Code ── */
                <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
                    Ku fur <strong>SHUBE App</strong>-ka mobile-kaaga, gali <strong>Username & Password</strong>-kaaga website-ka, kadibna gali code-kan:
                  </div>
                  <div style={{
                    fontSize: '3.5rem', fontWeight: 900, letterSpacing: '0.4rem',
                    color: 'var(--brand-primary)', fontVariantNumeric: 'tabular-nums',
                    background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-xl)',
                    padding: 'var(--space-5) var(--space-6)', marginBottom: 'var(--space-4)',
                    border: '2px solid var(--brand-primary)',
                  }}>
                    {pairingCode}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
                    ⚠️ Code-kan waxaa la isticmaali karaa hal mar kaliya waxaana loogu talagalay in lagu xiro mobile-kaaga.
                  </div>
                  <button className="btn btn-secondary" onClick={() => { setPairingCode(null); setDeviceName('My Worker Phone') }}>
                    Generate Another Code
                  </button>
                </div>
              ) : (
                /* ── Enter Name → Generate ── */
                <>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: 'var(--space-4)' }}>
                    Give this device a name, then generate a one-time pairing code to enter in the Worker App.
                  </p>
                  <div className="form-group">
                    <label className="form-label">Device Name</label>
                    <input
                      className="form-input"
                      value={deviceName}
                      onChange={e => setDeviceName(e.target.value)}
                      placeholder="e.g. Xaafadda Phone 1"
                      autoFocus
                    />
                  </div>
                  <div style={{ marginTop: 'var(--space-5)', display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={() => setShowPairModal(false)}>Cancel</button>
                    <button
                      className="btn btn-primary"
                      disabled={pairingLoading || !deviceName.trim()}
                      onClick={handleGeneratePairingCode}
                    >
                      {pairingLoading ? 'Generating…' : '🔗 Generate Code'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Subscription Modal ──────────────────────────────────────────────── */}
      {showSubModal && selectedDeviceForSub && (
        <div className="modal-overlay" onClick={() => setShowSubModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 className="modal-title">🔑 Sii Rukhsad (Subscription)</h2>
              <button className="modal-close" onClick={() => setShowSubModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 'var(--space-3)', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Qalabka: <strong>{selectedDeviceForSub.device_name}</strong>
              </div>

              {generatedSubCode ? (
                /* ── Show 8-Digit Activation Code ── */
                <div style={{ textAlign: 'center', padding: 'var(--space-3) 0' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                    Sii macmiilka <strong>8-dan lambar</strong> si uu Geesh App-ka ugu shaqaysiiyo:
                  </div>
                  <div style={{
                    fontSize: '3.2rem', fontWeight: 900, letterSpacing: '0.35rem',
                    color: 'var(--brand-primary)', fontVariantNumeric: 'tabular-nums',
                    background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-xl)',
                    padding: 'var(--space-4) var(--space-5)', marginBottom: 'var(--space-3)',
                    border: '2px solid var(--brand-primary)',
                  }}>
                    {generatedSubCode}
                  </div>
                  <div style={{ background: 'var(--bg-surface-2)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
                    ⏳ <strong>Muddada:</strong> {subDurationSummary}.
                    <br />
                    Marka macmiilku ku qoro app-ka isagoo internet wata, app-ku wuxuu shaqayn doonaa mudadaas isagoon wax internet ah u baahnayn.
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedSubCode)
                        toast("8-da lambar waa la koobiyeeyay!", "success")
                      }}
                    >
                      📋 Nuqul (Copy Code)
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => setShowSubModal(false)}
                    >
                      Dhamaystay (Done)
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Enter Days, Hours, Minutes ── */
                <>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 'var(--space-3)' }}>
                    Dooro ama gacanta ku qor muddada aad rabto in Geesh App-ku shaqeeyo:
                  </p>

                  {/* Quick Preset Buttons */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: 'var(--space-4)' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '4px 10px', background: subMinutes === 2 && subHours === 0 && subDays === 0 ? 'var(--brand-primary)' : undefined, color: subMinutes === 2 && subHours === 0 && subDays === 0 ? '#fff' : undefined }}
                      onClick={() => { setSubDays(0); setSubHours(0); setSubMinutes(2) }}
                    >
                      ⚡ 2 Daqiiqo (Test)
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '4px 10px', background: subHours === 1 && subDays === 0 && subMinutes === 0 ? 'var(--brand-primary)' : undefined, color: subHours === 1 && subDays === 0 && subMinutes === 0 ? '#fff' : undefined }}
                      onClick={() => { setSubDays(0); setSubHours(1); setSubMinutes(0) }}
                    >
                      1 Saac
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '4px 10px', background: subDays === 1 && subHours === 0 && subMinutes === 0 ? 'var(--brand-primary)' : undefined, color: subDays === 1 && subHours === 0 && subMinutes === 0 ? '#fff' : undefined }}
                      onClick={() => { setSubDays(1); setSubHours(0); setSubMinutes(0) }}
                    >
                      1 Maalin
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '4px 10px', background: subDays === 7 && subHours === 0 && subMinutes === 0 ? 'var(--brand-primary)' : undefined, color: subDays === 7 && subHours === 0 && subMinutes === 0 ? '#fff' : undefined }}
                      onClick={() => { setSubDays(7); setSubHours(0); setSubMinutes(0) }}
                    >
                      7 Maalmood
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '4px 10px', background: subDays === 30 && subHours === 0 && subMinutes === 0 ? 'var(--brand-primary)' : undefined, color: subDays === 30 && subHours === 0 && subMinutes === 0 ? '#fff' : undefined }}
                      onClick={() => { setSubDays(30); setSubHours(0); setSubMinutes(0) }}
                    >
                      30 Maalmood
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                    <div className="form-group">
                      <label className="form-label">Maalmood (Days)</label>
                      <input
                        type="number"
                        min="0"
                        className="form-input"
                        value={subDays}
                        onChange={e => setSubDays(Math.max(0, parseInt(e.target.value) || 0))}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Saacado (Hours)</label>
                      <input
                        type="number"
                        min="0"
                        max="23"
                        className="form-input"
                        value={subHours}
                        onChange={e => setSubHours(Math.max(0, parseInt(e.target.value) || 0))}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Daqiiqado (Min)</label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        className="form-input"
                        value={subMinutes}
                        onChange={e => setSubMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                      />
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-surface-2)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    💡 <strong>Wadarta Guud:</strong> {subDays} maalmood, {subHours} saacadood, {subMinutes} daqiiqo.
                    <br />
                    Waqtigu wuxuu bilaabmayaa marka uu macmiilku taleefankiisa ku qoro 8-da lambar.
                  </div>

                  <div style={{ marginTop: 'var(--space-5)', display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={() => setShowSubModal(false)}>Cancel</button>
                    <button
                      className="btn btn-primary"
                      disabled={subLoading || (subDays === 0 && subHours === 0 && subMinutes === 0)}
                      onClick={handleGenerateActivationCode}
                    >
                      {subLoading ? 'Soo saarayaa…' : '🔑 Soo saar 8-da Lambar'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
