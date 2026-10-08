import { Link } from 'react-router-dom'

const features = [
  {
    emoji: '📩',
    title: 'Auto SMS Detection',
    desc: 'Instantly detects incoming mobile money messages from Hormuud and Somtel networks.',
  },
  {
    emoji: '⚡',
    title: 'Instant USSD Execution',
    desc: 'Automatically dials and completes USSD sequences in seconds — no human input needed.',
  },
  {
    emoji: '📊',
    title: 'Real-Time Dashboard',
    desc: 'Monitor all transactions, device health, and operator activity from one control panel.',
  },
  {
    emoji: '🔒',
    title: 'Secure & Reliable',
    desc: 'Role-based access control, audit logs, and encrypted communication keep your data safe.',
  },
  {
    emoji: '📱',
    title: 'Multi-Device Support',
    desc: 'Pair multiple Android phones to the same operator account for higher throughput.',
  },
  {
    emoji: '🌐',
    title: 'Cloud Connected',
    desc: 'All data syncs securely to the cloud so you can manage everything remotely.',
  },
]

const geeshFeatures = [
  {
    emoji: '💸',
    title: 'Automatic Money Transfers',
    desc: 'Detects incoming payment SMS and automatically initiates the transfer flow.',
  },
  {
    emoji: '🔢',
    title: 'PIN-Secured Replies',
    desc: 'Safely enters your configured PIN into USSD dialogs — no manual typing required.',
  },
  {
    emoji: '🎯',
    title: 'Configurable USSD Code',
    desc: 'Set your exact USSD template with a {lacag} placeholder and let Geesh fill in the amount.',
  },
  {
    emoji: '🤖',
    title: 'Fully Automated Flow',
    desc: 'From SMS receipt to transfer confirmation — completely hands-free operation.',
  },
]

