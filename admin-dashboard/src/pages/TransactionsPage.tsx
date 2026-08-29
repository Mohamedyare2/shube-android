import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Transaction, TransactionEvent, BundleRule } from '../types/database'
import {
  formatSLS, formatDateTime, formatDate, txStatusClass, txStatusLabel,
  duration, exportCsv
} from '../lib/utils'
import { useAuth } from '../contexts/AuthContext'

const STATUS_OPTIONS = [
  'all', 'success', 'failed', 'pending', 'processing',
  'customer_not_found', 'invalid_amount', 'duplicate', 'unknown_result',
  'ussd_interaction_required', 'queued',
]

const PAGE_SIZE = 25

export default function TransactionsPage() {
  const { isOperator, user } = useAuth()
  // Resolve operator row id once
  const [operatorRowId, setOperatorRowId] = useState<string | null>(null)
  useEffect(() => {
    if (!isOperator || !user?.id) return
    supabase.from('operators').select('id').eq('profile_id', user.id).single()
      .then(({ data }) => { if (data) setOperatorRowId(data.id) })
  }, [isOperator, user?.id])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [events, setEvents] = useState<TransactionEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('transactions')
      .select(`*, bundle_rule:bundle_rules(bundle_name,data_amount,data_unit), operator:operators(username), device:devices(device_name)`, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    // Scope to operator's own transactions
    if (isOperator && operatorRowId) q = q.eq('operator_id', operatorRowId)

    if (statusFilter !== 'all') q = q.eq('status', statusFilter)
    if (search) q = q.or(`telesom_number.ilike.%${search}%,somtel_number.ilike.%${search}%,telesom_transaction_id.ilike.%${search}%`)
    if (dateFrom) q = q.gte('created_at', dateFrom)
    if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59')

    const { data, count } = await q
    if (data) setTransactions(data as Transaction[])
    if (count !== null) setTotal(count)
    setLoading(false)
  }, [page, statusFilter, search, dateFrom, dateTo, isOperator, operatorRowId])

  useEffect(() => { load() }, [load])

  // Realtime subscription
  useEffect(() => {
    const ch = supabase.channel('tx-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  async function openDetail(tx: Transaction) {
    setSelected(tx)
    setEventsLoading(true)
    const { data } = await supabase
      .from('transaction_events')
      .select('*')
      .eq('transaction_id', tx.id)
      .order('created_at', { ascending: true })
    setEvents((data ?? []) as TransactionEvent[])
    setEventsLoading(false)
  }

  async function handleExport() {
    let q = supabase
      .from('transactions')
      .select('id,telesom_number,amount_sls,currency,telesom_transaction_id,somtel_number,status,failure_reason,created_at,completed_at,test_mode')
      .order('created_at', { ascending: false })
      .limit(10000)
    if (isOperator && operatorRowId) q = q.eq('operator_id', operatorRowId)
    const { data } = await q
    if (data) exportCsv(data, 'shube_transactions')
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const eventDotClass = (type: string) => {
    if (type === 'success') return 'success'
    if (['failed', 'customer_not_found', 'invalid_amount'].includes(type)) return 'failed'
    if (['processing', 'ussd_started', 'authenticating', 'confirming'].includes(type)) return 'processing'
    if (['pending', 'ussd_interaction_required'].includes(type)) return 'pending'
    return 'default'
  }

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title">{isOperator ? 'My Transactions' : 'All Transactions'}</h1>
          <p className="page-subtitle">{total.toLocaleString()} total transactions</p>
        </div>
        <button className="btn btn-secondary" onClick={handleExport}>📥 Export CSV</button>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="card-body" style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', padding: 'var(--space-4) var(--space-5)' }}>
          <div className="search-bar" style={{ maxWidth: 280 }}>
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              placeholder="Search number or ref..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
            />
          </div>
          <select className="filter-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0) }}>
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s === 'all' ? 'All Statuses' : txStatusLabel(s as Transaction['status'])}</option>
            ))}
          </select>
          <input type="date" className="filter-select" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0) }} title="From date" />
          <input type="date" className="filter-select" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0) }} title="To date" />
          {(search || statusFilter !== 'all' || dateFrom || dateTo) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setStatusFilter('all'); setDateFrom(''); setDateTo(''); setPage(0) }}>✕ Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrapper" style={{ borderRadius: 'var(--radius-xl)', border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Telesom</th>
                <th>Amount</th>
                <th>Somtel</th>
                <th>Bundle</th>
                <th>Operator</th>
                <th>Status</th>
                <th>Duration</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(8).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(9).fill(0).map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 16, width: j === 0 ? 120 : 80 }} /></td>
                    ))}
                  </tr>
                ))
              ) : transactions.length === 0 ? (
                <tr><td colSpan={9}>
                  <div className="empty-state">
                    <div className="empty-icon">💳</div>
                    <div className="empty-title">No transactions found</div>
                    <div className="empty-desc">Try adjusting your filters</div>
                  </div>
                </td></tr>
              ) : transactions.map(tx => (
                <tr key={tx.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(tx)}>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {formatDate(tx.created_at)}<br />
                    {new Date(tx.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td className="table-mono">{tx.telesom_number}</td>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{formatSLS(tx.amount_sls)}</td>
                  <td className="table-mono">{tx.somtel_number ?? '—'}</td>
                  <td style={{ fontSize: '0.8rem' }}>
                    {tx.bundle_rule
                      ? `${(tx.bundle_rule as BundleRule).data_amount}${(tx.bundle_rule as BundleRule).data_unit}`
                      : '—'}
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>{(tx.operator as { username?: string })?.username ?? '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
                      <span className={`badge ${txStatusClass(tx.status)}`}>{txStatusLabel(tx.status)}</span>
                      {tx.test_mode && <span className="badge badge-pending">TEST</span>}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {duration(tx.processing_started_at, tx.completed_at)}
                  </td>
                  <td><button className="btn btn-ghost btn-sm btn-icon">👁</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="pagination">
          <div className="pagination-info">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
          </div>
          <div className="pagination-controls">
            <button className="pagination-btn" disabled={page === 0} onClick={() => setPage(0)}>«</button>
            <button className="pagination-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = Math.max(0, Math.min(page - 2, totalPages - 5)) + i
              return <button key={p} className={`pagination-btn${p === page ? ' active' : ''}`} onClick={() => setPage(p)}>{p + 1}</button>
            })}
            <button className="pagination-btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
            <button className="pagination-btn" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
          </div>
        </div>
      </div>

      {/* Transaction Detail Modal */}
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Transaction Detail</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 4 }}>
                  {selected.id}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <span className={`badge ${txStatusClass(selected.status)}`}>{txStatusLabel(selected.status)}</span>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setSelected(null)}>✕</button>
              </div>
            </div>
            <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
              {/* Left: Details */}
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {[
                    ['Telesom Number', selected.telesom_number],
                    ['Amount', formatSLS(selected.amount_sls)],
                    ['Currency', selected.currency],
                    ['Telesom Ref', selected.telesom_transaction_id ?? '—'],
                    ['Somtel Number', selected.somtel_number ?? '—'],
                    ['Bundle', selected.bundle_rule ? `${(selected.bundle_rule as BundleRule).data_amount}${(selected.bundle_rule as BundleRule).data_unit}` : '—'],
                    ['Operator', (selected.operator as { username?: string })?.username ?? '—'],
                    ['Device', (selected.device as { device_name?: string })?.device_name ?? '—'],
                    ['Created', formatDateTime(selected.created_at)],
                    ['Completed', formatDateTime(selected.completed_at)],
                    ['Duration', duration(selected.processing_started_at, selected.completed_at)],
                    ['Test Mode', selected.test_mode ? '✅ Yes' : 'No'],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                      <span style={{ fontWeight: 500, fontFamily: typeof value === 'string' && value.match(/^0\d/) ? 'monospace' : 'inherit' }}>{value}</span>
                    </div>
                  ))}
                  {selected.failure_reason && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: '0.8rem', color: 'hsl(0,84%,65%)' }}>
                      ⚠️ {selected.failure_reason}
                    </div>
                  )}
                  {selected.sms_body && (
                    <div style={{ background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {selected.sms_body}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Timeline */}
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 'var(--space-4)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Transaction Timeline
                </div>
                {eventsLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {Array(5).fill(0).map((_, i) => <div key={i} className="skeleton" style={{ height: 48 }} />)}
                  </div>
                ) : events.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No timeline events recorded.</div>
                ) : (
                  <div className="timeline">
                    {events.map((ev, idx) => (
                      <div key={ev.id} className="timeline-item">
                        <div className="timeline-line">
                          <div className={`timeline-dot ${eventDotClass(ev.event_type)}`}>
                            {idx + 1}
                          </div>
                          {idx < events.length - 1 && <div className="timeline-connector" />}
                        </div>
                        <div className="timeline-content">
                          <div className="timeline-title">{txStatusLabel(ev.event_type as Transaction['status'])}</div>
                          {ev.description && <div className="timeline-desc">{ev.description}</div>}
                          <div className="timeline-time">{formatDateTime(ev.created_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
