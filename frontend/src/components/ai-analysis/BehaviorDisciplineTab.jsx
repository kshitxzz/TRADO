import { useState } from 'react'
import {
  Flag, AlertTriangle, Repeat, Brain, TrendingUp, ClipboardCheck, CheckCircle2, Rocket,
  Gauge, Skull, Flame, DollarSign, Ban, Scale, RefreshCw, GraduationCap, Sparkle,
} from 'lucide-react'
import {
  SubTabs, MetricCard, InsightCard,
  ProgressRow, GaugeBar, GradeBadge, formatPnl, pnlColor,
} from './shared'
import CoachingModal from './CoachingModal'

const FLAG_ICONS = { Repeat, Brain, TrendingUp, ClipboardCheck }

export default function BehaviorDisciplineTab({ computed }) {
  const [sub, setSub] = useState('flags')
  const tabs = [
    { key: 'flags', label: 'Behavioral Flags', icon: Flag },
    { key: 'emotional', label: 'Emotional Patterns', icon: AlertTriangle },
    { key: 'reality', label: 'Reality Check', icon: Skull },
  ]

  return (
    <div>
      <SubTabs tabs={tabs} active={sub} onChange={setSub} />
      {sub === 'flags' && <BehavioralFlagsSection computed={computed} />}
      {sub === 'emotional' && <EmotionalPatternsSection computed={computed} />}
      {sub === 'reality' && <RealityCheckSection computed={computed} />}
    </div>
  )
}

// ─── Behavioral Flags ────────────────────────────────────────────────────
function BehavioralFlagsSection({ computed }) {
  const { scalingVerdict, behavioralFlags } = computed
  const bannerColor = scalingVerdict.positive === true ? 'var(--positive-green)' : scalingVerdict.positive === false ? 'var(--warning-orange)' : 'var(--text-muted)'
  const [coachingTopic, setCoachingTopic] = useState(null)

  return (
    <div className="space-y-5">
      <div className="rounded-xl p-5" style={{ background: `${bannerColor}0D`, border: `1px solid ${bannerColor}30` }}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${bannerColor}20` }}>
            {scalingVerdict.positive === true ? <CheckCircle2 size={16} style={{ color: bannerColor }} /> : <AlertTriangle size={16} style={{ color: bannerColor }} />}
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-base mb-1.5" style={{ color: bannerColor }}>{scalingVerdict.title}</h3>
            <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>{scalingVerdict.text}</p>
            {scalingVerdict.cta && (
              <button
                onClick={() => setCoachingTopic({ key: scalingVerdict.positive ? 'scaling_guide' : 'improvement_guide', context: computed.overallStats })}
                className="text-xs font-semibold px-3.5 py-2 rounded-lg" style={{ background: `${bannerColor}18`, color: bannerColor, border: `1px solid ${bannerColor}40` }}>
                {scalingVerdict.title.includes('Profitable') ? '🚀' : ''} {scalingVerdict.cta}
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Flag size={14} style={{ color: 'var(--warning-orange)' }} />
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Behavioural Flags</h3>
        </div>

        {behavioralFlags.length === 0 ? (
          <div className="glass-card p-6 text-center">
            <CheckCircle2 size={22} className="mx-auto mb-2" style={{ color: 'var(--positive-green)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No behavioral red flags detected yet — keep trading to build a bigger sample.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {behavioralFlags.map(f => {
              const Icon = FLAG_ICONS[f.icon] || Flag
              const color = f.severity === 'high' ? '#F97316' : f.severity === 'medium' ? '#EAB308' : f.severity === 'positive' ? 'var(--positive-green)' : 'var(--warning-orange)'
              return (
                <div key={f.id} className="glass-card p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}18` }}>
                      <Icon size={16} style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <h4 className="font-bold text-sm" style={{ color }}>{f.title}</h4>
                        {f.badge && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{f.badge}</span>}
                      </div>
                      <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>{f.description}</p>
                      {f.examples.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {f.examples.map((ex, i) => (
                            <span key={i} className="text-[11px] px-2.5 py-1 rounded-md" style={{ background: `${color}12`, color, border: `1px solid ${color}30` }}>{ex}</span>
                          ))}
                        </div>
                      )}
                      {f.cta && (
                        <button
                          onClick={() => setCoachingTopic({ key: f.id, context: f })}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}>
                          {f.cta} →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <CoachingModal topic={coachingTopic} onClose={() => setCoachingTopic(null)} />
    </div>
  )
}

