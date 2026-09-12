import { Target, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { formatPnl } from '../../lib/utils'

function DistTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glow)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <p style={{ color: d.color, fontWeight: 700 }}>{d.label}</p>
      <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{d.count} trades ({d.pct.toFixed(0)}%)</p>
    </div>
  )
}

export default function ProfitDistributionCard({ distribution }) {
  const { segments, netPnl, bestTrade, worstTrade, avgWin, avgLoss, tradeCount } = distribution

  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target size={16} style={{ color: '#8B5CF6' }} />
          <div>
            <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Profit Distribution</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Win/loss categorization</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xl font-bold leading-none" style={{ color: netPnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }}>
            {formatPnl(netPnl)}
          </p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Net P&L</p>
        </div>
      </div>

      {tradeCount === 0 ? (
        <div className="flex items-center justify-center" style={{ height: 200 }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No trade data yet</p>
        </div>
      ) : (
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={segments} dataKey="count" nameKey="label"
                innerRadius="62%" outerRadius="90%"
                startAngle={90} endAngle={-270}
                paddingAngle={2}
                isAnimationActive animationDuration={900}
              >
                {segments.map(s => <Cell key={s.key} fill={s.color} stroke="var(--bg-card)" strokeWidth={2} />)}
              </Pie>
              <Tooltip content={<DistTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mt-2">
        <div className="rounded-xl p-3.5" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)' }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingUp size={12} style={{ color: 'var(--positive-green)' }} />
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Biggest Win</span>
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--positive-green)' }}>{formatPnl(Math.max(0, bestTrade))}</p>
        </div>
        <div className="rounded-xl p-3.5" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingDown size={12} style={{ color: 'var(--negative-red)' }} />
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Biggest Loss</span>
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--negative-red)' }}>{formatPnl(Math.min(0, worstTrade))}</p>
        </div>
        <div className="stat-tile p-3.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <DollarSign size={12} style={{ color: 'var(--text-muted)' }} />
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Avg Win</span>
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--positive-green)' }}>{formatPnl(avgWin)}</p>
        </div>
        <div className="stat-tile p-3.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <DollarSign size={12} style={{ color: 'var(--text-muted)' }} />
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Avg Loss</span>
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--negative-red)' }}>{formatPnl(avgLoss)}</p>
        </div>
      </div>
    </div>
  )
}