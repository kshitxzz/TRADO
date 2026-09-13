import { useMemo, useState, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell,
} from 'recharts'
import PageWrapper from '../../components/layout/PageWrapper'
import AnimatedNumber from '../../components/ui/AnimatedNumber'
import InfoTip from '../../components/ui/InfoTip'
import { useAuth } from '../../hooks/useAuth'
import { useTrades } from '../../hooks/useTrades'
import { computeStats, buildEquityCurve, pnlColor } from '../../lib/utils'
import {
  computeAssetClassBreakdown, rankHourlyPerformance, computeDrawdownSeries,
  computeStreakTracking, computeSymbolBreakdown, computeTradingHeatmap,
  computeRiskAdjustedMetrics, sharpeRatingLabel, sortinoRatingLabel, kellyRatingLabel,
  computeAvgHoldTimeByOutcome, computePnlHistogram, computeRollingPerformance,
  computeCalendarPnl,
} from '../../lib/analytics'
import {
  TrendingUp, TrendingDown, Clock, BarChart2, Target, Award, ChevronLeft, ChevronRight,
  Calendar, X, DollarSign, Activity, Scale, ClipboardList, Flame, PieChart as PieChartIcon,
  Grid3x3,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']
const MON_S  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DOW    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const pad    = n => String(n).padStart(2,'0')

function fmtK(n, alwaysSign = false) {
  if (n == null || isNaN(n)) return '$0'
  const abs = Math.abs(n)
  const s   = abs >= 1000 ? `$${(abs/1000).toFixed(1)}k` : `$${abs.toFixed(0)}`
  if (alwaysSign) return (n >= 0 ? '+' : '-') + s
  return (n < 0 ? '-' : '') + s
}
function fmtFull(n) {
  if (n == null || isNaN(n)) return '$0.00'
  return (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2)
}
function fmtShortDate(str) {
  if (!str) return ''
  const d = new Date(str + 'T00:00:00')
  return `${MON_S[d.getMonth()]} ${d.getDate()}`
}
function fmtMin(min) {
  if (min == null || isNaN(min)) return '0 min'
  return `${Math.round(min)} min`
}
function pfLabel(pf) {
  if (!isFinite(pf) || pf > 3) return 'Excellent'
  if (pf > 2)   return 'Very Good'
  if (pf > 1.5) return 'Good'
  if (pf > 1)   return 'Average'
  return 'Below 1'
}

// ─── Shared bits ──────────────────────────────────────────────────────────────
function EmptyState({ text = 'Not enough data yet' }) {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 160 }}>
      <p className="text-sm text-center px-4" style={{ color: 'var(--text-muted)' }}>{text}</p>
    </div>
  )
}

function CardHeader({ icon: Icon, iconBg, iconColor, title, subtitle, info, right }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
          <Icon size={15} style={{ color: iconColor }} />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="font-bold text-[15px]" style={{ color: 'var(--text-primary)' }}>{title}</h3>
            {info && <InfoTip text={info} />}
          </div>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

function MiniStat({ label, value, color }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-sm font-bold" style={{ color }}>{value}</p>
    </div>
  )
}

function ChartTooltip({ title, value, valueColor, sub }) {
  return (
    <div style={{ background: '#181722', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 14px', fontSize: 12 }}>
      <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{title}</p>
      <p style={{ color: valueColor, fontWeight: 700 }}>{value}</p>
      {sub && <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 2 }}>{sub}</p>}
    </div>
  )
}

// ─── Hero Stats Row ───────────────────────────────────────────────────────────
function GlowBlob({ color }) {
  return (
    <div className="absolute rounded-full pointer-events-none" style={{
      width: 150, height: 150, right: -45, top: -55,
      background: `radial-gradient(circle, ${color} 0%, transparent 72%)`,
    }} />
  )
}

