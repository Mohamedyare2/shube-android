const apps = [
  {
    id: 'shube',
    icon: 'S',
    iconClass: 'pub-app-icon--blue',
    name: 'Shube App',
    version: 'Latest',
    subtitle: 'Mobile Money Gateway',
    description:
      'Shube is the gateway application that sits on an Android device and automatically processes incoming payment SMS messages. It dials USSD codes, completes transactions, and syncs all activity to the Shube web dashboard in real time.',
    features: [
      'Auto SMS detection from Hormuud & Somtel',
      'Automatic USSD execution',
      'Real-time transaction sync',
      'Multi-operator support',
      'Web dashboard management',
    ],
    apkUrl: '/downloads/shube-latest.apk',
    fileSize: '~24.8 MB',
    btnClass: 'pub-btn-primary',
    requirements: 'Android 7.0 (Nougat) or higher',
  },
  {
    id: 'geesh',
    icon: 'G',
    iconClass: 'pub-app-icon--purple',
    name: 'Geesh App',
    version: 'Latest',
    subtitle: 'Automatic Money Transfer',
    description:
      'Geesh (Somali: "Send") is a standalone automation app for mobile money operators who need to forward transfers automatically. When a payment SMS arrives, Geesh reads the amount, dials your USSD code, and enters your PIN — completely hands-free.',
    features: [
      'Detects payment SMS automatically',
      'Fills in transfer amount from SMS',
      'Enters PIN into USSD dialog',
      'Configurable USSD template',
      'Works offline after setup',
    ],
    apkUrl: '/downloads/geesh-latest.apk',
    fileSize: '~21.6 MB',
    btnClass: 'pub-btn-purple',
    requirements: 'Android 8.0 (Oreo) or higher — Accessibility Service required',
  },
]

export default function PublicDownloadsPage() {
  return (
    <div className="pub-page">

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="pub-page-hero">
        <div className="pub-hero-bg">
          <div className="pub-hero-blob pub-hero-blob-1" />
          <div className="pub-hero-blob pub-hero-blob-3" />
        </div>
        <div className="pub-container pub-page-hero-inner">
          <div className="pub-section-eyebrow">⬇ Downloads</div>
          <h1 className="pub-page-hero-title">Download Our Apps</h1>
          <p className="pub-page-hero-sub">
            Both apps are free to download. No account required.
          </p>
        </div>
      </section>

      {/* ── APP CARDS ─────────────────────────────────────────── */}
      <section className="pub-section">
        <div className="pub-container">
          <div className="pub-download-cards">
            {apps.map(app => (
              <div key={app.id} className="pub-download-card">
                <div className="pub-download-card-header">
                  <div className={`pub-app-icon pub-app-icon--lg ${app.iconClass}`}>
                    {app.icon}
                  </div>
                  <div>
                    <h2 className="pub-download-card-name">{app.name}</h2>
                    <div className="pub-download-card-sub">{app.subtitle}</div>
                    <div className="pub-download-card-meta">
                      <span className="pub-version-badge">v{app.version}</span>
                      <span className="pub-meta-dot" />
                      <span className="pub-file-size">{app.fileSize}</span>
                    </div>
                  </div>
                </div>

                <p className="pub-download-card-desc">{app.description}</p>

                <ul className="pub-download-features">
                  {app.features.map(f => (
                    <li key={f}>
                      <span className="pub-check">✓</span> {f}
                    </li>
                  ))}
                </ul>

                <div className="pub-download-card-footer">
                  <a
                    href={app.apkUrl}
                    download
                    className={`pub-btn pub-btn-lg pub-btn-block ${app.btnClass}`}
                  >
                    ⬇ Download {app.name}
                  </a>
                  <div className="pub-requirements">
                    📋 {app.requirements}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Install instructions */}
          <div className="pub-install-guide">
            <h3 className="pub-install-guide-title">📖 How to Install</h3>
            <div className="pub-install-steps">
              {[
                { n: '1', text: 'Download the APK file by clicking the button above.' },
                { n: '2', text: 'On your Android phone, go to Settings → Security → Enable "Unknown Sources" or "Install unknown apps".' },
                { n: '3', text: 'Open the downloaded APK file from your Downloads folder.' },
                { n: '4', text: 'Tap Install and follow the on-screen instructions.' },
                { n: '5', text: 'Open the app and follow the setup guide.' },
              ].map(step => (
                <div key={step.n} className="pub-install-step">
                  <div className="pub-install-step-n">{step.n}</div>
                  <p>{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}
