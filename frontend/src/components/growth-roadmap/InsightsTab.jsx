import { Lightbulb, CheckCircle2, AlertTriangle, Trophy } from 'lucide-react'
import { CircularProgress, ProgressRow } from './shared'

export default function InsightsTab({ overview, strengthsWeaknesses }) {
  const { healthScore, stats, avgRR } = overview
  const { strengths, weaknesses } = strengthsWeaknesses

  return (
    <div className="space-y-5">
      <div className="glass-card p-6 flex items-center gap-8 flex-wrap">
        <CircularProgress value={healthScore} size={110} color="var(--positive-green)" label="Trading Health" />
        <div className="flex-1 min-w-[240px] space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb size={14} style={{ color: 'var(--accent-purple-light)' }} />
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Performance Breakdown</h3>
          </div>
          <ProgressRow label="Win Rate" value={stats.winRate} max={100} color="var(--positive-green)" display={`${stats.winRate.toFixed(1)}%`} />
          <ProgressRow label="Profit Factor" value={Math.min(stats.profitFactor, 3)} max={3} color="var(--positive-green)" display={stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2)} />
          <ProgressRow label="Risk/Reward" value={Math.min(avgRR, 2.5)} max={2.5} color="var(--positive-green)" display={`${avgRR.toFixed(2)}R`} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.14)' }}>
              <CheckCircle2 size={14} style={{ color: 'var(--positive-green)' }} />
            </div>
            <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Your Strengths</h4>
          </div>
          {strengths.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Keep trading to surface your strengths here.</p>
          ) : (
            <div className="space-y-2">
              {strengths.map((s, i) => (
                <div key={i} className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--positive-green)' }}>{s.title}</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{s.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: weaknesses.length ? 'rgba(244,63,94,0.14)' : 'rgba(34,197,94,0.14)' }}>
              <AlertTriangle size={14} style={{ color: weaknesses.length ? 'var(--negative-red)' : 'var(--positive-green)' }} />
            </div>
            <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Areas to Improve</h4>
          </div>
          {weaknesses.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <Trophy size={14} style={{ color: 'var(--positive-green)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--positive-green)' }}>Great job! No major weaknesses detected.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {weaknesses.map((w, i) => (
                <div key={i} className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--negative-red)' }}>{w.title}</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{w.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}