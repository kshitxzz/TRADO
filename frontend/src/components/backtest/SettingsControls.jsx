import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import Popover from './Popover'
import { buildPalette, parseColor, toCss, colorHex, colorAlpha, CHECKER } from '../../lib/backtest/colors'

// Slider look (white thumb on a thin track). Injected once so no global stylesheet needs to change.
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

// ── layout helpers ───────────────────────────────────────────────────────
export const Section = ({ title, children }) => (
  <div className="mb-5">
    {title && <p className="mb-3 text-[11px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>{title}</p>}
    <div className="space-y-3.5">{children}</div>
  </div>
)

/** A labelled row: label on the left, controls starting at a fixed column. */
export const Field = ({ label, children, labelWidth = 180 }) => (
  <div className="flex items-start gap-3 min-h-[34px]">
    <span className="pt-[7px] text-[13px] flex-shrink-0" style={{ color: 'var(--text-primary)', width: labelWidth }}>{label}</span>
    <div className="flex flex-wrap items-center gap-2 min-w-0">{children}</div>
  </div>
)

export const Hint = ({ children }) => <p className="text-[12px] leading-snug" style={{ color: 'var(--text-muted)' }}>{children}</p>

// ── checkbox ─────────────────────────────────────────────────────────────
export function Check2({ checked, onChange, label, children, disabled, indent = 0, hint }) {
  return (
    <div style={{ paddingLeft: indent * 28 }}>
      <div className={`inline-flex items-center gap-2.5 text-[13px] ${disabled ? 'opacity-40' : 'cursor-pointer'}`} style={{ color: 'var(--text-primary)' }}>
        <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} onClick={() => !disabled && onChange(!checked)}
                className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center flex-shrink-0 transition-colors"
                style={{ background: checked ? '#E5E7EB' : 'transparent', border: `1.5px solid ${checked ? '#E5E7EB' : 'var(--text-muted)'}` }}>
          {checked && <Check size={13} strokeWidth={3} style={{ color: '#111' }} />}
        </button>
        <span onClick={() => !disabled && onChange(!checked)}>{label}</span>
        {children}
      </div>
      {hint && <p className="mt-1 ml-[28px] text-[12px] leading-snug" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  )
}

// ── select ───────────────────────────────────────────────────────────────
export function TvSelect({ value, options, onChange, width = 224, disabled, maxHeight = 300 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const sel = options.find(o => String(o.id) === String(value))
  return (
    <div ref={ref}>
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)} style={{ width, border: '1px solid var(--border-subtle)', background: 'transparent' }}
              className="h-[36px] px-3 rounded-lg flex items-center justify-between gap-2 text-[13px] text-left disabled:opacity-40 hover:bg-white/5">
        <span className="truncate" style={{ color: 'var(--text-primary)' }}>{sel?.label ?? String(value)}</span>
        <ChevronDown size={15} style={{ color: 'var(--text-secondary)', transform: open ? 'rotate(180deg)' : undefined }} className="flex-shrink-0" />
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} style={{ width: Math.max(width, 190), maxHeight }}>
        <div className="py-1">
          {options.map(o => {
            const on = String(o.id) === String(value)
            return (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false) }} ref={on ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                      className="w-full px-3 py-[7px] text-left text-[13px] hover:bg-white/5"
                      style={{ color: on ? '#111' : 'var(--text-primary)', background: on ? '#E5E7EB' : undefined, borderRadius: on ? 6 : 0, margin: on ? '0 4px' : 0, width: on ? 'calc(100% - 8px)' : '100%' }}>
                {o.label}
              </button>
            )
          })}
        </div>
      </Popover>
    </div>
  )
}

