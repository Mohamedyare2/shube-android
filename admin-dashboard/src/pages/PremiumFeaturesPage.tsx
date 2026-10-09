import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { formatDate } from '../lib/utils'
import type { Operator, Profile, FeatureAccessStatus, OperatorFeatureAccess, OperatorFeatureHistory } from '../types/database'

interface OperatorWithAccess extends Operator {
  profile: Profile
  feature_access?: OperatorFeatureAccess | null
}

export default function PremiumFeaturesPage() {
  const { user, isAdmin } = useAuth()
  const { toast } = useToast()

  const [operators, setOperators] = useState<OperatorWithAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | FeatureAccessStatus>('all')

  // Grant / Update Modal State
  const [targetOperator, setTargetOperator] = useState<OperatorWithAccess | null>(null)
  const [modalMode, setModalMode] = useState<'grant' | 'suspend' | 'revoke' | null>(null)
  const [paymentReference, setPaymentReference] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [notes, setNotes] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [saving, setSaving] = useState(false)

  // History Modal State
  const [historyOperator, setHistoryOperator] = useState<OperatorWithAccess | null>(null)
  const [historyLogs, setHistoryLogs] = useState<OperatorFeatureHistory[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Fetch operators with profile
      const { data: ops, error: opError } = await supabase
        .from('operators')
        .select(`*, profile:profiles!operators_profile_id_fkey(*)`)
        .order('created_at', { ascending: false })

      if (opError) throw opError

      // 2. Fetch feature access for all operators
      let accessMap = new Map<string, OperatorFeatureAccess>()
      try {
        const { data: accessData } = await supabase
          .from('operator_feature_access')
          .select(`*, granter:profiles!operator_feature_access_granted_by_fkey(full_name)`)
          .eq('feature_key', 'registration_via_link')

        if (accessData) {
          accessData.forEach((a: OperatorFeatureAccess) => {
            accessMap.set(a.operator_id, a)
          })
        }
      } catch (err) {
        console.warn('Could not query operator_feature_access (migration may not be applied yet):', err)
      }

      const merged: OperatorWithAccess[] = (ops || []).map(o => {
        const fa = accessMap.get(o.id) || null
        return {
          ...o,
          feature_access: fa,
        }
      })

      setOperators(merged)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to load operators', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  // Open Grant Modal
  function openGrant(op: OperatorWithAccess) {
    setTargetOperator(op)
    setModalMode('grant')
    setPaymentReference(op.feature_access?.payment_reference || '')
    setExpiresAt(op.feature_access?.expires_at ? op.feature_access.expires_at.split('T')[0] : '')
    setNotes(op.feature_access?.notes || '')
    setActionReason('')
  }

  // Open Suspend/Revoke Modal
  function openAction(op: OperatorWithAccess, mode: 'suspend' | 'revoke') {
    setTargetOperator(op)
    setModalMode(mode)
    setActionReason('')
  }

  // Handle Save Status Change
  async function handleConfirmAction() {
    if (!targetOperator || !user?.id) return
    setSaving(true)

    const opId = targetOperator.id
    const prevStatus = targetOperator.feature_access?.status || 'inactive'
    let newStatus: FeatureAccessStatus = 'active'
    let actionType: 'granted' | 'revoked' | 'suspended' = 'granted'

    if (modalMode === 'suspend') {
      newStatus = 'suspended'
      actionType = 'suspended'
    } else if (modalMode === 'revoke') {
      newStatus = 'inactive'
      actionType = 'revoked'
    } else {
      newStatus = 'active'
      actionType = 'granted'
      if (!paymentReference.trim()) {
        toast('Fadlan geli Payment Reference (Tusaale: Zaad Trx ID / Waafi / Kaash)', 'error')
        setSaving(false)
        return
      }
    }

    try {
      const nowIso = new Date().toISOString()
      const payload: Partial<OperatorFeatureAccess> = {
        operator_id: opId,
        feature_key: 'registration_via_link',
        status: newStatus,
        payment_reference: modalMode === 'grant' ? paymentReference.trim() : targetOperator.feature_access?.payment_reference || null,
        notes: modalMode === 'grant' ? notes.trim() : (actionReason.trim() || targetOperator.feature_access?.notes || null),
        updated_at: nowIso,
      }

      if (newStatus === 'active') {
        payload.granted_by = user.id
        payload.granted_at = nowIso
        payload.expires_at = expiresAt ? new Date(expiresAt).toISOString() : null
        payload.revoked_at = null
        payload.revoked_by = null
      } else {
        payload.revoked_at = nowIso
        payload.revoked_by = user.id
      }

      // Upsert into operator_feature_access
      const { error: upsertErr } = await supabase
        .from('operator_feature_access')
        .upsert(payload, { onConflict: 'operator_id,feature_key' })

      if (upsertErr) throw upsertErr

      // Log into operator_feature_history
      try {
        await supabase.from('operator_feature_history').insert({
          operator_id: opId,
          feature_key: 'registration_via_link',
          action: actionType,
          previous_status: prevStatus,
          new_status: newStatus,
          payment_reference: payload.payment_reference || null,
          reason: actionReason.trim() || notes.trim() || (newStatus === 'active' ? 'Authorized by Super Admin' : 'Revoked by Super Admin'),
          performed_by: user.id,
        })
      } catch (hErr) {
        console.warn('Could not record operator_feature_history:', hErr)
      }

      // Audit log entry
      try {
        await supabase.from('audit_logs').insert({
          actor_id: user.id,
          actor_role: 'admin',
          action: `feature_${actionType}`,
          resource_type: 'operator_feature_access',
          resource_id: opId,
          description: `${actionType.toUpperCase()} Registration via Link for ${targetOperator.username} (${newStatus})`,
        })
      } catch (_) {}

      toast(`Feature ${newStatus.toUpperCase()} successfully for ${targetOperator.username}!`, 'success')
      setTargetOperator(null)
      setModalMode(null)
      load()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Action failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Load and show history modal
  async function openHistory(op: OperatorWithAccess) {
    setHistoryOperator(op)
    setLoadingHistory(true)
    try {
      const { data, error } = await supabase
        .from('operator_feature_history')
        .select(`*, performer:profiles!operator_feature_history_performed_by_fkey(full_name)`)
        .eq('operator_id', op.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setHistoryLogs((data as OperatorFeatureHistory[]) || [])
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to load history', 'error')
      setHistoryLogs([])
    } finally {
      setLoadingHistory(false)
    }
  }

  // Compute effective status for each operator
  function getEffectiveStatus(op: OperatorWithAccess): FeatureAccessStatus {
    const access = op.feature_access
    if (!access || !access.status) return 'inactive'
    if (access.status === 'active' && access.expires_at) {
      if (new Date(access.expires_at).getTime() < Date.now()) {
        return 'expired'
      }
    }
    return access.status
  }

  // Filtered operators
  const filtered = operators.filter(op => {
    const effStatus = getEffectiveStatus(op)
    if (statusFilter !== 'all' && effStatus !== statusFilter) return false
    if (!search.trim()) return true
    const term = search.toLowerCase()
    return (
      op.username.toLowerCase().includes(term) ||
      (op.profile?.full_name || '').toLowerCase().includes(term) ||
      op.id.toLowerCase().includes(term) ||
      (op.feature_access?.payment_reference || '').toLowerCase().includes(term)
    )
  })

  // Badge styling
  function renderStatusBadge(status: FeatureAccessStatus) {
    switch (status) {
      case 'active':
        return <span className="badge badge-success">ACTIVE (PAID)</span>
      case 'suspended':
        return <span className="badge badge-danger">SUSPENDED</span>
      case 'expired':
        return <span className="badge" style={{ background: '#f59e0b', color: '#fff' }}>EXPIRED</span>
      default:
        return <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>INACTIVE</span>
    }
  }

  if (!isAdmin) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-icon">🔒</div>
          <div className="empty-title">Access Denied</div>
          <div className="empty-desc">Only Super Admins can manage premium features.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.5rem' }}>⭐</span>
            <h1 className="page-title">Premium Features: Registration via Link</h1>
          </div>
          <p className="page-subtitle">
            Authorize and manage paid access to the Customer Registration Link feature for individual operators.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-bar" style={{ flex: 1, minWidth: 260 }}>
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              placeholder="Search operator name, username, ID, or payment ref..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['all', 'active', 'inactive', 'suspended', 'expired'] as const).map(s => (
              <button
                key={s}
                className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStatusFilter(s)}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Operator</th>
                <th>Status</th>
                <th>Payment Reference</th>
                <th>Activated / Expiration</th>
                <th>Authorized By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(6).fill(0).map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 16, width: 90 }} /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <div className="empty-icon">👥</div>
                      <div className="empty-title">No operators match the filter</div>
                      <div className="empty-desc">Try clearing your search or status filter.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(op => {
                  const effStatus = getEffectiveStatus(op)
                  const access = op.feature_access

                  return (
                    <tr key={op.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {op.profile?.full_name || op.username}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          @{op.username}
                        </div>
                      </td>
                      <td>{renderStatusBadge(effStatus)}</td>
                      <td>
                        {access?.payment_reference ? (
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--brand-accent)' }}>
                            {access.payment_reference}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        {access?.granted_at ? (
                          <div>
                            <div>Active: {formatDate(access.granted_at)}</div>
                            {access.expires_at ? (
                              <div style={{ color: effStatus === 'expired' ? '#ef4444' : 'var(--text-muted)' }}>
                                Expires: {formatDate(access.expires_at)}
                              </div>
                            ) : (
                              <div style={{ color: '#10b981' }}>Permanent (No expiry)</div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Not activated</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {access?.granter?.full_name || (access?.granted_by ? 'Admin' : '—')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {effStatus !== 'active' ? (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => openGrant(op)}
                            >
                              ⭐ Grant Access
                            </button>
                          ) : (
                            <>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => openGrant(op)}
                              >
                                ✏️ Edit
                              </button>
                              <button
                                className="btn btn-sm"
                                style={{ background: '#f59e0b', color: '#fff', border: 'none' }}
                                onClick={() => openAction(op, 'suspend')}
                              >
                                ⏸️ Suspend
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => openAction(op, 'revoke')}
                              >
                                🚫 Revoke
                              </button>
                            </>
                          )}
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openHistory(op)}
                          >
                            📜 History
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Grant / Update Access Modal ──────────────────────────────── */}
      {targetOperator && modalMode === 'grant' && (
        <div className="modal-backdrop" onClick={() => setTargetOperator(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div className="modal-title">
                ⭐ Grant Registration via Link: {targetOperator.profile?.full_name || targetOperator.username}
              </div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setTargetOperator(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: 10, marginBottom: 18, fontSize: '0.875rem' }}>
                ℹ️ <strong>Super Admin Authorization:</strong> Only activate this feature after confirming payment or agreement with the operator. Once activated, the operator can generate public registration links and customers can self-register.
              </div>

              <div className="form-group">
                <label className="form-label">Payment Reference * (Required)</label>
                <input
                  className="form-input"
                  placeholder="e.g. ZAAD-TRX-94821 or Cash Payment"
                  value={paymentReference}
                  onChange={e => setPaymentReference(e.target.value)}
                  required
                />
                <span className="form-hint">Record proof of payment or transaction ID.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Expiration Date (Optional)</label>
                <input
                  className="form-input"
                  type="date"
                  value={expiresAt}
                  onChange={e => setExpiresAt(e.target.value)}
                />
                <span className="form-hint">Leave blank for permanent access with no expiration.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Admin Notes</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="e.g. 1-Month Plan paid by Waafi..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setTargetOperator(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleConfirmAction}>
                {saving ? 'Authorizing...' : '✅ Confirm & Grant Access'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Suspend / Revoke Confirmation Modal ──────────────────────── */}
      {targetOperator && (modalMode === 'suspend' || modalMode === 'revoke') && (
        <div className="modal-backdrop" onClick={() => setTargetOperator(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ color: 'var(--brand-danger)' }}>
                {modalMode === 'suspend' ? '⏸️ Suspend Feature Access' : '🚫 Revoke Feature Access'}
              </div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setTargetOperator(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
                Are you sure you want to {modalMode} Registration via Link for{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{targetOperator.username}</strong>?
                <br /><br />
                <strong>Effect:</strong> The operator's public registration links will immediately stop accepting new registrations, and the feature will be locked in their dashboard.
              </p>

              <div className="form-group">
                <label className="form-label">Reason for {modalMode === 'suspend' ? 'Suspension' : 'Revocation'}</label>
                <input
                  className="form-input"
                  placeholder="e.g. Subscription expired / Non-payment / Request by operator"
                  value={actionReason}
                  onChange={e => setActionReason(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setTargetOperator(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                disabled={saving}
                onClick={handleConfirmAction}
              >
                {saving ? 'Processing...' : `Confirm ${modalMode === 'suspend' ? 'Suspension' : 'Revocation'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── History Modal ───────────────────────────────────────────── */}
      {historyOperator && (
        <div className="modal-backdrop" onClick={() => setHistoryOperator(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div className="modal-title">
                📜 Access History: {historyOperator.username}
              </div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setHistoryOperator(null)}>✕</button>
            </div>
            <div className="modal-body">
              {loadingHistory ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading history...</div>
              ) : historyLogs.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-desc">No past history recorded yet for this operator.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {historyLogs.map(log => (
                    <div
                      key={log.id}
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 10,
                        padding: '12px 16px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.85rem' }}>
                          {log.action === 'granted' ? '⭐ Granted / Activated' : log.action === 'suspended' ? '⏸️ Suspended' : '🚫 Revoked'}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDate(log.created_at)}</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Status: <strong>{log.previous_status || 'none'}</strong> → <strong style={{ color: 'var(--brand-accent)' }}>{log.new_status}</strong>
                      </div>
                      {log.payment_reference && (
                        <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                          Payment Ref: <code style={{ color: 'var(--brand-accent)' }}>{log.payment_reference}</code>
                        </div>
                      )}
                      {log.reason && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
                          Reason: {log.reason}
                        </div>
                      )}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        By: {log.performer?.full_name || 'Super Admin'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setHistoryOperator(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
