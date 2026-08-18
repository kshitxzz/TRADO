import { useMemo, useState } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { BarChart3, TrendingUp, Activity, Info } from 'lucide-react'
import { Dropdown, EmptyState, BLUE } from './shared'
import {
  fmtMoney, fmtPct, fmtHold, pnlColor, maxConsecutive,
  groupTradesByGranularity, computePlannedRMultiple, computeDrawdown,
} from '../../lib/advancedReportsHelpers'
import { buildEquityCurve } from '../../lib/utils'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function StatRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: color || 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}
function MonthCard({ label, value, sub, color }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-2xl font-bold mb-1" style={{ color: color || 'var(--positive-green)' }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}
function MiniTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const pos = payload[0].value >= 0
  return (
    <div style={{ background: '#181722', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 6 }}>{label}</p>
      <div className="flex items-center gap-2 text-xs" style={{ color: pos ? 'var(--positive-green)' : 'var(--negative-red)' }}>
        <span className="w-2 h-2 rounded-full" style={{ background: pos ? '#4ADE80' : '#F87171' }} />
        Net Daily P&L ({pos ? 'Positive' : 'Negative'}) &nbsp; {fmtMoney(payload[0].value, { sign: true })}
      </div>
    </div>
  )
}

export default function OverviewTab({ closed, stats, avgHoldAll, avgHoldWins, avgHoldLoss, avgDailyVolume }) {
  const [pnlShowing, setPnlShowing] = useState('net')

  // Gross vs net — the schema only stores net pnl (no separate commission/fee
  // columns broken out per trade), so "Gross" is presented as net + fees(0)
  // rather than fabricating a spread. Both selections are therefore
  // numerically identical until per-trade cost fields exist.
  const displayPnl = t => t.pnl || 0

  const { byMonth, bestMonth, worstMonth, avgMonthPnl } = useMemo(() => {
    const map = {}
    closed.forEach(t => {
      const key = t.closed_at?.slice(0, 7); if (!key) return
      if (!map[key]) map[key] = { pnl: 0, count: 0 }
      map[key].pnl += displayPnl(t)
      map[key].count++
    })
    const months = Object.entries(map).map(([k, v]) => ({ key: k, ...v }))
    const best  = months.reduce((b, m) => m.pnl > b.pnl ? m : b, { key: '—', pnl: 0 })
    const worst = months.reduce((w, m) => m.pnl < w.pnl ? m : w, { key: '—', pnl: 0 })
    const avg   = months.length > 0 ? months.reduce((s, m) => s + m.pnl, 0) / months.length : 0
    return { byMonth: map, bestMonth: best, worstMonth: worst, avgMonthPnl: avg }
  }, [closed])

  function fmtMonthKey(key) {
    if (!key || key === '—') return '—'
    const [yr, mo] = key.split('-')
    return `${MONTHS[parseInt(mo, 10) - 1]} ${yr}`
  }

  const wins   = closed.filter(t => (t.pnl || 0) > 0)
  const losses = closed.filter(t => (t.pnl || 0) < 0)
  const breakeven = closed.filter(t => (t.pnl || 0) === 0).length
  const sorted = [...closed].sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at))
  const maxConsecWins   = maxConsecutive(sorted, t => (t.pnl || 0) > 0)
  const maxConsecLosses = maxConsecutive(sorted, t => (t.pnl || 0) < 0)

  const dayLevel = useMemo(() => {
    const byDate = {}
    closed.forEach(t => {
      const key = t.closed_at?.slice(0, 10); if (!key) return
      if (!byDate[key]) byDate[key] = { pnl: 0 }
      byDate[key].pnl += displayPnl(t)
    })
    const days = Object.values(byDate)
    const daysSorted = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)
    const wDays = days.filter(d => d.pnl > 0)
    const lDays = days.filter(d => d.pnl < 0)
    return {
      totalTradingDays: days.length,
      winningDays: wDays.length,
      losingDays: lDays.length,
      breakevenDays: days.filter(d => d.pnl === 0).length,
      avgDailyPnl: days.length ? days.reduce((s, d) => s + d.pnl, 0) / days.length : 0,
      avgWinningDayPnl: wDays.length ? wDays.reduce((s, d) => s + d.pnl, 0) / wDays.length : 0,
      avgLosingDayPnl: lDays.length ? lDays.reduce((s, d) => s + d.pnl, 0) / lDays.length : 0,
      largestProfitableDay: wDays.length ? Math.max(...wDays.map(d => d.pnl)) : 0,
      largestLosingDay: lDays.length ? Math.min(...lDays.map(d => d.pnl)) : 0,
      maxConsecWinDays: maxConsecutive(daysSorted, d => d.pnl > 0),
      maxConsecLossDays: maxConsecutive(daysSorted, d => d.pnl < 0),
    }
  }, [closed])

  const curve = useMemo(() => buildEquityCurve(closed), [closed])
  const { maxDrawdown, maxDrawdownPct } = useMemo(() => computeDrawdown(curve), [curve])
  const plannedR = useMemo(() => computePlannedRMultiple(closed), [closed])
  const expectancy = closed.length > 0
    ? (stats.winRate / 100) * stats.avgWin + (1 - stats.winRate / 100) * stats.avgLoss
    : 0

  const dailyChart = useMemo(() => groupTradesByGranularity(closed, 'day'), [closed])

  const LEFT_STATS = [
    { label: 'Total P&L',                  value: fmtMoney(stats.totalPnl),        color: pnlColor(stats.totalPnl) },
    { label: 'Average daily volume',        value: avgDailyVolume.toFixed(2) },
    { label: 'Average winning trade',       value: fmtMoney(stats.avgWin),          color: 'var(--positive-green)' },
    { label: 'Average losing trade',        value: fmtMoney(stats.avgLoss),         color: 'var(--negative-red)' },
    { label: 'Total number of trades',      value: closed.length },
    { label: 'Number of winning trades',    value: wins.length,   color: wins.length ? 'var(--positive-green)' : undefined },
    { label: 'Number of losing trades',     value: losses.length, color: losses.length ? 'var(--negative-red)' : undefined },
    { label: 'Number of break even trades', value: breakeven },
    { label: 'Max consecutive wins',        value: maxConsecWins,   color: maxConsecWins   ? 'var(--positive-green)' : undefined },
    { label: 'Max consecutive losses',      value: maxConsecLosses, color: maxConsecLosses ? 'var(--negative-red)'   : undefined },
    { label: 'Total commissions',           value: '$0.00' },
    { label: 'Total fees',                  value: '$0.00' },
    { label: 'Total swap',                  value: '$0.00' },
    { label: 'Largest profit',              value: fmtMoney(Math.max(0, stats.bestTrade)),  color: 'var(--positive-green)' },
    { label: 'Largest loss',                value: fmtMoney(Math.min(0, stats.worstTrade)), color: 'var(--negative-red)' },
    { label: 'Average hold time (All trades)',     value: fmtHold(avgHoldAll) },
    { label: 'Average hold time (Winning trades)', value: fmtHold(avgHoldWins) },
    { label: 'Average hold time (Losing trades)',  value: fmtHold(avgHoldLoss) },
    { label: 'Average hold time (Scratch trades)', value: 'N/A' },
    { label: 'Average trade P&L',           value: fmtMoney(expectancy), color: pnlColor(expectancy) },
    { label: 'Profit factor',               value: stats.profitFactor > 99 ? '∞' : stats.profitFactor.toFixed(2) },
  ]

  const RIGHT_STATS = [
    { label: 'Open trades',                 value: 0 },
    { label: 'Total trading days',          value: dayLevel.totalTradingDays },
    { label: 'Winning days',                value: dayLevel.winningDays, color: dayLevel.winningDays ? 'var(--positive-green)' : undefined },
    { label: 'Losing days',                 value: dayLevel.losingDays,  color: dayLevel.losingDays  ? 'var(--negative-red)'   : undefined },
    { label: 'Breakeven days',              value: dayLevel.breakevenDays },
    { label: 'Logged days',                 value: dayLevel.totalTradingDays },
    { label: 'Max consecutive winning days',value: dayLevel.maxConsecWinDays,  color: dayLevel.maxConsecWinDays  ? 'var(--positive-green)' : undefined },
    { label: 'Max consecutive losing days', value: dayLevel.maxConsecLossDays, color: dayLevel.maxConsecLossDays ? 'var(--negative-red)'   : undefined },
    { label: 'Average daily P&L',           value: fmtMoney(dayLevel.avgDailyPnl), color: pnlColor(dayLevel.avgDailyPnl) },
    { label: 'Average winning day P&L',     value: fmtMoney(dayLevel.avgWinningDayPnl), color: 'var(--positive-green)' },
    { label: 'Average losing day P&L',      value: fmtMoney(dayLevel.avgLosingDayPnl),  color: 'var(--negative-red)' },
    { label: 'Largest profitable day',      value: fmtMoney(dayLevel.largestProfitableDay), color: 'var(--positive-green)' },
    { label: 'Largest losing day',          value: fmtMoney(dayLevel.largestLosingDay),      color: 'var(--negative-red)' },
    { label: 'Average planned R-Multiple',  value: plannedR == null ? 'N/A' : `${plannedR.toFixed(2)}R` },
    { label: 'Average realized R-Multiple', value: 'N/A' },
    { label: 'Trade expectancy',            value: fmtMoney(expectancy), color: pnlColor(expectancy) },
    { label: 'Max drawdown',                value: fmtMoney(maxDrawdown), color: 'var(--negative-red)' },
    { label: 'Max drawdown, %',             value: maxDrawdownPct == null ? 'N/A' : fmtPct(maxDrawdownPct) },
    { label: 'Average drawdown',            value: fmtMoney(maxDrawdown), color: 'var(--negative-red)' },
    { label: 'Average drawdown, %',         value: maxDrawdownPct == null ? 'N/A' : fmtPct(maxDrawdownPct) },
  ]

  if (closed.length === 0) {
    return <EmptyState Icon={BarChart3} title="No trade data yet" sub="Add trades to see your overview" />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>P&L Showing</span>
        <Dropdown value={pnlShowing}
                  options={[{ value: 'net', label: 'Net P&L' }, { value: 'gross', label: 'Gross P&L' }]}
                  onChange={setPnlShowing} minWidth={130} />
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)' }}>
            <BarChart3 size={16} style={{ color: BLUE }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Your Stats</h2>
            <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>All Dates</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <MonthCard label="Best Month"  value={fmtMoney(bestMonth.pnl)}  sub={fmtMonthKey(bestMonth.key)}  color="var(--positive-green)" />
          <MonthCard label="Lowest Month" value={fmtMoney(worstMonth.pnl)} sub={fmtMonthKey(worstMonth.key)} color="var(--negative-red)" />
          <MonthCard label="Average" value={fmtMoney(avgMonthPnl)} sub="per Day" color={pnlColor(avgMonthPnl)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-8">
          <div>{LEFT_STATS.map(s => <StatRow key={s.label} {...s} value={String(s.value ?? '—')} />)}</div>
          <div className="mt-4 lg:mt-0">{RIGHT_STATS.map(s => <StatRow key={s.label} {...s} value={String(s.value ?? '—')} />)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)' }}>
                <TrendingUp size={16} style={{ color: BLUE }} />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Daily Net Cumulative P&L</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>All Dates</p>
              </div>
            </div>
            <Info size={15} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString('en-US')} />
                <Tooltip content={<MiniTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
                <Line type="monotone" dataKey="cumulative" stroke={BLUE} strokeWidth={2} dot={{ r: 4, fill: BLUE, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.15)' }}>
                <Activity size={16} style={{ color: '#22C55E' }} />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Net Daily P&L</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>All Dates</p>
              </div>
            </div>
            <Info size={15} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString('en-US')} />
                <Tooltip content={<MiniTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={64}>
                  {dailyChart.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#4ADE80' : '#F87171'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}