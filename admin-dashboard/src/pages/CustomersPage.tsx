import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Customer } from '../types/database'
import { formatDate, profileStatusClass } from '../lib/utils'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

const PAGE_SIZE = 25

export default function CustomersPage() {
  const { toast } = useToast()
  const { user, isOperator } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null)
  const [form, setForm] = useState({ customer_name: '', telesom_number: '', somtel_number: '', notes: '', active: true })

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    // Scope operator to their own customers
    if (isOperator && user?.id) q = q.eq('created_by', user.id)
    if (search) q = q.or(`customer_name.ilike.%${search}%,telesom_number.ilike.%${search}%,somtel_number.ilike.%${search}%`)
    const { data, count } = await q
    if (data) setCustomers(data)
    if (count !== null) setTotal(count)
    setLoading(false)
  }, [page, search, isOperator, user?.id])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm({ customer_name: '', telesom_number: '', somtel_number: '', notes: '', active: true })
    setShowModal(true)
  }

  function openEdit(c: Customer) {
    setEditing(c)
    setForm({ customer_name: c.customer_name, telesom_number: c.telesom_number, somtel_number: c.somtel_number, notes: c.notes ?? '', active: c.active })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.customer_name || !form.telesom_number || !form.somtel_number) {
      toast('All fields are required', 'error'); return
    }
    // Basic phone validation
    const telesomRe = /^\d{7}$/
    const somtelRe = /^65\d{7}$/
    
    if (!telesomRe.test(form.telesom_number)) { toast('Telesom waa inuu ahaadaa 7 Nambar oo kaliya! (Tusaale: 4284015). Ha ku darin 063.', 'error'); return }
    if (!somtelRe.test(form.somtel_number))  { toast('Somtel waa inuu ka bilaabmaa 65, uuna yahay 9 Nambar! (Tusaale: 657575175).',  'error'); return }

    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase.from('customers').update({
          customer_name: form.customer_name,
          telesom_number: form.telesom_number,
          somtel_number:  form.somtel_number,
          notes:          form.notes || null,
          active:         form.active,
        }).eq('id', editing.id)
        if (error) throw error
        await supabase.from('audit_logs').insert({ actor_id: user?.id, actor_role: isOperator ? 'operator' : 'admin', action: 'customer_updated', resource_type: 'customer', resource_id: editing.id, description: `Updated ${form.customer_name} (${form.telesom_number})` })
        toast('Customer updated', 'success')
      } else {
        const { error } = await supabase.from('customers').insert({
          customer_name: form.customer_name,
          telesom_number: form.telesom_number,
          somtel_number:  form.somtel_number,
          notes:          form.notes || null,
          active:         form.active,
          created_by:     user?.id,
        })
        if (error) {
          if (error.code === '23505') throw new Error('A customer with this Telesom number already exists.')
          throw error
        }
        await supabase.from('audit_logs').insert({ actor_id: user?.id, actor_role: isOperator ? 'operator' : 'admin', action: 'customer_added', resource_type: 'customer', description: `Added ${form.customer_name} (${form.telesom_number})` })
        toast('Customer added', 'success')
      }
      setShowModal(false)
      load()
    } catch (err: unknown) {
      let msg = 'Failed to save customer'
      if (err instanceof Error) {
        msg = err.message
      } else if (err && typeof err === 'object' && 'message' in err) {
        msg = String((err as { message: unknown }).message)
      } else if (typeof err === 'string') {
        msg = err
      }
      toast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(c: Customer) {
    const { error } = await supabase.from('customers').delete().eq('id', c.id)
    if (error) { toast(error.message, 'error'); return }
    await supabase.from('audit_logs').insert({ actor_id: user?.id, actor_role: isOperator ? 'operator' : 'admin', action: 'customer_deleted', resource_type: 'customer', resource_id: c.id, description: `Deleted ${c.customer_name} (${c.telesom_number})` })
    toast('Customer deleted', 'success')
    setDeleteConfirm(null)
    load()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">{isOperator ? 'My Customers' : 'Customers'}</h1>
          <p className="page-subtitle">{total.toLocaleString()} customer mappings</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Customer</button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input className="search-input" placeholder="Search name, Telesom or Somtel number..." value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
          </div>
        </div>
        <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Telesom Number</th>
                <th>→ Somtel Number</th>
                <th>Status</th>
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(6).fill(0).map((_, i) => <tr key={i}>{Array(6).fill(0).map((_, j) => <td key={j}><div className="skeleton" style={{ height: 14, width: 80 }} /></td>)}</tr>)
              ) : customers.length === 0 ? (
                <tr><td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-icon">👥</div>
                    <div className="empty-title">No customers yet</div>
                    <div className="empty-desc">Add customer mappings to enable automatic recharge.</div>
                  </div>
                </td></tr>
              ) : customers.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.customer_name}</td>
                  <td className="table-mono">{c.telesom_number}</td>
                  <td className="table-mono" style={{ color: 'var(--brand-accent)', fontWeight: 600 }}>{c.somtel_number}</td>
                  <td><span className={`badge ${profileStatusClass(c.active ? 'active' : 'disabled')}`}>{c.active ? 'ACTIVE' : 'DISABLED'}</span></td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(c.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(c)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="pagination">
            <div className="pagination-info">Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}</div>
            <div className="pagination-controls">
              <button className="pagination-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + Math.max(0, page - 2)).map(p => (
                <button key={p} className={`pagination-btn${p === page ? ' active' : ''}`} onClick={() => setPage(p)}>{p + 1}</button>
              ))}
              <button className="pagination-btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editing ? 'Edit Customer' : 'Add Customer'}</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Customer Name *</label>
                <input className="form-input" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Ahmed Ali" />
              </div>
              <div className="form-group">
                <label className="form-label">Telesom Number *</label>
                <input className="form-input" value={form.telesom_number} onChange={e => setForm(f => ({ ...f, telesom_number: e.target.value }))} placeholder="4284015" />
                <span className="form-hint">The number that sends payments to Telesom.</span>
              </div>
              <div className="form-group">
                <label className="form-label">Somtel Number * (receives internet bundle)</label>
                <input className="form-input" value={form.somtel_number} onChange={e => setForm(f => ({ ...f, somtel_number: e.target.value }))} placeholder="657575175" />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." style={{ minHeight: 60 }} />
              </div>
              <div className="form-group">
                <label className="toggle-wrapper">
                  <div className={`toggle-track${form.active ? ' on' : ''}`} onClick={() => setForm(f => ({ ...f, active: !f.active }))}>
                    <div className="toggle-thumb" />
                  </div>
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Active (enables automatic recharge)</span>
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div className="modal-title">Delete Customer</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDeleteConfirm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>{deleteConfirm.customer_name}</strong> ({deleteConfirm.telesom_number})?
                <br /><br />This action cannot be undone. Future payments from this number will not be automatically recharged.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" style={{ background: 'var(--brand-danger)', color: 'white' }} onClick={() => handleDelete(deleteConfirm)}>Delete Customer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
