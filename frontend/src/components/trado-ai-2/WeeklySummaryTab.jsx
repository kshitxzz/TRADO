import { useState, useEffect } from 'react'
import {
  ChevronLeft, ChevronRight, CalendarDays, Loader2, Sparkles, DollarSign, Hash, Percent, Scale,
  Trophy, Flame, Target, BarChart3, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { computeWeeklySummaryBundle, profitFactorLabel, gradeColor } from '../../lib/analytics'
import { formatPnl, pnlColor } from '../ai-analysis/shared'
import WeeklyReportsHub from './weekly-analysis/WeeklyReportsHub'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

function stripWeek(w) {
  if (!w) return null
  const { trades, range, ...rest } = w
  return rest
}
function formatDeltaPct(v) {
  if (v == null) return null
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}
function formatDeltaPts(v) {
  if (v == null) return null
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}pp`
}
function formatDurationMin(mins) {
  if (mins == null) return '—'
  if (mins < 60) return `${Math.round(mins)}m`
  const h = Math.floor(mins / 60), m = Math.round(mins % 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

// Deterministic Weekly Summary dashboard + an auto-loaded "AI take" on the
// week (computeWeeklySummaryBundle does all the math; Gemini only narrates
// it via /api/ai/weekly-narrative) + the on-demand, saved AI Weekly
// Analysis report (WeeklyReportsHub) at the bottom.
export default function WeeklySummaryTab({ trades = [], accountBalance = null, accountId }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const bundle = computeWeeklySummaryBundle(trades, weekOffset)
  const { week, prevWeek, hasPrev, delta, grade, rangeLabel, isCurrentWeek } = bundle

  const [ai, setAi] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    if (!week.tradeCount) { setAi(null); setAiLoading(false); return }
    setAiLoading(true)
    setAi(null)
    const context = {
      rangeLabel, isCurrentWeek,
      week: stripWeek(week), prevWeek: hasPrev ? stripWeek(prevWeek) : null,
      hasPrev, delta, grade, processScore: bundle.processScore,
    }
    fetch(`${BACKEND}/api/ai/weekly-narrative`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context }),
    })
      .then(r => r.json())
      .then(data => setAi(data.aiAvailable ? data : null))
      .catch(() => setAi(null))
      .finally(() => setAiLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, trades.length])

  return (
    <div>
      {/* ── Header + week nav ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.12)' }}>
            <CalendarDays size={17} style={{ color: 'var(--accent-purple-light)' }} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Weekly Summary</h3>
              {grade && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: gradeColor(grade), background: `${gradeColor(grade)}18` }}>{grade}</span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {rangeLabel} {isCurrentWeek && <span style={{ color: 'var(--accent-purple-light)' }}>(Current Week)</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset(o => o - 1)} className="btn-outline w-8 h-8 flex items-center justify-center p-0" title="Previous week">
            <ChevronLeft size={14} />
          </button>
          {!isCurrentWeek && (
            <button onClick={() => setWeekOffset(0)} className="btn-outline text-xs px-3 py-2">Today</button>
          )}
          <button
            onClick={() => setWeekOffset(o => Math.min(0, o + 1))}
            disabled={isCurrentWeek}
            className="btn-outline w-8 h-8 flex items-center justify-center p-0"
            style={{ opacity: isCurrentWeek ? 0.4 : 1, cursor: isCurrentWeek ? 'default' : 'pointer' }}
            title="Next week"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {week.tradeCount === 0 ? (
        <div className="glass-card p-8 text-center mb-5">
          <CalendarDays size={22} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>No Trades This Week</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Log a closed trade this week to see its summary here.</p>
        </div>
      ) : (
        <>
          {/* ── AI take (auto) ── */}
          <div className="glass-card p-5 mb-4" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.07), rgba(139,92,246,0.02))', border: '1px solid rgba(139,92,246,0.18)' }}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--gradient-primary)' }}>
                <Sparkles size={14} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                {aiLoading ? (
                  <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                    <Loader2 size={13} className="animate-spin" /> <span className="text-xs">Trado AI is reading this week…</span>
                  </div>
                ) : ai ? (
                  <>
                    <p className="text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>{ai.headline}</p>
                    <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--text-secondary)' }}>{ai.takeaway}</p>
                    {ai.focusTip && (
                      <p className="text-xs leading-relaxed flex items-start gap-1.5" style={{ color: 'var(--accent-purple-light)' }}>
                        <Target size={12} className="flex-shrink-0 mt-0.5" /> {ai.focusTip}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>AI take unavailable right now — the numbers below are still fully accurate.</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Stat tiles ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatTile
              icon={DollarSign} label="Total P&L" value={formatPnl(week.totalPnl)} color={pnlColor(week.totalPnl)}
              delta={hasPrev ? formatDeltaPct(delta.pnlDeltaPct) : null} deltaPositive={delta.pnlDeltaPct >= 0} sub={hasPrev ? 'vs last week' : 'no prior week yet'}
            />
            <StatTile
              icon={Hash} label="Trades" value={week.tradeCount}
              sub={`${week.tradingDays} trading day${week.tradingDays === 1 ? '' : 's'} · ${(week.avgPerDay || 0).toFixed(1)} avg/day`}
            />
            <StatTile
              icon={Percent} label="Win Rate" value={`${(week.winRate || 0).toFixed(1)}%`} color="var(--positive-green)"
              delta={hasPrev ? formatDeltaPts(delta.wrDeltaPts) : null} deltaPositive={delta.wrDeltaPts >= 0} sub={hasPrev ? 'vs last week' : 'no prior week yet'}
            />
            <StatTile
              icon={Scale} label="Profit Factor" value={week.profitFactor >= 999 ? '∞' : (week.profitFactor || 0).toFixed(2)}
              sub={profitFactorLabel(week.profitFactor)}
            />
          </div>

          {/* ── Win/Loss · Highlights · Patterns ── */}
          <div className="grid md:grid-cols-3 gap-3 mb-5">
            <div className="glass-card p-4">
              <p className="text-xs font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                <BarChart3 size={13} style={{ color: 'var(--accent-purple-light)' }} /> Win/Loss Breakdown
              </p>
              <div className="space-y-2.5">
                <Row label="Avg Win" value={formatPnl(week.avgWin)} color="var(--positive-green)" />
                <Row label="Avg Loss" value={formatPnl(week.avgLoss)} color="var(--negative-red)" />
                <Row label="Risk/Reward" value={`${(week.rr || 0).toFixed(2)}:1`} />
              </div>
            </div>

            <div className="glass-card p-4">
              <p className="text-xs font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                <Trophy size={13} style={{ color: 'var(--accent-purple-light)' }} /> Highlights
              </p>
              <div className="space-y-2.5">
                <Row label="Largest Win" value={formatPnl(week.bestTrade)} color="var(--positive-green)" />
                <Row label="Largest Loss" value={formatPnl(week.worstTrade)} color="var(--negative-red)" />
                <Row
                  label="Best Day" value={week.bestDay ? formatPnl(week.bestDay.pnl) : '—'}
                  color={week.bestDay ? pnlColor(week.bestDay.pnl) : undefined}
                  sub={week.bestDay ? new Date(week.bestDay.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : null}
                />
              </div>
            </div>

            <div className="glass-card p-4">
              <p className="text-xs font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                <Flame size={13} style={{ color: 'var(--accent-purple-light)' }} /> Patterns
              </p>
              <div className="space-y-2.5">
                <Row label="Most Traded" value={week.mostTraded || '—'} />
                <Row
                  label="Most Profitable" color={week.mostProfitable ? pnlColor(week.mostProfitable.pnl) : undefined}
                  value={week.mostProfitable ? `${week.mostProfitable.symbol} (${formatPnl(week.mostProfitable.pnl)})` : '—'}
                />
                <Row label="Avg Duration" value={formatDurationMin(week.avgDurationMin)} />
                <Row label="Long Win Rate" value={week.longWinRate != null ? `${week.longWinRate.toFixed(0)}%` : '—'} />
                <Row label="Short Win Rate" value={week.shortWinRate != null ? `${week.shortWinRate.toFixed(0)}%` : '—'} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── AI Weekly Analysis (Generate + history) ── */}
      <WeeklyReportsHub
        trades={trades} accountBalance={accountBalance} accountId={accountId}
        weekOffset={weekOffset} weekTradeCount={week.tradeCount} rangeLabel={rangeLabel}
      />
    </div>
  )
}

function StatTile({ icon: Icon, label, value, color, delta, deltaPositive, sub }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-1.5 mb-2">
        {Icon && <Icon size={12} style={{ color: 'var(--text-muted)' }} />}
        <span className="text-[10px] font-semibold tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <p className="text-xl font-bold mb-1" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
      {delta != null ? (
        <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: deltaPositive ? 'var(--positive-green)' : 'var(--negative-red)' }}>
          {deltaPositive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />} {delta} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{sub}</span>
        </p>
      ) : sub ? (
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>
      ) : null}
    </div>
  )
}

function Row({ label, value, sub, color }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="text-right min-w-0">
        <span className="text-xs font-semibold" style={{ color: color || 'var(--text-primary)' }}>{value}</span>
        {sub && <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
    </div>
  )
}