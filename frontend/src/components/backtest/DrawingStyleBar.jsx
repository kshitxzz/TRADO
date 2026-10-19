import { useEffect, useRef, useState } from 'react'
import { Lock, Unlock, Trash2, Copy, Settings2, X } from 'lucide-react'
import { PALETTE, TF_CATEGORIES, TOOLS } from '../../lib/backtest/drawings'

const FILL_TYPES = new Set(['rect', 'ellipse', 'triangle', 'channel', 'long', 'short', 'fib', 'measure', 'priceRange', 'dateRange'])
const TEXT_TYPES = new Set(['rect', 'text'])
const LINE_WIDTHS = [1, 2, 3, 4]
const DASH_KEYS = ['solid', 'dashed', 'dotted']
const DASH_PREVIEW = { solid: undefined, dashed: '7 4', dotted: '2 3' }

export function ColorPicker({ value, onChange, opacity, onOpacity }) {
  const custom = useRef(null)
  return (
    <div className="p-2.5 rounded-lg w-[236px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(10, 1fr)' }}>
        {PALETTE.flat().map((c, i) => (
          <button key={c + i} onClick={() => onChange(c)} className="aspect-square rounded-[3px]"
                  style={{ background: c, outline: value?.toLowerCase() === c.toLowerCase() ? '2px solid #fff' : '1px solid rgba(255,255,255,0.08)', outlineOffset: value?.toLowerCase() === c.toLowerCase() ? 1 : -1 }} />
        ))}
      </div>
      <button onClick={() => custom.current?.click()} className="mt-2 w-full text-[11.5px] py-1.5 rounded-md hover:bg-white/5" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
        + Custom colour
      </button>
      <input ref={custom} type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#3b82f6'} onChange={(e) => onChange(e.target.value)} className="sr-only" />
      {opacity != null && (
        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Opacity</span>
          <input type="range" min={0} max={100} value={Math.round(opacity * 100)} onChange={(e) => onOpacity(+e.target.value / 100)} className="flex-1 accent-[#8B5CF6]" />
          <span className="text-[11px] w-8 text-right" style={{ color: 'var(--text-secondary)' }}>{Math.round(opacity * 100)}%</span>
        </div>
      )}
    </div>
  )
}

function Pop({ open, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    window.addEventListener('pointerdown', h)
    return () => window.removeEventListener('pointerdown', h)
  }, [open, onClose])
  if (!open) return null
  return <div ref={ref} className="absolute top-full left-0 mt-2 z-50">{children}</div>
}

const Btn = ({ title, onClick, children, active }) => (
  <button title={title} onClick={onClick} className="h-8 min-w-8 px-1.5 flex items-center justify-center rounded-md transition-colors hover:bg-white/10"
          style={{ color: active ? 'var(--accent-purple-light)' : 'var(--text-secondary)', background: active ? 'rgba(139,92,246,0.15)' : undefined }}>
    {children}
  </button>
)

