import { useState } from 'react'
import {
  TrendingUp, Target, BarChart3, Flame, ClipboardList, Sparkles,
  CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { MetricCard, SubTabs, AICard, AIUnavailableBanner, formatPnl, pnlColor } from './shared'

export default function PerformanceTab({ computed, ai, aiLoading }) {
  const [sub, setSub] = useState('streaks')
  const tabs = [
    { key: 'streaks', label: 'Streak Analysis', icon: Flame },
    { key: 'benchmarks', label: 'Performance Benchmarks', icon: Target },
    { key: 'quality', label: 'Trade Quality', icon: ClipboardList },
  ]

  return (
    <div>
      <SubTabs tabs={tabs} active={sub} onChange={setSub} />
      {sub === 'streaks' && <StreakSection computed={computed} ai={ai} />}
      {sub === 'benchmarks' && <BenchmarksSection computed={computed} ai={ai} />}
      {sub === 'quality' && <QualitySection computed={computed} ai={ai} aiLoading={aiLoading} />}
    </div>
  )
}

// ─── Streak Analysis ────────────────────────────────────────────────────
function StreakSection({ computed, ai }) {
  const s = computed.streakAnalysis
  const text = ai?.streakInsight || `Your best win streak is ${s.best} trades, your worst losing streak is ${s.worst}. Average streak length runs ${s.avgStreakLength.toFixed(1)} trades — ${s.avgStreakLength >= 3 ? 'you tend to ride momentum in either direction' : 'your results flip frequently trade to trade'}.`

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={Flame} label="Current Streak" value={`${s.current} ${s.currentType === 'win' ? 'Win' : 'Loss'}${s.current === 1 ? '' : 's'}`} valueColor={s.currentType === 'win' ? 'var(--positive-green)' : 'var(--negative-red)'} />
        <MetricCard icon={TrendingUp} label="Best Win Streak" value={`${s.best} Trades`} valueColor="var(--positive-green)" />
        <MetricCard icon={AlertTriangle} label="Worst Loss Streak" value={`${s.worst} Trades`} valueColor="var(--negative-red)" />
        <MetricCard icon={BarChart3} label="Avg Streak Length" value={`${s.avgStreakLength.toFixed(1)} Trades`} />
      </div>

      <div className="glass-card p-5">
        <h4 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Recent Trade Sequence</h4>
        {s.sequence.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No closed trades yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {s.sequence.map((t, i) => (
              <div key={i} title={`${t.symbol} ${formatPnl(t.pnl)}`}
                className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold text-white"
                style={{ background: t.result === 'W' ? 'var(--positive-green)' : 'var(--negative-red)', opacity: 0.55 + (i / s.sequence.length) * 0.45 }}>
                {t.result}
              </div>
            ))}
          </div>
        )}
      </div>

      <AICard type="AI STREAK INSIGHT" title="Reading Your Streaks" text={text} severity="info" />
    </div>
  )
}

// ─── Performance Benchmarks ─────────────────────────────────────────────
function BenchmarksSection({ computed }) {
  const b = computed.performanceBenchmarks

  return (
    <div className="space-y-5">
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Benchmark Score</h4>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>How you stack up against standard professional thresholds</p>
          </div>
          <span className="text-2xl font-black" style={{ color: b.score >= 75 ? 'var(--positive-green)' : b.score >= 50 ? 'var(--warning-orange)' : 'var(--negative-red)' }}>{b.score}%</span>
        </div>
        <div className="progress-bar-track" style={{ height: 8 }}>
          <div className="progress-bar-fill" style={{ width: `${b.score}%`, background: b.score >= 75 ? 'var(--positive-green)' : b.score >= 50 ? 'var(--warning-orange)' : 'var(--negative-red)' }} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {b.benchmarks.map(row => (
          <div key={row.key} className="glass-card p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{row.label}</p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Target: {row.target}{row.unit}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold" style={{ color: row.pass ? 'var(--positive-green)' : 'var(--negative-red)' }}>
                {typeof row.yours === 'number' ? row.yours.toFixed(row.unit === 'x' || row.unit === ':1' ? 2 : 1) : row.yours}{row.unit}
              </span>
              {row.pass ? <CheckCircle2 size={16} style={{ color: 'var(--positive-green)' }} /> : <AlertTriangle size={16} style={{ color: 'var(--negative-red)' }} />}
            </div>
          </div>
        ))}
      </div>

      <AICard type={b.insight.severity.toUpperCase()} title={b.insight.title} text={b.insight.text} severity={b.insight.severity} />
    </div>
  )
}

