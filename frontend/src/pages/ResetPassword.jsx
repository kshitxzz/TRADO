import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Loader2, CheckCircle2, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabaseClient'
import Logo from '../components/ui/Logo'
import toast from 'react-hot-toast'

// ─── Destination after the user clicks the "reset your password" link in
// their email. Supabase's client detects the recovery token in the URL and
// establishes a temporary session automatically — we just confirm that
// session exists before letting them set a new password. ───────────────────
export default function ResetPassword() {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [validLink, setValidLink] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setValidLink(!!session)
      setChecking(false)
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return }
    if (password !== confirm) { toast.error("Passwords don't match"); return }
    setLoading(true)
    const { error } = await updatePassword(password)
    setLoading(false)
    if (error) { toast.error(error.message); return }
    setDone(true)
    toast.success('Password updated')
    setTimeout(() => navigate('/dashboard'), 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
         style={{ background: 'var(--bg-landing)' }}>
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 30%, rgba(139,92,246,0.12) 0%, transparent 70%)' }} />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                  className="w-full max-w-sm relative">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Logo height={30} />
        </div>

        <div className="glass-card p-7">
          {checking ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-purple)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Checking your reset link…</p>
            </div>
          ) : !validLink ? (
            <div className="text-center py-2">
              <h1 className="text-xl font-bold text-white mb-2">Link expired</h1>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                This password reset link is invalid or has expired. Request a new one from the sign-in page.
              </p>
              <Link to="/login" className="btn-primary w-full justify-center py-2.5">Back to sign in</Link>
            </div>
          ) : done ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                   style={{ background: 'rgba(34,197,94,0.14)' }}>
                <CheckCircle2 size={22} style={{ color: 'var(--positive-green)' }} />
              </div>
              <h1 className="text-xl font-bold text-white mb-1">Password updated</h1>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Taking you to your dashboard…</p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-white mb-1">Set a new password</h1>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Choose a new password for your account.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>New password</label>
                  <div className="relative">
                    <input className="input-dark pr-10" type={showPw ? 'text' : 'password'} placeholder="Min. 6 characters"
                           value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                            className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>Confirm new password</label>
                  <input className="input-dark" type={showPw ? 'text' : 'password'} placeholder="Re-enter password"
                         value={confirm} onChange={e => setConfirm(e.target.value)} required />
                </div>
                <button type="submit" disabled={loading}
                        className="btn-primary w-full justify-center py-2.5 disabled:opacity-70">
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <>Update password <ArrowRight size={15} /></>}
                </button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}