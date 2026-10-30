import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceDot } from 'recharts'
import {
  ArrowLeft, Play, RotateCcw, Trash2, Loader2, TrendingUp, Target, Activity, BarChart3, Zap, TrendingDown,
  Flame, Trophy, CalendarDays, Clock, AlertTriangle,
} from 'lucide-react'
import PageWrapper from '../../components/layout/PageWrapper'
import PairIcon from '../../components/ui/PairIcon'
import * as api from '../../lib/backtest/api'
import { computeStats, fmtUsd, fmtFactor, fmtDuration } from '../../lib/backtest/stats'
import { tfLabel } from '../../lib/backtest/data'
import { getSpec, priceDigits } from '../../lib/backtest/specs'
import { formatShortDateTime } from '../../hooks/useTimeFormat'

const GREEN = 'var(--positive-green)', RED = 'var(--negative-red)'
const clr = (n) => (n > 0 ? GREEN : n < 0 ? RED : 'var(--text-primary)')
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const shortDay = (secs) => new Date(secs * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const dayLabel = (key) => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
// time axis labels: dates for long ranges, date + time when everything happened within a couple of days
const tickFor = (points) => {
  const ts = points.map(p => p.t)
  const span = ts.length ? Math.max(...ts) - Math.min(...ts) : 0
  return (secs) => (span < 3 * 86400 ? formatShortDateTime(secs * 1000) : shortDay(secs))
}
// compact axis money; `span` is the visible range, so neighbouring ticks never collapse to the same label ($1.0M, $1.0M …)
const compactUsd = (v, span = 0) => {
  const a = Math.abs(v), sign = v < 0 ? '-' : ''
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(span < 5e4 ? 3 : span < 5e5 ? 2 : 1)}M`
  if (a >= 1e4) return `${sign}$${(a / 1e3).toFixed(span < 2e3 ? 2 : 1)}K`
  return `${sign}$${Math.round(a).toLocaleString('en-US')}`
}
const streakText = (st) => (st.count ? `${st.count} ${st.type === 'win' ? (st.count === 1 ? 'Win' : 'Wins') : (st.count === 1 ? 'Loss' : 'Losses')}` : '—')
const REASON = { tp: 'Take profit', sl: 'Stop loss', manual: 'Manual', stopout: 'Stop-out' }

const AXIS = { fill: '#6B7280', fontSize: 10.5 }
const GRID = 'rgba(255,255,255,0.05)'
const BAR_NEUTRAL = 'linear-gradient(90deg, #5B21B6, #8B5CF6)'
const BAR_GAIN = 'linear-gradient(90deg, #15803D, #22C55E)'
const BAR_LOSS = 'linear-gradient(90deg, #BE123C, #F43F5E)'

// ── building blocks ──────────────────────────────────────────────────────
const Panel = ({ title, icon: Icon, sub, children, className = '', right }) => (
  <section className={`rounded-2xl p-5 min-w-0 ${className}`} style={{ background: '#0F0F12', border: '1px solid var(--border-subtle)' }}>
    <header className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h2 className="flex items-center gap-2 text-[12px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-primary)' }}>
          {Icon && <Icon size={14} style={{ color: 'var(--text-muted)' }} />}{title}
        </h2>
        {sub && <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
      {right}
    </header>
    {children}
  </section>
)

const Tile = ({ label, value, sub, color, icon: Icon, tint, inline, className = '' }) => (
  <div className={`flex items-center gap-3 rounded-xl px-4 py-3.5 min-w-0 ${className}`} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)' }}>
    {Icon && (
      <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: tint ? `${tint}22` : 'rgba(255,255,255,0.05)' }}>
        <Icon size={16} style={{ color: tint || 'var(--text-muted)' }} />
      </span>
    )}
    <div className="min-w-0">
      <p className="text-[9.5px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-[15px] font-bold tabular-nums mt-1 leading-tight truncate" style={{ color: color || 'var(--text-primary)' }}>
        {value}{inline && <span className="ml-2 text-[10.5px] font-medium" style={{ color: 'var(--text-muted)' }}>{inline}</span>}
      </p>
      {sub && <p className="text-[10.5px] mt-1 tabular-nums" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  </div>
)

function Kpi({ label, icon: Icon, children, sub }) {
  return (
    <div className="rounded-2xl px-5 py-4 min-w-0 flex flex-col" style={{ background: '#0F0F12', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <Icon size={14} style={{ color: 'var(--text-muted)' }} />
      </div>
      {children}
      {sub && <div className="text-[10.5px] mt-2 tabular-nums">{sub}</div>}
    </div>
  )
}

/** Progress ring (win rate). */
function Ring({ pct, size = 38, color = 'var(--positive-green)' }) {
  const r = size / 2 - 3, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct))
  return (
    <svg width={size} height={size} className="flex-shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
      {v > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />}
    </svg>
  )
}

/** One row per weekday: label · bar · value. `signed` colours losses red and scales by the largest absolute value. */
function WeekBars({ rows, signed = false, fmt, empty }) {
  const max = Math.max(...rows.map(r => Math.abs(r.v)), 0)
  return (
    <div className="space-y-2.5">
      {rows.map(r => {
        const w = max > 0 ? (Math.abs(r.v) / max) * 100 : 0
        const bar = !signed ? BAR_NEUTRAL : r.v < 0 ? BAR_LOSS : BAR_GAIN
        return (
          <div key={r.label} className="flex items-center gap-3">
            <span className="w-8 text-[11px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{r.label}</span>
            <div className="flex-1 h-[18px] rounded-md overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="h-full rounded-md" style={{ width: r.v === 0 ? 2 : `${Math.max(w, 2)}%`, background: r.v === 0 ? 'rgba(139,92,246,0.6)' : bar, transition: 'width 500ms ease' }} />
            </div>
            <span className="min-w-[68px] text-right text-[11px] font-bold tabular-nums" style={{ color: r.v === 0 ? 'var(--text-muted)' : signed ? clr(r.v) : 'var(--text-primary)' }}>{r.v === 0 ? '—' : fmt(r.v)}</span>
          </div>
        )
      })}
      {empty && <p className="text-[11px] pt-1" style={{ color: 'var(--text-muted)' }}>{empty}</p>}
    </div>
  )
}

const ChartTip = ({ active, payload, mode }) => {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg px-3 py-2 text-[12px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
      <p style={{ color: 'var(--text-muted)' }}>{formatShortDateTime(p.t * 1000)}</p>
      <p className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{mode === 'dd' ? `${fmtUsd(p.dd)} (${p.pct.toFixed(2)}%)` : fmtUsd(p.balance)}</p>
    </div>
  )
}

function Card({ title, children, className = '' }) {
  return <Panel title={title} className={className}>{children}</Panel>
}

export default function BacktestSession() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const row = await api.getSession(id)
      if (!row) { setError('This backtest session was not found.'); return }
      setSession(row); setTrades(await api.listTrades(id))
    } catch (e) { setError(e.message || 'Could not load this session.') } finally { setLoading(false) }
  }, [id])
  useEffect(() => { load() }, [load])

  const start = Number(session?.start_balance) || 0
  const stats = useMemo(() => computeStats(trades, start), [trades, start])
  const spec = useMemo(() => getSpec(session?.symbol || ''), [session?.symbol])
  const digits = priceDigits(spec, trades[0]?.entry)
  const hasProgress = !!session?.cursor_time

  const reset = async () => {
    if (!window.confirm('Reset this session? All its trades and your replay position are cleared. Chart drawings are kept.')) return
    setBusy(true)
    try {
      await api.deleteTrades(id)
      await api.updateSession(id, { cursor_time: null, state: { positions: [], orders: [] }, status: 'active', time_spent_secs: 0 })
      toast.success('Session reset'); await load()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!window.confirm(`Delete “${session.name}” and all of its trades? This can’t be undone.`)) return
    setBusy(true)
    try { await api.deleteSession(id); toast.success('Session deleted'); navigate('/backtesting') } catch (e) { toast.error(e.message); setBusy(false) }
  }
  const saveNote = async (t, notes) => {
    if (notes === (t.notes || '')) return
    try { await api.updateTradeNotes(t.dbId, notes); setTrades(l => l.map(x => (x.dbId === t.dbId ? { ...x, notes } : x))) } catch (e) { toast.error(e.message) }
  }

  if (loading) {
    return <PageWrapper><div className="flex items-center justify-center py-32 gap-2.5" style={{ color: 'var(--text-muted)' }}><Loader2 size={18} className="animate-spin" /> Loading session…</div></PageWrapper>
  }
  if (error || !session) {
    return (
      <PageWrapper>
        <div className="glass-card max-w-md mx-auto p-8 text-center mt-10">
          <AlertTriangle size={26} className="mx-auto mb-3" style={{ color: '#F59E0B' }} />
          <p className="text-[13px] mb-4" style={{ color: 'var(--text-muted)' }}>{error || 'Session not found.'}</p>
          <Link to="/backtesting" className="btn-primary inline-block px-4 py-2 rounded-lg text-[13px] font-semibold text-white">All sessions</Link>
        </div>
      </PageWrapper>
    )
  }

  const completed = session.status === 'completed'
  const equity = stats.equity.map(p => ({ ...p }))
  const gain = stats.netPnl >= 0
  const lineColor = gain ? '#22C55E' : '#F43F5E'
  const lastEq = equity[equity.length - 1]
  const eqSpan = equity.length ? Math.max(...equity.map(p => p.balance)) - Math.min(...equity.map(p => p.balance)) : 0
  const dd = stats.drawdown.length ? [{ t: equity[0].t, dd: 0, pct: 0 }, ...stats.drawdown] : []
  const lastDd = dd[dd.length - 1]
  const winShare = stats.trades ? (stats.wins / stats.trades) * 100 : 0
  const decided = stats.wins + stats.losses + stats.breakeven
  const streak = stats.streaks.current

  return (
    <PageWrapper>
      <div className="max-w-[1500px] mx-auto space-y-4">
        {/* header */}
        <div className="flex flex-wrap items-center gap-3 pb-1">
          <Link to="/backtesting" className="p-2 -ml-2 rounded-lg hover:bg-white/10" style={{ color: 'var(--text-secondary)' }} title="All sessions"><ArrowLeft size={18} /></Link>
          <PairIcon symbol={session.symbol} size={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-[20px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{session.name}</h1>
              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2.5 py-[3px] rounded-full"
                    style={{ background: completed ? 'rgba(34,197,94,0.14)' : 'rgba(139,92,246,0.16)', color: completed ? GREEN : 'var(--accent-purple-light)' }}>
                {completed ? <Trophy size={10} /> : <Play size={10} />}{completed ? 'Completed' : 'Active'}
              </span>
            </div>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{session.symbol}</span> • {tfLabel(session.base_tf)}{session.strategy ? ` • ${session.strategy}` : ''} • {fmtDate(session.start_at)} – {fmtDate(new Date(new Date(session.end_at) - 1))}
            </p>
          </div>
          <div className="flex-1" />
          <button onClick={reset} disabled={busy || (!hasProgress && !trades.length)} className="h-10 px-3.5 rounded-lg text-[12.5px] font-semibold flex items-center gap-1.5 hover:bg-white/5 disabled:opacity-40" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}><RotateCcw size={14} /> Reset</button>
          <button onClick={remove} disabled={busy} className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-white/5 disabled:opacity-40" style={{ border: '1px solid var(--border-subtle)' }} title="Delete session"><Trash2 size={15} style={{ color: RED }} /></button>
          <Link to={`/backtesting/${id}/chart`} className="btn-primary h-10 px-5 rounded-lg text-[13px] font-semibold text-white flex items-center gap-2">
            <Play size={14} /> {completed ? 'Review chart' : hasProgress ? 'Continue backtesting' : 'Start Backtesting'}
          </Link>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi label="Net P&L" icon={TrendingUp}
               sub={<><span style={{ color: clr(stats.returnPct) }}>{stats.returnPct >= 0 ? '+' : ''}{stats.returnPct.toFixed(2)}%</span> <span style={{ color: 'var(--text-muted)' }}>from {fmtUsd(start)}</span></>}>
            <p className="text-[26px] font-bold tabular-nums leading-none" style={{ color: clr(stats.netPnl) }}>{fmtUsd(stats.netPnl, { sign: true })}</p>
          </Kpi>
          <Kpi label="Win rate" icon={Target}
               sub={<><span style={{ color: GREEN }}>{stats.wins}W</span> <span style={{ color: 'var(--text-muted)' }}>/</span> <span style={{ color: RED }}>{stats.losses}L</span>{stats.breakeven ? <span style={{ color: 'var(--text-muted)' }}> / {stats.breakeven}BE</span> : null}</>}>
            <div className="flex items-center gap-3">
              <Ring pct={stats.winRate} />
              <p className="text-[26px] font-bold tabular-nums leading-none" style={{ color: 'var(--text-primary)' }}>{stats.winRate.toFixed(1)}%</p>
            </div>
          </Kpi>
          <Kpi label="Closed trades" icon={Activity}>
            <p className="text-[26px] font-bold tabular-nums leading-none" style={{ color: 'var(--text-primary)' }}>{stats.trades}</p>
            <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }} title={`${winShare.toFixed(0)}% winners`}>
              <div className="h-full rounded-full" style={{ width: `${winShare}%`, background: 'var(--accent-purple)', transition: 'width 500ms ease' }} />
            </div>
          </Kpi>
          <Kpi label="Profit factor" icon={BarChart3}
               sub={<><span style={{ color: GREEN }}>{fmtUsd(stats.grossProfit, { sign: true })}</span> <span style={{ color: 'var(--text-muted)' }}>/</span> <span style={{ color: RED }}>{fmtUsd(-stats.grossLoss)}</span></>}>
            <p className="text-[26px] font-bold tabular-nums leading-none" style={{ color: 'var(--text-primary)' }}>{fmtFactor(stats.profitFactor)}</p>
          </Kpi>
          <Kpi label="Expectancy" icon={Zap} sub={<span style={{ color: 'var(--text-muted)' }}>per trade</span>}>
            <p className="text-[26px] font-bold tabular-nums leading-none" style={{ color: clr(stats.expectancy) }}>{fmtUsd(stats.expectancy, { sign: true })}</p>
          </Kpi>
          <Kpi label="Max drawdown" icon={TrendingDown} sub={<span style={{ color: stats.maxDrawdown > 0 ? RED : 'var(--text-muted)' }}>{stats.maxDrawdown > 0 ? `-${stats.maxDrawdownPct.toFixed(2)}% from peak` : 'No drawdown yet'}</span>}>
            <p className="text-[26px] font-bold tabular-nums leading-none" style={{ color: stats.maxDrawdown > 0 ? RED : 'var(--text-primary)' }}>{fmtUsd(-stats.maxDrawdown)}</p>
          </Kpi>
        </div>

        {/* performance + drawdown */}
        <div className="grid xl:grid-cols-[1.65fr_1fr] gap-3">
          <Panel title="Performance">
            <div className="h-[260px]">
              {equity.length < 2 ? (
                <div className="h-full flex items-center justify-center text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Close trades to see the equity curve</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equity} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <defs><linearGradient id="eq" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={lineColor} stopOpacity={0.32} /><stop offset="100%" stopColor={lineColor} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="3 5" />
                    <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tickFor(equity)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={70} />
                    <YAxis orientation="right" domain={['auto', 'auto']} tickFormatter={(v) => compactUsd(v, eqSpan)} tick={AXIS} axisLine={false} tickLine={false} width={66} />
                    <Tooltip content={<ChartTip />} cursor={{ stroke: 'rgba(255,255,255,0.18)' }} />
                    <ReferenceLine y={start} stroke="rgba(255,255,255,0.22)" strokeDasharray="4 4" />
                    <Area type="linear" dataKey="balance" stroke={lineColor} strokeWidth={2} fill="url(#eq)" activeDot={{ r: 4 }} />
                    {lastEq && <ReferenceDot x={lastEq.t} y={lastEq.balance} r={4} fill={lineColor} stroke="#fff" strokeWidth={1.5} ifOverflow="extendDomain" />}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Panel>
          <Panel title="Drawdown">
            <div className="h-[260px]">
              {dd.length < 2 ? (
                <div className="h-full flex items-center justify-center text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Close trades to see drawdown</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dd} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <defs><linearGradient id="dd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F43F5E" stopOpacity={0} /><stop offset="100%" stopColor="#F43F5E" stopOpacity={0.38} /></linearGradient></defs>
                    <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="3 5" />
                    <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tickFor(dd)} tick={AXIS} axisLine={false} tickLine={false} minTickGap={70} />
                    <YAxis orientation="right" domain={['auto', 0]} tickFormatter={(v) => `${v.toFixed(2)}%`} tick={AXIS} axisLine={false} tickLine={false} width={54} />
                    <Tooltip content={<ChartTip mode="dd" />} cursor={{ stroke: 'rgba(255,255,255,0.18)' }} />
                    <Area type="monotone" dataKey="pct" stroke="#F43F5E" strokeWidth={2} fill="url(#dd)" activeDot={{ r: 4 }} />
                    {lastDd && <ReferenceDot x={lastDd.t} y={lastDd.pct} r={4} fill="#F43F5E" stroke="#fff" strokeWidth={1.5} />}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Panel>
        </div>

        {/* trade breakdown + streaks */}
        <div className="grid xl:grid-cols-2 gap-3">
          <Panel title="Trade breakdown">
            <div className="grid sm:grid-cols-2 gap-3">
              <Tile label="Long" value={`${stats.long.wins}W / ${stats.long.losses}L`} sub={`${stats.long.winRate.toFixed(1)}% win rate`} />
              <Tile label="Short" value={`${stats.short.wins}W / ${stats.short.losses}L`} sub={`${stats.short.winRate.toFixed(1)}% win rate`} />
              <Tile label="Avg win" value={fmtUsd(stats.avgWin, { sign: true })} color={stats.avgWin ? GREEN : undefined} />
              <Tile label="Avg loss" value={fmtUsd(stats.avgLoss, { sign: true })} color={stats.avgLoss ? RED : undefined} />
              <Tile label="Largest win" value={fmtUsd(stats.largestWin, { sign: true })} color={stats.largestWin ? GREEN : undefined} />
              <Tile label="Largest loss" value={fmtUsd(stats.largestLoss, { sign: true })} color={stats.largestLoss ? RED : undefined} />
              <Tile label="Avg hold time" value={stats.trades ? fmtDuration(stats.avgHoldSecs) : '—'} sub={stats.trades ? 'market time' : undefined} />
              <Tile label="Trading days" value={stats.tradingDays} sub={`${stats.profitDays} profit / ${stats.lossDays} loss`} />
            </div>
          </Panel>
          <Panel title="Streaks & records">
            <div className="grid sm:grid-cols-2 gap-3">
              <Tile icon={Flame} label="Current streak" value={streakText(streak)} color={streak.type === 'win' ? GREEN : streak.type === 'loss' ? RED : undefined} tint={streak.type === 'win' ? '#22C55E' : streak.type === 'loss' ? '#F43F5E' : undefined} />
              <Tile icon={Trophy} label="Best win streak" value={stats.streaks.bestWin ? `${stats.streaks.bestWin} ${stats.streaks.bestWin === 1 ? 'Win' : 'Wins'}` : '—'} color={stats.streaks.bestWin ? GREEN : undefined} tint="#22C55E" />
              <Tile icon={TrendingDown} label="Worst loss streak" value={stats.streaks.worstLoss ? `${stats.streaks.worstLoss} ${stats.streaks.worstLoss === 1 ? 'Loss' : 'Losses'}` : '—'} color={stats.streaks.worstLoss ? RED : undefined} tint="#F43F5E" />
              <Tile icon={CalendarDays} label="Best day" value={stats.bestDay ? fmtUsd(stats.bestDay.pnl, { sign: true }) : '—'} inline={stats.bestDay ? dayLabel(stats.bestDay.date) : undefined} color={stats.bestDay?.pnl > 0 ? GREEN : undefined} tint="#22C55E" />
              <Tile icon={CalendarDays} label="Worst day" value={stats.worstDay ? fmtUsd(stats.worstDay.pnl, { sign: true }) : '—'} inline={stats.worstDay ? dayLabel(stats.worstDay.date) : undefined} color={stats.worstDay?.pnl < 0 ? RED : undefined} tint="#F43F5E" />
              <Tile icon={Clock} label="Time backtesting" value={fmtDuration(session.time_spent_secs)} className="sm:col-span-2" />
            </div>
          </Panel>
        </div>

        {/* distributions */}
        <div className="grid lg:grid-cols-3 gap-3">
          <Panel title="Win/Loss distribution" icon={BarChart3}>
            <div className="flex h-10 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
              {decided === 0 ? (
                <div className="flex-1 flex items-center justify-center text-[11px]" style={{ color: 'var(--text-muted)' }}>No closed trades yet</div>
              ) : (<>
                {stats.wins > 0 && <div className="flex items-center justify-center text-[11px] font-bold text-white" style={{ flex: stats.wins, background: BAR_GAIN }}>{stats.wins}W</div>}
                {stats.breakeven > 0 && <div className="flex items-center justify-center text-[11px] font-bold text-white" style={{ flex: stats.breakeven, background: '#4B5563' }}>{stats.breakeven}BE</div>}
                {stats.losses > 0 && <div className="flex items-center justify-center text-[11px] font-bold text-white" style={{ flex: stats.losses, background: BAR_LOSS }}>{stats.losses}L</div>}
              </>)}
            </div>
            <div className="mt-5 space-y-3">
              {[
                ['Gross profit', GREEN, fmtUsd(stats.grossProfit, { sign: true }), GREEN],
                ['Gross loss', RED, fmtUsd(-stats.grossLoss), RED],
                ['Net result', 'var(--accent-purple)', fmtUsd(stats.netPnl, { sign: true }), clr(stats.netPnl)],
              ].map(([k, dot, v, c]) => (
                <div key={k} className="flex items-center gap-2.5 text-[11.5px]">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span className="flex-1" />
                  <span className="font-bold tabular-nums" style={{ color: c }}>{v}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Trade distribution" icon={Activity} sub="Trades per day of the week">
            <WeekBars rows={stats.weekdays.map(w => ({ label: w.label, v: w.trades }))} fmt={(v) => v} />
            <div className="mt-4 pt-3 flex items-center gap-2 text-[11px]" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-purple)' }} /> Total: {stats.trades} closed {stats.trades === 1 ? 'trade' : 'trades'}
            </div>
          </Panel>
          <Panel title="Day performance" icon={CalendarDays} sub="P&L by day of the week">
            <WeekBars rows={stats.weekdays.map(w => ({ label: w.label, v: w.pnl }))} signed fmt={(v) => fmtUsd(v, { sign: true })} />
          </Panel>
        </div>

        {/* monthly */}
        {stats.monthly.length > 0 && (
          <Card title="Monthly trades">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead><tr style={{ color: 'var(--text-muted)' }}>{['Month', 'Trades', 'Win rate', 'P&L'].map(h => <th key={h} className="text-left font-medium py-1.5 pr-4">{h}</th>)}</tr></thead>
                <tbody>{stats.monthly.map(m => (
                  <tr key={m.key} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-2 pr-4" style={{ color: 'var(--text-primary)' }}>{m.label}</td>
                    <td className="py-2 pr-4 tabular-nums" style={{ color: 'var(--text-primary)' }}>{m.trades}</td>
                    <td className="py-2 pr-4 tabular-nums" style={{ color: 'var(--text-primary)' }}>{m.winRate.toFixed(0)}%</td>
                    <td className="py-2 pr-4 tabular-nums font-semibold" style={{ color: clr(m.pnl) }}>{fmtUsd(m.pnl, { sign: true })}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
        )}

        {/* trades */}
        <Card title={`Trades (${trades.length})`}>
          {trades.length === 0 ? (
            <p className="text-[12.5px] py-4" style={{ color: 'var(--text-muted)' }}>No closed trades yet. Start backtesting to take your first trade.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead><tr style={{ color: 'var(--text-muted)' }}>{['Closed', 'Side', 'Lots', 'Entry', 'Exit', 'Closed by', 'P&L', 'Notes'].map(h => <th key={h} className="text-left font-medium py-1.5 pr-4 whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>{[...trades].reverse().map(t => (
                  <tr key={t.dbId || t.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-2 pr-4 whitespace-nowrap tabular-nums" style={{ color: 'var(--text-secondary)' }}>{formatShortDateTime(t.closedAt * 1000)}</td>
                    <td className="py-2 pr-4 font-semibold" style={{ color: t.side === 'buy' ? '#22C55E' : '#F43F5E' }}>{t.side === 'buy' ? 'Buy' : 'Sell'}</td>
                    <td className="py-2 pr-4 tabular-nums" style={{ color: 'var(--text-primary)' }}>{t.lots}</td>
                    <td className="py-2 pr-4 tabular-nums" style={{ color: 'var(--text-primary)' }}>{t.entry.toFixed(digits)}</td>
                    <td className="py-2 pr-4 tabular-nums" style={{ color: 'var(--text-primary)' }}>{t.exit.toFixed(digits)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{REASON[t.reason] || t.reason}</td>
                    <td className="py-2 pr-4 tabular-nums font-semibold" style={{ color: clr(t.pnl) }}>{fmtUsd(t.pnl, { sign: true })}</td>
                    <td className="py-1 pr-2 min-w-[180px]">
                      <input defaultValue={t.notes || ''} maxLength={300} placeholder="Add a note…" onBlur={(e) => saveNote(t, e.target.value.trim())}
                             onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                             className="w-full bg-transparent rounded-md px-2 py-1 text-[12px] outline-none focus:bg-white/5" style={{ color: 'var(--text-primary)' }} />
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>

        {/* settings */}
        <Card title="Session settings">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12.5px]">
            {[
              ['Starting balance', fmtUsd(start)],
              ['Leverage', `1:${session.leverage}`],
              ['Spread', Number(session.spread) ? `${(Number(session.spread) / (spec.pipSize || 1)).toFixed(1)} ${spec.kind === 'forex' ? 'pips' : 'pts'}` : 'None'],
              ['Replay precision', `${tfLabel(session.base_tf)} candles`],
            ].map(([k, v]) => (
              <div key={k}><p style={{ color: 'var(--text-muted)' }}>{k}</p><p className="font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>{v}</p></div>
            ))}
          </div>
          {session.description && <p className="mt-4 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{session.description}</p>}
        </Card>
      </div>
    </PageWrapper>
  )
}