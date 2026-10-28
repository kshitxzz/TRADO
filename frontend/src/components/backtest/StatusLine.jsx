import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, X, Settings2 } from 'lucide-react'
import PairIcon from '../ui/PairIcon'
import { indicatorLabel, defOf } from '../../lib/backtest/indicators'
import { tfName as tfNameOf } from '../../lib/backtest/data'

const UP = '#26B570', DOWN = '#D4263A'
const fmtVal = (v) => (v == null ? '∅' : Math.abs(v) >= 1000 ? v.toFixed(2) : Math.abs(v) >= 1 ? v.toFixed(3) : v.toFixed(5))
const volFmt = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(2)}K` : v.toFixed(2))

/** Forex, metals and energy close for the weekend; crypto never does. UTC Fri 22:00 → Sun 22:00. */
export function isMarketOpen(spec, secs) {
  if (spec.kind === 'crypto') return true
  const d = new Date(secs * 1000), day = d.getUTCDay(), hr = d.getUTCHours()
  if (day === 6) return false
  if (day === 5 && hr >= 22) return false
  if (day === 0 && hr < 22) return false
  return true
}

/**
 * Top-left of the chart. Everything here is switched on / off from Settings → Status line:
 * logo, title, market status, OHLC, bar change, volume, last-day change, buy/sell buttons and the
 * indicator rows (titles, inputs, values, background).
 */
export default function StatusLine({
  cs, symbol, description, tfLabel, spec, digits, getBars, onCrosshair, quote, marketOpen, clockSecs,
  onSell, onBuy, indicators, indicatorValues, onToggle, onRemove, onSettings, pdc, version,
}) {
  const st = cs.status
  const [hoverTime, setHoverTime] = useState(null)
  const raf = useRef(0)
  useEffect(() => {
    if (!onCrosshair) return
    const off = onCrosshair((info) => {
      cancelAnimationFrame(raf.current)
      raf.current = requestAnimationFrame(() => setHoverTime(info.time ?? null))
    })
    return () => { off(); cancelAnimationFrame(raf.current) }
  }, [onCrosshair])

  const bars = getBars()
  let idx = bars.length - 1
  if (hoverTime != null) { const i = bars.findIndex(b => b.time === hoverTime); if (i >= 0) idx = i }
  const bar = bars[idx], prev = bars[idx - 1]
  const up = bar ? bar.close >= bar.open : true
  const col = up ? UP : DOWN
  const f = (n) => (n == null ? '—' : Number(n).toFixed(digits))
  const chg = bar && prev ? bar.close - prev.close : null
  const dayChg = bar && pdc != null ? bar.close - pdc : null
  const pct = (v, base) => (base ? `${v >= 0 ? '+' : ''}${((v / base) * 100).toFixed(2)}%` : '')
  const sgn = (v) => `${v >= 0 ? '+' : ''}${f(v)}`

  const title = st.titleMode === 'symbol' ? symbol : st.titleMode === 'description' ? description : `${symbol} · ${description}`
  const showHeader = st.logo || st.title || st.marketStatus
  const values = vals => vals

  const ivals = indicatorValues?.() || {}
  const spread = quote ? quote.ask - quote.bid : 0

  return (
    <div className="absolute top-2 left-3 z-20 flex flex-col items-start gap-1 max-w-[78%] max-h-[70%] overflow-y-auto [&::-webkit-scrollbar]:hidden select-none"
         data-v={version} onPointerDown={(e) => e.stopPropagation()}>
      {showHeader && (
        <div className="flex items-center gap-2 text-[13px] font-semibold px-1" style={{ color: 'var(--text-primary)', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
          {st.logo && <PairIcon symbol={symbol} size={18} />}
          {st.title && <span className="whitespace-nowrap">{title} <span style={{ color: 'var(--text-muted)' }}>· {tfLabel}</span></span>}
          {st.marketStatus && (
            <span title={marketOpen ? 'Market is open' : 'Market is closed'} className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: marketOpen ? '#22C55E' : '#F43F5E', boxShadow: `0 0 0 3px ${marketOpen ? 'rgba(34,197,94,0.18)' : 'rgba(244,63,94,0.18)'}` }} />
          )}
        </div>
      )}

      {st.buySell && cs.trading.buySell && quote && (
        <div className="flex items-stretch gap-1 px-1">
          <button type="button" onClick={onSell} title="Sell at the bid" className="h-7 px-2.5 rounded-md text-[11.5px] font-bold tabular-nums hover:brightness-125 transition"
                  style={{ background: 'rgba(244,63,94,0.16)', border: '1px solid rgba(244,63,94,0.55)', color: '#FB7185' }}>
            <span className="opacity-70 mr-1">SELL</span>{quote.bid.toFixed(digits)}
          </button>
          <span className="self-center text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{spread.toFixed(digits <= 2 ? 2 : Math.min(digits, 5))}</span>
          <button type="button" onClick={onBuy} title="Buy at the ask" className="h-7 px-2.5 rounded-md text-[11.5px] font-bold tabular-nums hover:brightness-125 transition"
                  style={{ background: 'rgba(59,130,246,0.16)', border: '1px solid rgba(59,130,246,0.55)', color: '#60A5FA' }}>
            <span className="opacity-70 mr-1">BUY</span>{quote.ask.toFixed(digits)}
          </button>
        </div>
      )}

      {bar && (st.chartValues || st.barChange || st.volume || st.lastDayChange) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-1 text-[11.5px] tabular-nums" style={{ color: 'var(--text-muted)', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
          {st.chartValues && <span>O <b style={{ color: col }}>{f(bar.open)}</b> H <b style={{ color: col }}>{f(bar.high)}</b> L <b style={{ color: col }}>{f(bar.low)}</b> C <b style={{ color: col }}>{f(bar.close)}</b></span>}
          {st.barChange && chg != null && <span style={{ color: chg >= 0 ? UP : DOWN }}>{sgn(chg)} ({pct(chg, prev.close)})</span>}
          {st.volume && <span>Vol <b style={{ color: col }}>{volFmt(bar.volume || 0)}</b></span>}
          {st.lastDayChange && dayChg != null && <span>Day <b style={{ color: dayChg >= 0 ? UP : DOWN }}>{sgn(dayChg)} ({pct(dayChg, pdc)})</b></span>}
        </div>
      )}

      {indicators.map(ind => {
        const d = defOf(ind.type)
        if (!d) return null
        const off = ind.visible === false
        const label = st.indTitles ? (st.indInputs ? indicatorLabel(ind) : d.short) : ''
        const vals = st.indValues ? d.outputs.filter(o => o.kind !== 'dots' || true).map(o => ({ k: o.key, v: ivals[ind.id]?.[o.key], c: o.color || ind.color })) : []
        return (
          <div key={ind.id} className="group flex items-center gap-1.5 pl-2 pr-1 h-6 rounded-md text-[11.5px] font-medium"
               style={{ background: st.indBackground ? `rgba(17,17,22,${st.indBackgroundOpacity})` : 'transparent', border: st.indBackground ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent', color: off ? 'var(--text-muted)' : 'var(--text-secondary)', textShadow: st.indBackground ? undefined : '0 1px 3px rgba(0,0,0,0.6)' }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: off ? 'transparent' : ind.color, border: `1.5px solid ${ind.color}` }} />
            {label && <span className="whitespace-nowrap">{label}</span>}
            {!off && vals.map(x => <span key={x.k} className="tabular-nums whitespace-nowrap" style={{ color: x.c }}>{fmtVal(x.v)}</span>)}
            <span className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
              <button type="button" onClick={() => onToggle(ind.id)} className="p-1 rounded hover:bg-white/10" title={off ? 'Show' : 'Hide'}>{off ? <EyeOff size={12} /> : <Eye size={12} />}</button>
              <button type="button" onClick={onSettings} className="p-1 rounded hover:bg-white/10" title="Settings"><Settings2 size={12} /></button>
              <button type="button" onClick={() => onRemove(ind.id)} className="p-1 rounded hover:bg-white/10" title="Remove"><X size={12} /></button>
            </span>
          </div>
        )
      })}
    </div>
  )
}