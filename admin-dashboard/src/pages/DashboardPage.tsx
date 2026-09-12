import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Transaction, Device, DashboardStats } from '../types/database'
import { formatSLS, formatNumber, formatTime, txStatusClass, txStatusLabel, deviceStatusClass, timeAgo } from '../lib/utils'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

const STAT_COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#64748b']

const PIE_COLORS: Record<string, string> = {
  'Success':    '#22c55e',
  'Failed':     '#ef4444',
  'Pending':    '#f59e0b',
  'Unknown':    '#8b5cf6',
  'Not Found':  '#64748b',
}

function formatUSD(v: number) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

type OperatorRow = { id: string; card_balance: number }

export default function DashboardPage() {
  const { isOperator, user } = useAuth()
  const { toast } = useToast()

  const [operatorRow, setOperatorRow] = useState<OperatorRow | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentTxns, setRecentTxns] = useState<Transaction[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [chartData, setChartData] = useState<{ name: string; success: number; failed: number; total: number }[]>([])
  const [loading, setLoading] = useState(true)

  // Card balance UI state
  const [cardInput, setCardInput] = useState('')
  const [cardSaving, setCardSaving] = useState(false)
  const [showCardForm, setShowCardForm] = useState(false)

  useEffect(() => {
    if (!isOperator || !user?.id) return
    supabase.from('operators').select('id, card_balance').eq('profile_id', user.id).single()
      .then(({ data }) => { if (data) setOperatorRow(data as OperatorRow) })
  }, [isOperator, user?.id])

  const loadData = useCallback(async () => {
    const opId = operatorRow?.id
    if (isOperator && !opId) return

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const fromDate = startOfToday.toISOString()

    let statsData
    if (isOperator && opId) {
      const res = await supabase.rpc('get_operator_stats', { p_operator_id: opId, p_from_date: fromDate })
      statsData = res.data
    } else {
      const res = await supabase.rpc('get_dashboard_stats', { p_from_date: fromDate })
      statsData = res.data
    }
    if (statsData) setStats(statsData as unknown as DashboardStats)

    let txQ = supabase
      .from('transactions')
      .select(`*, bundle_rule:bundle_rules(bundle_name, data_amount, data_unit), operator:operators(username)`)
      .order('created_at', { ascending: false })
      .limit(20)
    if (isOperator && opId) txQ = txQ.eq('operator_id', opId)
    const { data: txns } = await txQ
    if (txns) setRecentTxns(txns as Transaction[])

    let devQ = supabase
      .from('devices')
      .select(`*, operator:operators(username)`)
      .order('last_seen', { ascending: false })
      .limit(12)
    if (isOperator && opId) devQ = devQ.eq('operator_id', opId)
    const { data: devData } = await devQ
    if (devData) setDevices(devData as Device[])

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    let chartQ = supabase.from('transactions').select('status, created_at')
      .gte('created_at', sevenDaysAgo.toISOString()).eq('test_mode', false)
    if (isOperator && opId) chartQ = chartQ.eq('operator_id', opId)
    const { data: txChart } = await chartQ

    if (txChart) {
      const byDay: Record<string, { success: number; failed: number; total: number }> = {}
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i)
        const key = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
        byDay[key] = { success: 0, failed: 0, total: 0 }
      }
      txChart.forEach(tx => {
        const key = new Date(tx.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
        if (byDay[key]) {
          byDay[key].total++
          if (tx.status === 'success') byDay[key].success++
          if (tx.status === 'failed') byDay[key].failed++
        }
      })
      setChartData(Object.entries(byDay).map(([name, v]) => ({ name, ...v })))
    }

    setLoading(false)
  }, [isOperator, operatorRow?.id])

  useEffect(() => {
    loadData()
    const txChannel = supabase.channel('dashboard-transactions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => loadData())
      .subscribe()
    return () => { supabase.removeChannel(txChannel) }
  }, [loadData])

  // Refresh card balance after operator row update
  const refreshCardBalance = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase.from('operators').select('id, card_balance').eq('profile_id', user.id).single()
    if (data) setOperatorRow(data as OperatorRow)
  }, [user?.id])

  async function handleCardUpdate() {
    const val = parseFloat(cardInput)
    if (isNaN(val) || val < 0) { toast('Enter a valid amount', 'error'); return }
    if (!operatorRow) return
    setCardSaving(true)
    const { error } = await supabase.from('operators').update({ card_balance: val }).eq('id', operatorRow.id)
    if (error) { toast(error.message, 'error') }
    else {
      toast(`Card balance updated to ${formatUSD(val)}`, 'success')
      setShowCardForm(false)
      setCardInput('')
      refreshCardBalance()
    }
    setCardSaving(false)
  }

  if (loading) {
    return (
      <div className="page-container">
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
          {Array(6).fill(0).map((_, i) => <div key={i} className="skeleton" style={{ height: 140, flex: '1 1 180px', borderRadius: 'var(--radius-xl)' }} />)}
        </div>
      </div>
    )
  }

  const pieData = stats ? [
    { name: 'Success',   value: stats.success },
    { name: 'Failed',    value: stats.failed },
    { name: 'Pending',   value: stats.pending },
    { name: 'Unknown',   value: stats.unknown },
    { name: 'Not Found', value: stats.customer_not_found },
  ].filter(d => d.value > 0) : []

  const onlineCount = devices.filter(d => d.last_seen && (Date.now() - new Date(d.last_seen).getTime()) < 5 * 60 * 1000).length

  const totalToday = stats?.total ?? 0
  const successRate = totalToday > 0 ? Math.round(((stats?.success ?? 0) / totalToday) * 100) : 0

  const cardBalance = operatorRow?.card_balance ?? 0
  const isLowBalance = cardBalance < 5
  const isVeryLowBalance = cardBalance < 2

  const statCards = [
    {
      icon: '📊',
      label: "Today's Transactions",
      value: formatNumber(totalToday),
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
      bg: 'rgba(59,130,246,0.08)',
      border: 'rgba(59,130,246,0.2)',
      glow: 'rgba(59,130,246,0.15)',
      sub: `${successRate}% success rate`,
    },
    {
      icon: '✅',
      label: "Today's Success",
      value: formatNumber(stats?.success ?? 0),
      gradient: 'linear-gradient(135deg, #22c55e 0%, #10b981 100%)',
      bg: 'rgba(34,197,94,0.08)',
      border: 'rgba(34,197,94,0.2)',
      glow: 'rgba(34,197,94,0.15)',
      sub: 'Completed',
      valueColor: '#22c55e',
    },
    {
      icon: '❌',
      label: "Today's Failed",
      value: formatNumber(stats?.failed ?? 0),
      gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      bg: 'rgba(239,68,68,0.08)',
      border: 'rgba(239,68,68,0.2)',
      glow: 'rgba(239,68,68,0.15)',
      sub: 'Need attention',
      valueColor: '#ef4444',
    },
    {
      icon: '⏳',
      label: "Processing / Pending",
      value: formatNumber(stats?.pending ?? 0),
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      bg: 'rgba(245,158,11,0.08)',
      border: 'rgba(245,158,11,0.2)',
      glow: 'rgba(245,158,11,0.15)',
      sub: 'In queue',
      valueColor: '#f59e0b',
    },
    {
      icon: '💰',
      label: "Today's Processed",
      value: formatSLS(stats?.total_sls_processed ?? 0),
      gradient: 'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)',
      bg: 'rgba(20,184,166,0.08)',
      border: 'rgba(20,184,166,0.2)',
      glow: 'rgba(20,184,166,0.15)',
      sub: 'SLS collected',
      valueColor: '#14b8a6',
      smallValue: true,
    },
    {
      icon: '📱',
      label: 'Devices Online',
      value: `${onlineCount}/${devices.length}`,
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
      bg: 'rgba(139,92,246,0.08)',
      border: 'rgba(139,92,246,0.2)',
      glow: 'rgba(139,92,246,0.15)',
      sub: `${devices.length - onlineCount} offline`,
      valueColor: onlineCount > 0 ? '#22c55e' : '#ef4444',
    },
  ]

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title" style={{ background: 'linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Dashboard
          </h1>
          <p className="page-subtitle">Live system overview — auto-updating every change</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(34,197,94,0.08)', padding: '6px 12px', borderRadius: 'var(--radius-full)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <span className="pulse-dot" />
          Realtime Active
        </div>
      </div>

      {/* ── CARD BALANCE BANNER (Operator only) ──────────────────── */}
      {isOperator && operatorRow && (
        <div style={{
          marginBottom: 'var(--space-5)',
          background: isVeryLowBalance
            ? 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.04))'
            : isLowBalance
              ? 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))'
              : 'linear-gradient(135deg, rgba(20,184,166,0.1), rgba(59,130,246,0.06))',
          border: `1px solid ${isVeryLowBalance ? 'rgba(239,68,68,0.3)' : isLowBalance ? 'rgba(245,158,11,0.3)' : 'rgba(20,184,166,0.25)'}`,
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5) var(--space-6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          boxShadow: isVeryLowBalance ? '0 0 30px rgba(239,68,68,0.1)' : '0 0 30px rgba(20,184,166,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            {/* Icon */}
            <div style={{
              width: 56, height: 56,
              borderRadius: 'var(--radius-lg)',
              background: isVeryLowBalance ? 'rgba(239,68,68,0.15)' : isLowBalance ? 'rgba(245,158,11,0.15)' : 'rgba(20,184,166,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem',
              boxShadow: isVeryLowBalance ? '0 4px 16px rgba(239,68,68,0.2)' : '0 4px 16px rgba(20,184,166,0.2)',
            }}>
              {isVeryLowBalance ? '🪫' : isLowBalance ? '⚠️' : '💳'}
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 600 }}>
                Sender Card Balance
              </div>
              <div style={{
                fontSize: '2.2rem', fontWeight: 900, lineHeight: 1.1,
                color: isVeryLowBalance ? '#ef4444' : isLowBalance ? '#f59e0b' : '#14b8a6',
                fontFamily: 'monospace',
                textShadow: isVeryLowBalance ? '0 0 20px rgba(239,68,68,0.4)' : '0 0 20px rgba(20,184,166,0.3)',
              }}>
                {formatUSD(cardBalance)}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {isVeryLowBalance ? '🔴 Very Low — Top up immediately!' : isLowBalance ? '🟡 Low balance — Top up soon' : '🟢 Balance looks good'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            {showCardForm ? (
              <>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    style={{ width: 120, textAlign: 'center', fontFamily: 'monospace', fontSize: '1rem', fontWeight: 700 }}
                    placeholder="0.00"
                    value={cardInput}
                    onChange={e => setCardInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCardUpdate()}
                    autoFocus
                  />
                </div>
                <button className="btn btn-success" style={{ minWidth: 90 }} onClick={handleCardUpdate} disabled={cardSaving}>
                  {cardSaving ? '...' : '💾 Save'}
                </button>
                <button className="btn btn-ghost" onClick={() => { setShowCardForm(false); setCardInput('') }}>Cancel</button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                style={{ background: 'linear-gradient(135deg, #14b8a6, #3b82f6)', border: 'none', padding: '10px 20px', fontWeight: 700, boxShadow: '0 4px 15px rgba(20,184,166,0.25)' }}
                onClick={() => { setShowCardForm(true); setCardInput(String(cardBalance)) }}
              >
                ✏️ Update Balance
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── STAT CARDS ─────────────────────────────────────────────── */}
      <div className="stat-grid" style={{ marginBottom: 'var(--space-5)' }}>
        {statCards.map((card, i) => (
          <div key={i} className="stat-card" style={{
            background: `linear-gradient(145deg, ${card.bg.replace('0.08', '0.12')} 0%, var(--bg-surface) 100%)`,
            border: `1px solid ${card.border}`,
            boxShadow: `0 4px 24px ${card.glow}, inset 0 1px 0 rgba(255,255,255,0.04)`,
            '--card-accent': card.gradient,
          } as React.CSSProperties}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: card.gradient, borderRadius: '16px 16px 0 0' }} />
            <div style={{
              width: 44, height: 44, borderRadius: 'var(--radius-md)',
              background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.3rem', marginBottom: 'var(--space-4)',
              boxShadow: `0 2px 8px ${card.glow}`,
            }}>
              {card.icon}
            </div>
            <div style={{
              fontSize: card.smallValue ? '1.4rem' : '2rem',
              fontWeight: 900,
              color: card.valueColor ?? 'var(--text-primary)',
              lineHeight: 1,
              marginBottom: 'var(--space-2)',
              fontFamily: 'monospace',
              letterSpacing: '-0.02em',
            }}>
              {card.value}
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {card.label}
            </div>
            {card.sub && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>{card.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* ── CHARTS ROW ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        {/* Area Chart */}
        <div className="card" style={{ boxShadow: '0 4px 24px rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.12)' }}>
          <div className="card-header">
            <div>
              <div className="card-title">Transaction Volume — Last 7 Days</div>
              <div className="card-subtitle">Success vs Failed comparison</div>
            </div>
          </div>
          <div className="card-body">
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="failedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 12 }} labelStyle={{ color: 'var(--text-primary)' }} />
                  <Area type="monotone" dataKey="success" stroke="#22c55e" strokeWidth={2.5} fill="url(#successGrad)" name="Success" dot={{ fill: '#22c55e', r: 3 }} />
                  <Area type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2.5} fill="url(#failedGrad)" name="Failed" dot={{ fill: '#ef4444', r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="card" style={{ boxShadow: '0 4px 24px rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
          <div className="card-header">
            <div className="card-title">Status Breakdown</div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {pieData.length > 0 ? (
              <>
                <PieChart width={200} height={160}>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={4} dataKey="value">
                    {pieData.map((d, idx) => <Cell key={idx} fill={PIE_COLORS[d.name] ?? STAT_COLORS[idx % STAT_COLORS.length]} />)}
                  </Pie>
                </PieChart>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: '100%', marginTop: 'var(--space-3)' }}>
                  {pieData.map((d) => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', padding: '4px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: PIE_COLORS[d.name], boxShadow: `0 0 6px ${PIE_COLORS[d.name]}66` }} />
                        <span style={{ color: 'var(--text-secondary)' }}>{d.name}</span>
                      </div>
                      <span style={{ fontWeight: 700, color: PIE_COLORS[d.name] }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                <div className="empty-icon">📊</div>
                <div className="empty-title">No data yet</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── LIVE FEED + DEVICES ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 'var(--space-4)' }}>
        {/* Live Transaction Feed */}
        <div className="card" style={{ boxShadow: '0 4px 24px rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.1)' }}>
          <div className="card-header">
            <div>
              <div className="card-title">Live Transactions</div>
              <div className="card-subtitle">Auto-updates via Supabase Realtime</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '0.72rem', fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '4px 10px', borderRadius: 'var(--radius-full)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <span className="pulse-dot" style={{ width: 6, height: 6 }} />
              LIVE
            </div>
          </div>
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            {recentTxns.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">💳</div>
                <div className="empty-title">No transactions yet</div>
                <div className="empty-desc">Transactions will appear here in real time.</div>
              </div>
            ) : recentTxns.map(tx => (
              <div key={tx.id} className="live-feed-item" style={{ borderBottom: '1px solid var(--border-subtle)', padding: 'var(--space-3) var(--space-4)' }}>
                <div className="feed-time" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: 68 }}>{formatTime(tx.created_at)}</div>
                <div className="feed-content" style={{ flex: 1 }}>
                  <div className="feed-numbers" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem' }}>{tx.telesom_number}</span>
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <span style={{ color: '#f59e0b', fontFamily: 'monospace', fontWeight: 700 }}>{formatSLS(tx.amount_sls)}</span>
                    {tx.somtel_number && <><span style={{ color: 'var(--text-muted)' }}>→</span><span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{tx.somtel_number}</span></>}
                    {tx.bundle_rule && <><span style={{ color: 'var(--text-muted)' }}>→</span><span style={{ color: '#14b8a6', fontWeight: 700 }}>{(tx.bundle_rule as { data_amount: number; data_unit: string }).data_amount}{(tx.bundle_rule as { data_amount: number; data_unit: string }).data_unit}</span></>}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {(tx.operator as { username?: string })?.username ?? 'Unknown operator'}
                    {tx.test_mode && <span style={{ color: '#f59e0b', marginLeft: 8, fontWeight: 700 }}>TEST</span>}
                  </div>
                </div>
                <span className={`badge ${txStatusClass(tx.status)}`} style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em' }}>{txStatusLabel(tx.status)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Gateway Devices */}
        <div className="card" style={{ boxShadow: '0 4px 24px rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.1)' }}>
          <div className="card-header">
            <div className="card-title">Gateway Devices</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: onlineCount > 0 ? '#22c55e' : '#ef4444', display: 'inline-block', boxShadow: onlineCount > 0 ? '0 0 8px #22c55e' : 'none' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{onlineCount}/{devices.length} online</span>
            </div>
          </div>
          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {devices.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                <div className="empty-icon">📱</div>
                <div className="empty-title">No devices registered</div>
              </div>
            ) : devices.map(dev => {
              const isOnline = dev.last_seen && (Date.now() - new Date(dev.last_seen).getTime()) < 5 * 60 * 1000
              const statusColor = isOnline ? '#22c55e' : dev.status === 'disabled' ? '#64748b' : '#ef4444'
              return (
                <div key={dev.id} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-4)',
                  background: isOnline ? 'rgba(34,197,94,0.04)' : 'var(--bg-surface-2)',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${isOnline ? 'rgba(34,197,94,0.15)' : 'var(--border-subtle)'}`,
                  transition: 'all 0.2s ease',
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: statusColor,
                    flexShrink: 0,
                    boxShadow: isOnline ? `0 0 8px ${statusColor}` : 'none',
                    animation: isOnline ? 'pulse-glow 2s infinite' : 'none',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {dev.device_name}
                      {dev.battery_level != null && (
                        <span style={{
                          fontSize: '0.65rem',
                          color: dev.battery_level > 20 ? '#22c55e' : '#ef4444',
                          background: dev.battery_level > 20 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                          padding: '1px 6px', borderRadius: 12,
                        }}>
                          {dev.is_charging ? '⚡' : '🔋'} {dev.battery_level}%
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {(dev.operator as { username?: string })?.username ?? '—'} · {timeAgo(dev.last_seen)}
                    </div>
                  </div>
                  <span className={`badge ${deviceStatusClass(isOnline ? 'online' : dev.status === 'disabled' ? 'disabled' : 'offline')}`} style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>
                    {isOnline ? 'ONLINE' : dev.status === 'disabled' ? 'DISABLED' : 'OFFLINE'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
