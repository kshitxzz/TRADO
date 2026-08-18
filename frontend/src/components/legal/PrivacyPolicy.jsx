import LegalPageLayout, { LegalH2, LegalP, LegalUl } from '../../components/legal/LegalPageLayout'

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout title="Privacy Policy" updated="18 August 2026">

      <LegalP>
        This Privacy Policy explains what data Trado collects, how we use it, and the choices
        you have. It applies to everyone who uses Trado (the "Service"), operated by{' '}
        <strong>[Your Legal Entity Name]</strong> ("Trado", "we", "us").
      </LegalP>

      <LegalH2>1. Information We Collect</LegalH2>
      <LegalUl>
        <li><strong>Account information</strong> — name, email address, and password (handled securely via our authentication provider).</li>
        <li><strong>Trading data</strong> — trades synced from your MT5 account via the TradoSync EA, or imported by you via CSV/HTML — symbol, side, entry/exit price, size, P&amp;L, and timestamps.</li>
        <li><strong>Journal content</strong> — notes, tags, emotions, lessons learned, ratings, and any screenshots you choose to attach to a trade.</li>
        <li><strong>Usage data</strong> — pages visited and general interaction data, used to keep the product working and improve it.</li>
        <li><strong>Payment data</strong> — handled directly by our payment processor, Cashfree. Trado does not receive or store your card, UPI, or bank details.</li>
      </LegalUl>

      <LegalH2>2. How We Use Your Data</LegalH2>
      <LegalUl>
        <li>To provide the core Service — storing and displaying your trades, journal entries, and analytics;</li>
        <li>To generate AI-powered insights, which involves sending relevant trade/journal data to our AI provider for that specific request;</li>
        <li>To send you account, billing, and product notifications by email or in-app;</li>
        <li>To process payments for paid plans;</li>
        <li>To maintain security, prevent abuse, and improve the Service over time.</li>
      </LegalUl>
      <LegalP>
        We do not sell your personal data or trading data to third parties, and we do not use
        your data for third-party advertising.
      </LegalP>

      <LegalH2>3. Third-Party Service Providers</LegalH2>
      <LegalP>
        We rely on a small number of trusted providers to run Trado, each of which processes
        only the data needed for its function:
      </LegalP>
      <LegalUl>
        <li><strong>Supabase</strong> — hosts our database, authentication, and real-time infrastructure.</li>
        <li><strong>Google Gemini</strong> — processes trade/journal data you request AI commentary on, to generate that commentary.</li>
        <li><strong>Cashfree</strong> — processes payments for paid plans.</li>
        <li><strong>Email delivery (SMTP)</strong> — sends transactional and notification emails.</li>
      </LegalUl>

      <LegalH2>4. Data Storage &amp; Security</LegalH2>
      <LegalP>
        Your data is stored in a Postgres database with row-level security enabled, meaning the
        system enforces — at the database level, not just in the app — that you can only ever
        access your own data. Data is encrypted in transit over HTTPS. No system is perfectly
        secure, and we can't guarantee absolute security, but we take reasonable, industry-
        standard measures to protect your information.
      </LegalP>

      <LegalH2>5. Your Rights</LegalH2>
      <LegalP>
        You can access, export, or correct your data at any time from within the app. You can
        request deletion of your account and associated data by contacting us or using the
        account deletion option in Settings. If you're in India, these rights are broadly
        consistent with the Digital Personal Data Protection Act, 2023; if you're located
        elsewhere, you may have additional rights under your local law.
      </LegalP>

      <LegalH2>6. Data Retention</LegalH2>
      <LegalP>
        We retain your data for as long as your account is active. If you delete your account,
        we delete your personal data and trading data within a reasonable period, except where
        we're required to retain limited records (e.g. billing records) for legal or accounting
        purposes.
      </LegalP>

      <LegalH2>7. Cookies</LegalH2>
      <LegalP>
        We use essential cookies/local storage to keep you signed in and remember basic
        preferences like theme. We don't use third-party advertising trackers.
      </LegalP>

      <LegalH2>8. Children's Privacy</LegalH2>
      <LegalP>
        Trado is not directed at, and should not be used by, anyone under 18.
      </LegalP>

      <LegalH2>9. International Data</LegalH2>
      <LegalP>
        Depending on our infrastructure configuration, your data may be stored or processed in
        a data center outside your home country. Where this happens, we rely on our providers'
        own safeguards for cross-border data handling.
      </LegalP>

      <LegalH2>10. Changes to This Policy</LegalH2>
      <LegalP>
        We may update this Privacy Policy from time to time. Material changes will be
        communicated by email or in-app notice before they take effect.
      </LegalP>

      <LegalH2>11. Contact</LegalH2>
      <LegalP>
        For privacy questions or data requests, contact us at{' '}
        <a href="mailto:privacy@[yourdomain].com" style={{ color: 'var(--accent-purple-light)' }}>
          privacy@[yourdomain].com
        </a>.
      </LegalP>

    </LegalPageLayout>
  )
}