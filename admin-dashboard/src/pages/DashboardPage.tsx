import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Transaction, Device, DashboardStats } from '../types/database'
import { formatSLS, formatNumber, formatTime, txStatusClass, txStatusLabel, deviceStatusClass, timeAgo } from '../lib/utils'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import OperatorDashboardPage from './OperatorDashboardPage'

const STAT_COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#eab308', '#8b5cf6']

export default function DashboardPage() {
  const { isOperator } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentTxns, setRecentTxns] = useState<Transaction[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [chartData, setChartData] = useState<{ name: string; success: number; failed: number; total: number }[]>([])
  const [loading, setLoading] = useState(!isOperator) // Don't block loading if operator

  const loadData = useCallback(async () => {
    if (isOperator) return; // Skip loading admin data for operators
    // Dashboard stats
    const { data: statsData } = await supabase.rpc('get_dashboard_stats')
    if (statsData) setStats(statsData as unknown as DashboardStats)

    // Recent transactions (live)
    const { data: txns } = await supabase
      .from('transactions')
      .select(`*, bundle_rule:bundle_rules(bundle_name, data_amount, data_unit), operator:operators(username)`)
      .order('created_at', { ascending: false })
      .limit(20)
    if (txns) setRecentTxns(txns as Transaction[])

    // Devices
    const { data: devData } = await supabase
      .from('devices')
      .select(`*, operator:operators(username)`)
      .order('last_seen', { ascending: false })
      .limit(12)
    if (devData) setDevices(devData as Device[])

    // Last 7 days chart data
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    const { data: txChart } = await supabase
      .from('transactions')
      .select('status, created_at')
      .gte('created_at', sevenDaysAgo.toISOString())
      .eq('test_mode', false)

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
  }, [])

  useEffect(() => {
    loadData()

    // Realtime: new/updated transactions
    const txChannel = supabase
      .channel('dashboard-transactions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => loadData())
      .subscribe()

    return () => { supabase.removeChannel(txChannel) }
  }, [loadData])

  if (isOperator) {
    return <OperatorDashboardPage />
  }

  if (loading) {
    return (
      <div className="page-container">
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
          {Array(6).fill(0).map((_, i) => <div key={i} className="skeleton" style={{ height: 120, flex: '1 1 180px', borderRadius: 'var(--radius-xl)' }} />)}
        </div>
      </div>
    )
  }

  const pieData = stats ? [
    { name: 'Success', value: stats.success },
    { name: 'Failed', value: stats.failed },
    { name: 'Pending', value: stats.pending },
    { name: 'Unknown', value: stats.unknown },
    { name: 'Not Found', value: stats.customer_not_found },
  ].filter(d => d.value > 0) : []

  const onlineCount = devices.filter(d => {
    const diff = d.last_seen ? (Date.now() - new Date(d.last_seen).getTime()) : Infinity
    return diff < 5 * 60 * 1000
  }).length

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Live system overview — auto-updating</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <span className="pulse-dot" />
          Realtime Active
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid">
        <div className="stat-card" style={{ '--card-accent': 'var(--brand-primary)' } as React.CSSProperties}>
          <div className="stat-card-icon" style={{ background: 'rgba(59,130,246,0.12)', fontSize: '1.25rem' }}>💳</div>
          <div className="stat-value">{formatNumber(stats?.total ?? 0)}</div>
          <div className="stat-label">Total Transactions</div>
        </div>
        <div className="stat-card" style={{ '--card-accent': 'var(--brand-success)' } as React.CSSProperties}>
          <div className="stat-card-icon" style={{ background: 'rgba(34,197,94,0.12)', fontSize: '1.25rem' }}>✅</div>
          <div className="stat-value" style={{ color: 'hsl(142,76%,45%)' }}>{formatNumber(stats?.success ?? 0)}</div>
          <div className="stat-label">Successful</div>
        </div>
        <div className="stat-card" style={{ '--card-accent': 'var(--brand-danger)' } as React.CSSProperties}>
          <div className="stat-card-icon" style={{ background: 'rgba(239,68,68,0.12)', fontSize: '1.25rem' }}>❌</div>
          <div className="stat-value" style={{ color: 'hsl(0,84%,60%)' }}>{formatNumber(stats?.failed ?? 0)}</div>
          <div className="stat-label">Failed</div>
        </div>
        <div className="stat-card" style={{ '--card-accent': 'var(--brand-warning)' } as React.CSSProperties}>
          <div className="stat-card-icon" style={{ background: 'rgba(234,179,8,0.12)', fontSize: '1.25rem' }}>⏳</div>
          <div className="stat-value" style={{ color: 'hsl(38,92%,55%)' }}>{formatNumber(stats?.pending ?? 0)}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card" style={{ '--card-accent': 'var(--brand-accent)' } as React.CSSProperties}>
          <div className="stat-card-icon" style={{ background: 'rgba(20,184,166,0.12)', fontSize: '1.25rem' }}>💰</div>
          <div className="stat-value" style={{ fontSize: '1.4rem' }}>{formatSLS(stats?.total_sls_processed ?? 0)}</div>
          <div className="stat-label">Total Processed</div>
        </div>
        <div className="stat-card" style={{ '--card-accent': 'var(--brand-purple)' } as React.CSSProperties}>
          <div className="stat-card-icon" style={{ background: 'rgba(139,92,246,0.12)', fontSize: '1.25rem' }}>📱</div>
          <div className="stat-value">
            <span style={{ color: 'hsl(142,76%,45%)' }}>{onlineCount}</span>
            <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 400 }}>/{devices.length}</span>
          </div>
          <div className="stat-label">Devices Online</div>
        </div>
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        {/* Area Chart */}
        <div className="card">
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
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="failedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                  />
                  <Area type="monotone" dataKey="success" stroke="#22c55e" strokeWidth={2} fill="url(#successGrad)" name="Success" />
                  <Area type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} fill="url(#failedGrad)" name="Failed" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Status Breakdown</div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {pieData.length > 0 ? (
              <>
                <PieChart width={200} height={160}>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                    {pieData.map((_, idx) => <Cell key={idx} fill={STAT_COLORS[idx % STAT_COLORS.length]} />)}
                  </Pie>
                </PieChart>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: '100%', marginTop: 'var(--space-3)' }}>
                  {pieData.map((d, idx) => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: STAT_COLORS[idx % STAT_COLORS.length] }} />
                        <span style={{ color: 'var(--text-secondary)' }}>{d.name}</span>
                      </div>
                      <span style={{ fontWeight: 700 }}>{d.value}</span>
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

      {/* Live Feed + Devices */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 'var(--space-4)' }}>
        {/* Live Transaction Feed */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Live Transactions</div>
              <div className="card-subtitle">Auto-updates via Supabase Realtime</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <span className="pulse-dot" style={{ width: 6, height: 6 }} />
              LIVE
            </div>
          </div>
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            {recentTxns.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">💳</div>
                <div className="empty-title">No transactions yet</div>
                <div className="empty-desc">Transactions will appear here in real time as operators process payments.</div>
              </div>
            ) : recentTxns.map(tx => (
              <div key={tx.id} className="live-feed-item">
                <div className="feed-time">{formatTime(tx.created_at)}</div>
                <div className="feed-content">
                  <div className="feed-numbers">
                    <span style={{ fontFamily: 'monospace' }}>{tx.telesom_number}</span>
                    <span className="feed-arrow">→</span>
                    <span style={{ color: 'var(--brand-warning)', fontFamily: 'monospace' }}>{formatSLS(tx.amount_sls)}</span>
                    {tx.somtel_number && <><span className="feed-arrow">→</span><span style={{ fontFamily: 'monospace' }}>{tx.somtel_number}</span></>}
                    {tx.bundle_rule && <><span className="feed-arrow">→</span><span style={{ color: 'var(--brand-accent)' }}>{tx.bundle_rule.data_amount}{tx.bundle_rule.data_unit}</span></>}
                  </div>
                  <div className="feed-meta">
                    {(tx.operator as { username?: string })?.username ?? 'Unknown operator'}
                    {tx.test_mode && <span style={{ color: 'var(--brand-warning)', marginLeft: 'var(--space-2)' }}>TEST</span>}
                  </div>
                </div>
                <span className={`badge ${txStatusClass(tx.status)}`}>{txStatusLabel(tx.status)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Device Status */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Gateway Devices</div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{onlineCount}/{devices.length} online</span>
          </div>
          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {devices.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                <div className="empty-icon">📱</div>
                <div className="empty-title">No devices registered</div>
              </div>
            ) : devices.map(dev => {
              const isOnline = dev.last_seen && (Date.now() - new Date(dev.last_seen).getTime()) < 5 * 60 * 1000
              return (
                <div key={dev.id} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-3)', background: 'var(--bg-surface-2)',
                  borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ fontSize: '1.5rem' }}>📱</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {dev.device_name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {(dev.operator as { username?: string })?.username ?? '—'} · {timeAgo(dev.last_seen)}
                    </div>
                  </div>
                  <span className={`badge ${deviceStatusClass(isOnline ? 'online' : dev.status === 'disabled' ? 'disabled' : 'offline')}`}>
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
