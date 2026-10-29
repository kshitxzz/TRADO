import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import Popover from './Popover'
import { buildPalette, toCss, colorHex, colorAlpha, CHECKER } from '../../lib/backtest/colors'

// Opacity slider look (white thumb on a thin track). Injected once so no global stylesheet needs to change.
if (typeof document !== 'undefined' && !document.getElementById('bt-range-styles')) {
  const st = document.createElement('style')
  st.id = 'bt-range-styles'
  st.textContent = `
    .bt-range{-webkit-appearance:none;appearance:none;height:6px;border-radius:999px;outline:none;cursor:pointer;background:rgba(255,255,255,.14)}
    .bt-range::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid #131722;box-shadow:0 0 0 1px rgba(255,255,255,.35)}
    .bt-range::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid #131722}
    .bt-range::-webkit-slider-runnable-track{background:transparent}`
  document.head.appendChild(st)
}

const FIELD_BG = 'rgba(255,255,255,0.05)'
const ACCENT = 'var(--accent-purple)'

// ── layout helpers ───────────────────────────────────────────────────────
export const Section = ({ title, children }) => (
  <div className="mb-6 last:mb-1">
    {title && <p className="mb-3.5 text-[11px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>{title}</p>}
    <div className="space-y-3">{children}</div>
  </div>
)

/** A labelled row: label on the left, its controls flush right. */
export const Field = ({ label, children }) => (
  <div className="flex items-center justify-between gap-4 min-h-[36px]">
    <span className="text-[13px]" style={{ color: 'var(--text-primary)' }}>{label}</span>
    <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
  </div>
)

// ── checkbox ─────────────────────────────────────────────────────────────
export function Check2({ checked, onChange, label, disabled, indent = 0 }) {
  return (
    <div style={{ paddingLeft: indent * 28 }}>
      <div className={`inline-flex items-center gap-3 text-[13px] ${disabled ? 'opacity-40' : 'cursor-pointer'}`} style={{ color: 'var(--text-primary)' }}>
        <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} onClick={() => !disabled && onChange(!checked)}
                className="w-[20px] h-[20px] rounded-[6px] flex items-center justify-center flex-shrink-0 transition-colors"
                style={{ background: checked ? ACCENT : 'transparent', border: `1.5px solid ${checked ? ACCENT : 'var(--text-muted)'}` }}>
          {checked && <Check size={13} strokeWidth={3} style={{ color: '#fff' }} />}
        </button>
        <span onClick={() => !disabled && onChange(!checked)}>{label}</span>
      </div>
    </div>
  )
}

// ── dropdowns ────────────────────────────────────────────────────────────
const selectBtn = { border: '1px solid var(--border-subtle)', background: FIELD_BG }
const Chevron = ({ open }) => <ChevronDown size={14} style={{ color: 'var(--text-secondary)', transform: open ? 'rotate(180deg)' : undefined }} className="flex-shrink-0" />
const rowStyle = (on) => ({ color: on ? '#fff' : 'var(--text-primary)', background: on ? ACCENT : undefined, borderRadius: on ? 6 : 0, margin: on ? '0 4px' : 0, width: on ? 'calc(100% - 8px)' : '100%' })

export function TvSelect({ value, options, onChange, width = 160, disabled, maxHeight = 300 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const sel = options.find(o => String(o.id) === String(value))
  return (
    <div ref={ref}>
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)} style={{ width, ...selectBtn }}
              className="h-[34px] px-3 rounded-lg flex items-center justify-between gap-2 text-[12.5px] text-left disabled:opacity-40 hover:bg-white/5">
        <span className="truncate" style={{ color: 'var(--text-primary)' }}>{sel?.label ?? String(value)}</span>
        <Chevron open={open} />
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} align="right" style={{ width: Math.max(width, 170), maxHeight }}>
        <div className="py-1">
          {options.map(o => {
            const on = String(o.id) === String(value)
            return (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false) }} ref={on ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                      className="block px-3 py-[7px] text-left text-[12.5px] hover:bg-white/5" style={rowStyle(on)}>
                {o.label}
              </button>
            )
          })}
        </div>
      </Popover>
    </div>
  )
}

