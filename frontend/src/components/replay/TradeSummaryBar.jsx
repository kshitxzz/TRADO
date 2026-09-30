import { ArrowDownRight, ArrowUpRight, Clock, DollarSign } from 'lucide-react'
import { fmtPnl, fmtPrice } from '../../lib/replayUtils'
import { formatDuration } from '../../lib/analytics'

function Label({ icon: Icon, children }) {
  return (
    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] mb-1"
       style={{ color: 'var(--text-muted)' }}>
      {Icon && <Icon size={10} />}
      {children}
    </p>
  )
}

/**
 * `livePnl` is a number while the trade is open in the replay (label flips to
 * "Live P&L"), and null before entry / after exit (final P&L is shown).
 */
export default function TradeSummaryBar({ trade, precision, livePnl }) {
  const isLong = trade.side === 'long'
  const tint = isLong ? '52,211,153' : '244,63,94'
  const Icon = isLong ? ArrowUpRight : ArrowDownRight
  const iconColor = isLong ? 'var(--positive-green-bright)' : 'var(--negative-red)'

  const shown = livePnl ?? trade.pnl
  const pnlColor = shown >= 0 ? 'var(--positive-green-bright)' : 'var(--negative-red)'

  return (
    <div className="glass-card px-[18px] py-[14px] flex items-center flex-wrap gap-x-8 gap-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
             style={{ background: `rgba(${tint},0.10)`, border: `1px solid rgba(${tint},0.18)` }}>
          <Icon size={16} style={{ color: iconColor }} />
        </div>
        <span className="text-[17px] font-bold" style={{ color: 'var(--text-primary)' }}>{trade.symbol}</span>
      </div>

      <div className="flex items-center gap-6">
        <div>
          <Label icon={DollarSign}>{livePnl != null ? 'Live P&L' : 'P&L'}</Label>
          <p className="text-xl font-bold leading-none tabular-nums" style={{ color: pnlColor }}>{fmtPnl(shown)}</p>
        </div>

        <div className="self-stretch w-px" style={{ background: 'var(--border-subtle)' }} />

        <div className="flex items-center gap-5">
          <div>
            <Label>Entry</Label>
            <p className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
              {fmtPrice(trade.entryPrice, precision)}
            </p>
          </div>
          <div>
            <Label>Exit</Label>
            <p className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
              {fmtPrice(trade.exitPrice, precision)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div>
            <Label icon={Clock}>Duration</Label>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{formatDuration(trade.durationSec)}</p>
          </div>
          <div>
            <Label>Vol</Label>
            <p className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
              {trade.size ? trade.size.toFixed(2) : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}