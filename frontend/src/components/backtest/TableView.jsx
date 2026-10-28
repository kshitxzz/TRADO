import { useState } from 'react'
import { X } from 'lucide-react'

/** The revealed bars of the current timeframe as a table, newest first. Live while the replay runs. */
export default function TableView({ getBars, version, tzFmt, digits, tfSecs, symbol, tfLabel, onClose }) {
  const [shown, setShown] = useState(150)
  const bars = getBars()
  const rows = []
  for (let i = bars.length - 1; i >= Math.max(0, bars.length - shown); i--) rows.push({ b: bars[i], prev: bars[i - 1] })
  const f = (n) => Number(n).toFixed(digits)
  const th = 'text-left font-medium px-4 py-2 sticky top-0'
  const td = 'px-4 py-1.5 tabular-nums whitespace-nowrap'

  return (
    <div className="absolute left-0 right-0 bottom-0 z-30 flex flex-col" data-v={version}
         style={{ height: 'min(46%, 380px)', background: 'var(--bg-card)', borderTop: '1px solid var(--border-subtle)', boxShadow: '0 -12px 40px rgba(0,0,0,0.35)' }}
         onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-4 h-10 flex-shrink-0">
        <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Table view <span className="font-normal" style={{ color: 'var(--text-muted)' }}>· {symbol} · {tfLabel} · {bars.length.toLocaleString()} bars</span></p>
        <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-white/10" style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              {['Time', 'Open', 'High', 'Low', 'Close', 'Change', '%', 'Volume'].map(h => <th key={h} className={th} style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ b, prev }) => {
              const chg = prev ? b.close - prev.close : null
              const c = b.close >= b.open ? '#26B570' : '#D4263A'
              return (
                <tr key={b.time} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td className={td} style={{ color: 'var(--text-secondary)' }}>{tfSecs >= 86400 ? tzFmt.date(b.time) : tzFmt.dateTime(b.time)}</td>
                  <td className={td} style={{ color: 'var(--text-primary)' }}>{f(b.open)}</td>
                  <td className={td} style={{ color: 'var(--text-primary)' }}>{f(b.high)}</td>
                  <td className={td} style={{ color: 'var(--text-primary)' }}>{f(b.low)}</td>
                  <td className={td} style={{ color: c, fontWeight: 600 }}>{f(b.close)}</td>
                  <td className={td} style={{ color: chg == null ? 'var(--text-muted)' : chg >= 0 ? '#26B570' : '#D4263A' }}>{chg == null ? '—' : `${chg >= 0 ? '+' : ''}${f(chg)}`}</td>
                  <td className={td} style={{ color: chg == null ? 'var(--text-muted)' : chg >= 0 ? '#26B570' : '#D4263A' }}>{chg == null || !prev.close ? '—' : `${chg >= 0 ? '+' : ''}${((chg / prev.close) * 100).toFixed(2)}%`}</td>
                  <td className={td} style={{ color: 'var(--text-secondary)' }}>{(b.volume || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown < bars.length && (
          <div className="p-3 text-center">
            <button type="button" onClick={() => setShown(n => n + 300)} className="px-4 py-1.5 rounded-md text-[12px] font-semibold hover:bg-white/5" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Show 300 more</button>
          </div>
        )}
      </div>
    </div>
  )
}