// ─── Trade Quality ───────────────────────────────────────────────────────
function QualitySection({ computed, ai, aiLoading }) {
  const q = computed.tradeQuality
  const color = q.avgScore >= 80 ? 'var(--positive-green)' : q.avgScore >= 60 ? '#3B82F6' : q.avgScore >= 40 ? 'var(--warning-orange)' : 'var(--negative-red)'
  const maxCount = Math.max(1, ...q.distribution.map(d => d.count))

  if (!q.recentScores.length) {
    return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Log or sync closed trades to unlock AI-scored trade quality.</p>
  }

  return (
    <div className="space-y-5">
      <div className="glass-card p-6 text-center">
        <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Average Quality Score</p>
        <p className="text-5xl font-black mb-1" style={{ color }}>{q.avgScore}</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>across {q.scoredCount} scored trades · Profitability 30 + Execution 40 + Journal 20 + Rating 10</p>
      </div>

      <div className="glass-card p-5">
        <h4 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Score Distribution</h4>
        <div className="flex items-end gap-3 h-32">
          {q.distribution.map(d => {
            const bandColor = d.min >= 81 ? 'var(--positive-green)' : d.min >= 41 ? 'var(--warning-orange)' : 'var(--negative-red)'
            return (
              <div key={d.label} className="flex-1 flex flex-col items-center justify-end h-full">
                <span className="text-xs font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{d.count}</span>
                <div className="w-full rounded-t-md" style={{ height: `${Math.max(4, (d.count / maxCount) * 100)}%`, background: bandColor, opacity: 0.85 }} />
                <span className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>{d.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="glass-card p-5 overflow-x-auto">
        <h4 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Recent Trade Scores</h4>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              <th className="text-left font-medium pb-2">Date</th>
              <th className="text-left font-medium pb-2">Symbol</th>
              <th className="text-left font-medium pb-2">Score</th>
              <th className="text-right font-medium pb-2">P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {q.recentScores.map(r => (
              <tr key={r.id} className="table-row-hover" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <td className="py-2" style={{ color: 'var(--text-secondary)' }}>{r.date}</td>
                <td className="py-2 font-medium" style={{ color: 'var(--text-primary)' }}>{r.symbol}</td>
                <td className="py-2">
                  <span className="font-bold px-2 py-0.5 rounded-md text-[11px]" style={{ color: r.color, background: `${r.color}18` }}>{r.score} · {r.band}</span>
                </td>
                <td className="py-2 text-right font-medium" style={{ color: pnlColor(r.pnl) }}>{formatPnl(r.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {q.commonIssues.length > 0 && (
        <div className="glass-card p-5">
          <h4 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Common Issues</h4>
          <div className="space-y-3">
            {q.commonIssues.map(issue => (
              <div key={issue.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{issue.label}</span>
                  <span className="text-xs font-bold" style={{ color: 'var(--warning-orange)' }}>{issue.missRate}% missed</span>
                </div>
                <div className="progress-bar-track"><div className="progress-bar-fill" style={{ width: `${issue.missRate}%`, background: 'var(--warning-orange)' }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} style={{ color: 'var(--accent-purple-light)' }} />
          <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Quality Insights</h4>
        </div>
        {ai && ai.aiAvailable === false && <AIUnavailableBanner message={ai.message} />}
        <div className="grid md:grid-cols-2 gap-3">
          {(ai?.qualityInsights?.length ? ai.qualityInsights : fallbackQualityInsights(q)).map((c, i) => (
            <AICard key={i} title={c.title} text={c.text} severity={c.severity} />
          ))}
          {aiLoading && !ai && [0, 1].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
      </div>
    </div>
  )
}

function fallbackQualityInsights(q) {
  const cards = []
  if (q.trend) {
    cards.push(q.trend.improving
      ? { severity: 'positive', title: 'Improving Over Time', text: `Your quality score rose from ${q.trend.firstAvg} to ${q.trend.secondAvg} across your trade history — your process is getting more consistent.` }
      : { severity: 'warning', title: 'Quality Trending Down', text: `Your quality score slipped from ${q.trend.firstAvg} to ${q.trend.secondAvg} — revisit what changed in your recent process.` })
  }
  if (q.commonIssues.length) {
    const top = q.commonIssues[0]
    cards.push({ severity: 'warning', title: 'Common Issue', text: `"${top.label}" is missed on ${top.missRate}% of journaled trades (${top.missed}/${top.total}) — the single fastest fix available to you.` })
  }
  if (!cards.length) cards.push({ severity: 'info', title: 'Keep Journaling', text: 'Log your execution checklist on every trade to unlock deeper quality insights here.' })
  return cards
}