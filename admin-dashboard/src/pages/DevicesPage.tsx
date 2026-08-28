import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Device } from '../types/database'
import { formatDateTime, timeAgo, deviceStatusClass } from '../lib/utils'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

export default function DevicesPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('devices')
      .select(`*, operator:operators(username, profile:profiles(full_name))`)
      .order('last_seen', { ascending: false, nullsFirst: false })
    if (data) setDevices(data as Device[])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    // Realtime device updates
    const ch = supabase.channel('devices-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  function getDeviceStatus(dev: Device): 'online' | 'offline' | 'disabled' | 'processing' {
    if (dev.revoked || dev.status === 'disabled') return 'disabled'
    if (!dev.last_seen) return 'offline'
    const diffMs = Date.now() - new Date(dev.last_seen).getTime()
    if (diffMs < 5 * 60 * 1000) return dev.status === 'processing' ? 'processing' : 'online'
    return 'offline'
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
    await supabase.from('audit_logs').insert({
      actor_id: user?.id, actor_role: 'admin',
      action: revoke ? 'device_revoked' : 'device_restored',
      resource_type: 'device', resource_id: dev.id,
      description: `Device ${dev.device_name} ${revoke ? 'revoked' : 'restored'}`,
    })
    toast(`Device ${revoke ? 'revoked' : 'restored'}`, revoke ? 'warning' : 'success')
    load()
  }

  const onlineCount = devices.filter(d => getDeviceStatus(d) === 'online').length

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Devices</h1>
        <p className="page-subtitle">{onlineCount} of {devices.length} devices currently online</p>
      </div>

      {/* Device Cards Grid */}
      <div className="device-grid" style={{ marginBottom: 'var(--space-6)' }}>
        {loading ? (
          Array(4).fill(0).map((_, i) => <div key={i} className="device-card"><div className="skeleton" style={{ height: 140 }} /></div>)
        ) : devices.length === 0 ? (
          <div style={{ gridColumn: '1/-1' }}>
            <div className="empty-state">
              <div className="empty-icon">📱</div>
              <div className="empty-title">No devices registered</div>
              <div className="empty-desc">Devices register automatically when operators log in for the first time on the Android app.</div>
            </div>
          </div>
        ) : devices.map(dev => {
          const status = getDeviceStatus(dev)
          return (
            <div key={dev.id} className="device-card" style={{ borderColor: status === 'online' ? 'rgba(34,197,94,0.3)' : undefined }}>
              <div className="device-card-header">
                <div className="device-icon">📱</div>
                <div>
                  <div className="device-name">{dev.device_name}</div>
                  <div className="device-id">{dev.device_identifier.slice(0, 16)}...</div>
                </div>
                <span className={`badge ${deviceStatusClass(status as Device['status'])}`} style={{ marginLeft: 'auto' }}>
                  {status.toUpperCase()}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: '0.8rem' }}>
                {[
                  ['Operator', (dev.operator as { username?: string })?.username ?? '—'],
                  ['Android', dev.android_version ?? '—'],
                  ['App Version', dev.app_version ?? '—'],
                  ['Gateway', dev.gateway_enabled ? '🟢 Enabled' : '🔴 Disabled'],
                  ['Last Seen', timeAgo(dev.last_seen)],
                  ['Registered', formatDateTime(dev.created_at)],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                    <span>{label}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>

              {dev.revoked && (
                <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', color: 'hsl(0,84%,65%)' }}>
                  🚫 Revoked — {timeAgo(dev.revoked_at)}
                </div>
              )}

              <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  className={`btn btn-sm ${dev.revoked ? 'btn-success' : 'btn-danger'}`}
                  style={{ flex: 1 }}
                  onClick={() => toggleRevoke(dev)}
                >
                  {dev.revoked ? '✅ Restore' : '🚫 Revoke'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Table view */}
      {devices.length > 0 && (
        <div className="card">
          <div className="card-header"><div className="card-title">All Devices</div></div>
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Device Name</th>
                  <th>Operator</th>
                  <th>Status</th>
                  <th>Gateway</th>
                  <th>Android</th>
                  <th>App Version</th>
                  <th>Last Seen</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.map(dev => {
                  const status = getDeviceStatus(dev)
                  return (
                    <tr key={dev.id}>
                      <td style={{ fontWeight: 600 }}>{dev.device_name}</td>
                      <td>{(dev.operator as { username?: string })?.username ?? '—'}</td>
                      <td><span className={`badge ${deviceStatusClass(status as Device['status'])}`}>{status.toUpperCase()}</span></td>
                      <td><span style={{ fontSize: '0.8rem' }}>{dev.gateway_enabled ? '🟢 ON' : '🔴 OFF'}</span></td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{dev.android_version ?? '—'}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{dev.app_version ?? '—'}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{timeAgo(dev.last_seen)}</td>
                      <td>
                        <button className={`btn btn-sm ${dev.revoked ? 'btn-success' : 'btn-danger'}`} onClick={() => toggleRevoke(dev)}>
                          {dev.revoked ? 'Restore' : 'Revoke'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
