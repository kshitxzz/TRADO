import { useMemo, useState, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell,
} from 'recharts'
import PageWrapper from '../../components/layout/PageWrapper'
import { useAuth } from '../../hooks/useAuth'
import { useTrades } from '../../hooks/useTrades'
import { computeStats, buildEquityCurve, pnlColor } from '../../lib/utils'
import {
  TrendingUp, TrendingDown, Clock, BarChart2, Target, Zap,
  Award, ChevronLeft, ChevronRight, Calendar, X,
  DollarSign, Activity, Scale, LayoutGrid, CheckCircle, LineChart,
  ClipboardList,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']
const MON_S  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
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
function fmtDate(str) {
  if (!str) return ''
  const d = new Date(str)
  return `${MON_S[d.getMonth()]} ${d.getDate()}`
}
function pfLabel(pf) {
  if (!isFinite(pf) || pf > 3) return 'Excellent'
  if (pf > 2)   return 'Very Good'
  if (pf > 1.5) return 'Good'
  if (pf > 1)   return 'Average'
  return 'Below 1'
}

// ─── Hero Stats Row ───────────────────────────────────────────────────────────
function HeroStats({ stats, wins, losses, closed, expectancy }) {
  const cards = [
    {
      icon: Target,
      iconBg: 'rgba(139,92,246,0.2)', iconColor: '#8B5CF6',
      badge: 'Key Metric',
      label: 'WIN RATE',
      value: `${stats.winRate.toFixed(1)}%`,
      valueColor: stats.winRate >= 50 ? 'var(--positive-green)' : 'var(--text-primary)',
      sub: `${wins.length}W / ${losses.length}L`,
    },
    {
      icon: TrendingUp,
      iconBg: 'rgba(34,197,94,0.18)', iconColor: '#22C55E',
      label: 'PROFIT FACTOR',
      value: stats.profitFactor > 99 ? '∞' : stats.profitFactor.toFixed(2),
      valueColor: stats.profitFactor >= 1.5 ? 'var(--positive-green)' : stats.profitFactor >= 1 ? '#F59E0B' : 'var(--negative-red)',
      sub: pfLabel(stats.profitFactor),
    },
    {
      icon: Activity,
      iconBg: 'rgba(59,130,246,0.18)', iconColor: '#3B82F6',
      label: 'EXPECTANCY',
      value: fmtFull(expectancy),
      valueColor: expectancy >= 0 ? 'var(--positive-green)' : 'var(--negative-red)',
      sub: 'Per trade average',
    },
    {
      icon: DollarSign,
      iconBg: 'rgba(34,197,94,0.18)', iconColor: '#22C55E',
      label: 'TOTAL P&L',
      value: fmtFull(stats.totalPnl),
      valueColor: pnlColor(stats.totalPnl),
      sub: `${closed.length} trades`,
    },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="glass-card p-5">
          <div className="flex items-start justify-between mb-3">
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
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
             style={{ color:'var(--text-muted)' }}>{c.label}</p>
          <p className="text-2xl font-bold leading-tight mb-1" style={{ color: c.valueColor }}>{c.value}</p>
          <p className="text-xs" style={{ color:'var(--text-muted)' }}>{c.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Secondary Stats Row ──────────────────────────────────────────────────────
function SecondaryStats({ stats }) {
  const avgRR = stats.avgLoss !== 0
    ? `${(Math.abs(stats.avgWin) / Math.abs(stats.avgLoss)).toFixed(2)}:1`
    : '∞'
  const rows = [
    { icon: TrendingUp,   iconColor:'#22C55E', label:'AVG WIN',
      value:fmtFull(stats.avgWin),       color:'var(--positive-green)' },
    { icon: TrendingDown, iconColor:'#EF4444', label:'AVG LOSS',
      value:fmtFull(stats.avgLoss), color:'var(--negative-red)' },
    { icon: Award,        iconColor:'#22C55E', label:'LARGEST WIN',
      value:fmtFull(Math.max(0, stats.bestTrade)), color:'var(--positive-green)' },
    { icon: TrendingDown, iconColor:'#EF4444', label:'LARGEST LOSS',
      value:fmtFull(Math.min(0, stats.worstTrade)), color:'var(--negative-red)' },
    { icon: Scale, iconColor:'rgba(255,255,255,0.4)', label:'AVG R:R',
      value:avgRR, color:'var(--text-primary)' },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {rows.map(r => (
        <div key={r.label} className="glass-card px-4 py-3.5 flex items-center gap-3">
          <div className="flex-shrink-0">
            <r.icon size={15} style={{ color: r.iconColor }} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5"
               style={{ color:'var(--text-muted)' }}>{r.label}</p>
            <p className="text-sm font-bold" style={{ color: r.color }}>{r.value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Animated Equity Curve ────────────────────────────────────────────────────

const PERIODS = ['1W','1M','3M','6M','ALL']
const DOW     = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const padN    = n => String(n).padStart(2,'0')
const toStr   = d => `${d.getFullYear()}-${padN(d.getMonth()+1)}-${padN(d.getDate())}`

// ─── Tooltip ──────────────────────────────────────────────────────────────────
function EquityTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const item  = payload[0]?.payload
  if (!item) return null
  const pnl   = item.pnl ?? 0
  const isPos = pnl >= 0
  const color = isPos ? '#22C55E' : '#EF4444'
  const d     = new Date(item.date + 'T00:00:00')

  return (
    <div style={{
      background: 'rgba(13,12,26,0.97)',
      border: `1px solid ${isPos ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
      borderRadius: 12, padding: '12px 16px', minWidth: 180,
      boxShadow: `0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)`,
      backdropFilter: 'blur(20px)', fontFamily: 'Poppins, sans-serif',
    }}>
      <p style={{ color:'rgba(255,255,255,0.4)', fontSize:11, marginBottom:8, fontWeight:500 }}>
        {DOW[d.getDay()]}, {MON_S[d.getMonth()]} {d.getDate()}, {d.getFullYear()}
      </p>
      <p style={{ color, fontSize:22, fontWeight:700, letterSpacing:'-0.5px', marginBottom:4 }}>
        {pnl >= 0 ? '+$' : '-$'}{Math.abs(pnl).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
      </p>
      <p style={{ color:'rgba(255,255,255,0.25)', fontSize:10, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase' }}>
        Cumulative P&L
      </p>
    </div>
  )
}

// ─── Equity Chart ─────────────────────────────────────────────────────────────
function EquityChart({ curve }) {
  const [period,  setPeriod]  = useState('ALL')
  const [mounted, setMounted] = useState(false)

  useEffect(() => { const t = setTimeout(() => setMounted(true), 100); return () => clearTimeout(t) }, [])
  useEffect(() => {
    setMounted(false)
    const t = setTimeout(() => setMounted(true), 60)
    return () => clearTimeout(t)
  }, [period])

  // Period-filtered sparse trade points
  const data = useMemo(() => {
    if (!curve?.length) return []
    if (period === 'ALL') return curve
    const now = new Date()
    const cutoffs = {
      '1W': new Date(now - 7*864e5),
      '1M': new Date(now.getFullYear(), now.getMonth()-1, now.getDate()),
      '3M': new Date(now.getFullYear(), now.getMonth()-3, now.getDate()),
      '6M': new Date(now.getFullYear(), now.getMonth()-6, now.getDate()),
    }
    return curve.filter(p => p.date && new Date(p.date+'T00:00:00') >= cutoffs[period])
  }, [curve, period])

  // Expand to one point per calendar day — non-trade days carry pnl forward (flat line)
  // IMPORTANT: start from the period's cutoff date (not just the first trade date) so
  // that all grid-line tick timestamps fall within the chart's x-axis domain.
  const dailyData = useMemo(() => {
    if (!data.length) return []
    const tradeMap = {}
    data.forEach(p => { tradeMap[p.date] = p.pnl })

    const firstTrade = new Date(data[0].date + 'T00:00:00')
    const last       = new Date(data[data.length-1].date + 'T00:00:00')

    // Period start: use month/week boundaries (not "today minus N days") so the
    // domain always reaches back to the very first tick label on the x-axis.
    const now = new Date()
    const periodStartMap = {
      '1W': new Date(now - 7*864e5),                                       // 7 calendar days back
      '1M': new Date(now.getFullYear(), now.getMonth()-1, 1),               // 1st of prev month
      '3M': new Date(now.getFullYear(), now.getMonth()-3, 1),               // 1st of 3 months ago
      '6M': new Date(now.getFullYear(), now.getMonth()-6, 1),               // 1st of 6 months ago
    }
    const periodStart = period === 'ALL'
      ? new Date(firstTrade.getTime() - 864e5)
      : periodStartMap[period]

    // Start from whichever comes first: period start or one day before first trade
    const startDate = periodStart < firstTrade ? periodStart : new Date(firstTrade.getTime() - 864e5)

    const result = []
    let carry = 0
    const cur = new Date(startDate)
    while (cur <= last) {
      const key = toStr(cur)
      if (tradeMap[key] !== undefined) carry = tradeMap[key]
      result.push({ date: key, ts: cur.getTime(), pnl: carry, hasTraded: !!tradeMap[key] })
      cur.setDate(cur.getDate() + 1)
    }
    return result
  }, [data, period])

  const lastPnl    = data.length ? (data[data.length-1]?.pnl ?? 0) : 0
  const periodGain = data.length > 1 ? lastPnl - (data[0]?.pnl ?? 0) : 0
  const isPos      = lastPnl >= 0

  const minY = dailyData.length ? Math.min(0, ...dailyData.map(d => d.pnl)) : 0
  const maxY = dailyData.length ? Math.max(0, ...dailyData.map(d => d.pnl)) : 1
  const yPad = (maxY - minY) * 0.15 || 80

  // Where y=0 sits as % from top of SVG for split gradient
  const domainRange = (maxY + yPad) - (minY - yPad)
  const zeroPercent = domainRange > 0
    ? Math.max(0, Math.min(100, ((maxY + yPad) / domainRange) * 100))
    : (minY >= 0 ? 100 : 0)

  // Calendar tick timestamps (exact calendar positions, not snapped to trades)
  const tickTs = useMemo(() => {
    if (!dailyData.length) return []
    const first = new Date(dailyData[0].date + 'T00:00:00')
    const last  = new Date(dailyData[dailyData.length-1].date + 'T00:00:00')
    const ts = []
    if (period === '1W') {
      const c = new Date(first)
      while (c <= last) { ts.push(c.getTime()); c.setDate(c.getDate()+1) }
    } else if (period === '1M') {
      const ms = new Date(first.getFullYear(), first.getMonth(), 1)
      for (let day = 2; day <= 31; day += 4) {
        const t = new Date(ms.getFullYear(), ms.getMonth(), day)
        if (t > last) break
        ts.push(t.getTime())
      }
      const me = new Date(first.getFullYear(), first.getMonth()+1, 0)
      if (me <= last && !ts.includes(me.getTime())) ts.push(me.getTime())
    } else if (period === '3M') {
      const c = new Date(first.getFullYear(), first.getMonth(), 1)
      while (c <= last) { ts.push(c.getTime()); c.setDate(c.getDate()+14) }
    } else if (period === '6M') {
      const c = new Date(first.getFullYear(), first.getMonth(), 1)
      while (c <= last) { ts.push(c.getTime()); c.setMonth(c.getMonth()+1) }
    } else {
      const totalM = (last.getFullYear()-first.getFullYear())*12 + (last.getMonth()-first.getMonth())
      const step   = Math.max(1, Math.ceil(totalM/7))
      const c      = new Date(first.getFullYear(), first.getMonth(), 1)
      while (c <= last) { ts.push(c.getTime()); c.setMonth(c.getMonth()+step) }
    }
    return ts
  }, [dailyData, period])

  function fmtTick(ts) {
    const d  = new Date(ts)
    const mo = MON_S[d.getMonth()]; const day = d.getDate(); const yr = d.getFullYear()
    if (period === '1W') return `${DOW[d.getDay()].slice(0,2)} ${day}`
    if (period === '1M') return `${mo} ${day}`
    if (period === '3M') return `${mo} ${day}`
    if (period === '6M') return mo
    const fy = dailyData.length ? new Date(dailyData[0].date+'T00:00:00').getFullYear() : yr
    return fy !== yr ? `${mo} '${String(yr).slice(2)}` : mo
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-sm" style={{ color:'var(--text-primary)' }}>Equity Curve</h3>
          <p className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>Cumulative P&L — hover any day</p>
        </div>
        <div className="flex items-center gap-0.5 p-1 rounded-lg"
             style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)' }}>
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold transition-all"
                    style={{ background: period===p?'rgba(139,92,246,0.3)':'transparent',
                             color: period===p?'#C4B5FD':'rgba(255,255,255,0.35)' }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="flex items-center gap-6 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color:'rgba(255,255,255,0.35)' }}>Equity</p>
          <p className="text-xl font-bold" style={{ color:isPos?'#22C55E':'#EF4444' }}>
            {lastPnl>=0?'+$':'-$'}{Math.abs(lastPnl).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
          </p>
        </div>
        {data.length > 1 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color:'rgba(255,255,255,0.35)' }}>Period Gain</p>
            <p className="text-xl font-bold" style={{ color:periodGain>=0?'#22C55E':'#EF4444' }}>
              {periodGain>=0?'+$':'-$'}{Math.abs(periodGain).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
            </p>
          </div>
        )}
        <div>
          <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color:'rgba(255,255,255,0.35)' }}>Trades</p>
          <p className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>{data.length}</p>
        </div>
      </div>

      {/* Chart */}
      {dailyData.length === 0 ? (
        <div className="flex-1 flex items-center justify-center rounded-xl"
             style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', minHeight:200 }}>
          <p className="text-sm" style={{ color:'rgba(255,255,255,0.25)' }}>No data for this period</p>
        </div>
      ) : (
        <div className="flex-1" style={{ minHeight:200 }}>
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top:8, right:4, left:0, bottom:0 }}>
                <defs>
                  <linearGradient id="eqLineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={`${zeroPercent}%`} stopColor="#22C55E" />
                    <stop offset={`${zeroPercent}%`} stopColor="#EF4444" />
                  </linearGradient>
                  <linearGradient id="eqAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"                stopColor="#22C55E" stopOpacity={0.2} />
                    <stop offset={`${zeroPercent}%`} stopColor="#22C55E" stopOpacity={0.03} />
                    <stop offset={`${zeroPercent}%`} stopColor="#EF4444" stopOpacity={0.03} />
                    <stop offset="100%"              stopColor="#EF4444" stopOpacity={0.18} />
                  </linearGradient>
                  <filter id="dotGlowG" x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b"/>
                    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                  <filter id="dotGlowR" x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b"/>
                    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                </defs>

                {/* Full grid — vertical lines align to XAxis ticks now that
                    domain includes the period start, so all tickTs are in range */}
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.07)"
                  vertical={true}
                />

                {/* Zero baseline — slightly brighter so it reads clearly */}
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.22)" strokeDasharray="4 4" />

                <XAxis
                  dataKey="ts" type="number" scale="time"
                  domain={['dataMin','dataMax']}
                  ticks={tickTs} tickFormatter={fmtTick}
                  tick={{ fill:'rgba(255,255,255,0.3)', fontSize:10, fontFamily:'Poppins,sans-serif' }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fill:'rgba(255,255,255,0.3)', fontSize:10, fontFamily:'Poppins,sans-serif' }}
                  axisLine={false} tickLine={false} width={58}
                  domain={[minY-yPad, maxY+yPad]}
                  tickFormatter={v => {
                    const a = Math.abs(v)
                    return `${v<0?'-':''}$${a>=1000?(a/1000).toFixed(1)+'k':a.toFixed(0)}`
                  }}
                />

                <Tooltip
                  content={<EquityTooltip />}
                  cursor={{ stroke:'rgba(255,255,255,0.25)', strokeWidth:1, strokeDasharray:'4 4' }}
                />

                <Area
                  type="monotone" dataKey="pnl"
                  stroke="url(#eqLineGrad)" strokeWidth={2}
                  fill="url(#eqAreaGrad)"
                  isAnimationActive={true}
                  animationDuration={1400} animationEasing="ease-out"
                  dot={false}
                  activeDot={(p) => {
                    const { cx, cy, payload } = p
                    const pos = (payload?.pnl ?? 0) >= 0
                    const col = pos ? '#22C55E' : '#EF4444'
                    return (
                      <g key={`adot-${cx}-${cy}`}>
                        <circle cx={cx} cy={cy} r={13}
                          fill={pos?'rgba(34,197,94,0.08)':'rgba(239,68,68,0.08)'} stroke="none"/>
                        <circle cx={cx} cy={cy} r={8}
                          fill={pos?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.12)'} stroke="none"/>
                        <circle cx={cx} cy={cy} r={4}
                          fill={col} stroke="#0b0a16" strokeWidth={2}
                          filter={`url(#${pos?'dotGlowG':'dotGlowR'})`}/>
                      </g>
                    )
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full rounded-xl animate-pulse"
                 style={{ minHeight:200, background:'rgba(139,92,246,0.05)' }} />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Quick Stats ───────────────────────────────────────────────────────────
function fmtQuick(n) {
  if (n == null || isNaN(n)) return '$0.00'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1000) return `${sign}$${(abs/1000).toFixed(1)}k`
  return `${sign}$${abs.toFixed(2)}`
}

function QuickStats({ stats, winStreak, lossStreak, openCount }) {
  const hasLoss = Math.abs(stats.avgLoss) > 0
  const rrRatio = hasLoss ? (stats.avgWin / Math.abs(stats.avgLoss)) : (stats.avgWin > 0 ? Infinity : 0)
  const rrLabel = isFinite(rrRatio) ? `1:${rrRatio.toFixed(2)}` : '1:∞'
  const rrGood  = isFinite(rrRatio) ? rrRatio >= 1 : true

  const tiles = [
    { label: 'AVG WINNER',  value: fmtQuick(stats.avgWin),                        color: '#3B82F6' },
    { label: 'AVG LOSER',   value: fmtQuick(stats.avgLoss),                       color: 'var(--negative-red)' },
    { label: 'BEST TRADE',  value: fmtQuick(Math.max(0, stats.bestTrade)),        color: '#3B82F6' },
    { label: 'WORST TRADE', value: fmtQuick(Math.min(0, stats.worstTrade)),       color: 'var(--negative-red)' },
    { label: 'WIN STREAK',  value: `${winStreak} trade${winStreak !== 1 ? 's' : ''}`,   color: 'var(--text-primary)' },
    { label: 'LOSS STREAK', value: `${lossStreak} trade${lossStreak !== 1 ? 's' : ''}`, color: 'var(--text-primary)' },
    { label: 'RISK:REWARD', value: rrLabel,  color: rrGood ? '#3B82F6' : 'var(--negative-red)' },
    { label: 'OPEN TRADES', value: openCount, color: 'var(--text-primary)' },
  ]
  return (
    <div className="glass-card p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <LayoutGrid size={15} style={{ color: 'var(--text-primary)' }} />
        <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Quick Stats</h3>
      </div>
      <div className="grid grid-cols-2 gap-2.5 flex-1">
        {tiles.map(t => (
          <div key={t.label} className="rounded-xl p-3.5"
               style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>{t.label}</p>
            <p className="text-lg font-bold leading-tight" style={{ color: t.color }}>{t.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Trading Calendar ─────────────────────────────────────────────────────────
// Colors: profitable days/weeks use blue (#3B82F6), losing days/weeks use red
// (#EF4444), untraded days stay neutral — matching the reference design.
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
                  const isLong = t.side==='long'
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
const TIME_PERIODS = [
  { key: 'today', label: 'Today' },
  { key: '7d',    label: '7 Days' },
  { key: '30d',   label: '30 Days' },
  { key: '3m',    label: '3 Months' },
  { key: '1y',    label: '1 Year' },
  { key: 'all',   label: 'All Time' },
]
const TRADE_FILTERS = [
  { key: 'all',     label: 'All Trades' },
  { key: 'winners', label: 'Winners', icon: CheckCircle },
  { key: 'losers',  label: 'Losers',  icon: X },
]

export default function Performance() {
  const { user }  = useAuth()
  const { trades, account, syncing, syncTrades, isManualAccount } = useTrades(user?.id)

  const [timePeriod, setTimePeriod] = useState('30d')
  const [filterBy,   setFilterBy]   = useState('all')

  const openCount = trades.filter(t => t.status !== 'closed').length

  const periodCutoff = useMemo(() => {
    const now = new Date()
    if (timePeriod === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (timePeriod === '7d')    return new Date(now.getTime() - 7*864e5)
    if (timePeriod === '30d')   return new Date(now.getTime() - 30*864e5)
    if (timePeriod === '3m')    return new Date(now.getFullYear(), now.getMonth()-3, now.getDate())
    if (timePeriod === '1y')    return new Date(now.getFullYear()-1, now.getMonth(), now.getDate())
    return null // 'all'
  }, [timePeriod])

  // Every downstream stat/chart on this page derives from `closed` below, so
  // filtering here cascades everywhere automatically — Hero Stats, Secondary
  // Stats, Quick Stats, Equity Curve, Calendar, Top Symbols, all of it.
  const closed = useMemo(() => {
    let list = trades.filter(t => t.status === 'closed')
    if (periodCutoff) list = list.filter(t => t.closed_at && new Date(t.closed_at) >= periodCutoff)
    if (filterBy === 'winners') list = list.filter(t => (t.pnl || 0) > 0)
    if (filterBy === 'losers')  list = list.filter(t => (t.pnl || 0) <= 0)
    return list
  }, [trades, periodCutoff, filterBy])

  const stats  = computeStats(closed)
  const curve  = buildEquityCurve(closed)

  const wins   = closed.filter(t => (t.pnl||0)>0)
  const losses = closed.filter(t => (t.pnl||0)<=0)
  const total  = closed.length
  const winPct = total>0?(wins.length/total)*100:0
  const grossProfit = wins.reduce((s,t)=>s+(t.pnl||0),0)
  const grossLoss   = losses.reduce((s,t)=>s+(t.pnl||0),0)
  const expectancy  = closed.length>0
    ? (stats.winRate/100)*stats.avgWin+(1-stats.winRate/100)*stats.avgLoss : 0

  const { winStreak, lossStreak } = useMemo(() => {
    const sorted = [...closed].sort((a,b) => new Date(a.closed_at) - new Date(b.closed_at))
    if (!sorted.length) return { winStreak: 0, lossStreak: 0 }
    const lastIsWin = (sorted[sorted.length-1].pnl || 0) > 0
    let streak = 0
    for (let i = sorted.length-1; i >= 0; i--) {
      const isWin = (sorted[i].pnl || 0) > 0
      if (isWin === lastIsWin) streak++
      else break
    }
    return lastIsWin ? { winStreak: streak, lossStreak: 0 } : { winStreak: 0, lossStreak: streak }
  }, [closed])

  const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

  const byDay = useMemo(() => {
    const m={}; DAY_LABELS.forEach(d=>{m[d]={pnl:0,count:0,wins:0}})
    closed.forEach(t=>{
      if(!t.closed_at) return
      const dow=new Date(t.closed_at).getDay(), name=DAY_LABELS[dow===0?6:dow-1]
      m[name].pnl+=t.pnl||0; m[name].count++
      if((t.pnl||0)>0) m[name].wins++
    }); return m
  },[closed])
  const maxDayPnl = Math.max(...DAY_LABELS.map(d=>Math.abs(byDay[d].pnl)),1)

  const topSymbols = useMemo(()=>{
    const m={}
    closed.forEach(t=>{
      if(!m[t.symbol]) m[t.symbol]={pnl:0,count:0,wins:0}
      m[t.symbol].pnl+=t.pnl||0; m[t.symbol].count++
      if((t.pnl||0)>0) m[t.symbol].wins++
    })
    return Object.entries(m).map(([sym,d])=>({symbol:sym,...d})).sort((a,b)=>b.pnl-a.pnl).slice(0,5)
  },[closed])

  const byDate = useMemo(()=>{
    const m={}
    closed.forEach(t=>{
      const k=t.closed_at?.slice(0,10); if(!k) return
      if(!m[k]) m[k]={pnl:0,count:0}
      m[k].pnl+=t.pnl||0; m[k].count++
    }); return m
  },[closed])

  const bySymbol = useMemo(()=>{
    const m={}
    closed.forEach(t=>{ if(!m[t.symbol]) m[t.symbol]={symbol:t.symbol,pnl:0}; m[t.symbol].pnl+=t.pnl||0 })
    return Object.values(m).sort((a,b)=>b.pnl-a.pnl).slice(0,8)
  },[closed])

  const recent = useMemo(()=>
    [...closed].sort((a,b)=>new Date(b.closed_at)-new Date(a.closed_at)).slice(0,10),
  [closed])

  return (
    <PageWrapper onSync={account && !isManualAccount ? syncTrades : undefined} syncing={syncing}>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-5">
        <div className="flex items-center gap-2.5">
          <LineChart size={20} style={{ color: '#3B82F6' }} />
          <div>
            <h1 className="text-2xl font-bold" style={{ color:'var(--text-primary)' }}>Performance Analytics</h1>
            <p className="text-sm mt-0.5" style={{ color:'var(--text-muted)' }}>Analyze your trading patterns and improve your strategy</p>
          </div>
        </div>
        <div className="flex items-start gap-6 flex-wrap">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color:'var(--text-muted)' }}>Time Period</p>
            <div className="flex gap-1.5">
              {TIME_PERIODS.map(p => (
                <button key={p.key} onClick={() => setTimePeriod(p.key)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                        style={timePeriod === p.key
                          ? { background: 'var(--gradient-primary)', color: '#fff' }
                          : { background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color:'var(--text-muted)' }}>Filter By</p>
            <div className="flex gap-1.5">
              {TRADE_FILTERS.map(f => (
                <button key={f.key} onClick={() => setFilterBy(f.key)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap"
                        style={filterBy === f.key
                          ? { background: 'var(--gradient-primary)', color: '#fff' }
                          : { background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                  {f.icon && <f.icon size={12} />}
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {trades.length===0 ? (
        <div className="glass-card p-14 text-center">
          <BarChart2 size={40} className="mx-auto mb-3 opacity-20" style={{ color:'var(--text-muted)' }} />
          <p className="font-semibold mb-1" style={{ color:'var(--text-primary)' }}>No trade data yet</p>
          <p className="text-sm" style={{ color:'var(--text-muted)' }}>Add trades to see performance analytics</p>
        </div>
      ) : (
        <div className="space-y-4">

          {/* ── ROW 1: Hero Stats ── */}
          <HeroStats stats={stats} wins={wins} losses={losses} closed={closed} expectancy={expectancy} />

          {/* ── ROW 2: Secondary Stats ── */}
          <SecondaryStats stats={stats} />

          {/* ── ROW 3: Quick Stats + Equity Curve ── */}
          <div className="grid gap-4" style={{ gridTemplateColumns:'320px 1fr' }}>
            <QuickStats stats={stats} winStreak={winStreak} lossStreak={lossStreak} openCount={openCount} />
            <div className="glass-card p-5" style={{ minHeight:300 }}>
              <EquityChart curve={curve} />
            </div>
          </div>

          {/* ── ROW 4: Trading Calendar ── */}
          <TradingCalendar byDate={byDate} closed={closed} />

          {/* ── ROW 5: Win/Loss Distribution + Recent Trades ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass-card p-5 h-[400px]">
              <div className="flex items-center gap-2 mb-5">
                <BarChart2 size={15} style={{ color:'var(--accent-purple)' }} />
                <h3 className="font-bold" style={{ color:'var(--text-primary)' }}>Win/Loss Distribution</h3>
              </div>
              <div className="flex rounded-xl overflow-hidden mb-6" style={{ height:46 }}>
                {total===0
                  ? <div className="flex-1 flex items-center justify-center text-xs"
                         style={{ background:'var(--bg-card-hover)',color:'var(--text-muted)' }}>No data</div>
                  : <>
                      {wins.length>0&&(
                        <div className="flex items-center justify-center font-bold text-sm text-white select-none"
                             style={{ width:`${winPct}%`,minWidth:44,
                                      background:'linear-gradient(135deg,#3B82F6,#6366F1)',fontSize:13 }}>
                          {wins.length}W
                        </div>
                      )}
                      {losses.length>0&&(
                        <div className="flex items-center justify-center font-bold text-sm text-white select-none"
                             style={{ width:`${100-winPct}%`,minWidth:44,
                                      background:'linear-gradient(135deg,#EF4444,#DC2626)',fontSize:13 }}>
                          {losses.length}L
                        </div>
                      )}
                    </>
                }
              </div>
              <div className="space-y-3.5">
                {[{label:'Gross Profit',value:grossProfit,dot:'#3B82F6'},
                  {label:'Gross Loss',  value:grossLoss,  dot:'#EF4444'},
                  {label:'Net Result',  value:grossProfit+grossLoss,dot:'#8B5CF6'},
                ].map(r=>(
                  <div key={r.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background:r.dot }}/>
                      <span className="text-sm" style={{ color:'var(--text-muted)' }}>{r.label}</span>
                    </div>
                    <span className="text-sm font-bold"
                          style={{ color:r.value>=0?'var(--positive-green)':'var(--negative-red)' }}>
                      {fmtK(r.value)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-5 pt-4" style={{ borderTop:'1px solid var(--border-subtle)' }}>
                <div className="flex justify-between text-xs mb-2">
                  <span style={{ color:'var(--text-muted)' }}>Win Rate</span>
                  <span className="font-semibold"
                        style={{ color:winPct>=50?'var(--positive-green)':'var(--negative-red)' }}>
                    {winPct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background:'var(--bg-card-hover)' }}>
                  <div className="h-full rounded-full"
                       style={{ width:`${winPct}%`,background:'linear-gradient(90deg,#3B82F6,#6366F1)' }}/>
                </div>
              </div>
            </div>

            <div className="glass-card p-5 h-[400px] flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={15} style={{ color:'var(--accent-purple)' }} />
                <h3 className="font-bold" style={{ color:'var(--text-primary)' }}>Recent Trades</h3>
              </div>
              <p className="text-xs mb-4" style={{ color:'var(--text-muted)' }}>Your last 10 trades</p>
              <div className="space-y-1.5 overflow-y-auto pr-1 flex-1">
                {recent.length===0
                  ? <p className="text-sm text-center py-8" style={{ color:'var(--text-muted)' }}>No closed trades yet</p>
                  : recent.map(t=>{
                      const isBuy=t.side==='BUY', pnl=t.pnl||0
                      return(
                        <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
                             style={{ background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.04)' }}
                             onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'}
                             onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'}>
                          <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center"
                               style={{ background:isBuy?'rgba(59,130,246,0.14)':'rgba(239,68,68,0.12)' }}>
                            {isBuy?<TrendingUp size={15} style={{ color:'#3B82F6' }}/>
                                  :<TrendingDown size={15} style={{ color:'#EF4444' }}/>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold" style={{ color:'var(--text-primary)' }}>{t.symbol}</p>
                            <p className="text-xs" style={{ color:'var(--text-muted)' }}>
                              {t.closed_at?new Date(t.closed_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—'}
                            </p>
                          </div>
                          <span className="text-sm font-bold"
                                style={{ color:pnl>=0?'var(--positive-green)':'var(--negative-red)' }}>
                            {fmtK(pnl)}
                          </span>
                        </div>
                      )
                    })
                }
              </div>
            </div>
          </div>

          {/* ── ROW 6: Long vs Short + Day Performance + Top Symbols ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Long vs Short */}
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={15} style={{ color:'var(--accent-purple)' }} />
                <h3 className="font-bold" style={{ color:'var(--text-primary)' }}>Long vs Short</h3>
              </div>
              <p className="text-xs mb-4" style={{ color:'var(--text-muted)' }}>Performance by trade direction</p>
              <div className="space-y-3">
                {[
                  { label:'Long',  Icon:TrendingUp,  trd:closed.filter(t=>t.side==='BUY'),  accent:'#3B82F6',bg:'rgba(59,130,246,0.07)' },
                  { label:'Short', Icon:TrendingDown, trd:closed.filter(t=>t.side==='SELL'), accent:'#EF4444',bg:'rgba(239,68,68,0.06)' },
                ].map(dir=>{
                  const wns=dir.trd.filter(t=>(t.pnl||0)>0)
                  const pnl=dir.trd.reduce((s,t)=>s+(t.pnl||0),0)
                  return(
                    <div key={dir.label} className="rounded-xl p-4"
                         style={{ background:dir.bg,borderLeft:`3px solid ${dir.accent}` }}>
                      <div className="flex items-center gap-2 mb-3">
                        <dir.Icon size={14} style={{ color:dir.accent }}/>
                        <span className="font-bold text-sm" style={{ color:'var(--text-primary)' }}>{dir.label}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label:'TRADES',value:dir.trd.length },
                          { label:'P&L',   value:fmtK(pnl),    color:pnlColor(pnl) },
                          { label:'WIN %', value:dir.trd.length>0?`${((wns.length/dir.trd.length)*100).toFixed(1)}%`:'0.0%',
                            color:dir.trd.length>0&&wns.length/dir.trd.length>=0.5?'var(--positive-green)':'var(--negative-red)' },
                        ].map(s=>(
                          <div key={s.label}>
                            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color:'var(--text-muted)' }}>{s.label}</p>
                            <p className="text-base font-bold" style={{ color:s.color||'var(--text-primary)' }}>{s.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Day Performance */}
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-1">
                <Calendar size={15} style={{ color:'var(--accent-purple)' }}/>
                <h3 className="font-bold" style={{ color:'var(--text-primary)' }}>Day Performance</h3>
              </div>
              <p className="text-xs mb-5" style={{ color:'var(--text-muted)' }}>Find your best trading days</p>
              <div className="space-y-2.5">
                {DAY_LABELS.map(day=>{
                  const data=byDay[day], pct=data.count>0?(Math.abs(data.pnl)/maxDayPnl)*100:0
                  return(
                    <div key={day} className="flex items-center gap-3">
                      <span className="text-xs font-semibold w-8 flex-shrink-0" style={{ color:'var(--text-muted)' }}>{day}</span>
                      <div className="flex-1 h-7 rounded-lg overflow-hidden relative"
                           style={{ background:'rgba(255,255,255,0.04)' }}>
                        {pct>0&&<div className="absolute left-0 top-0 h-full rounded-lg"
                                     style={{ width:`${pct}%`,background:data.pnl>=0?'linear-gradient(90deg,#3B82F6,#6366F1)':'linear-gradient(90deg,#EF4444,#DC2626)' }}/>}
                        {pct===0&&<div className="absolute left-0 top-0 h-full rounded-lg" style={{ width:3,background:'rgba(59,130,246,0.3)' }}/>}
                      </div>
                      <span className="text-xs font-bold w-14 text-right flex-shrink-0"
                            style={{ color:data.count===0?'var(--text-muted)':pnlColor(data.pnl) }}>
                        {data.count>0?fmtK(data.pnl):'—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Top Symbols */}
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-1">
                <Award size={15} style={{ color:'var(--accent-purple)' }}/>
                <h3 className="font-bold" style={{ color:'var(--text-primary)' }}>Top Symbols</h3>
              </div>
              <p className="text-xs mb-4" style={{ color:'var(--text-muted)' }}>Best performing assets</p>
              {topSymbols.length===0
                ? <p className="text-sm text-center py-8" style={{ color:'var(--text-muted)' }}>No data yet</p>
                : <div className="space-y-2">
                    {topSymbols.map((sym,i)=>(
                      <div key={sym.symbol} className="flex items-center gap-3 p-3 rounded-xl"
                           style={{ background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.04)' }}
                           onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'}
                           onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'}>
                        <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold"
                             style={{ background:sym.pnl>=0?'rgba(59,130,246,0.2)':'rgba(239,68,68,0.15)',
                                      color:sym.pnl>=0?'#3B82F6':'#EF4444' }}>{i+1}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold" style={{ color:'var(--text-primary)' }}>{sym.symbol}</p>
                          <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>
                            {sym.count} trade{sym.count!==1?'s':''} · {sym.count>0?Math.round((sym.wins/sym.count)*100):0}% win
                          </p>
                        </div>
                        <span className="text-sm font-bold"
                              style={{ color:sym.pnl>=0?'var(--positive-green)':'var(--negative-red)' }}>
                          {fmtK(sym.pnl)}
                        </span>
                      </div>
                    ))}
                  </div>
              }
            </div>
          </div>

          {/* ── ROW 7: P&L by Symbol ── */}
          {bySymbol.length>0&&(
            <div className="glass-card p-5">
              <h3 className="font-bold mb-4" style={{ color:'var(--text-primary)' }}>P&L by Symbol</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={bySymbol} margin={{top:4,right:0,bottom:0,left:0}} barCategoryGap="35%">
                  <XAxis dataKey="symbol"
                         tick={{ fill:'rgba(255,255,255,0.4)',fontSize:11,fontFamily:'Poppins,sans-serif' }}
                         axisLine={false} tickLine={false}/>
                  <YAxis hide/>
                  <Tooltip content={({active,payload,label})=>{
                    if(!active||!payload?.length) return null
                    const v=payload[0].value
                    return(
                      <div style={{ background:'#1a1a2e',border:'1px solid rgba(255,255,255,0.1)',
                                    borderRadius:10,padding:'8px 14px',fontSize:12 }}>
                        <p style={{ color:'rgba(255,255,255,0.4)',marginBottom:4 }}>{label}</p>
                        <p style={{ color:v>=0?'#22C55E':'#EF4444',fontWeight:700 }}>{fmtK(v)}</p>
                      </div>
                    )
                  }} cursor={{ fill:'rgba(255,255,255,0.04)',radius:6 }}/>
                  <Bar dataKey="pnl" radius={[6,6,0,0]} maxBarSize={52}>
                    {bySymbol.map((e,i)=><Cell key={i} fill={e.pnl>=0?'#22C55E':'#EF4444'} fillOpacity={0.85}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </PageWrapper>
  )
}