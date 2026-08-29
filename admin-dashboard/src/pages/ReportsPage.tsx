import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { DashboardStats } from '../types/database'
import { formatSLS, formatNumber } from '../lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'

const STAT_COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#eab308', '#8b5cf6', '#ec4899', '#f97316']

export default function ReportsPage() {
  const { isOperator, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [operatorRowId, setOperatorRowId] = useState<string | null>(null)
  
  const [dateRange, setDateRange] = useState({
    from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd')
  })

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [operatorStats, setOperatorStats] = useState<{ name: string; success: number; failed: number }[]>([])
  const [bundleStats, setBundleStats] = useState<{ name: string; value: number }[]>([])

  // Resolve operator row id for scoping
  useEffect(() => {
    if (!isOperator || !user?.id) return
    supabase.from('operators').select('id').eq('profile_id', user.id).single()
      .then(({ data }) => { if (data) setOperatorRowId(data.id) })
  }, [isOperator, user?.id])

  const loadReport = useCallback(async () => {
    setLoading(true)
    
    const fromDate = startOfDay(new Date(dateRange.from)).toISOString()
    const toDate = endOfDay(new Date(dateRange.to)).toISOString()

    // 1. Overall stats — use operator-scoped RPC if operator
    if (isOperator && operatorRowId) {
      const { data: statsData } = await supabase.rpc('get_operator_stats', {
        p_operator_id: operatorRowId,
        p_from_date: fromDate,
        p_to_date: toDate
      })
      if (statsData) setStats(statsData as unknown as DashboardStats)
    } else if (!isOperator) {
      const { data: statsData } = await supabase.rpc('get_dashboard_stats', { 
        p_from_date: fromDate, 
        p_to_date: toDate 
      })
      if (statsData) setStats(statsData as unknown as DashboardStats)
    }

    // 2. Transactions for charts
    let txQ = supabase
      .from('transactions')
      .select('status, operator_id, bundle_rule:bundle_rules(bundle_name), operator:operators(username)')
      .gte('created_at', fromDate)
      .lte('created_at', toDate)
      .eq('test_mode', false)
    if (isOperator && operatorRowId) txQ = txQ.eq('operator_id', operatorRowId)
    const { data: txns } = await txQ

    if (txns) {
      const opMap: Record<string, { success: number; failed: number }> = {}
      const bndMap: Record<string, number> = {}

      txns.forEach(tx => {
        const opName = (tx.operator as { username?: string })?.username || 'System/Unknown'
        if (!opMap[opName]) opMap[opName] = { success: 0, failed: 0 }
        if (tx.status === 'success') opMap[opName].success++
        else if (tx.status === 'failed') opMap[opName].failed++

        if (tx.status === 'success') {
          const bName = (tx.bundle_rule as { bundle_name?: string })?.bundle_name || 'Custom/Unknown'
          if (!bndMap[bName]) bndMap[bName] = 0
          bndMap[bName]++
        }
      })

      setOperatorStats(Object.entries(opMap).map(([name, data]) => ({ name, ...data })).sort((a,b) => (b.success + b.failed) - (a.success + a.failed)))
      setBundleStats(Object.entries(bndMap).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value))
    }

    setLoading(false)
  }, [dateRange, isOperator, operatorRowId])

  useEffect(() => { loadReport() }, [loadReport])

  const pieData = stats ? [
    { name: 'Success', value: stats.success },
    { name: 'Failed', value: stats.failed },
    { name: 'Pending', value: stats.pending },
    { name: 'Not Found', value: stats.customer_not_found },
    { name: 'Invalid Amt', value: stats.invalid_amount },
    { name: 'Duplicates', value: stats.duplicates },
  ].filter(d => d.value > 0) : []

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title">Reports & Analytics</h1>
          <p className="page-subtitle">{isOperator ? 'Your transaction performance and bundle metrics' : 'Analyze transaction performance and operator metrics'}</p>
        </div>
        
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', background: 'var(--bg-surface)', padding: 'var(--space-2) var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-default)' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: 'var(--space-1)' }}>From</label>
            <input type="date" className="form-input" style={{ padding: '4px 8px' }} value={dateRange.from} onChange={e => setDateRange(r => ({ ...r, from: e.target.value }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: 'var(--space-1)' }}>To</label>
            <input type="date" className="form-input" style={{ padding: '4px 8px' }} value={dateRange.to} onChange={e => setDateRange(r => ({ ...r, to: e.target.value }))} />
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          {Array(4).fill(0).map((_, i) => <div key={i} className="skeleton" style={{ height: 120, flex: '1 1 200px', borderRadius: 'var(--radius-xl)' }} />)}
        </div>
      ) : (
        <>
          <div className="stat-grid" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="stat-card" style={{ '--card-accent': 'var(--brand-primary)' } as React.CSSProperties}>
              <div className="stat-value">{formatNumber(stats?.total ?? 0)}</div>
              <div className="stat-label">Total Volume</div>
            </div>
            <div className="stat-card" style={{ '--card-accent': 'var(--brand-success)' } as React.CSSProperties}>
              <div className="stat-value" style={{ color: 'hsl(142,76%,45%)' }}>
                {stats?.total ? Math.round((stats.success / stats.total) * 100) : 0}%
              </div>
              <div className="stat-label">Success Rate</div>
            </div>
            <div className="stat-card" style={{ '--card-accent': 'var(--brand-accent)' } as React.CSSProperties}>
              <div className="stat-value">{formatSLS(stats?.total_sls_processed ?? 0)}</div>
              <div className="stat-label">SLS Processed</div>
            </div>
            <div className="stat-card" style={{ '--card-accent': 'var(--brand-danger)' } as React.CSSProperties}>
              <div className="stat-value" style={{ color: 'hsl(0,84%,60%)' }}>{formatSLS((stats?.total_sls_attempted ?? 0) - (stats?.total_sls_processed ?? 0))}</div>
              <div className="stat-label">SLS Failed/Lost</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 'var(--space-6)' }}>
            
            {/* Operator Performance chart — only meaningful for admins */}
            {!isOperator && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">Operator Performance</div>
              </div>
              <div className="card-body" style={{ height: 320 }}>
                {operatorStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={operatorStats} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: 'var(--text-muted)' }} />
                      <YAxis dataKey="name" type="category" tick={{ fill: 'var(--text-primary)', fontSize: 12 }} width={100} />
                      <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8 }} />
                      <Legend />
                      <Bar dataKey="success" stackId="a" fill="#22c55e" name="Success" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="failed" stackId="a" fill="#ef4444" name="Failed" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state" style={{ height: '100%' }}><div className="empty-title">No operator data</div></div>
                )}
              </div>
            </div>
            )}

            <div className="card">
              <div className="card-header">
                <div className="card-title">Transaction Status Breakdown</div>
              </div>
              <div className="card-body" style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {pieData.map((_, idx) => <Cell key={idx} fill={STAT_COLORS[idx % STAT_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state" style={{ height: '100%' }}><div className="empty-title">No data</div></div>
                )}
              </div>
            </div>

            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div className="card-header">
                <div className="card-title">Popular Bundles (Successful Recharges)</div>
              </div>
              <div className="card-body" style={{ height: 300 }}>
                {bundleStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bundleStats} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)' }} />
                      <YAxis tick={{ fill: 'var(--text-muted)' }} />
                      <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8 }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                      <Bar dataKey="value" fill="var(--brand-accent)" name="Recharges" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state" style={{ height: '100%' }}><div className="empty-title">No bundle data</div></div>
                )}
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  )
}