/** Dropdown of tick boxes — the label shows the first choice plus a count, e.g. "Ticker +2". */
export function MultiSelect({ options, value, onChange, width = 160, emptyLabel = 'Hidden' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const on = options.filter(o => value[o.id])
  const label = on.length === 0 ? emptyLabel : on.length === 1 ? on[0].label : `${on[0].label} +${on.length - 1}`
  return (
    <div ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ width, ...selectBtn }} className="h-[34px] px-3 rounded-lg flex items-center justify-between gap-2 text-[12.5px] text-left hover:bg-white/5">
        <span className="truncate" style={{ color: 'var(--text-primary)' }}>{label}</span>
        <Chevron open={open} />
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} align="right" style={{ width: Math.max(width, 170) }}>
        <div className="py-2 px-3 space-y-2.5">
          {options.map(o => <Check2 key={o.id} checked={!!value[o.id]} onChange={(v) => onChange({ ...value, [o.id]: v })} label={o.label} />)}
        </div>
      </Popover>
    </div>
  )
}

const dash = (k) => (k === 'dashed' ? '7 4' : k === 'dotted' ? '1.5 3.5' : undefined)
const LineSample = ({ kind, color = 'var(--text-secondary)' }) => (
  <svg width="40" height="8" className="flex-shrink-0"><line x1="1" y1="4" x2="39" y2="4" stroke={color} strokeWidth="1.8" strokeDasharray={dash(kind)} strokeLinecap={kind === 'dotted' ? 'round' : undefined} /></svg>
)

/** Dropdown that shows each line style as a drawn line. */
export function LineStyleSelect({ value, onChange, width = 120 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const kinds = ['solid', 'dashed', 'dotted']
  return (
    <div ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ width, ...selectBtn }} className="h-[34px] px-3 rounded-lg flex items-center justify-between gap-2 hover:bg-white/5" title="Line style">
        <LineSample kind={value} color="var(--text-primary)" />
        <Chevron open={open} />
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} align="right" style={{ width: Math.max(width, 120) }}>
        <div className="py-1">
          {kinds.map(k => (
            <button key={k} type="button" onClick={() => { onChange(k); setOpen(false) }} className="flex items-center px-3 py-[9px] hover:bg-white/5" style={rowStyle(value === k)}>
              <LineSample kind={k} color={value === k ? '#fff' : 'var(--text-primary)'} />
            </button>
          ))}
        </div>
      </Popover>
    </div>
  )
}

// ── number box ───────────────────────────────────────────────────────────
export function NumBox({ value, onChange, min = 0, max = 999, unit, width = 76 }) {
  const [text, setText] = useState(String(value ?? ''))
  const focus = useRef(false)
  useEffect(() => { if (!focus.current) setText(value == null ? '' : String(value)) }, [value])
  const commit = (raw) => {
    const t = raw.replace(/[^0-9]/g, '')
    setText(t)
    const n = parseInt(t, 10)
    if (Number.isFinite(n) && n >= min && n <= max) onChange(n)
  }
  return (
    <div className="flex items-center gap-2">
      <input value={text} inputMode="numeric" onFocus={() => { focus.current = true }}
             onBlur={() => { focus.current = false; setText(value == null ? '' : String(value)) }} onChange={(e) => commit(e.target.value)}
             className="h-[34px] px-3 rounded-lg text-[13px] text-right outline-none tabular-nums" style={{ width, ...selectBtn, color: 'var(--text-primary)' }} />
      {unit && <span className="text-[12.5px] w-[34px]" style={{ color: 'var(--text-secondary)' }}>{unit}</span>}
    </div>
  )
}

// ── colour picker ────────────────────────────────────────────────────────
const CUSTOM_KEY = 'trado_bt_custom_colors'
const loadCustom = () => { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY)) || [] } catch { return [] } }
const PAL = buildPalette()

