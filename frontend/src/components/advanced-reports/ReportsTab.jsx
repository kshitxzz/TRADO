import { useMemo, useState } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import {
  TrendingUp, TrendingDown, Activity, Trophy, FileText, Grid3x3,
  BarChart2, DollarSign, Zap, Table2, Plus,
} from 'lucide-react'
import { Dropdown, EmptyState, BLUE } from './shared'
import { fmtMoney, fmtK, fmtPct, computeDayOfWeekStats, computeDayHeroCards, computeTopSymbolByDay } from '../../lib/advancedReportsHelpers'

const METRIC_OPTIONS = [
  { value: 'pnl',     label: 'Net P&L' },
  { value: 'winRate', label: 'Win %' },
  { value: 'count',   label: 'Trade Count' },
  { value: 'avgWin',  label: 'Avg Win' },
  { value: 'avgLoss', label: 'Avg Loss' },
]

function HeroCard({ icon: Icon, accent, label, day, tradeCount, valueLabel, valueColor }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ height: 3, background: accent }} />
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${accent}22` }}>
            <Icon size={14} style={{ color: accent }} />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</span>
        </div>
        <p className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{day || 'N/A'}</p>
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: 'var(--text-muted)' }}>{day ? `${tradeCount} trade${tradeCount === 1 ? '' : 's'}` : '—'}</span>
          <span className="font-bold" style={{ color: valueColor || 'var(--text-primary)' }}>{day ? valueLabel : '—'}</span>
        </div>
      </div>
    </div>
  )
}

function MetricChart({ icon: Icon, iconColor, iconBg, metric, setMetric, data, barColorFn }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: iconBg }}>
            <Icon size={14} style={{ color: iconColor }} />
          </div>
          <Dropdown value={metric} options={METRIC_OPTIONS} onChange={setMetric} minWidth={140} />
        </div>
        <button className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md cursor-default"
                style={{ color: 'var(--text-muted)' }} title="Overlay additional metrics">
          <Plus size={13} /> Add metric
        </button>
      </div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="short" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload
                return (
                  <div style={{ background: '#181722', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4 }}>{p.day}</p>
                    <p style={{ color: barColorFn(p) , fontSize: 13, fontWeight: 700 }}>{p.displayValue}</p>
                  </div>
                )
              }}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {data.map((d, i) => <Cell key={i} fill={barColorFn(d)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

const CROSS_MODES = [
  { value: 'symbols',  label: 'Top 10 Symbols', icon: Grid3x3 },
  { value: 'winRate',  label: 'Win Rate',       icon: BarChart2 },
  { value: 'pnl',      label: 'P&L',            icon: DollarSign },
  { value: 'trades',   label: 'Trades',         icon: Zap },
]

export default function ReportsTab({ closed }) {
  const [metricA, setMetricA] = useState('pnl')
  const [metricB, setMetricB] = useState('winRate')
  const [crossMode, setCrossMode] = useState('pnl')

  const rows = useMemo(() => computeDayOfWeekStats(closed), [closed])
  const hero = useMemo(() => computeDayHeroCards(closed), [closed])
  const topSymbolByDay = useMemo(() => computeTopSymbolByDay(closed), [closed])

  const activeRows = rows.filter(r => r.count > 0)

  function seriesFor(metric) {
    return rows.map(r => {
      let value, displayValue
      if (metric === 'pnl') { value = r.pnl; displayValue = fmtMoney(r.pnl, { sign: true }) }
      else if (metric === 'winRate') { value = r.winRate; displayValue = fmtPct(r.winRate) }
      else if (metric === 'count') { value = r.count; displayValue = `${r.count} trades` }
      else if (metric === 'avgWin') { value = r.avgWin; displayValue = fmtMoney(r.avgWin, { sign: true }) }
      else { value = r.avgLoss; displayValue = fmtMoney(r.avgLoss, { sign: true }) }
      return { day: r.day, short: r.day.slice(0, 3), value, displayValue }
    })
  }

  function colorForMetric(metric) {
    return (d) => {
      if (metric === 'winRate' || metric === 'count') return BLUE
      return d.value >= 0 ? '#4ADE80' : '#F87171'
    }
  }

  if (closed.length === 0) {
    return <EmptyState Icon={FileText} title="No trade data yet" sub="Add trades to see day-of-week reports" />
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <HeroCard icon={TrendingUp}   accent="#22C55E" label="Best Performing Day"
                  day={hero?.best.day} tradeCount={hero?.best.count} valueColor="var(--positive-green)"
                  valueLabel={hero ? fmtK(hero.best.pnl) : '—'} />
        <HeroCard icon={TrendingDown} accent="#EF4444" label="Least Performing Day"
                  day={hero?.worst.day} tradeCount={hero?.worst.count} valueColor="var(--negative-red)"
                  valueLabel={hero ? fmtK(hero.worst.pnl) : '—'} />
        <HeroCard icon={Activity}     accent="#F59E0B" label="Most Active Day"
                  day={hero?.active.day} tradeCount={hero?.active.count}
                  valueLabel={hero ? `${hero.active.count} trade${hero.active.count === 1 ? '' : 's'}` : '—'} />
        <HeroCard icon={Trophy}       accent={BLUE} label="Best Win Rate"
                  day={hero?.winner.day} tradeCount={hero?.winner.count} valueColor={BLUE}
                  valueLabel={hero ? `${fmtPct(hero.winner.winRate)} / ${hero.winner.count} trade${hero.winner.count === 1 ? '' : 's'}` : '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <MetricChart icon={TrendingUp} iconColor={BLUE} iconBg="rgba(59,130,246,0.15)"
                     metric={metricA} setMetric={setMetricA}
                     data={seriesFor(metricA)} barColorFn={colorForMetric(metricA)} />
        <MetricChart icon={BarChart2} iconColor="#22C55E" iconBg="rgba(34,197,94,0.15)"
                     metric={metricB} setMetric={setMetricB}
                     data={seriesFor(metricB)} barColorFn={colorForMetric(metricB)} />
      </div>

      <div className="glass-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)' }}>
            <Table2 size={14} style={{ color: BLUE }} />
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Summary</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ color: 'var(--text-muted)' }}>
                {['Days', 'Win %', 'Net P&L', 'Trade Count', 'Avg Daily Volume', 'Avg Win', 'Avg Loss'].map(h => (
                  <th key={h} className="font-semibold text-xs uppercase tracking-wide pb-3 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeRows.map(r => (
                <tr key={r.day} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td className="py-3 pr-4 font-semibold" style={{ color: 'var(--text-primary)' }}>{r.day}</td>
                  <td className="py-3 pr-4">
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: 'rgba(59,130,246,0.15)', color: BLUE }}>
                      {fmtPct(r.winRate)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-semibold" style={{ color: r.pnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }}>{fmtK(r.pnl)}</td>
                  <td className="py-3 pr-4" style={{ color: 'var(--text-primary)' }}>{r.count}</td>
                  <td className="py-3 pr-4" style={{ color: 'var(--text-primary)' }}>{r.avgDailyVolume.toFixed(2)}</td>
                  <td className="py-3 pr-4" style={{ color: 'var(--positive-green)' }}>{fmtMoney(r.avgWin, { sign: true })}</td>
                  <td className="py-3 pr-4" style={{ color: 'var(--negative-red)' }}>{fmtMoney(r.avgLoss, { sign: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)' }}>
              <Table2 size={14} style={{ color: BLUE }} />
            </div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Cross Analysis</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {CROSS_MODES.map(m => {
              const isActive = m.value === crossMode
              return (
                <button key={m.value} onClick={() => setCrossMode(m.value)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: isActive ? BLUE : 'rgba(255,255,255,0.04)', color: isActive ? '#fff' : 'var(--text-secondary)' }}>
                  <m.icon size={12} /> {m.label}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <div className="grid grid-cols-2 text-xs font-semibold uppercase tracking-wide pb-3" style={{ color: 'var(--text-muted)' }}>
            <span>Days</span>
          </div>
          {activeRows.map(r => {
            const dowIndex = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(r.day)
            const topSym = topSymbolByDay[dowIndex]
            let display
            if (crossMode === 'symbols') display = <span style={{ color: 'var(--text-primary)' }}>{topSym ? topSym.symbol : 'N/A'}</span>
            else if (crossMode === 'winRate') display = <span style={{ color: BLUE }}>{fmtPct(r.winRate)}</span>
            else if (crossMode === 'trades') display = <span style={{ color: 'var(--text-primary)' }}>{r.count}</span>
            else display = <span style={{ color: r.pnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }}>{fmtK(r.pnl)}</span>
            return (
              <div key={r.day} className="flex items-center justify-between py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{r.day}</span>
                <span className="px-2.5 py-1 rounded-md text-sm font-bold" style={{ background: 'rgba(255,255,255,0.04)' }}>{display}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}