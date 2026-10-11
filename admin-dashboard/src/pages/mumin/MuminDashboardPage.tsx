import React, { useState, useEffect, useCallback } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import type { BundleRule, Transaction } from '../../types/database'

interface OperatorContext {
  operator: {
    id: string
    username: string
    card_balance?: number
  }
}

export default function MuminDashboardPage() {
  const { operator } = useOutletContext<OperatorContext>()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [bundles, setBundles] = useState<BundleRule[]>([])
  const [loadingBundles, setLoadingBundles] = useState(true)
  const [selectedBundleId, setSelectedBundleId] = useState<string>('')

  // The Payment-Sending Number (trusted source)
  const [senderNumber, setSenderNumber] = useState('')
  
  // Transaction processing state
  const [processing, setProcessing] = useState(false)
  const [latestTx, setLatestTx] = useState<Transaction | null>(null)
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [loadingRecent, setLoadingRecent] = useState(true)

  // Load operator's configured bundles
  const loadBundles = useCallback(async () => {
    if (!operator?.id) return
    setLoadingBundles(true)
    try {
      // Find operator profile id
      const { data: opData } = await supabase
        .from('operators')
        .select('profile_id')
        .eq('id', operator.id)
        .maybeSingle()

      const targetId = opData?.profile_id || operator.id

      // Fetch operator-specific bundles
      const { data, error } = await supabase
        .from('bundle_rules')
        .select('*')
        .eq('active', true)
        .eq('created_by', targetId)
        .order('amount_sls', { ascending: true })

      if (error) throw error

      if (data && data.length > 0) {
        setBundles(data)
        setSelectedBundleId(data[0].id)
      } else {
        // Fallback to template bundles if operator has none configured
        const { data: tmpl } = await supabase
          .from('bundle_rules')
          .select('*')
          .eq('active', true)
          .eq('is_template', true)
          .order('amount_sls', { ascending: true })

        if (tmpl && tmpl.length > 0) {
          setBundles(tmpl)
          setSelectedBundleId(tmpl[0].id)
        }
      }
    } catch (err) {
      console.error('Error loading bundles:', err)
      toast('Could not load data bundles', 'error')
    } finally {
      setLoadingBundles(false)
    }
  }, [operator?.id, toast])

  // Load recent transactions for this operator
  const loadRecent = useCallback(async () => {
    if (!operator?.id) return
    setLoadingRecent(true)
    try {
      let q = supabase
        .from('transactions')
        .select('*, bundle_rule:bundle_rules(bundle_name,data_amount,data_unit)')
        .order('created_at', { ascending: false })
        .limit(6)

      if (operator.id !== 'admin') {
        q = q.eq('operator_id', operator.id)
      }

      const { data } = await q
      if (data) setRecentTransactions(data as Transaction[])
    } finally {
      setLoadingRecent(false)
    }
  }, [operator?.id])

  useEffect(() => {
    loadBundles()
    loadRecent()
  }, [loadBundles, loadRecent])

  // Realtime subscription for transactions
  useEffect(() => {
    const ch = supabase.channel('mumin-dashboard-tx')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        loadRecent()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadRecent])

  // Selected bundle object
  const selectedBundle = bundles.find(b => b.id === selectedBundleId)

  // Clean numeric phone
  const cleanSender = senderNumber.replace(/\D/g, '')

  // CRITICAL REQUIREMENT: Recipient number is AUTOMATICALLY and STRICTLY identical to sender number!
  // There is NO separate recipient input field.
  const recipientNumber = cleanSender

  // Generate the USSD code based on bundle rule template
  const generatedUssd = React.useMemo(() => {
    if (!selectedBundle || !recipientNumber) return ''
    const template = selectedBundle.ussd_code || '*137*{somtel_number}*{bundle_option}*00000#'
    // In Mu'min App, {somtel_number} is replaced by the sender number (recipient = sender)
    return template
      .replace('{somtel_number}', recipientNumber)
      .replace('{number}', recipientNumber)
      .replace('{bundle_option}', selectedBundle.ussd_option || '1')
      .replace('{lacag}', String(selectedBundle.amount_sls || '0'))
  }, [selectedBundle, recipientNumber])

  // Handle USSD Transaction Execution
  async function handleExecuteTransaction() {
    if (!cleanSender) {
      toast('Fadlan geli numberka lacagta laga helay (Sender Number)', 'error')
      return
    }

    if (cleanSender.length !== 9) {
      toast('Numberka waa inuu ahaadaa 9 nambar (Tusaale: 634284015). Ha ku darin 0 hore.', 'error')
      return
    }

    if (!selectedBundle) {
      toast('Fadlan dooro xidhmada data-da (Data Bundle)', 'error')
      return
    }

    // Safety check: ensure recipient is identical to sender
    if (recipientNumber !== cleanSender) {
      toast('Khalad amni: Recipient number differs from sender number!', 'error')
      return
    }

    setProcessing(true)
    try {
      // 1. Get paired device id if exists
      const { data: dev } = await supabase
        .from('devices')
        .select('id')
        .eq('operator_id', operator.id)
        .eq('status', 'online')
        .maybeSingle()

      const nowIso = new Date().toISOString()
      const smsHash = `mumin_manual_${Date.now()}_${cleanSender}`

      // 2. Create transaction record with IDENTICAL sender & recipient
      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          operator_id: operator.id === 'admin' ? null : operator.id,
          device_id: dev?.id || null,
          telesom_number: cleanSender,    // Payment-sending number
          somtel_number: recipientNumber, // Data bundle recipient (EXACTLY IDENTICAL)
          amount_sls: selectedBundle.amount_sls,
          currency: 'SLS',
          bundle_rule_id: selectedBundle.id,
          status: 'processing',
          sms_hash: smsHash,
          sms_body: `Mu'min App: Data bundle ${selectedBundle.bundle_name} requested for ${recipientNumber}`,
          test_mode: false,
          created_at: nowIso,
          processing_started_at: nowIso,
        })
        .select()
        .single()

      if (txErr) throw txErr

      setLatestTx(tx as Transaction)

      // 3. Log event
      await supabase.from('transaction_events').insert({
        transaction_id: tx.id,
        event_type: 'mumin_bundle_initiated',
        description: `Mu'min App: Sent ${selectedBundle.bundle_name} to same sender number (${recipientNumber})`,
        metadata: {
          ussd_code: generatedUssd,
          recipient_rule: 'automatic_same_as_sender',
        },
      })

      toast(`Xidhmada ${selectedBundle.bundle_name} waa la bilaabay!`, 'success')
      setSenderNumber('')
      loadRecent()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Dhib ayaa dhacay intii lagu guda jiray hawsha', 'error')
    } finally {
      setProcessing(false)
    }
  }

  // Pre-fill from recent transaction if clicked
  function selectFromRecent(tx: Transaction) {
    if (tx.telesom_number) {
      setSenderNumber(tx.telesom_number)
      toast(`Numberka ${tx.telesom_number} waa la xushay`, 'info')
    }
  }

  return (
    <div>
      {/* Top Welcome & Mode Banner */}
      <div style={styles.banner}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 24 }}>✨</span>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#FFFFFF' }}>
              Mu'min Direct Fulfillment Engine
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#A7F3D0', margin: '4px 0 0' }}>
              Habka tooska ah: Xidhmada data-da waxaa toos loogu shubayaa <strong>isla numberka</strong> lacagta laga helay.
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Execution Form + Live Activity */}
      <div style={styles.grid}>
        {/* Left Column: The Direct Execution Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={{ fontSize: 20 }}>⚡</span>
            <h3 style={styles.cardTitle}>Shub Xidhmada Data-da (Send Bundle)</h3>
          </div>

          <div style={{ padding: '20px 18px' }}>
            {/* Field 1: Payment-Sending Number */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>
                1. Numberka Lacagta Kasoo Diray (Payment Sender Phone)
                <span style={{ color: '#10B981', marginLeft: 4 }}>*</span>
              </label>
              <div style={styles.inputWrapper}>
                <span style={styles.inputPrefix}>+252</span>
                <input
                  style={styles.input}
                  type="tel"
                  inputMode="numeric"
                  placeholder="63XXXXXXX (Tusaale: 634284015)"
                  value={senderNumber}
                  onChange={e => setSenderNumber(e.target.value.replace(/\D/g, '').slice(0, 9))}
                />
              </div>
              <span style={styles.fieldHint}>
                Geli 9-ka nambar ee Telesom/ZAAD ee lacagtu kasoo dhacday.
              </span>
            </div>

            {/* Field 2: Recipient Phone (LOCKED & AUTOMATICALLY SAME!) */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>
                2. Numberka Data-da Lagu Shubayo (Bundle Recipient)
                <span style={styles.lockedBadge}>🔒 Qasab Ku Xiran (Locked)</span>
              </label>
              <div style={styles.lockedBox}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>📱</span>
                  <span style={{ fontWeight: 800, fontSize: '1.1rem', fontFamily: 'monospace', color: cleanSender ? '#10B981' : '#64748B' }}>
                    {cleanSender ? `+252 ${cleanSender}` : 'Waiting for sender number...'}
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#A7F3D0', fontWeight: 600 }}>
                  ✓ Identical to Sender
                </span>
              </div>
              <div style={styles.ruleNotice}>
                🛡️ <strong>Sharciga Mu'min App:</strong> Ma jiro sanduuq kale oo la gelin karo recipient kale. 
                Data-du waxay si toos ah ugu dhacaysaa numberka lacagta kasoo diray.
              </div>
            </div>

            {/* Field 3: Select Bundle */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>
                3. Dooro Xidhmada Data-da (Select Data Bundle)
                <span style={{ color: '#10B981', marginLeft: 4 }}>*</span>
              </label>

              {loadingBundles ? (
                <div style={{ padding: 16, textAlign: 'center', color: '#6EE7B7' }}>Loading bundles...</div>
              ) : bundles.length === 0 ? (
                <div style={{ padding: 12, background: 'rgba(239,68,68,0.15)', borderRadius: 10, color: '#FCA5A5', fontSize: '0.85rem' }}>
                  Ma jiro bundle rules la habeeyay. Fadlan u gudub qaybta Bundles si aad u abuurto.
                </div>
              ) : (
                <div style={styles.bundlesGrid}>
                  {bundles.map(b => {
                    const isSelected = selectedBundleId === b.id
                    return (
                      <div
                        key={b.id}
                        onClick={() => setSelectedBundleId(b.id)}
                        style={{
                          ...styles.bundleCard,
                          borderColor: isSelected ? '#10B981' : 'rgba(52, 211, 153, 0.2)',
                          background: isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(2, 44, 34, 0.6)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 800, color: '#FFFFFF', fontSize: '0.95rem' }}>
                            📶 {b.bundle_name}
                          </span>
                          {isSelected && <span style={{ color: '#10B981', fontSize: 16 }}>✓</span>}
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#F59E0B', marginTop: 4, fontFamily: 'monospace' }}>
                          {Number(b.amount_sls).toLocaleString()} SLS
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 2 }}>
                          USSD Opt: {b.ussd_option}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Generated USSD Preview */}
            {generatedUssd && (
              <div style={styles.ussdPreview}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 600 }}>USSD Code La Sameeyay:</span>
                  <span style={{ fontSize: '0.75rem', color: '#34D399' }}>Verified Same-Number</span>
                </div>
                <code style={{ fontSize: '1.05rem', color: '#FDE68A', fontWeight: 800 }}>
                  {generatedUssd}
                </code>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                onClick={handleExecuteTransaction}
                disabled={processing || !cleanSender || cleanSender.length !== 9}
                style={{
                  ...styles.executeBtn,
                  opacity: processing || !cleanSender || cleanSender.length !== 9 ? 0.6 : 1,
                  cursor: processing || !cleanSender || cleanSender.length !== 9 ? 'not-allowed' : 'pointer',
                }}
              >
                {processing ? '⏳ Shubayaa...' : '🚀 Shub Xidhmada (Execute)'}
              </button>

              {/* Direct Native Dialer for mobile browsers */}
              {generatedUssd && (
                <a
                  href={`tel:${encodeURIComponent(generatedUssd)}`}
                  style={styles.dialerBtn}
                  onClick={() => toast('Furaya Dialer-ka taleefanka...', 'info')}
                >
                  📞 Wac USSD (Dial)
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Feed & Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Quick Metrics */}
          <div style={styles.statsCard}>
            <div style={styles.statItem}>
              <span style={{ fontSize: 20 }}>💰</span>
              <div>
                <div style={styles.statValue}>
                  {operator?.card_balance !== undefined ? Number(operator.card_balance).toLocaleString() : '—'} SLS
                </div>
                <div style={styles.statLabel}>Card Balance</div>
              </div>
            </div>

            <div style={styles.statItem}>
              <span style={{ fontSize: 20 }}>📦</span>
              <div>
                <div style={styles.statValue}>{bundles.length}</div>
                <div style={styles.statLabel}>Active Bundles</div>
              </div>
            </div>
          </div>

          {/* Recent Direct Fulfillments */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={{ fontSize: 18 }}>📋</span>
              <h3 style={styles.cardTitle}>Recent Mu'min Fulfillments</h3>
            </div>

            <div style={{ padding: 12 }}>
              {loadingRecent ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#6EE7B7' }}>Loading transactions...</div>
              ) : recentTransactions.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                  Wali ma jiraan transactions. Geli number kor si aad u bilowdo.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentTransactions.map(tx => (
                    <div
                      key={tx.id}
                      onClick={() => selectFromRecent(tx)}
                      style={styles.txRow}
                      title="Click to copy number"
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 700, color: '#FFFFFF', fontSize: '0.875rem', fontFamily: 'monospace' }}>
                            {tx.telesom_number}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#10B981', background: 'rgba(16,185,129,0.15)', padding: '1px 6px', borderRadius: 4 }}>
                            Same 🔒
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: 2 }}>
                          {tx.bundle_rule?.bundle_name || `${tx.amount_sls} SLS`}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 6,
                            textTransform: 'uppercase',
                            background: tx.status === 'success' ? '#065F46' : tx.status === 'failed' ? '#7F1D1D' : '#78350F',
                            color: tx.status === 'success' ? '#34D399' : tx.status === 'failed' ? '#FCA5A5' : '#FDE68A',
                          }}
                        >
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => navigate('/mumin/transactions')}
                style={styles.viewAllBtn}
              >
                Arag Dhammaan Transactions-ka →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    background: 'linear-gradient(135deg, #065F46 0%, #064E3B 100%)',
    border: '1px solid rgba(52, 211, 153, 0.3)',
    borderRadius: 18,
    padding: '16px 20px',
    marginBottom: 20,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 20,
    alignItems: 'start',
  },
  card: {
    background: '#063C2E',
    border: '1px solid rgba(52, 211, 153, 0.25)',
    borderRadius: 20,
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
  },
  cardHeader: {
    padding: '14px 18px',
    background: 'rgba(2, 44, 34, 0.8)',
    borderBottom: '1px solid rgba(52, 211, 153, 0.15)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: '0.95rem',
    fontWeight: 700,
    color: '#FFFFFF',
    margin: 0,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#D1FAE5',
    marginBottom: 6,
  },
  lockedBadge: {
    fontSize: '0.72rem',
    background: 'rgba(245, 158, 11, 0.2)',
    color: '#FDE68A',
    border: '1px solid rgba(245, 158, 11, 0.4)',
    padding: '2px 8px',
    borderRadius: 6,
    fontWeight: 600,
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(2, 44, 34, 0.9)',
    border: '1.5px solid rgba(52, 211, 153, 0.35)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  inputPrefix: {
    padding: '12px 14px',
    background: 'rgba(6, 78, 59, 0.8)',
    color: '#6EE7B7',
    fontWeight: 700,
    fontSize: '0.9rem',
    borderRight: '1.5px solid rgba(52, 211, 153, 0.35)',
  },
  input: {
    flex: 1,
    padding: '12px 14px',
    background: 'transparent',
    border: 'none',
    color: '#FFFFFF',
    fontSize: '1.05rem',
    fontFamily: 'monospace',
    outline: 'none',
    letterSpacing: '0.05em',
  },
  fieldHint: {
    display: 'block',
    fontSize: '0.75rem',
    color: '#94A3B8',
    marginTop: 5,
  },
  lockedBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: 'rgba(6, 78, 59, 0.6)',
    border: '1.5px dashed rgba(52, 211, 153, 0.5)',
    borderRadius: 12,
  },
  ruleNotice: {
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.25)',
    borderRadius: 10,
    padding: '10px 12px',
    fontSize: '0.78rem',
    color: '#A7F3D0',
    marginTop: 8,
    lineHeight: 1.5,
  },
  bundlesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 10,
  },
  bundleCard: {
    padding: '12px 14px',
    borderRadius: 12,
    border: '1.5px solid',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  ussdPreview: {
    background: 'rgba(2, 44, 34, 0.9)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: 12,
    padding: '12px 14px',
    marginBottom: 8,
  },
  executeBtn: {
    flex: 1,
    minWidth: 160,
    padding: '14px 20px',
    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 12,
    fontSize: '1rem',
    fontWeight: 800,
    boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)',
  },
  dialerBtn: {
    padding: '14px 18px',
    background: 'rgba(245, 158, 11, 0.2)',
    color: '#FDE68A',
    border: '1.5px solid rgba(245, 158, 11, 0.4)',
    borderRadius: 12,
    fontSize: '0.9rem',
    fontWeight: 700,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  statsCard: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
  },
  statItem: {
    background: '#063C2E',
    border: '1px solid rgba(52, 211, 153, 0.2)',
    borderRadius: 16,
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  statValue: {
    fontSize: '1.15rem',
    fontWeight: 800,
    color: '#FFFFFF',
    fontFamily: 'monospace',
  },
  statLabel: {
    fontSize: '0.75rem',
    color: '#94A3B8',
    marginTop: 2,
  },
  txRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    background: 'rgba(2, 44, 34, 0.6)',
    border: '1px solid rgba(52, 211, 153, 0.15)',
    borderRadius: 10,
    cursor: 'pointer',
  },
  viewAllBtn: {
    width: '100%',
    padding: '10px',
    background: 'transparent',
    border: '1px solid rgba(52, 211, 153, 0.25)',
    borderRadius: 10,
    color: '#34D399',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 10,
  },
}