export default function DrawingStyleBar({ drawing, onChange, onDelete, onDuplicate, onSettings }) {
  const [pop, setPop] = useState(null)
  if (!drawing) return null
  const s = drawing.style
  const set = (patch) => onChange({ ...drawing, style: { ...s, ...patch } })
  const hasFill = FILL_TYPES.has(drawing.type)
  const isEmoji = drawing.type === 'emoji'

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 px-1.5 py-1 rounded-lg"
         style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 8px 30px rgba(0,0,0,0.45)' }}
         onPointerDown={(e) => e.stopPropagation()}>
      <span className="px-2 text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>{TOOLS[drawing.type]?.label}</span>
      <div className="w-px h-5 mx-0.5" style={{ background: 'var(--border-subtle)' }} />

      {isEmoji && (
        <div className="flex items-center gap-0.5 px-1">
          {[['S', 8], ['M', 13], ['L', 20], ['XL', 30]].map(([label, size]) => (
            <Btn key={label} title={`${label} size`} active={s.fontSize === size} onClick={() => set({ fontSize: size })}><span className="text-[11px] font-semibold">{label}</span></Btn>
          ))}
        </div>
      )}

      {!isEmoji && (
        <div className="relative">
          <Btn title="Line colour" onClick={() => setPop(p => (p === 'line' ? null : 'line'))}>
            <span className="w-4 h-4 rounded-[3px] border" style={{ background: s.color, borderColor: 'rgba(255,255,255,0.25)' }} />
          </Btn>
          <Pop open={pop === 'line'} onClose={() => setPop(null)}><ColorPicker value={s.color} onChange={(c) => set({ color: c })} /></Pop>
        </div>
      )}

      {hasFill && (
        <div className="relative">
          <Btn title="Fill colour" onClick={() => setPop(p => (p === 'fill' ? null : 'fill'))}>
            <span className="w-4 h-4 rounded-[3px] border" style={{ background: s.fill, opacity: Math.max(0.35, s.fillOpacity * 2.2), borderColor: 'rgba(255,255,255,0.25)' }} />
          </Btn>
          <Pop open={pop === 'fill'} onClose={() => setPop(null)}>
            <ColorPicker value={s.fill} onChange={(c) => set({ fill: c })} opacity={s.fillOpacity} onOpacity={(o) => set({ fillOpacity: o })} />
          </Pop>
        </div>
      )}

      {drawing.type === 'text' && (
        <div className="relative">
          <Btn title="Text colour" onClick={() => setPop(p => (p === 'text' ? null : 'text'))}>
            <span className="text-[13px] font-bold" style={{ color: s.textColor }}>A</span>
          </Btn>
          <Pop open={pop === 'text'} onClose={() => setPop(null)}><ColorPicker value={s.textColor} onChange={(c) => set({ textColor: c })} /></Pop>
        </div>
      )}

      {!isEmoji && drawing.type !== 'text' && (
        <div className="relative">
          <Btn title="Line width" onClick={() => setPop(p => (p === 'w' ? null : 'w'))}>
            <span className="text-[11.5px] font-semibold px-0.5">{s.width}px</span>
          </Btn>
          <Pop open={pop === 'w'} onClose={() => setPop(null)}>
            <div className="py-1 rounded-lg w-28" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
              {LINE_WIDTHS.map(w => (
                <button key={w} onClick={() => { set({ width: w }); setPop(null) }} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/5">
                  <span className="flex-1 rounded" style={{ height: w, background: 'var(--text-secondary)' }} />
                  <span className="text-[11px]" style={{ color: s.width === w ? 'var(--accent-purple-light)' : 'var(--text-muted)' }}>{w}px</span>
                </button>
              ))}
            </div>
          </Pop>
        </div>
      )}

      {!isEmoji && drawing.type !== 'text' && (
        <div className="relative">
          <Btn title="Line style" onClick={() => setPop(p => (p === 'd' ? null : 'd'))}>
            <svg width="22" height="10"><line x1="1" y1="5" x2="21" y2="5" stroke="currentColor" strokeWidth="2" strokeDasharray={DASH_PREVIEW[s.dash]} /></svg>
          </Btn>
          <Pop open={pop === 'd'} onClose={() => setPop(null)}>
            <div className="py-1 rounded-lg w-28" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
              {DASH_KEYS.map(k => (
                <button key={k} onClick={() => { set({ dash: k }); setPop(null) }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5" style={{ color: s.dash === k ? 'var(--accent-purple-light)' : 'var(--text-secondary)' }}>
                  <svg width="60" height="8"><line x1="1" y1="4" x2="59" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={DASH_PREVIEW[k]} /></svg>
                </button>
              ))}
            </div>
          </Pop>
        </div>
      )}

      <div className="w-px h-5 mx-0.5" style={{ background: 'var(--border-subtle)' }} />
      <Btn title="Settings" onClick={onSettings}><Settings2 size={15} /></Btn>
      <Btn title="Duplicate" onClick={onDuplicate}><Copy size={15} /></Btn>
      <Btn title={drawing.locked ? 'Unlock' : 'Lock'} active={drawing.locked} onClick={() => onChange({ ...drawing, locked: !drawing.locked })}>
        {drawing.locked ? <Lock size={15} /> : <Unlock size={15} />}
      </Btn>
      <Btn title="Delete (Del)" onClick={onDelete}><Trash2 size={15} style={{ color: 'var(--negative-red)' }} /></Btn>
    </div>
  )
}

