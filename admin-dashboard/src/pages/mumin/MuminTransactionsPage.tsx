import React, { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import type { Transaction } from '../../types/database'

interface OperatorContext {
  operator: {
    id: string
    username: string
  }
}

type TabType = 'all' | 'success' | 'pending' | 'failed'

export default function MuminTransactionsPage() {
  const { operator } = useOutletContext<OperatorContext>()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (!operator?.id) return
    setLoading(true)
    try {
      let q = supabase
        .from('transactions')
        .select('*, bundle_rule:bundle_rules(bundle_name,data_amount,data_unit)')
        .order('created_at', { ascending: false })
        .limit(100)

      if (operator.id !== 'admin') {
        q = q.eq('operator_id', operator.id)
      }

      if (activeTab === 'success') {
        q = q.eq('status', 'success')
      } else if (activeTab === 'pending') {
        q = q.in('status', ['pending', 'processing', 'ussd_started', 'queued'])
      } else if (activeTab === 'failed') {
        q = q.in('status', ['failed', 'customer_not_found', 'unknown_result', 'invalid_amount'])
      }

      if (search) {
        q = q.ilike('telesom_number', `%${search}%`)
      }

      const { data } = await q
      if (data) setTransactions(data as Transaction[])
    } finally {
      setLoading(false)
    }
  }, [operator?.id, activeTab, search])

  useEffect(() => {
    load()
  }, [load])

  // Realtime updates
  useEffect(() => {
    const ch = supabase.channel('mumin-tx-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        load()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
            Mu'min Transactions
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#A7F3D0', margin: '4px 0 0' }}>
            Liiska dhammaan xidhmadaha data-da ee tooska ah
          </p>
        </div>

        {/* Search */}
        <input
          style={styles.searchInput}
          placeholder="🔍 Raadi number..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <div style={styles.tabsRow}>
        {(['all', 'success', 'pending', 'failed'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...styles.tabBtn,
              background: activeTab === tab ? '#10B981' : 'rgba(2, 44, 34, 0.6)',
              color: activeTab === tab ? '#FFFFFF' : '#A7F3D0',
              fontWeight: activeTab === tab ? 700 : 500,
            }}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Transactions List */}
      <div style={styles.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6EE7B7' }}>Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>
            Wax transaction ah lagama helin xaaladdan.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(52, 211, 153, 0.2)' }}>
                  <th style={styles.th}>Numberka (Sender & Recipient)</th>
                  <th style={styles.th}>Bundle</th>
                  <th style={styles.th}>Qiimaha</th>
                  <th style={styles.th}>Xaaladda</th>
                  <th style={styles.th}>Taariikhda</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid rgba(52, 211, 153, 0.1)' }}>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, color: '#FFFFFF', fontFamily: 'monospace' }}>
                          +252 {tx.telesom_number}
                        </span>
                        <span style={styles.samePill}>Same 🔒</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                        Toos loogu shubay
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={{ fontWeight: 600, color: '#E2E8F0' }}>
                        {tx.bundle_rule?.bundle_name || 'Direct Bundle'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#F59E0B' }}>
                        {Number(tx.amount_sls).toLocaleString()} SLS
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 6,
                          textTransform: 'uppercase',
                          background: tx.status === 'success' ? '#065F46' : tx.status === 'failed' ? '#7F1D1D' : '#78350F',
                          color: tx.status === 'success' ? '#34D399' : tx.status === 'failed' ? '#FCA5A5' : '#FDE68A',
                        }}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td style={{ ...styles.td, fontSize: '0.78rem', color: '#94A3B8' }}>
                      {formatDate(tx.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  searchInput: {
    padding: '8px 14px',
    background: 'rgba(2, 44, 34, 0.8)',
    border: '1px solid rgba(52, 211, 153, 0.3)',
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: '0.85rem',
    outline: 'none',
  },
  tabsRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  tabBtn: {
    padding: '7px 14px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.78rem',
    transition: 'all 0.15s ease',
  },
  card: {
    background: '#063C2E',
    border: '1px solid rgba(52, 211, 153, 0.25)',
    borderRadius: 18,
    overflow: 'hidden',
  },
  th: {
    padding: '12px 16px',
    fontSize: '0.78rem',
    color: '#A7F3D0',
    fontWeight: 600,
  },
  td: {
    padding: '12px 16px',
    fontSize: '0.85rem',
  },
  samePill: {
    fontSize: '0.68rem',
    fontWeight: 700,
    background: 'rgba(16, 185, 129, 0.2)',
    color: '#34D399',
    padding: '1px 6px',
    borderRadius: 4,
    border: '1px solid rgba(52, 211, 153, 0.3)',
  },
}
