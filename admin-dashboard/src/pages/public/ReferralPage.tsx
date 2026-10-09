import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'

interface OperatorInfo {
  username: string
  welcome_message: string | null
}

export default function ReferralPage() {
  const { code } = useParams<{ code: string }>()
  const [operator, setOperator] = useState<OperatorInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [telesom, setTelesom] = useState('')
  const [somtel, setSomtel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

  useEffect(() => {
    if (!code) return
    fetch(`${BASE_URL}/api/register/${code}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setLoadError(data.error); setLoading(false); return }
        setOperator({ username: data.username, welcome_message: data.welcome_message })
        setLoading(false)
      })
      .catch(() => { setLoadError('Unable to load this registration link.'); setLoading(false) })
  }, [code])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const tNum = telesom.replace(/\D/g, '')
    const sNum = somtel.replace(/\D/g, '')

    if (tNum.length !== 9) { setFormError('Numberka Telesom waa inuu ahaadaa 9 nambar (Ha ku darin 0 hore)'); return }
    if (sNum.length !== 9) { setFormError('Numberka Somtel waa inuu ahaadaa 9 nambar'); return }

    setSubmitting(true)
    try {
      const res = await fetch(`${BASE_URL}/api/register/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telesom_number: tNum, somtel_number: sNum }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setFormError(data.error || 'Diiwaan gelinta way fashilantay. Dib u isku day.')
      } else {
        setSuccess(true)
      }
    } catch {
      setFormError('Xiriirka internetka ayaa dhacay. Dib u isku day.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.spinner} />
          <p style={{ color: '#6b7280', marginTop: 16 }}>Loading...</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ color: '#ef4444', marginBottom: 8 }}>Link Not Found</h2>
          <p style={{ color: '#6b7280' }}>{loadError}</p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.card, borderTop: '4px solid #10b981' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: '#10b981', fontSize: '1.5rem', fontWeight: 700, marginBottom: 12 }}>
            Diiwaan gelinta waa lagu guuleystay!
          </h2>
          <p style={{ color: '#374151', lineHeight: 1.7, marginBottom: 8 }}>
            Macluumaadkaaga si guul leh ayaa la helay.
            Hadda waad sii wadi kartaa tallaabada xigta si aad u hesho xogta internetkaaga.
          </p>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            Registration successful! Your information has been received.
            You can now continue with the next steps to receive your data bundle.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>S</div>
        <h1 style={styles.heroTitle}>Get High-Speed Internet in Seconds!</h1>
        <p style={styles.heroDesc}>
          {operator?.welcome_message ||
            'Ku raaxayso internet degdeg ah oo aad ku kalsoon tahay marka aad u baahato, oo ay xukunto codsiyadeena casriga ah. Buuxi foomka hoose oo ku bilow dhowr ilbiriqsi gudahood.'}
        </p>
        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.875rem', marginTop: 8 }}>
          Enjoy fast, reliable internet whenever you need it, powered by our modern application.
          Complete the simple form below and get started in seconds.
        </p>
      </div>

      {/* How it works */}
      <div style={styles.stepsRow}>
        {[
          { icon: '📝', title: 'Register', desc: 'Enter your phone numbers' },
          { icon: '💳', title: 'Send Payment', desc: 'Transfer via Telesom' },
          { icon: '📶', title: 'Get Internet', desc: 'Data bundle delivered instantly' },
        ].map(s => (
          <div key={s.title} style={styles.step}>
            <span style={{ fontSize: 28 }}>{s.icon}</span>
            <strong style={{ display: 'block', marginTop: 8, color: '#1f2937' }}>{s.title}</strong>
            <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{s.desc}</span>
          </div>
        ))}
      </div>

      {/* Form */}
      <div style={styles.card}>
        <h2 style={styles.formTitle}>Register Now</h2>
        {formError && (
          <div style={styles.errorBox}>
            <span>⚠️</span> {formError}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div style={styles.field}>
            <label style={styles.label}>
              Numberka aad lacagta kasoo dirayso
              <span style={styles.labelSub}> (Phone Number Sending the Payment From)</span>
            </label>
            <div style={styles.inputWrapper}>
              <span style={styles.prefix}>+252</span>
              <input
                style={styles.input}
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="634284015"
                value={telesom}
                onChange={e => setTelesom(e.target.value.replace(/\D/g, '').slice(0, 9))}
                required
                autoComplete="tel"
              />
            </div>
            <span style={styles.hint}>9 nambar — Ha ku darin 0 hore (Tusaale: 634284015)</span>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>
              Numberka laguugu shubayo Data-da
              <span style={styles.labelSub}> (Phone Number Receiving the Data Bundle)</span>
            </label>
            <div style={styles.inputWrapper}>
              <span style={styles.prefix}>+252</span>
              <input
                style={styles.input}
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="657575175"
                value={somtel}
                onChange={e => setSomtel(e.target.value.replace(/\D/g, '').slice(0, 9))}
                required
                autoComplete="tel"
              />
            </div>
            <span style={styles.hint}>9 nambar — Ha ku darin 0 hore (Tusaale: 657575175)</span>
          </div>

          <button type="submit" disabled={submitting} style={{
            ...styles.submitBtn,
            opacity: submitting ? 0.7 : 1,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}>
            {submitting ? '⏳ Processing...' : '🚀 Get Started'}
          </button>
        </form>
      </div>

      <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.75rem', marginTop: 24, paddingBottom: 32 }}>
        Powered by <strong>Shube</strong> · Salaam Solution
      </p>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '0 16px 32px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    width: '100%',
    maxWidth: 560,
    background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
    borderRadius: '0 0 24px 24px',
    padding: '48px 32px 40px',
    textAlign: 'center',
    color: 'white',
    marginBottom: 24,
    boxShadow: '0 4px 24px rgba(14,165,233,0.3)',
  },
  logo: {
    width: 56,
    height: 56,
    background: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
    fontWeight: 800,
    margin: '0 auto 16px',
    backdropFilter: 'blur(4px)',
  },
  heroTitle: {
    fontSize: 'clamp(1.4rem, 5vw, 1.9rem)',
    fontWeight: 800,
    margin: '0 0 12px',
    lineHeight: 1.2,
  },
  heroDesc: {
    fontSize: '1rem',
    opacity: 0.9,
    lineHeight: 1.6,
    margin: 0,
  },
  stepsRow: {
    width: '100%',
    maxWidth: 560,
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
    marginBottom: 24,
  },
  step: {
    background: 'white',
    borderRadius: 16,
    padding: '16px 12px',
    textAlign: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    border: '1px solid rgba(0,0,0,0.05)',
  },
  card: {
    width: '100%',
    maxWidth: 560,
    background: 'white',
    borderRadius: 24,
    padding: '32px 28px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    border: '1px solid rgba(0,0,0,0.05)',
    textAlign: 'center',
    marginBottom: 16,
  },
  formTitle: {
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#1f2937',
    marginBottom: 20,
    textAlign: 'left',
  },
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#dc2626',
    borderRadius: 12,
    padding: '12px 16px',
    marginBottom: 20,
    textAlign: 'left',
    fontSize: '0.875rem',
    display: 'flex',
    gap: 8,
    alignItems: 'flex-start',
  },
  field: {
    marginBottom: 20,
    textAlign: 'left',
  },
  label: {
    display: 'block',
    fontWeight: 600,
    color: '#374151',
    marginBottom: 8,
    fontSize: '0.9rem',
  },
  labelSub: {
    fontWeight: 400,
    color: '#6b7280',
    fontSize: '0.8rem',
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    border: '2px solid #e5e7eb',
    borderRadius: 12,
    overflow: 'hidden',
    transition: 'border-color 0.2s',
  },
  prefix: {
    padding: '12px 14px',
    background: '#f9fafb',
    color: '#6b7280',
    fontWeight: 600,
    fontSize: '0.9rem',
    borderRight: '2px solid #e5e7eb',
    whiteSpace: 'nowrap',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    border: 'none',
    outline: 'none',
    fontSize: '1rem',
    color: '#1f2937',
    background: 'white',
    fontFamily: 'monospace',
    letterSpacing: '0.05em',
  },
  hint: {
    display: 'block',
    fontSize: '0.75rem',
    color: '#9ca3af',
    marginTop: 6,
  },
  submitBtn: {
    width: '100%',
    padding: '16px',
    background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
    color: 'white',
    border: 'none',
    borderRadius: 14,
    fontSize: '1.1rem',
    fontWeight: 700,
    marginTop: 8,
    transition: 'opacity 0.2s, transform 0.1s',
    letterSpacing: '0.01em',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '4px solid #e5e7eb',
    borderTop: '4px solid #0ea5e9',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto',
  },
}
