import { useMemo, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import {
  TrendingUp, BarChart2, Layers, Calendar, Zap, DollarSign, Percent,
  Activity, Target, Clock, MoreHorizontal,
} from 'lucide-react'
import { StatCard, TabPills, Dropdown, ChartCard, EmptyState, BLUE } from './shared'
import {
  fmtMoney, fmtHold, fmtPct, pnlColor, maxConsecutive,
  groupTradesByGranularity, computePlannedRMultiple, computeDrawdown,
} from '../../lib/advancedReportsHelpers'
import { buildEquityCurve } from '../../lib/utils'

const GRANULARITY_OPTIONS = [
  { value: 'day',   label: 'Day' },
  { value: 'week',  label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year',  label: 'Year' },
]

function ChartTooltip({ active, payload, mode }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div style={{ background: '#181722', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 6 }}>{p.label}</p>
      {mode === 'cumulative' ? (
        <p style={{ color: BLUE, fontSize: 13, fontWeight: 700 }}>Trade Count &nbsp; {p.count}</p>
      ) : (
        <p style={{ color: p.pnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)', fontSize: 13, fontWeight: 700 }}>
          {fmtMoney(p.pnl, { sign: true })}
        </p>
      )}
    </div>
  )
}

export default function PerformanceTab({ closed, stats, avgHoldAll, avgHoldWins, avgHoldLoss, avgDailyVolume, totalTradingDays }) {
  const [pnlGranularity, setPnlGranularity] = useState('day')
  const [perfGranularity, setPerfGranularity] = useState('day')
  const [subTab, setSubTab] = useState('summary')

  const pnlData  = useMemo(() => groupTradesByGranularity(closed, pnlGranularity), [closed, pnlGranularity])
  const perfData = useMemo(() => groupTradesByGranularity(closed, perfGranularity), [closed, perfGranularity])

  const curve = useMemo(() => buildEquityCurve(closed), [closed])
  const { maxDrawdown, maxDrawdownPct } = useMemo(() => computeDrawdown(curve), [curve])
  const plannedR = useMemo(() => computePlannedRMultiple(closed), [closed])

  const wins   = closed.filter(t => (t.pnl || 0) > 0)
  const losses = closed.filter(t => (t.pnl || 0) < 0)
  const sorted = [...closed].sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at))
  const maxConsecWins   = maxConsecutive(sorted, t => (t.pnl || 0) > 0)
  const maxConsecLosses = maxConsecutive(sorted, t => (t.pnl || 0) < 0)

  const expectancy = closed.length > 0
    ? (stats.winRate / 100) * stats.avgWin + (1 - stats.winRate / 100) * stats.avgLoss
    : 0

  // Day-level aggregation for "Days" sub-tab
  const dayAgg = useMemo(() => {
    const byDate = {}
    closed.forEach(t => {
      const key = t.closed_at?.slice(0, 10); if (!key) return
      if (!byDate[key]) byDate[key] = { pnl: 0, count: 0 }
      byDate[key].pnl += t.pnl || 0
      byDate[key].count++
    })
    const days = Object.values(byDate)
    const wDays = days.filter(d => d.pnl > 0)
    const lDays = days.filter(d => d.pnl < 0)
    return {
      avgDailyWinPct: days.length ? (wDays.length / days.length) * 100 : 0,
      avgDailyWinLoss: days.length ? days.reduce((s, d) => s + d.pnl, 0) / days.length : 0,
      avgDailyNetPnl: days.length ? days.reduce((s, d) => s + d.pnl, 0) / days.length : 0,
      largestProfitableDay: wDays.length ? Math.max(...wDays.map(d => d.pnl)) : 0,
      largestLosingDay: lDays.length ? Math.min(...lDays.map(d => d.pnl)) : 0,
      maxDailyDrawdown: lDays.length ? Math.min(...lDays.map(d => d.pnl)) : 0,
      avgDailyDrawdown: lDays.length ? lDays.reduce((s, d) => s + d.pnl, 0) / lDays.length : 0,
      loggedDays: days.length,
    }
  }, [closed])

  const iconBoxGreen = 'rgba(34,197,94,0.15)'
  const iconBoxGray  = 'rgba(255,255,255,0.06)'
  const iconBoxRed   = 'rgba(239,68,68,0.15)'

  const summaryCards = [
    { icon: DollarSign, label: 'Net P&L',          value: fmtMoney(stats.totalPnl),                 valueColor: pnlColor(stats.totalPnl), iconBg: iconBoxGreen, iconColor: '#22C55E' },
    { icon: Percent,    label: 'Win Rate',          value: fmtPct(stats.winRate),                    iconBg: iconBoxGray,  iconColor: 'var(--text-muted)' },
    { icon: Activity,   label: 'Profit Factor',     value: stats.profitFactor > 99 ? '∞' : stats.profitFactor.toFixed(2), iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
    { icon: Target,     label: 'Trade Expectancy',  value: fmtMoney(expectancy),                     valueColor: pnlColor(expectancy), iconBg: iconBoxGreen, iconColor: '#22C55E' },
    { icon: TrendingUp, label: 'Avg Daily Win %',   value: fmtPct(dayAgg.avgDailyWinPct),             iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
    { icon: BarChart2,  label: 'Avg Daily Win/Loss',value: fmtMoney(dayAgg.avgDailyWinLoss),          valueColor: pnlColor(dayAgg.avgDailyWinLoss), iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
    { icon: BarChart2,  label: 'Avg Trade Win/Loss',value: fmtMoney(expectancy),                      iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
    { icon: Clock,      label: 'Avg Hold Time',     value: fmtHold(avgHoldAll),                       iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
    { icon: DollarSign, label: 'Avg Net Trade P&L', value: fmtMoney(expectancy),                      valueColor: pnlColor(expectancy), iconBg: iconBoxGreen, iconColor: '#22C55E' },
    { icon: DollarSign, label: 'Avg Daily Net P&L', value: fmtMoney(dayAgg.avgDailyNetPnl),           valueColor: pnlColor(dayAgg.avgDailyNetPnl), iconBg: iconBoxGreen, iconColor: '#22C55E' },
    { icon: Target,     label: 'Planned R-Multiple',value: plannedR == null ? 'N/A' : `${plannedR.toFixed(2)}R`, iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
    { icon: Target,     label: 'Realized R-Multiple', value: 'N/A', iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
    { icon: Activity,   label: 'Avg Daily Volume',  value: avgDailyVolume.toFixed(2),                 iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
    { icon: Calendar,   label: 'Logged Days',       value: dayAgg.loggedDays,                         iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
    { icon: TrendingUp, label: 'Max Daily Drawdown',value: fmtMoney(dayAgg.maxDailyDrawdown),         valueColor: 'var(--negative-red)', iconBg: iconBoxRed, iconColor: '#EF4444' },
    { icon: TrendingUp, label: 'Avg Daily Drawdown',value: fmtMoney(dayAgg.avgDailyDrawdown),         valueColor: 'var(--negative-red)', iconBg: iconBoxRed, iconColor: '#EF4444' },
  ]

  const daysCards = [
    { icon: TrendingUp, label: 'Avg Daily Win %',    value: fmtPct(dayAgg.avgDailyWinPct), iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
    { icon: BarChart2,  label: 'Avg Daily Win/Loss',  value: fmtMoney(dayAgg.avgDailyWinLoss), valueColor: pnlColor(dayAgg.avgDailyWinLoss), iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
    { icon: DollarSign, label: 'Avg Daily Net P&L',   value: fmtMoney(dayAgg.avgDailyNetPnl), valueColor: pnlColor(dayAgg.avgDailyNetPnl), iconBg: iconBoxGreen, iconColor: '#22C55E' },
    { icon: TrendingUp, label: 'Largest Profitable Day', value: fmtMoney(dayAgg.largestProfitableDay), valueColor: 'var(--positive-green)', iconBg: iconBoxGreen, iconColor: '#22C55E' },
    { icon: TrendingUp, label: 'Largest Losing Day',  value: fmtMoney(dayAgg.largestLosingDay), valueColor: 'var(--negative-red)', iconBg: iconBoxRed, iconColor: '#EF4444' },
    { icon: Clock,      label: 'Avg Trading Duration',value: fmtHold(avgHoldAll), iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
    { icon: Calendar,   label: 'Logged Days',         value: dayAgg.loggedDays, iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
    { icon: TrendingUp, label: 'Max Daily Drawdown',  value: fmtMoney(dayAgg.maxDailyDrawdown), valueColor: 'var(--negative-red)', iconBg: iconBoxRed, iconColor: '#EF4444' },
    { icon: TrendingUp, label: 'Avg Daily Drawdown',  value: fmtMoney(dayAgg.avgDailyDrawdown), valueColor: 'var(--negative-red)', iconBg: iconBoxRed, iconColor: '#EF4444' },
  ]

  const tradesCards = [
    { icon: Percent,    label: 'Win Rate',            value: fmtPct(stats.winRate), iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
    { icon: BarChart2,  label: 'Avg Trade Win/Loss',   value: fmtMoney(expectancy), iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
    { icon: DollarSign, label: 'Avg Net Trade P&L',    value: fmtMoney(expectancy), valueColor: pnlColor(expectancy), iconBg: iconBoxGreen, iconColor: '#22C55E' },
    { icon: Target,     label: 'Trade Expectancy',     value: fmtMoney(expectancy), valueColor: pnlColor(expectancy), iconBg: iconBoxGreen, iconColor: '#22C55E' },
    { icon: TrendingUp, label: 'Largest Profitable Trade', value: fmtMoney(Math.max(0, stats.bestTrade)), valueColor: 'var(--positive-green)', iconBg: iconBoxGreen, iconColor: '#22C55E' },
    { icon: TrendingUp, label: 'Largest Losing Trade', value: fmtMoney(Math.min(0, stats.worstTrade)), valueColor: 'var(--negative-red)', iconBg: iconBoxRed, iconColor: '#EF4444' },
    { icon: Clock,      label: 'Avg Hold Time',        value: fmtHold(avgHoldAll), iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
    { icon: Clock,      label: 'Longest Trade Duration', value: fmtHold(closed.length ? Math.max(...closed.map(t => t.duration_seconds ? t.duration_seconds / 60 : 0)) : 0), iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
    { icon: Activity,   label: 'Avg Daily Volume',     value: avgDailyVolume.toFixed(2), iconBg: iconBoxGray, iconColor: 'var(--text-muted)' },
  ]

  const cardsForTab = subTab === 'summary' ? summaryCards : subTab === 'days' ? daysCards : tradesCards

  if (closed.length === 0) {
    return <EmptyState Icon={TrendingUp} title="No trade data yet" sub="Add trades to see your performance charts" />
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard icon={TrendingUp} iconBg="rgba(59,130,246,0.15)" iconColor={BLUE}
                   title="Net P&L" subtitle="Cumulative performance"
                   right={<div className="flex items-center gap-2">
                     <Dropdown value={pnlGranularity} options={GRANULARITY_OPTIONS} onChange={setPnlGranularity} />
                     <MoreHorizontal size={16} style={{ color: 'var(--text-muted)' }} />
                   </div>}>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pnlData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false}
                       tickFormatter={v => v.toLocaleString('en-US')} />
                <Tooltip content={<ChartTooltip mode="cumulative" />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
                <Line type="monotone" dataKey="cumulative" stroke={BLUE} strokeWidth={2}
                      dot={{ r: 4, fill: BLUE, strokeWidth: 0 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: BLUE }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Cumulative P&L</span>
          </div>
        </ChartCard>

        <ChartCard icon={BarChart2} iconBg="rgba(34,197,94,0.15)" iconColor="#22C55E"
                   title="Daily Performance" subtitle="Average win/loss by day"
                   right={<div className="flex items-center gap-2">
                     <Dropdown value={perfGranularity} options={GRANULARITY_OPTIONS} onChange={setPerfGranularity} />
                     <MoreHorizontal size={16} style={{ color: 'var(--text-muted)' }} />
                   </div>}>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perfData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false}
                       tickFormatter={v => v.toLocaleString('en-US')} />
                <Tooltip content={<ChartTooltip mode="perf" />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={64}>
                  {perfData.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#4ADE80' : '#F87171'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#4ADE80' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Profitable</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#F87171' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loss</span>
            </div>
          </div>
        </ChartCard>
      </div>

      <div className="glass-card p-5">
        <div className="mb-5">
          <TabPills
            tabs={[
              { value: 'summary', label: 'Summary', icon: Layers },
              { value: 'days',    label: 'Days',    icon: Calendar },
              { value: 'trades',  label: 'Trades',  icon: Zap },
            ]}
            active={subTab} onChange={setSubTab}
          />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cardsForTab.map(c => <StatCard key={c.label} {...c} />)}
        </div>
      </div>
    </div>
  )
}