// ─── Emotional Patterns ──────────────────────────────────────────────────
function EmotionalPatternsSection({ computed }) {
  const ep = computed.emotionalPatterns

  return (
    <div className="space-y-5">
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Gauge size={16} style={{ color: ep.tiltColor }} />
            <div>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Tilt Risk Score</h3>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Real-time emotional state assessment</p>
            </div>
          </div>
          <span className="text-2xl font-black" style={{ color: ep.tiltColor }}>{ep.tiltScore}</span>
        </div>
        <div className="mt-4">
          <GaugeBar value={ep.tiltScore} stops={['#22C55E', '#22C55E 30%', '#D97706 30%', '#D97706 60%', '#DC2626 60%', '#DC2626']} labels={['0 - Calm', '30 - Caution', '60 - Warning', '100 - Tilt']} />
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mt-5">
          <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Losing Streak</span>
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{ep.losingStreak}</span>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>+20 pts per loss (max 60)</p>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Size Increase</span>
              <span className="text-sm font-bold" style={{ color: ep.sizeIncreaseAfterLoss ? 'var(--warning-orange)' : 'var(--text-primary)' }}>{ep.sizeIncreaseAfterLoss ? 'Yes' : 'No'}</span>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>+20 pts if sizing up after loss</p>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Overtrading</span>
              <span className="text-sm font-bold" style={{ color: ep.overtradingToday ? 'var(--warning-orange)' : 'var(--text-primary)' }}>{ep.overtradingToday ? 'Yes' : 'No'}</span>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>+20 pts if 2x avg trades today</p>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={Repeat} label="Revenge Trades" value={ep.revengeTrades} sub="trades within 10min of loss" />
        <MetricCard icon={DollarSign} label="Revenge Trade P&L" value={formatPnl(ep.revengeTradePnl)} valueColor={pnlColor(ep.revengeTradePnl)} sub="total from revenge trades" />
        <MetricCard icon={AlertTriangle} label="Overtrading Days" value={ep.overtradingDays} sub={`of ${ep.totalTradingDays} days`} />
        <MetricCard icon={TrendingUp} label="Avg Recovery" value={ep.avgRecoveryTrades != null ? ep.avgRecoveryTrades.toFixed(1) : '—'} sub="trades to recover" />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <MetricCard icon={Gauge} label="Avg Trades/Day" value={ep.avgTradesPerDay.toFixed(1)} sub="average activity" />
        <MetricCard icon={AlertTriangle} label="Overtrading Rate" value={`${ep.overtradingRate.toFixed(0)}%`} sub="days with excessive trades" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <h4 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>Post-Loss Behavior</h4>
          {ep.postLoss ? (
            <div className="space-y-3">
              <ProgressRow label="Trade Size After Loss" value={ep.postLoss.sizeChangePct ?? 0} max={50} color={ep.postLoss.sizeChangePct > 10 ? 'var(--negative-red)' : 'var(--positive-green)'} suffix="%" />
              <ProgressRow label="Win Rate After Loss" value={ep.postLoss.winRate} color={ep.postLoss.winRate >= 50 ? 'var(--positive-green)' : 'var(--negative-red)'} />
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Time to Next Trade</span>
                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{ep.postLoss.avgGapMin != null ? `${ep.postLoss.avgGapMin.toFixed(0)} min avg` : '—'}</span>
              </div>
            </div>
          ) : <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Not enough losing trades yet to analyze post-loss behavior.</p>}
        </div>
        <div className="glass-card p-5">
          <h4 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>Winning Streak Behavior</h4>
          {ep.winStreak.count > 0 ? (
            <div className="space-y-3">
              <ProgressRow label="Trade Size During Streak" value={ep.winStreak.sizeChangePct ?? 0} max={50} color="var(--positive-green)" suffix="%" />
              <ProgressRow label="Win Rate During Streak" value={ep.winStreak.winRate ?? 0} color="var(--positive-green)" />
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Max Consecutive Wins</span>
                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{ep.winStreak.maxConsecutiveWins} trades</span>
              </div>
            </div>
          ) : <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Not enough streak data yet.</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Reality Check ───────────────────────────────────────────────────────
function RealityCheckSection({ computed }) {
  const rc = computed.realityCheck

  return (
    <div className="space-y-4">
      <div className="glass-card p-5 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(244,63,94,0.14)' }}>
            <Skull size={18} style={{ color: 'var(--negative-red)' }} />
          </div>
          <div>
            <h3 className="font-bold text-base" style={{ color: 'var(--negative-red)' }}>Reality Check</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>The hard truths about your trading. No sugar coating.</p>
          </div>
        </div>
        <div className="flex items-center gap-5 rounded-xl px-4 py-2" style={{ border: '1px solid var(--border-subtle)' }}>
          <div className="text-right">
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Total P&L</p>
            <p className="text-sm font-bold" style={{ color: pnlColor(rc.totalPnl) }}>{formatPnl(rc.totalPnl)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Score</p>
            <p className="text-sm font-bold" style={{ color: 'var(--positive-green)' }}>{rc.overallScore}%</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <InsightCard icon={Flame} color="var(--negative-red)" badge="TILT TAX" value={formatPnl(-Math.abs(rc.tiltTax))} valueColor={rc.tiltTax > 0 ? 'var(--negative-red)' : 'var(--positive-green)'}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {rc.revengeCount > 0 ? <><span style={{ color: 'var(--negative-red)' }}>●</span> Lost from {rc.revengeCount} revenge trade{rc.revengeCount === 1 ? '' : 's'}</> : 'No revenge-trade losses detected'}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Within 10min of a loss</p>
        </InsightCard>

        <InsightCard icon={DollarSign} color="var(--warning-orange)" badge="HOURLY WAGE"
          value={rc.hourlyWage != null ? <>{formatPnl(rc.hourlyWage).replace('+','')}<span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>/hr</span></> : '—'}
          valueColor={rc.hourlyWage != null ? pnlColor(rc.hourlyWage) : 'var(--text-primary)'}
          sub={`Based on ~${rc.totalHours.toFixed(0)} hours`} />

        <InsightCard icon={Ban} color="var(--accent-purple-light)" badge="WHAT IF">
          <p className="text-base font-bold" style={{ color: rc.noLosingPatterns ? 'var(--positive-green)' : 'var(--text-primary)' }}>
            {rc.noLosingPatterns ? 'No losing patterns!' : `Without revenge trades: ${formatPnl(rc.whatIfPnl)}`}
          </p>
        </InsightCard>

        <InsightCard icon={Scale} color="var(--accent-teal)" badge="LUCK VS SKILL">
          <ProgressRow label="Skill" value={rc.skillPct} color="var(--positive-green)" />
          <div className="mt-3"><ProgressRow label="Luck/Variance" value={rc.luckPct} color="var(--accent-teal)" /></div>
        </InsightCard>

        <InsightCard icon={RefreshCw} color="var(--warning-orange)" badge="RECOVERY HOLE"
          value={rc.recoveryTrades != null ? <>{rc.recoveryTrades.toFixed(1)}<span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}> trades</span></> : '—'}
          sub="Needed to recover each loss">
          <div className="flex gap-2 mt-2">
            <span className="text-[11px] px-2 py-0.5 rounded-md" style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--positive-green)' }}>Win: {formatPnl(rc.avgWinAmt).replace('+','')}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-md" style={{ background: 'rgba(244,63,94,0.12)', color: 'var(--negative-red)' }}>Loss: {formatPnl(-Math.abs(rc.avgLossAmt)).replace('-','')}</span>
          </div>
        </InsightCard>

        <InsightCard icon={Flag} color="var(--negative-red)" badge="GAMBLING SCORE"
          value={<>{rc.gamblingScore}<span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>/100</span></>}>
          <div className="progress-bar-track mt-1"><div className="progress-bar-fill" style={{ width: `${rc.gamblingScore}%`, background: rc.gamblingScore <= 30 ? 'var(--positive-green)' : rc.gamblingScore <= 60 ? 'var(--warning-orange)' : 'var(--negative-red)' }} /></div>
          <p className="text-xs mt-2" style={{ color: rc.gamblingScore <= 30 ? 'var(--positive-green)' : 'var(--warning-orange)' }}>{rc.gamblingLabel}</p>
        </InsightCard>
      </div>

      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <GraduationCap size={16} style={{ color: 'var(--accent-purple-light)' }} />
          <div>
            <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Trading Report Card</h4>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Performance across key areas</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-6 justify-around">
          {rc.reportCard.map(r => <GradeBadge key={r.key} grade={r.grade} label={r.label} sub={`${r.pct.toFixed(0)}%`} />)}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <InsightCard icon={Sparkle} color="var(--accent-purple-light)" badge="BLIND SPOTS">
          {rc.blindSpots.length === 0 ? (
            <div className="text-center py-2">
              <CheckCircle2 size={20} className="mx-auto mb-2" style={{ color: 'var(--positive-green)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--positive-green)' }}>No blind spots!</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {rc.blindSpots.map((b, i) => <li key={i} className="text-xs" style={{ color: 'var(--warning-orange)' }}>{b}</li>)}
            </ul>
          )}
        </InsightCard>

        <InsightCard icon={CheckCircle2} color={rc.breakEven.profitable ? 'var(--positive-green)' : 'var(--negative-red)'} badge="BREAK-EVEN">
          <p className="text-lg font-bold" style={{ color: rc.breakEven.profitable ? 'var(--positive-green)' : 'var(--negative-red)' }}>{rc.breakEven.profitable ? 'Profitable!' : 'Underwater'}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{rc.breakEven.profitable ? "You're up" : "You're down"} {formatPnl(rc.breakEven.amount)}</p>
        </InsightCard>

        <InsightCard icon={Scale} color="var(--accent-purple-light)" badge={`VS PROS ${rc.vsProsScore}%`}>
          <div className="space-y-2">
            <VsProsRow label="Win Rate (≥50%)" yours={`${rc.vsPros.winRate.yours.toFixed(1)}%`} pass={rc.vsPros.winRate.pass} />
            <VsProsRow label="Profit Factor (≥1.5)" yours={rc.vsPros.profitFactor.yours >= 999 ? '∞' : rc.vsPros.profitFactor.yours.toFixed(2)} pass={rc.vsPros.profitFactor.pass} />
            <VsProsRow label="R:R (≥1.5)" yours={rc.vsPros.rr.yours.toFixed(2)} pass={rc.vsPros.rr.pass} />
            <VsProsRow label="Risk/Trade (≤2%)" yours={rc.vsPros.riskPerTrade.yours != null ? `${rc.vsPros.riskPerTrade.yours.toFixed(1)}%` : '—'} pass={rc.vsPros.riskPerTrade.pass} />
          </div>
        </InsightCard>
      </div>
    </div>
  )
}

function VsProsRow({ label, yours, pass }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-xs font-bold" style={{ color: pass == null ? 'var(--text-muted)' : pass ? 'var(--positive-green)' : 'var(--negative-red)' }}>{yours}</span>
    </div>
  )
}