export function TvColorPicker({ value, onChange, opacity = true }) {
  const hex = colorHex(value), alpha = colorAlpha(value)
  const [custom, setCustom] = useState(loadCustom)
  const native = useRef(null)
  const [pct, setPct] = useState(String(Math.round(alpha * 100)))
  useEffect(() => setPct(String(Math.round(colorAlpha(value) * 100))), [value])

  const pick = (h) => onChange(toCss(h, alpha))
  const setAlpha = (a) => onChange(toCss(hex, a))
  const addCustom = (h) => {
    const next = [h, ...custom.filter(c => c.toLowerCase() !== h.toLowerCase())].slice(0, 9)
    setCustom(next)
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    pick(h)
  }
  const Sw = ({ c }) => {
    const on = hex.toLowerCase() === c.toLowerCase()
    return <button type="button" onClick={() => pick(c)} title={c} className="aspect-square rounded-[3px]"
                   style={{ background: c, outline: on ? '2px solid #fff' : '1px solid rgba(255,255,255,0.1)', outlineOffset: on ? 1 : -1 }} />
  }
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }

  return (
    <div className="p-3" style={{ width: 252 }}>
      <div style={grid}>{PAL.grays.map(c => <Sw key={c} c={c} />)}</div>
      <div style={{ ...grid, marginTop: 6 }}>{PAL.hues.map(c => <Sw key={c} c={c} />)}</div>
      <div style={{ ...grid, marginTop: 10 }}>{PAL.rows.flat().map((c, i) => <Sw key={c + i} c={c} />)}</div>
      <div className="my-3 h-px" style={{ background: 'var(--border-subtle)' }} />
      <div style={grid}>
        {custom.map(c => <Sw key={c} c={c} />)}
        <button type="button" onClick={() => native.current?.click()} title="Add a custom colour" className="aspect-square rounded-[3px] flex items-center justify-center"
                style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}><Plus size={13} /></button>
      </div>
      <input ref={native} type="color" value={hex} onChange={(e) => addCustom(e.target.value)} className="sr-only" tabIndex={-1} />
      {opacity && (
        <div className="mt-3.5 flex items-center gap-2.5">
          <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Opacity</span>
          <div className="flex-1 h-[10px] rounded-full relative" style={{ background: `linear-gradient(90deg, transparent, ${hex}), ${CHECKER}` }}>
            <input type="range" min={0} max={100} value={Math.round(alpha * 100)} onChange={(e) => setAlpha(+e.target.value / 100)} className="bt-range absolute inset-0 w-full" style={{ background: 'transparent' }} />
          </div>
          <input value={pct} onChange={(e) => { const t = e.target.value.replace(/\D/g, '').slice(0, 3); setPct(t); const n = parseInt(t, 10); if (n >= 0 && n <= 100) setAlpha(n / 100) }}
                 className="w-[48px] h-[28px] rounded-md px-2 text-[12px] text-right outline-none tabular-nums" style={{ border: '1px solid var(--border-subtle)', background: FIELD_BG, color: 'var(--text-primary)' }} />
          <span className="text-[12px] -ml-1.5" style={{ color: 'var(--text-secondary)' }}>%</span>
        </div>
      )}
    </div>
  )
}

/** A colour button. `auto` is shown when the stored value is null (follows the theme). */
export function Swatch({ value, onChange, auto = '#808080', opacity = true, title }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const shown = value ?? auto
  return (
    <div ref={ref}>
      <button type="button" title={title} onClick={() => setOpen(o => !o)} className="w-[34px] h-[34px] rounded-lg flex items-center justify-center"
              style={{ border: `1px solid ${open ? ACCENT : 'var(--border-subtle)'}`, background: FIELD_BG }}>
        <span className="w-[22px] h-[22px] rounded-[6px]" style={{ background: `linear-gradient(${shown}, ${shown}), ${CHECKER}`, outline: '1px solid rgba(255,255,255,0.14)' }} />
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} align="right" style={{ width: 'auto' }}>
        <TvColorPicker value={shown} onChange={onChange} opacity={opacity} />
        {value != null && <button type="button" onClick={() => { onChange(null); setOpen(false) }} className="w-full py-2 text-[12px] hover:bg-white/5" style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border-subtle)' }}>Reset to theme default</button>}
      </Popover>
    </div>
  )
}