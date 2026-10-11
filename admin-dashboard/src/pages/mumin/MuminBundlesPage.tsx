import React, { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { BundleRule } from '../../types/database'

interface OperatorContext {
  operator: {
    id: string
    username: string
  }
}

export default function MuminBundlesPage() {
  const { operator } = useOutletContext<OperatorContext>()
  const [bundles, setBundles] = useState<BundleRule[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!operator?.id) return
    setLoading(true)
    try {
      const { data: opData } = await supabase
        .from('operators')
        .select('profile_id')
        .eq('id', operator.id)
        .maybeSingle()

      const targetId = opData?.profile_id || operator.id

      const { data, error } = await supabase
        .from('bundle_rules')
        .select('*')
        .eq('active', true)
        .eq('created_by', targetId)
        .order('amount_sls', { ascending: true })

      if (error) throw error

      if (data && data.length > 0) {
        setBundles(data)
      } else {
        const { data: tmpl } = await supabase
          .from('bundle_rules')
          .select('*')
          .eq('active', true)
          .eq('is_template', true)
          .order('amount_sls', { ascending: true })
        if (tmpl) setBundles(tmpl)
      }
    } finally {
      setLoading(false)
    }
  }, [operator?.id])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
          Data Bundles & Pricing
        </h1>
        <p style={{ fontSize: '0.82rem', color: '#A7F3D0', margin: '4px 0 0' }}>
          Xidhmadaha data-da ee u fasaxan akoonkaaga (@{operator.username})
        </p>
      </div>

      <div style={styles.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6EE7B7' }}>Loading bundles...</div>
        ) : bundles.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>
            Ma jiraan bundle rules firfircoon hadda.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, padding: 18 }}>
            {bundles.map(b => (
              <div key={b.id} style={styles.bundleBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#FFFFFF' }}>
                    📶 {b.bundle_name}
                  </span>
                  <span style={styles.dataBadge}>
                    {b.data_amount} {b.data_unit}
                  </span>
                </div>

                <div style={{ margin: '12px 0 8px' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#F59E0B', fontFamily: 'monospace' }}>
                    {Number(b.amount_sls).toLocaleString()} SLS
                  </div>
                  {b.cost_price && (
                    <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                      Cost: ${b.cost_price}
                    </div>
                  )}
                </div>

                <div style={styles.ussdRow}>
                  <span style={{ fontSize: '0.72rem', color: '#A7F3D0' }}>USSD Template:</span>
                  <code style={{ fontSize: '0.78rem', color: '#FDE68A', display: 'block', marginTop: 2, wordBreak: 'break-all' }}>
                    {b.ussd_code}
                  </code>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#063C2E',
    border: '1px solid rgba(52, 211, 153, 0.25)',
    borderRadius: 18,
    overflow: 'hidden',
  },
  bundleBox: {
    background: 'rgba(2, 44, 34, 0.8)',
    border: '1px solid rgba(52, 211, 153, 0.2)',
    borderRadius: 14,
    padding: '16px',
  },
  dataBadge: {
    background: 'rgba(16, 185, 129, 0.2)',
    color: '#34D399',
    fontSize: '0.75rem',
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 6,
    border: '1px solid rgba(52, 211, 153, 0.3)',
  },
  ussdRow: {
    background: 'rgba(6, 78, 59, 0.5)',
    padding: '8px 10px',
    borderRadius: 8,
    marginTop: 8,
  },
}
