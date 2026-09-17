import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Operator, Profile } from '../types/database'
import { formatDate, profileStatusClass } from '../lib/utils'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

interface OperatorWithProfile extends Operator {
  profile: Profile
  device_count?: number
  transaction_count?: number
  app_type?: 'shube' | 'geesh'
}

type AppTab = 'shube' | 'geesh'

export default function OperatorsPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const [operators, setOperators] = useState<OperatorWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<OperatorWithProfile | null>(null)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [showResetModal, setShowResetModal] = useState<OperatorWithProfile | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [activeTab, setActiveTab] = useState<AppTab>('shube')

  // Form state
  const [form, setForm] = useState({
    full_name: '', username: '', email: '', password: '', phone_number: '', notes: ''
  })

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('operators')
      .select(`*, profile:profiles!operators_profile_id_fkey(*)`)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase fetch error:', error)
      toast(error.message, 'error')
    }

    if (data) setOperators(data as OperatorWithProfile[])
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm({
      full_name: '', username: '', email: '', password: '', phone_number: '', notes: ''
    })
    setShowModal(true)
  }

  function openEdit(op: OperatorWithProfile) {
    setEditing(op)
    setForm({
      full_name: op.profile?.full_name ?? '',
      username: op.username,
      email: '',
      password: '',
      phone_number: op.profile?.phone_number ?? '',
      notes: op.notes ?? '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.full_name || !form.username) {
      toast('Full name and username are required', 'error'); return
    }
    setSaving(true)
    try {
      if (editing) {
        // Update profile
        const { error: profErr } = await supabase.from('profiles').update({
          full_name: form.full_name,
          phone_number: form.phone_number || null,
        }).eq('id', editing.profile_id)
        if (profErr) throw profErr

        // Update operator
        const updatePayload: Record<string, unknown> = {
          username: form.username,
          notes: form.notes || null,
        }
        const { error: opErr } = await supabase.from('operators').update(updatePayload).eq('id', editing.id)
        if (opErr) throw opErr

        await supabase.from('audit_logs').insert({
          actor_id: user?.id, actor_role: 'admin', action: 'operator_updated',
          resource_type: 'operator', resource_id: editing.id,
          description: `Updated operator ${form.username}`,
        })
        toast('Operator updated', 'success')
      } else {
        // Create new operator via admin API
        if (!form.password) {
          toast('Password required for new operator', 'error'); setSaving(false); return
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Not authenticated')

        const body: Record<string, unknown> = {
          email:        form.email,
          password:     form.password,
          full_name:    form.full_name,
          username:     form.username,
          phone_number: form.phone_number || null,
          notes:        form.notes || null,
          actor_id:     user?.id,
          app_type:     activeTab,
        }
        const res = await fetch(`/api/operators`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }))
          throw new Error(err.error || 'Failed to create operator')
        }

        toast(`${activeTab === 'geesh' ? 'Sarif Operator' : 'Operator'} created successfully`, 'success')
      }
      setShowModal(false)
      load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast(msg || 'Failed to save operator', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(op: OperatorWithProfile) {
    const newStatus = op.profile.status === 'active' ? 'disabled' : 'active'
    const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', op.profile_id)
    if (error) { toast(error.message, 'error'); return }
    await supabase.from('audit_logs').insert({
      actor_id: user?.id, actor_role: 'admin',
      action: newStatus === 'disabled' ? 'operator_disabled' : 'operator_enabled',
      resource_type: 'operator', resource_id: op.id,
      description: `Operator ${op.username} ${newStatus}`,
    })
    toast(`Operator ${newStatus === 'disabled' ? 'disabled' : 'enabled'}`, 'success')
    load()
  }

  async function handleResetPassword() {
    if (!showResetModal || !newPassword || newPassword.length < 8) {
      toast('Password must be at least 8 characters', 'error'); return
    }
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const res = await fetch(`/api/operators/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          profile_id:  showResetModal.profile_id,
          password:    newPassword,
          username:    showResetModal.username,
          operator_id: showResetModal.id,
          actor_id:    user?.id,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || 'Failed to reset password')
      }

      toast('Password reset successfully', 'success')
      setShowResetModal(null)
      setNewPassword('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast(msg || 'Failed to reset password', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteOperator(op: OperatorWithProfile) {
    if (!window.confirm(
      `Are you sure you want to PERMANENTLY delete operator ${op.username}?\nThis will delete their login account and all associated operator settings.\nTransactions and audit logs will remain but their reference to this operator may be lost.`
    )) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const res = await fetch(`/api/operators/${op.profile_id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ actor_id: user?.id, username: op.username }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || 'Failed to delete operator')
      }

      toast('Operator deleted successfully', 'success')
      load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast(msg || 'Failed to delete operator', 'error')
    }
  }

  // Filter by active tab (app_type). Operators with no app_type default to 'shube'.
  const tabOperators = operators.filter(op => {
    const type = op.app_type || 'shube'
    return type === activeTab
  })

  const filtered = tabOperators.filter(op =>
    !search ||
    op.username.toLowerCase().includes(search.toLowerCase()) ||
    op.profile?.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  const shubCount = operators.filter(op => (op.app_type || 'shube') === 'shube').length
  const geeshCount = operators.filter(op => op.app_type === 'geesh').length

  const isGeesh = activeTab === 'geesh'

  return (
    <div className="page-container">
      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Operators</h1>
          <p className="page-subtitle">Manage all operator accounts</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + {isGeesh ? 'Create Sarif Operator' : 'Create Operator'}
        </button>
      </div>

      {/* ── Tab Switcher ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 'var(--space-4)', borderBottom: '2px solid var(--border-subtle)' }}>
        <button
          onClick={() => setActiveTab('shube')}
          style={{
            padding: 'var(--space-3) var(--space-5)',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'shube' ? '2px solid var(--brand-primary)' : '2px solid transparent',
            marginBottom: -2,
            color: activeTab === 'shube' ? 'var(--brand-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'shube' ? 700 : 400,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            transition: 'all 0.15s ease',
          }}
        >
          📱 Operator App
          <span style={{
            background: activeTab === 'shube' ? 'var(--brand-primary)' : 'var(--bg-surface-2)',
            color: activeTab === 'shube' ? '#fff' : 'var(--text-muted)',
            borderRadius: 99,
            padding: '1px 8px',
            fontSize: '0.75rem',
            fontWeight: 600,
          }}>{shubCount}</span>
        </button>

        <button
          onClick={() => setActiveTab('geesh')}
          style={{
            padding: 'var(--space-3) var(--space-5)',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'geesh' ? '2px solid var(--brand-success)' : '2px solid transparent',
            marginBottom: -2,
            color: activeTab === 'geesh' ? 'var(--brand-success)' : 'var(--text-muted)',
            fontWeight: activeTab === 'geesh' ? 700 : 400,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            transition: 'all 0.15s ease',
          }}
        >
          💱 Sarif Operator
          <span style={{
            background: activeTab === 'geesh' ? 'var(--brand-success)' : 'var(--bg-surface-2)',
            color: activeTab === 'geesh' ? '#fff' : 'var(--text-muted)',
            borderRadius: 99,
            padding: '1px 8px',
            fontSize: '0.75rem',
            fontWeight: 600,
          }}>{geeshCount}</span>
        </button>
      </div>

      {/* ── Tab Description ──────────────────────────────────── */}
      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        background: isGeesh ? 'rgba(16,185,129,0.07)' : 'rgba(99,102,241,0.07)',
        border: `1px solid ${isGeesh ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.2)'}`,
        borderRadius: 'var(--radius-md)',
        fontSize: '0.85rem',
        color: 'var(--text-secondary)',
        marginBottom: 'var(--space-4)',
      }}>
        {isGeesh ? (
          <>
            <strong style={{ color: 'var(--brand-success)' }}>💱 Sarif Operator</strong>
            {' '}— Accountiyadan waxaa isticmaala <strong>Geesh App</strong>-ka. Halkan ayaa laga sameeyo xisaabaadkooda.
          </>
        ) : (
          <>
            <strong style={{ color: 'var(--brand-primary)' }}>📱 Operator App</strong>
            {' '}— Accountiyadan waxaa isticmaala <strong>Shube Android App</strong>-ka si ay lacag u xawilaan.
          </>
        )}
      </div>

      {/* ── Operators Table ──────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              placeholder={`Search ${isGeesh ? 'Sarif Operators' : 'Operators'}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="table-wrapper" style={{ borderRadius: 0, border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>{Array(6).fill(0).map((_, j) => (
                    <td key={j}><div className="skeleton" style={{ height: 14, width: 80 }} /></td>
                  ))}</tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-icon">{isGeesh ? '💱' : '📱'}</div>
                    <div className="empty-title">
                      {isGeesh ? 'No Sarif Operators yet' : 'No Operators yet'}
                    </div>
                    <div className="empty-desc">
                      {isGeesh
                        ? 'Create a Sarif Operator account to give access to Geesh App.'
                        : 'Create an Operator account to give access to Shube Android App.'}
                    </div>
                  </div>
                </td></tr>
              ) : filtered.map(op => (
                <tr key={op.id}>
                  <td style={{ fontWeight: 600 }}>{op.profile?.full_name}</td>
                  <td className="table-mono">{op.username}</td>
                  <td style={{ fontSize: '0.8rem' }}>{op.profile?.phone_number ?? '—'}</td>
                  <td>
                    <span className={`badge ${profileStatusClass(op.profile?.status ?? 'active')}`}>
                      {op.profile?.status?.toUpperCase() ?? 'ACTIVE'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(op.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(op)}>Edit</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setShowResetModal(op); setNewPassword('') }}>Reset PW</button>
                      <button
                        className={`btn btn-sm ${op.profile?.status === 'active' ? 'btn-danger' : 'btn-success'}`}
                        onClick={() => toggleStatus(op)}
                      >
                        {op.profile?.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteOperator(op)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create / Edit Modal ──────────────────────────────── */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                {editing
                  ? `Edit ${isGeesh ? 'Sarif Operator' : 'Operator'}`
                  : `Create ${isGeesh ? 'Sarif Operator' : 'Operator'}`}
              </div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* App type badge */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px',
                background: isGeesh ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.12)',
                color: isGeesh ? 'var(--brand-success)' : 'var(--brand-primary)',
                borderRadius: 99, fontSize: '0.8rem', fontWeight: 600,
                marginBottom: 'var(--space-4)',
              }}>
                {isGeesh ? '💱 Sarif Operator (Geesh App)' : '📱 Operator App (Shube)'}
              </div>

              {isGeesh && (
                <>
                  <div className="form-group">
                    <label className="form-label">Full Name *</label>
                    <input className="form-input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Ahmed Ali" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Username *</label>
                    <input className="form-input" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="ahmed01" />
                  </div>
                </>
              )}
              {!editing && (
                <>
                  <div className="form-group">
                    <label className="form-label">Email {isGeesh ? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional — auto-generated if empty)</span> : '*'}</label>
                    <input className="form-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder={`operator@${isGeesh ? 'geesh' : 'shube'}.app`} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Temporary Password *</label>
                    <input type="password" className="form-input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 8 characters" />
                    <span className="form-hint">Operator will be prompted to change this on first login.</span>
                  </div>
                </>
              )}
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input className="form-input" value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} placeholder="0634xxxxxx" />
              </div>
              {isGeesh && (
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." style={{ minHeight: 70 }} />
                </div>
              )}

              {/* USSD Config removed as per user request */}
              {/* Geesh note */}
              {isGeesh && (
                <div style={{
                  marginTop: 'var(--space-3)',
                  padding: 'var(--space-3)',
                  background: 'rgba(16,185,129,0.07)',
                  border: '1px solid rgba(16,185,129,0.2)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.82rem',
                  color: 'var(--text-secondary)',
                }}>
                  💡 Sarif Operator accountigan waxaa lagu gali doonaa <strong>Geesh App</strong>-ka. Xisaabtan ka dib isticmaaluhu waxa uu gali doonaa app-ka adeegsanaya username-ka iyo password-ka aad sameysay.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
                {saving
                  ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving...</>
                  : editing ? 'Save Changes' : `Create ${isGeesh ? 'Sarif Operator' : 'Operator'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Password Modal ─────────────────────────────── */}
      {showResetModal && (
        <div className="modal-backdrop" onClick={() => setShowResetModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div className="modal-title">Reset Password — {showResetModal.username}</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowResetModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ padding: 'var(--space-3)', background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'hsl(38,92%,55%)', marginBottom: 'var(--space-4)' }}>
                ⚠️ The operator will be required to change this password on next login.
              </div>
              <div className="form-group">
                <label className="form-label">New Temporary Password</label>
                <input type="password" className="form-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 8 characters" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowResetModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleResetPassword}>
                {saving ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
