import { DollarSign, Wallet, TrendingUp, Target, Scale, TrendingDown, Sparkles } from 'lucide-react'
import { MetricCard, ProgressRow, AICard, formatPnl } from './shared'

export default function RiskSizingTab({ computed, ai }) {
  const r = computed.riskSizing
  const text = ai?.riskInsight || r.insight.text

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={DollarSign} label="Avg Risk / Trade" value={formatPnl(-Math.abs(r.avgRiskAmount))} valueColor="var(--negative-red)" sub={r.avgRiskPct != null ? `${r.avgRiskPct.toFixed(1)}% of balance` : undefined} />
        <MetricCard icon={Wallet} label="Current Balance" value={`$${r.currentBalance.toFixed(2)}`} valueColor="var(--text-primary)" />
        <MetricCard icon={TrendingUp} label="Peak Balance" value={`$${r.peakBalance.toFixed(2)}`} valueColor="var(--positive-green)" />
        <MetricCard icon={Target} label="Avg R:R" value={`${r.avgRR.toFixed(2)}:1`} valueColor={r.avgRR >= 1.5 ? 'var(--positive-green)' : 'var(--warning-orange)'} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <h4 className="font-semibold text-sm mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Scale size={14} style={{ color: 'var(--accent-purple-light)' }} /> Position Sizing Consistency
          </h4>
          <ProgressRow label="Consistency Score" value={r.sizingConsistency} color={r.sizingConsistency >= 60 ? 'var(--positive-green)' : 'var(--warning-orange)'} />
          <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
            {r.sizingConsistency >= 60 ? 'Your position sizes stay fairly steady trade to trade.' : 'Your position sizes vary significantly — standardize risk per trade to steady your equity curve.'}
          </p>
        </div>
        <div className="glass-card p-5">
          <h4 className="font-semibold text-sm mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <TrendingDown size={14} style={{ color: 'var(--negative-red)' }} /> Max Drawdown
          </h4>
          <p className="text-3xl font-black mb-1" style={{ color: r.maxDrawdownPct > 15 ? 'var(--negative-red)' : 'var(--warning-orange)' }}>{r.maxDrawdownPct.toFixed(1)}%</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Peak-to-trough decline from your equity curve.</p>
        </div>
      </div>

      {(r.avgAfterWin != null && r.avgAfterLoss != null) && (
        <div className="glass-card p-5">
          <h4 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Sizing by Outcome</h4>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Avg Size After a Win</span>
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{r.avgAfterWin.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Avg Size After a Loss</span>
              <span className="text-sm font-bold" style={{ color: r.avgAfterLoss > r.avgAfterWin * 1.1 ? 'var(--negative-red)' : 'var(--text-primary)' }}>{r.avgAfterLoss.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2">
        <Sparkles size={14} style={{ color: 'var(--accent-purple-light)' }} className="mt-1 flex-shrink-0" />
        <AICard type="RISK INSIGHTS" title={ai?.riskInsight ? 'Trado AI Says' : r.insight.title} text={text} severity={r.insight.severity} />
      </div>
    </div>
  )
}
