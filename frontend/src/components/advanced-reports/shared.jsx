import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

// A local accent-blue used only within Advanced Reports to match the
// reference design's selected-state color (the rest of the app leans on
// --accent-purple, but this section's pills/lines are blue).
export const BLUE = '#3B82F6'
export const BLUE_LIGHT = '#60A5FA'

// ── Small stat card: icon chip + label + big value ──────────────────────────
export function StatCard({ icon: Icon, label, value, valueColor, iconColor, iconBg }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
             style={{ background: iconBg || 'rgba(255,255,255,0.06)' }}>
          <Icon size={14} style={{ color: iconColor || 'var(--text-muted)' }} />
        </div>
        <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <p className="text-xl font-bold" style={{ color: valueColor || 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

// ── Hero card with a colored top strip (Reports tab) ────────────────────────
export function HeroDayCard({ icon: Icon, accent, label, day, trades, value, valueColor }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ height: 3, background: accent }} />
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
               style={{ background: `${accent}22` }}>
            <Icon size={14} style={{ color: accent }} />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</span>
        </div>
        <p className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{day || 'N/A'}</p>
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: 'var(--text-muted)' }}>{trades}</span>
          <span className="font-bold" style={{ color: valueColor || 'var(--text-primary)' }}>{value}</span>
        </div>
      </div>
    </div>
  )
}

// ── Pill-style tab group (Summary | Days | Trades, etc.) ────────────────────
export function TabPills({ tabs, active, onChange }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tabs.map(t => {
        const isActive = t.value === active
        return (
          <button key={t.value} onClick={() => onChange(t.value)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={{
                    background: isActive ? BLUE : 'rgba(255,255,255,0.04)',
                    color: isActive ? '#fff' : 'var(--text-secondary)',
                  }}>
            {t.icon && <t.icon size={14} />}
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Simple dropdown (Day/Week/Month/Year selector, P&L Showing, etc.) ──────
export function Dropdown({ value, options, onChange, minWidth = 110 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  const currentLabel = options.find(o => o.value === value)?.label || value
  return (
    <div className="relative" ref={ref} style={{ minWidth }}>
      <button onClick={() => setOpen(o => !o)}
              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)' }}>
        {currentLabel}
        <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-20 rounded-lg overflow-hidden shadow-xl"
             style={{ background: '#181722', border: '1px solid rgba(255,255,255,0.08)', minWidth: '100%' }}>
          {options.map(o => (
            <button key={o.value}
                    onClick={() => { onChange(o.value); setOpen(false) }}
                    className="w-full text-left px-3 py-2 text-sm whitespace-nowrap"
                    style={{
                      background: o.value === value ? BLUE : 'transparent',
                      color: o.value === value ? '#fff' : 'var(--text-secondary)',
                    }}
                    onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                    onMouseLeave={e => { if (o.value !== value) e.currentTarget.style.background = 'transparent' }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Chart card wrapper (icon + title + subtitle + right-side controls) ─────
export function ChartCard({ icon: Icon, iconColor, iconBg, title, subtitle, right, children }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: iconBg || 'rgba(255,255,255,0.06)' }}>
            <Icon size={16} style={{ color: iconColor || 'var(--text-muted)' }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{title}</p>
            {subtitle && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

export function EmptyState({ Icon, title, sub }) {
  return (
    <div className="glass-card p-14 text-center">
      <Icon size={40} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-muted)' }} />
      <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</p>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{sub}</p>
    </div>
  )
}