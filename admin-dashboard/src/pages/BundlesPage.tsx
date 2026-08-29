import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { BundleRule } from '../types/database'
import { formatSLS, formatDate, profileStatusClass } from '../lib/utils'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

export default function BundlesPage() {
  const { toast } = useToast()
  const { isAdmin } = useAuth()
  const [bundles, setBundles] = useState<BundleRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<BundleRule | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<BundleRule | null>(null)
  const [form, setForm] = useState({
    amount_sls: '', bundle_name: '', data_amount: '', data_unit: 'GB' as 'GB' | 'MB',
    ussd_option: '', ussd_code: '', active: true, sort_order: '0',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('bundle_rules').select('*').order('sort_order').order('amount_sls')
    if (data) setBundles(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm({ amount_sls: '', bundle_name: '', data_amount: '', data_unit: 'GB', ussd_option: '', ussd_code: '', active: true, sort_order: '0' })
    setShowModal(true)
  }

  function openEdit(b: BundleRule) {
    setEditing(b)
    setForm({
      amount_sls:  String(b.amount_sls),
      bundle_name: b.bundle_name,
      data_amount: String(b.data_amount),
      data_unit:   b.data_unit,
      ussd_option: b.ussd_option,
      ussd_code:   b.ussd_code,
      active:      b.active,
      sort_order:  String(b.sort_order),
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.amount_sls || !form.bundle_name || !form.data_amount || !form.ussd_option || !form.ussd_code) {
      toast('All fields are required', 'error'); return
    }
    const amt = parseFloat(form.amount_sls)
    if (isNaN(amt) || amt <= 0) { toast('Invalid amount', 'error'); return }

    setSaving(true)
    try {
      const payload = {
        amount_sls:  amt,
        bundle_name: form.bundle_name,
        data_amount: parseFloat(form.data_amount),
        data_unit:   form.data_unit,
        ussd_option: form.ussd_option,
        ussd_code:   form.ussd_code,
        active:      form.active,
        sort_order:  parseInt(form.sort_order) || 0,
      }
      if (editing) {
        const { error } = await supabase.from('bundle_rules').update(payload).eq('id', editing.id)
        if (error) throw error
        toast('Bundle rule updated', 'success')
      } else {
        const { error } = await supabase.from('bundle_rules').insert(payload)
        if (error) {
          if (error.code === '23505') throw new Error('A bundle with this amount already exists.')
          throw error
        }
        toast('Bundle rule added', 'success')
      }
      setShowModal(false)
      load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast(msg || 'Failed to save bundle', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(b: BundleRule) {
    const { error } = await supabase.from('bundle_rules').delete().eq('id', b.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Bundle deleted', 'success')
    setDeleteConfirm(null)
    load()
  }

  async function toggleActive(b: BundleRule) {
    await supabase.from('bundle_rules').update({ active: !b.active }).eq('id', b.id)
    toast(`Bundle ${b.active ? 'disabled' : 'enabled'}`, 'success')
    load()
  }

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Bundle Rules</h1>
          <p className="page-subtitle">Configure amount → internet bundle → USSD code mappings</p>
        </div>
        {isAdmin && <button className="btn btn-primary" onClick={openCreate}>+ Add Bundle</button>}
      </div>

      {/* Info box */}
      <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4) var(--space-5)', marginBottom: 'var(--space-4)', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
        ℹ️ When a payment arrives, the system looks up the exact SLS amount to find the correct bundle and USSD code. Amounts must be exact — no rounding.
      </div>

      <div className="card">
        <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Amount (SLS)</th>
                <th>Bundle Name</th>
                <th>Data</th>
                <th>USSD Option</th>
                <th>USSD Code</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(4).fill(0).map((_, i) => <tr key={i}>{Array(8).fill(0).map((_, j) => <td key={j}><div className="skeleton" style={{ height: 14, width: 60 }} /></td>)}</tr>)
              ) : bundles.length === 0 ? (
                <tr><td colSpan={8}>
                  <div className="empty-state">
                    <div className="empty-icon">📦</div>
                    <div className="empty-title">No bundle rules configured</div>
                    <div className="empty-desc">Add at least one bundle rule to enable automatic recharge.</div>
                  </div>
                </td></tr>
              ) : bundles.map(b => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 700, fontSize: '1rem' }}>{formatSLS(b.amount_sls)}</td>
                  <td style={{ fontWeight: 600 }}>{b.bundle_name}</td>
                  <td>
                    <span style={{ fontWeight: 700, color: 'var(--brand-accent)', fontSize: '1rem' }}>
                      {b.data_amount}{b.data_unit}
                    </span>
                  </td>
                  <td className="table-mono">{b.ussd_option}</td>
                  <td className="table-mono" style={{ color: 'var(--brand-primary)' }}>{b.ussd_code}</td>
                  <td><span className={`badge ${profileStatusClass(b.active ? 'active' : 'disabled')}`}>{b.active ? 'ACTIVE' : 'DISABLED'}</span></td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(b.updated_at)}</td>
                    <td>
                    {isAdmin ? (
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(b)}>Edit</button>
                        <button className={`btn btn-sm ${b.active ? 'btn-danger' : 'btn-success'}`} onClick={() => toggleActive(b)}>
                          {b.active ? 'Disable' : 'Enable'}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(b)}>Delete</button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>View only</span>
                    )}
                    </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editing ? 'Edit Bundle Rule' : 'Add Bundle Rule'}</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount (SLS) *</label>
                  <input type="number" className="form-input" value={form.amount_sls} onChange={e => setForm(f => ({ ...f, amount_sls: e.target.value }))} placeholder="5500" />
                </div>
                <div className="form-group">
                  <label className="form-label">Bundle Name *</label>
                  <input className="form-input" value={form.bundle_name} onChange={e => setForm(f => ({ ...f, bundle_name: e.target.value }))} placeholder="1 GB Bundle" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Data Amount *</label>
                  <input type="number" className="form-input" value={form.data_amount} onChange={e => setForm(f => ({ ...f, data_amount: e.target.value }))} placeholder="1" />
                </div>
                <div className="form-group">
                  <label className="form-label">Unit *</label>
                  <select className="form-select" value={form.data_unit} onChange={e => setForm(f => ({ ...f, data_unit: e.target.value as 'GB' | 'MB' }))}>
                    <option value="GB">GB</option>
                    <option value="MB">MB</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">USSD Option *</label>
                  <input className="form-input" value={form.ussd_option} onChange={e => setForm(f => ({ ...f, ussd_option: e.target.value }))} placeholder="05" />
                  <span className="form-hint">The option number sent in the USSD flow.</span>
                </div>
                <div className="form-group">
                  <label className="form-label">USSD Code *</label>
                  <input className="form-input" value={form.ussd_code} onChange={e => setForm(f => ({ ...f, ussd_code: e.target.value }))} placeholder="*106*2*2*1*2*05#" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Sort Order</label>
                  <input type="number" className="form-input" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} />
                </div>
                <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                  <label className="form-label">Active</label>
                  <label className="toggle-wrapper">
                    <div className={`toggle-track${form.active ? ' on' : ''}`} onClick={() => setForm(f => ({ ...f, active: !f.active }))}>
                      <div className="toggle-thumb" />
                    </div>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{form.active ? 'Active' : 'Disabled'}</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Bundle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div className="modal-title">Delete Bundle Rule</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDeleteConfirm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)' }}>
                Delete the <strong style={{ color: 'var(--text-primary)' }}>{deleteConfirm.bundle_name}</strong> ({formatSLS(deleteConfirm.amount_sls)}) rule?
                <br /><br />Future payments of this amount will not be automatically recharged.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" style={{ background: 'var(--brand-danger)', color: 'white' }} onClick={() => handleDelete(deleteConfirm)}>Delete Bundle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
