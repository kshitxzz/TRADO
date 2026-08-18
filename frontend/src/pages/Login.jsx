import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Loader2, ArrowLeft, ArrowRight, TrendingUp, BarChart3, Sparkles, ShieldCheck, Mail } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'
import Logo from '../components/ui/Logo'
import toast from 'react-hot-toast'

const FEATURES = [
  { icon: TrendingUp,  label: 'Auto-sync from MT5' },
  { icon: BarChart3,   label: '50+ performance metrics' },
  { icon: Sparkles,    label: 'AI-powered coaching' },
  { icon: ShieldCheck, label: 'Bank-level encryption' },
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

export default function Login() {
  const { signIn, signInWithGoogle, resetPasswordForEmail } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('signin') // 'signin' | 'forgot'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [resetEmail, setResetEmail]   = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSent, setResetSent]     = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    try {
      const { error } = await signIn(email, password)
      if (error) { toast.error(error.message); return }
      navigate('/dashboard')
    } catch (err) {
      console.error('[Login] sign in failed:', err)
      toast.error(err?.message || 'Something went wrong — please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    try {
      const { error } = await signInWithGoogle()
      if (error) { toast.error(error.message); setGoogleLoading(false) }
      // on success the page redirects away, so no need to reset loading here
    } catch (err) {
      console.error('[Login] Google sign in failed:', err)
      toast.error(err?.message || 'Something went wrong — please try again.')
      setGoogleLoading(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    if (!resetEmail) return
    setResetLoading(true)
    try {
      const { error } = await resetPasswordForEmail(resetEmail)
      if (error) { toast.error(error.message); return }
      setResetSent(true)
    } catch (err) {
      console.error('[Login] password reset failed:', err)
      toast.error(err?.message || 'Something went wrong — please try again.')
    } finally {
      setResetLoading(false)
    }
  }

  function openForgot() {
    setResetEmail(email)
    setResetSent(false)
    setMode('forgot')
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2" style={{ background: 'var(--bg-landing)' }}>
      {/* ── Left: brand panel (hidden on small screens) ─────────────────── */}
      <div className="hidden lg:flex flex-col justify-between relative overflow-hidden p-12"
           style={{ background: 'var(--bg-landing-alt)' }}>
        <div className="absolute inset-0 pointer-events-none"
             style={{ background: 'radial-gradient(ellipse 70% 60% at 20% 20%, rgba(139,92,246,0.16) 0%, transparent 65%)' }} />
        {['10%', '85%', '92%'].map((x, i) => (
          <span key={i} className="landing-glyph" style={{ left: x, top: `${20 + i * 22}%` }}>{i % 2 === 0 ? '✕' : '+'}</span>
        ))}

        <Link to="/" className="flex items-center gap-2 relative">
          <Logo height={28} />
        </Link>

        <div className="relative">
          <h1 className="text-5xl font-black leading-[1.05] mb-4">
            <span className="text-white">Welcome</span><br />
            <span style={{ backgroundImage: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>back.</span>
          </h1>
          <p className="text-base max-w-sm mb-8" style={{ color: 'var(--text-muted)' }}>
            Your trades are waiting. Pick up where you left off.
          </p>
          <div className="flex flex-wrap gap-2.5">
            {FEATURES.map(f => (
              <div key={f.label} className="flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium"
                   style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                <f.icon size={13} style={{ color: 'var(--accent-purple-light)' }} /> {f.label}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs relative" style={{ color: 'var(--text-muted)' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--positive-green)' }} />
          All systems operational
        </div>
      </div>

      {/* ── Right: form panel ────────────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center p-4 relative">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <Logo height={28} />
            </div>
          </div>
          <Link to="/" className="hidden lg:flex items-center gap-1.5 text-xs mb-6 hover:opacity-80 transition-opacity"
                style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft size={13} /> Back to home
          </Link>

          <div className="glass-card p-7 overflow-hidden">
            <AnimatePresence mode="wait">
              {mode === 'signin' ? (
                <motion.div key="signin" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.2 }}>
                  <h1 className="text-xl font-bold text-white mb-1">Sign in</h1>
                  <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Enter your credentials to access your account</p>

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

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>Email</label>
                      <input className="input-dark" type="email" placeholder="you@example.com"
                             value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>Password</label>
                      <div className="relative">
                        <input className="input-dark pr-10" type={showPw ? 'text' : 'password'} placeholder="Enter your password"
                               value={password} onChange={e => setPassword(e.target.value)} required />
                        <button type="button" onClick={() => setShowPw(!showPw)}
                                className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                          {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                    <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 disabled:opacity-70">
                      {loading ? <Loader2 size={16} className="animate-spin" /> : <>Sign in <ArrowRight size={15} /></>}
                    </button>
                  </form>

                  <button onClick={openForgot} className="block w-full text-center text-xs mt-4 hover:opacity-80 transition-opacity"
                          style={{ color: 'var(--accent-purple-light)' }}>
                    Forgot password?
                  </button>

                  <p className="text-center text-sm mt-4" style={{ color: 'var(--text-muted)' }}>
                    Don't have an account?{' '}
                    <Link to="/signup" className="font-semibold" style={{ color: 'var(--accent-purple-light)' }}>Sign up</Link>
                  </p>
                </motion.div>
              ) : (
                <motion.div key="forgot" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}>
                  <button onClick={() => setMode('signin')}
                          className="flex items-center gap-1.5 text-xs mb-4 hover:opacity-80 transition-opacity" style={{ color: 'var(--text-muted)' }}>
                    <ArrowLeft size={13} /> Back to sign in
                  </button>

                  {resetSent ? (
                    <div className="text-center py-2">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                           style={{ background: 'rgba(139,92,246,0.14)' }}>
                        <Mail size={20} style={{ color: 'var(--accent-purple-light)' }} />
                      </div>
                      <h1 className="text-xl font-bold text-white mb-1.5">Check your email</h1>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        If an account exists for <span style={{ color: 'var(--text-secondary)' }}>{resetEmail}</span>, a password reset link is on its way.
                      </p>
                    </div>
                  ) : (
                    <>
                      <h1 className="text-xl font-bold text-white mb-1">Reset your password</h1>
                      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                        Enter your email and we'll send you a link to set a new password.
                      </p>
                      <form onSubmit={handleReset} className="space-y-4">
                        <div>
                          <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>Email</label>
                          <input className="input-dark" type="email" placeholder="you@example.com"
                                 value={resetEmail} onChange={e => setResetEmail(e.target.value)} required autoFocus />
                        </div>
                        <button type="submit" disabled={resetLoading} className="btn-primary w-full justify-center py-2.5 disabled:opacity-70">
                          {resetLoading ? <Loader2 size={16} className="animate-spin" /> : 'Send reset link'}
                        </button>
                      </form>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <p className="text-center text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
            By signing in, you agree to our{' '}
            <a href="/terms" style={{ color: 'var(--accent-purple-light)' }}>Terms of Service</a>
          </p>
        </div>
      </div>
    </div>
  )
}