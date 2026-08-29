import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { AuditLog } from '../types/database'
import { formatTime } from '../lib/utils'
import { useAuth } from '../contexts/AuthContext'

export default function AuditLogsPage() {
  const { user, isOperator } = useAuth()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const pageSize = 50

  const loadLogs = useCallback(async (pageIndex: number) => {
    setLoading(true)
    let q = supabase
      .from('audit_logs')
      .select('*, actor:profiles(full_name)')
      .order('created_at', { ascending: false })
      .range(pageIndex * pageSize, (pageIndex + 1) * pageSize - 1)
    // Scope operator to their own log entries
    if (isOperator && user?.id) q = q.eq('actor_id', user.id)
    const { data } = await q
    if (data) setLogs(data as unknown as AuditLog[])
    setLoading(false)
  }, [isOperator, user?.id])

  useEffect(() => { loadLogs(page) }, [loadLogs, page])

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">{isOperator ? 'My Activity Logs' : 'Audit Logs'}</h1>
          <p className="page-subtitle">{isOperator ? 'Track your own system actions' : 'Track system events and operator activities'}</p>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Description</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(10).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(6).fill(0).map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 14, width: '100%' }} /></td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <div className="empty-icon">📋</div>
                      <div className="empty-title">No audit logs found</div>
                    </div>
                  </td>
                </tr>
              ) : logs.map(log => (
                <tr key={log.id}>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {formatTime(log.created_at)}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{(log.actor as any)?.full_name || 'System'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{log.actor_role || 'system'}</div>
                  </td>
                  <td>
                    <span className="badge" style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--brand-primary)' }}>
                      {log.action}
                    </span>
                  </td>
                  <td>
                    {log.resource_type ? (
                      <div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{log.resource_type}</span>
                        <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{log.resource_id}</div>
                      </div>
                    ) : '—'}
                  </td>
                  <td style={{ fontSize: '0.875rem' }}>{log.description || '—'}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{log.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)' }}>
          <button 
            className="btn btn-secondary btn-sm" 
            disabled={page === 0 || loading} 
            onClick={() => setPage(p => p - 1)}
          >
            ← Previous
          </button>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', alignSelf: 'center' }}>
            Page {page + 1}
          </span>
          <button 
            className="btn btn-secondary btn-sm" 
            disabled={logs.length < pageSize || loading} 
            onClick={() => setPage(p => p + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}
