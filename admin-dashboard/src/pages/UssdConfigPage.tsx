import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { UssdConfig } from '../types/database'
import { formatDate, profileStatusClass } from '../lib/utils'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

export default function UssdConfigPage() {
  const { toast } = useToast()
  const { isAdmin } = useAuth()
  const [configs, setConfigs] = useState<UssdConfig[]>([])
  const [loading, setLoading] = useState(true)
  
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<UssdConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<UssdConfig | null>(null)
  
  const [form, setForm] = useState({
    name: '',
    description: '',
    stepsStr: '[]',
    active: true
  })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('ussd_config').select('*').order('created_at')
    if (data) setConfigs(data as UssdConfig[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm({
      name: '',
      description: '',
      stepsStr: '[\n  {\n    "step": 1,\n    "type": "DIAL",\n    "description": "Initial dial",\n    "ussd_code_template": "*106#",\n    "timeout_ms": 10000\n  }\n]',
      active: true
    })
    setShowModal(true)
  }

  function openEdit(c: UssdConfig) {
    setEditing(c)
    setForm({
      name: c.name,
      description: c.description || '',
      stepsStr: JSON.stringify(c.steps, null, 2),
      active: c.active
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name) {
      toast('Name is required', 'error')
      return
    }
    
    let parsedSteps = []
    try {
      parsedSteps = JSON.parse(form.stepsStr)
      if (!Array.isArray(parsedSteps)) throw new Error('Steps must be a JSON array')
    } catch (e: any) {
      toast('Invalid JSON in steps: ' + e.message, 'error')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name,
        description: form.description,
        steps: parsedSteps,
        active: form.active
      }

      if (editing) {
        const { error } = await supabase.from('ussd_config').update(payload).eq('id', editing.id)
        if (error) throw error
        toast('USSD Configuration updated', 'success')
      } else {
        const { error } = await supabase.from('ussd_config').insert(payload)
        if (error) throw error
        toast('USSD Configuration added', 'success')
      }
      
      setShowModal(false)
      load()
    } catch (err: any) {
      toast(err.message || 'Failed to save configuration', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(c: UssdConfig) {
    const { error } = await supabase.from('ussd_config').delete().eq('id', c.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Configuration deleted', 'success')
    setDeleteConfirm(null)
    load()
  }

  async function toggleActive(c: UssdConfig) {
    await supabase.from('ussd_config').update({ active: !c.active }).eq('id', c.id)
    toast(`Configuration ${c.active ? 'disabled' : 'enabled'}`, 'success')
    load()
  }

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">USSD Configuration</h1>
          <p className="page-subtitle">Manage Android automated USSD step workflows</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}
          style={{ visibility: isAdmin ? 'visible' : 'hidden' }}
        >+ Add Config</button>
      </div>

      <div className="card">
        <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Steps</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(3).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(6).fill(0).map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 14, width: 80 }} /></td>
                    ))}
                  </tr>
                ))
              ) : configs.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <div className="empty-icon">⚙️</div>
                      <div className="empty-title">No USSD Configurations</div>
                      <div className="empty-desc">Create your first USSD workflow.</div>
                    </div>
                  </td>
                </tr>
              ) : configs.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{c.description || '—'}</td>
                  <td>
                    <span className="badge" style={{ background: 'var(--bg-surface-2)' }}>
                      {Array.isArray(c.steps) ? c.steps.length : 0} steps
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${profileStatusClass(c.active ? 'active' : 'disabled')}`}>
                      {c.active ? 'ACTIVE' : 'DISABLED'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(c.updated_at)}</td>
                  <td>
                    {isAdmin ? (
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>Edit</button>
                        <button className={`btn btn-sm ${c.active ? 'btn-danger' : 'btn-success'}`} onClick={() => toggleActive(c)}>
                          {c.active ? 'Disable' : 'Enable'}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(c)}>Delete</button>
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

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <div className="modal-title">{editing ? 'Edit USSD Configuration' : 'Add USSD Configuration'}</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input 
                  className="form-input" 
                  value={form.name} 
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
                  placeholder="e.g. Somtel Bundle Purchase" 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <input 
                  className="form-input" 
                  value={form.description} 
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} 
                  placeholder="Describe this workflow..." 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Workflow Steps (JSON Array) *</label>
                <textarea
                  className="form-input"
                  style={{ fontFamily: 'monospace', minHeight: 250, resize: 'vertical' }}
                  value={form.stepsStr}
                  onChange={e => setForm(f => ({ ...f, stepsStr: e.target.value }))}
                />
                <span className="form-hint">Must be a valid JSON array of UssdStep objects.</span>
              </div>

              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Active</label>
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
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Config'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div className="modal-title">Delete Configuration</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDeleteConfirm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)' }}>
                Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>{deleteConfirm.name}</strong>?
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}>Delete Config</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
