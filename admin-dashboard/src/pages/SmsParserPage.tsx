import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { SmsParserConfig } from '../types/database'
import { formatDate, profileStatusClass } from '../lib/utils'
import { useToast } from '../contexts/ToastContext'

export default function SmsParserPage() {
  const { toast } = useToast()
  const [parsers, setParsers] = useState<SmsParserConfig[]>([])
  const [loading, setLoading] = useState(true)
  
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<SmsParserConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<SmsParserConfig | null>(null)
  
  const [form, setForm] = useState({
    name: '',
    description: '',
    sender_pattern: '',
    amount_pattern: '',
    currency_pattern: '',
    txn_id_pattern: '',
    active: true,
    priority: '0'
  })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('sms_parser_config').select('*').order('priority', { ascending: false })
    if (data) setParsers(data as SmsParserConfig[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm({
      name: '',
      description: '',
      sender_pattern: '',
      amount_pattern: '(\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?)\\s*SLS',
      currency_pattern: 'SLS',
      txn_id_pattern: 'Ref[:\\s]+([A-Za-z0-9]+)',
      active: true,
      priority: '0'
    })
    setShowModal(true)
  }

  function openEdit(p: SmsParserConfig) {
    setEditing(p)
    setForm({
      name: p.name,
      description: p.description || '',
      sender_pattern: p.sender_pattern || '',
      amount_pattern: p.amount_pattern,
      currency_pattern: p.currency_pattern,
      txn_id_pattern: p.txn_id_pattern || '',
      active: p.active,
      priority: String(p.priority)
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name || !form.amount_pattern || !form.currency_pattern) {
      toast('Name, Amount Pattern, and Currency Pattern are required', 'error')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        sender_pattern: form.sender_pattern || null,
        amount_pattern: form.amount_pattern,
        currency_pattern: form.currency_pattern,
        txn_id_pattern: form.txn_id_pattern || null,
        active: form.active,
        priority: parseInt(form.priority) || 0
      }

      if (editing) {
        const { error } = await supabase.from('sms_parser_config').update(payload).eq('id', editing.id)
        if (error) throw error
        toast('SMS Parser updated', 'success')
      } else {
        const { error } = await supabase.from('sms_parser_config').insert(payload)
        if (error) throw error
        toast('SMS Parser added', 'success')
      }
      
      setShowModal(false)
      load()
    } catch (err: any) {
      toast(err.message || 'Failed to save parser configuration', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(p: SmsParserConfig) {
    const { error } = await supabase.from('sms_parser_config').delete().eq('id', p.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Parser deleted', 'success')
    setDeleteConfirm(null)
    load()
  }

  async function toggleActive(p: SmsParserConfig) {
    await supabase.from('sms_parser_config').update({ active: !p.active }).eq('id', p.id)
    toast(`Parser ${p.active ? 'disabled' : 'enabled'}`, 'success')
    load()
  }

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">SMS Parser Configuration</h1>
          <p className="page-subtitle">Configure regex patterns to extract payment details from incoming SMS</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Parser</button>
      </div>

      <div className="card">
        <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Name / Priority</th>
                <th>Sender Pattern</th>
                <th>Amount Pattern</th>
                <th>Txn ID Pattern</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(3).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(7).fill(0).map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 14, width: 60 }} /></td>
                    ))}
                  </tr>
                ))
              ) : parsers.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <div className="empty-icon">📩</div>
                      <div className="empty-title">No SMS Parsers</div>
                      <div className="empty-desc">Create your first regex pattern rule.</div>
                    </div>
                  </td>
                </tr>
              ) : parsers.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Priority: {p.priority}</div>
                  </td>
                  <td className="table-mono" style={{ fontSize: '0.8rem' }}>{p.sender_pattern || '*'}</td>
                  <td className="table-mono" style={{ fontSize: '0.8rem', color: 'var(--brand-primary)' }}>{p.amount_pattern}</td>
                  <td className="table-mono" style={{ fontSize: '0.8rem' }}>{p.txn_id_pattern || 'N/A'}</td>
                  <td>
                    <span className={`badge ${profileStatusClass(p.active ? 'active' : 'disabled')}`}>
                      {p.active ? 'ACTIVE' : 'DISABLED'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(p.updated_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>Edit</button>
                      <button className={`btn btn-sm ${p.active ? 'btn-danger' : 'btn-success'}`} onClick={() => toggleActive(p)}>
                        {p.active ? 'Disable' : 'Enable'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(p)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <div className="modal-title">{editing ? 'Edit SMS Parser' : 'Add SMS Parser'}</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Name *</label>
                  <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Telesom English" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Priority</label>
                  <input type="number" className="form-input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe this parser..." />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Sender Pattern (Regex)</label>
                  <input className="form-input" style={{ fontFamily: 'monospace' }} value={form.sender_pattern} onChange={e => setForm(f => ({ ...f, sender_pattern: e.target.value }))} placeholder="Leave empty to match any sender" />
                </div>
                <div className="form-group">
                  <label className="form-label">Currency Pattern (Regex) *</label>
                  <input className="form-input" style={{ fontFamily: 'monospace' }} value={form.currency_pattern} onChange={e => setForm(f => ({ ...f, currency_pattern: e.target.value }))} placeholder="SLS" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Amount Pattern (Regex with Capture Group) *</label>
                <input className="form-input" style={{ fontFamily: 'monospace' }} value={form.amount_pattern} onChange={e => setForm(f => ({ ...f, amount_pattern: e.target.value }))} placeholder="(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*SLS" />
                <span className="form-hint">Must contain a capture group (parentheses) to extract the numeric amount.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Transaction ID Pattern (Regex with Capture Group)</label>
                <input className="form-input" style={{ fontFamily: 'monospace' }} value={form.txn_id_pattern} onChange={e => setForm(f => ({ ...f, txn_id_pattern: e.target.value }))} placeholder="Ref[:\s]+([A-Za-z0-9]+)" />
              </div>

              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
                <label className="form-label" style={{ marginBottom: 0, marginRight: 'var(--space-3)' }}>Active</label>
                <label className="toggle-wrapper">
                  <div className={`toggle-track${form.active ? ' on' : ''}`} onClick={() => setForm(f => ({ ...f, active: !f.active }))}>
                    <div className="toggle-thumb" />
                  </div>
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{form.active ? 'Active' : 'Disabled'}</span>
                </label>
              </div>

            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Parser'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div className="modal-title">Delete Parser</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDeleteConfirm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)' }}>
                Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>{deleteConfirm.name}</strong>?
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}>Delete Parser</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