// ── Settings dialog ────────────────────────────────────────────────────
const toLocalInput = (secs) => {
  const d = new Date(secs * 1000), p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fromLocalInput = (v) => Math.floor(new Date(v).getTime() / 1000)

export function DrawingSettingsDialog({ drawing, digits, onApply, onClose }) {
  const [tab, setTab] = useState('style')
  const [d, setD] = useState(() => JSON.parse(JSON.stringify(drawing)))
  const [pop, setPop] = useState(null)
  const s = d.style
  const set = (patch) => setD(x => ({ ...x, style: { ...x.style, ...patch } }))
  const tabs = ['style', ...(TEXT_TYPES.has(d.type) ? ['text'] : []), 'coordinates', 'visibility']
  const field = 'w-full rounded-md px-2.5 py-1.5 text-[12.5px] outline-none'
  const fieldStyle = { background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }
  const tfs = d.tfs && d.tfs.every(k => TF_CATEGORIES.some(c => c.id === k)) ? d.tfs : TF_CATEGORIES.map(c => c.id)

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onPointerDown={onClose}>
      <div className="w-full max-w-[400px] rounded-xl overflow-visible" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-3.5">
          <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>{TOOLS[d.type]?.label}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10" style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div className="flex gap-4 px-4 mt-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} className="pb-2 text-[12.5px] capitalize -mb-px border-b-2"
                    style={{ color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)', borderColor: tab === t ? 'var(--accent-purple)' : 'transparent' }}>{t}</button>
          ))}
        </div>

        <div className="p-4 space-y-3 min-h-[170px]">
          {tab === 'style' && (<>
            <div className="flex items-center justify-between relative">
              <span className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{d.type === 'text' ? 'Border' : 'Line'}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPop(p => (p === 'c' ? null : 'c'))} className="w-8 h-6 rounded border" style={{ background: s.color, borderColor: 'rgba(255,255,255,0.25)' }} />
                <select value={s.width} onChange={(e) => set({ width: +e.target.value })} className="rounded-md px-2 py-1 text-[12px]" style={fieldStyle}>
                  {LINE_WIDTHS.map(w => <option key={w} value={w}>{w}px</option>)}
                </select>
                <select value={s.dash} onChange={(e) => set({ dash: e.target.value })} className="rounded-md px-2 py-1 text-[12px]" style={fieldStyle}>
                  {DASH_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              {pop === 'c' && <div className="absolute right-0 top-full mt-1 z-50"><ColorPicker value={s.color} onChange={(c) => { set({ color: c }); setPop(null) }} /></div>}
            </div>
            {FILL_TYPES.has(d.type) && (
              <div className="flex items-center justify-between relative">
                <span className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>Background</span>
                <button onClick={() => setPop(p => (p === 'f' ? null : 'f'))} className="w-8 h-6 rounded border" style={{ background: s.fill, opacity: Math.max(0.4, s.fillOpacity * 2.2), borderColor: 'rgba(255,255,255,0.25)' }} />
                {pop === 'f' && <div className="absolute right-0 top-full mt-1 z-50"><ColorPicker value={s.fill} onChange={(c) => set({ fill: c })} opacity={s.fillOpacity} onOpacity={(o) => set({ fillOpacity: o })} /></div>}
              </div>
            )}
          </>)}

          {tab === 'text' && (<>
            <label className="block text-[12px]" style={{ color: 'var(--text-muted)' }}>Text</label>
            <input className={field} style={fieldStyle} value={d.text || ''} onChange={(e) => setD(x => ({ ...x, text: e.target.value }))} placeholder="Label" />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Size</label>
                <input type="number" min={9} max={40} className={field} style={fieldStyle} value={s.fontSize} onChange={(e) => set({ fontSize: Math.max(9, Math.min(40, +e.target.value || 13)) })} />
              </div>
              <div className="flex-1 relative">
                <label className="block text-[12px] mb-1" style={{ color: 'var(--text-muted)' }}>Colour</label>
                <button onClick={() => setPop(p => (p === 't' ? null : 't'))} className="w-full h-[31px] rounded-md border" style={{ background: s.textColor, borderColor: 'rgba(255,255,255,0.25)' }} />
                {pop === 't' && <div className="absolute right-0 top-full mt-1 z-50"><ColorPicker value={s.textColor} onChange={(c) => { set({ textColor: c }); setPop(null) }} /></div>}
              </div>
            </div>
          </>)}

          {tab === 'coordinates' && d.points.slice(0, 12).map((p, i) => (
            <div key={i} className="grid grid-cols-[28px_1fr_1fr] gap-2 items-center">
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>#{i + 1}</span>
              <input type="number" step="any" className={field} style={fieldStyle} value={Number(p.price.toFixed(digits))}
                     onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setD(x => ({ ...x, points: x.points.map((q, j) => (j === i ? { ...q, price: v } : q)) })) }} />
              <input type="datetime-local" className={field} style={fieldStyle} value={toLocalInput(p.time)}
                     onChange={(e) => { const t = fromLocalInput(e.target.value); if (Number.isFinite(t)) setD(x => ({ ...x, points: x.points.map((q, j) => (j === i ? { ...q, time: t } : q)) })) }} />
            </div>
          ))}

          {tab === 'visibility' && (
            <div>
              <p className="text-[12px] mb-2.5" style={{ color: 'var(--text-muted)' }}>Show this drawing on these kinds of timeframe:</p>
              <div className="grid grid-cols-2 gap-2">
                {TF_CATEGORIES.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-[12.5px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={tfs.includes(c.id)} className="accent-[#8B5CF6]"
                           onChange={(e) => {
                             const next = e.target.checked ? [...new Set([...tfs, c.id])] : tfs.filter(x => x !== c.id)
                             setD(x => ({ ...x, tfs: next.length === TF_CATEGORIES.length ? undefined : next }))
                           }} />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 pb-4">
          <button onClick={onClose} className="px-3.5 py-1.5 rounded-md text-[12.5px] hover:bg-white/5" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>Cancel</button>
          <button onClick={() => onApply(d)} className="btn-primary px-4 py-1.5 rounded-md text-[12.5px] font-semibold text-white">Ok</button>
        </div>
      </div>
    </div>
  )
}