import {
  ArrowLeft, FileDown, TrendingUp, TrendingDown, DollarSign, Hash, Scale,
  ArrowUp, ArrowDown, Clock, Target, Flame, Info, AlertTriangle, Lightbulb,
  ListChecks, Repeat, ShieldCheck, CalendarDays,
} from 'lucide-react'
import CircularGauge from '../../ai-analysis/CircularGauge'
import { formatPnl, pnlColor } from '../../ai-analysis/shared'
import { gradeColor } from '../../../lib/analytics'

const PRIORITY_COLOR = { 'Do this first': 'var(--negative-red)', 'Important': 'var(--warning-orange)', 'Nice to have': '#3B82F6' }
const SEVERITY_META = {
  warning: { color: 'var(--warning-orange)', icon: AlertTriangle, label: 'WARNING' },
  minor:   { color: '#3B82F6', icon: Info, label: 'MINOR' },
}
const RISK_DIMENSIONS = [
  { key: 'emotional',   label: 'Emotional Control' },
  { key: 'sizing',      label: 'Sizing Discipline' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'discipline',  label: 'Process Discipline' },
]

// `report` is a row from the weekly_reports table: top-level columns
// (title, report_label, positive, net_pnl, trade_count, win_rate, grade)
// plus report_data (the full snapshot of numbers + AI narrative merged
// together at generation time — this view never recomputes anything).
export default function WeeklyReportView({ report, onBack }) {
  const d = report.report_data || {}
  const week = d.week || {}
  const risk = d.risk || {}
  const delta = d.delta || {}
  const bannerColor = report.positive ? 'var(--positive-green)' : 'var(--warning-orange)'
  const grade = report.grade || week.grade

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 no-print">
        <button onClick={onBack} className="btn-outline text-xs px-3 py-2 flex items-center gap-1.5">
          <ArrowLeft size={13} /> Weekly Reports
        </button>
        <button onClick={() => window.print()} className="btn-outline text-xs px-3 py-2 flex items-center gap-1.5">
          <FileDown size={13} /> Generate PDF
        </button>
      </div>

      <div className="print-report">
        {/* ── Banner ── */}
        <div className="rounded-xl p-5 mb-5" style={{ background: `${bannerColor}0D`, border: `1px solid ${bannerColor}30` }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${bannerColor}20` }}>
              {report.positive ? <TrendingUp size={16} style={{ color: bannerColor }} /> : <TrendingDown size={16} style={{ color: bannerColor }} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: bannerColor }}>{report.report_label}</p>
                <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  <CalendarDays size={10} /> {d.rangeLabel || report.range_label}
                </span>
              </div>
              <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{report.title}</h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{d.narrative}</p>
            </div>
            {grade && (
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-lg" style={{ background: `${gradeColor(grade)}18`, color: gradeColor(grade) }}>
                {grade}
              </div>
            )}
          </div>
        </div>

        {/* ── Top stat row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <StatCard icon={TrendingUp} label="THIS WEEK'S P&L" value={formatPnl(week.totalPnl)} color={pnlColor(week.totalPnl)} />
          <StatCard label="TRADES" value={week.tradeCount} />
          <StatCard label="WIN RATE" value={`${(week.winRate || 0).toFixed(1)}%`} color="var(--positive-green)" />
          <StatCard label="PROFIT FACTOR" value={week.profitFactor >= 999 ? '∞' : (week.profitFactor || 0).toFixed(2)} />
        </div>

        {/* ── Compared to last week ── */}
        <div className="glass-card p-5 mb-5">
          <p className="text-xs font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
            <Repeat size={13} style={{ color: 'var(--accent-purple-light)' }} /> COMPARED TO LAST WEEK
          </p>
          <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>{d.comparedToLastWeek}</p>
          {d.hasPrev && (
            <div className="grid grid-cols-2 gap-3">
              <DeltaRow label="P&L change" value={delta.pnlDeltaPct} suffix="%" />
              <DeltaRow label="Win rate change" value={delta.wrDeltaPts} suffix="pp" />
            </div>
          )}
        </div>

        {/* ── Grade & risk breakdown ── */}
        <div className="grid lg:grid-cols-2 gap-3 mb-5">
          <div className="glass-card p-5">
            <p className="text-xs font-semibold mb-4 flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
              <ShieldCheck size={13} style={{ color: 'var(--accent-purple-light)' }} /> PROCESS GRADE
            </p>
            <div className="flex justify-center mb-2">
              <CircularGauge pct={week.processScore || 0} size={150} stroke={12} color={gradeColor(grade || 'C')} label={grade || '—'} sub={`${week.processScore || 0}/100`} />
            </div>
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>Reflects discipline, sizing, consistency &amp; emotional control this week — not just P&amp;L.</p>
          </div>

          <div className="glass-card p-5">
            <p className="text-xs font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>RISK &amp; DISCIPLINE THIS WEEK</p>
            <div className="space-y-3 mb-4">
              {RISK_DIMENSIONS.map(dim => (
                <div key={dim.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{dim.label}</span>
                    <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{risk[dim.key] ?? 0}</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{
                      width: `${Math.max(0, Math.min(100, risk[dim.key] || 0))}%`,
                      background: (risk[dim.key] || 0) >= 70 ? 'var(--positive-green)' : (risk[dim.key] || 0) >= 45 ? 'var(--warning-orange)' : 'var(--negative-red)',
                    }} />
                  </div>
                </div>
              ))}
            </div>
            {(d.riskNarrative?.strengths?.length > 0 || d.riskNarrative?.areasToImprove?.length > 0) && (
              <div className="space-y-1.5 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                {d.riskNarrative.strengths?.map((s, i) => (
                  <p key={`s${i}`} className="text-xs leading-relaxed flex items-start gap-1.5" style={{ color: 'var(--positive-green)' }}>
                    <TrendingUp size={12} className="flex-shrink-0 mt-0.5" /> {s}
                  </p>
                ))}
                {d.riskNarrative.areasToImprove?.map((s, i) => (
                  <p key={`a${i}`} className="text-xs leading-relaxed flex items-start gap-1.5" style={{ color: 'var(--warning-orange)' }}>
                    <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" /> {s}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Best/worst symbol + top session ── */}
        <div className="glass-card p-5 mb-5">
          <p className="text-xs font-semibold mb-4" style={{ color: 'var(--text-muted)' }}>THIS WEEK'S SYMBOLS &amp; SESSIONS</p>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--positive-green)' }}>
                <Flame size={12} /> BEST SYMBOL
              </p>
              {d.bestPair ? (
                <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{d.bestPair.symbol}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{d.bestPair.count} trades</p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: 'var(--positive-green)' }}>{formatPnl(d.bestPair.pnl)}</span>
                </div>
              ) : <EmptyRow text="No symbol data" />}
            </div>
            <div>
              <p className="text-[11px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--negative-red)' }}>
                <TrendingDown size={12} /> WORST SYMBOL
              </p>
              {d.worstPair ? (
                <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{d.worstPair.symbol}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{d.worstPair.count} trades</p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: 'var(--negative-red)' }}>{formatPnl(d.worstPair.pnl)}</span>
                </div>
              ) : <EmptyRow text="No losing symbols" />}
            </div>
            <div>
              <p className="text-[11px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--accent-purple-light)' }}>
                <Clock size={12} /> TOP SESSION
              </p>
              {d.topSession ? (
                <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{d.topSession.session}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{(d.sessionDominancePct || 0).toFixed(0)}% of volume</p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: pnlColor(d.topSession.pnl) }}>{formatPnl(d.topSession.pnl)}</span>
                </div>
              ) : <EmptyRow text="No session data" />}
            </div>
          </div>
        </div>

        {/* ── The Numbers ── */}
        <div className="glass-card p-5 mb-5">
          <p className="text-xs font-semibold mb-4" style={{ color: 'var(--text-muted)' }}>THE NUMBERS</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <NumberCard icon={DollarSign} label="Total P&L" value={formatPnl(week.totalPnl)} color={pnlColor(week.totalPnl)} />
            <NumberCard icon={Hash} label="Trades" value={week.tradeCount} />
            <NumberCard icon={TrendingUp} label="Win Rate" value={`${(week.winRate || 0).toFixed(0)}%`} color="var(--positive-green)" barPct={week.winRate} />
            <NumberCard icon={Scale} label="Profit Factor" value={week.profitFactor >= 999 ? '∞' : (week.profitFactor || 0).toFixed(2)} color="var(--positive-green)" barPct={Math.min(100, ((week.profitFactor >= 999 ? 10 : week.profitFactor || 0) / 10) * 100)} />
            <NumberCard icon={ArrowUp} label="Biggest Win" value={formatPnl(week.bestTrade)} color="var(--positive-green)" />
            <NumberCard icon={ArrowDown} label="Biggest Loss" value={formatPnl(week.worstTrade)} color="var(--negative-red)" />
            <NumberCard icon={Target} label="Risk:Reward" value={`1:${(week.rr || 0).toFixed(1)}`} color="var(--positive-green)" barPct={Math.min(100, ((week.rr || 0) / 5) * 100)} />
            <NumberCard icon={CalendarDays} label="Best Day" value={week.bestDay ? formatPnl(week.bestDay.pnl) : '—'} color={week.bestDay ? pnlColor(week.bestDay.pnl) : undefined} />
          </div>
        </div>

        {/* ── Blindspots ── */}
        {d.blindspots?.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>YOUR BLINDSPOTS THIS WEEK</p>
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
            <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>RECURRING PATTERNS THIS WEEK</p>
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
                      {candidate.pnl != null && <span className="text-sm font-bold" style={{ color: pnlColor(candidate.pnl) }}>{formatPnl(candidate.pnl)}</span>}
                    </div>
                    <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--text-secondary)' }}>{p.description}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{candidate.evidence}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Plan for next week ── */}
        {d.planForNextWeek?.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <ListChecks size={13} /> PLAN FOR NEXT WEEK
            </p>
            <div className="space-y-3">
              {d.planForNextWeek.map((item, i) => {
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
                      {item.targetMetric && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Target for next week: {item.targetMetric}</p>}
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

function DeltaRow({ label, value, suffix }) {
  if (value == null) return null
  const positive = value >= 0
  const color = positive ? 'var(--positive-green)' : 'var(--negative-red)'
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="text-sm font-bold flex items-center gap-1" style={{ color }}>
        {positive ? <ArrowUp size={12} /> : <ArrowDown size={12} />} {positive ? '+' : ''}{value.toFixed(1)}{suffix}
      </span>
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