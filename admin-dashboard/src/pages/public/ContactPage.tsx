const contacts = [
  { type: 'phone', icon: '📞', label: 'Phone', value: '063 4284015', href: 'tel:+2520634284015' },
  { type: 'phone', icon: '📞', label: 'Phone', value: '0657575175',  href: 'tel:+2520657575175' },
  { type: 'phone', icon: '📞', label: 'Phone', value: '063 4440394', href: 'tel:+2520634440394' },
  { type: 'email', icon: '✉️', label: 'Email', value: 'msayid@proton.me', href: 'mailto:msayid@proton.me' },
]

export default function ContactPage() {
  return (
    <div className="pub-page">

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="pub-page-hero">
        <div className="pub-hero-bg">
          <div className="pub-hero-blob pub-hero-blob-2" />
        </div>
        <div className="pub-container pub-page-hero-inner">
          <div className="pub-section-eyebrow">📬 Get In Touch</div>
          <h1 className="pub-page-hero-title">Contact Us</h1>
          <p className="pub-page-hero-sub">
            Have questions about Shube or Geesh? Reach out to the Salaam Solution team.
          </p>
        </div>
      </section>

      {/* ── CONTACT CARDS ─────────────────────────────────────── */}
      <section className="pub-section">
        <div className="pub-container">
          <div className="pub-contact-layout">

            <div className="pub-contact-info">
              <h2 className="pub-section-title">Salaam Solution</h2>
              <p className="pub-section-desc">
                We are here to help. Contact us via phone or email for support, business inquiries,
                or questions about our applications.
              </p>
              <p className="pub-section-desc">
                Led by <strong>Eng. Mohamed Sayid Mohamed</strong>, our team responds promptly
                to all inquiries.
              </p>

              <div className="pub-contact-cards">
                {contacts.map((c, i) => (
                  <a key={i} href={c.href} className="pub-contact-card">
                    <div className="pub-contact-card-icon">{c.icon}</div>
                    <div>
                      <div className="pub-contact-card-label">{c.label}</div>
                      <div className="pub-contact-card-value">{c.value}</div>
                    </div>
                    <div className="pub-contact-card-arrow">→</div>
                  </a>
                ))}
              </div>
            </div>

            <div className="pub-contact-aside">
              <div className="pub-contact-aside-card">
                <div className="pub-contact-aside-icon">🕐</div>
                <h3>Response Time</h3>
                <p>We typically respond to all inquiries within 24 hours during business days.</p>
              </div>
              <div className="pub-contact-aside-card">
                <div className="pub-contact-aside-icon">💬</div>
                <h3>Support</h3>
                <p>For technical support with Shube or Geesh apps, call or email us with a description of your issue.</p>
              </div>
              <div className="pub-contact-aside-card">
                <div className="pub-contact-aside-icon">🤝</div>
                <h3>Business Inquiries</h3>
                <p>Interested in custom software development? Contact us to discuss your project requirements.</p>
              </div>
            </div>

          </div>
        </div>
      </section>

    </div>
  )
}
