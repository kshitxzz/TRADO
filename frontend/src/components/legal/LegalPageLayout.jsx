import { Link, useNavigate } from 'react-router-dom'
import Logo from '../ui/Logo'

export function LegalH2({ children }) {
  return (
    <h2 className="text-base sm:text-lg font-bold mt-8 mb-3 first:mt-0"
        style={{ color: 'var(--text-primary)' }}>
      {children}
    </h2>
  )
}

export function LegalP({ children }) {
  return (
    <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
      {children}
    </p>
  )
}

export function LegalUl({ children }) {
  return (
    <ul className="space-y-2 mb-4 pl-5 text-sm leading-relaxed list-disc"
        style={{ color: 'var(--text-secondary)' }}>
      {children}
    </ul>
  )
}

export default function LegalPageLayout({ title, updated, children }) {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-10 sm:py-14">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 mb-10">
          <Logo height={26} />
        </button>

        <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h1>
        <p className="text-xs mb-8" style={{ color: 'var(--text-muted)' }}>
          Last updated: {updated}
        </p>

        <div className="glass-card p-5 sm:p-8">
          {children}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-8 text-xs">
          <Link to="/terms" className="hover:underline" style={{ color: 'var(--text-muted)' }}>Terms of Service</Link>
          <Link to="/privacy" className="hover:underline" style={{ color: 'var(--text-muted)' }}>Privacy Policy</Link>
          <Link to="/refund-policy" className="hover:underline" style={{ color: 'var(--text-muted)' }}>Refund Policy</Link>
          <Link to="/" className="hover:underline" style={{ color: 'var(--text-muted)' }}>← Back to Trado</Link>
        </div>
        <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
          © 2026 Trado. Built for retail traders in India &amp; globally.
        </p>
      </div>
    </div>
  )
}