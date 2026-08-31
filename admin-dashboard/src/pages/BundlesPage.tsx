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
  
  // Form state
  const [form, setForm] = useState({
    amount_sls: '', bundle_name: '', data_amount: '', data_unit: 'GB' as 'GB' | 'MB',
    ussd_option: '', ussd_code: '', ussd_replies: [] as string[], active: true, sort_order: '0',
  })
  
  // USSD Builder helper states
  const [selectedMethod, setSelectedMethod] = useState<'137' | '134' | '106_12' | '106_25' | 'custom'>('137')
  const [ussdPrefix, setUssdPrefix] = useState('*137')
  const [ussdPin, setUssdPin] = useState('00000')
  const [isManualTemplate, setIsManualTemplate] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('bundle_rules').select('*').order('sort_order').order('amount_sls')
    if (data) setBundles(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function applyPreset(method: '137' | '134' | '106_12' | '106_25') {
    setSelectedMethod(method)
    setIsManualTemplate(false)
    setUssdPin('00000')

    if (method === '137') {
      setUssdPrefix('*137')
      setForm(f => ({
        ...f,
        ussd_option: f.ussd_option || '05',
        ussd_code: '*137*{somtel_number}*{bundle_option}*00000#',
        ussd_replies: ['1'],
      }))
    } else if (method === '134') {
      setUssdPrefix('*134')
      setForm(f => ({
        ...f,
        ussd_option: f.ussd_option || '05',
        ussd_code: '*134*{somtel_number}*{bundle_option}*00000#',
        ussd_replies: ['1'],
      }))
    } else if (method === '106_12') {
      // $0.12 bundle (e.g. 50MB): *106# -> 2 -> 2 -> 1 -> 1 -> {somtel_number} -> 00000
      setUssdPrefix('*106#')
      setForm(f => ({
        ...f,
        bundle_name: f.bundle_name || '50 MB ($0.12 Maalinle)',
        data_amount: f.data_amount || '50',
        data_unit: 'MB',
        ussd_option: '1',
        ussd_code: '*106#',
        ussd_replies: ['2', '2', '1', '1', '{somtel_number}', '00000'],
      }))
    } else if (method === '106_25') {
      // $0.25 bundle (e.g. 120MB): *106# -> 2 -> 2 -> 1 -> 2 -> {somtel_number} -> 00000
      setUssdPrefix('*106#')
      setForm(f => ({
        ...f,
        bundle_name: f.bundle_name || '120 MB ($0.25 Maalinle)',
        data_amount: f.data_amount || '120',
        data_unit: 'MB',
        ussd_option: '2',
        ussd_code: '*106#',
        ussd_replies: ['2', '2', '1', '2', '{somtel_number}', '00000'],
      }))
    }
  }

  function handlePrefixOrPinChange(newPrefix: string, newPin: string) {
    setUssdPrefix(newPrefix)
    setUssdPin(newPin)
    if (!isManualTemplate && selectedMethod !== '106_12' && selectedMethod !== '106_25') {
      setForm(f => ({
        ...f,
        ussd_code: `${newPrefix}*{somtel_number}*{bundle_option}*${newPin}#`
      }))
    }
  }

  function openCreate() {
    setEditing(null)
    applyPreset('137')
    setForm({
      amount_sls: '', bundle_name: '', data_amount: '', data_unit: 'GB',
      ussd_option: '05', ussd_code: '*137*{somtel_number}*{bundle_option}*00000#',
      ussd_replies: ['1'], active: true, sort_order: '0'
    })
    setShowModal(true)
  }

  function openEdit(b: BundleRule) {
    setEditing(b)
    
    // Detect method
    let method: '137' | '134' | '106_12' | '106_25' | 'custom' = 'custom'
    let manual = true
    let detectedPrefix = '*137'
    let detectedPin = '00000'

    if (b.ussd_code === '*106#') {
      if (b.ussd_option === '1') method = '106_12'
      else if (b.ussd_option === '2') method = '106_25'
      else method = '106_12'
      manual = false
      detectedPrefix = '*106#'
    } else if (b.ussd_code.includes('*{somtel_number}*{bundle_option}*')) {
      const parts = b.ussd_code.split('*{somtel_number}*{bundle_option}*')
      if (parts.length === 2) {
        detectedPrefix = parts[0]
        detectedPin = parts[1].replace('#', '')
        if (detectedPrefix === '*137') method = '137'
        else if (detectedPrefix === '*134') method = '134'
        manual = false
      }
    }

    setSelectedMethod(method)
    setUssdPrefix(detectedPrefix)
    setUssdPin(detectedPin)
    setIsManualTemplate(manual)

    setForm({
      amount_sls: String(b.amount_sls),
      bundle_name: b.bundle_name,
      data_amount: String(b.data_amount),
      data_unit: b.data_unit,
      ussd_option: b.ussd_option,
      ussd_code: b.ussd_code,
      ussd_replies: b.ussd_replies || [],
      active: b.active,
      sort_order: String(b.sort_order),
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
        amount_sls: amt,
        bundle_name: form.bundle_name,
        data_amount: parseFloat(form.data_amount),
        data_unit: form.data_unit,
        ussd_option: form.ussd_option,
        ussd_code: form.ussd_code,
        ussd_replies: form.ussd_replies,
        active: form.active,
        sort_order: parseInt(form.sort_order) || 0,
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

  // Generate live preview string
  const previewCode = form.ussd_code
    .replace('{somtel_number}', '657575175')
    .replace('{bundle_option}', form.ussd_option || '05')
    .replace('{pin}', ussdPin || '00000')

  const previewReplies = form.ussd_replies.map(r =>
    r.replace('{somtel_number}', '657575175')
     .replace('{numberka}', '657575175')
     .replace('{pin}', ussdPin || '00000')
  )

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
                <th>Replies</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(4).fill(0).map((_, i) => <tr key={i}>{Array(9).fill(0).map((_, j) => <td key={j}><div className="skeleton" style={{ height: 14, width: 60 }} /></td>)}</tr>)
              ) : bundles.length === 0 ? (
                <tr><td colSpan={9}>
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
                  <td>
                    {b.ussd_replies && b.ussd_replies.length > 0 ? (
                      <span className="badge" style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--brand-primary)', fontSize: '0.75rem' }}>
                        {b.ussd_replies.join(' → ')}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>None</span>
                    )}
                  </td>
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
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 660 }}>
            <div className="modal-header">
              <div className="modal-title">{editing ? 'Edit Bundle Rule' : 'Add Bundle Rule'}</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Section 1: Basic Info */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount (SLS) *</label>
                  <input type="number" className="form-input" value={form.amount_sls} onChange={e => setForm(f => ({ ...f, amount_sls: e.target.value }))} placeholder="5500" />
                </div>
                <div className="form-group">
                  <label className="form-label">Bundle Name *</label>
                  <input className="form-input" value={form.bundle_name} onChange={e => setForm(f => ({ ...f, bundle_name: e.target.value }))} placeholder="1 GB Bundle (Todobaadle)" />
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

              {/* Section 2: USSD Setup with Easy Presets */}
              <div style={{ margin: 'var(--space-4) 0 var(--space-2)', padding: 'var(--space-4)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--radius-lg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                  <label className="form-label" style={{ marginBottom: 0, fontWeight: 700, color: 'var(--brand-accent)' }}>
                    ⚡ Habka USSD-ga (USSD Method Preset)
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
                    onClick={() => {
                      setIsManualTemplate(!isManualTemplate)
                      setSelectedMethod('custom')
                    }}
                  >
                    {isManualTemplate ? '⚡ Ku noqo Automatic' : '⚙️ Qor Template Gacanta (Manual)'}
                  </button>
                </div>

                {/* Quick Presets */}
                {!isManualTemplate && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${selectedMethod === '137' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ textAlign: 'left', padding: '8px 12px' }}
                      onClick={() => applyPreset('137')}
                    >
                      <div style={{ fontWeight: 700 }}>⭐ *137 (Toos - 1 Reply)</div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>*137*Number*Option*PIN# ➜ 1</div>
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${selectedMethod === '134' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ textAlign: 'left', padding: '8px 12px' }}
                      onClick={() => applyPreset('134')}
                    >
                      <div style={{ fontWeight: 700 }}>⭐ *134 (Toos - 1 Reply)</div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>*134*Number*Option*PIN# ➜ 1</div>
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${selectedMethod === '106_12' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ textAlign: 'left', padding: '8px 12px' }}
                      onClick={() => applyPreset('106_12')}
                    >
                      <div style={{ fontWeight: 700 }}>🌟 *106# ($0.12 / 50MB)</div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>*106# ➜ [2, 2, 1, 1, Num, PIN]</div>
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${selectedMethod === '106_25' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ textAlign: 'left', padding: '8px 12px' }}
                      onClick={() => applyPreset('106_25')}
                    >
                      <div style={{ fontWeight: 700 }}>🌟 *106# ($0.25 / 120MB)</div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>*106# ➜ [2, 2, 1, 2, Num, PIN]</div>
                    </button>
                  </div>
                )}

                {/* Info Note for 106# */}
                {(selectedMethod === '106_12' || selectedMethod === '106_25') && (
                  <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-3)', fontSize: '0.8rem', color: '#93C5FD', lineHeight: 1.5 }}>
                    💡 <strong>Habka *106#:</strong> Telefonku wuxuu garaacayaa <code>*106#</code>, kadibna 6-da tallaabo ee soo socota ayuu si toos ah u dirayaa (Reply 5 waa lambarka macmiilka, Reply 6 waa PIN-ka).
                  </div>
                )}

                {/* Dynamic Easy Inputs */}
                {!isManualTemplate ? (
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Service Dial Code *</label>
                      <input
                        className="form-input table-mono"
                        value={selectedMethod === '106_12' || selectedMethod === '106_25' ? '*106#' : ussdPrefix}
                        onChange={e => handlePrefixOrPinChange(e.target.value, ussdPin)}
                        placeholder="*137"
                        disabled={selectedMethod === '106_12' || selectedMethod === '106_25'}
                      />
                      <span className="form-hint">Koodhka la garaacayo</span>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Xirmo / Bundle Option *</label>
                      <input
                        className="form-input table-mono"
                        value={form.ussd_option}
                        onChange={e => setForm(f => ({ ...f, ussd_option: e.target.value }))}
                        placeholder="05"
                      />
                      <span className="form-hint">Tusaale: 05, 1, ama 2</span>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">PIN *</label>
                      <input
                        className="form-input table-mono"
                        value={ussdPin}
                        onChange={e => handlePrefixOrPinChange(ussdPrefix, e.target.value)}
                        placeholder="00000"
                      />
                      <span className="form-hint">Default: 00000</span>
                    </div>
                  </div>
                ) : (
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">USSD Option *</label>
                      <input className="form-input table-mono" value={form.ussd_option} onChange={e => setForm(f => ({ ...f, ussd_option: e.target.value }))} placeholder="05" />
                    </div>
                    <div className="form-group" style={{ flex: 2 }}>
                      <label className="form-label">USSD Code / Template *</label>
                      <input className="form-input table-mono" value={form.ussd_code} onChange={e => setForm(f => ({ ...f, ussd_code: e.target.value }))} placeholder="*137*{somtel_number}*{bundle_option}*00000#" />
                    </div>
                  </div>
                )}

                {/* Live Preview Box */}
                <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px dashed rgba(59,130,246,0.4)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    📱 Tusaale toos ah (Sida uu App-ku u shubi doono):
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Garaac: </span>
                      <code style={{ fontSize: '0.95rem', color: 'var(--brand-accent)', fontWeight: 700 }}>
                        {previewCode}
                      </code>
                    </div>
                    {previewReplies.length > 0 && (
                      <div style={{ fontSize: '0.85rem', color: '#CBD5E1', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                        <span>Tallaabooyinka Replies: </span>
                        {previewReplies.map((r, i) => (
                          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ background: 'rgba(59,130,246,0.25)', color: '#60A5FA', border: '1px solid rgba(59,130,246,0.4)', padding: '1px 7px', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 700 }}>
                              {i + 1}: {r}
                            </span>
                            {i < previewReplies.length - 1 && <span style={{ color: '#64748B' }}>➜</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 3: Follow-up Replies */}
              <div className="form-group" style={{ marginTop: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    Tallaabooyinka Xiga (Follow-up Replies)
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                      onClick={() => setForm(f => ({ ...f, ussd_replies: ['1'] }))}
                    >
                      1 Reply (1)
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                      onClick={() => setForm(f => ({ ...f, ussd_replies: ['2', '2', '1', '1', '{somtel_number}', '00000'] }))}
                    >
                      *106# ($0.12)
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                      onClick={() => setForm(f => ({ ...f, ussd_replies: ['2', '2', '1', '2', '{somtel_number}', '00000'] }))}
                    >
                      *106# ($0.25)
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                      onClick={() => setForm(f => ({ ...f, ussd_replies: [] }))}
                    >
                      Tirtir (0)
                    </button>
                  </div>
                </div>

                {/* Quick Insert helpers */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>+ Ku dar degdeg:</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'rgba(59,130,246,0.15)', color: '#93C5FD' }}
                    onClick={() => setForm(f => ({ ...f, ussd_replies: [...f.ussd_replies, '{somtel_number}'] }))}
                  >
                    📞 Lambarka ({'{somtel_number}'})
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'rgba(59,130,246,0.15)', color: '#93C5FD' }}
                    onClick={() => setForm(f => ({ ...f, ussd_replies: [...f.ussd_replies, '00000'] }))}
                  >
                    🔒 PIN (00000)
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'rgba(255,255,255,0.06)' }}
                    onClick={() => setForm(f => ({ ...f, ussd_replies: [...f.ussd_replies, '1'] }))}
                  >
                    + 1
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'rgba(255,255,255,0.06)' }}
                    onClick={() => setForm(f => ({ ...f, ussd_replies: [...f.ussd_replies, '2'] }))}
                  >
                    + 2
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {form.ussd_replies.map((reply, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', width: '60px', fontFamily: 'monospace' }}>
                        Step {idx + 1}:
                      </span>
                      <input
                        className="form-input table-mono"
                        value={reply}
                        onChange={e => {
                          const newReplies = [...form.ussd_replies]
                          newReplies[idx] = e.target.value
                          setForm(f => ({ ...f, ussd_replies: newReplies }))
                        }}
                        placeholder={`Reply ${idx + 1}`}
                        style={{ flex: 1 }}
                      />
                      <button type="button" className="btn btn-secondary btn-icon" onClick={() => {
                        const newReplies = form.ussd_replies.filter((_, i) => i !== idx)
                        setForm(f => ({ ...f, ussd_replies: newReplies }))
                      }}>✕</button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 'var(--space-2)', alignSelf: 'flex-start' }}
                  onClick={() => setForm(f => ({ ...f, ussd_replies: [...f.ussd_replies, '1'] }))}
                >
                  + Ku dar Tallaabo (Step)
                </button>
              </div>

              {/* Section 4: Active Toggle */}
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
