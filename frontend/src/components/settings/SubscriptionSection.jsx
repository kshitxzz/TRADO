import { useEffect, useState } from 'react'
import { Crown, Check, Loader2, CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'
import { BLUE } from './shared'
import { api } from '../../lib/api'
import { openCashfreeCheckout } from '../../lib/cashfreeCheckout'
import { useAuth } from '../../hooks/useAuth'

const FEATURES = [
  'Unlimited trades', 'Advanced analytics', 'AI-powered insights',
  'Playbook builder', 'Prop firm mode', 'Priority support',
]

export default function SubscriptionSection() {
  const { user, profile, fetchProfile } = useAuth()
  const [plans, setPlans]     = useState(null)
  const [billing, setBilling] = useState('yearly') // 'monthly' | 'yearly'
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/payments/plans').then(res => setPlans(res.plans)).catch(() => {})
  }, [])

  const isPro = profile?.plan === 'pro'
  const trialDaysLeft = (() => {
    if (isPro || !profile?.trial_ends_at) return null
    const diff = new Date(profile.trial_ends_at).getTime() - Date.now()
    if (diff <= 0) return null
    return Math.ceil(diff / 86400000)
  })()

  const planId = billing === 'monthly' ? 'pro_monthly' : 'pro_yearly'
  const plan   = plans?.[planId]
  const monthlyPlan = plans?.pro_monthly
  const perMonthEquivalent = plan
    ? billing === 'yearly' ? Math.round(plan.amount / 12) : plan.amount
    : null

  async function handleUpgrade() {
    if (!plans) return
    setLoading(true)
    try {
      const order = await api.post('/payments/create-order', {
        planId, userId: user.id, userEmail: user.email,
        userName: `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || undefined,
      })
      await openCashfreeCheckout({ paymentSessionId: order.paymentSessionId, mode: order.mode })
      const verify = await api.post('/payments/verify', { orderId: order.orderId, userId: user.id })
      if (verify.success) {
        toast.success('Welcome to Pro! Your plan has been upgraded.')
        await fetchProfile(user.id)
      } else {
        toast.error('Payment was not completed. You have not been charged.')
      }
    } catch (err) {
      toast.error(err.message || 'Something went wrong starting checkout')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="glass-card overflow-hidden">
        <div style={{ height: 3, background: 'linear-gradient(90deg,#F59E0B,#22C55E)' }} />
        <div className="p-6 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.15)' }}>
              <Crown size={20} style={{ color: 'var(--warning-orange)' }} />
            </div>
            <div>
              <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                {isPro ? 'Pro Plan' : trialDaysLeft != null ? 'Pro Trial' : 'Free Plan'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Current Plan</p>
            </div>
          </div>
          {trialDaysLeft != null && (
            <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: 'rgba(59,130,246,0.15)', color: BLUE }}>
              {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} left
            </span>
          )}
          {isPro && (
            <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--positive-green)' }}>
              <Check size={12} /> Active
            </span>
          )}
        </div>
      </div>

      {!isPro && (
        <>
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }}>
              {['monthly', 'yearly'].map(b => (
                <button key={b} onClick={() => setBilling(b)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold"
                        style={{ background: billing === b ? '#fff' : 'transparent', color: billing === b ? '#111' : 'var(--text-secondary)' }}>
                  {b === 'monthly' ? 'Monthly' : 'Yearly'}
                  {b === 'yearly' && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: billing === 'yearly' ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.15)', color: 'var(--positive-green)' }}>
                      -20%
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card overflow-hidden">
            <div style={{ height: 3, background: BLUE }} />
            <div className="p-6">
              <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
                <div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full mb-2"
                        style={{ background: BLUE, color: '#fff' }}>
                    ★ Most Popular
                  </span>
                  <h3 className="text-xl font-black" style={{ color: BLUE }}>Pro Plan</h3>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Everything you need to trade better</p>
                </div>
                {plan && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
                      ₹{perMonthEquivalent}<span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>/mo</span>
                    </p>
                    {billing === 'yearly' && monthlyPlan && (
                      <p className="text-xs line-through" style={{ color: 'var(--text-muted)' }}>₹{monthlyPlan.amount}/mo</p>
                    )}
                    {billing === 'yearly' && (
                      <p className="text-xs font-semibold" style={{ color: 'var(--positive-green)' }}>Billed ₹{plan.amount}/year</p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 my-5">
                {FEATURES.map(f => (
                  <div key={f} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <Check size={14} style={{ color: BLUE }} /> {f}
                  </div>
                ))}
              </div>

              <button onClick={handleUpgrade} disabled={loading || !plans}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white"
                      style={{ background: BLUE, opacity: (loading || !plans) ? 0.7 : 1 }}>
                {loading ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
                {loading ? 'Opening checkout…' : 'Upgrade Now'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}