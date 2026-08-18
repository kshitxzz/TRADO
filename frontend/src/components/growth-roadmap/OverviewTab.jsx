import { TrendingUp, DollarSign, Percent, Target, ListChecks, Activity, Sparkle } from 'lucide-react'
import { CircularProgress, MetricCard, AICoachCard, formatPnl, pnlColor } from './shared'

const TONE_COLOR = { positive: 'var(--positive-green)', warning: 'var(--warning-orange)', negative: 'var(--negative-red)', info: 'var(--accent-purple-light)' }

export default function OverviewTab({ overview, ai, aiLoading }) {
  const { stats, avgRR, avgTradesPerDay, avgProfitPerTrade, tradingDays, healthScore, status, focusMessage, tone } = overview
  const color = TONE_COLOR[tone] || TONE_COLOR.info

  return (
    <div className="space-y-5">
      <div className="rounded-xl p-6 flex items-center justify-between flex-wrap gap-6" style={{ background: `${color}0D`, border: `1px solid ${color}30` }}>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}20` }}>
            <TrendingUp size={24} style={{ color }} />
          </div>
          <div>
            <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Current Status</p>
            <h2 className="text-2xl font-black mb-1" style={{ color }}>{status}</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{focusMessage}</p>
          </div>
        </div>
        <CircularProgress value={healthScore} color={color} label="Health Score" valueSuffix="" />
      </div>

      <AICoachCard tip={ai?.coachTip} loading={aiLoading && !ai} unavailableMessage={ai?.aiAvailable === false ? ai.message : null} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={DollarSign} label="Total P&L" value={formatPnl(stats.totalPnl)} valueColor={pnlColor(stats.totalPnl)} />
        <MetricCard icon={Percent} label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} />
        <MetricCard icon={Activity} label="Profit Factor" value={stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2)} />
        <MetricCard icon={Target} label="Avg R:R" value={`${avgRR.toFixed(2)}R`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard icon={ListChecks} label="Total Trades" value={stats.tradeCount} sub={`${tradingDays} trading day${tradingDays === 1 ? '' : 's'}`} iconColor="var(--accent-purple-light)" />
        <MetricCard icon={Activity} label="Avg Trades/Day" value={avgTradesPerDay.toFixed(1)} iconColor="#3B82F6" />
        <MetricCard icon={Sparkle} label="Avg Profit/Trade" value={formatPnl(avgProfitPerTrade)} valueColor={pnlColor(avgProfitPerTrade)} iconColor="var(--positive-green)" />
      </div>
    </div>
  )
}