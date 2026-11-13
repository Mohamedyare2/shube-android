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
  app_type?: 'shube' | 'geesh' | 'mumin'
}

type AppTab = 'shube' | 'geesh' | 'mumin'

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
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({})
  const [showFormPassword, setShowFormPassword] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)

  function togglePasswordReveal(opId: string) {
    setRevealedPasswords(prev => ({ ...prev, [opId]: !prev[opId] }))
  }

  async function copyPassword(pwd: string) {
    await navigator.clipboard.writeText(pwd)
    toast('Password copied!', 'success')
  }

  // Form state
  const [form, setForm] = useState({
    full_name: '', username: '', email: '', password: '', phone_number: '', notes: '',
    sub_days: 30, sub_hours: 0, sub_minutes: 0
  })

  // Geesh Subscription & Code Generation States
  const [createdGeeshDetails, setCreatedGeeshDetails] = useState<{
    username: string
    password: string
    activation_code?: string
    expires_at?: string
    duration_summary?: string
  } | null>(null)

  const [showSubModal, setShowSubModal] = useState(false)
  const [selectedOpForSub, setSelectedOpForSub] = useState<OperatorWithProfile | null>(null)
  const [subDays, setSubDays] = useState(30)
  const [subHours, setSubHours] = useState(0)
  const [subMinutes, setSubMinutes] = useState(0)
  const [subLoading, setSubLoading] = useState(false)
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [subDurationSummary, setSubDurationSummary] = useState('')

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
      full_name: '', username: '', email: '', password: '', phone_number: '', notes: '',
      sub_days: 30, sub_hours: 0, sub_minutes: 0
    })
    setShowFormPassword(false)
    setShowModal(true)
  }

  function openEdit(op: OperatorWithProfile) {
    setEditing(op)
    setForm({
      full_name: op.profile?.full_name ?? '',
      username: op.username,
      email: '',
      password: op.plain_password ?? '',
      phone_number: op.profile?.phone_number ?? '',
      notes: op.notes ?? '',
    })
    setShowFormPassword(false)
    setShowModal(true)
  }

  async function handleSave() {
    if (activeTab === 'geesh') {
      if (!form.full_name || !form.username) {
        toast('Full name and username are required', 'error'); return
      }
    } else {
      if (!form.email && !form.username) {
        toast('Email is required', 'error'); return
      }
    }
    setSaving(true)
    try {
      if (editing) {
        // If password was edited/changed
        if (form.password && form.password !== editing.plain_password) {
          if (form.password.length < 8) {
            toast('Password must be at least 8 characters', 'error')
            setSaving(false)
            return
          }
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) throw new Error('Not authenticated')

          const res = await fetch(`/api/operators/reset-password`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              profile_id:  editing.profile_id,
              password:    form.password,
              username:    form.username,
              operator_id: editing.id,
              actor_id:    user?.id,
            }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }))
            throw new Error(err.error || 'Failed to update password')
          }
        }

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
          plain_password: form.password || editing.plain_password || null,
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
          subscription_days: activeTab === 'geesh' ? form.sub_days : undefined,
          subscription_hours: activeTab === 'geesh' ? form.sub_hours : undefined,
          subscription_minutes: activeTab === 'geesh' ? form.sub_minutes : undefined,
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

        const resData = await res.json()

        if (activeTab === 'geesh') {
          const parts = []
          if (form.sub_days > 0) parts.push(`${form.sub_days} maalmood`)
          if (form.sub_hours > 0) parts.push(`${form.sub_hours} saacadood`)
          if (form.sub_minutes > 0) parts.push(`${form.sub_minutes} daqiiqo`)
          const summary = parts.join(', ') || `${resData.duration_minutes || 0} daqiiqo`

          setCreatedGeeshDetails({
            username: form.username,
            password: form.password,
            activation_code: resData.activation_code,
            expires_at: resData.subscription_expires_at,
            duration_summary: summary,
          })
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

  async function handleGenerateOpActivationCode() {
    if (!selectedOpForSub) return
    const totalMinutes = (Number(subDays) || 0) * 1440 + (Number(subHours) || 0) * 60 + (Number(subMinutes) || 0)
    if (totalMinutes <= 0) {
      toast('Fadlan geli ugu yaraan 1 daqiiqo ama maalin', 'error')
      return
    }
    setSubLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/devices/activation-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          operator_id: selectedOpForSub.id,
          days: subDays,
          hours: subHours,
          minutes: subMinutes,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Failed to generate code', 'error')
        return
      }
      setGeneratedCode(data.activation_code)
      const parts = []
      if (subDays > 0) parts.push(`${subDays} maalmood`)
      if (subHours > 0) parts.push(`${subHours} saacadood`)
      if (subMinutes > 0) parts.push(`${subMinutes} daqiiqo`)
      setSubDurationSummary(parts.join(', ') || `${data.duration_minutes} daqiiqo`)
      toast('8-da lambar si guul leh baa loo soo saaray!', 'success')
      load()
    } catch (e: any) {
      toast('Server error: ' + e.message, 'error')
    } finally {
      setSubLoading(false)
    }
  }

  async function toggleStatus(op: OperatorWithProfile) {
    const newStatus = op.profile.status === 'active' ? 'disabled' : 'active'
    const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', op.profile_id)
    if (error) { toast(error.message, 'error'); return }

    // Sidoo kale xidh ama fur dhammaan devices-ka operator-ka
    try {
      if (newStatus === 'disabled') {
        await supabase.from('devices').update({
          status: 'disabled',
          revoked: true,
          revoked_at: new Date().toISOString(),
          revoked_by: user?.id,
        }).eq('operator_id', op.id)
      } else {
        await supabase.from('devices').update({
          status: 'offline',
          revoked: false,
          revoked_at: null,
          revoked_by: null,
        }).eq('operator_id', op.id)
      }
    } catch (devErr) {
      console.error('Failed to update operator devices:', devErr)
    }

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

      toast('Password updated successfully', 'success')
      setShowResetModal(null)
      setNewPassword('')
      load()
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

      let deleted = false
      let failureReason = ''

      // Strategy 1: Direct Supabase RPC (fastest, atomic, SECURITY DEFINER)
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('admin_delete_operator', {
          target_profile_id: op.profile_id
        })
        if (!rpcErr && rpcRes) {
          const resObj = rpcRes as { success?: boolean; error?: string }
          if (resObj.success === true) {
            deleted = true
          } else if (resObj.error) {
            failureReason = resObj.error
          }
        } else if (rpcErr) {
          failureReason = rpcErr.message
        }
      } catch (err: any) {
        failureReason = err?.message || ''
      }

      // Strategy 2: API endpoints fallback (Vercel serverless / local admin API)
      if (!deleted) {
        try {
          const res1 = await fetch(`/api/operators/${op.profile_id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ actor_id: user?.id, username: op.username }),
          })
          if (res1.ok) {
            deleted = true
          } else {
            const res2 = await fetch(`/api/operators?profile_id=${op.profile_id}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
              body: JSON.stringify({ actor_id: user?.id, username: op.username }),
            })
            if (res2.ok) {
              deleted = true
            } else {
              const errBody = await res2.json().catch(() => ({}))
              if (errBody?.error) failureReason = errBody.error
            }
          }
        } catch (_) { /* network error */ }
      }

      if (!deleted) throw new Error(failureReason || 'Failed to delete operator')

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
  const muminCount = operators.filter(op => op.app_type === 'mumin').length

  const isGeesh = activeTab === 'geesh'
  const isMumin = activeTab === 'mumin'

  return (
    <div className="page-container">
      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Operators</h1>
          <p className="page-subtitle">Manage all operator accounts</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + {isGeesh ? 'Create Sarif Operator' : isMumin ? 'Create Mu\'min Operator' : 'Create Operator'}
        </button>
      </div>

      {/* ── Tab Switcher ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 'var(--space-4)', borderBottom: '2px solid var(--border-subtle)', flexWrap: 'wrap' }}>
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
          📱 Shube Operator
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
            borderBottom: activeTab === 'geesh' ? '2px solid var(--brand-purple)' : '2px solid transparent',
            marginBottom: -2,
            color: activeTab === 'geesh' ? 'var(--brand-purple)' : 'var(--text-muted)',
            fontWeight: activeTab === 'geesh' ? 700 : 400,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            transition: 'all 0.15s ease',
          }}
        >
          💱 Geesh Operator
          <span style={{
            background: activeTab === 'geesh' ? 'var(--brand-purple)' : 'var(--bg-surface-2)',
            color: activeTab === 'geesh' ? '#fff' : 'var(--text-muted)',
            borderRadius: 99,
            padding: '1px 8px',
            fontSize: '0.75rem',
            fontWeight: 600,
          }}>{geeshCount}</span>
        </button>

        <button
          onClick={() => setActiveTab('mumin')}
          style={{
            padding: 'var(--space-3) var(--space-5)',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'mumin' ? '2px solid #10B981' : '2px solid transparent',
            marginBottom: -2,
            color: activeTab === 'mumin' ? '#10B981' : 'var(--text-muted)',
            fontWeight: activeTab === 'mumin' ? 700 : 400,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            transition: 'all 0.15s ease',
          }}
        >
          ✨ Mu'min Operator
          <span style={{
            background: activeTab === 'mumin' ? '#10B981' : 'var(--bg-surface-2)',
            color: activeTab === 'mumin' ? '#fff' : 'var(--text-muted)',
            borderRadius: 99,
            padding: '1px 8px',
            fontSize: '0.75rem',
            fontWeight: 600,
          }}>{muminCount}</span>
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
                <th>Password</th>
                {isGeesh && <th>Subscription / Rukhsadda</th>}
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>{Array(isGeesh ? 8 : 7).fill(0).map((_, j) => (
                    <td key={j}><div className="skeleton" style={{ height: 14, width: 80 }} /></td>
                  ))}</tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={isGeesh ? 8 : 7}>
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
                    {op.plain_password ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-surface-2)', border: '1px solid var(--border-color)', padding: '4px 10px', borderRadius: 'var(--radius-sm)' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: 0.5 }}>
                          {op.plain_password}
                        </span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs btn-icon"
                          style={{ padding: '0 2px', lineHeight: 1 }}
                          title="Copy Password"
                          onClick={() => copyPassword(op.plain_password!)}
                        >
                          📋
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-ghost btn-xs"
                        style={{ color: 'var(--brand-primary)', textDecoration: 'underline', padding: 0 }}
                        onClick={() => { setShowResetModal(op); setNewPassword('') }}
                      >
                        + Set PW
                      </button>
                    )}
                  </td>
                  {isGeesh && (
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                          {op.subscription_expires_at ? (() => {
                            const diff = new Date(op.subscription_expires_at).getTime() - Date.now()
                            if (diff <= 0) return <span style={{ color: 'var(--brand-danger)' }}>❌ Dhacday</span>
                            const days = Math.floor(diff / (1000 * 60 * 60 * 24))
                            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
                            const minutes = Math.floor((diff / (1000 * 60)) % 60)
                            const remStr = days > 0 ? `${days}d ${hours}h u hadhay` : hours > 0 ? `${hours}h ${minutes}m u hadhay` : `${minutes}m u hadhay`
                            return (
                              <div>
                                <span style={{ color: days >= 2 ? 'var(--brand-success)' : '#f59e0b' }}>
                                  ⏳ {remStr}
                                </span>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                                  Dhacaysa: {new Date(op.subscription_expires_at).toLocaleDateString()} {new Date(op.subscription_expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            )
                          })() : (
                            <span style={{ color: 'var(--text-muted)' }}>⚪ Weli lama kicin</span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          style={{ fontSize: '0.72rem', padding: '2px 8px', width: 'fit-content', border: '1px solid var(--brand-purple)', color: 'var(--brand-purple)' }}
                          onClick={() => {
                            setSelectedOpForSub(op)
                            setSubDays(30)
                            setSubHours(0)
                            setSubMinutes(0)
                            setGeneratedCode(null)
                            setShowSubModal(true)
                          }}
                        >
                          🔑 Sii Rukhsad (8-Code)
                        </button>
                      </div>
                    </td>
                  )}
                  <td>
                    <span className={`badge ${profileStatusClass(op.profile?.status ?? 'active')}`}>
                      {op.profile?.status?.toUpperCase() ?? 'ACTIVE'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(op.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(op)}>Edit</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setShowResetModal(op); setNewPassword('') }}>Change PW</button>
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
              {!editing ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Email {isGeesh ? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional — auto-generated if empty)</span> : '*'}</label>
                    <input className="form-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder={`operator@${isGeesh ? 'geesh' : 'shube'}.app`} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Password *</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type={showFormPassword ? 'text' : 'password'}
                        className="form-input"
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        placeholder="Min. 8 characters"
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-icon"
                        onClick={() => setShowFormPassword(s => !s)}
                        title={showFormPassword ? "Qari" : "Muuji"}
                      >
                        {showFormPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>

                  {isGeesh && !editing && (
                    <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-purple)', marginBottom: 6 }}>
                        ⏳ Muddada Rukhsadda (Subscription Duration)
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                        Dooro inta maalmood/saacadood ee uu Geesh App-ku shaqaynayo ka hor inta aanuu isqufulin:
                      </div>

                      {/* Quick Presets */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '3px 8px', background: form.sub_minutes === 2 && form.sub_hours === 0 && form.sub_days === 0 ? 'var(--brand-primary)' : undefined, color: form.sub_minutes === 2 && form.sub_hours === 0 && form.sub_days === 0 ? '#fff' : undefined }}
                          onClick={() => setForm(f => ({ ...f, sub_days: 0, sub_hours: 0, sub_minutes: 2 }))}
                        >
                          ⚡ 2 Daqiiqo (Test)
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '3px 8px', background: form.sub_hours === 1 && form.sub_days === 0 && form.sub_minutes === 0 ? 'var(--brand-primary)' : undefined, color: form.sub_hours === 1 && form.sub_days === 0 && form.sub_minutes === 0 ? '#fff' : undefined }}
                          onClick={() => setForm(f => ({ ...f, sub_days: 0, sub_hours: 1, sub_minutes: 0 }))}
                        >
                          1 Saac
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '3px 8px', background: form.sub_days === 1 && form.sub_hours === 0 && form.sub_minutes === 0 ? 'var(--brand-primary)' : undefined, color: form.sub_days === 1 && form.sub_hours === 0 && form.sub_minutes === 0 ? '#fff' : undefined }}
                          onClick={() => setForm(f => ({ ...f, sub_days: 1, sub_hours: 0, sub_minutes: 0 }))}
                        >
                          1 Maalin
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '3px 8px', background: form.sub_days === 7 && form.sub_hours === 0 && form.sub_minutes === 0 ? 'var(--brand-primary)' : undefined, color: form.sub_days === 7 && form.sub_hours === 0 && form.sub_minutes === 0 ? '#fff' : undefined }}
                          onClick={() => setForm(f => ({ ...f, sub_days: 7, sub_hours: 0, sub_minutes: 0 }))}
                        >
                          7 Maalmood
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '3px 8px', background: form.sub_days === 30 && form.sub_hours === 0 && form.sub_minutes === 0 ? 'var(--brand-primary)' : undefined, color: form.sub_days === 30 && form.sub_hours === 0 && form.sub_minutes === 0 ? '#fff' : undefined }}
                          onClick={() => setForm(f => ({ ...f, sub_days: 30, sub_hours: 0, sub_minutes: 0 }))}
                        >
                          30 Maalmood
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Maalmood</label>
                          <input
                            type="number"
                            min="0"
                            className="form-input"
                            style={{ padding: '6px 8px', fontSize: '0.85rem' }}
                            value={form.sub_days}
                            onChange={e => setForm(f => ({ ...f, sub_days: Math.max(0, parseInt(e.target.value) || 0) }))}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Saacado</label>
                          <input
                            type="number"
                            min="0"
                            max="23"
                            className="form-input"
                            style={{ padding: '6px 8px', fontSize: '0.85rem' }}
                            value={form.sub_hours}
                            onChange={e => setForm(f => ({ ...f, sub_hours: Math.max(0, parseInt(e.target.value) || 0) }))}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Daqiiqado</label>
                          <input
                            type="number"
                            min="0"
                            max="59"
                            className="form-input"
                            style={{ padding: '6px 8px', fontSize: '0.85rem' }}
                            value={form.sub_minutes}
                            onChange={e => setForm(f => ({ ...f, sub_minutes: Math.max(0, parseInt(e.target.value) || 0) }))}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="form-group">
                  <label className="form-label">
                    Password <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(leave unchanged or type new password)</span>
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type={showFormPassword ? 'text' : 'password'}
                      className="form-input"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Min. 8 characters"
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-icon"
                      onClick={() => setShowFormPassword(s => !s)}
                      title={showFormPassword ? "Qari" : "Muuji"}
                    >
                      {showFormPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
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

      {/* ── Edit / Reset Password Modal ─────────────────────── */}
      {showResetModal && (
        <div className="modal-backdrop" onClick={() => setShowResetModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div className="modal-title">Edit / Reset Password — {showResetModal.username}</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowResetModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {showResetModal.plain_password && (
                <div style={{
                  padding: 'var(--space-3)',
                  background: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 'var(--space-4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Current Password:</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.95rem' }}>
                      {showResetModal.plain_password}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => copyPassword(showResetModal.plain_password!)}
                  >
                    📋 Copy
                  </button>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">New Password *</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    className="form-input"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-icon"
                    onClick={() => setShowResetPassword(s => !s)}
                    title={showResetPassword ? "Qari" : "Muuji"}
                  >
                    {showResetPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                <span className="form-hint">Geli password cusub oo ugu yaraan 8 xaraf ah.</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowResetModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving || !newPassword} onClick={handleResetPassword}>
                {saving ? 'Saving...' : 'Save New Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Created Geesh Operator Success Modal ──────────────── */}
      {createdGeeshDetails && (
        <div className="modal-backdrop" onClick={() => setCreatedGeeshDetails(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div className="modal-title">🎉 Geesh Operator Created!</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setCreatedGeeshDetails(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
                Account-ka <strong>Geesh App</strong> si guul leh baa loo sameeyay. Sii macmiilka xogtan:
              </div>

              <div style={{ background: 'var(--bg-surface-2)', padding: '12px 16px', borderRadius: 'var(--radius-md)', textAlign: 'left', marginBottom: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Username:</span>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{createdGeeshDetails.username}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Password:</span>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{createdGeeshDetails.password}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Muddada:</span>
                  <span style={{ fontWeight: 600, color: 'var(--brand-purple)' }}>{createdGeeshDetails.duration_summary}</span>
                </div>
              </div>

              {createdGeeshDetails.activation_code && (
                <>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                    🔑 8-DA LAMBAR EE RUKHSADDA (ACTIVATION CODE):
                  </div>
                  <div style={{
                    fontSize: '2.5rem', fontWeight: 900, letterSpacing: '0.3rem',
                    color: 'var(--brand-primary)', fontVariantNumeric: 'tabular-nums',
                    background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)',
                    border: '2px solid var(--brand-primary)',
                  }}>
                    {createdGeeshDetails.activation_code}
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    const txt = `Xogta Geesh App:\nUsername: ${createdGeeshDetails.username}\nPassword: ${createdGeeshDetails.password}\n${createdGeeshDetails.activation_code ? `8-da Lambar: ${createdGeeshDetails.activation_code}\n` : ''}Muddada: ${createdGeeshDetails.duration_summary}`
                    navigator.clipboard.writeText(txt)
                    toast('Xogta oo dhan waa la koobiyay!', 'success')
                  }}
                >
                  📋 Nuqul (Copy Info)
                </button>
                <button className="btn btn-primary" onClick={() => setCreatedGeeshDetails(null)}>
                  Waayahay (Done)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Geesh Operator Subscription Modal ─────────────────── */}
      {showSubModal && selectedOpForSub && (
        <div className="modal-backdrop" onClick={() => setShowSubModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div className="modal-title">🔑 Sii Rukhsad (Geesh: {selectedOpForSub.username})</div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowSubModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {generatedCode ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-3) 0' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                    Sii macmiilka <strong>8-dan lambar</strong> si uu Geesh App-ka ugu shaqaysiiyo:
                  </div>
                  <div style={{
                    fontSize: '3rem', fontWeight: 900, letterSpacing: '0.35rem',
                    color: 'var(--brand-primary)', fontVariantNumeric: 'tabular-nums',
                    background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-xl)',
                    padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-3)',
                    border: '2px solid var(--brand-primary)',
                  }}>
                    {generatedCode}
                  </div>
                  <div style={{ background: 'var(--bg-surface-2)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
                    ⏳ <strong>Muddada:</strong> {subDurationSummary}.
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedCode)
                        toast('8-da lambar waa la koobiyeeyay!', 'success')
                      }}
                    >
                      📋 Nuqul (Copy Code)
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowSubModal(false)}>
                      Dhamaystay (Done)
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 'var(--space-3)' }}>
                    Dooro inta maalmood/saacadood ee aad rabto inaad u furto Geesh App-ka:
                  </p>

                  {/* Presets */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 'var(--space-3)' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '3px 8px', background: subMinutes === 2 && subHours === 0 && subDays === 0 ? 'var(--brand-primary)' : undefined, color: subMinutes === 2 && subHours === 0 && subDays === 0 ? '#fff' : undefined }}
                      onClick={() => { setSubDays(0); setSubHours(0); setSubMinutes(2) }}
                    >
                      ⚡ 2 Daqiiqo (Test)
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '3px 8px', background: subHours === 1 && subDays === 0 && subMinutes === 0 ? 'var(--brand-primary)' : undefined, color: subHours === 1 && subDays === 0 && subMinutes === 0 ? '#fff' : undefined }}
                      onClick={() => { setSubDays(0); setSubHours(1); setSubMinutes(0) }}
                    >
                      1 Saac
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '3px 8px', background: subDays === 1 && subHours === 0 && subMinutes === 0 ? 'var(--brand-primary)' : undefined, color: subDays === 1 && subHours === 0 && subMinutes === 0 ? '#fff' : undefined }}
                      onClick={() => { setSubDays(1); setSubHours(0); setSubMinutes(0) }}
                    >
                      1 Maalin
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '3px 8px', background: subDays === 7 && subHours === 0 && subMinutes === 0 ? 'var(--brand-primary)' : undefined, color: subDays === 7 && subHours === 0 && subMinutes === 0 ? '#fff' : undefined }}
                      onClick={() => { setSubDays(7); setSubHours(0); setSubMinutes(0) }}
                    >
                      7 Maalmood
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '3px 8px', background: subDays === 30 && subHours === 0 && subMinutes === 0 ? 'var(--brand-primary)' : undefined, color: subDays === 30 && subHours === 0 && subMinutes === 0 ? '#fff' : undefined }}
                      onClick={() => { setSubDays(30); setSubHours(0); setSubMinutes(0) }}
                    >
                      30 Maalmood
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 'var(--space-3)' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Maalmood</label>
                      <input
                        type="number"
                        min="0"
                        className="form-input"
                        value={subDays}
                        onChange={e => setSubDays(Math.max(0, parseInt(e.target.value) || 0))}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Saacado</label>
                      <input
                        type="number"
                        min="0"
                        max="23"
                        className="form-input"
                        value={subHours}
                        onChange={e => setSubHours(Math.max(0, parseInt(e.target.value) || 0))}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Daqiiqado</label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        className="form-input"
                        value={subMinutes}
                        onChange={e => setSubMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
                    <button className="btn btn-secondary" onClick={() => setShowSubModal(false)}>Cancel</button>
                    <button
                      className="btn btn-primary"
                      disabled={subLoading || (subDays === 0 && subHours === 0 && subMinutes === 0)}
                      onClick={handleGenerateOpActivationCode}
                    >
                      {subLoading ? 'Soo saarayaa…' : '🔑 Soo saar 8-da Lambar'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
