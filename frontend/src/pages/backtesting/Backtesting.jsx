import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { FlaskConical, Plus, Trash2, Calendar, Loader2, ArrowRight } from 'lucide-react'
import PageWrapper from '../../components/layout/PageWrapper'
import PairIcon from '../../components/ui/PairIcon'
import NewSessionModal from '../../components/backtest/NewSessionModal'
import { useAuth } from '../../hooks/useAuth'
import * as api from '../../lib/backtest/api'
import { computeStats, fmtUsd, fmtFactor } from '../../lib/backtest/stats'
import { tfLabel } from '../../lib/backtest/data'

const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const clr = (n) => (n > 0 ? 'var(--positive-green)' : n < 0 ? 'var(--negative-red)' : 'var(--text-primary)')

function SessionCard({ s, stats, onDelete }) {
  const progress = s.cursor_time
    ? Math.max(0, Math.min(1, (s.cursor_time - new Date(s.start_at) / 1000) / ((new Date(s.end_at) - new Date(s.start_at)) / 1000)))
    : 0
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 flex flex-col gap-3.5 group relative">
      <Link to={`/backtesting/${s.id}`} className="absolute inset-0 rounded-[inherit]" aria-label={`Open ${s.name}`} />
      <div className="flex items-start gap-3">
        <PairIcon symbol={s.symbol} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
          <p className="text-[11.5px] truncate" style={{ color: 'var(--text-muted)' }}>{s.symbol} · {tfLabel(s.base_tf)}{s.strategy ? ` · ${s.strategy}` : ''}</p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{
          background: s.status === 'completed' ? 'rgba(34,197,94,0.14)' : 'rgba(139,92,246,0.16)',
          color: s.status === 'completed' ? 'var(--positive-green)' : 'var(--accent-purple-light)',
        }}>{s.status === 'completed' ? 'Completed' : 'Active'}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div><p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Net P&L</p>
          <p className="text-[14px] font-bold tabular-nums" style={{ color: clr(stats.netPnl) }}>{fmtUsd(stats.netPnl, { sign: true })}</p></div>
        <div><p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Win rate</p>
          <p className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{stats.trades ? `${stats.winRate.toFixed(0)}%` : '—'}</p></div>
        <div><p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Trades</p>
          <p className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{stats.trades}</p></div>
      </div>

      <div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: 'var(--gradient-primary)' }} />
        </div>
        <div className="flex items-center justify-between mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1"><Calendar size={11} /> {fmtDate(s.start_at)} – {fmtDate(new Date(new Date(s.end_at) - 1))}</span>
          <span>PF {fmtFactor(stats.profitFactor)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between relative z-10 -mb-1">
        <button onClick={() => onDelete(s)} className="p-1.5 -ml-1.5 rounded-md hover:bg-white/10 opacity-60 hover:opacity-100 transition-opacity" title="Delete session">
          <Trash2 size={14} style={{ color: 'var(--negative-red)' }} />
        </button>
        <Link to={`/backtesting/${s.id}`} className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: 'var(--accent-purple-light)' }}>
          Open <ArrowRight size={13} />
        </Link>
      </div>
    </motion.div>
  )
}

export default function Backtesting() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true); setError('')
    try {
      const [s, t] = await Promise.all([api.listSessions(user.id), api.listTradeSummaries(user.id)])
      setSessions(s); setTrades(t)
    } catch (e) {
      setError(e.message || 'Could not load your sessions.')
    } finally { setLoading(false) }
  }, [user])
  useEffect(() => { load() }, [load])

  const statsBySession = useMemo(() => {
    const by = new Map()
    for (const t of trades) { if (!by.has(t.sessionId)) by.set(t.sessionId, []); by.get(t.sessionId).push(t) }
    return new Map(sessions.map(s => [s.id, computeStats(by.get(s.id) || [], Number(s.start_balance))]))
  }, [sessions, trades])

  const strategies = useMemo(() => [...new Set(sessions.map(s => s.strategy).filter(Boolean))].sort(), [sessions])
  const shown = sessions.filter(s => filter === 'all' || s.status === filter)

  const create = async (payload) => {
    const row = await api.createSession(user.id, payload)
    toast.success('Session created')
    navigate(`/backtesting/${row.id}`)
  }

  const remove = async (s) => {
    if (!window.confirm(`Delete “${s.name}” and all of its trades? This can’t be undone.`)) return
    try {
      await api.deleteSession(s.id)
      setSessions(list => list.filter(x => x.id !== s.id)); setTrades(t => t.filter(x => x.sessionId !== s.id))
      toast.success('Session deleted')
    } catch (e) { toast.error(e.message) }
  }

  return (
    <PageWrapper>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Backtesting</h1>
            <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Replay real historical candles bar by bar, take simulated trades, and measure your edge.</p>
          </div>
          <button onClick={() => setShowNew(true)} className="btn-primary px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white flex items-center gap-1.5"><Plus size={15} /> New Session</button>
        </div>

        {sessions.length > 0 && (
          <div className="flex gap-1 mb-4">
            {[['all', 'All'], ['active', 'Active'], ['completed', 'Completed']].map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-colors"
                      style={{ background: filter === k ? 'rgba(139,92,246,0.16)' : 'transparent', color: filter === k ? 'var(--accent-purple-light)' : 'var(--text-muted)', border: `1px solid ${filter === k ? 'rgba(139,92,246,0.4)' : 'var(--border-subtle)'}` }}>{label}</button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24 gap-2.5" style={{ color: 'var(--text-muted)' }}><Loader2 size={18} className="animate-spin" /> Loading sessions…</div>
        ) : error ? (
          <div className="glass-card p-8 text-center">
            <p className="text-[13px] mb-4" style={{ color: 'var(--negative-red)' }}>{error}</p>
            <p className="text-[12px] mb-4" style={{ color: 'var(--text-muted)' }}>If this is the first time you’re opening Backtesting, run <code>004_backtesting.sql</code> in the Supabase SQL editor.</p>
            <button onClick={load} className="btn-primary px-4 py-2 rounded-lg text-[13px] font-semibold text-white">Retry</button>
          </div>
        ) : sessions.length === 0 ? (
          <div className="glass-card flex flex-col items-center text-center px-6 py-16">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(139,92,246,0.14)' }}><FlaskConical size={26} style={{ color: 'var(--accent-purple-light)' }} /></div>
            <h2 className="text-lg font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>Create your first backtest session</h2>
            <p className="text-[13px] max-w-md mb-5" style={{ color: 'var(--text-muted)' }}>Pick a symbol, a date range and a starting balance. Then replay the market candle by candle, draw on the chart like TradingView, and take trades with a real SL/TP engine.</p>
            <button onClick={() => setShowNew(true)} className="btn-primary px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white flex items-center gap-1.5"><Plus size={15} /> New Session</button>
          </div>
        ) : shown.length === 0 ? (
          <p className="text-center py-16 text-[13px]" style={{ color: 'var(--text-muted)' }}>No {filter} sessions.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map(s => <SessionCard key={s.id} s={s} stats={statsBySession.get(s.id)} onDelete={remove} />)}
          </div>
        )}
      </div>

      {showNew && <NewSessionModal strategies={strategies} onCreate={create} onClose={() => setShowNew(false)} />}
    </PageWrapper>
  )
}