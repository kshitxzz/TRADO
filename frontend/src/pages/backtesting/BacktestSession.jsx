import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts'
import {
  ArrowLeft, Play, RotateCcw, Trash2, Loader2, TrendingUp, Percent, Hash, BarChart3, Zap, TrendingDown,
  Flame, Trophy, CalendarDays, Clock, AlertTriangle,
} from 'lucide-react'
import PageWrapper from '../../components/layout/PageWrapper'
import PairIcon from '../../components/ui/PairIcon'
import * as api from '../../lib/backtest/api'
import { computeStats, fmtUsd, fmtFactor, fmtDuration } from '../../lib/backtest/stats'
import { tfLabel } from '../../lib/backtest/data'
import { getSpec, priceDigits } from '../../lib/backtest/specs'
import { formatShortDateTime } from '../../hooks/useTimeFormat'

const clr = (n) => (n > 0 ? 'var(--positive-green)' : n < 0 ? 'var(--negative-red)' : 'var(--text-primary)')
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const shortDay = (secs) => new Date(secs * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
// time axis labels: dates for long ranges, date + time when everything happened within a couple of days
const tickFor = (points) => {
  const ts = points.map(p => p.t)
  const span = ts.length ? Math.max(...ts) - Math.min(...ts) : 0
  return (secs) => (span < 3 * 86400 ? formatShortDateTime(secs * 1000) : shortDay(secs))
}
const REASON = { tp: 'Take profit', sl: 'Stop loss', manual: 'Manual', stopout: 'Stop-out' }

function StatCard({ label, value, sub, icon: Icon, color, children }) {
  return (
    <div className="glass-card p-4 min-w-0">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10.5px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <Icon size={14} style={{ color: 'var(--text-muted)' }} />
      </div>
      <p className="text-[22px] font-bold tabular-nums leading-tight" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
      {children}
      {sub && <p className="text-[11.5px] mt-1 tabular-nums" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

function Row({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {Icon && <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.04)' }}><Icon size={14} style={{ color: 'var(--text-muted)' }} /></span>}
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        {sub && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
      <p className="text-[13px] font-semibold tabular-nums" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

const ChartTip = ({ active, payload, mode }) => {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg px-3 py-2 text-[12px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
      <p style={{ color: 'var(--text-muted)' }}>{formatShortDateTime(p.t * 1000)}</p>
      <p className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{mode === 'dd' ? fmtUsd(p.dd) : fmtUsd(p.balance)}</p>
    </div>
  )
}

function Card({ title, children, className = '' }) {
  return (
    <div className={`glass-card p-5 ${className}`}>
      <p className="text-[11px] font-bold tracking-wider uppercase mb-3" style={{ color: 'var(--text-muted)' }}>{title}</p>
      {children}
    </div>
  )
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

  return (
    <PageWrapper>
      <div className="max-w-6xl mx-auto space-y-4">
        {/* header */}
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/backtesting" className="p-2 rounded-lg hover:bg-white/10" style={{ color: 'var(--text-secondary)' }} title="All sessions"><ArrowLeft size={18} /></Link>
          <PairIcon symbol={session.symbol} size={34} />
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-[18px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{session.name}</h1>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: completed ? 'rgba(34,197,94,0.14)' : 'rgba(139,92,246,0.16)', color: completed ? 'var(--positive-green)' : 'var(--accent-purple-light)' }}>{completed ? 'Completed' : 'Active'}</span>
            </div>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {session.symbol} · {tfLabel(session.base_tf)}{session.strategy ? ` · ${session.strategy}` : ''} · {fmtDate(session.start_at)} – {fmtDate(new Date(new Date(session.end_at) - 1))}
            </p>
          </div>
          <div className="flex-1" />
          <button onClick={reset} disabled={busy || (!hasProgress && !trades.length)} className="px-3 py-2 rounded-lg text-[12.5px] font-semibold flex items-center gap-1.5 hover:bg-white/5 disabled:opacity-40" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}><RotateCcw size={14} /> Reset</button>
          <button onClick={remove} disabled={busy} className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-40" style={{ border: '1px solid var(--border-subtle)' }} title="Delete session"><Trash2 size={15} style={{ color: 'var(--negative-red)' }} /></button>
          <Link to={`/backtesting/${id}/chart`} className="btn-primary px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white flex items-center gap-2">
            <Play size={14} /> {completed ? 'Review chart' : hasProgress ? 'Continue backtesting' : 'Start Backtesting'}
          </Link>
        </div>

        {/* stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard label="Net P&L" icon={TrendingUp} value={fmtUsd(stats.netPnl, { sign: true })} color={clr(stats.netPnl)}
                    sub={`${stats.returnPct >= 0 ? '+' : ''}${stats.returnPct.toFixed(2)}% from ${fmtUsd(start, { dp: 0 })}`} />
          <StatCard label="Win rate" icon={Percent} value={`${stats.winRate.toFixed(1)}%`} sub={`${stats.wins}W / ${stats.losses}L`} />
          <StatCard label="Total trades" icon={Hash} value={stats.trades} sub={stats.breakeven ? `${stats.breakeven} breakeven` : undefined} />
          <StatCard label="Profit factor" icon={BarChart3} value={fmtFactor(stats.profitFactor)} sub={`${fmtUsd(stats.grossProfit, { sign: true })} / -${fmtUsd(stats.grossLoss)}`} />
          <StatCard label="Expectancy" icon={Zap} value={fmtUsd(stats.expectancy, { sign: true })} color={clr(stats.expectancy)} sub="per trade" />
          <StatCard label="Max drawdown" icon={TrendingDown} value={fmtUsd(-stats.maxDrawdown)} color={stats.maxDrawdown > 0 ? 'var(--negative-red)' : undefined} sub={stats.maxDrawdown > 0 ? `${stats.maxDrawdownPct.toFixed(2)}% from peak` : undefined} />
        </div>

        {/* charts */}
        <div className="grid lg:grid-cols-5 gap-3">
          <Card title="Performance" className="lg:col-span-3">
            <div className="h-[240px]">
              {equity.length < 2 ? (
                <div className="h-full flex items-center justify-center text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Close trades to see the equity curve</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equity} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                    <defs><linearGradient id="eq" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={lineColor} stopOpacity={0.35} /><stop offset="100%" stopColor={lineColor} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tickFor(equity)} tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={60} />
                    <YAxis domain={['auto', 'auto']} tickFormatter={(v) => `$${Math.round(v).toLocaleString()}`} tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
                    <Tooltip content={<ChartTip />} />
                    <ReferenceLine y={start} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />
                    <Area type="linear" dataKey="balance" stroke={lineColor} strokeWidth={2} fill="url(#eq)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
          <Card title="Drawdown" className="lg:col-span-2">
            <div className="h-[240px]">
              {stats.drawdown.length < 1 ? (
                <div className="h-full flex items-center justify-center text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Close trades to see drawdown</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.drawdown} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                    <defs><linearGradient id="dd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F43F5E" stopOpacity={0} /><stop offset="100%" stopColor="#F43F5E" stopOpacity={0.4} /></linearGradient></defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tickFor(stats.drawdown)} tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={60} />
                    <YAxis tickFormatter={(v) => `$${Math.round(v).toLocaleString()}`} tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
                    <Tooltip content={<ChartTip mode="dd" />} />
                    <Area type="stepAfter" dataKey="dd" stroke="#F43F5E" strokeWidth={2} fill="url(#dd)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>

        {/* breakdown + streaks */}
        <div className="grid lg:grid-cols-2 gap-3">
          <Card title="Trade breakdown">
            <div className="grid sm:grid-cols-2 gap-x-6">
              <div>
                <Row label="Long" value={`${stats.long.wins}W / ${stats.long.losses}L`} sub={`${stats.long.winRate.toFixed(1)}% win rate`} />
                <Row label="Short" value={`${stats.short.wins}W / ${stats.short.losses}L`} sub={`${stats.short.winRate.toFixed(1)}% win rate`} />
                <Row label="Trading days" value={stats.tradingDays} sub={`${stats.profitDays} profit / ${stats.lossDays} loss`} />
              </div>
              <div>
                <Row label="Avg win" value={fmtUsd(stats.avgWin, { sign: true })} color={stats.avgWin ? 'var(--positive-green)' : undefined} />
                <Row label="Avg loss" value={fmtUsd(stats.avgLoss, { sign: true })} color={stats.avgLoss ? 'var(--negative-red)' : undefined} />
                <Row label="Largest win" value={fmtUsd(stats.largestWin, { sign: true })} color={stats.largestWin ? 'var(--positive-green)' : undefined} />
                <Row label="Largest loss" value={fmtUsd(stats.largestLoss, { sign: true })} color={stats.largestLoss ? 'var(--negative-red)' : undefined} />
              </div>
            </div>
          </Card>
          <Card title="Streaks & records">
            <div className="grid sm:grid-cols-2 gap-x-6">
              <div>
                <Row icon={Flame} label="Current streak" value={stats.streaks.current.count ? `${stats.streaks.current.count} ${stats.streaks.current.type === 'win' ? (stats.streaks.current.count === 1 ? 'win' : 'wins') : (stats.streaks.current.count === 1 ? 'loss' : 'losses')}` : '—'} color={stats.streaks.current.type === 'win' ? 'var(--positive-green)' : stats.streaks.current.type === 'loss' ? 'var(--negative-red)' : undefined} />
                <Row icon={Trophy} label="Best win streak" value={stats.streaks.bestWin || '—'} color={stats.streaks.bestWin ? 'var(--positive-green)' : undefined} />
                <Row icon={TrendingDown} label="Worst loss streak" value={stats.streaks.worstLoss || '—'} color={stats.streaks.worstLoss ? 'var(--negative-red)' : undefined} />
              </div>
              <div>
                <Row icon={CalendarDays} label="Best day" value={stats.bestDay ? fmtUsd(stats.bestDay.pnl, { sign: true }) : '—'} sub={stats.bestDay?.date} color={stats.bestDay?.pnl > 0 ? 'var(--positive-green)' : undefined} />
                <Row icon={CalendarDays} label="Worst day" value={stats.worstDay ? fmtUsd(stats.worstDay.pnl, { sign: true }) : '—'} sub={stats.worstDay?.date} color={stats.worstDay?.pnl < 0 ? 'var(--negative-red)' : undefined} />
                <Row icon={Clock} label="Time backtesting" value={fmtDuration(session.time_spent_secs)} sub={stats.trades ? `avg hold ${fmtDuration(stats.avgHoldSecs)} (market time)` : undefined} />
              </div>
            </div>
          </Card>
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