function HeroStats({ stats, wins, losses, closed, expectancy }) {
  const cards = [
    {
      icon: Target, iconBg: 'rgba(139,92,246,0.2)', iconColor: '#8B5CF6', glow: 'rgba(139,92,246,0.3)',
      badge: 'Key Metric', label: 'WIN RATE',
      valueColor: stats.winRate >= 50 ? 'var(--positive-green)' : 'var(--text-primary)',
      render: () => <AnimatedNumber value={stats.winRate} decimals={1} suffix="%" />,
      sub: `${wins.length}W / ${losses.length}L`,
    },
    {
      icon: TrendingUp, iconBg: 'rgba(34,197,94,0.18)', iconColor: '#22C55E', glow: 'rgba(34,197,94,0.28)',
      label: 'PROFIT FACTOR',
      valueColor: stats.profitFactor >= 1.5 ? 'var(--positive-green)' : stats.profitFactor >= 1 ? '#F59E0B' : 'var(--negative-red)',
      render: () => stats.profitFactor > 99 ? '∞' : <AnimatedNumber value={stats.profitFactor} decimals={2} />,
      sub: pfLabel(stats.profitFactor),
    },
    {
      icon: Activity, iconBg: 'rgba(59,130,246,0.18)', iconColor: '#3B82F6', glow: 'rgba(59,130,246,0.28)',
      label: 'EXPECTANCY',
      valueColor: expectancy >= 0 ? 'var(--positive-green)' : 'var(--negative-red)',
      render: () => <AnimatedNumber value={expectancy} formatter={fmtFull} />,
      sub: 'Per trade average',
    },
    {
      icon: DollarSign, iconBg: 'rgba(34,197,94,0.18)', iconColor: '#22C55E', glow: 'rgba(34,197,94,0.28)',
      label: 'TOTAL P&L',
      valueColor: pnlColor(stats.totalPnl),
      render: () => <AnimatedNumber value={stats.totalPnl} formatter={fmtFull} />,
      sub: `${closed.length} trades`,
    },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="glass-card p-5 relative overflow-hidden">
          <GlowBlob color={c.glow} />
          <div className="relative flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                 style={{ background: c.iconBg }}>
              <c.icon size={18} style={{ color: c.iconColor }} />
            </div>
            {c.badge && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background:'rgba(139,92,246,0.15)', color:'#C4B5FD',
                             border:'1px solid rgba(139,92,246,0.25)' }}>
                {c.badge}
              </span>
            )}
          </div>
          <p className="relative text-[10px] font-bold uppercase tracking-widest mb-1.5"
             style={{ color:'var(--text-muted)' }}>{c.label}</p>
          <p className="relative text-2xl font-bold leading-tight mb-1" style={{ color: c.valueColor }}>{c.render()}</p>
          <p className="relative text-xs" style={{ color:'var(--text-muted)' }}>{c.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Secondary Stats Row ──────────────────────────────────────────────────────
function SecondaryStats({ stats }) {
  const avgRR = stats.avgLoss !== 0 ? (Math.abs(stats.avgWin) / Math.abs(stats.avgLoss)) : null
  const rows = [
    { icon: TrendingUp,   iconColor:'#22C55E', label:'AVG WIN',      value: stats.avgWin,                   color:'var(--positive-green)' },
    { icon: TrendingDown, iconColor:'#EF4444', label:'AVG LOSS',     value: stats.avgLoss,                  color:'var(--negative-red)' },
    { icon: Award,        iconColor:'#22C55E', label:'LARGEST WIN',  value: Math.max(0, stats.bestTrade),   color:'var(--positive-green)' },
    { icon: TrendingDown, iconColor:'#EF4444', label:'LARGEST LOSS', value: Math.min(0, stats.worstTrade),  color:'var(--negative-red)' },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {rows.map(r => (
        <div key={r.label} className="glass-card px-4 py-3.5 flex items-center gap-3">
          <r.icon size={15} style={{ color: r.iconColor }} className="flex-shrink-0" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5"
               style={{ color:'var(--text-muted)' }}>{r.label}</p>
            <p className="text-sm font-bold" style={{ color: r.color }}>
              <AnimatedNumber value={r.value} formatter={fmtFull} />
            </p>
          </div>
        </div>
      ))}
      <div className="glass-card px-4 py-3.5 flex items-center gap-3">
        <Scale size={15} style={{ color:'rgba(255,255,255,0.4)' }} className="flex-shrink-0" />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color:'var(--text-muted)' }}>AVG R:R</p>
          <p className="text-sm font-bold" style={{ color:'var(--text-primary)' }}>
            {avgRR == null ? '∞' : <><AnimatedNumber value={avgRR} decimals={2} />:1</>}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── P&L by period (Year / Month / Week, with navigation) ────────────────────
function PnlPeriodCard({ closed }) {
  const [view, setView] = useState('month')
  const [refDate, setRefDate] = useState(new Date())

  const { buckets, total, title } = useMemo(
    () => computeCalendarPnl(closed, view, refDate),
    [closed, view, refDate]
  )
  const hasAny = buckets.some(b => b.count > 0)

  function nav(dir) {
    setRefDate(d => {
      const nd = new Date(d)
      if (view === 'month') nd.setMonth(nd.getMonth() + dir)
      else if (view === 'week') nd.setDate(nd.getDate() + dir * 7)
      else nd.setFullYear(nd.getFullYear() + dir)
      return nd
    })
  }

  return (
    <div className="glass-card p-5 flex flex-col">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background:'rgba(139,92,246,0.18)' }}>
            <BarChart2 size={15} style={{ color:'#A78BFA' }} />
          </div>
          <h3 className="font-bold text-[15px]" style={{ color:'var(--text-primary)' }}>P&L</h3>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-0.5 p-1 rounded-lg" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)' }}>
            {['Year','Month','Week'].map(v => {
              const key = v.toLowerCase()
              const active = view === key
              return (
                <button key={v} onClick={() => setView(key)}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold transition-all"
                        style={{ background: active ? 'rgba(139,92,246,0.3)' : 'transparent',
                                 color: active ? '#C4B5FD' : 'rgba(255,255,255,0.4)' }}>
                  {v}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => nav(-1)} className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/5 transition-colors" style={{ color:'var(--text-muted)' }}>
              <ChevronLeft size={13} />
            </button>
            <div className="text-center" style={{ minWidth: 118 }}>
              <p className="text-sm font-bold" style={{ color:'var(--text-primary)' }}>{title}</p>
              <p className="text-xs font-semibold" style={{ color: total >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }}>{fmtK(total, true)}</p>
            </div>
            <button onClick={() => nav(1)} className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/5 transition-colors" style={{ color:'var(--text-muted)' }}>
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {!hasAny ? <EmptyState text="No trades in this period" /> : (
        <div style={{ height: 230 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill:'rgba(255,255,255,0.35)', fontSize: 10 }} axisLine={false} tickLine={false}
                     interval={view === 'month' ? 2 : 0} />
              <YAxis tick={{ fill:'rgba(255,255,255,0.35)', fontSize: 10 }} axisLine={false} tickLine={false} width={54}
                     tickFormatter={v => fmtK(v)} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
              <Tooltip cursor={{ fill:'rgba(255,255,255,0.04)' }}
                       content={({ active, payload, label }) => {
                         if (!active || !payload?.length) return null
                         const d = payload[0].payload
                         return <ChartTooltip title={view === 'month' ? `Day ${label}` : label}
                                               value={fmtFull(d.pnl)} valueColor={d.pnl >= 0 ? '#22C55E' : '#EF4444'}
                                               sub={`${d.count} trade${d.count !== 1 ? 's' : ''}`} />
                       }} />
              <Bar dataKey="pnl" radius={[4,4,4,4]} maxBarSize={view === 'month' ? 18 : 46} isAnimationActive animationDuration={900}>
                {buckets.map((b, i) => <Cell key={i} fill={b.pnl >= 0 ? '#22C55E' : '#EF4444'} fillOpacity={b.count > 0 ? 0.85 : 0.12} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── Win / Loss donut ─────────────────────────────────────────────────────────
function WinLossCard({ wins, losses }) {
  const total = wins.length + losses.length
  const data = [
    { name: 'Wins',   value: wins.length,   color: '#22C55E' },
    { name: 'Losses', value: losses.length, color: '#EF4444' },
  ].filter(d => d.value > 0)

  return (
    <div className="glass-card p-5 flex flex-col">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background:'rgba(139,92,246,0.18)' }}>
          <PieChartIcon size={15} style={{ color:'#A78BFA' }} />
        </div>
        <h3 className="font-bold text-[15px]" style={{ color:'var(--text-primary)' }}>Win/Loss</h3>
      </div>
      {total === 0 ? <EmptyState /> : (
        <>
          <div className="flex-1" style={{ minHeight: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%"
                     startAngle={90} endAngle={-270} paddingAngle={data.length > 1 ? 3 : 0}
                     isAnimationActive animationDuration={1100} animationEasing="ease-out">
                  {data.map((d, i) => <Cell key={i} fill={d.color} stroke="none" />)}
                </Pie>
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]
                  const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : 0
                  return <ChartTooltip title={d.name} value={`${d.value} trades (${pct}%)`} valueColor={d.payload.color} />
                }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-5 mt-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background:'#22C55E' }} />
              <span className="text-xs" style={{ color:'var(--text-muted)' }}>Wins</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background:'#EF4444' }} />
              <span className="text-xs" style={{ color:'var(--text-muted)' }}>Losses</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Equity Curve (per closed trade, chronological) ──────────────────────────
function EquityTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const item = payload[0]?.payload
  if (!item) return null
  const pnl = item.pnl ?? 0
  const isPos = pnl >= 0
  const color = isPos ? '#22C55E' : '#EF4444'
  const d = item.fullDate ? new Date(item.fullDate + 'T00:00:00') : null
  return (
    <div style={{
      background: 'rgba(13,12,26,0.97)', border: `1px solid ${isPos ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
      borderRadius: 12, padding: '12px 16px', minWidth: 170,
      boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
    }}>
      <p style={{ color:'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 8, fontWeight: 500 }}>
        {d ? `${DOW[d.getDay()]}, ${MON_S[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : item.label}
      </p>
      <p style={{ color, fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 4 }}>
        {fmtFull(pnl)}
      </p>
      <p style={{ color:'rgba(255,255,255,0.25)', fontSize: 10, fontWeight: 600, letterSpacing:'0.08em', textTransform:'uppercase' }}>
        Cumulative P&L
      </p>
    </div>
  )
}

function EquityCurveSection({ closed }) {
  const [period, setPeriod] = useState('ALL')
  const curve = useMemo(() => buildEquityCurve(closed), [closed])

  const filtered = useMemo(() => {
    if (period === 'ALL' || !curve.length) return curve
    const now = new Date()
    const cutoffs = {
      '1W': new Date(now.getTime() - 7 * 86400000),
      '1M': new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()),
      '3M': new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()),
      '6M': new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
    }
    const cutoff = cutoffs[period]
    return curve.filter(p => p.date && new Date(p.date + 'T00:00:00') >= cutoff)
  }, [curve, period])

  const chartData = useMemo(() => filtered.map((p, i) => ({
    idx: i,
    pnl: p.pnl,
    label: p.date ? fmtShortDate(p.date) : '',
    fullDate: p.date,
  })), [filtered])

  const minY = chartData.length ? Math.min(0, ...chartData.map(d => d.pnl)) : 0
  const maxY = chartData.length ? Math.max(0, ...chartData.map(d => d.pnl)) : 1
  const yPad = (maxY - minY) * 0.15 || 80
  const domainMin = minY - yPad, domainMax = maxY + yPad
  const domainRange = domainMax - domainMin
  const zeroPercent = domainRange > 0 ? Math.max(0, Math.min(100, (domainMax / domainRange) * 100)) : (minY >= 0 ? 100 : 0)

  const lastPnl = chartData.length ? chartData[chartData.length - 1].pnl : 0

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background:'rgba(34,197,94,0.18)' }}>
            <TrendingUp size={15} style={{ color:'#22C55E' }} />
          </div>
          <div>
            <h3 className="font-bold text-[15px]" style={{ color:'var(--text-primary)' }}>Equity Curve</h3>
            <p className="text-xs" style={{ color:'var(--text-muted)' }}>Cumulative P&L, trade by trade</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-lg font-bold" style={{ color: lastPnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }}>
            {fmtFull(lastPnl)}
          </span>
          <div className="flex items-center gap-0.5 p-1 rounded-lg" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)' }}>
            {['1W','1M','3M','6M','ALL'].map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                      className="px-2.5 py-1 rounded-md text-xs font-semibold transition-all"
                      style={{ background: period === p ? 'rgba(139,92,246,0.3)' : 'transparent',
                               color: period === p ? '#C4B5FD' : 'rgba(255,255,255,0.35)' }}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {chartData.length === 0 ? <EmptyState text="No data for this period" /> : (
        <div style={{ height: 270, marginTop: 12 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="perfEqLineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={`${zeroPercent}%`} stopColor="#22C55E" />
                  <stop offset={`${zeroPercent}%`} stopColor="#EF4444" />
                </linearGradient>
                <linearGradient id="perfEqAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity={0.22} />
                  <stop offset={`${zeroPercent}%`} stopColor="#22C55E" stopOpacity={0.03} />
                  <stop offset={`${zeroPercent}%`} stopColor="#EF4444" stopOpacity={0.03} />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity={0.18} />
                </linearGradient>
                <filter id="perfDotGlowG" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="perfDotGlowR" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
              <XAxis dataKey="label" tick={{ fill:'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false}
                     interval="preserveStartEnd" minTickGap={40} />
              <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} width={58}
                     domain={[domainMin, domainMax]} tickFormatter={v => fmtK(v, true)} />
              <Tooltip content={<EquityTooltip />} cursor={{ stroke:'rgba(255,255,255,0.25)', strokeWidth: 1, strokeDasharray:'4 4' }} />
              <Area type="monotone" dataKey="pnl" stroke="url(#perfEqLineGrad)" strokeWidth={2} fill="url(#perfEqAreaGrad)"
                    isAnimationActive animationDuration={1400} animationEasing="ease-out" dot={false}
                    activeDot={(props) => {
                      const { cx, cy, payload } = props
                      const pos = (payload?.pnl ?? 0) >= 0
                      const col = pos ? '#22C55E' : '#EF4444'
                      return (
                        <g key={`peqd-${cx}-${cy}`}>
                          <circle cx={cx} cy={cy} r={13} fill={pos ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'} />
                          <circle cx={cx} cy={cy} r={8} fill={pos ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)'} />
                          <circle cx={cx} cy={cy} r={4} fill={col} stroke="#0b0a16" strokeWidth={2}
                                  filter={`url(#${pos ? 'perfDotGlowG' : 'perfDotGlowR'})`} />
                        </g>
                      )
                    }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── Asset Class Performance ──────────────────────────────────────────────────
function AssetClassCard({ data }) {
  return (
    <div className="glass-card p-5">
      <CardHeader icon={Scale} iconBg="rgba(99,102,241,0.18)" iconColor="#818CF8" title="Asset Class Performance" />
      {data.length === 0 ? <EmptyState /> : (
        <>
          <div style={{ height: 160 }} className="mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" tick={{ fill:'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false}
                       tickFormatter={v => fmtK(v)} />
                <YAxis type="category" dataKey="assetClass" width={92} tick={{ fill:'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600 }}
                       axisLine={false} tickLine={false} />
                <ReferenceLine x={0} stroke="rgba(255,255,255,0.12)" />
                <Tooltip cursor={{ fill:'rgba(255,255,255,0.04)' }}
                         content={({ active, payload }) => {
                           if (!active || !payload?.length) return null
                           const d = payload[0].payload
                           return <ChartTooltip title={d.assetClass} value={fmtFull(d.pnl)} valueColor={d.pnl >= 0 ? '#22C55E' : '#EF4444'}
                                                 sub={`${d.count} trades · ${d.winRate.toFixed(0)}% win`} />
                         }} />
                <Bar dataKey="pnl" radius={[4,4,4,4]} maxBarSize={32} isAnimationActive animationDuration={1000}>
                  {data.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#22C55E' : '#EF4444'} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-4 pt-4" style={{ borderTop:'1px solid rgba(255,255,255,0.05)' }}>
            {data.map(d => (
              <div key={d.assetClass} className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color:'var(--text-primary)' }}>{d.assetClass}</span>
                <span className="text-xs" style={{ color:'var(--text-muted)' }}>{d.count} trades &middot; {d.winRate.toFixed(0)}% win</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Time of Day Performance ──────────────────────────────────────────────────
function TimeOfDayCard({ ranked }) {
  const chartData = ranked.map((b, i) => ({ idx: i, pnl: b.pnl, hourLabel: b.hourLabel }))
  const top3 = ranked.slice(0, 3)
  return (
    <div className="glass-card p-5">
      <CardHeader icon={Clock} iconBg="rgba(245,158,11,0.18)" iconColor="#F59E0B" title="Time of Day Performance" />
      {ranked.length === 0 ? <EmptyState /> : (
        <>
          <div style={{ height: 160 }} className="mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="todGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="hourLabel" tick={{ fill:'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false}
                       interval="preserveStartEnd" minTickGap={20} />
                <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} width={54} tickFormatter={v => fmtK(v)} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload
                  return <ChartTooltip title={d.hourLabel} value={fmtFull(d.pnl)} valueColor={d.pnl >= 0 ? '#22C55E' : '#EF4444'} />
                }} />
                <Area type="monotone" dataKey="pnl" stroke="#3B82F6" strokeWidth={2} fill="url(#todGrad)"
                      isAnimationActive animationDuration={1100} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4" style={{ borderTop:'1px solid rgba(255,255,255,0.05)' }}>
            {[0,1,2].map(i => {
              const h = top3[i]
              return (
                <div key={i} className="rounded-xl p-2.5 text-center" style={{ background:'rgba(255,255,255,0.03)' }}>
                  <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color:'var(--text-muted)' }}>#{i + 1} Best</p>
                  {h ? (
                    <>
                      <p className="text-sm font-bold" style={{ color:'var(--text-primary)' }}>{h.hourLabel}</p>
                      <p className="text-xs font-semibold mt-0.5" style={{ color: h.pnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }}>{fmtK(h.pnl, true)}</p>
                    </>
                  ) : <p className="text-xs" style={{ color:'var(--text-muted)' }}>—</p>}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Drawdown Analysis ────────────────────────────────────────────────────────
function DrawdownCard({ series }) {
  const { points, maxDrawdown, maxDrawdownPct, maxDate } = series
  const chartData = points.map((p, i) => ({ idx: i, drawdown: p.drawdown, label: fmtShortDate(p.date) }))
  return (
    <div className="glass-card p-5">
      <CardHeader icon={TrendingDown} iconBg="rgba(239,68,68,0.15)" iconColor="#EF4444" title="Drawdown Analysis"
                  info="How far your cumulative P&L has fallen below its running peak, updated after every closed trade." />
      {points.length === 0 ? <EmptyState /> : (
        <>
          <div style={{ height: 160 }} className="mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EF4444" stopOpacity={0.04} />
                    <stop offset="100%" stopColor="#EF4444" stopOpacity={0.38} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill:'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false}
                       interval="preserveStartEnd" minTickGap={30} />
                <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} width={58} tickFormatter={v => fmtK(v)} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload
                  return <ChartTooltip title={d.label} value={fmtFull(d.drawdown)} valueColor="#EF4444" sub="Drawdown from peak" />
                }} />
                <Area type="monotone" dataKey="drawdown" stroke="#EF4444" strokeWidth={2} fill="url(#ddGrad)"
                      isAnimationActive animationDuration={1100} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4" style={{ borderTop:'1px solid rgba(255,255,255,0.05)' }}>
            <MiniStat label="Max Drawdown" value={fmtK(maxDrawdown)} color="var(--negative-red)" />
            <MiniStat label="Max DD %" value={`${maxDrawdownPct.toFixed(1)}%`} color="var(--negative-red)" />
            <MiniStat label="Date" value={maxDate ? fmtShortDate(maxDate.slice(0, 10)) : '—'} color="var(--text-primary)" />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Streak Tracking ──────────────────────────────────────────────────────────
function StreakTrackingCard({ tracking }) {
  const { current, currentType, longestWin, longestLoss, history } = tracking
  const isLoss = currentType === 'loss'
  const streakColor = current === 0 ? 'var(--text-muted)' : isLoss ? 'var(--negative-red)' : 'var(--positive-green)'
  return (
    <div className="glass-card p-5">
      <CardHeader icon={Flame} iconBg="rgba(245,158,11,0.15)" iconColor="#F59E0B" title="Streak Tracking"
                  info="Consecutive winning or losing trades, in a row, most recent first." />
      <div className="mt-4">
        <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color:'var(--text-muted)' }}>Current Streak</p>
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-bold" style={{ color: streakColor }}><AnimatedNumber value={current} decimals={0} /></p>
          <span className="text-sm font-semibold" style={{ color: streakColor }}>
            {current === 0 ? 'No active streak' : isLoss ? 'Losing Streak' : 'Winning Streak'}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-4">
        <MiniStat label="Longest Win"  value={longestWin}  color="var(--positive-green)" />
        <MiniStat label="Longest Loss" value={longestLoss} color="var(--negative-red)" />
      </div>
      <div className="mt-4 pt-4" style={{ borderTop:'1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-[9px] font-bold uppercase tracking-wider mb-2" style={{ color:'var(--text-muted)' }}>History</p>
        {history.length === 0 ? (
          <p className="text-xs" style={{ color:'var(--text-muted)' }}>No closed trades yet</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {history.map(h => (
              <span key={h.id} className="px-2 py-1 rounded-md text-[11px] font-bold"
                    style={{ background: h.isWin ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                             color: h.isWin ? '#22C55E' : '#EF4444' }}>
                {h.isWin ? 'W' : 'L'}{h.length}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Performance by Symbol ────────────────────────────────────────────────────
function SymbolPerformanceRow({ data }) {
  return (
    <div className="glass-card p-5">
      <CardHeader icon={BarChart2} iconBg="rgba(139,92,246,0.18)" iconColor="#A78BFA" title="Performance by Symbol" />
      {data.length === 0 ? <EmptyState /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {data.slice(0, 8).map(s => (
            <div key={s.symbol} className="rounded-xl px-4 py-3.5 flex items-center gap-3"
                 style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.05)' }}>
              <div className="w-1 rounded-full flex-shrink-0" style={{ background: s.pnl >= 0 ? '#22C55E' : '#EF4444', minHeight: 36, alignSelf:'stretch' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color:'var(--text-primary)' }}>{s.symbol}</p>
                <p className="text-[10px] mt-0.5" style={{ color:'var(--text-muted)' }}>{s.count} trade{s.count !== 1 ? 's' : ''}</p>
              </div>
              <span className="text-sm font-bold flex-shrink-0" style={{ color: s.pnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }}>
                {fmtFull(s.pnl)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Trading Heatmap (Day x Hour) ─────────────────────────────────────────────
const HEATMAP_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const HEATMAP_HOURS = Array.from({ length: 24 }, (_, h) => h)

function TradingHeatmapCard({ grid }) {
  const hasAny = Object.keys(grid).length > 0
  return (
    <div className="glass-card p-5">
      <CardHeader icon={Grid3x3} iconBg="rgba(59,130,246,0.15)" iconColor="#60A5FA" title="Trading Heatmap" subtitle="(Day x Hour)" />
      {!hasAny ? <EmptyState /> : (
        <div className="mt-4 overflow-x-auto">
          <div style={{ minWidth: 820 }}>
            <div className="flex gap-1 mb-1">
              <div style={{ width: 40, flexShrink: 0 }} />
              {HEATMAP_HOURS.map(h => (
                <div key={h} className="flex-1 text-center text-[9px]" style={{ color:'var(--text-muted)', minWidth: 28 }}>
                  {pad(h)}
                </div>
              ))}
            </div>
            <div className="space-y-1">
              {HEATMAP_DAYS.map(day => (
                <div key={day} className="flex gap-1 items-center">
                  <div className="text-[10px] font-semibold" style={{ width: 40, flexShrink: 0, color:'var(--text-muted)' }}>{day}</div>
                  {HEATMAP_HOURS.map(h => {
                    const cell = grid[`${day}|${h}`]
                    const bg = !cell ? 'rgba(255,255,255,0.03)' : cell.pnl >= 0 ? 'rgba(34,197,94,0.78)' : 'rgba(239,68,68,0.78)'
                    return (
                      <div key={h} title={cell ? `${day} ${pad(h)}:00 — ${fmtFull(cell.pnl)} (${cell.count} trades)` : `${day} ${pad(h)}:00 — no trades`}
                           className="flex-1 rounded-md flex items-center justify-center text-[10px] font-bold transition-transform hover:scale-110"
                           style={{ background: bg, color: cell ? '#0b0a16' : 'transparent', minWidth: 28, height: 26 }}>
                        {cell ? cell.count : ''}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-5 mt-4">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ background:'rgba(239,68,68,0.78)' }} />
                <span className="text-xs" style={{ color:'var(--text-muted)' }}>Loss</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ background:'rgba(255,255,255,0.06)' }} />
                <span className="text-xs" style={{ color:'var(--text-muted)' }}>No trades</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ background:'rgba(34,197,94,0.78)' }} />
                <span className="text-xs" style={{ color:'var(--text-muted)' }}>Profit</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Risk-Adjusted Performance ────────────────────────────────────────────────
function RiskMetricTile({ label, value, sub, barPct, barColor, valueColor, info }) {
  return (
    <div className="rounded-xl p-4" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.05)' }}>
      <div className="flex items-center gap-1.5 mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color:'var(--text-muted)' }}>{label}</p>
        <InfoTip text={info} />
      </div>
      <p className="text-2xl font-bold mb-1.5" style={{ color: valueColor }}>{value}</p>
      <p className="text-[11px] mb-3" style={{ color:'var(--text-muted)' }}>{sub}</p>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background:'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${barPct}%`, background: barColor }} />
      </div>
    </div>
  )
}

function RiskAdjustedCard({ metrics }) {
  const { sharpe, sortino, kelly, hasData } = metrics
  const sharpePct  = Math.max(4, Math.min(100, (sharpe / 5) * 100))
  const sortinoPct = Math.max(4, Math.min(100, (sortino / 10) * 100))
  const kellyPct   = Math.max(4, Math.min(100, (Math.abs(kelly) / 25) * 100))

  return (
    <div className="glass-card p-5">
      <CardHeader icon={Scale} iconBg="rgba(139,92,246,0.18)" iconColor="#A78BFA" title="Risk-Adjusted Performance"
                  info="How your returns compare to their volatility — higher is generally better risk-adjusted efficiency." />
      {!hasData ? <EmptyState /> : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <RiskMetricTile label="Sharpe Ratio" value={sharpe.toFixed(2)} sub={sharpeRatingLabel(sharpe)}
                          barPct={sharpePct} barColor="#22C55E" valueColor={sharpe >= 0 ? 'var(--positive-green)' : 'var(--negative-red)'}
                          info="Return per unit of overall volatility across all trades. Above 2 is considered strong." />
          <RiskMetricTile label="Sortino Ratio" value={sortino >= 12 ? '12+' : sortino.toFixed(2)} sub={sortinoRatingLabel(sortino)}
                          barPct={sortinoPct} barColor="#22C55E" valueColor={sortino >= 0 ? 'var(--positive-green)' : 'var(--negative-red)'}
                          info="Like Sharpe, but only penalizes downside volatility from losing trades. Higher is better." />
          <RiskMetricTile label="Kelly Criterion" value={`${kelly >= 0 ? '+' : ''}${kelly.toFixed(1)}%`} sub={kellyRatingLabel(kelly)}
                          barPct={kellyPct} barColor="#8B5CF6" valueColor="#A78BFA"
                          info="Theoretical optimal % of capital to risk per trade, derived from your win rate and payoff ratio." />
        </div>
      )}
    </div>
  )
}

// ─── Avg Hold Time: Winners vs Losers ─────────────────────────────────────────
function AvgHoldTimeCard({ data }) {
  const { winMin, lossMin, winCount, lossCount, insight } = data
  const maxMin = Math.max(winMin, lossMin, 1)
  return (
    <div className="glass-card p-5">
      <CardHeader icon={Clock} iconBg="rgba(45,212,191,0.15)" iconColor="#2DD4BF" title="Avg Hold Time: Winners vs Losers"
                  info="Average time-in-trade for winning trades versus losing trades." />
      {(winCount === 0 && lossCount === 0) ? <EmptyState /> : (
        <div className="mt-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold" style={{ color:'var(--positive-green)' }}>Winning Trades</span>
              <span className="text-sm font-bold" style={{ color:'var(--positive-green)' }}>{fmtMin(winMin)}</span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background:'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(4, (winMin / maxMin) * 100)}%`, background:'linear-gradient(90deg,#16A34A,#22C55E)' }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold" style={{ color:'var(--negative-red)' }}>Losing Trades</span>
              <span className="text-sm font-bold" style={{ color:'var(--negative-red)' }}>{fmtMin(lossMin)}</span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background:'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(4, (lossMin / maxMin) * 100)}%`, background:'linear-gradient(90deg,#DC2626,#EF4444)' }} />
            </div>
          </div>
          {insight && (
            <div className="rounded-xl p-3.5 mt-1" style={{
              background: insight.tone === 'warning' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
              border: `1px solid ${insight.tone === 'warning' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
            }}>
              <p className="text-xs leading-relaxed" style={{ color: insight.tone === 'warning' ? '#FCA5A5' : '#86EFAC' }}>
                {insight.tone === 'warning' ? '⚠ ' : '✓ '}{insight.text}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── P&L Distribution ─────────────────────────────────────────────────────────
function PnlDistributionCard({ histogram }) {
  const { buckets } = histogram
  return (
    <div className="glass-card p-5">
      <CardHeader icon={BarChart2} iconBg="rgba(245,158,11,0.15)" iconColor="#F59E0B" title="P&L Distribution"
                  info="How many closed trades fall into each profit/loss range." />
      {buckets.length === 0 ? <EmptyState /> : (
        <div style={{ height: 210 }} className="mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 4, right: 0, left: 0, bottom: 20 }} barCategoryGap="18%">
              <XAxis dataKey="label" tick={{ fill:'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false}
                     interval={0} angle={-35} textAnchor="end" height={40} />
              <YAxis tick={{ fill:'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} width={26} allowDecimals={false} />
              <Tooltip cursor={{ fill:'rgba(255,255,255,0.04)' }}
                       content={({ active, payload }) => {
                         if (!active || !payload?.length) return null
                         const d = payload[0].payload
                         return <ChartTooltip title={d.label} value={`${d.count} trade${d.count !== 1 ? 's' : ''}`} valueColor={d.isProfit ? '#22C55E' : '#EF4444'} />
                       }} />
              <Bar dataKey="count" radius={[4,4,0,0]} maxBarSize={28} isAnimationActive animationDuration={900}>
                {buckets.map((b, i) => <Cell key={i} fill={b.isProfit ? '#22C55E' : '#EF4444'} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── Rolling Performance ──────────────────────────────────────────────────────
function RollingPerformanceCard({ rolling }) {
  return (
    <div className="glass-card p-5">
      <CardHeader icon={Activity} iconBg="rgba(139,92,246,0.18)" iconColor="#A78BFA" title="Rolling Performance"
                  subtitle="20-trade rolling window — tracks current form"
                  info="Win rate and profit factor recalculated over the trailing 20 trades, trade by trade." />
      {rolling.length === 0 ? <EmptyState /> : (
        <>
          <div style={{ height: 260 }} className="mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rolling} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="tradeNum" tick={{ fill:'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false}
                       label={{ value:'Trade #', position:'insideBottom', offset: -4, fill:'rgba(255,255,255,0.3)', fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fill:'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false}
                       domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill:'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false}
                       domain={[0, 12]} tickFormatter={v => `${v}x`} />
                <ReferenceLine yAxisId="left" y={50} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
                <ReferenceLine yAxisId="right" y={1} stroke="rgba(139,92,246,0.25)" strokeDasharray="4 4" />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const wr = payload.find(p => p.dataKey === 'winRate')?.value
                  const pf = payload.find(p => p.dataKey === 'profitFactor')?.value
                  return (
                    <div style={{ background:'#181722', border:'1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding:'8px 14px', fontSize: 12 }}>
                      <p style={{ color:'rgba(255,255,255,0.4)', marginBottom: 4 }}>Trade #{label}</p>
                      <p style={{ color:'#22C55E' }}>Win Rate: {wr?.toFixed(1)}%</p>
                      <p style={{ color:'#8B5CF6' }}>Profit Factor: {pf?.toFixed(2)}x</p>
                    </div>
                  )
                }} />
                <Line yAxisId="left" type="monotone" dataKey="winRate" stroke="#22C55E" strokeWidth={2} dot={false}
                      isAnimationActive animationDuration={1200} />
                <Line yAxisId="right" type="monotone" dataKey="profitFactor" stroke="#8B5CF6" strokeWidth={2} dot={false}
                      isAnimationActive animationDuration={1200} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-5 mt-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded-full" style={{ background:'#22C55E' }} />
              <span className="text-xs" style={{ color:'var(--text-muted)' }}>Win Rate (left axis)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded-full" style={{ background:'#8B5CF6' }} />
              <span className="text-xs" style={{ color:'var(--text-muted)' }}>Profit Factor (right axis)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded-full" style={{ background:'rgba(255,255,255,0.3)' }} />
              <span className="text-xs" style={{ color:'var(--text-muted)' }}>50% / 1.0x baselines</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Trading Calendar (kept from the existing implementation, relocated to
// the end of the page per the reference layout) ───────────────────────────
const CAL_BLUE = '#3B82F6'
const CAL_RED  = '#EF4444'

function TradingCalendar({ byDate, closed }) {
  const [view,     setView]     = useState(new Date())
  const [selected, setSelected] = useState(null)
  const yr  = view.getFullYear()
  const mo  = view.getMonth()
  const HDRS     = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  const firstDow = (new Date(yr, mo, 1).getDay() + 6) % 7
  const daysInMo = new Date(yr, mo+1, 0).getDate()
  const todayStr = new Date().toISOString().slice(0,10)

  const weeks = useMemo(() => {
    const wks = []; let wk = []
    for (let i=0; i<firstDow; i++) wk.push(null)
    for (let d=1; d<=daysInMo; d++) {
      wk.push(d)
      if (wk.length===7) { wks.push(wk); wk=[] }
    }
    if (wk.length>0) { while(wk.length<7) wk.push(null); wks.push(wk) }
    return wks
  }, [yr, mo, firstDow, daysInMo])

  function dKey(day) { return day?`${yr}-${pad(mo+1)}-${pad(day)}`:null }

  function wkSum(wk) {
    let pnl=0,days=0
    wk.forEach(d => { const data=byDate[dKey(d)]; if(data?.count>0){pnl+=data.pnl;days++} })
    return { pnl, days }
  }

  // Reset the selected day whenever the visible month changes, so the panel
  // falls back to its empty state instead of showing a stale prior selection.
  useEffect(() => { setSelected(null) }, [yr, mo])

  const selTrades = selected ? closed.filter(t=>t.closed_at?.slice(0,10)===selected) : []
  const selData   = selected ? byDate[selected] : null
  const selDay    = selected ? parseInt(selected.split('-')[2]) : null

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <Calendar size={17} style={{ color:'var(--text-secondary)' }} />
          <div>
            <h3 className="font-bold text-[15px]" style={{ color:'var(--text-primary)' }}>Trading Calendar</h3>
            <p className="text-xs" style={{ color:'var(--text-muted)' }}>Daily P&amp;L heatmap · Click on days to see trades</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setView(d=>new Date(d.getFullYear(),d.getMonth()-1,1))}
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors"
                  style={{ background:'rgba(255,255,255,0.05)', color:'var(--text-secondary)' }}>
            <ChevronLeft size={14}/>
          </button>
          <span className="text-sm font-bold px-1 min-w-[104px] text-center" style={{ color:'var(--text-primary)' }}>
            {MONTHS[mo]} {yr}
          </span>
          <button onClick={()=>setView(d=>new Date(d.getFullYear(),d.getMonth()+1,1))}
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors"
                  style={{ background:'rgba(255,255,255,0.05)', color:'var(--text-secondary)' }}>
            <ChevronRight size={14}/>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">
        <div className="min-w-0">
          <div className="grid gap-1.5 mb-1.5" style={{ gridTemplateColumns:'repeat(7,1fr) 108px' }}>
            {HDRS.map(h=>(
              <div key={h} className="text-center text-[10px] font-bold py-1.5 tracking-wide" style={{ color:'var(--text-muted)' }}>{h.toUpperCase()}</div>
            ))}
            <div className="text-center text-[10px] font-bold py-1.5 tracking-wide" style={{ color:'var(--text-muted)' }}>WEEKLY</div>
          </div>

          {weeks.map((wk,wi) => {
            const sum = wkSum(wk)
            const isHot = sum.days>0
            const weekColor = sum.pnl>0 ? CAL_BLUE : sum.pnl<0 ? CAL_RED : 'var(--text-muted)'
            return (
              <div key={wi} className="grid gap-1.5 mb-1.5" style={{ gridTemplateColumns:'repeat(7,1fr) 108px' }}>
                {wk.map((day,di) => {
                  const key  = dKey(day)
                  const data = key?byDate[key]:null
                  const has  = data?.count>0
                  const pnl  = data?.pnl??0
                  const isSel   = key===selected
                  const isToday = key===todayStr

                  // Days outside the current month (padding cells) render as
                  // blank, subtly blue-outlined placeholders.
                  if (!day) return (
                    <div key={di} className="rounded-xl min-h-[76px]"
                         style={{ background:'rgba(255,255,255,0.015)', border:'1px solid rgba(59,130,246,0.18)' }}/>
                  )

                  let bg='rgba(255,255,255,0.025)', bdr='1px solid rgba(255,255,255,0.06)', pc='var(--text-muted)'
                  if (has) {
                    if (pnl>0) { bg='rgba(59,130,246,0.10)'; pc=CAL_BLUE; bdr='1px solid rgba(59,130,246,0.25)' }
                    if (pnl<0) { bg='rgba(239,68,68,0.10)';  pc=CAL_RED;  bdr='1px solid rgba(239,68,68,0.25)' }
                  }
                  if (isSel) bdr = `2px solid ${pnl>0?CAL_BLUE:pnl<0?CAL_RED:'#8B5CF6'}`
                  else if (isToday) bdr = '1.5px solid rgba(139,92,246,0.6)'

                  return (
                    <button key={di} onClick={()=>setSelected(isSel?null:key)}
                            className="rounded-xl p-2.5 text-left transition-all min-h-[76px] flex flex-col"
                            style={{ background:bg, border:bdr }}
                            onMouseEnter={e=>{if(!isSel)e.currentTarget.style.borderColor='rgba(59,130,246,0.4)'}}
                            onMouseLeave={e=>{if(!isSel)e.currentTarget.style.borderColor=has?(pnl>0?'rgba(59,130,246,0.25)':'rgba(239,68,68,0.25)'):(isToday?'rgba(139,92,246,0.6)':'rgba(255,255,255,0.06)')}}>
                      <span className="text-[11px] font-semibold mb-auto"
                            style={{ color:isToday?'#A78BFA':'var(--text-muted)' }}>{day}</span>
                      {has && <>
                        <span className="text-[13px] font-bold leading-tight mt-1" style={{ color:pc }}>{fmtK(pnl,true)}</span>
                        <span className="text-[10px] mt-0.5" style={{ color:'rgba(255,255,255,0.32)' }}>
                          {data.count} trade{data.count===1?'':'s'}
                        </span>
                      </>}
                    </button>
                  )
                })}
                <div className="rounded-xl p-2.5 flex flex-col items-center justify-center text-center"
                     style={{ background:isHot?'rgba(59,130,246,0.1)':'rgba(255,255,255,0.025)',
                              border:isHot?'1px solid rgba(59,130,246,0.22)':'1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-[9px] font-bold uppercase tracking-wider mb-1"
                     style={{ color:isHot?'rgba(147,197,253,0.75)':'var(--text-muted)' }}>WEEKLY</p>
                  <p className="text-sm font-bold" style={{ color:weekColor }}>
                    {sum.days>0?fmtK(sum.pnl,true):'$0'}
                  </p>
                  <p className="text-[9px] mt-0.5" style={{ color:'rgba(255,255,255,0.32)' }}>
                    Traded Days {sum.days}
                  </p>
                </div>
              </div>
            )
          })}
          <div className="flex items-center gap-5 mt-3 pt-3" style={{ borderTop:'1px solid rgba(255,255,255,0.05)' }}>
            {[{dot:CAL_BLUE,l:'Profitable Day'},{dot:CAL_RED,l:'Losing Day'},{dot:'rgba(255,255,255,0.2)',l:'No Trades'}].map(x=>(
              <div key={x.l} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background:x.dot }}/>
                <span className="text-xs" style={{ color:'var(--text-muted)' }}>{x.l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Day Trades panel — always visible; shows an empty state until a
            day with trades is selected. */}
        <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background:'#19181C', border:'1px solid rgba(255,255,255,0.09)' }}>
          <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2">
              <ClipboardList size={14} style={{ color:CAL_BLUE }}/>
              <span className="text-sm font-bold" style={{ color:'var(--text-primary)' }}>
                {selected ? `Trades on ${MON_S[mo]} ${selDay}` : 'Day Trades'}
              </span>
            </div>
            {selected && (
              <button onClick={()=>setSelected(null)} className="p-1 rounded-lg hover:bg-white/5 transition-colors"
                      style={{ color:'var(--text-muted)' }}><X size={12}/></button>
            )}
          </div>

          {!selected || selTrades.length===0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-14">
              <Calendar size={36} className="mb-3" style={{ color:'var(--text-muted)', opacity:0.25 }} />
              <p className="text-sm" style={{ color:'var(--text-muted)' }}>
                Click on a day with trades<br/>to view details
              </p>
            </div>
          ) : (
            <>
              {selData && (
                <div className="grid grid-cols-3 gap-2 px-4 py-3" style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
                  {[
                    { label:'TOTAL P&L', value:fmtK(selData.pnl,true), color:selData.pnl>=0?CAL_BLUE:CAL_RED },
                    { label:'TRADES',    value:selData.count,          color:'var(--text-primary)' },
                    { label:'WIN RATE',
                      value:`${selTrades.length>0?Math.round((selTrades.filter(t=>(t.pnl||0)>0).length/selTrades.length)*100):0}%`,
                      color:'var(--text-primary)' },
                  ].map(s=>(
                    <div key={s.label} className="text-center">
                      <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color:'rgba(255,255,255,0.3)' }}>{s.label}</p>
                      <p className="text-base font-bold" style={{ color:s.color }}>{s.value}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="px-3 py-2 space-y-1.5 max-h-72 overflow-y-auto">
                {selTrades.map(t=>{
                  const isLong = t.side==='BUY'
                  return(
                    <div key={t.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                         style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.05)' }}>
                      <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                           style={{ background:isLong?'rgba(59,130,246,0.2)':'rgba(239,68,68,0.15)' }}>
                        {isLong?<TrendingUp size={13} style={{ color:CAL_BLUE }}/>
                               :<TrendingDown size={13} style={{ color:CAL_RED }}/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold" style={{ color:'var(--text-primary)' }}>{t.symbol}</p>
                        <p className="text-[10px]" style={{ color:'rgba(255,255,255,0.3)' }}>
                          {t.size??'—'}{t.entry_price?` @ ${t.entry_price}`:''}
                        </p>
                      </div>
                      <span className="text-xs font-bold" style={{ color:(t.pnl||0)>=0?CAL_BLUE:CAL_RED }}>
                        {fmtK(t.pnl,true)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function Performance() {
  const { user } = useAuth()
  const { trades, account, syncing, syncTrades, isManualAccount } = useTrades(user?.id)

  // Every stat and chart on this page derives from `closed` below — the
  // full closed-trade history, matching the reference design (no time or
  // winner/loser filters on this page).
  const closed = useMemo(() => trades.filter(t => t.status === 'closed'), [trades])

  const stats  = useMemo(() => computeStats(closed), [closed])
  const wins   = useMemo(() => closed.filter(t => (t.pnl || 0) > 0), [closed])
  const losses = useMemo(() => closed.filter(t => (t.pnl || 0) <= 0), [closed])
  const expectancy = closed.length > 0
    ? (stats.winRate / 100) * stats.avgWin + (1 - stats.winRate / 100) * stats.avgLoss
    : 0

  const byDate = useMemo(() => {
    const m = {}
    closed.forEach(t => {
      const k = t.closed_at?.slice(0, 10); if (!k) return
      if (!m[k]) m[k] = { pnl: 0, count: 0 }
      m[k].pnl += t.pnl || 0; m[k].count++
    })
    return m
  }, [closed])

  const assetClassData   = useMemo(() => computeAssetClassBreakdown(closed), [closed])
  const hourlyRanked      = useMemo(() => rankHourlyPerformance(closed), [closed])
  const drawdownSeries    = useMemo(() => computeDrawdownSeries(closed), [closed])
  const streakTracking    = useMemo(() => computeStreakTracking(closed), [closed])
  const symbolBreakdown   = useMemo(() => computeSymbolBreakdown(closed), [closed])
  const heatmapGrid       = useMemo(() => computeTradingHeatmap(closed), [closed])
  const riskAdjusted      = useMemo(() => computeRiskAdjustedMetrics(closed), [closed])
  const avgHoldTime       = useMemo(() => computeAvgHoldTimeByOutcome(closed), [closed])
  const pnlHistogram      = useMemo(() => computePnlHistogram(closed), [closed])
  const rollingPerf       = useMemo(() => computeRollingPerformance(closed, 20), [closed])

  const hasAnyTrades = trades.length > 0

  return (
    <PageWrapper onSync={account && !isManualAccount ? syncTrades : undefined} syncing={syncing}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Analytics</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Deep dive into your trading performance</p>
      </div>

      {!hasAnyTrades ? (
        <div className="glass-card p-12 text-center">
          <BarChart2 size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No trade data yet</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Sync your MT5 account or log a trade to unlock your performance analytics.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <HeroStats stats={stats} wins={wins} losses={losses} closed={closed} expectancy={expectancy} />
          <SecondaryStats stats={stats} />

          <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4">
            <PnlPeriodCard closed={closed} />
            <WinLossCard wins={wins} losses={losses} />
          </div>

          <EquityCurveSection closed={closed} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AssetClassCard data={assetClassData} />
            <TimeOfDayCard ranked={hourlyRanked} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DrawdownCard series={drawdownSeries} />
            <StreakTrackingCard tracking={streakTracking} />
          </div>

          <SymbolPerformanceRow data={symbolBreakdown} />

          <TradingHeatmapCard grid={heatmapGrid} />

          <RiskAdjustedCard metrics={riskAdjusted} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AvgHoldTimeCard data={avgHoldTime} />
            <PnlDistributionCard histogram={pnlHistogram} />
          </div>

          <RollingPerformanceCard rolling={rollingPerf} />

          <TradingCalendar byDate={byDate} closed={closed} />
        </div>
      )}
    </PageWrapper>
  )
}