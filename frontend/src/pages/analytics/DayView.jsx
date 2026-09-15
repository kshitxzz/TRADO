import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import {
  ChevronRight, ChevronLeft, Play, CalendarDays, ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react'
import PageWrapper from '../../components/layout/PageWrapper'
import { useAuth } from '../../hooks/useAuth'
import { useTrades } from '../../hooks/useTrades'
import { computeDailyBreakdown, computeDayDetailStats, computeDayEquityCurve } from '../../lib/analytics'
import { buildMonthCalendar, MONTHS_FULL, toDateKey } from '../../lib/advancedReportsHelpers'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtMoney(n) {
  if (n == null || isNaN(n)) return '+$0.00'
  return (n >= 0 ? '+$' : '-$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtAbsMoney(n) {
  if (n == null || isNaN(n)) return '$0.00'
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtFullDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function pnlColorBright(n) {
  return n >= 0 ? 'var(--positive-green-bright)' : 'var(--negative-red)'
}

// ─── Replay button — visual affordance only; Trade Replay isn't built yet,
// so this is intentionally wired to nothing (no navigation, no handler). ────
function ReplayButton({ size = 'md' }) {
  const isSm = size === 'sm'
  return (
    <button
      disabled
      title="Trade Replay is coming soon"
      onClick={(e) => e.stopPropagation()}
      className={isSm
        ? 'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 cursor-not-allowed opacity-40'
        : 'flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold flex-shrink-0 cursor-not-allowed opacity-50'}
      style={isSm
        ? { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }
        : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: 'var(--text-primary)' }}
    >
      <Play size={isSm ? 13 : 14} style={{ color: isSm ? 'var(--text-muted)' : 'var(--text-secondary)' }} fill="currentColor" />
      {!isSm && 'Replay'}
    </button>
  )
}

// ─── Mini equity chart for one day's trades ──────────────────────────────────
function DayChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div style={{ background: 'rgba(15,14,20,0.97)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '10px 14px' }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 2 }}>{d.label}</p>
      <p style={{ color: pnlColorBright(d.value), fontSize: 13, fontWeight: 700 }}>{fmtMoney(d.value)}</p>
    </div>
  )
}

function DayChart({ curve, gradId, netPnl }) {
  if (curve.length === 0) return null
  const data = curve.map(p => ({ ...p, label: fmtTime(p.time) }))
  const color = pnlColorBright(netPnl)

  return (
    <div style={{ height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
          <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.32)', fontSize: 10 }} axisLine={false} tickLine={false}
                 interval="preserveStartEnd" minTickGap={40} />
          <YAxis tick={{ fill: 'rgba(255,255,255,0.32)', fontSize: 10 }} axisLine={false} tickLine={false} width={56}
                 tickFormatter={v => fmtAbsMoney(v).replace('$', v < 0 ? '-$' : '$')} />
          <Tooltip content={<DayChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeDasharray: '4 4' }} />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} fill={`url(#${gradId})`}
                isAnimationActive animationDuration={900} animationEasing="ease-out"
                dot={false} activeDot={{ r: 5, fill: color, stroke: '#fff', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Stat grid inside an expanded row ────────────────────────────────────────
function DayStatGrid({ stats }) {
  const items = [
    { label: 'Total Trades',      value: String(stats.tradeCount) },
    { label: 'Win Rate',          value: `${stats.winRate.toFixed(1)}%` },
    { label: 'Gross P&L',         value: fmtMoney(stats.grossPnl), color: pnlColorBright(stats.grossPnl) },
    { label: 'Winners / Losers',  value: `${stats.wins} / ${stats.losses}` },
    { label: 'Volume',            value: stats.volume.toFixed(2) },
    { label: 'Profit Factor',     value: stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2) },
    { label: 'Commissions',       value: fmtAbsMoney(stats.commissions) },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {items.map(it => (
        <div key={it.label}>
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{it.label}</p>
          <p className="text-lg font-bold" style={{ color: it.color || 'var(--text-primary)' }}>{it.value}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Per-trade table inside an expanded row ──────────────────────────────────
function DayTradeTable({ dayTrades }) {
  const sorted = useMemo(
    () => [...dayTrades].sort((a, b) => new Date(a.opened_at || a.closed_at) - new Date(b.opened_at || b.closed_at)),
    [dayTrades]
  )
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Open Time', 'Symbol', 'Side', 'Quantity', 'Net P&L', 'Replay'].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(t => {
              const isLong = t.side === 'long' || t.side === 'BUY'
              return (
                <tr key={t.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{fmtTime(t.opened_at || t.closed_at)}</td>
                  <td className="px-4 py-3 font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{t.symbol}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={isLong ? 'pill-buy' : 'pill-sell'}>{isLong ? 'long' : 'short'}</span>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{t.size != null ? Number(t.size).toFixed(2) : '—'}</td>
                  <td className="px-4 py-3 font-bold text-sm" style={{ color: pnlColorBright(t.pnl) }}>{fmtMoney(t.pnl)}</td>
                  <td className="px-4 py-3"><ReplayButton size="sm" /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── One collapsible day row ─────────────────────────────────────────────────
function DayRow({ row, dayTrades, isExpanded, isSelected, onToggle, registerRef }) {
  const detailStats = useMemo(() => computeDayDetailStats(dayTrades), [dayTrades])
  const curve       = useMemo(() => computeDayEquityCurve(dayTrades), [dayTrades])
  const gradId      = `dayGrad-${row.date.replace(/-/g, '')}`

  return (
    <div
      ref={registerRef}
      className="glass-card overflow-hidden"
      style={isSelected ? { borderColor: 'var(--accent-purple)' } : undefined}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer select-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          <ChevronRight
            size={16}
            style={{
              color: 'var(--text-muted)',
              flexShrink: 0,
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 200ms ease',
            }}
          />
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{fmtFullDate(row.date)}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Net P&L <span className="font-bold" style={{ color: pnlColorBright(row.pnl) }}>{fmtMoney(row.pnl)}</span>
            </p>
          </div>
        </div>
        <ReplayButton />
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-5 pb-5 space-y-5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 18 }}>
              <DayChart curve={curve} gradId={gradId} netPnl={detailStats.netPnl} />
              <DayStatGrid stats={detailStats} />
              <DayTradeTable dayTrades={dayTrades} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Mini trading calendar (sidebar) ─────────────────────────────────────────
function MiniCalendar({ closed, selectedDate, onSelectDay }) {
  const [view, setView] = useState(() => {
    const first = closed.length
      ? closed.slice().sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))[0]
      : null
    return first ? new Date(first.closed_at) : new Date()
  })
  const year = view.getFullYear()
  const month = view.getMonth()
  const todayKey = toDateKey(new Date())

  const monthData = useMemo(() => buildMonthCalendar(closed, year, month), [closed, year, month])
  const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  function nav(delta) {
    setView(d => new Date(d.getFullYear(), d.getMonth() + delta, 1))
  }

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{MONTHS_FULL[month]} {year}</p>
        <div className="flex items-center gap-1.5">
          <button onClick={() => nav(-1)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => nav(1)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {DOW.map(d => (
          <div key={d} className="text-center text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1.5">
        {monthData.cells.map((cell, i) => {
          if (!cell) return <div key={i} />
          const isSel = cell.dateKey === selectedDate
          const isToday = cell.dateKey === todayKey
          const isPos = cell.hasTrades && cell.pnl > 0
          const isNeg = cell.hasTrades && cell.pnl < 0
          let bg = 'transparent', color = 'var(--text-secondary)', fontWeight = 500
          if (isPos) { bg = 'rgba(34,197,94,0.35)'; color = '#FFFFFF'; fontWeight = 700 }
          else if (isNeg) { bg = 'rgba(244,63,94,0.35)'; color = '#FFFFFF'; fontWeight = 700 }
          const border = isSel ? '2px solid var(--accent-purple)' : isToday ? '1.5px solid rgba(167,139,250,0.55)' : '1px solid transparent'

          return (
            <div key={i} className="flex items-center justify-center" style={{ height: 34 }}>
              <button
                disabled={!cell.hasTrades}
                onClick={() => onSelectDay(cell.dateKey)}
                className="flex items-center justify-center rounded-full text-xs transition-colors"
                style={{
                  width: 28, height: 28, background: bg, color, fontWeight, border,
                  cursor: cell.hasTrades ? 'pointer' : 'default',
                }}
              >
                {cell.date}
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-4 mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {[{ dot: 'rgba(34,197,94,0.7)', l: 'Profit' }, { dot: 'rgba(244,63,94,0.7)', l: 'Loss' }].map(x => (
          <div key={x.l} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: x.dot }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{x.l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function DayView() {
  const { user } = useAuth()
  const { trades, account, syncing, syncTrades, isManualAccount } = useTrades(user?.id)

  const closed = useMemo(() => trades.filter(t => t.status === 'closed' && t.closed_at), [trades])
  const rows = useMemo(() => computeDailyBreakdown(closed), [closed])

  const tradesByDate = useMemo(() => {
    const map = {}
    closed.forEach(t => {
      const key = t.closed_at.slice(0, 10)
      ;(map[key] ||= []).push(t)
    })
    return map
  }, [closed])

  const [expanded, setExpanded] = useState(() => new Set())
  const [selectedDate, setSelectedDate] = useState(null)
  const rowRefs = useRef({})

  function toggleRow(date) {
    setSelectedDate(date)
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  function handleCalendarSelect(dateKey) {
    setSelectedDate(dateKey)
    setExpanded(prev => new Set(prev).add(dateKey))
    // Wait a tick for the row to render expanded before scrolling to it.
    requestAnimationFrame(() => {
      rowRefs.current[dateKey]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  const hasAnyTrades = trades.length > 0

  return (
    <PageWrapper onSync={account && !isManualAccount ? syncTrades : undefined} syncing={syncing}>
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Day View</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Review your trading performance day by day</p>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center gap-2.5">
            <button onClick={() => setExpanded(new Set())}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:bg-white/[0.07]"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <ChevronsDownUp size={14} />
              Collapse all
            </button>
            <button onClick={() => setExpanded(new Set(rows.map(r => r.date)))}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:bg-white/[0.07]"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <ChevronsUpDown size={14} />
              Expand all
            </button>
          </div>
        )}
      </div>

      {!hasAnyTrades ? (
        <div className="glass-card p-12 text-center">
          <CalendarDays size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No trade data yet</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sync your MT5 account or log a trade to see your day-by-day performance.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <CalendarDays size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No closed trading days yet</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Once trades close, they'll show up here grouped by day.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
          <div className="space-y-3">
            {rows.map(row => (
              <DayRow
                key={row.date}
                row={row}
                dayTrades={tradesByDate[row.date] || []}
                isExpanded={expanded.has(row.date)}
                isSelected={selectedDate === row.date}
                onToggle={() => toggleRow(row.date)}
                registerRef={(el) => { rowRefs.current[row.date] = el }}
              />
            ))}
          </div>

          <div className="xl:sticky xl:top-6">
            <MiniCalendar closed={closed} selectedDate={selectedDate} onSelectDay={handleCalendarSelect} />
          </div>
        </div>
      )}
    </PageWrapper>
  )
}