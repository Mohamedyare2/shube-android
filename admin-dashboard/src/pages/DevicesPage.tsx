import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Device } from '../types/database'
import { formatDateTime, timeAgo } from '../lib/utils'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5050'

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

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('devices')
      .select(`*, operator:operators(username, profile:profiles!operators_profile_id_fkey(full_name))`)
      .order('last_seen', { ascending: false, nullsFirst: false })

    // Operators only see their own devices
    if (isOperator && user?.id) {
      query = query.eq('operator_id', user.id)
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
      const jwt = session?.access_token
      const res = await fetch(`${ADMIN_API_URL}/api/devices/generate-pairing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`,
        },
        body: JSON.stringify({ device_name: deviceName.trim(), operator_id: user.id }),
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

                  {/* Battery + Network — only shown if we have the new columns */}
                  {typeof (dev as any).battery_level === 'number' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                      <div style={{ background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>BATTERY</div>
                        <div style={{
                          fontSize: '1.2rem', fontWeight: 700,
                          color: (dev as any).battery_level < 20 ? 'var(--brand-danger)'
                            : (dev as any).battery_level < 50 ? 'var(--brand-warning)'
                            : 'var(--brand-success)'
                        }}>
                          {(dev as any).battery_level}%
                        </div>
                      </div>
                      <div style={{ background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>NETWORK</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--brand-primary)' }}>
                          {(dev as any).network_type || '—'}
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Last seen: {lastActivity ? timeAgo(lastActivity) : 'Never'}
                    </span>
                    {!isOperator && (
                      <button
                        className={`btn ${dev.revoked ? 'btn-secondary' : 'btn-danger'}`}
                        style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                        onClick={() => toggleRevoke(dev)}
                      >
                        {dev.revoked ? 'Restore' : 'Revoke'}
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
                    Open the <strong>SHUBE Worker App</strong> on your Android phone and enter this code:
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
                    ⚠️ This code can only be used once and expires when the device connects.
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
    </div>
  )
}
