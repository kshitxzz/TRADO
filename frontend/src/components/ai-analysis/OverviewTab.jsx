import {
  Percent, Target, DollarSign, TrendingUp, TrendingDown, Flame,
  AlertTriangle, CheckCircle2, Flag, BarChart3, Shield, Clock, Info,
} from 'lucide-react'
import { MetricCard, formatPnl, pnlColor } from './shared'

export default function OverviewTab({ computed, onNavigate }) {
  const { overallStats, streakAnalysis, behavioralFlags } = computed

  const rr = overallStats.avgLoss !== 0 ? Math.abs(overallStats.avgWin / overallStats.avgLoss) : 0
  const maxDrawdownPct = computed.riskSizing?.maxDrawdownPct ?? 0

  const metrics = [
    { icon: Percent,    label: 'Win Rate',      value: `${overallStats.winRate.toFixed(1)}%`, color: 'var(--text-primary)' },
    { icon: TrendingUp, label: 'Profit Factor', value: overallStats.profitFactor >= 999 ? '∞' : overallStats.profitFactor.toFixed(2), color: 'var(--text-primary)' },
    { icon: DollarSign, label: 'Total P&L',     value: formatPnl(overallStats.totalPnl), color: pnlColor(overallStats.totalPnl) },
    { icon: Target,     label: 'Avg R:R',       value: `1:${rr.toFixed(1)}`, color: 'var(--text-primary)' },
    { icon: TrendingDown, label: 'Max Drawdown', value: `${maxDrawdownPct.toFixed(1)}%`, color: 'var(--text-primary)' },
    { icon: Flame,      label: 'Current Streak', value: `${streakAnalysis.current}${streakAnalysis.currentType === 'win' ? 'W' : 'L'}`, color: streakAnalysis.currentType === 'win' ? 'var(--positive-green)' : 'var(--negative-red)' },
  ]

  const topFlag = behavioralFlags.find(f => f.severity === 'high') || behavioralFlags.find(f => f.severity === 'medium')
  const alerts = []
  if (topFlag) {
    alerts.push({
      severity: 'warning', icon: AlertTriangle, title: topFlag.title,
      text: topFlag.description.split('.').slice(0, 1).join('.') + '.',
    })
  }
  if (overallStats.winRate >= 50 && overallStats.profitFactor >= 1.5) {
    alerts.push({
      severity: 'positive', icon: CheckCircle2, title: 'Strong Performance',
      text: `${overallStats.winRate.toFixed(1)}% win rate with ${overallStats.profitFactor >= 999 ? '∞' : overallStats.profitFactor.toFixed(2)} profit factor. Your edge is working — stay consistent.`,
    })
  } else if (!topFlag) {
    alerts.push({
      severity: 'info', icon: Info, title: 'Building Your Sample',
      text: overallStats.tradeCount < 10
        ? `Only ${overallStats.tradeCount} closed trades so far — log more to sharpen every section of this analysis.`
        : `${overallStats.winRate.toFixed(1)}% win rate, ${overallStats.profitFactor >= 999 ? '∞' : overallStats.profitFactor.toFixed(2)} profit factor. Keep tightening execution to build a stronger edge.`,
    })
  }
  if (alerts.length === 1) {
    alerts.push({
      severity: 'info', icon: Shield, title: 'No Other Alerts',
      text: 'Nothing else stands out right now — keep trading and journaling to surface more signal.',
    })
  }

  const quickActions = [
    { key: 'Behavior & Discipline', icon: Flag,      title: 'Behavior & Discipline', sub: 'Flags, emotional patterns, reality check' },
    { key: 'Performance',           icon: TrendingUp, title: 'Performance',           sub: 'Streaks, benchmarks, trade quality' },
    { key: 'Risk & Sizing',         icon: Shield,     title: 'Risk & Sizing',         sub: 'Drawdown, R:R, position sizing' },
    { key: 'Patterns & Timing',     icon: Clock,      title: 'Patterns & Timing',     sub: 'Time, correlations, smart insights' },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {metrics.map(m => <MetricCard key={m.label} icon={m.icon} label={m.label} value={m.value} valueColor={m.color} />)}
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>Key Alerts</h3>
        <div className="grid md:grid-cols-2 gap-3">
          {alerts.map((a, i) => {
            const colors = { warning: 'var(--warning-orange)', positive: 'var(--positive-green)', info: 'var(--accent-purple-light)' }
            const c = colors[a.severity]
            return (
              <div key={i} className="rounded-xl p-4 flex items-start gap-3" style={{ background: `${c}0D`, border: `1px solid ${c}30` }}>
                <a.icon size={16} style={{ color: c }} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>{a.title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{a.text}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map(qa => (
            <button key={qa.key} onClick={() => onNavigate(qa.key)} className="glass-card p-4 text-left transition-transform hover:-translate-y-0.5">
              <qa.icon size={18} style={{ color: 'var(--accent-purple-light)' }} className="mb-3" />
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{qa.title}</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{qa.sub}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}