import { useState, useRef, useEffect } from 'react'

export const BLUE = '#3B82F6'

// ── Custom select dropdown (replaces native <select> — its open-state popup
//    is rendered by the OS/browser chrome and largely ignores page CSS,
//    which is why native selects show a white list even on a dark page) ───
export function SettingsSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  const selected = options.find(o => o.value === value)
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} className="input-dark flex items-center justify-between w-full text-left">
        <span className="truncate">{selected?.label || value}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 mt-1.5 z-30 rounded-xl overflow-hidden shadow-2xl max-h-64 overflow-y-auto"
             style={{ background: '#19181C', border: '1px solid rgba(255,255,255,0.1)' }}>
          {options.map(o => {
            const isSel = o.value === value
            return (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false) }}
                      className="w-full text-left px-4 py-2.5 text-sm truncate"
                      style={{ background: isSel ? 'rgba(59,130,246,0.15)' : 'transparent', color: isSel ? BLUE : 'var(--text-secondary)' }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                      onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}>
                {o.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Sidebar nav item (icon box + title + subtitle + chevron) ───────────────
export function SidebarItem({ icon: Icon, label, sub, active, danger, onClick }) {
  return (
    <button onClick={onClick}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors relative"
            style={{ background: active ? 'rgba(59,130,246,0.12)' : 'transparent' }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: BLUE }} />}
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
           style={{ background: active ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.05)' }}>
        <Icon size={16} style={{ color: danger ? 'var(--negative-red)' : active ? BLUE : 'var(--text-secondary)' }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold truncate" style={{ color: danger ? 'var(--negative-red)' : active ? BLUE : 'var(--text-primary)' }}>{label}</p>
        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{sub}</p>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

// ── Section card header (icon + title + subtitle) ───────────────────────────
export function SectionHeader({ icon: Icon, title, sub, iconBg, iconColor, right }) {
  return (
    <div className="flex items-center justify-between mb-1">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
             style={{ background: iconBg || 'rgba(59,130,246,0.15)' }}>
          <Icon size={16} style={{ color: iconColor || BLUE }} />
        </div>
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          {sub && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

// ── Read-only / editable field row (icon + label + value) ───────────────────
export function FieldRow({ icon: Icon, label, value, editing, onChange, type = 'text', placeholder }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <Icon size={14} style={{ color: 'var(--text-muted)' }} />
        </div>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</span>
      </div>
      {editing ? (
        <input type={type} value={value ?? ''} placeholder={placeholder}
               onChange={e => onChange(e.target.value)}
               className="text-sm text-right bg-transparent outline-none flex-1 max-w-[240px]"
               style={{ color: 'var(--text-primary)', borderBottom: '1px solid rgba(59,130,246,0.4)', paddingBottom: 2 }} />
      ) : (
        <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{value || '—'}</span>
      )}
    </div>
  )
}

// ── Toggle switch (local blue variant — kept separate from the app-wide
//    purple .toggle-track so this page can use its own accent without
//    affecting toggles elsewhere) ───────────────────────────────────────────
export function Toggle({ on, onToggle, disabled }) {
  return (
    <button type="button" disabled={disabled} onClick={onToggle}
            className="relative flex-shrink-0 transition-colors"
            style={{
              width: 40, height: 22, borderRadius: 11,
              background: on ? BLUE : 'rgba(255,255,255,0.12)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
            }}>
      <span className="absolute rounded-full bg-white transition-transform"
            style={{ width: 16, height: 16, top: 3, left: 3, transform: on ? 'translateX(18px)' : 'translateX(0)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </button>
  )
}

// ── "Saved" pulse badge shown next to a tab title after an autosave ────────
export function SavedBadge({ show }) {
  if (!show) return null
  return (
    <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md" style={{ color: 'var(--positive-green)', background: 'rgba(34,197,94,0.12)' }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      Saved
    </span>
  )
}