import { useState, useMemo } from 'react'
import { Calculator, DollarSign, Percent, Target as TargetIcon, Sparkle, Info } from 'lucide-react'
import { computeGoalProjection } from '../../lib/analytics'
import { CircularProgress, formatPnl } from './shared'

export default function GoalCalculatorTab({ overview }) {
  const { stats, avgRR, avgTradesPerDay } = overview
  const avgLossAmount = Math.abs(stats.avgLoss || 0)

  const [targetProfit, setTargetProfit] = useState(Math.max(1000, Math.round((stats.totalPnl + 500) / 100) * 100))
  const [projectedWinRate, setProjectedWinRate] = useState(Number(stats.winRate.toFixed(1)))
  const [projectedRR, setProjectedRR] = useState(Number(avgRR.toFixed(2)))

  const projection = useMemo(() => computeGoalProjection({
    targetProfit, projectedWinRate, projectedRR,
    avgLossAmount, avgTradesPerDay, currentTotalPnl: stats.totalPnl,
  }), [targetProfit, projectedWinRate, projectedRR, avgLossAmount, avgTradesPerDay, stats.totalPnl])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.14)' }}>
          <Calculator size={16} style={{ color: 'var(--accent-purple-light)' }} />
        </div>
        <div>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Goal Projection Calculator</h3>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>See what's possible with improved metrics</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="glass-card p-5 space-y-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Target Profit Goal</label>
            <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
              <DollarSign size={14} style={{ color: 'var(--text-muted)' }} />
              <input type="number" value={targetProfit} onChange={e => setTargetProfit(Number(e.target.value) || 0)}
                className="bg-transparent flex-1 outline-none text-sm" style={{ color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
              Projected Win Rate <span style={{ color: 'var(--text-muted)' }}>(Current: {stats.winRate.toFixed(1)}%)</span>
            </label>
            <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
              <Percent size={14} style={{ color: 'var(--text-muted)' }} />
              <input type="number" step="0.1" value={projectedWinRate} onChange={e => setProjectedWinRate(Number(e.target.value) || 0)}
                className="bg-transparent flex-1 outline-none text-sm" style={{ color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
              Projected R:R <span style={{ color: 'var(--text-muted)' }}>(Current: {avgRR.toFixed(2)})</span>
            </label>
            <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
              <TargetIcon size={14} style={{ color: 'var(--text-muted)' }} />
              <input type="number" step="0.01" value={projectedRR} onChange={e => setProjectedRR(Number(e.target.value) || 0)}
                className="bg-transparent flex-1 outline-none text-sm" style={{ color: 'var(--text-primary)' }} />
            </div>
          </div>
        </div>

        <div className="rounded-xl p-5" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)' }}>
          <div className="flex items-center gap-2 mb-5">
            <Sparkle size={14} style={{ color: 'var(--positive-green)' }} />
            <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Projection Results</h4>
          </div>
          <div className="flex items-center gap-6 flex-wrap">
            <CircularProgress value={projection.progressToGoalPct} size={100} color="var(--accent-purple-light)" label="achieved" sublabel="Progress to Goal" valueSuffix="%" />
            <div className="flex-1 min-w-[200px] grid grid-cols-2 gap-3">
              <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Expected Value/Trade</p>
                <p className="text-base font-bold" style={{ color: projection.expectedValue >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }}>{formatPnl(projection.expectedValue)}</p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Trades to Goal</p>
                <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{projection.tradesToGoal ?? '—'}</p>
              </div>
              <div className="col-span-2 rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Estimated Time</p>
                <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  {projection.estimatedDays != null ? <>~{projection.estimatedDays} day{projection.estimatedDays === 1 ? '' : 's'} <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>({projection.estimatedWeeks} week{projection.estimatedWeeks === 1 ? '' : 's'})</span></> : '—'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-4">
            <Info size={11} style={{ color: 'var(--text-muted)' }} />
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Based on {avgTradesPerDay.toFixed(1)} trades/day avg</p>
          </div>
        </div>
      </div>
    </div>
  )
}