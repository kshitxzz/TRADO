import { useState } from 'react'
import { X, Search, Eye, EyeOff, Trash2, Plus } from 'lucide-react'
import { INDICATOR_DEFS, INDICATOR_CATEGORIES, defOf, newIndicator, indicatorLabel } from '../../lib/backtest/indicators'

/** Numeric field that lets you type freely ("0." / empty) and only commits valid values in range. */
function ParamInput({ value, min, max, step, onCommit }) {
  const [text, setText] = useState(String(value))
  const [bad, setBad] = useState(false)
  const edit = (raw) => {
    const t = raw.replace(/[^0-9.]/g, '')
    setText(t)
    const n = parseFloat(t)
    const good = Number.isFinite(n) && n >= min && n <= max
    setBad(!good && t !== '')
    if (good) onCommit(n)
  }
  return (
    <input value={text} inputMode="decimal" onChange={(e) => edit(e.target.value)} onBlur={() => { setText(String(value)); setBad(false) }}
           title={`${min} – ${max}${step ? ` (step ${step})` : ''}`}
           className="w-[68px] rounded-md px-2 py-1 text-[12px] outline-none"
           style={{ background: 'var(--bg-primary)', border: `1px solid ${bad ? 'var(--negative-red)' : 'var(--border-subtle)'}`, color: 'var(--text-primary)' }} />
  )
}

export default function IndicatorsDialog({ indicators, onChange, onClose }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const list = INDICATOR_DEFS.filter(d =>
    (cat === 'All' || d.category === cat) && (!q || `${d.name} ${d.short} ${d.category}`.toLowerCase().includes(q.toLowerCase())))
  const patch = (id, p) => onChange(indicators.map(i => (i.id === id ? { ...i, ...p } : i)))

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[8vh] p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onPointerDown={onClose}>
      <div className="w-full max-w-[520px] rounded-xl overflow-hidden flex flex-col max-h-[84vh]"
           style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>Indicators <span className="text-[12px] font-normal" style={{ color: 'var(--text-muted)' }}>· {INDICATOR_DEFS.length} available</span></h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10" style={{ color: 'var(--text-muted)' }}><X size={17} /></button>
        </div>

        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}>
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search indicators (RSI, MACD, Bollinger…)"
                   className="flex-1 bg-transparent outline-none text-[13px]" style={{ color: 'var(--text-primary)' }} />
          </div>
          <div className="flex gap-1 mt-2 overflow-x-auto">
            {['All', ...INDICATOR_CATEGORIES].map(c => (
              <button key={c} onClick={() => setCat(c)} className="px-3 py-1 rounded-full text-[11.5px] font-semibold whitespace-nowrap"
                      style={{ background: cat === c ? 'rgba(139,92,246,0.16)' : 'transparent', color: cat === c ? 'var(--accent-purple-light)' : 'var(--text-muted)', border: `1px solid ${cat === c ? 'rgba(139,92,246,0.4)' : 'var(--border-subtle)'}` }}>{c}</button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {indicators.length > 0 && (
            <div className="px-4 pb-2">
              <p className="text-[10px] font-semibold tracking-wider uppercase mb-1.5" style={{ color: 'var(--text-muted)' }}>On this chart</p>
              <div className="space-y-1.5">
                {indicators.map(ind => {
                  const d = defOf(ind.type)
                  if (!d) return null
                  return (
                    <div key={ind.id} className="rounded-lg px-2.5 py-2" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}>
                      <div className="flex items-center gap-2">
                        <input type="color" value={ind.color} onChange={(e) => patch(ind.id, { color: e.target.value })} className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0" title="Colour" />
                        <span className="flex-1 text-[12.5px] font-medium" style={{ color: 'var(--text-primary)' }}>{indicatorLabel(ind)}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>{d.pane === 'sub' ? 'own pane' : 'on price'}</span>
                        <button onClick={() => patch(ind.id, { visible: ind.visible === false })} className="p-1 rounded hover:bg-white/10" style={{ color: 'var(--text-muted)' }} title="Show / hide">
                          {ind.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button onClick={() => onChange(indicators.filter(i => i.id !== ind.id))} className="p-1 rounded hover:bg-white/10" title="Remove"><Trash2 size={14} style={{ color: 'var(--negative-red)' }} /></button>
                      </div>
                      {d.params.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2">
                          {d.params.map(p => (
                            <label key={p.key} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              {p.label}
                              <ParamInput value={ind.params?.[p.key] ?? p.def} min={p.min} max={p.max} step={p.step} onCommit={(n) => patch(ind.id, { params: { ...ind.params, [p.key]: n } })} />
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="px-2 pb-3">
            <p className="px-2 text-[10px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Library</p>
            {list.length === 0 && <p className="px-2 py-3 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>No indicator matches “{q}”.</p>}
            {list.map(d => (
              <button key={d.type} onClick={() => onChange([...indicators, newIndicator(d.type)])}
                      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left hover:bg-white/5 transition-colors">
                <span className="w-9 h-8 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: `${d.color}22`, color: d.color }}>{d.short}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px]" style={{ color: 'var(--text-primary)' }}>{d.name} <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>· {d.category}</span></span>
                  <span className="block text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>{d.desc} {d.pane === 'sub' ? 'Own pane.' : 'Drawn on price.'}</span>
                </span>
                <Plus size={15} style={{ color: 'var(--text-muted)' }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}