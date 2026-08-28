import {
  ArrowLeft, FileDown, TrendingUp, TrendingDown, DollarSign, Hash, Percent, Scale,
  ArrowUp, ArrowDown, Clock, Target, Flame, Info, AlertTriangle, Lightbulb,
  ListChecks, Sparkles, Repeat,
} from 'lucide-react'
import CircularGauge from './CircularGauge'
import PerformanceTrendChart from './PerformanceTrendChart'
import { formatPnl, pnlColor } from './shared'

const PRIORITY_COLOR = { 'Do this first': 'var(--negative-red)', 'Important': 'var(--warning-orange)', 'Nice to have': '#3B82F6' }
const SEVERITY_META = {
  warning: { color: 'var(--warning-orange)', icon: AlertTriangle, label: 'WARNING' },
  minor:   { color: '#3B82F6', icon: Info, label: 'MINOR' },
}

function formatDurationShort(seconds) {
  if (seconds == null) return '—'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem ? `${hrs}h ${rem}m` : `${hrs}h`
}

// `report` is a row from the smart_reports table: top-level columns
// (title, report_label, positive, net_pnl, trade_count, win_rate) plus
// report_data (the full snapshot of numbers + AI narrative merged together).
export default function SmartReportView({ report, onBack }) {
  const d = report.report_data || {}
  const stats = d.stats || {}
  const bannerColor = report.positive ? 'var(--positive-green)' : 'var(--warning-orange)'
  const winCount = (stats.tradeCount || 0) - Math.round(((100 - (stats.winRate || 0)) / 100) * (stats.tradeCount || 0))
  const lossCount = (stats.tradeCount || 0) - winCount

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 no-print">
        <button onClick={onBack} className="btn-outline text-xs px-3 py-2 flex items-center gap-1.5">
          <ArrowLeft size={13} /> Reports
        </button>
        <button onClick={() => window.print()} className="btn-outline text-xs px-3 py-2 flex items-center gap-1.5">
          <FileDown size={13} /> Generate PDF
        </button>
      </div>

      <div className="print-report">
        {/* ── Profitable Period banner ── */}
        <div className="rounded-xl p-5 mb-5" style={{ background: `${bannerColor}0D`, border: `1px solid ${bannerColor}30` }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${bannerColor}20` }}>
              {report.positive ? <TrendingUp size={16} style={{ color: bannerColor }} /> : <TrendingDown size={16} style={{ color: bannerColor }} />}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: bannerColor }}>{report.report_label}</p>
              <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{report.title}</h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{d.narrative}</p>
            </div>
          </div>
        </div>

        {/* ── Top stat row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <StatCard icon={TrendingUp} label="TOTAL RETURN" value={formatPnl(stats.totalPnl)} color={pnlColor(stats.totalPnl)} />
          <StatCard label="TRADES" value={stats.tradeCount} />
          <StatCard label="WIN RATE" value={`${(stats.winRate || 0).toFixed(1)}%`} color="var(--positive-green)" />
          <StatCard label="PROFIT FACTOR" value={stats.profitFactor >= 999 ? '∞' : (stats.profitFactor || 0).toFixed(2)} />
        </div>

        {/* ── Win/Loss distribution + Key metrics / trend ── */}
        <div className="grid lg:grid-cols-2 gap-3 mb-5">
          <div className="glass-card p-5">
            <p className="text-xs font-semibold mb-4 flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
              <Target size={13} style={{ color: 'var(--accent-purple-light)' }} /> WIN/LOSS DISTRIBUTION
            </p>
            <div className="flex justify-center mb-4">
              <CircularGauge pct={stats.winRate || 0} size={150} stroke={12} color="var(--positive-green)" label={formatPnl(stats.totalPnl)} sub="Net P&L" />
            </div>
            <div className="space-y-2">
              <DistRow label="Winning" count={winCount} pct={stats.winRate || 0} color="var(--positive-green)" />
              <DistRow label="Losing" count={lossCount} pct={100 - (stats.winRate || 0)} color="var(--negative-red)" />
            </div>
          </div>

          <div className="glass-card p-5">
            <p className="text-xs font-semibold mb-4 flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
              <Sparkles size={13} style={{ color: 'var(--accent-purple-light)' }} /> KEY METRICS
            </p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <CircularGauge pct={stats.winRate || 0} size={82} stroke={7} color="var(--positive-green)" label={`${(stats.winRate || 0).toFixed(0)}%`} sub="Win Rate" />
              <CircularGauge pct={Math.min(100, ((stats.profitFactor >= 999 ? 10 : stats.profitFactor || 0) / 10) * 100)} size={82} stroke={7} color="#3B82F6" label={stats.profitFactor >= 999 ? '∞' : (stats.profitFactor || 0).toFixed(2)} sub="Profit Factor" />
              <CircularGauge pct={Math.min(100, ((d.riskSizing?.avgRR || 0) / 5) * 100)} size={82} stroke={7} color="var(--warning-orange)" label={`1:${(d.riskSizing?.avgRR || 0).toFixed(1)}`} sub="Risk:Reward" />
            </div>
            <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>Performance Trend</p>
            <PerformanceTrendChart data={d.trend || []} height={160} />
          </div>
        </div>

        {/* ── Best & worst pairs ── */}
        <div className="glass-card p-5 mb-5">
          <p className="text-xs font-semibold mb-4" style={{ color: 'var(--text-muted)' }}>YOUR BEST &amp; WORST PAIRS</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--positive-green)' }}>
                <Flame size={12} /> MAKING MONEY
              </p>
              {d.bestPair ? (
                <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{d.bestPair.symbol}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{d.bestPair.count} trades</p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: 'var(--positive-green)' }}>{formatPnl(d.bestPair.pnl)}</span>
                </div>
              ) : <EmptyRow text="No pair data yet" />}
            </div>
            <div>
              <p className="text-[11px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--negative-red)' }}>
                <TrendingDown size={12} /> LOSING MONEY
              </p>
              {d.worstPair ? (
                <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{d.worstPair.symbol}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{d.worstPair.count} trades</p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: 'var(--negative-red)' }}>{formatPnl(d.worstPair.pnl)}</span>
                </div>
              ) : <EmptyRow text="No losing pairs" />}
            </div>
          </div>
        </div>

        {/* ── The Numbers ── */}
        <div className="glass-card p-5 mb-5">
          <p className="text-xs font-semibold mb-4" style={{ color: 'var(--text-muted)' }}>THE NUMBERS</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <NumberCard icon={DollarSign} label="Total P&L" value={formatPnl(stats.totalPnl)} color={pnlColor(stats.totalPnl)} />
            <NumberCard icon={Hash} label="Trades" value={stats.tradeCount} />
            <NumberCard icon={TrendingUp} label="Win Rate" value={`${(stats.winRate || 0).toFixed(0)}%`} color="var(--positive-green)" barPct={stats.winRate} />
            <NumberCard icon={Scale} label="Profit Factor" value={stats.profitFactor >= 999 ? '∞' : (stats.profitFactor || 0).toFixed(2)} color="var(--positive-green)" barPct={Math.min(100, ((stats.profitFactor >= 999 ? 10 : stats.profitFactor || 0) / 10) * 100)} />
            <NumberCard icon={ArrowUp} label="Biggest Win" value={formatPnl(stats.bestTrade)} color="var(--positive-green)" />
            <NumberCard icon={ArrowDown} label="Biggest Loss" value={formatPnl(stats.worstTrade)} color="var(--negative-red)" />
            <NumberCard icon={Target} label="Risk:Reward" value={`1:${(d.riskSizing?.avgRR || 0).toFixed(1)}`} color="var(--positive-green)" barPct={Math.min(100, ((d.riskSizing?.avgRR || 0) / 5) * 100)} />
            <NumberCard icon={Clock} label="Avg Hold" value={formatDurationShort(d.avgHoldSec)} />
          </div>
        </div>

        {/* ── Blindspots ── */}
        {d.blindspots?.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>YOUR BLINDSPOTS</p>
            <div className="space-y-3">
              {d.blindspots.map(b => {
                const candidate = (d.blindspotCandidates || []).find(c => c.id === b.id)
                if (!candidate) return null
                const meta = SEVERITY_META[candidate.severity] || SEVERITY_META.minor
                const Icon = meta.icon
                return (
                  <div key={b.id} className="glass-card p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${meta.color}18` }}>
                        <Icon size={14} style={{ color: meta.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{candidate.title}</h4>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md" style={{ color: meta.color, background: `${meta.color}18` }}>{meta.label}</span>
                        </div>
                        <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--text-secondary)' }}>{b.description}</p>
                        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Evidence: {candidate.evidence}</p>
                        {b.recommendation && (
                          <p className="text-xs leading-relaxed flex items-start gap-1.5" style={{ color: 'var(--positive-green)' }}>
                            <Lightbulb size={13} className="flex-shrink-0 mt-0.5" /> {b.recommendation}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Recurring patterns ── */}
        {d.recurringPatterns?.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>RECURRING PATTERNS</p>
            <div className="grid md:grid-cols-2 gap-3">
              {d.recurringPatterns.map(p => {
                const candidate = (d.patternCandidates || []).find(c => c.id === p.id)
                if (!candidate) return null
                return (
                  <div key={p.id} className="glass-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-sm flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                        <Repeat size={13} style={{ color: 'var(--accent-purple-light)' }} /> {candidate.title}
                      </h4>
                      <span className="text-sm font-bold" style={{ color: pnlColor(candidate.pnl) }}>{formatPnl(candidate.pnl)}</span>
                    </div>
                    <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--text-secondary)' }}>{p.description}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{candidate.evidence}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Action plan ── */}
        {d.actionPlan?.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <ListChecks size={13} /> YOUR ACTION PLAN
            </p>
            <div className="space-y-3">
              {d.actionPlan.map((item, i) => {
                const color = PRIORITY_COLOR[item.priority] || 'var(--accent-purple-light)'
                return (
                  <div key={i} className="glass-card p-4 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)' }}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{item.title}</h4>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ color, background: `${color}18` }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} /> {item.priority}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed mb-1.5" style={{ color: 'var(--text-secondary)' }}>{item.description}</p>
                      {item.measure && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Measure success: {item.measure}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-1.5 mb-2">
        {Icon && <Icon size={12} style={{ color: color || 'var(--text-muted)' }} />}
        <span className="text-[10px] font-semibold tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <p className="text-xl font-bold" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

function NumberCard({ icon: Icon, label, value, color, barPct }) {
  return (
    <div className="glass-card p-4">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-3" style={{ background: `${color || 'var(--text-muted)'}18` }}>
        <Icon size={13} style={{ color: color || 'var(--text-muted)' }} />
      </div>
      <p className="text-lg font-bold mb-0.5" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
      <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>{label}</p>
      {barPct != null && (
        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: `${Math.max(0, Math.min(100, barPct))}%`, background: color || 'var(--gradient-primary)' }} />
        </div>
      )}
    </div>
  )
}

function DistRow({ label, count, pct, color }) {
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</span>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{count}</span>
      </div>
      <span className="text-sm font-bold" style={{ color }}>{pct.toFixed(0)}%</span>
    </div>
  )
}

function EmptyRow({ text }) {
  return (
    <div className="rounded-lg p-3 text-center text-xs" style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' }}>
      {text}
    </div>
  )
}