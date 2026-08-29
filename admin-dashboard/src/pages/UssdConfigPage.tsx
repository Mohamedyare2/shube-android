import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { UssdConfig, UssdStep } from '../types/database'
import { formatDate, profileStatusClass } from '../lib/utils'
import { useToast } from '../contexts/ToastContext'

export default function UssdConfigPage() {
  const { toast } = useToast()
  const [configs, setConfigs] = useState<UssdConfig[]>([])
  const [loading, setLoading] = useState(true)
  
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<UssdConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<UssdConfig | null>(null)
  
  const [form, setForm] = useState({
    name: '',
    description: '',
    steps: [] as UssdStep[],
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
      steps: [
        { step: 1, type: 'DIAL', description: 'Garaac Koodhka (Dial)', ussd_code_template: '*106#', timeout_ms: 10000 }
      ] as UssdStep[],
      active: true
    })
    setShowModal(true)
  }

  function openEdit(c: UssdConfig) {
    setEditing(c)
    setForm({
      name: c.name,
      description: c.description || '',
      steps: Array.isArray(c.steps) ? (c.steps as unknown as UssdStep[]) : [],
      active: c.active
    })
    setShowModal(true)
  }

  function addStep(type: UssdStep['type']) {
    const descMap: Record<string, string> = {
      'DIAL': 'Garaac Koodhka (Dial)',
      'SEND_REPLY': 'Sii Dooro (Reply)',
      'ENTER_NUMBER': 'Geli Nambarka Somtel',
      'ENTER_PIN': 'Geli PIN-ka',
      'READ_RESPONSE': 'Akhri Natiijada'
    }
    const newStep: UssdStep = {
      step: form.steps.length + 1,
      type,
      description: descMap[type] || '',
      timeout_ms: 10000,
    }
    setForm(f => ({ ...f, steps: [...f.steps, newStep] }))
  }

  function updateStep(index: number, key: keyof UssdStep, value: any) {
    const newSteps = [...form.steps]
    newSteps[index] = { ...newSteps[index], [key]: value } as UssdStep
    setForm(f => ({ ...f, steps: newSteps }))
  }

  function removeStep(index: number) {
    const newSteps = form.steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, step: i + 1 }))
    setForm(f => ({ ...f, steps: newSteps }))
  }

  async function handleSave() {
    if (!form.name) {
      toast('Fadlan geli magaca (Name is required)', 'error')
      return
    }
    if (form.steps.length === 0) {
      toast('Ugu yaraan hal tallaabo (step) waa inuu ku jiraa', 'error')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name,
        description: form.description,
        steps: form.steps as unknown as any[],
        active: form.active
      }

      if (editing) {
        const { error } = await supabase.from('ussd_config').update(payload).eq('id', editing.id)
        if (error) throw error
        toast('Waa la cusboonaysiiyay (Updated)', 'success')
      } else {
        const { error } = await supabase.from('ussd_config').insert(payload)
        if (error) throw error
        toast('Waa la keydiyay (Saved)', 'success')
      }
      
      setShowModal(false)
      load()
    } catch (err: any) {
      toast(err.message || 'Cillad ayaa dhacday', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(c: UssdConfig) {
    const { error } = await supabase.from('ussd_config').delete().eq('id', c.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Waa la tirtiray (Deleted)', 'success')
    setDeleteConfirm(null)
    load()
  }

  async function toggleActive(c: UssdConfig) {
    await supabase.from('ussd_config').update({ active: !c.active }).eq('id', c.id)
    toast(`Waa la ${c.active ? 'xidhay' : 'furay'}`, 'success')
    load()
  }

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Habaynta USSD (USSD Flow Config)</h1>
          <p className="page-subtitle">Halkan ka samee talaabooyinka la raacayo (Steps) marka xirmo la shubayo</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Ku dar Flow Cusub</button>
      </div>

      <div className="card">
        <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Magaca (Name)</th>
                <th>Faahfaahin (Description)</th>
                <th>Tallaabooyinka (Steps)</th>
                <th>Xaaladda (Status)</th>
                <th>Xilligii Udanbeeyay (Updated)</th>
                <th>Tallaabooyin (Actions)</th>
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
                      <div className="empty-title">Majiro USSD Flow</div>
                      <div className="empty-desc">Samee qaabka USSD-ga loo garaacayo.</div>
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
                      {c.active ? 'Furan (ACTIVE)' : 'Xidhan (DISABLED)'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(c.updated_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>Beddel (Edit)</button>
                      <button className={`btn btn-sm ${c.active ? 'btn-danger' : 'btn-success'}`} onClick={() => toggleActive(c)}>
                        {c.active ? 'Xidh (Disable)' : 'Fur (Enable)'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(c)}>Tirtir</button>
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
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div className="modal-title">{editing ? 'Beddel USSD Flow' : 'Ku Dar USSD Flow Cusub'}</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxHeight: '70vh', overflowY: 'auto' }}>
              
              <div className="form-group">
                <label className="form-label">Magaca Flow-ga (Name) *</label>
                <input 
                  className="form-input" 
                  value={form.name} 
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
                  placeholder="Tusaale: Xirmada $0.5 Flow" 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Faahfaahin (Description)</label>
                <input 
                  className="form-input" 
                  value={form.description} 
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} 
                  placeholder="Maxaa flow-gan loogu talo galay..." 
                />
              </div>

              <div>
                <label className="form-label" style={{ marginBottom: 'var(--space-2)' }}>Tallaabooyinka Loo Raacayo (Steps) *</label>
                <div style={{ background: 'var(--bg-surface-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  💡 <strong>Kuwaan waxaad ku qori kartaa meel kasta:</strong> <br/>
                  <code>{'{somtel_number}'}</code> = Nambarka macmiilka uu leeyahay<br/>
                  <code>{'{bundle_option}'}</code> = Nambarka la sii dooranayo ee xirmada<br/>
                  <code>{'{pin}'}</code> = PIN-ka taleefanka ee sirta ah
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {form.steps.map((step, idx) => (
                    <div key={idx} style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', position: 'relative' }}>
                      <button className="btn btn-ghost btn-sm btn-icon" style={{ position: 'absolute', top: 4, right: 4 }} onClick={() => removeStep(idx)}>✕</button>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--brand-primary)', marginBottom: 'var(--space-2)' }}>Tallaabada {idx + 1}: {
                        step.type === 'DIAL' ? 'Garaac Koodhka' :
                        step.type === 'SEND_REPLY' ? 'Sii Dooro (Reply)' :
                        step.type === 'ENTER_NUMBER' ? 'Geli Nambarka Somtel' :
                        step.type === 'ENTER_PIN' ? 'Geli PIN-ka' : 'Akhri Natiijada'
                      }</div>
                      
                      {step.type === 'DIAL' && (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>Maxaa la garaacayaa? (USSD Code)</label>
                          <input className="form-input" value={step.ussd_code_template || ''} onChange={e => updateStep(idx, 'ussd_code_template', e.target.value)} placeholder="Tusaale: *137*{somtel_number}*50*{pin}#" style={{ fontFamily: 'monospace' }} />
                        </div>
                      )}
                      
                      {step.type === 'SEND_REPLY' && (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>Maxaa la sii dooranayaa? (Reply)</label>
                          <input className="form-input" value={step.value || ''} onChange={e => updateStep(idx, 'value', e.target.value)} placeholder="Tusaale: 1 ama {bundle_option}" style={{ fontFamily: 'monospace' }} />
                        </div>
                      )}
                      
                      {(step.type === 'ENTER_NUMBER' || step.type === 'ENTER_PIN') && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>System-ka ayaa si toos ah u gelin doona {step.type === 'ENTER_PIN' ? 'PIN-ka qarsoon' : 'Nambarka Somtel ee Macmiilka'}.</div>
                      )}
                    </div>
                  ))}
                </div>
                
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => addStep('DIAL')}>+ Garaac Koodhka</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => addStep('SEND_REPLY')}>+ Sii Dooro (Reply)</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => addStep('ENTER_NUMBER')}>+ Geli Somtel Num</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => addStep('ENTER_PIN')}>+ Geli PIN-ka</button>
                </div>
              </div>

              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-2)' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Xaaladda (Active)</label>
                <label className="toggle-wrapper">
                  <div className={`toggle-track${form.active ? ' on' : ''}`} onClick={() => setForm(f => ({ ...f, active: !f.active }))}>
                    <div className="toggle-thumb" />
                  </div>
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{form.active ? 'Wuu Furan Yahay' : 'Wuu Xidhan Yahay'}</span>
                </label>
              </div>

            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Jooji (Cancel)</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
                {saving ? 'Waa la keydinayaa...' : editing ? 'Keydi Isbeddelka' : 'Keydi Flow-ga Cusub'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div className="modal-title">Tirtir (Delete)</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDeleteConfirm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)' }}>
                Ma hubtaa inaad tirtirto flow-gan <strong style={{ color: 'var(--text-primary)' }}>{deleteConfirm.name}</strong>?
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Jooji (Cancel)</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}>Haa, Tirtir</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
