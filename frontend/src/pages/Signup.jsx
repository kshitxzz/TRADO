import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Loader2, ArrowLeft, ArrowRight, BookOpen, Sparkles, BarChart3, Zap, Target, Activity } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'
import Logo from '../components/ui/Logo'
import toast from 'react-hot-toast'

const FEATURES = [
  { icon: BookOpen,  label: 'Unlimited trade logging' },
  { icon: Sparkles,  label: 'AI-powered analytics' },
  { icon: BarChart3, label: 'Performance reports' },
  { icon: Zap,       label: 'MT5 broker auto-sync' },
  { icon: Target,    label: 'Custom strategies' },
  { icon: Activity,  label: 'Trading journal & insights' },
]

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

export default function Signup() {
  const { signUp, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' })
  const [showPw, setShowPw]           = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  function update(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.email || !form.password || !form.fullName) return
    if (form.password.length < 6) { toast.error('Password must be at least 6 characters'); return }
    if (form.password !== form.confirm) { toast.error("Passwords don't match"); return }
    setLoading(true)
    const { error } = await signUp(form.email, form.password, form.fullName)
    if (error) { toast.error(error.message); setLoading(false) }
    else { toast.success('Account created! Welcome to Trado.'); navigate('/dashboard') }
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    const { error } = await signInWithGoogle()
    if (error) { toast.error(error.message); setGoogleLoading(false) }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2" style={{ background: 'var(--bg-landing)' }}>
      {/* ── Left: form panel ─────────────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center p-4 relative order-2 lg:order-1">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between mb-8">
            <Link to="/" className="flex items-center gap-2">
              <Logo height={28} />
            </Link>
            <Link to="/" className="hidden lg:flex items-center gap-1.5 text-xs hover:opacity-80 transition-opacity"
                  style={{ color: 'var(--text-muted)' }}>
              <ArrowLeft size={13} /> Back to home
            </Link>
          </div>

          <div className="glass-card p-7">
            <h1 className="text-xl font-bold text-white mb-1">Create your account</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Start your trading journey in minutes</p>

            <button onClick={handleGoogle} disabled={googleLoading}
                    className="btn-outline w-full justify-center mb-4 py-2.5">
              {googleLoading ? <Loader2 size={16} className="animate-spin" /> : <GoogleIcon />}
              Continue with Google
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>or</span>
              <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>Full Name</label>
                <input className="input-dark" placeholder="Enter your name"
                       value={form.fullName} onChange={e => update('fullName', e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>Email</label>
                <input className="input-dark" type="email" placeholder="you@example.com"
                       value={form.email} onChange={e => update('email', e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>Password</label>
                  <div className="relative">
                    <input className="input-dark pr-8" type={showPw ? 'text' : 'password'} placeholder="8+ characters"
                           value={form.password} onChange={e => update('password', e.target.value)} required />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                      {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>Confirm</label>
                  <div className="relative">
                    <input className="input-dark pr-8" type={showConfirmPw ? 'text' : 'password'} placeholder="Confirm"
                           value={form.confirm} onChange={e => update('confirm', e.target.value)} required />
                    <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                      {showConfirmPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>
              <button type="submit" disabled={loading}
                      className="btn-primary w-full justify-center py-2.5 mt-1 disabled:opacity-70">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <>Create account <ArrowRight size={15} /></>}
              </button>
            </form>

            <p className="text-center text-sm mt-5" style={{ color: 'var(--text-muted)' }}>
              Already have an account?{' '}
              <Link to="/login" className="font-semibold" style={{ color: 'var(--accent-purple-light)' }}>Sign in</Link>
            </p>
          </div>

          <p className="text-center text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
            By creating an account, you agree to our{' '}
            <a href="/terms" style={{ color: 'var(--accent-purple-light)' }}>Terms</a>
            {' '}and{' '}
            <a href="/privacy" style={{ color: 'var(--accent-purple-light)' }}>Privacy Policy</a>
          </p>
        </div>
      </div>

      {/* ── Right: brand panel (hidden on small screens) ─────────────────── */}
      <div className="hidden lg:flex flex-col justify-center relative overflow-hidden p-12 order-1 lg:order-2"
           style={{ background: 'var(--bg-landing-alt)' }}>
        <div className="absolute inset-0 pointer-events-none"
             style={{ background: 'radial-gradient(ellipse 70% 60% at 80% 20%, rgba(139,92,246,0.16) 0%, transparent 65%)' }} />
        {['12%', '88%', '95%'].map((x, i) => (
          <span key={i} className="landing-glyph" style={{ left: x, top: `${18 + i * 24}%` }}>{i % 2 === 0 ? '+' : '✕'}</span>
        ))}

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="relative">
          <h1 className="text-5xl font-black leading-[1.05] mb-4">
            <span className="text-white">Join the</span><br />
            <span style={{ backgroundImage: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>future</span>
            <span className="text-white"> of trading.</span>
          </h1>
          <p className="text-base max-w-md mb-8" style={{ color: 'var(--text-muted)' }}>
            Everything you need to track, analyze, and improve your trading — all in one platform.
          </p>

          <div className="grid grid-cols-2 gap-2.5 mb-8">
            {FEATURES.map(f => (
              <div key={f.label} className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium"
                   style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                <f.icon size={14} style={{ color: 'var(--accent-purple-light)' }} /> {f.label}
              </div>
            ))}
          </div>

          <div className="glass-card p-5 max-w-md">
            <p className="text-sm leading-relaxed mb-1" style={{ color: 'var(--text-secondary)' }}>
              Trado replaces guesswork with data — every session, symbol, and habit tracked, so your edge shows up in numbers, not just gut feel.
            </p>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>No credit card required to start.</p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}