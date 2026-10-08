import { Link } from 'react-router-dom'

const services = [
  { emoji: '📱', title: 'Android App Development', desc: 'Native Android applications built with Kotlin and Jetpack Compose for high performance and reliability.' },
  { emoji: '🌐', title: 'Web Application Development', desc: 'Modern, responsive web apps using React, TypeScript, and Supabase for real-time data.' },
  { emoji: '🤖', title: 'Mobile Automation Systems', desc: 'Smart automation tools that integrate with mobile money networks and USSD services.' },
  { emoji: '☁️', title: 'Cloud & Backend Solutions', desc: 'Scalable backend systems, APIs, and database architectures on modern cloud platforms.' },
  { emoji: '📊', title: 'Business Intelligence Dashboards', desc: 'Real-time dashboards and reporting tools that give you clear visibility into your operations.' },
  { emoji: '🔒', title: 'Secure Authentication Systems', desc: 'Role-based access control, audit logging, and secure user management for your software.' },
]

export default function AboutPage() {
  return (
    <div className="pub-page">

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="pub-page-hero">
        <div className="pub-hero-bg">
          <div className="pub-hero-blob pub-hero-blob-2" />
          <div className="pub-hero-blob pub-hero-blob-3" />
        </div>
        <div className="pub-container pub-page-hero-inner">
          <div className="pub-section-eyebrow">🏢 About Us</div>
          <h1 className="pub-page-hero-title">Salaam Solution</h1>
          <p className="pub-page-hero-sub">
            A Somali software company building modern digital tools for businesses and operators.
          </p>
        </div>
      </section>

      {/* ── COMPANY ──────────────────────────────────────────── */}
      <section className="pub-section">
        <div className="pub-container">
          <div className="pub-about-grid">
            {/* Leader card */}
            <div className="pub-leader-card">
              <div className="pub-leader-avatar">
                <span>M</span>
              </div>
              <div className="pub-leader-badge">Founder & Lead Engineer</div>
              <h2 className="pub-leader-name">Eng. Mohamed Sayid Mohamed</h2>
              <p className="pub-leader-desc">
                Mohamed is a software engineer and entrepreneur based in Somalia with a passion for
                building practical digital solutions that solve real-world business problems.
                He founded Salaam Solution with the mission of bringing modern technology to
                Somali businesses.
              </p>
              <div className="pub-leader-contact">
                <a href="mailto:msayid@proton.me" className="pub-contact-pill">
                  ✉ msayid@proton.me
                </a>
                <a href="tel:+2520634284015" className="pub-contact-pill">
                  📞 063 4284015
                </a>
              </div>
            </div>

            {/* Company info */}
            <div className="pub-company-info">
              <h2 className="pub-section-title">About Salaam Solution</h2>
              <p className="pub-section-desc">
                Salaam Solution is a technology company focused on developing software products
                and services tailored to the Somali market. We specialize in mobile automation,
                web applications, and backend systems that help businesses operate more efficiently.
              </p>
              <p className="pub-section-desc">
                Our flagship products — <strong>Shube</strong> and <strong>Geesh</strong> — were
                designed to eliminate the manual effort involved in mobile money transfers, helping
                operators serve their customers faster and with fewer errors.
              </p>
              <p className="pub-section-desc">
                We are committed to building reliable, secure, and easy-to-use software that
                creates real value for our users.
              </p>

              {/* Values */}
              <div className="pub-values">
                {[
                  { icon: '🎯', label: 'Mission-Driven' },
                  { icon: '🛡️', label: 'Security First' },
                  { icon: '⚡', label: 'Performance Focused' },
                  { icon: '🤝', label: 'Customer Oriented' },
                ].map(v => (
                  <div key={v.label} className="pub-value-pill">
                    <span>{v.icon}</span>
                    <span>{v.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRODUCTS ─────────────────────────────────────────── */}
      <section className="pub-section pub-section--alt">
        <div className="pub-container pub-section-centered">
          <div className="pub-section-eyebrow">📦 Our Products</div>
          <h2 className="pub-section-title pub-section-title--center">What We Have Built</h2>
          <div className="pub-products-row">
            <div className="pub-product-card pub-product-card--blue">
              <div className="pub-product-icon">S</div>
              <h3>Shube App</h3>
              <p>Mobile money gateway that automates USSD-based bundle purchases for network operators.</p>
              <Link to="/downloads" className="pub-btn pub-btn-sm pub-btn-primary">Download</Link>
            </div>
            <div className="pub-product-card pub-product-card--purple">
              <div className="pub-product-icon pub-product-icon--purple">G</div>
              <h3>Geesh App</h3>
              <p>Automatic money transfer app that processes incoming payment SMS and executes transfers hands-free.</p>
              <Link to="/downloads" className="pub-btn pub-btn-sm pub-btn-purple">Download</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── SERVICES ─────────────────────────────────────────── */}
      <section className="pub-section">
        <div className="pub-container pub-section-centered">
          <div className="pub-section-eyebrow">🛠️ Services</div>
          <h2 className="pub-section-title pub-section-title--center">Software Development Services</h2>
          <p className="pub-section-desc pub-section-desc--center">
            In addition to our own products, Salaam Solution offers custom software development
            services for businesses across Somalia.
          </p>
          <div className="pub-services-grid">
            {services.map(s => (
              <div key={s.title} className="pub-service-card">
                <div className="pub-service-emoji">{s.emoji}</div>
                <h3 className="pub-service-title">{s.title}</h3>
                <p className="pub-service-desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="pub-cta">
        <div className="pub-cta-bg" />
        <div className="pub-container pub-cta-inner">
          <h2 className="pub-cta-title">Interested in Working With Us?</h2>
          <p className="pub-cta-desc">
            Get in touch to discuss your software development needs.
          </p>
          <Link to="/contact" className="pub-btn pub-btn-primary pub-btn-lg">
            Contact Salaam Solution
          </Link>
        </div>
      </section>

    </div>
  )
}
