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
    ussd_option: '', ussd_code: '', ussd_replies: [] as string[], active: true, sort_order: '0',
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
    setForm({ amount_sls: '', bundle_name: '', data_amount: '', data_unit: 'GB', ussd_option: '', ussd_code: '', ussd_replies: [], active: true, sort_order: '0' })
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
      ussd_replies: b.ussd_replies || [],
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
        ussd_replies: form.ussd_replies,
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
        <button className="btn btn-primary" onClick={openCreate}>+ Add Bundle</button>
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
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(b)}>Edit</button>
                        <button className={`btn btn-sm ${b.active ? 'btn-danger' : 'btn-success'}`} onClick={() => toggleActive(b)}>
                          {b.active ? 'Disable' : 'Enable'}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(b)}>Delete</button>
                      </div>
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
                  <span className="form-hint">e.g. 05 or 1</span>
                </div>
                <div className="form-group">
                  <label className="form-label">USSD Code / Template *</label>
                  <input className="form-input" style={{ fontFamily: 'monospace' }} value={form.ussd_code} onChange={e => setForm(f => ({ ...f, ussd_code: e.target.value }))} placeholder="*21*{somtel_number}*05*{pin}#" />
                  <span className="form-hint">Supports <code>{'{somtel_number}'}</code>, <code>{'{pin}'}</code>, <code>{'{bundle_option}'}</code></span>
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 'var(--space-2)' }}>
                <label className="form-label">Tallaabooyinka Xiga (Follow-up Replies)</label>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                  Halkan ku dar haddii xirmadani u baahan tahay in la sii doorto nambaro is xiga marka la garaaco koodhka kore (Tusaale: Reply 1, ka dib Reply 3, iwm).
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {form.ussd_replies.map((reply, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <input 
                        className="form-input" 
                        value={reply} 
                        onChange={e => {
                          const newReplies = [...form.ussd_replies]
                          newReplies[idx] = e.target.value
                          setForm(f => ({ ...f, ussd_replies: newReplies }))
                        }}
                        placeholder={`Reply ${idx + 1} (Tusaale: 1)`} 
                        style={{ fontFamily: 'monospace' }} 
                      />
                      <button className="btn btn-secondary btn-icon" onClick={() => {
                        const newReplies = form.ussd_replies.filter((_, i) => i !== idx)
                        setForm(f => ({ ...f, ussd_replies: newReplies }))
                      }}>✕</button>
                    </div>
                  ))}
                </div>
                <button 
                  className="btn btn-secondary btn-sm" 
                  style={{ marginTop: 'var(--space-2)', alignSelf: 'flex-start' }}
                  onClick={() => setForm(f => ({ ...f, ussd_replies: [...f.ussd_replies, ''] }))}
                >
                  + Ku dar Reply (Tusaale: 1)
                </button>
              </div>
              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group" style={{ justifyContent: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Active</label>
                  <label className="toggle-wrapper">
                    <div className={`toggle-track${form.active ? ' on' : ''}`} onClick={() => setForm(f => ({ ...f, active: !f.active }))}>
                      <div className="toggle-thumb" />
                    </div>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{form.active ? 'Wuu furan yahay' : 'Wuu xidhan yahay'}</span>
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
