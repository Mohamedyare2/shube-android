export default function PrivacyPage() {
  const updated = 'October 8, 2026'
  return (
    <div className="pub-page">

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="pub-page-hero pub-page-hero--compact">
        <div className="pub-hero-bg">
          <div className="pub-hero-blob pub-hero-blob-3" />
        </div>
        <div className="pub-container pub-page-hero-inner">
          <div className="pub-section-eyebrow">🔒 Legal</div>
          <h1 className="pub-page-hero-title">Privacy Policy</h1>
          <p className="pub-page-hero-sub">Last updated: {updated}</p>
        </div>
      </section>

      {/* ── CONTENT ──────────────────────────────────────────── */}
      <section className="pub-section">
        <div className="pub-container pub-prose">

          <p>
            This Privacy Policy describes how <strong>Salaam Solution</strong> ("we", "us", "our")
            collects, uses, and protects information in connection with the <strong>Shube</strong> and{' '}
            <strong>Geesh</strong> mobile applications and the <strong>shube.vercel.app</strong> website.
          </p>

          <h2>1. Information We Collect</h2>

          <h3>Shube Web Dashboard</h3>
          <ul>
            <li><strong>Account credentials:</strong> Email address and password used to sign in to the operator dashboard. Passwords are hashed and stored securely via Supabase Auth.</li>
            <li><strong>Operator profile data:</strong> Name, role, and contact information provided during account setup by administrators.</li>
            <li><strong>Transaction records:</strong> Records of automated money transfers processed by the Shube gateway, including amounts, timestamps, and USSD results.</li>
            <li><strong>Device identifiers:</strong> Android device information (model, Android version) used to pair a device with an operator account.</li>
          </ul>

          <h3>Shube Android App</h3>
          <ul>
            <li><strong>SMS messages:</strong> The app reads incoming SMS messages solely to detect mobile money payment notifications from Hormuud and Somtel. SMS content is processed locally and only the relevant transaction data is sent to the server.</li>
            <li><strong>Accessibility service usage:</strong> The app uses Android Accessibility Services to interact with USSD dialogs. This access is used exclusively to enter USSD codes and replies — it does not read passwords, messages, or screen content from other applications.</li>
          </ul>

          <h3>Geesh Android App</h3>
          <ul>
            <li><strong>SMS messages:</strong> Geesh reads incoming SMS from the mobile money network (sender "898") to extract the transfer amount. No SMS content is stored or transmitted beyond the device.</li>
            <li><strong>Accessibility service usage:</strong> Used exclusively to enter the user-configured PIN into USSD dialog fields. Geesh does not access any other application's data.</li>
            <li><strong>User-configured settings:</strong> USSD template and PIN are stored locally on the device in encrypted shared preferences and are never transmitted externally.</li>
          </ul>

          <h2>2. How We Use Information</h2>
          <ul>
            <li>To authenticate operators and provide access to the dashboard.</li>
            <li>To process and record automated mobile money transactions.</li>
            <li>To display transaction history and device status in the dashboard.</li>
            <li>To maintain audit logs for security and compliance.</li>
            <li>We do not sell, rent, or share personal information with third parties for marketing purposes.</li>
          </ul>

          <h2>3. Data Storage and Security</h2>
          <p>
            All server-side data is stored in <strong>Supabase</strong>, a secure cloud database
            service with encryption at rest and in transit (TLS). Row-Level Security (RLS) policies
            ensure each operator can only access their own data.
          </p>
          <p>
            Device-side data in the Geesh app (USSD template, PIN) is stored in Android's local
            SharedPreferences storage and is not transmitted to any server.
          </p>

          <h2>4. Data Retention</h2>
          <p>
            Transaction records and audit logs are retained for operational purposes.
            Operators may contact us to request deletion of their account data.
          </p>

          <h2>5. Third-Party Services</h2>
          <p>
            Our applications interact with the following third-party services:
          </p>
          <ul>
            <li><strong>Supabase</strong> — Database and authentication (supabase.com)</li>
            <li><strong>Vercel</strong> — Web hosting for the dashboard (vercel.com)</li>
            <li><strong>Hormuud / Somtel</strong> — Somaliland mobile money networks (SMS interactions only, no data sharing)</li>
          </ul>

          <h2>6. Permissions Used by the Apps</h2>
          <table className="pub-table">
            <thead>
              <tr><th>Permission</th><th>App</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr><td>RECEIVE_SMS / READ_SMS</td><td>Shube, Geesh</td><td>Detect incoming payment notifications</td></tr>
              <tr><td>CALL_PHONE</td><td>Shube, Geesh</td><td>Dial USSD codes via tel: URI</td></tr>
              <tr><td>FOREGROUND_SERVICE</td><td>Shube, Geesh</td><td>Run continuously to monitor for SMS</td></tr>
              <tr><td>Accessibility Service</td><td>Shube, Geesh</td><td>Interact with USSD dialog UI</td></tr>
              <tr><td>INTERNET</td><td>Shube</td><td>Sync transaction data to dashboard</td></tr>
              <tr><td>RECEIVE_BOOT_COMPLETED</td><td>Shube</td><td>Restart service after device reboot</td></tr>
            </tbody>
          </table>

          <h2>7. Children's Privacy</h2>
          <p>
            Our applications are intended for business operators and are not directed at children
            under the age of 13. We do not knowingly collect personal information from children.
          </p>

          <h2>8. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Changes will be reflected by
            updating the "Last updated" date at the top of this page.
          </p>

          <h2>9. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us:
          </p>
          <ul>
            <li>Email: <a href="mailto:msayid@proton.me">msayid@proton.me</a></li>
            <li>Phone: <a href="tel:+2520634284015">063 4284015</a></li>
          </ul>

        </div>
      </section>
    </div>
  )
}
