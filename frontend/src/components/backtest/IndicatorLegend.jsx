import { Eye, EyeOff, X, Settings2 } from 'lucide-react'
import { indicatorLabel, defOf } from '../../lib/backtest/indicators'

/** Chips in the chart's top-left corner: quick hide / settings / remove for each indicator. */
export default function IndicatorLegend({ indicators, onToggle, onRemove, onSettings }) {
  if (!indicators.length) return null
  return (
    <div className="absolute top-2 left-3 z-20 flex flex-col items-start gap-1 max-w-[70%] max-h-[55%] overflow-y-auto [&::-webkit-scrollbar]:hidden" onPointerDown={(e) => e.stopPropagation()}>
      {indicators.map(ind => {
        const d = defOf(ind.type)
        if (!d) return null
        const off = ind.visible === false
        return (
          <div key={ind.id} className="group flex items-center gap-1.5 pl-2 pr-1 h-6 rounded-md text-[11.5px] font-medium"
               style={{ background: 'rgba(17,17,22,0.78)', border: '1px solid rgba(255,255,255,0.07)', color: off ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: off ? 'transparent' : ind.color, border: `1.5px solid ${ind.color}` }} />
            <span className="whitespace-nowrap">{indicatorLabel(ind)}</span>
            <span className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onToggle(ind.id)} className="p-1 rounded hover:bg-white/10" title={off ? 'Show' : 'Hide'}>{off ? <EyeOff size={12} /> : <Eye size={12} />}</button>
              <button onClick={onSettings} className="p-1 rounded hover:bg-white/10" title="Settings"><Settings2 size={12} /></button>
              <button onClick={() => onRemove(ind.id)} className="p-1 rounded hover:bg-white/10" title="Remove"><X size={12} /></button>
            </span>
          </div>
        )
      })}
    </div>
  )
}