import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bold, ChevronDown, Copy, Ellipsis, Italic, Lock, Unlock, PaintBucket, Pencil, Trash2, Type, X } from 'lucide-react'
import Popover from './Popover'
import { Check2, LineStyleSelect, TvColorPicker, TvSelect, Field, Section } from './SettingsControls'
import { FIB_LEVELS, TF_CATEGORIES, TOOLS, defaultStyleFor, defaultVis, styleOf } from '../../lib/backtest/drawings'
import { CHECKER, colorAlpha, colorHex, toCss } from '../../lib/backtest/colors'

export const OPEN_SETTINGS_EVENT = 'bt-open-drawing-settings'
const accent = 'var(--accent-purple-light)'
const FIELD_BG = 'rgba(255,255,255,0.05)'

// which drawings take which controls ─────────────────────────────────────
const LINES = new Set(['trendline', 'ray', 'extended', 'arrow', 'info'])
const RULES = new Set(['hline', 'hray', 'vline', 'cross'])
const BOXES = new Set(['rect', 'ellipse', 'circle', 'triangle'])
const MEASURES = new Set(['priceRange', 'dateRange', 'measure'])
const POLY = new Set(['path', 'polyline'])
const POSITIONS = new Set(['long', 'short'])
const TEXT_TYPES = new Set([...LINES, 'hline', ...BOXES, 'arrowUp', 'arrowDown'])
const NO_SETTINGS = new Set(['alert'])
const WIDTHS = [1, 2, 3, 4].map(n => ({ id: n, label: `${n}px` }))
const DASH_PREVIEW = { solid: undefined, dashed: '7 4', dotted: '2 3' }

// ── floating toolbar pieces ──────────────────────────────────────────────
let lastBarPos = null              // the bar remembers where the user dragged it, across selections

function Tip({ text, children }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <div ref={ref} className="relative flex"
         onPointerEnter={() => { timer.current = window.setTimeout(() => { const r = ref.current?.getBoundingClientRect(); if (r) setPos({ x: r.left + r.width / 2, y: r.bottom + 9 }) }, 300) }}
         onPointerLeave={() => { window.clearTimeout(timer.current); setPos(null) }} onPointerDown={() => { window.clearTimeout(timer.current); setPos(null) }}>
      {children}
      {pos && createPortal(
        <div className="fixed z-[200] pointer-events-none px-2.5 py-1.5 rounded-md text-[12px] whitespace-nowrap"
             style={{ left: pos.x, top: pos.y, transform: 'translateX(-50%)', background: '#2A2E39', color: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.5)' }}>{text}</div>,
        document.body,
      )}
    </div>
  )
}

const FBtn = ({ tip, onClick, children, active, wide, buttonRef }) => (
  <Tip text={tip}>
    <button ref={buttonRef} type="button" onClick={onClick} aria-label={tip}
            className={`relative h-[30px] ${wide ? 'px-2.5' : 'min-w-[32px] px-1'} flex items-center justify-center gap-1.5 rounded-md transition-colors hover:bg-white/[0.09]`}
            style={{ color: active ? accent : 'var(--text-primary)', background: active ? 'rgba(139,92,246,0.18)' : undefined }}>
      {children}
    </button>
  </Tip>
)
const Sep = () => <span className="w-px h-5 mx-1" style={{ background: 'var(--border-subtle)' }} />

/** Icon button with the current colour as an underline bar; opens the colour palette. */
function ColorBtn({ tip, icon: Icon, value, onChange, opacity = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  return (
    <div ref={ref}>
      <FBtn tip={tip} active={open} onClick={() => setOpen(o => !o)}>
        <Icon size={20} strokeWidth={1.5} />
        <span className="absolute left-2 right-2 bottom-[2px] h-[3px] rounded-full" style={{ background: colorHex(value), boxShadow: '0 0 0 1px rgba(255,255,255,0.18)', opacity: colorAlpha(value) < 0.3 ? 0.5 : 1 }} />
      </FBtn>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} style={{ width: 'auto', borderRadius: 8 }}>
        <TvColorPicker value={value} onChange={onChange} opacity={opacity} />
      </Popover>
    </div>
  )
}

const Sample = ({ w = 1, dash, width = 40 }) => (
  <svg width={width} height="10" className="flex-shrink-0"><line x1="2" y1="5" x2={width - 2} y2="5" stroke="currentColor" strokeWidth={w} strokeDasharray={DASH_PREVIEW[dash]} strokeLinecap="round" /></svg>
)

