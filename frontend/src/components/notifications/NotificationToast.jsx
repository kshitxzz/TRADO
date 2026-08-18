import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Check, AlertTriangle, Info, X, Loader2 } from 'lucide-react'

const SEVERITY_STYLE = {
  critical: { icon: AlertTriangle, color: 'var(--negative-red)',        bg: 'rgba(244,63,94,0.14)' },
  warning:  { icon: AlertTriangle, color: 'var(--warning-orange)',      bg: 'rgba(245,158,11,0.14)' },
  info:     { icon: Info,          color: 'var(--accent-purple-light)', bg: 'rgba(139,92,246,0.14)' },
  success:  { icon: Check,         color: 'var(--positive-green)',      bg: 'rgba(34,197,94,0.14)' },
}

// Matches the reference recording: rounded card, icon-in-a-circle, bold
// title + muted subtitle, a bottom progress bar that depletes over
// `duration` and pauses on hover, and a close button that only appears on
// hover. react-hot-toast handles the slide-in/out + stacking (via
// `toast.custom`); this component owns everything inside one toast.
//
// This is the ONE toast design used everywhere in the app — generic
// success/error/loading toasts (via DefaultToast.jsx, wired in globally
// through <Toaster>) and the AI Alert notification (via showAlertToast.jsx)
// both render through this same component, just with different props.
export default function NotificationToast({ t, title, message, severity = 'info', duration = 6000, loading = false }) {
  const [hovered, setHovered] = useState(false)
  const elapsedRef = useRef(0)
  const style = loading
    ? { icon: Loader2, color: 'var(--accent-purple-light)', bg: 'rgba(139,92,246,0.14)' }
    : (SEVERITY_STYLE[severity] || SEVERITY_STYLE.info)
  const Icon = style.icon

  // Owns its own dismiss timer (rather than react-hot-toast's built-in
  // `duration`) so hovering can genuinely pause it — tracked via elapsed
  // time so resuming after a hover picks up where it left off instead of
  // restarting the full duration. Loading toasts skip this entirely — they
  // represent an in-flight operation and stay until whatever's tracking it
  // replaces or dismisses the toast explicitly.
  useEffect(() => {
    if (loading || hovered) return
    const start = Date.now()
    const remaining = Math.max(duration - elapsedRef.current, 0)
    const timer = setTimeout(() => toast.dismiss(t.id), remaining)
    return () => {
      clearTimeout(timer)
      elapsedRef.current += Date.now() - start
    }
  }, [loading, hovered, duration, t.id])

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        width: 360,
        maxWidth: '90vw',
        boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
        opacity: t.visible ? 1 : 0,
        transform: t.visible ? 'translateY(0)' : 'translateY(-12px)',
        transition: 'opacity 220ms ease, transform 220ms ease',
      }}>
      <div className="flex items-start gap-3 p-4 pr-9">
        <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: style.bg }}>
          <Icon size={18} style={{ color: style.color }} className={loading ? 'animate-spin' : undefined} />
        </div>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-bold leading-snug" style={{ color: 'var(--text-primary)' }}>{title}</p>
          {message && <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>{message}</p>}
        </div>
      </div>

      <button onClick={() => toast.dismiss(t.id)}
              className="absolute top-2.5 right-2.5 w-6 h-6 rounded-lg flex items-center justify-center transition-opacity duration-150"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--text-muted)', opacity: hovered ? 1 : 0 }}>
        <X size={13} />
      </button>

      {!loading && (
        <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full"
               style={{
                 background: style.color,
                 animation: `trado-toast-bar ${duration}ms linear forwards`,
                 animationPlayState: hovered ? 'paused' : 'running',
               }} />
        </div>
      )}
    </div>
  )
}