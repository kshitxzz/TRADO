import { Sparkles, AlertTriangle, Shield, Info, WifiOff } from 'lucide-react'
import { formatPnl, pnlColor } from '../../lib/utils'

// ─── Sub-tab bar (used inside Behavior & Discipline / Performance / Patterns & Timing) ───
export function SubTabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium flex-shrink-0 transition-colors"
          style={{
            background: active === t.key ? 'rgba(139,92,246,0.14)' : 'transparent',
            color: active === t.key ? 'var(--accent-purple-light)' : 'var(--text-muted)',
            border: `1px solid ${active === t.key ? 'rgba(139,92,246,0.3)' : 'transparent'}`,
          }}
        >
          {t.icon && <t.icon size={13} />} {t.label}
        </button>
      ))}
    </div>
  )
}

// ─── Section heading ────────────────────────────────────────────────────
export function SectionHeading({ icon: Icon, title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={15} style={{ color: 'var(--accent-purple-light)' }} />}
        <div>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{title}</h3>
          {subtitle && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

// ─── Generic metric card (used in top stat rows) ───────────────────────
export function MetricCard({ icon: Icon, label, value, valueColor, sub }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
        {Icon && <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.12)' }}>
          <Icon size={13} style={{ color: 'var(--positive-green)' }} />
        </div>}
      </div>
      <p className="text-xl font-bold" style={{ color: valueColor || 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

// ─── Severity pill (HIGH / MEDIUM / LOW / POSITIVE) ────────────────────
const SEVERITY_STYLE = {
  high:     { color: '#F97316', bg: 'rgba(249,115,22,0.12)', label: 'HIGH' },
  medium:   { color: '#EAB308', bg: 'rgba(234,179,8,0.12)',  label: 'MEDIUM' },
  low:      { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', label: 'LOW' },
  positive: { color: 'var(--positive-green)', bg: 'rgba(34,197,94,0.12)', label: 'POSITIVE' },
  info:     { color: 'var(--accent-purple-light)', bg: 'rgba(139,92,246,0.12)', label: 'INFO' },
}

export function SeverityPill({ severity }) {
  const s = SEVERITY_STYLE[severity] || SEVERITY_STYLE.info
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md" style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  )
}

// ─── Labelled badge pill (TILT TAX / HOURLY WAGE style) ────────────────
export function LabelBadge({ color, children }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md" style={{ color, background: `${color}20` }}>
      {children}
    </span>
  )
}

// ─── Reality-Check style metric card ────────────────────────────────────
export function InsightCard({ icon: Icon, color, badge, badgeColor, value, valueColor, sub, children }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}18` }}>
          <Icon size={16} style={{ color }} />
        </div>
        {badge && <LabelBadge color={badgeColor || color}>{badge}</LabelBadge>}
      </div>
      {value != null && <p className="text-2xl font-black mb-1" style={{ color: valueColor || 'var(--text-primary)' }}>{value}</p>}
      {sub && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      {children}
    </div>
  )
}

// ─── AI narrative card (reused Overview style) ─────────────────────────
export function AICard({ type, title, text, severity = 'info' }) {
  const colors = { info: 'var(--accent-purple)', warning: 'var(--warning-orange)', positive: 'var(--positive-green)' }
  const icons  = { info: Sparkles, warning: AlertTriangle, positive: Shield }
  const Icon   = icons[severity] || Sparkles
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: `1px solid ${colors[severity] || colors.info}30` }}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${colors[severity] || colors.info}18` }}>
          <Icon size={14} style={{ color: colors[severity] || colors.info }} />
        </div>
        <div>
          {type && <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: colors[severity] || colors.info }}>{type}</p>}
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{title}</p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{text}</p>
        </div>
      </div>
    </div>
  )
}

export function AIUnavailableBanner({ message }) {
  return (
    <div className="rounded-lg px-3 py-2.5 mb-3 flex items-start gap-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
      <WifiOff size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--warning-orange)' }} />
      <p className="text-xs leading-relaxed" style={{ color: 'var(--warning-orange)' }}>
        AI analysis is unavailable right now — showing basic data computed from your trades only, no AI involved.
        {message && <span style={{ color: 'var(--text-muted)' }}> ({message})</span>}
      </p>
    </div>
  )
}

// ─── Horizontal progress row (label — bar — value) ─────────────────────
export function ProgressRow({ label, value, max = 100, color, suffix = '%' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span className="text-xs font-bold" style={{ color: color || 'var(--text-primary)' }}>{typeof value === 'number' ? value.toFixed(0) : value}{suffix}</span>
      </div>
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${pct}%`, background: color || 'var(--gradient-primary)' }} />
      </div>
    </div>
  )
}

// ─── Multi-stop gradient gauge bar (e.g. Tilt Risk) with a value marker ─
export function GaugeBar({ value, max = 100, stops, labels }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div>
      <div className="relative" style={{ height: 10 }}>
        <div className="w-full h-full rounded-full" style={{ background: `linear-gradient(90deg, ${stops.join(',')})` }} />
        <div className="absolute top-1/2 rounded-full" style={{
          left: `${pct}%`, width: 4, height: 18, transform: 'translate(-50%,-50%)',
          background: 'white', boxShadow: '0 0 0 2px rgba(0,0,0,0.4)',
        }} />
      </div>
      {labels && (
        <div className="flex justify-between text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      )}
    </div>
  )
}

// ─── Letter-grade badge (used in Trading Report Card) ───────────────────
export function gradeLetterColor(grade) {
  if (grade === 'A+' || grade === 'A') return 'var(--positive-green)'
  if (grade === 'B') return '#3B82F6'
  if (grade === 'C') return 'var(--warning-orange)'
  return 'var(--negative-red)'
}

export function GradeBadge({ grade, label, sub }) {
  const color = gradeLetterColor(grade)
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-lg" style={{ background: `${color}18`, color }}>
        {grade}
      </div>
      <div className="text-center">
        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
        {sub != null && <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
    </div>
  )
}

export { formatPnl, pnlColor }