function MenuBtn({ tip, label, children, wide }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  return (
    <div ref={ref}>
      <FBtn tip={tip} wide={wide} active={open} onClick={() => setOpen(o => !o)}>{label}</FBtn>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} style={{ minWidth: 150, borderRadius: 8 }}>
        <div className="py-1">{children(() => setOpen(false))}</div>
      </Popover>
    </div>
  )
}
const Item = ({ on, onClick, children }) => (
  <button type="button" onClick={onClick} className="w-full flex items-center gap-3 px-3.5 h-[34px] text-left text-[12.5px] hover:bg-white/[0.06]"
          style={{ color: on ? accent : 'var(--text-primary)', background: on ? 'rgba(139,92,246,0.14)' : undefined }}>{children}</button>
)

/** Contextual toolbar for the selected drawing (draggable — it remembers where you left it). */
export default function DrawingStyleBar({ drawing, onChange, onDelete, onDuplicate, onSettings }) {
  const [pos, setPos] = useState(lastBarPos)
  const bar = useRef(null)
  const sId = drawing?.id

  // double-clicking a drawing on the chart opens its settings
  useEffect(() => {
    const open = (e) => { if (e.detail?.id === sId) onSettings() }
    window.addEventListener(OPEN_SETTINGS_EVENT, open)
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, open)
  }, [sId, onSettings])

  if (!drawing) return null
  const t = drawing.type
  const s = styleOf(drawing)
  const set = (patch) => onChange({ ...drawing, style: { ...drawing.style, ...patch } })
  const setFill = (css) => set({ fill: colorHex(css), fillOpacity: colorAlpha(css), showFill: true })
  const fillCss = toCss(s.fill, s.fillOpacity)
  const isAlert = NO_SETTINGS.has(t)
  const hasLine = LINES.has(t) || RULES.has(t) || BOXES.has(t) || POLY.has(t) || t === 'channel' || t === 'fib' || t === 'brush' || t === 'highlighter'
  const hasFill = BOXES.has(t) || t === 'channel' || t === 'polyline' || t === 'path' || t === 'fib'
  const hasText = TEXT_TYPES.has(t)
  const hasDash = hasLine && t !== 'highlighter'

  const startDrag = (e) => {
    e.preventDefault()
    const host = bar.current.offsetParent.getBoundingClientRect(), b = bar.current.getBoundingClientRect()
    const dx = e.clientX - b.left, dy = e.clientY - b.top
    const mv = (ev) => {
      const next = { x: Math.min(Math.max(0, ev.clientX - host.left - dx), host.width - b.width), y: Math.min(Math.max(0, ev.clientY - host.top - dy), host.height - b.height) }
      lastBarPos = next; setPos(next)
    }
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }

  return (
    <div ref={bar} className="absolute z-30 flex items-center gap-0.5 h-[40px] pl-0.5 pr-1.5 rounded-lg select-none"
         style={{ ...(pos ? { left: pos.x, top: pos.y } : { left: '50%', top: 12, transform: 'translateX(-50%)' }), background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
         onPointerDown={(e) => e.stopPropagation()}>
      <span onPointerDown={startDrag} aria-label="Drag" className="w-[18px] h-[28px] flex items-center justify-center cursor-grab active:cursor-grabbing" style={{ color: 'var(--text-muted)' }}>
        <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2" cy="3" r="1.1" /><circle cx="2" cy="8" r="1.1" /><circle cx="2" cy="13" r="1.1" /><circle cx="7" cy="3" r="1.1" /><circle cx="7" cy="8" r="1.1" /><circle cx="7" cy="13" r="1.1" /></svg>
      </span>

      {!isAlert && <span className="px-2 text-[11.5px] font-semibold whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{TOOLS[t]?.label}</span>}
      {!isAlert && <Sep />}

      {/* position tools: text / target / stop */}
      {POSITIONS.has(t) && <>
        <ColorBtn tip="Text colour" icon={Type} value={s.textColor} onChange={(c) => set({ textColor: colorHex(c) })} />
        <ColorBtn tip="Target colour" icon={PaintBucket} value={toCss(s.fill, s.fillOpacity)} opacity onChange={(c) => set({ fill: colorHex(c), fillOpacity: colorAlpha(c) })} />
        <ColorBtn tip="Stop colour" icon={PaintBucket} value={toCss(s.stopFill || '#F23645', s.fillOpacity)} opacity onChange={(c) => set({ stopFill: colorHex(c), fillOpacity: colorAlpha(c) })} />
      </>}

      {/* text drawing */}
      {t === 'text' && <>
        <ColorBtn tip="Text colour" icon={Type} value={s.textColor} onChange={(c) => set({ textColor: c })} />
        <div className="w-[70px]"><TvSelect value={s.fontSize} width={70} options={[10, 12, 14, 16, 20, 24, 32, 40].map(n => ({ id: n, label: String(n) }))} onChange={(v) => set({ fontSize: Number(v) })} /></div>
        <FBtn tip="Bold" active={s.bold} onClick={() => set({ bold: !s.bold })}><Bold size={17} strokeWidth={2.2} /></FBtn>
        <FBtn tip="Italic" active={s.italic} onClick={() => set({ italic: !s.italic })}><Italic size={17} strokeWidth={1.8} /></FBtn>
      </>}

      {/* arrows / emoji */}
      {(t === 'arrowUp' || t === 'arrowDown') && <ColorBtn tip="Colour" icon={Pencil} value={s.color} onChange={(c) => set({ color: colorHex(c) })} />}
      {t === 'emoji' && ['S', 'M', 'L', 'XL'].map((l, i) => { const size = [8, 13, 20, 30][i]; return <FBtn key={l} tip={`${l} size`} active={s.fontSize === size} onClick={() => set({ fontSize: size })}><span className="text-[11.5px] font-semibold">{l}</span></FBtn> })}

      {/* lines & shapes */}
      {hasLine && <ColorBtn tip={BOXES.has(t) ? 'Border colour' : 'Line colour'} icon={Pencil} value={s.color} onChange={(c) => set({ color: c })} />}
      {hasFill && <ColorBtn tip="Background colour" icon={PaintBucket} value={fillCss} opacity onChange={setFill} />}
      {hasText && t !== 'text' && !POSITIONS.has(t) && <ColorBtn tip="Text colour" icon={Type} value={s.textColor} onChange={(c) => set({ textColor: c })} />}
      {hasLine && (
        <MenuBtn tip="Line width" wide label={<><Sample w={Math.min(s.width, 4)} width={34} /><b className="text-[12px] font-semibold w-[26px] text-left">{s.width}px</b></>}>
          {(close) => WIDTHS.map(o => <Item key={o.id} on={s.width === o.id} onClick={() => { set({ width: o.id }); close() }}><Sample w={o.id} /> <span>{o.label}</span></Item>)}
        </MenuBtn>
      )}
      {hasDash && (
        <MenuBtn tip="Line style" label={<Sample w={1.8} dash={s.dash} width={38} />}>
          {(close) => [['solid', 'Line'], ['dashed', 'Dashed line'], ['dotted', 'Dotted line']].map(([k, l]) => <Item key={k} on={s.dash === k} onClick={() => { set({ dash: k }); close() }}><Sample w={1.8} dash={k} /> <span>{l}</span></Item>)}
        </MenuBtn>
      )}

      {!isAlert && <Sep />}
      {!isAlert && <FBtn tip="Settings" onClick={onSettings}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M12 3 19.8 7.5v9L12 21l-7.8-4.5v-9z" /><circle cx="12" cy="12" r="3" /></svg></FBtn>}
      {!isAlert && <FBtn tip={drawing.locked ? 'Unlock' : 'Lock'} active={drawing.locked} onClick={() => onChange({ ...drawing, locked: !drawing.locked })}>{drawing.locked ? <Lock size={19} strokeWidth={1.5} /> : <Unlock size={19} strokeWidth={1.5} />}</FBtn>}
      <FBtn tip="Remove (Del)" onClick={onDelete}><Trash2 size={19} strokeWidth={1.5} style={{ color: 'var(--negative-red)' }} /></FBtn>
      {!isAlert && (
        <MenuBtn tip="More" label={<Ellipsis size={19} strokeWidth={1.5} />}>
          {(close) => <>
            <Item onClick={() => { onDuplicate(); close() }}><Copy size={14} /> <span>Clone</span></Item>
            <Item onClick={() => { onSettings(); close() }}><Pencil size={14} /> <span>Settings…</span></Item>
          </>}
        </MenuBtn>
      )}
    </div>
  )
}

// ── Settings dialog ────────────────────────────────────────────────────

// two-thumb range (min ↔ max visibility) — injected once, like the other chart sliders
if (typeof document !== 'undefined' && !document.getElementById('bt-dual-styles')) {
  const st = document.createElement('style')
  st.id = 'bt-dual-styles'
  st.textContent = `
    .bt-dual{position:relative;height:20px}
    .bt-dual input{position:absolute;inset:0;width:100%;margin:0;background:transparent;pointer-events:none;-webkit-appearance:none;appearance:none;outline:none}
    .bt-dual input::-webkit-slider-runnable-track{background:transparent;height:20px}
    .bt-dual input::-webkit-slider-thumb{pointer-events:all;-webkit-appearance:none;width:15px;height:15px;margin-top:2.5px;border-radius:50%;background:#fff;border:2px solid #131217;cursor:pointer}
    .bt-dual input::-moz-range-thumb{pointer-events:all;width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid #131217;cursor:pointer}`
  document.head.appendChild(st)
}
function DualRange({ min, max, lo, hi, onChange, disabled }) {
  const pct = (v) => ((v - min) / Math.max(1, max - min)) * 100
  return (
    <div className="bt-dual" style={{ opacity: disabled ? 0.4 : 1 }}>
      <i className="absolute left-0 right-0 top-[8px] h-[4px] rounded-full" style={{ background: 'rgba(255,255,255,0.16)' }} />
      <i className="absolute top-[8px] h-[4px] rounded-full" style={{ background: '#fff', left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }} />
      <input type="range" min={min} max={max} value={lo} disabled={disabled} onChange={(e) => onChange(Math.min(+e.target.value, hi), hi)} />
      <input type="range" min={min} max={max} value={hi} disabled={disabled} onChange={(e) => onChange(lo, Math.max(+e.target.value, lo))} />
    </div>
  )
}


/** Colour button for the dialog: same look as the chart-settings swatch, without the "reset to theme" entry (drawings have no theme colour). */
function Swatch({ value, onChange, opacity = true, title }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  return (
    <div ref={ref}>
      <button type="button" title={title} aria-label={title} onClick={() => setOpen(o => !o)} className="w-[34px] h-[34px] rounded-lg flex items-center justify-center"
              style={{ border: `1px solid ${open ? 'var(--accent-purple)' : 'var(--border-subtle)'}`, background: FIELD_BG }}>
        <span className="w-[22px] h-[22px] rounded-[6px]" style={{ background: `linear-gradient(${value}, ${value}), ${CHECKER}`, outline: '1px solid rgba(255,255,255,0.14)' }} />
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} align="right" style={{ width: 'auto' }}>
        <TvColorPicker value={value} onChange={onChange} opacity={opacity} />
      </Popover>
    </div>
  )
}

const fieldStyle = { border: '1px solid var(--border-subtle)', background: FIELD_BG, color: 'var(--text-primary)' }
const inputCls = 'h-[34px] px-3 rounded-lg text-[12.5px] outline-none tabular-nums focus:border-[var(--accent-purple)]'

/** Decimal-friendly number box (the shared NumBox is whole numbers only). */
function Num({ value, onChange, width = 120, step = 'any', min, max }) {
  const [text, setText] = useState(String(value ?? ''))
  const focus = useRef(false)
  useEffect(() => { if (!focus.current) setText(value == null || value === '' ? '' : String(value)) }, [value])
  return (
    <input value={text} inputMode="decimal" step={step} min={min} max={max} className={`${inputCls} text-right`} style={{ width, ...fieldStyle }}
           onFocus={() => { focus.current = true }} onBlur={() => { focus.current = false; setText(value == null ? '' : String(value)) }}
           onChange={(e) => { const t = e.target.value; setText(t); const n = parseFloat(t); if (Number.isFinite(n) && (min == null || n >= min) && (max == null || n <= max)) onChange(n) }} />
  )
}

const toLocalInput = (secs) => {
  const d = new Date(secs * 1000), p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fromLocalInput = (v) => Math.floor(new Date(v).getTime() / 1000)

const TPL_KEY = 'trado_bt_drawing_templates'
const loadTpl = () => { try { return JSON.parse(localStorage.getItem(TPL_KEY)) || {} } catch { return {} } }
const saveTpl = (all) => { try { localStorage.setItem(TPL_KEY, JSON.stringify(all)) } catch { /* storage unavailable */ } }

function tabsFor(t) {
  if (POSITIONS.has(t)) return ['Inputs', 'Style', 'Visibility']
  if (t === 'text') return ['Text', 'Coordinates', 'Visibility']
  if (t === 'brush' || t === 'highlighter' || t === 'emoji') return ['Style', 'Visibility']
  if (RULES.has(t)) return t === 'hline' ? ['Style', 'Text', 'Coordinates', 'Visibility'] : ['Style', 'Coordinates', 'Visibility']
  if (TEXT_TYPES.has(t)) return ['Style', 'Text', 'Coordinates', 'Visibility']
  return ['Style', 'Coordinates', 'Visibility']
}

export function DrawingSettingsDialog({ drawing, digits, onApply, onClose }) {
  const [d, setD] = useState(() => JSON.parse(JSON.stringify({ ...drawing, style: styleOf(drawing) })))
  const t = d.type
  const tabs = tabsFor(t)
  const [tab, setTab] = useState(tabs[0])
  const [tplOpen, setTplOpen] = useState(false)
  const tplRef = useRef(null)
  const s = d.style
  const set = (patch) => setD(x => ({ ...x, style: { ...x.style, ...patch } }))
  const setPts = (fn) => setD(x => ({ ...x, points: fn(x.points) }))
  const tick = Math.pow(10, -(digits ?? 2))
  const vis = d.vis || defaultVis()

  // modeless + draggable, like the chart settings dialog
  const boxRef = useRef(null), drag = useRef(null)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const onDown = (e) => { if (e.target.closest('button')) return; drag.current = { sx: e.clientX, sy: e.clientY, ox: off.x, oy: off.y, r: boxRef.current.getBoundingClientRect() }; e.currentTarget.setPointerCapture(e.pointerId) }
  const onMove = (e) => {
    const g = drag.current; if (!g) return
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
    const dx = clamp(g.r.left + e.clientX - g.sx, 120 - g.r.width, window.innerWidth - 120) - g.r.left
    const dy = clamp(g.r.top + e.clientY - g.sy, 0, window.innerHeight - 56) - g.r.top
    setOff({ x: g.ox + dx, y: g.oy + dy })
  }
  const closeRef = useRef(onClose); closeRef.current = onClose
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('[data-bt-popover]')) closeRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const row = (label, node) => <Field label={label}>{node}</Field>
  const lineRow = (label = 'Line', arrows) => (
    row(label, <>
      <Swatch value={s.color} onChange={(c) => set({ color: c ?? s.color })} opacity title="Colour" />
      <TvSelect value={s.width} options={WIDTHS} width={84} onChange={(v) => set({ width: Number(v) })} />
      <LineStyleSelect value={s.dash} width={96} onChange={(v) => set({ dash: v })} />
      {arrows && <>
        <button type="button" title="Arrow at the start" onClick={() => set({ arrowStart: !s.arrowStart })} className="h-[34px] w-[34px] rounded-lg text-[15px]" style={{ ...fieldStyle, color: s.arrowStart ? '#fff' : 'var(--text-secondary)', background: s.arrowStart ? 'var(--accent-purple)' : FIELD_BG }}>←</button>
        <button type="button" title="Arrow at the end" onClick={() => set({ arrowEnd: !s.arrowEnd })} className="h-[34px] w-[34px] rounded-lg text-[15px]" style={{ ...fieldStyle, color: s.arrowEnd ? '#fff' : 'var(--text-secondary)', background: s.arrowEnd ? 'var(--accent-purple)' : FIELD_BG }}>→</button>
      </>}
    </>)
  )
  const bgRow = (label = 'Background') => (
    <div className="flex items-center justify-between min-h-[36px]">
      <Check2 checked={s.showFill !== false} onChange={(v) => set({ showFill: v })} label={label} />
      <Swatch value={toCss(s.fill, s.fillOpacity)} opacity onChange={(c) => c && set({ fill: colorHex(c), fillOpacity: colorAlpha(c), showFill: true })} title="Background colour" />
    </div>
  )
  const opts = (arr) => arr.map(([id, label]) => ({ id, label }))
  const EXTEND = opts([['none', "Don't extend"], ['left', 'Left'], ['right', 'Right'], ['both', 'Both']])

  const styleTab = () => {
    if (LINES.has(t)) return (<>
      <Section>
        {lineRow('Line', true)}
        {row('Extend', <TvSelect value={s.extend ?? (t === 'ray' ? 'right' : t === 'extended' ? 'both' : 'none')} options={EXTEND} width={170} onChange={(v) => set({ extend: v })} />)}
        <Check2 checked={!!s.middlePoint} onChange={(v) => set({ middlePoint: v })} label="Middle point" />
        <Check2 checked={!!s.priceLabels} onChange={(v) => set({ priceLabels: v })} label="Price labels" />
      </Section>
      <Section title="Info">
        {row('Stats', <TvSelect value={s.stats || 'hidden'} options={opts([['hidden', 'Hidden'], ['compact', 'Compact'], ['values', 'Values']])} width={170} onChange={(v) => set({ stats: v })} />)}
        {row('Stats position', <TvSelect value={s.statsPos || 'right'} options={opts([['left', 'Left'], ['center', 'Center'], ['right', 'Right']])} width={170} onChange={(v) => set({ statsPos: v })} />)}
        <Check2 checked={!!s.alwaysStats} onChange={(v) => set({ alwaysStats: v })} label="Always show stats" />
      </Section>
    </>)
    if (RULES.has(t)) return (<Section>{lineRow('Line')}{(t === 'hline' || t === 'hray') && <Check2 checked={s.priceLabel !== false} onChange={(v) => set({ priceLabel: v })} label="Price label" />}</Section>)
    if (t === 'channel') return (<Section>{lineRow('Lines')}{row('Extend', <TvSelect value={s.extend || 'none'} options={EXTEND} width={170} onChange={(v) => set({ extend: v })} />)}
      <Check2 checked={s.middleLine !== false} onChange={(v) => set({ middleLine: v })} label="Middle line" />{bgRow()}</Section>)
    if (t === 'fib') {
      const levels = s.levels || FIB_LEVELS.map(l => ({ ...l }))
      const setLv = (i, patch) => set({ levels: levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
      return (<>
        <Section>{lineRow('Trend line')}</Section>
        <Section title="Levels">
          {levels.map((l, i) => (
            <div key={l.r} className="flex items-center justify-between min-h-[34px]">
              <Check2 checked={l.on !== false} onChange={(v) => setLv(i, { on: v })} label={String(l.r)} />
              <Swatch value={l.color} opacity={false} onChange={(c) => c && setLv(i, { color: c })} title="Level colour" />
            </div>
          ))}
          <Check2 checked={s.showPrices !== false} onChange={(v) => set({ showPrices: v })} label="Show prices" />
          <div className="flex items-center justify-between min-h-[36px]">
            <Check2 checked={s.showFill !== false} onChange={(v) => set({ showFill: v })} label="Background" />
            <TvSelect value={String(Math.round(s.fillOpacity * 100))} width={90} options={[5, 10, 15, 20, 30, 40].map(n => ({ id: String(n), label: `${n}%` }))} onChange={(v) => set({ fillOpacity: Number(v) / 100 })} />
          </div>
        </Section>
      </>)
    }
    if (BOXES.has(t)) return (<Section>{lineRow(t === 'ellipse' || t === 'circle' ? 'Border' : 'Border')}{bgRow()}</Section>)
    if (POLY.has(t)) return (<Section>{lineRow('Line', true)}{t === 'polyline' && bgRow()}</Section>)
    if (t === 'brush') return (<Section>{lineRow('Line')}{bgRow('Background')}</Section>)
    if (t === 'highlighter') return (<Section>
      {row('Colour', <Swatch value={s.color} opacity={false} onChange={(c) => c && set({ color: c })} title="Colour" />)}
      {row('Width', <TvSelect value={s.width} width={110} options={[10, 15, 20, 30, 40].map(n => ({ id: n, label: `${n}px` }))} onChange={(v) => set({ width: Number(v) })} />)}
      {row('Opacity', <TvSelect value={String(Math.round((s.opacity ?? 0.4) * 100))} width={110} options={[20, 30, 40, 50, 60, 80].map(n => ({ id: String(n), label: `${n}%` }))} onChange={(v) => set({ opacity: Number(v) / 100 })} />)}
    </Section>)
    if (MEASURES.has(t)) return (<Section>{row('Background', <TvSelect value={String(Math.round(s.fillOpacity * 100))} width={110} options={[10, 15, 20, 30, 40].map(n => ({ id: String(n), label: `${n}%` }))} onChange={(v) => set({ fillOpacity: Number(v) / 100 })} />)}
      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Measurers turn blue when price rises and red when it falls.</p></Section>)
    if (t === 'arrowUp' || t === 'arrowDown') return <Section>{row('Colour', <Swatch value={s.color} opacity={false} onChange={(c) => c && set({ color: c })} title="Colour" />)}</Section>
    if (t === 'emoji') return <Section>{row('Size', <TvSelect value={s.fontSize} width={110} options={[['S', 8], ['M', 13], ['L', 20], ['XL', 30]].map(([l, n]) => ({ id: n, label: l }))} onChange={(v) => set({ fontSize: Number(v) })} />)}</Section>
    if (POSITIONS.has(t)) return (<>
      <Section>
        {row('Lines', <Swatch value={s.color} opacity={false} onChange={(c) => c && set({ color: c })} title="Entry line colour" />)}
        {row('Stop colour', <Swatch value={toCss(s.stopFill || '#F23645', s.fillOpacity)} opacity onChange={(c) => c && set({ stopFill: colorHex(c), fillOpacity: colorAlpha(c) })} title="Stop colour" />)}
        {row('Target colour', <Swatch value={toCss(s.fill, s.fillOpacity)} opacity onChange={(c) => c && set({ fill: colorHex(c), fillOpacity: colorAlpha(c) })} title="Target colour" />)}
        {row('Text', <><Swatch value={s.textColor} opacity={false} onChange={(c) => c && set({ textColor: c })} title="Text colour" />
          <TvSelect value={s.fontSize} width={84} options={[10, 11, 12, 14, 16].map(n => ({ id: n, label: String(n) }))} onChange={(v) => set({ fontSize: Number(v) })} /></>)}
        <Check2 checked={s.priceLabels !== false} onChange={(v) => set({ priceLabels: v })} label="Price labels" />
      </Section>
      <Section title="Info">
        <Check2 checked={s.showLabels !== false} onChange={(v) => set({ showLabels: v })} label="Always show stats" />
        <Check2 checked={!!s.compact} onChange={(v) => set({ compact: v })} label="Compact stats mode" />
      </Section>
    </>)
    return null
  }

  const textTab = () => (<>
    <div className="flex items-center gap-2">
      <Swatch value={s.textColor} opacity={false} onChange={(c) => c && set({ textColor: c })} title="Text colour" />
      <TvSelect value={s.fontSize} width={92} options={[10, 11, 12, 14, 16, 20, 24, 32].map(n => ({ id: n, label: String(n) }))} onChange={(v) => set({ fontSize: Number(v) })} />
      <button type="button" aria-label="Bold" onClick={() => set({ bold: !s.bold })} className="h-[34px] w-[34px] rounded-lg flex items-center justify-center" style={{ ...fieldStyle, background: s.bold ? 'var(--accent-purple)' : FIELD_BG, color: s.bold ? '#fff' : 'var(--text-secondary)' }}><Bold size={16} /></button>
      <button type="button" aria-label="Italic" onClick={() => set({ italic: !s.italic })} className="h-[34px] w-[34px] rounded-lg flex items-center justify-center" style={{ ...fieldStyle, background: s.italic ? 'var(--accent-purple)' : FIELD_BG, color: s.italic ? '#fff' : 'var(--text-secondary)' }}><Italic size={16} /></button>
    </div>
    <textarea autoFocus value={d.text || ''} onChange={(e) => setD(x => ({ ...x, text: e.target.value }))} placeholder="Add text" rows={4}
              className="w-full mt-3 rounded-lg px-3 py-2.5 text-[13px] outline-none resize-none focus:border-[var(--accent-purple)]" style={fieldStyle} />
    {t !== 'text' && (
      <div className="mt-3"><Field label="Text alignment">
        <TvSelect value={s.vAlign || 'middle'} width={96} options={opts([['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']])} onChange={(v) => set({ vAlign: v })} />
        <TvSelect value={s.hAlign || 'center'} width={96} options={opts([['left', 'Left'], ['center', 'Center'], ['right', 'Right']])} onChange={(v) => set({ hAlign: v })} />
      </Field></div>
    )}
    {t === 'text' && (<div className="mt-3 space-y-1">
      <div className="flex items-center justify-between min-h-[36px]"><Check2 checked={!!s.showBg} onChange={(v) => set({ showBg: v })} label="Background" /><Swatch value={s.bg} opacity={false} onChange={(c) => c && set({ bg: c, showBg: true })} title="Background" /></div>
      <div className="flex items-center justify-between min-h-[36px]"><Check2 checked={!!s.showBorder} onChange={(v) => set({ showBorder: v })} label="Border" /><Swatch value={s.color} opacity={false} onChange={(c) => c && set({ color: c, showBorder: true })} title="Border" /></div>
    </div>)}
  </>)

  const coordTab = () => (
    <div className="space-y-4">
      {d.points.slice(0, 12).map((p, i) => (
        <div key={i}>
          <p className="mb-2 text-[11px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>{d.points.length > 1 ? `Point ${i + 1}` : 'Point'}</p>
          <div className="space-y-2">
            <Field label="Price"><Num width={150} value={Number(p.price.toFixed(digits))} onChange={(v) => setPts(a => a.map((q, j) => (j === i ? { ...q, price: v } : q)))} /></Field>
            <Field label="Date & time">
              <input type="datetime-local" className={inputCls} style={{ width: 210, ...fieldStyle, colorScheme: 'dark' }} value={toLocalInput(p.time)}
                     onChange={(e) => { const v = fromLocalInput(e.target.value); if (Number.isFinite(v)) setPts(a => a.map((q, j) => (j === i ? { ...q, time: v } : q))) }} />
            </Field>
          </div>
        </div>
      ))}
    </div>
  )

  const inputsTab = () => {
    const [e, tg, st] = d.points.map(p => p.price)
    const long = t === 'long'
    const setPrice = (idx, price) => setPts(a => a.map((q, j) => (j === idx ? { ...q, price } : q)))
    const shiftAll = (v) => setPts(a => a.map(q => ({ ...q, price: q.price + (v - e) })))
    const ticks = (a, b) => Math.round(Math.abs(a - b) / tick)
    return (
      <div>
        <Section>
          <Field label="Account size"><Num width={130} value={s.accountSize} min={1} onChange={(v) => set({ accountSize: v })} /></Field>
          <Field label="Risk"><Num width={90} value={s.riskPct} min={0} max={100} onChange={(v) => set({ riskPct: v })} /><span className="text-[12.5px] w-4" style={{ color: 'var(--text-secondary)' }}>%</span></Field>
          <Field label="Entry price"><Num width={130} value={Number(e.toFixed(digits))} onChange={shiftAll} /></Field>
        </Section>
        <Section title="Profit level">
          <Field label="Ticks"><Num width={130} value={ticks(tg, e)} min={1} onChange={(v) => setPrice(1, e + (long ? 1 : -1) * v * tick)} /></Field>
          <Field label="Price"><Num width={130} value={Number(tg.toFixed(digits))} onChange={(v) => setPrice(1, v)} /></Field>
        </Section>
        <Section title="Stop level">
          <Field label="Ticks"><Num width={130} value={ticks(e, st)} min={1} onChange={(v) => setPrice(2, e + (long ? -1 : 1) * v * tick)} /></Field>
          <Field label="Price"><Num width={130} value={Number(st.toFixed(digits))} onChange={(v) => setPrice(2, v)} /></Field>
        </Section>
      </div>
    )
  }

  const setVis = (id, r) => setD(x => ({ ...x, vis: { ...(x.vis || defaultVis()), [id]: r }, tfs: undefined }))
  const visTab = () => (
    <div className="space-y-3.5">
      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Show this drawing only on the timeframes you tick.</p>
      {TF_CATEGORIES.map(c => {
        const r = vis[c.id] || [1, c.max, true]
        return (
          <div key={c.id} className="grid items-center gap-3" style={{ gridTemplateColumns: '118px 56px 1fr 56px' }}>
            <Check2 checked={r[2] !== false} onChange={(v) => setVis(c.id, [r[0], r[1], v])} label={c.label} />
            <input value={r[0]} inputMode="numeric" className={`${inputCls} text-center px-1`} style={fieldStyle} onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); if (n >= 1 && n <= r[1]) setVis(c.id, [n, r[1], r[2]]) }} />
            <DualRange min={1} max={c.max} lo={r[0]} hi={r[1]} disabled={r[2] === false} onChange={(lo, hi) => setVis(c.id, [lo, hi, r[2]])} />
            <input value={r[1]} inputMode="numeric" className={`${inputCls} text-center px-1`} style={fieldStyle} onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); if (n >= r[0] && n <= c.max) setVis(c.id, [r[0], n, r[2]]) }} />
          </div>
        )
      })}
    </div>
  )

  const saveDefault = () => { const all = loadTpl(); all[t] = s; saveTpl(all); setTplOpen(false) }
  const applyDefault = () => { const saved = loadTpl()[t]; setD(x => ({ ...x, style: { ...defaultStyleFor(t), ...(saved || {}) } })); setTplOpen(false) }
  const factory = () => { setD(x => ({ ...x, style: defaultStyleFor(t) })); setTplOpen(false) }

  const body = tab === 'Style' ? styleTab() : tab === 'Text' ? textTab() : tab === 'Coordinates' ? coordTab() : tab === 'Inputs' ? inputsTab() : visTab()

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
      <div ref={boxRef} role="dialog" aria-label={`${TOOLS[t]?.label} settings`} className="pointer-events-auto w-full flex flex-col rounded-xl overflow-hidden"
           style={{ maxWidth: 420, maxHeight: 'min(640px, 92vh)', transform: `translate(${off.x}px, ${off.y}px)`, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
        <div className="flex items-center justify-between px-5 h-[58px] flex-shrink-0 cursor-move select-none touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
          <h2 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>{TOOLS[t]?.label}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 -mr-1.5 rounded-md hover:bg-white/10 cursor-pointer" style={{ color: 'var(--text-secondary)' }}><X size={18} /></button>
        </div>
        <div className="px-5 flex-shrink-0">
          <div className="flex gap-5">
            {tabs.map(x => (
              <button key={x} type="button" onClick={() => setTab(x)} className="pb-2.5 text-[13px] font-semibold" style={{ color: tab === x ? 'var(--text-primary)' : 'var(--text-muted)' }}>{x}</button>
            ))}
          </div>
          <div className="relative h-[3px] rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <i className="absolute top-0 bottom-0 rounded-full transition-all" style={{ background: '#fff', width: `${100 / tabs.length}%`, left: `${(tabs.indexOf(tab) / tabs.length) * 100}%` }} />
          </div>
        </div>
        <div className="flex-1 min-h-[220px] overflow-y-auto px-5 pt-5 pb-3">{body}</div>
        <div className="flex items-center justify-between px-5 h-[64px] flex-shrink-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div ref={tplRef}>
            <button type="button" onClick={() => setTplOpen(o => !o)} className="h-[34px] px-3.5 rounded-lg flex items-center gap-2 text-[13px] font-semibold hover:bg-white/5" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
              Template <ChevronDown size={14} style={{ color: 'var(--text-secondary)' }} />
            </button>
            <Popover anchorRef={tplRef} open={tplOpen} onClose={() => setTplOpen(false)} placement="top" style={{ width: 230, borderRadius: 8 }}>
              <div className="py-1.5">
                <button type="button" onClick={saveDefault} className="w-full px-3.5 py-2 text-left text-[13px] hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>Save as default</button>
                <button type="button" onClick={applyDefault} className="w-full px-3.5 py-2 text-left text-[13px] hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>Apply default</button>
                <button type="button" onClick={factory} className="w-full px-3.5 py-2 text-left text-[13px] hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>Reset to factory style</button>
              </div>
            </Popover>
          </div>
          <div className="flex gap-2.5">
            <button type="button" onClick={onClose} className="h-[34px] px-5 rounded-lg text-[13px] font-semibold hover:bg-white/5" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>Cancel</button>
            <button type="button" onClick={() => onApply(d)} className="btn-primary h-[34px] px-6 rounded-lg text-[13px] font-bold text-white">Ok</button>
          </div>
        </div>
      </div>
    </div>
  )
}