export default function HomePage() {
  return (
    <div className="pub-page">

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="pub-hero">
        <div className="pub-hero-bg">
          <div className="pub-hero-blob pub-hero-blob-1" />
          <div className="pub-hero-blob pub-hero-blob-2" />
          <div className="pub-hero-blob pub-hero-blob-3" />
        </div>
        <div className="pub-container pub-hero-inner">
          <div className="pub-hero-badge">🚀 Mobile Money Automation</div>
          <h1 className="pub-hero-title">
            Smart Automation for<br />
            <span className="pub-gradient-text">Mobile Money Transfers</span>
          </h1>
          <p className="pub-hero-subtitle">
            Shube and Geesh are Android applications built by Salaam Solution to automate
            Somali mobile money transfers — eliminating manual USSD entry and human error.
          </p>
          <div className="pub-hero-actions">
            <Link to="/downloads" className="pub-btn pub-btn-primary pub-btn-lg">
              ⬇ Download Apps
            </Link>
            <Link to="/about" className="pub-btn pub-btn-ghost pub-btn-lg">
              Learn More
            </Link>
          </div>

          {/* App badges */}
          <div className="pub-hero-apps">
            <div className="pub-app-badge">
              <div className="pub-app-badge-icon pub-app-badge-icon--blue">S</div>
              <div>
                <div className="pub-app-badge-name">Shube App</div>
                <div className="pub-app-badge-desc">Gateway & Dashboard</div>
              </div>
            </div>
            <div className="pub-hero-plus">+</div>
            <div className="pub-app-badge">
              <div className="pub-app-badge-icon pub-app-badge-icon--purple">G</div>
              <div>
                <div className="pub-app-badge-name">Geesh App</div>
                <div className="pub-app-badge-desc">Auto Money Transfer</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ─────────────────────────────────────────────── */}
      <section className="pub-stats-bar">
        <div className="pub-container pub-stats-inner">
          {[
            { value: '2', label: 'Mobile Apps' },
            { value: '100%', label: 'Automated' },
            { value: '24/7', label: 'Always Running' },
            { value: '0', label: 'Manual Steps' },
          ].map(s => (
            <div key={s.label} className="pub-stat">
              <div className="pub-stat-value">{s.value}</div>
              <div className="pub-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SHUBE APP ─────────────────────────────────────────── */}
      <section className="pub-section pub-section--alt">
        <div className="pub-container">
          <div className="pub-section-eyebrow">📱 Application 1</div>
          <div className="pub-two-col">
            <div className="pub-two-col-text">
              <div className="pub-app-title-row">
                <div className="pub-app-icon pub-app-icon--blue">S</div>
                <div>
                  <h2 className="pub-section-title">Shube App</h2>
                  <p className="pub-section-sub">Mobile Money Gateway</p>
                </div>
              </div>
              <p className="pub-section-desc">
                Shube is the core gateway application that sits on an Android device, listens for
                incoming Hormuud and Somtel payment SMS messages, and automatically executes USSD
                sequences to complete bundle purchases — all without any human interaction.
              </p>
              <p className="pub-section-desc">
                Operators manage everything through the Shube web dashboard: configure USSD codes,
                monitor transactions, manage customers, and receive real-time alerts.
              </p>
              <Link to="/downloads" className="pub-btn pub-btn-primary">
                Download Shube ⬇
              </Link>
            </div>
            <div className="pub-features-grid">
              {features.map(f => (
                <div key={f.title} className="pub-feature-card">
                  <div className="pub-feature-emoji">{f.emoji}</div>
                  <h3 className="pub-feature-title">{f.title}</h3>
                  <p className="pub-feature-desc">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── GEESH APP ─────────────────────────────────────────── */}
      <section className="pub-section">
        <div className="pub-container">
          <div className="pub-section-eyebrow">📲 Application 2</div>
          <div className="pub-two-col pub-two-col--reverse">
            <div className="pub-two-col-text">
              <div className="pub-app-title-row">
                <div className="pub-app-icon pub-app-icon--purple">G</div>
                <div>
                  <h2 className="pub-section-title">Geesh App</h2>
                  <p className="pub-section-sub">Automatic Money Transfer</p>
                </div>
              </div>
              <p className="pub-section-desc">
                Geesh (meaning "Send" in Somali) is a standalone automation app purpose-built for
                mobile money operators who need to forward transfers automatically. When a payment
                SMS arrives from the network, Geesh reads the amount, dials the configured USSD
                code, and enters the PIN — all without touching the phone.
              </p>
              <p className="pub-section-desc">
                Simply configure your USSD template and PIN once, enable the accessibility service,
                and Geesh handles every incoming transfer automatically.
              </p>
              <Link to="/downloads" className="pub-btn pub-btn-purple">
                Download Geesh ⬇
              </Link>
            </div>
            <div className="pub-features-grid pub-features-grid--2">
              {geeshFeatures.map(f => (
                <div key={f.title} className="pub-feature-card pub-feature-card--purple">
                  <div className="pub-feature-emoji">{f.emoji}</div>
                  <h3 className="pub-feature-title">{f.title}</h3>
                  <p className="pub-feature-desc">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section className="pub-section pub-section--alt">
        <div className="pub-container pub-section-centered">
          <div className="pub-section-eyebrow">⚙️ How It Works</div>
          <h2 className="pub-section-title pub-section-title--center">Fully Automated in 4 Steps</h2>
          <p className="pub-section-desc pub-section-desc--center">
            From incoming SMS to completed transfer — every step happens automatically.
          </p>
          <div className="pub-steps">
            {[
              { n: '1', title: 'SMS Received', desc: 'Customer sends money via Hormuud or Somtel. The app detects the SMS.' },
              { n: '2', title: 'Amount Parsed', desc: 'The app extracts the transfer amount from the message automatically.' },
              { n: '3', title: 'USSD Dialed', desc: 'The configured USSD code is dialed with the correct amount filled in.' },
              { n: '4', title: 'Transfer Done', desc: 'The PIN is entered and the transfer completes — no human input needed.' },
            ].map((step, i) => (
              <div key={step.n} className="pub-step">
                <div className="pub-step-number">{step.n}</div>
                {i < 3 && <div className="pub-step-connector" />}
                <h3 className="pub-step-title">{step.title}</h3>
                <p className="pub-step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="pub-cta">
        <div className="pub-cta-bg">
          <div className="pub-hero-blob pub-hero-blob-1" style={{ opacity: 0.15 }} />
        </div>
        <div className="pub-container pub-cta-inner">
          <h2 className="pub-cta-title">Ready to Automate Your Transfers?</h2>
          <p className="pub-cta-desc">
            Download Shube or Geesh today — no account required to get started.
          </p>
          <div className="pub-hero-actions">
            <Link to="/downloads" className="pub-btn pub-btn-primary pub-btn-lg">
              ⬇ Download Now — Free
            </Link>
            <Link to="/contact" className="pub-btn pub-btn-ghost pub-btn-lg">
              Contact Us
            </Link>
          </div>
        </div>
      </section>

    </div>
  )
}
