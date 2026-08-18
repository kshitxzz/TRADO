import { Sparkles, WifiOff } from 'lucide-react'
import { formatPnl, pnlColor } from '../../lib/utils'

// ─── Circular progress ring (Health Score, Goal progress, etc.) ─────────
export function CircularProgress({ value, size = 110, stroke = 9, color = 'var(--positive-green)', label, sublabel, valueSuffix = '' }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  const offset = c - (pct / 100) * c
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.8s ease-out' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-black leading-none" style={{ color, fontSize: size * 0.2 }}>{value.toFixed(1)}{valueSuffix}</p>
          {label && <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{label}</p>}
        </div>
      </div>
      {sublabel && <p className="text-xs mt-2 font-medium" style={{ color: 'var(--text-secondary)' }}>{sublabel}</p>}
    </div>
  )
}

// ─── Metric stat card ────────────────────────────────────────────────────
export function MetricCard({ icon: Icon, label, value, valueColor, sub, iconColor = 'var(--positive-green)' }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
        {Icon && <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${iconColor}1F` }}>
          <Icon size={13} style={{ color: iconColor }} />
        </div>}
      </div>
      <p className="text-xl font-bold" style={{ color: valueColor || 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

// ─── Horizontal progress row ─────────────────────────────────────────────
export function ProgressRow({ label, value, max = 100, color, display }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span className="text-xs font-bold" style={{ color: color || 'var(--text-primary)' }}>{display}</span>
      </div>
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${pct}%`, background: color || 'var(--gradient-primary)' }} />
      </div>
    </div>
  )
}

// ─── AI coach callout card ───────────────────────────────────────────────
export function AICoachCard({ tip, loading, unavailableMessage }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid rgba(139,92,246,0.3)' }}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.18)' }}>
          <Sparkles size={14} style={{ color: 'var(--accent-purple-light)' }} />
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--accent-purple-light)' }}>Trado AI Coach</p>
          {loading ? (
            <div className="space-y-2 mt-1">
              <div className="skeleton h-3 rounded w-full" />
              <div className="skeleton h-3 rounded w-2/3" />
            </div>
          ) : unavailableMessage ? (
            <div className="flex items-start gap-2">
              <WifiOff size={12} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--warning-orange)' }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--warning-orange)' }}>AI coaching is unavailable right now. <span style={{ color: 'var(--text-muted)' }}>({unavailableMessage})</span></p>
            </div>
          ) : (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{tip}</p>
          )}
        </div>
      </div>
    </div>
  )
}

const RISK_STYLE = {
  low: { color: 'var(--positive-green)', bg: 'rgba(34,197,94,0.12)' },
  medium: { color: 'var(--warning-orange)', bg: 'rgba(245,158,11,0.12)' },
  high: { color: 'var(--negative-red)', bg: 'rgba(244,63,94,0.12)' },
}
export function RiskBadge({ risk }) {
  const s = RISK_STYLE[risk] || RISK_STYLE.low
  return <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md flex-shrink-0" style={{ color: s.color, background: s.bg }}>{risk} risk</span>
}

export { formatPnl, pnlColor }