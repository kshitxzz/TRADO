import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Lightbulb, Sunrise, Flag, FileText, BarChart2, Sun, CalendarCheck, TrendingUp,
  Target, HeartPulse, AlertTriangle, ChevronDown, Check,
} from 'lucide-react'


// ── Popover portal ───────────────────────────────────────────────────────────
// Like layout/DropdownPortal (portaled to <body>, anchored to the trigger) but
// it flips above the trigger when there isn't room below and clamps its height
// to the viewport — needed for menus that open from the bottom of a scroll area
// (e.g. "Add field"). z-index 9999 keeps it above notebook dialogs (9000).
function DropdownPortal({ open, anchorRef, onClose, children, width = 220, align = 'right', gap = 6 }) {
  const panelRef = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) { setPos(null); return }
    function update() {
      const r = anchorRef.current.getBoundingClientRect()
      const h = panelRef.current?.scrollHeight || 0
      const vh = window.innerHeight, vw = window.innerWidth
      const below = vh - r.bottom - gap - 10
      const above = r.top - gap - 10
      const up = h > below && above > below
      const left = align === 'right'
        ? Math.max(12, Math.min(r.right - width, vw - width - 12))
        : Math.max(12, Math.min(r.left, vw - width - 12))
      setPos({ up, left, top: r.bottom + gap, bottom: vh - r.top + gap, maxH: Math.max(140, up ? above : below) })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [open, anchorRef, align, width, gap])

  useEffect(() => {
    if (!open || !onClose) return
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return
      onClose()
    }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, onClose, anchorRef])

  if (!open) return null
  const style = {
    position: 'fixed', zIndex: 9999, width, maxWidth: 'calc(100vw - 24px)', left: pos?.left ?? 0,
    ...(pos?.up ? { bottom: pos.bottom } : { top: pos?.top ?? 0 }),
    maxHeight: pos?.maxH, overflowY: 'auto', borderRadius: 12,
    visibility: pos ? 'visible' : 'hidden', // measured off-screen first, then revealed
  }
  return createPortal(<div ref={panelRef} style={style}>{children}</div>, document.body)
}

// Template icon keys → lucide components.
export const ICONS = {
  lightbulb: Lightbulb, sunrise: Sunrise, flag: Flag, file: FileText, barchart: BarChart2,
  sun: Sun, calendar: CalendarCheck, trending: TrendingUp, target: Target, heart: HeartPulse,
  alert: AlertTriangle,
}

export function TemplateIcon({ name, size = 16, ...rest }) {
  const Icon = ICONS[name] || FileText
  return <Icon size={size} {...rest} />
}

// ── Modal ────────────────────────────────────────────────────────────────────
// Portaled to <body> (like DropdownPortal) so no ancestor stacking context can
// paint over it. z-index 9000 sits just under DropdownPortal's 9999, so a
// dropdown opened *inside* a dialog still shows on top of it.
export function Modal({ open, onClose, children, width = 440, label }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="nb-modal"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 9000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-label={label}
            initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="relative w-full overflow-hidden"
            style={{
              maxWidth: width, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
              borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
            }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// ── Confirm dialog (replaces window.confirm so it matches the app) ───────────
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, busy, onConfirm, onCancel }) {
  return (
    <Modal open={open} onClose={busy ? undefined : onCancel} width={400} label={title}>
      <div className="p-5">
        <h3 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{message}</p>
        <div className="flex gap-2.5 mt-5">
          <button onClick={onCancel} disabled={busy} className="nb-btn nb-btn-ghost flex-1">{cancelLabel}</button>
          <button onClick={onConfirm} disabled={busy} autoFocus
                  className={`nb-btn flex-1 ${danger ? 'nb-btn-danger' : 'nb-btn-primary'}`}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Menu (the "…" menus) ─────────────────────────────────────────────────────
export function Menu({ open, anchorRef, onClose, width = 200, align = 'right', children }) {
  return (
    <DropdownPortal open={open} anchorRef={anchorRef} onClose={onClose} width={width} align={align} gap={6}>
      <div className="p-1.5 nb-pop" role="menu"
           style={{
             background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 12,
             boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
           }}>
        {children}
      </div>
    </DropdownPortal>
  )
}

export function MenuItem({ icon: Icon, children, onClick, danger, active, trailing }) {
  return (
    <button role="menuitem" onClick={onClick}
            className="nb-menu-item w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left"
            style={{ color: danger ? 'var(--negative-red)' : active ? 'var(--accent-purple-light)' : 'var(--text-primary)' }}>
      {Icon && <Icon size={14} className="flex-shrink-0" style={{ opacity: danger ? 1 : 0.7 }} />}
      <span className="flex-1 truncate">{children}</span>
      {trailing}
    </button>
  )
}

export const MenuDivider = () => <div className="my-1 h-px" style={{ background: 'var(--border-subtle)' }} />
export const MenuLabel = ({ children }) => (
  <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{children}</div>
)

// ── Dropdown (themed replacement for <select>) ───────────────────────────────
// `options`: [{ value, label, hint? }]. Native <select> popups ignore the app's
// theme, so every select-style control in the notebook uses this instead.
export function Dropdown({ value, options, onChange, placeholder = 'Select…', className = '', size = 'md', minWidth = 160, buttonStyle, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const [w, setW] = useState(minWidth)

  useEffect(() => {
    if (!open) return
    setW(Math.max(minWidth, ref.current?.offsetWidth || minWidth))
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, minWidth])

  const current = options.find(o => o.value === value)
  const pad = size === 'sm' ? 'px-2.5 py-1.5 text-[12px]' : 'px-3 py-2.5 text-[13px]'

  return (
    <>
      <button ref={ref} type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
              onClick={() => setOpen(o => !o)}
              className={`nb-field w-full flex items-center justify-between gap-2 rounded-lg text-left ${pad} ${className}`}
              style={buttonStyle}>
        <span className="truncate" style={{ color: current ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {current ? current.label : placeholder}
        </span>
        <ChevronDown size={14} className="flex-shrink-0 transition-transform" style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      <DropdownPortal open={open} anchorRef={ref} onClose={() => setOpen(false)} width={w} align="left" gap={6}>
        <div className="p-1.5 nb-pop max-h-64 overflow-y-auto" role="listbox"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.45)' }}>
          {options.map(o => (
            <button key={String(o.value)} role="option" aria-selected={o.value === value}
                    onClick={() => { onChange(o.value); setOpen(false) }}
                    className="nb-menu-item w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] text-left"
                    style={{ color: o.value === value ? 'var(--accent-purple-light)' : 'var(--text-primary)', fontFamily: o.fontFamily }}>
              <span className="flex-1 truncate">{o.label}</span>
              {o.hint && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{o.hint}</span>}
              {o.value === value && <Check size={13} className="flex-shrink-0" />}
            </button>
          ))}
        </div>
      </DropdownPortal>
    </>
  )
}