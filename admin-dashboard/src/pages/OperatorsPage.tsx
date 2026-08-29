import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Operator, Profile } from '../types/database'
import { formatDate, formatDateTime, profileStatusClass } from '../lib/utils'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

// Flask admin API — handles privileged Supabase Auth operations
const ADMIN_API_URL = ''

interface OperatorWithProfile extends Operator {
  profile: Profile
  device_count?: number
  transaction_count?: number
}

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

  // Form state
  const [form, setForm] = useState({
    full_name: '', username: '', email: '', password: '', phone_number: '', notes: '',
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
    setForm({ full_name: '', username: '', email: '', password: '', phone_number: '', notes: '' })
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
        const { error: opErr } = await supabase.from('operators').update({
          username: form.username,
          notes: form.notes || null,
        }).eq('id', editing.id)
        if (opErr) throw opErr

        // Log audit
        await supabase.from('audit_logs').insert({
          actor_id: user?.id, actor_role: 'admin', action: 'operator_updated',
          resource_type: 'operator', resource_id: editing.id,
          description: `Updated operator ${form.username}`,
        })
        toast('Operator updated', 'success')
      } else {
        // Create new user via Flask admin API (requires service_role key)
        if (!form.email || !form.password) {
          toast('Email and password required for new operator', 'error'); setSaving(false); return
        }

        // Get current session JWT to authenticate with Flask API
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Not authenticated')

        const res = await fetch(`/api/operators`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email:        form.email,
            password:     form.password,
            full_name:    form.full_name,
            username:     form.username,
            phone_number: form.phone_number || null,
            notes:        form.notes || null,
            actor_id:     user?.id,
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }))
          throw new Error(err.error || 'Failed to create operator')
        }

        toast('Operator created successfully', 'success')
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
      // Reset password via Flask admin API (requires service_role key)
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
    if (!window.confirm(`Are you sure you want to PERMANENTLY delete operator ${op.username}?\nThis will delete their login account and all associated operator settings.\nTransactions and audit logs will remain but their reference to this operator may be lost.`)) {
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const res = await fetch(`/api/operators/${op.profile_id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          actor_id: user?.id,
          username: op.username
        }),
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

  const filtered = operators.filter(op =>
    !search ||
    op.username.toLowerCase().includes(search.toLowerCase()) ||
    op.profile?.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Operators</h1>
          <p className="page-subtitle">{operators.length} operator accounts</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Create Operator</button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input className="search-input" placeholder="Search operators..." value={search} onChange={e => setSearch(e.target.value)} />
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
                Array(5).fill(0).map((_, i) => <tr key={i}>{Array(6).fill(0).map((_, j) => <td key={j}><div className="skeleton" style={{ height: 14, width: 80 }} /></td>)}</tr>)
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-icon">👤</div>
                    <div className="empty-title">No operators yet</div>
                    <div className="empty-desc">Create your first operator account to get started.</div>
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
                      <button className={`btn btn-sm ${op.profile?.status === 'active' ? 'btn-danger' : 'btn-success'}`} onClick={() => toggleStatus(op)}>
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

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editing ? 'Edit Operator' : 'Create Operator'}</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input className="form-input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Ahmed Ali" />
              </div>
              <div className="form-group">
                <label className="form-label">Username *</label>
                <input className="form-input" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="ahmed01" />
              </div>
              {!editing && (
                <>
                  <div className="form-group">
                    <label className="form-label">Email *</label>
                    <input type="email" className="form-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="ahmed@shube.so" />
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
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." style={{ minHeight: 70 }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
                {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving...</> : editing ? 'Save Changes' : 'Create Operator'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
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
