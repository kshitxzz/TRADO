import { useNavigate } from 'react-router-dom'
import { CheckCircle, ArrowRight } from 'lucide-react'
import Logo from '../components/ui/Logo'

const PLANS = [
  { name:'Starter', price:'Free', sub:'Forever', color:'var(--text-secondary)',
    features:['Up to 50 trades/month','Basic dashboard','MT5 manual sync','Trade journal'],
    cta:'Get Started', highlight:false },
  { name:'Pro', price:'₹999', sub:'/month', color:'var(--accent-purple)',
    features:['Unlimited trades','Full AI analytics','Auto MT5 sync','Behavioral scoring','All analytics pages','Weekly AI reports','Tilt warning system','Priority support'],
    cta:'Start Free Trial', highlight:true },
  { name:'Lifetime', price:'₹4,999', sub:'one-time', color:'var(--warning-orange)',
    features:['Everything in Pro','Lifetime updates','API access','White-label export'],
    cta:'Get Lifetime Access', highlight:false },
]

export default function Pricing() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen py-24 px-4" style={{ background:'var(--bg-landing)' }}>
      {/* Nav */}
      <div className="flex items-center gap-2 mb-12 max-w-4xl mx-auto">
        <button onClick={() => navigate('/')} className="flex items-center gap-2">
          <Logo height={26} />
        </button>
      </div>

      <div className="max-w-5xl mx-auto text-center mb-12">
        <h1 className="text-5xl font-black text-white mb-4">Simple, transparent pricing</h1>
        <p className="text-lg" style={{ color:'var(--text-muted)' }}>Start free. Upgrade when you're ready to unlock your edge.</p>
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5">
        {PLANS.map(p => (
          <div key={p.name} className="glass-card p-7 flex flex-col relative"
               style={{ border: p.highlight ? '1px solid var(--border-glow)' : undefined,
                        boxShadow: p.highlight ? '0 0 50px rgba(139,92,246,0.15)' : undefined }}>
            {p.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold text-white"
                   style={{ background:'var(--gradient-primary)' }}>Most Popular</div>
            )}
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: p.color }}>{p.name}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-white">{p.price}</span>
                <span className="text-sm" style={{ color:'var(--text-muted)' }}>{p.sub}</span>
              </div>
            </div>
            <ul className="space-y-3 flex-1 mb-7">
              {p.features.map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color:'var(--text-secondary)' }}>
                  <CheckCircle size={14} style={{ color:'var(--positive-green)', flexShrink:0 }} /> {f}
                </li>
              ))}
            </ul>
            <button onClick={() => navigate('/signup')}
                    className={p.highlight ? 'btn-primary justify-center' : 'btn-outline justify-center'}>
              {p.cta} <ArrowRight size={14} />
            </button>
          </div>
        ))}
      </div>

      <p className="text-center text-sm mt-10" style={{ color:'var(--text-muted)' }}>
        Payments processed securely via Cashfree. Cancel anytime.
      </p>
    </div>
  )
}