// ── number box ───────────────────────────────────────────────────────────
export function NumBox({ value, onChange, min = 0, max = 999, unit, width = 96, decimals = 0, disabled }) {
  const [text, setText] = useState(String(value ?? ''))
  const focus = useRef(false)
  useEffect(() => { if (!focus.current) setText(value == null ? '' : String(value)) }, [value])
  const commit = (raw) => {
    const t = raw.replace(/[^0-9.]/g, '')
    setText(t)
    const n = parseFloat(t)
    if (Number.isFinite(n) && n >= min && n <= max) onChange(decimals ? Number(n.toFixed(decimals)) : Math.round(n))
  }
  return (
    <div className="flex items-center gap-2">
      <input value={text} disabled={disabled} inputMode="decimal" onFocus={() => { focus.current = true }}
             onBlur={() => { focus.current = false; setText(value == null ? '' : String(value)) }} onChange={(e) => commit(e.target.value)}
             className="h-[36px] px-3 rounded-lg text-[13px] outline-none tabular-nums disabled:opacity-40" style={{ width, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-primary)' }} />
      {unit && <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>{unit}</span>}
    </div>
  )
}

// ── slider ───────────────────────────────────────────────────────────────
export function TvSlider({ value, min = 0, max = 1, step = 0.01, onChange, width = 150, gradient }) {
  return (
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)}
           className="bt-range" style={{ width, background: gradient }} />
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
        <div className="mt-3.5">
          <p className="mb-1.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Opacity</p>
          <div className="flex items-center gap-2.5">
            <div className="flex-1 h-[10px] rounded-full relative" style={{ background: `linear-gradient(90deg, transparent, ${hex}), ${CHECKER}` }}>
              <input type="range" min={0} max={100} value={Math.round(alpha * 100)} onChange={(e) => setAlpha(+e.target.value / 100)} className="bt-range absolute inset-0 w-full" style={{ background: 'transparent' }} />
            </div>
            <input value={pct} onChange={(e) => { const t = e.target.value.replace(/\D/g, '').slice(0, 3); setPct(t); const n = parseInt(t, 10); if (n >= 0 && n <= 100) setAlpha(n / 100) }}
                   className="w-[54px] h-[30px] rounded-md px-2 text-[12px] text-right outline-none tabular-nums" style={{ border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-primary)' }} />
            <span className="text-[12px] -ml-1.5" style={{ color: 'var(--text-secondary)' }}>%</span>
          </div>
        </div>
      )}
    </div>
  )
}

/** A colour button. `auto` is shown when the stored value is null (follows the theme). */
export function Swatch({ value, onChange, auto = '#808080', opacity = true, title, size = 36, style: lineStyle, onStyle }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const shown = value ?? auto
  const lineLabel = lineStyle
  return (
    <div ref={ref}>
      <button type="button" title={title} onClick={() => setOpen(o => !o)} className="h-[36px] rounded-lg flex items-center gap-2 px-[6px]"
              style={{ border: `1px solid ${open ? 'var(--accent-purple)' : 'var(--border-subtle)'}`, background: 'transparent', minWidth: size }}>
        <span className="w-6 h-6 rounded-[5px] flex-shrink-0" style={{ background: `linear-gradient(${shown}, ${shown}), ${CHECKER}`, outline: '1px solid rgba(255,255,255,0.12)' }} />
        {lineLabel && <span className="w-9 flex-shrink-0 flex items-center"><svg width="36" height="8"><line x1="0" y1="4" x2="36" y2="4" stroke="var(--text-secondary)" strokeWidth="1.6" strokeDasharray={lineLabel === 'dashed' ? '7 4' : lineLabel === 'dotted' ? '2 3' : undefined} /></svg></span>}
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} style={{ width: 'auto' }}>
        <TvColorPicker value={shown} onChange={onChange} opacity={opacity} />
        {onStyle && (
          <div className="px-3 pb-3 flex gap-1.5">
            {['solid', 'dashed', 'dotted'].map(k => (
              <button key={k} type="button" onClick={() => onStyle(k)} className="flex-1 h-8 rounded-md flex items-center justify-center"
                      style={{ border: `1px solid ${lineStyle === k ? 'var(--accent-purple)' : 'var(--border-subtle)'}`, background: lineStyle === k ? 'rgba(139,92,246,0.14)' : 'transparent' }}>
                <svg width="38" height="8"><line x1="0" y1="4" x2="38" y2="4" stroke="var(--text-secondary)" strokeWidth="1.6" strokeDasharray={k === 'dashed' ? '7 4' : k === 'dotted' ? '2 3' : undefined} /></svg>
              </button>
            ))}
          </div>
        )}
        {value != null && <button type="button" onClick={() => { onChange(null); setOpen(false) }} className="w-full py-2 text-[12px] hover:bg-white/5" style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border-subtle)' }}>Reset to theme default</button>}
      </Popover>
    </div>
  )
}