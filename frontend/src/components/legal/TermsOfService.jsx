import LegalPageLayout, { LegalH2, LegalP, LegalUl } from '../../components/legal/LegalPageLayout'

export default function TermsOfService() {
  return (
    <LegalPageLayout title="Terms of Service" updated="18 August 2026">

      <LegalP>
        These Terms of Service ("Terms") govern your access to and use of Trado, a trading
        journal and analytics platform (the "Service"), operated by <strong>[Your Legal Entity Name]</strong>
        {' '}("Trado", "we", "us"). By creating an account or using the Service, you agree to be
        bound by these Terms. If you don't agree, please don't use Trado.
      </LegalP>

      <LegalH2>1. What Trado Is — and Isn't</LegalH2>
      <LegalP>
        Trado is a journaling, record-keeping, and analytics tool for traders. It helps you log
        trades, review your history, and surface behavioral patterns — including AI-generated
        commentary on that data.
      </LegalP>
      <LegalP>
        Trado is <strong>not</strong> a broker, dealer, exchange, investment adviser, or
        portfolio manager. We do not execute trades, hold funds or securities, or manage money
        on your behalf. Nothing in the Service — including AI-generated insights, statistics,
        or behavioral scores — constitutes financial, investment, tax, or legal advice. Trading
        involves substantial risk of loss, and you are solely responsible for your own trading
        and investment decisions.
      </LegalP>

      <LegalH2>2. Your Account</LegalH2>
      <LegalUl>
        <li>You must be at least 18 years old to use Trado.</li>
        <li>You're responsible for the accuracy of the information you provide and for keeping your login credentials secure.</li>
        <li>One account per individual, unless we've agreed otherwise in writing (e.g. a team/firm plan).</li>
        <li>You're responsible for all activity that happens under your account.</li>
      </LegalUl>

      <LegalH2>3. Connecting Broker Data</LegalH2>
      <LegalP>
        Trado lets you bring in trade history either automatically, via the TradoSync
        Expert Advisor installed on your own MetaTrader 5 terminal, or manually, via CSV/HTML
        import. Trado is not affiliated with, endorsed by, or responsible for any broker or
        trading platform you connect. You're responsible for the security of your own broker
        credentials and terminal — Trado's sync tooling never requires or stores your broker
        login. We do our best to sync and display your data accurately, but we don't guarantee
        that synced data is complete, real-time, or error-free, and you should verify important
        figures against your broker's own statements.
      </LegalP>

      <LegalH2>4. Plans &amp; Billing</LegalH2>
      <LegalP>
        Trado offers a free Starter plan and paid Pro (monthly subscription) and Lifetime
        (one-time) plans, as described on our Pricing page. Paid plans are billed through our
        payment processor, Cashfree. Pro subscriptions renew automatically each billing cycle
        until you cancel; you can cancel anytime from Settings, effective at the end of your
        current billing period. Refunds are handled under our separate{' '}
        <a href="/refund-policy" style={{ color: 'var(--accent-purple-light)' }}>Refund Policy</a>.
      </LegalP>

      <LegalH2>5. AI Features</LegalH2>
      <LegalP>
        Some features (such as AI Coach and AI-narrated reports) send your trade and journal
        data to a third-party AI provider (Google Gemini) to generate commentary. This
        commentary is generated from statistics we've already calculated deterministically —
        the AI narrates and explains, it does not independently compute your numbers — but it
        can still be wrong, incomplete, or miss context only you have. Treat AI output as a
        starting point for reflection, not a verdict, and never as trading advice.
      </LegalP>

      <LegalH2>6. Acceptable Use</LegalH2>
      <LegalP>You agree not to:</LegalP>
      <LegalUl>
        <li>Reverse-engineer, scrape, or attempt to disrupt the Service or its sync infrastructure;</li>
        <li>Use the Service for any unlawful purpose, or to violate any third party's rights;</li>
        <li>Share, resell, or provide access to your account to anyone else without our consent;</li>
        <li>Upload data you don't have the right to upload, or attempt to access another user's data.</li>
      </LegalUl>

      <LegalH2>7. Intellectual Property</LegalH2>
      <LegalP>
        Trado's software, design, branding, and underlying technology belong to us. You retain
        full ownership of your own trading data, journal entries, and any content you upload —
        we only use it to provide the Service to you (see our{' '}
        <a href="/privacy" style={{ color: 'var(--accent-purple-light)' }}>Privacy Policy</a>).
      </LegalP>

      <LegalH2>8. Disclaimers &amp; Limitation of Liability</LegalH2>
      <LegalP>
        The Service is provided "as is," without warranties of any kind. To the maximum extent
        permitted by law, Trado and its team are not liable for any trading losses, missed
        opportunities, or decisions made based on the Service, nor for indirect, incidental, or
        consequential damages arising from your use of it. Our total liability for any claim
        relating to the Service is limited to the amount you paid us in the 12 months before the
        claim arose.
      </LegalP>

      <LegalH2>9. Termination</LegalH2>
      <LegalP>
        You may stop using the Service and delete your account at any time from Settings. We
        may suspend or terminate accounts that violate these Terms, engage in abusive behavior
        toward our sync infrastructure, or where required by law.
      </LegalP>

      <LegalH2>10. Governing Law</LegalH2>
      <LegalP>
        These Terms are governed by the laws of India. Any disputes will be subject to the
        exclusive jurisdiction of the courts of <strong>[Your City], India</strong>.
      </LegalP>

      <LegalH2>11. Changes to These Terms</LegalH2>
      <LegalP>
        We may update these Terms from time to time. If we make material changes, we'll notify
        you by email or an in-app notice before they take effect. Continued use of Trado after
        changes take effect means you accept the updated Terms.
      </LegalP>

      <LegalH2>12. Contact</LegalH2>
      <LegalP>
        Questions about these Terms? Reach us at{' '}
        <a href="mailto:support@[yourdomain].com" style={{ color: 'var(--accent-purple-light)' }}>
          support@[yourdomain].com
        </a>.
      </LegalP>

    </LegalPageLayout>
  )
}
