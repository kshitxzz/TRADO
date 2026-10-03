import { useEffect, useRef } from 'react'
import { ChevronRight } from 'lucide-react'
import { fmtPnl } from '../../lib/replayUtils'

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function SidePill({ side }) {
  const isLong = side === 'long'
  return (
    <span
      className="text-[9.5px] font-bold uppercase tracking-wide leading-none px-1.5 py-[3px] rounded"
      style={isLong
        ? { background: 'rgba(34,197,94,0.12)', color: 'var(--positive-green)' }
        : { background: 'rgba(244,63,94,0.12)', color: 'var(--negative-red)' }}
    >
      {isLong ? 'Buy' : 'Sell'}
    </span>
  )
}

export default function TradeList({ trades, selectedId, onSelect, capture }) {
  const selectedRef = useRef(null)

  // Arriving from Day View can select a trade far down the list — bring it into view.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  return (
    <div className="glass-card flex flex-col overflow-hidden h-[260px] lg:h-[395px]">
      <p className="px-[14px] pt-[14px] pb-[10px] text-[11px] font-semibold uppercase tracking-[0.08em] flex-shrink-0"
         style={{ color: 'var(--text-muted)' }}>
        Recent Trades ({trades.length})
      </p>
      {capture && capture.total > 0 && capture.ready < capture.total && (
        <p className="px-[14px] -mt-1 pb-2 text-[11px] leading-snug flex-shrink-0" style={{ color: 'var(--text-muted)' }}
           title="Your MT5 terminal uploads its own candles for each closed trade while the TradoSync EA is running. Keep MT5 open and this fills in automatically.">
          Broker candles ready: <span style={{ color: 'var(--accent-purple-light)' }}>{capture.ready}/{capture.total}</span>
        </p>
      )}

      {trades.length === 0 ? (
        <div className="flex-1 flex items-center justify-center pb-6">
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>No closed trades yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {trades.map(t => {
            const active = t.id === selectedId
            const pnlColor = t.pnl >= 0 ? 'var(--positive-green-bright)' : 'var(--negative-red)'
            return (
              <button
                key={t.id}
                ref={active ? selectedRef : undefined}
                onClick={() => onSelect(t.id)}
                className="w-full text-left rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 transition-colors hover:bg-white/[0.04]"
                style={{
                  background: active ? 'rgba(139,92,246,0.10)' : 'transparent',
                  border: `1px solid ${active ? 'rgba(139,92,246,0.28)' : 'transparent'}`,
                }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{t.symbol}</span>
                    <SidePill side={t.side} />
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{fmtDate(t.closedAt)}</p>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-sm font-bold" style={{ color: pnlColor }}>{fmtPnl(t.pnl)}</span>
                  {active && <ChevronRight size={14} style={{ color: 'var(--accent-purple-light)' }} />}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}