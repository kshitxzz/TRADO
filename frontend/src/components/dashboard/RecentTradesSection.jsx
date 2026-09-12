import { ArrowUpRight, ArrowDownRight, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { formatPnl } from '../../lib/utils'

function TradeRow({ trade }) {
  const isBuy = trade.side === 'BUY'
  const date = trade.closed_at
    ? new Date(trade.closed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: isBuy ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
          }}
        >
          {isBuy
            ? <ArrowUpRight size={16} style={{ color: 'var(--positive-green)' }} />
            : <ArrowDownRight size={16} style={{ color: 'var(--negative-red)' }} />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{trade.symbol}</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {isBuy ? 'LONG' : 'SHORT'} • {date}
          </p>
        </div>
      </div>
      <p className="text-sm font-bold flex-shrink-0 ml-2" style={{ color: trade.pnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }}>
        {formatPnl(trade.pnl)}
      </p>
    </div>
  )
}

function PerfRow({ label, value, color, isLast }) {
  return (
    <div className="flex items-center justify-between py-3" style={!isLast ? { borderBottom: '1px solid var(--border-subtle)' } : undefined}>
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm font-bold" style={{ color }}>{value}</span>
    </div>
  )
}

export default function RecentTradesSection({ closedTrades = [], stats }) {
  const navigate = useNavigate()
  const recent = [...closedTrades]
    .filter(t => t.closed_at)
    .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))
    .slice(0, 5)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

      {/* Recent Trades — spans 2 of 3 columns */}
      <div className="glass-card p-5 lg:col-span-2">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Recent Trades</h3>
          <button
            onClick={() => navigate('/trades')}
            className="text-xs font-medium flex items-center gap-1 transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
          >
            View All <ArrowUpRight size={13} />
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No closed trades yet</p>
          </div>
        ) : (
          <div>
            {recent.map(t => <TradeRow key={t.id} trade={t} />)}
          </div>
        )}
      </div>

      {/* Performance + AI Insights — stacked in the remaining column */}
      <div className="flex flex-col gap-4">
        <div className="glass-card p-5">
          <h3 className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Performance</h3>
          <div>
            <PerfRow label="Best Trade"  value={formatPnl(Math.max(0, stats.bestTrade || 0))} color="var(--positive-green)" />
            <PerfRow label="Worst Trade" value={formatPnl(Math.min(0, stats.worstTrade || 0))} color="var(--negative-red)" />
            <PerfRow label="Avg Win"     value={formatPnl(stats.avgWin || 0)} color="var(--positive-green)" />
            <PerfRow label="Avg Loss"    value={formatPnl(stats.avgLoss || 0)} color="var(--negative-red)" isLast />
          </div>
        </div>

        <div className="glass-card p-5 flex-1 flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}
            >
              <Sparkles size={18} color="#fff" />
            </div>
            <div>
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>AI Insights</h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Powered by Trado AI</p>
            </div>
          </div>
          <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>
            Get personalized trading analysis and pattern detection
          </p>
          <button
            onClick={() => navigate('/trado-ai', { state: { tab: 'Patterns & Timing', subtab: 'smart' } })}
            className="mt-auto w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-transform hover:scale-[1.02]"
            style={{ background: 'rgba(139,92,246,0.14)', color: 'var(--accent-purple-light)', border: '1px solid rgba(139,92,246,0.3)' }}
          >
            <Sparkles size={14} /> View Insights
          </button>
        </div>
      </div>
    </div>
  )
}