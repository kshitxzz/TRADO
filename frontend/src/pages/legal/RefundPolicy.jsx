import LegalPageLayout, { LegalH2, LegalP, LegalUl } from '../../components/legal/LegalPageLayout'

export default function RefundPolicy() {
  return (
    <LegalPageLayout title="Refund Policy" updated="18 August 2026">

      <LegalP>
        This Refund Policy covers paid plans purchased through Trado. All payments are
        processed by our payment partner, Cashfree.
      </LegalP>

      <LegalH2>1. Starter Plan</LegalH2>
      <LegalP>
        The Starter plan is free — there's nothing to refund.
      </LegalP>

      <LegalH2>2. Pro Plan (Monthly Subscription)</LegalH2>
      <LegalUl>
        <li>If you're not satisfied, you can request a full refund within <strong>7 days</strong> of your first Pro charge.</li>
        <li>After that window, you can cancel anytime from Settings — this stops future billing, but we don't refund the current billing period already in progress.</li>
        <li>Approved refunds are returned to your original payment method via Cashfree, typically within <strong>5–7 business days</strong>, depending on your bank.</li>
      </LegalUl>

      <LegalH2>3. Lifetime Plan (One-Time Payment)</LegalH2>
      <LegalUl>
        <li>Lifetime purchases are eligible for a full refund within <strong>14 days</strong> of purchase.</li>
        <li>After 14 days, Lifetime purchases are non-refundable.</li>
      </LegalUl>

      <LegalH2>4. How to Request a Refund</LegalH2>
      <LegalP>
        Email us at{' '}
        <a href="trado.app.noreply@gmail.com" style={{ color: 'var(--accent-purple-light)' }}>
          support@[yourdomain].com
        </a>{' '}
        with your account email and the reason for your request. We'll confirm eligibility and
        process approved refunds promptly.
      </LegalP>

      <LegalH2>5. When Refunds Won't Be Issued</LegalH2>
      <LegalUl>
        <li>Requests made after the applicable refund window has closed;</li>
        <li>Accounts terminated for violating our Terms of Service;</li>
        <li>Suspected fraud or abuse of the refund process itself.</li>
      </LegalUl>
      <LegalP>
        If you initiate a chargeback with your bank instead of contacting us first, we reserve
        the right to suspend the associated account while the dispute is investigated.
      </LegalP>

      <LegalH2>6. Changes to This Policy</LegalH2>
      <LegalP>
        We may update this Refund Policy from time to time. Changes apply to purchases made
        after the update takes effect.
      </LegalP>

      <LegalH2>7. Contact</LegalH2>
      <LegalP>
        Questions before you buy, or about an existing charge? Reach us at{' '}
        <a href="mailto:trado.app.noreply@gmail.com" style={{ color: 'var(--accent-purple-light)' }}>
          trado.app.noreply@gmail.com
        </a>.
      </LegalP>

    </LegalPageLayout>
  )
}