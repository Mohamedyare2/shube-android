import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'

interface OperatorInfo {
  username: string
  welcome_message: string | null
}

interface LoadErrorState {
  code: string
  title: string
  message: string
}

export default function ReferralPage() {
  const { code } = useParams<{ code: string }>()
  const [operator, setOperator] = useState<OperatorInfo | null>(null)
  const [loadError, setLoadError] = useState<LoadErrorState | null>(null)
  const [loading, setLoading] = useState(true)

  const [telesom, setTelesom] = useState('')
  const [somtel, setSomtel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

  useEffect(() => {
    if (!code) {
      setLoadError({
        code: 'MISSING_CODE',
        title: 'Link Lama Helin',
        message: 'Fadlan hubi link-ga aad isticmaashay inuu sax yahay.',
      })
      setLoading(false)
      return
    }

    const cleanCode = code.trim().toLowerCase()
    const endpoint = `${BASE_URL}/api/register?code=${encodeURIComponent(cleanCode)}`

    fetch(endpoint)
      .then(async res => {
        let data: Record<string, unknown> | null = null
        try {
          data = await res.json()
        } catch {
          data = null
        }

        if (res.status === 404) {
          setLoadError({
            code: 'NOT_FOUND',
            title: 'Link Not Found (Lama Helin)',
            message: (data?.message as string) || 'Link-gan diiwaangelinta lama helin. Fadlan hubi tixraaca aad heshay.',
          })
          setLoading(false)
          return
        }

        if (res.status === 403) {
          setLoadError({
            code: 'INACTIVE',
            title: 'Adeeggan Hadda Ma Shaqaynayo',
            message: (data?.message as string) || 'Adeegga diiwaangelinta link-ga ee operator-kani hadda ma furna ama waqtigiisii ayaa dhacay. Fadlan la xiriir operator-ka ama maamulaha.',
          })
          setLoading(false)
          return
        }

        if (!res.ok || !data) {
          setLoadError({
            code: 'SERVER_ERROR',
            title: 'Khalad Ayaa Dhacay',
            message: (data?.message as string) || 'Server-ka laguma xirmi karo hadda. Fadlan dib u tijaabi daqiiqado yar kaddib.',
          })
          setLoading(false)
          return
        }

        setOperator({
          username: (data.username as string) || cleanCode,
          welcome_message: (data.welcome_message as string) || null,
        })
        setLoading(false)
      })
      .catch(() => {
        setLoadError({
          code: 'NETWORK_ERROR',
          title: 'Xiriirka Ayaa Go\'an',
          message: 'Fadlan hubi khadkaaga internetka, kaddibna dib u cusboonaysii (Refresh) bogga.',
        })
        setLoading(false)
      })
  }, [code, BASE_URL])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const tNum = telesom.replace(/\D/g, '')
    const sNum = somtel.replace(/\D/g, '')

    if (tNum.length !== 9) {
      setFormError('Numberka Telesom (lacagta) waa inuu ahaadaa 9 nambar. Ha ku darin 0 hore (Tusaale: 634284015).')
      return
    }
    if (sNum.length !== 9) {
      setFormError('Numberka Somtel (data-da) waa inuu ahaadaa 9 nambar. (Tusaale: 657575175).')
      return
    }

    setSubmitting(true)
    const cleanCode = (code || '').trim().toLowerCase()
    const endpoint = `${BASE_URL}/api/register?code=${encodeURIComponent(cleanCode)}`

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telesom_number: tNum, somtel_number: sNum }),
      })

      let data: Record<string, unknown> | null = null
      try {
        data = await res.json()
      } catch {
        data = null
      }

      if (!res.ok || !data || data.error) {
        setFormError((data?.message as string) || (data?.error as string) || 'Diiwaan gelinta way fashilantay. Fadlan dib u isku day.')
      } else {
        setSuccess(true)
      }
    } catch {
      setFormError('Xiriirka internetka ayaa go\'ay intii la dirayay. Fadlan dib u isku day.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.spinner} />
          <p style={{ color: '#6b7280', marginTop: 16 }}>Loading registration page...</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    const isInactive = loadError.code === 'INACTIVE'
    return (
      <div style={styles.page}>
        <div style={{ ...styles.card, marginTop: 40 }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>{isInactive ? '⏸️' : '⚠️'}</div>
          <h2 style={{ color: isInactive ? '#d97706' : '#ef4444', marginBottom: 12, fontSize: '1.4rem', fontWeight: 800 }}>
            {loadError.title}
          </h2>
          <p style={{ color: '#4b5563', lineHeight: 1.7, fontSize: '0.95rem', marginBottom: 24 }}>
            {loadError.message}
          </p>
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
            <a href="/" style={{ color: '#0ea5e9', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem' }}>
              ← Ku noqo Bogga Hore (Back to Home)
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.card, borderTop: '5px solid #10b981', marginTop: 40 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: '#10b981', fontSize: '1.5rem', fontWeight: 800, marginBottom: 12 }}>
            Diiwaan gelinta waa lagu guuleystay!
          </h2>
          <p style={{ color: '#1f2937', lineHeight: 1.7, marginBottom: 12, fontWeight: 500 }}>
            Macluumaadkaaga si guul leh ayaa la helay. Hadda waad sii wadi kartaa tallaabada xigta si aad u hesho xogta internetkaaga.
          </p>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 18px', textAlign: 'left', marginBottom: 20 }}>
            <div style={{ fontSize: '0.85rem', color: '#15803d', lineHeight: 1.6 }}>
              <strong>Registration successful!</strong> Your information has been received. You can now continue with the next steps to receive your data bundle.
            </div>
          </div>
          <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>
            Attributed to operator: <strong>@{operator?.username}</strong>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      {/* Header Banner */}
      <div style={styles.header}>
        <div style={styles.logo}>S</div>
        <h1 style={styles.heroTitle}>Get High-Speed Internet in Seconds!</h1>
        <p style={styles.heroDesc}>
          {operator?.welcome_message ||
            'Ku raaxayso internet degdeg ah oo aad ku kalsoon tahay marka aad u baahato, oo ay xukunto codsiyadeena casriga ah. Buuxi foomka hoose oo ku bilow dhowr ilbiriqsi gudahood.'}
        </p>
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.875rem', marginTop: 10, lineHeight: 1.5 }}>
          Enjoy fast, reliable internet whenever you need it, powered by our modern application. Complete the simple form below and get started in seconds.
        </p>
      </div>

      {/* How it works strip */}
      <div style={styles.stepsRow}>
        {[
          { icon: '📝', title: '1. Register', desc: 'Geli numberadaada' },
          { icon: '💳', title: '2. Send Payment', desc: 'Ka dir Telesom/Zaad' },
          { icon: '📶', title: '3. Receive Bundle', desc: 'Data-da ku hel Somtel' },
        ].map(s => (
          <div key={s.title} style={styles.step}>
            <span style={{ fontSize: 26 }}>{s.icon}</span>
            <strong style={{ display: 'block', marginTop: 6, color: '#1f2937', fontSize: '0.85rem' }}>{s.title}</strong>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{s.desc}</span>
          </div>
        ))}
      </div>

      {/* Form Card */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid #f3f4f6', paddingBottom: 12 }}>
          <h2 style={styles.formTitle}>Foomka Diiwaangelinta</h2>
          <span style={{ fontSize: '0.75rem', color: '#0ea5e9', background: '#f0f9ff', padding: '4px 8px', borderRadius: 6, fontWeight: 600 }}>
            @{operator?.username}
          </span>
        </div>

        {formError && (
          <div style={styles.errorBox}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span>{formError}</span>
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

          <button
            type="submit"
            disabled={submitting}
            style={{
              ...styles.submitBtn,
              opacity: submitting ? 0.75 : 1,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? '⏳ Fadlan sug (Processing)...' : '🚀 Get Started (Diiwaangeli)'}
          </button>
        </form>
      </div>

      <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.75rem', marginTop: 20, paddingBottom: 32 }}>
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
    padding: '44px 28px 36px',
    textAlign: 'center',
    color: 'white',
    marginBottom: 20,
    boxShadow: '0 4px 24px rgba(14,165,233,0.25)',
  },
  logo: {
    width: 52,
    height: 52,
    background: 'rgba(255,255,255,0.22)',
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 26,
    fontWeight: 800,
    margin: '0 auto 14px',
    backdropFilter: 'blur(4px)',
  },
  heroTitle: {
    fontSize: 'clamp(1.35rem, 5vw, 1.85rem)',
    fontWeight: 800,
    margin: '0 0 10px',
    lineHeight: 1.25,
  },
  heroDesc: {
    fontSize: '0.95rem',
    opacity: 0.95,
    lineHeight: 1.6,
    margin: 0,
  },
  stepsRow: {
    width: '100%',
    maxWidth: 560,
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
    marginBottom: 20,
  },
  step: {
    background: 'white',
    borderRadius: 14,
    padding: '14px 10px',
    textAlign: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    border: '1px solid rgba(0,0,0,0.04)',
  },
  card: {
    width: '100%',
    maxWidth: 560,
    background: 'white',
    borderRadius: 20,
    padding: '28px 24px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
    border: '1px solid rgba(0,0,0,0.04)',
    textAlign: 'center',
    marginBottom: 16,
  },
  formTitle: {
    fontSize: '1.15rem',
    fontWeight: 700,
    color: '#1f2937',
    margin: 0,
    textAlign: 'left',
  },
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#dc2626',
    borderRadius: 10,
    padding: '12px 14px',
    marginBottom: 18,
    textAlign: 'left',
    fontSize: '0.875rem',
    display: 'flex',
    gap: 8,
    alignItems: 'flex-start',
    lineHeight: 1.5,
  },
  field: {
    marginBottom: 18,
    textAlign: 'left',
  },
  label: {
    display: 'block',
    fontWeight: 600,
    color: '#374151',
    marginBottom: 6,
    fontSize: '0.875rem',
  },
  labelSub: {
    fontWeight: 400,
    color: '#6b7280',
    fontSize: '0.78rem',
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    border: '1.5px solid #d1d5db',
    borderRadius: 10,
    overflow: 'hidden',
  },
  prefix: {
    padding: '10px 12px',
    background: '#f9fafb',
    color: '#6b7280',
    fontWeight: 600,
    fontSize: '0.9rem',
    borderRight: '1.5px solid #d1d5db',
    whiteSpace: 'nowrap',
  },
  input: {
    flex: 1,
    padding: '10px 14px',
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
    fontSize: '0.72rem',
    color: '#9ca3af',
    marginTop: 5,
  },
  submitBtn: {
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
    color: 'white',
    border: 'none',
    borderRadius: 12,
    fontSize: '1.05rem',
    fontWeight: 700,
    marginTop: 6,
    letterSpacing: '0.01em',
  },
  spinner: {
    width: 38,
    height: 38,
    border: '4px solid #e5e7eb',
    borderTop: '4px solid #0ea5e9',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto',
  },
}
