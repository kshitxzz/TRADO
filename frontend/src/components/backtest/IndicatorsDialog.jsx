import { useState } from 'react'
import { X, Search, Eye, EyeOff, Trash2, Plus } from 'lucide-react'
import { INDICATOR_DEFS, defOf, newIndicator, indicatorLabel } from '../../lib/backtest/indicators'

const PARAM_LABEL = { period: 'Length', mult: 'Std dev' }

export default function IndicatorsDialog({ indicators, onChange, onClose }) {
  const [q, setQ] = useState('')
  const list = INDICATOR_DEFS.filter(d => !q || `${d.name} ${d.short}`.toLowerCase().includes(q.toLowerCase()))
  const patch = (id, p) => onChange(indicators.map(i => (i.id === id ? { ...i, ...p } : i)))
  const input = { background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onPointerDown={onClose}>
      <div className="w-full max-w-[460px] rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>Indicators</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10" style={{ color: 'var(--text-muted)' }}><X size={17} /></button>
        </div>

        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={input}>
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search indicators"
                   className="flex-1 bg-transparent outline-none text-[13px]" style={{ color: 'var(--text-primary)' }} />
          </div>
        </div>

        {indicators.length > 0 && (
          <div className="px-4 pb-2">
            <p className="text-[10px] font-semibold tracking-wider uppercase mb-1.5" style={{ color: 'var(--text-muted)' }}>On this chart</p>
            <div className="space-y-1.5">
              {indicators.map(ind => (
                <div key={ind.id} className="rounded-lg px-2.5 py-2" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-center gap-2">
                    <input type="color" value={ind.color} onChange={(e) => patch(ind.id, { color: e.target.value })} className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0" title="Colour" />
                    <span className="flex-1 text-[12.5px] font-medium" style={{ color: 'var(--text-primary)' }}>{indicatorLabel(ind)}</span>
                    <button onClick={() => patch(ind.id, { visible: ind.visible === false })} className="p-1 rounded hover:bg-white/10" style={{ color: 'var(--text-muted)' }} title="Show / hide">
                      {ind.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button onClick={() => onChange(indicators.filter(i => i.id !== ind.id))} className="p-1 rounded hover:bg-white/10" title="Remove">
                      <Trash2 size={14} style={{ color: 'var(--negative-red)' }} />
                    </button>
                  </div>
                  <div className="flex gap-2 mt-1.5">
                    {Object.entries(ind.params).map(([k, v]) => (
                      <label key={k} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {PARAM_LABEL[k] || k}
                        <input type="number" min={1} max={500} step={k === 'mult' ? 0.5 : 1} value={v}
                               onChange={(e) => { const n = parseFloat(e.target.value); if (Number.isFinite(n) && n > 0) patch(ind.id, { params: { ...ind.params, [k]: n } }) }}
                               className="w-16 rounded-md px-2 py-1 text-[12px] outline-none" style={input} />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-2 pb-3 max-h-[260px] overflow-y-auto">
          <p className="px-2 text-[10px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Library</p>
          {list.length === 0 && <p className="px-2 py-3 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>No indicator matches “{q}”.</p>}
          {list.map(d => (
            <button key={d.type} onClick={() => onChange([...indicators, newIndicator(d.type)])}
                    className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left hover:bg-white/5 transition-colors">
              <span className="w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold" style={{ background: `${d.color}22`, color: d.color }}>{d.short}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px]" style={{ color: 'var(--text-primary)' }}>{d.name}</span>
                <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>{d.desc} {d.pane === 'sub' ? 'Own pane.' : 'On price.'}</span>
              </span>
              <Plus size={15} style={{ color: 'var(--text-muted)' }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}