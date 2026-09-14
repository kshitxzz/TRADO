import { useMemo, useRef, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import {
  DollarSign, Percent, Target, Activity, TrendingUp, TrendingDown, Award, Clock,
  Calendar, ChevronsUpDown, Download, ChevronDown, BarChart2, Check, FileText,
} from 'lucide-react'
import PageWrapper from '../../components/layout/PageWrapper'
import DropdownPortal from '../../components/layout/DropdownPortal'
import { useAuth } from '../../hooks/useAuth'
import { useTrades } from '../../hooks/useTrades'
import { computeStats, buildEquityCurve, pnlColor } from '../../lib/utils'
import {
  filterTradesByRange, computeDailyBreakdown, computeAvgHoldTimeAll,
  computeHourlyPerformance, computeSymbolBreakdown, computeDayOfWeekBreakdown,
  formatDuration, getDurationSeconds,
} from '../../lib/analytics'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MON_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DOW_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const DOW_SHORT = { Monday:'Mon', Tuesday:'Tue', Wednesday:'Wed', Thursday:'Thu', Friday:'Fri', Saturday:'Sat', Sunday:'Sun' }

function fmtMoney(n) {
  if (n == null || isNaN(n)) return '+$0.00'
  return (n >= 0 ? '+$' : '-$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtAbsMoney(n) {
  if (n == null || isNaN(n)) return '$0.00'
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtK(n) {
  if (n == null || isNaN(n)) return '$0'
  const abs = Math.abs(n)
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(0)}k` : `$${abs.toFixed(0)}`
  return (n < 0 ? '-' : '') + s
}
function fmtShortDate(str) {
  if (!str) return ''
  const d = new Date(str + 'T00:00:00')
  return `${MON_S[d.getMonth()]} ${d.getDate()}`
}
function fmtHoldMin(min) {
  if (min == null) return '—'
  const m = Math.round(min)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

const RANGE_OPTIONS = [
  { value: 'all',   label: 'All Time' },
  { value: 'year',  label: 'This Year' },
  { value: 'month', label: 'This Month' },
  { value: '30d',   label: 'Last 30 Days' },
  { value: '7d',    label: 'Last 7 Days' },
]
const LEFT_METRICS = [
  { value: 'cumulative', label: 'Net P&L – Cumulative' },
  { value: 'daily',      label: 'Daily P&L' },
  { value: 'dow',        label: 'P&L by Day of Week' },
]
const RIGHT_METRICS = [
  { value: 'hour',    label: 'P&L by Hour of Day' },
  { value: 'symbol',  label: 'P&L by Symbol' },
  { value: 'dowwin',  label: 'Win Rate by Day of Week' },
]
const TABS = [
  { value: 'summary', label: 'Summary' },
  { value: 'days',    label: 'Days' },
  { value: 'trades',  label: 'Trades' },
]

// ─── Generic dropdown menu (built on the existing DropdownPortal) ────────────
function DropdownMenu({ open, onClose, anchorRef, options, selected, onSelect, width = 220, align = 'left' }) {
  return (
    <DropdownPortal open={open} onClose={onClose} anchorRef={anchorRef} width={width} align={align}>
      <div className="rounded-xl overflow-hidden py-1.5" style={{ background: '#18171d', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 20px 48px rgba(0,0,0,0.55)' }}>
        {options.map(opt => {
          const isSel = opt.value === selected
          return (
            <button key={opt.value} onClick={() => { onSelect(opt.value); onClose() }}
                    className="w-full flex items-center justify-between gap-4 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-white/5">
              <span style={{ color: isSel ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isSel ? 600 : 500 }}>{opt.label}</span>
              {isSel && <Check size={14} style={{ color: 'var(--accent-purple-light)', flexShrink: 0 }} />}
            </button>
          )
        })}
      </div>
    </DropdownPortal>
  )
}

function RangeSelector({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const label = RANGE_OPTIONS.find(o => o.value === value)?.label || 'All Time'
  return (
    <>
      <button ref={ref} onClick={() => setOpen(o => !o)}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:bg-white/[0.07]"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
        {label}
        <ChevronsUpDown size={13} style={{ color: 'var(--text-muted)' }} />
      </button>
      <DropdownMenu open={open} onClose={() => setOpen(false)} anchorRef={ref} options={RANGE_OPTIONS} selected={value} onSelect={onChange} width={190} align="right" />
    </>
  )
}

function ChartMetricSelector({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const label = options.find(o => o.value === value)?.label
  return (
    <>
      <button ref={ref} onClick={() => setOpen(o => !o)}
              className="flex items-center gap-2 pl-1 pr-2.5 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5">
        <BarChart2 size={15} style={{ color: 'var(--accent-purple-light)' }} className="flex-shrink-0" />
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</span>
        <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
      </button>
      <DropdownMenu open={open} onClose={() => setOpen(false)} anchorRef={ref} options={options} selected={value} onSelect={onChange} width={230} align="left" />
    </>
  )
}

function StatMiniCard({ icon: Icon, label, value, color }) {
  return (
    <div className="glass-card px-5 py-4">
      <div className="flex items-center gap-2 mb-2.5">
        <Icon size={14} style={{ color: 'var(--text-muted)' }} />
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <p className="text-2xl font-bold leading-none" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

function EmptyState({ text = 'No data for this range' }) {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 200 }}>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{text}</p>
    </div>
  )
}

// ─── Left panel: Net P&L – Cumulative / Daily P&L / P&L by Day of Week ───────
function LineTooltip({ active, payload, metric }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const title = metric === 'cumulative' ? d.label : d.label
  const valueLabel = metric === 'cumulative' ? 'Cumulative P&L' : 'Net P&L'
  return (
    <div style={{ background: 'rgba(15,14,20,0.97)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '12px 16px' }}>
      <p style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{title}</p>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{valueLabel} : {fmtMoney(d.value)}</p>
    </div>
  )
}

function LeftChartPanel({ metric, onMetricChange, closed }) {
  const data = useMemo(() => {
    if (metric === 'cumulative') {
      const curve = buildEquityCurve(closed)
      return curve.map(p => ({ value: p.pnl, label: p.date ? fmtShortDate(p.date) : '' }))
    }
    if (metric === 'daily') {
      return computeDailyBreakdown(closed).slice().sort((a, b) => a.date.localeCompare(b.date))
        .map(r => ({ value: r.pnl, label: fmtShortDate(r.date), count: r.count }))
    }
    // dow
    const rows = computeDayOfWeekBreakdown(closed)
    const byDay = Object.fromEntries(rows.map(r => [r.day, r]))
    return DOW_ORDER.map(day => ({ value: byDay[day]?.pnl || 0, label: DOW_SHORT[day], count: byDay[day]?.count || 0 }))
  }, [metric, closed])

  const isLine = metric === 'cumulative'
  const hasData = data.some(d => d.value !== 0) || (metric !== 'cumulative' && data.some(d => d.count > 0))

  return (
    <div className="glass-card p-5">
      <ChartMetricSelector value={metric} options={LEFT_METRICS} onChange={onMetricChange} />
      {!hasData ? <EmptyState /> : (
        <div style={{ height: 280, marginTop: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            {isLine ? (
              <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="repEqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--positive-green-bright)" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="var(--positive-green-bright)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
                <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.32)', fontSize: 10 }} axisLine={false} tickLine={false}
                       interval="preserveStartEnd" minTickGap={36} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.32)', fontSize: 10 }} axisLine={false} tickLine={false} width={58} tickFormatter={fmtK} />
                <Tooltip content={<LineTooltip metric={metric} />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeDasharray: '4 4' }} />
                <Area type="monotone" dataKey="value" stroke="var(--positive-green-bright)" strokeWidth={2.5} fill="url(#repEqGrad)"
                      isAnimationActive animationDuration={1300} animationEasing="ease-out"
                      dot={false} activeDot={{ r: 6, fill: 'var(--positive-green-bright)', stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            ) : (
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.32)', fontSize: 10 }} axisLine={false} tickLine={false}
                       interval={metric === 'daily' ? 'preserveStartEnd' : 0} minTickGap={20} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.32)', fontSize: 10 }} axisLine={false} tickLine={false} width={58} tickFormatter={fmtK} />
                <Tooltip content={<LineTooltip metric={metric} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="value" radius={[4, 4, 4, 4]} maxBarSize={metric === 'dow' ? 46 : 22} isAnimationActive animationDuration={900}>
                  {data.map((d, i) => <Cell key={i} fill={d.value >= 0 ? 'var(--positive-green-bright)' : 'var(--negative-red)'} fillOpacity={0.9} />)}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── Right panel: P&L by Hour of Day / P&L by Symbol / Win Rate by Day ───────
function RightChartPanel({ metric, onMetricChange, closed }) {
  const data = useMemo(() => {
    if (metric === 'hour') {
      return computeHourlyPerformance(closed).buckets.filter(b => b.count > 0)
        .map(b => ({ value: b.pnl, label: b.hourLabel, count: b.count }))
    }
    if (metric === 'symbol') {
      return computeSymbolBreakdown(closed).slice(0, 10).map(s => ({ value: s.pnl, label: s.symbol, count: s.count }))
    }
    // dowwin
    const rows = computeDayOfWeekBreakdown(closed)
    const byDay = Object.fromEntries(rows.map(r => [r.day, r]))
    return DOW_ORDER.map(day => ({ value: byDay[day]?.winRate || 0, label: DOW_SHORT[day], count: byDay[day]?.count || 0, isRate: true }))
  }, [metric, closed])

  const hasData = data.some(d => d.count > 0)
  const isRate = metric === 'dowwin'

  return (
    <div className="glass-card p-5">
      <ChartMetricSelector value={metric} options={RIGHT_METRICS} onChange={onMetricChange} />
      {!hasData ? <EmptyState /> : (
        <div style={{ height: 280, marginTop: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
              <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.32)', fontSize: 10 }} axisLine={false} tickLine={false}
                     interval={metric === 'hour' ? 'preserveStartEnd' : 0} minTickGap={16} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.32)', fontSize: 10 }} axisLine={false} tickLine={false} width={58}
                     tickFormatter={isRate ? (v => `${v}%`) : fmtK} domain={isRate ? [0, 100] : undefined} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                       content={({ active, payload }) => {
                         if (!active || !payload?.length) return null
                         const d = payload[0].payload
                         return (
                           <div style={{ background: 'rgba(15,14,20,0.97)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '12px 16px' }}>
                             <p style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{d.label}</p>
                             <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                               {isRate ? `Win Rate : ${d.value.toFixed(1)}%` : `Net P&L : ${fmtMoney(d.value)}`}
                             </p>
                             <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 2 }}>{d.count} trade{d.count !== 1 ? 's' : ''}</p>
                           </div>
                         )
                       }} />
              <Bar dataKey="value" radius={[4, 4, 4, 4]} maxBarSize={metric === 'symbol' || metric === 'dowwin' ? 44 : 22} isAnimationActive animationDuration={900}>
                {data.map((d, i) => (
                  <Cell key={i} fill={isRate ? (d.value >= 50 ? 'var(--positive-green-bright)' : 'var(--negative-red)') : (d.value >= 0 ? 'var(--positive-green-bright)' : 'var(--negative-red)')} fillOpacity={0.9} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── Days tab ─────────────────────────────────────────────────────────────────
function DaysTable({ closed }) {
  const rows = useMemo(() => computeDailyBreakdown(closed), [closed])
  if (rows.length === 0) return <div className="glass-card p-12 text-center"><EmptyState text="No closed trades in this range" /></div>

  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              {['Date', 'Trades', 'Wins', 'Losses', 'Win Rate', 'Net P&L'].map(h => (
                <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.date} className="table-row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <td className="px-5 py-3.5 font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  {new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{r.count}</td>
                <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--positive-green)' }}>{r.wins}</td>
                <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--negative-red)' }}>{r.losses}</td>
                <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{r.winRate.toFixed(1)}%</td>
                <td className="px-5 py-3.5 font-bold text-sm" style={{ color: pnlColor(r.pnl) }}>{fmtMoney(r.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Trades tab ───────────────────────────────────────────────────────────────
const TRADES_PER_PAGE = 25

function TradesTable({ closed }) {
  const [page, setPage] = useState(0)
  const sorted = useMemo(() => closed.slice().sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at)), [closed])
  const totalPages = Math.max(1, Math.ceil(sorted.length / TRADES_PER_PAGE))
  const pageRows = sorted.slice(page * TRADES_PER_PAGE, (page + 1) * TRADES_PER_PAGE)

  if (sorted.length === 0) return <div className="glass-card p-12 text-center"><EmptyState text="No closed trades in this range" /></div>

  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              {['Date', 'Symbol', 'Side', 'Size', 'Duration', 'P&L'].map(h => (
                <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map(t => {
              const durSec = getDurationSeconds(t)
              return (
                <tr key={t.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {t.closed_at ? new Date(t.closed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{t.symbol}</td>
                  <td className="px-5 py-3.5 text-sm">
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold"
                          style={{ background: t.side === 'BUY' ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.15)', color: t.side === 'BUY' ? '#60A5FA' : '#F87171' }}>
                      {t.side === 'BUY' ? 'LONG' : 'SHORT'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{t.size ?? '—'}</td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{durSec != null ? formatDuration(durSec) : '—'}</td>
                  <td className="px-5 py-3.5 font-bold text-sm" style={{ color: pnlColor(t.pnl) }}>{fmtMoney(t.pnl)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Showing {page * TRADES_PER_PAGE + 1}–{Math.min((page + 1) * TRADES_PER_PAGE, sorted.length)} of {sorted.length} trades
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-30"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
              Previous
            </button>
            <span className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>{page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-30"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PDF export — a real, downloadable summary built from the same numbers
// on screen (jsPDF + autoTable, loaded on demand so it never bloats the
// main bundle for people who never click the button). ────────────────────
async function exportReportPdf({ stats, dailyRows, rangeLabel, avgHoldMin }) {
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF()

  doc.setFont(undefined, 'bold')
  doc.setFontSize(18)
  doc.setTextColor(20, 20, 26)
  doc.text('Trado — Performance Report', 14, 20)

  doc.setFont(undefined, 'normal')
  doc.setFontSize(10)
  doc.setTextColor(120, 120, 130)
  const generated = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  doc.text(`Range: ${rangeLabel}   ·   Generated ${generated}`, 14, 27)

  const wlRatio = stats.avgLoss !== 0 ? Math.abs(stats.avgWin / stats.avgLoss) : null

  autoTable(doc, {
    startY: 35,
    head: [['Metric', 'Value']],
    body: [
      ['Net P&L', fmtMoney(stats.totalPnl)],
      ['Win Rate', `${stats.winRate.toFixed(1)}%`],
      ['Profit Factor', isFinite(stats.profitFactor) && stats.profitFactor < 999 ? stats.profitFactor.toFixed(2) : '∞'],
      ['Total Trades', String(stats.tradeCount)],
      ['Avg Win', fmtAbsMoney(stats.avgWin)],
      ['Avg Loss', fmtAbsMoney(stats.avgLoss)],
      ['W/L Ratio', wlRatio != null ? `${wlRatio.toFixed(2)}` : '—'],
      ['Avg Hold Time', fmtHoldMin(avgHoldMin)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [139, 92, 246], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
  })

  const afterSummaryY = doc.lastAutoTable.finalY + 14
  doc.setFont(undefined, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(20, 20, 26)
  doc.text('Daily Breakdown', 14, afterSummaryY)

  autoTable(doc, {
    startY: afterSummaryY + 5,
    head: [['Date', 'Trades', 'Wins', 'Losses', 'Win Rate', 'Net P&L']],
    body: dailyRows.map(r => [
      new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      String(r.count), String(r.wins), String(r.losses), `${r.winRate.toFixed(1)}%`, fmtMoney(r.pnl),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [30, 29, 36], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const raw = dailyRows[data.row.index]?.pnl ?? 0
        data.cell.styles.textColor = raw >= 0 ? [22, 163, 74] : [220, 38, 38]
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  doc.save(`trado-report-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function Reports() {
  const { user } = useAuth()
  const { trades, account, syncing, syncTrades, isManualAccount } = useTrades(user?.id)

  const [tab, setTab] = useState('summary')
  const [range, setRange] = useState('all')
  const [leftMetric, setLeftMetric] = useState('cumulative')
  const [rightMetric, setRightMetric] = useState('hour')
  const [exporting, setExporting] = useState(false)

  const closed = useMemo(() => {
    const all = trades.filter(t => t.status === 'closed')
    return filterTradesByRange(all, range)
  }, [trades, range])

  const stats = useMemo(() => computeStats(closed), [closed])
  const avgHoldMin = useMemo(() => computeAvgHoldTimeAll(closed), [closed])
  const dailyRows = useMemo(() => computeDailyBreakdown(closed), [closed])
  const wlRatio = stats.avgLoss !== 0 ? Math.abs(stats.avgWin / stats.avgLoss) : null
  const rangeLabel = RANGE_OPTIONS.find(o => o.value === range)?.label || 'All Time'

  const hasAnyTrades = trades.length > 0

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      await exportReportPdf({ stats, dailyRows, rangeLabel, avgHoldMin })
    } catch (err) {
      console.error('PDF export failed', err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <PageWrapper onSync={account && !isManualAccount ? syncTrades : undefined} syncing={syncing}>
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Reports</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Advanced analytics and customizable reports</p>
        </div>
        <div className="flex items-center gap-3">
          <RangeSelector value={range} onChange={setRange} />
          <button onClick={handleExport} disabled={exporting || !hasAnyTrades}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-purple-deep))', boxShadow: '0 8px 20px rgba(139,92,246,0.3)' }}>
            <Download size={15} />
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div className="inline-flex items-center gap-1 p-1 rounded-xl mb-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)' }}>
        {TABS.map(t => {
          const isActive = t.value === tab
          return (
            <button key={t.value} onClick={() => setTab(t.value)}
                    className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                    style={{ background: isActive ? 'rgba(255,255,255,0.09)' : 'transparent', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {!hasAnyTrades ? (
        <div className="glass-card p-12 text-center">
          <FileText size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No trade data yet</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sync your MT5 account or log a trade to generate reports.</p>
        </div>
      ) : tab === 'summary' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <LeftChartPanel metric={leftMetric} onMetricChange={setLeftMetric} closed={closed} />
            <RightChartPanel metric={rightMetric} onMetricChange={setRightMetric} closed={closed} />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatMiniCard icon={DollarSign} label="Net P&L" value={fmtMoney(stats.totalPnl)} color={pnlColor(stats.totalPnl)} />
            <StatMiniCard icon={Percent}    label="Win %"   value={`${stats.winRate.toFixed(1)}%`} />
            <StatMiniCard icon={Target}     label="Profit Factor" value={isFinite(stats.profitFactor) && stats.profitFactor < 999 ? stats.profitFactor.toFixed(2) : '∞'} />
            <StatMiniCard icon={Activity}   label="Total Trades"  value={stats.tradeCount} />
            <StatMiniCard icon={TrendingUp}   label="Avg Win"  value={fmtAbsMoney(stats.avgWin)} color="var(--positive-green)" />
            <StatMiniCard icon={TrendingDown} label="Avg Loss" value={fmtAbsMoney(stats.avgLoss)} color="var(--negative-red)" />
            <StatMiniCard icon={Award}      label="W/L Ratio" value={wlRatio != null ? wlRatio.toFixed(2) : '∞'} />
            <StatMiniCard icon={Clock}      label="Avg Hold Time" value={fmtHoldMin(avgHoldMin)} />
          </div>
        </div>
      ) : tab === 'days' ? (
        <DaysTable closed={closed} />
      ) : (
        <TradesTable closed={closed} />
      )}
    </PageWrapper>
  )
}