import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ChevronDown, Search, BookOpen, CheckCircle2, Star,
  Sparkles, RefreshCw, Loader2, WifiOff, Image as ImageIcon,
  Shield, Brain, Lightbulb, ChevronRight, TrendingUp, TrendingDown,
  Layers, ArrowRightLeft, Clock,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useTrades } from '../../hooks/useTrades'
import { formatPnl } from '../../lib/utils'
import PairIcon from '../ui/PairIcon'
import {
  computeTradeQualityScore, computeTradeVsAverage,
  getDurationSeconds, formatDuration, qualityBand, gradeColor,
} from '../../lib/analytics'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'
const DATE_FILTERS = ['All Time', 'Today', 'This Week', 'This Month', '3 Months', 'This Year']
const SORT_OPTIONS  = [
  { key: 'date',   label: 'By Date' },
  { key: 'pnl',    label: 'By P&L' },
  { key: 'symbol', label: 'By Symbol' },
]

// ── Small helpers (mirrors Journal.jsx conventions) ─────────────────────────
function fmtDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ', ' + new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}
function isInDateRange(trade, filter) {
  if (filter === 'All Time') return true
  const closedAt = trade.closed_at ? new Date(trade.closed_at) : null
  if (!closedAt) return false
  const now = new Date()
  if (filter === 'Today') return closedAt.toDateString() === now.toDateString()
  if (filter === 'This Week') {
    const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - start.getDay())
    return closedAt >= start
  }
  if (filter === 'This Month') return closedAt.getMonth() === now.getMonth() && closedAt.getFullYear() === now.getFullYear()
  if (filter === '3 Months') {
    const cutoff = new Date(now); cutoff.setMonth(now.getMonth() - 3)
    return closedAt >= cutoff
  }
  if (filter === 'This Year') return closedAt.getFullYear() === now.getFullYear()
  return true
}
function deltaColor(pct) { return pct >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }
function fmtDelta(pct) { return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%` }

// ── Dark dropdown (mirrors Trades.jsx's CustomDropdown) ─────────────────────
function Dropdown({ value, onChange, options, labelOf, width = 130 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])
  const label = labelOf ? labelOf(value) : value
  return (
    <div ref={ref} style={{ position: 'relative', minWidth: width }}>
      <button onClick={() => setOpen(o => !o)}
              className="flex items-center justify-between gap-2 text-xs font-semibold px-3 py-2 rounded-lg w-full transition-all"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${open ? 'var(--accent-purple)' : 'var(--border-subtle)'}`,
                color: 'var(--text-primary)',
              }}>
        {label}
        <ChevronDown size={12} style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.12 }}
                      style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, background: '#16162a',
                               border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden', minWidth: width,
                               boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
            {options.map(opt => {
              const optLabel = labelOf ? labelOf(opt) : opt
              const active = opt === value
              return (
                <button key={optLabel} onClick={() => { onChange(opt); setOpen(false) }}
                        className="w-full text-left px-4 py-2.5 text-xs font-medium transition-colors"
                        style={{ color: active ? '#C4B5FD' : 'rgba(255,255,255,0.75)', background: active ? 'rgba(139,92,246,0.18)' : 'transparent' }}
                        onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                  {optLabel}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Stat tile (Entry / Exit / Quantity / Price Move row) ────────────────────
function StatTile({ label, value, valueColor }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-hover, rgba(255,255,255,0.03))', border: '1px solid var(--border-subtle)' }}>
      <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-base font-bold" style={{ color: valueColor || 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

// ── Circular score ring (SVG) ────────────────────────────────────────────────
function ScoreRing({ score, color, size = 96 }) {
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score)) / 100
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
              strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.32} fontWeight="800" fill="var(--text-primary)">
        {Math.round(score)}
      </text>
    </svg>
  )
}

// ── Horizontal score bar (Profitability / Execution / Journal / Rating) ─────
function ScoreBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-24 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, transition: 'width 0.5s ease' }} />
      </div>
      <span className="text-xs font-semibold w-14 text-right flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{value}/{max}</span>
    </div>
  )
}

function BulletList({ items, color }) {
  if (!items?.length) return null
  return (
    <ul className="space-y-2">
      {items.map((s, i) => (
        <li key={i} className="text-xs leading-relaxed flex gap-2" style={{ color: 'var(--text-secondary)' }}>
          <ChevronRight size={12} className="flex-shrink-0 mt-0.5" style={{ color }} /> {s}
        </li>
      ))}
    </ul>
  )
}

function AIUnavailableBanner({ message }) {
  return (
    <div className="rounded-lg px-3 py-2.5 flex items-start gap-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
      <WifiOff size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--warning-orange)' }} />
      <p className="text-xs leading-relaxed" style={{ color: 'var(--warning-orange)' }}>
        AI insight is unavailable right now.
        {message && <span style={{ color: 'var(--text-muted)' }}> ({message})</span>}
      </p>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// Reusable "Trade Analysis" split-pane — used both by the standalone
// /trade-dna page (reached via Journal → Analytics) and embedded directly
// inside Trado AI's "Trade DNA" tab. Fully self-contained (fetches its own
// trades), so it can be dropped into either context as-is.
export default function TradeAnalysisPanel({ initialTradeId = null, heightOffset = '112px', onBack }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { trades, updateTrade, loading } = useTrades(user?.id)

  const closedTrades = useMemo(() =>
    trades.filter(t => t.status === 'closed').sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at)),
  [trades])

  const [outcomeTab, setOutcomeTab] = useState('all') // all | winners | losers
  const [dateFilter, setDateFilter] = useState('All Time')
  const [sortBy, setSortBy] = useState('date')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(initialTradeId)

  const [aiInsight, setAiInsight] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)

  const winners = useMemo(() => closedTrades.filter(t => (t.pnl || 0) > 0), [closedTrades])
  const losers  = useMemo(() => closedTrades.filter(t => (t.pnl || 0) < 0), [closedTrades])

  const filtered = useMemo(() => {
    let list = outcomeTab === 'winners' ? winners : outcomeTab === 'losers' ? losers : closedTrades
    list = list.filter(t => isInDateRange(t, dateFilter))
    if (search.trim()) list = list.filter(t => t.symbol.toLowerCase().includes(search.trim().toLowerCase()))
    const arr = [...list]
    if (sortBy === 'pnl') arr.sort((a, b) => (b.pnl || 0) - (a.pnl || 0))
    else if (sortBy === 'symbol') arr.sort((a, b) => a.symbol.localeCompare(b.symbol))
    else arr.sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))
    return arr
  }, [closedTrades, winners, losers, outcomeTab, dateFilter, sortBy, search])

  const selectedTrade = closedTrades.find(t => t.id === selectedId) || null

  // Auto-select first trade once trades load (or if the passed-in tradeId isn't in the list)
  useEffect(() => {
    if (closedTrades.length === 0) return
    if (!selectedId || !closedTrades.some(t => t.id === selectedId)) setSelectedId(closedTrades[0].id)
  }, [closedTrades]) // eslint-disable-line react-hooks/exhaustive-deps

  const qualityScore = useMemo(() => selectedTrade ? computeTradeQualityScore(selectedTrade) : null, [selectedTrade])
  const vsAverage     = useMemo(() => selectedTrade ? computeTradeVsAverage(selectedTrade, closedTrades) : null, [selectedTrade, closedTrades])
  const isWin = (selectedTrade?.pnl || 0) > 0

  async function generateInsight(trade, quality, force = false) {
    if (!trade) return
    setAiLoading(true)
    setAiError(null)
    if (force) setAiInsight(null)
    try {
      const res = await fetch(`${BACKEND}/api/ai/trade-insight`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trade, qualityScore: quality }),
      })
      const data = await res.json()
      if (data.aiAvailable) {
        setAiInsight(data)
        updateTrade(trade.id, { ai_insight: data, ai_insight_generated_at: new Date().toISOString() }, { silent: true })
      } else {
        setAiError(data)
        setAiInsight(null)
      }
    } catch (e) {
      setAiError({ message: 'Could not reach the backend.' })
      setAiInsight(null)
    } finally {
      setAiLoading(false)
    }
  }

  // Auto-run on trade change: show cached insight instantly, else generate fresh.
  useEffect(() => {
    if (!selectedTrade || !qualityScore) return
    setAiError(null)
    if (selectedTrade.ai_insight) {
      setAiInsight(selectedTrade.ai_insight)
      setAiLoading(false)
    } else {
      generateInsight(selectedTrade, qualityScore)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrade?.id])

  function handleViewFullJournal() {
    if (!selectedTrade) return
    navigate('/journal', { state: { tradeId: selectedTrade.id } })
  }

  const screenshotCount = selectedTrade?.screenshots?.length || 0

  return (
    <div className="flex gap-4" style={{ height: `calc(100vh - ${heightOffset})` }}>

        {/* ── LEFT: Trade Analysis list ─────────────────────────────────── */}
        <div className="w-[340px] flex-shrink-0 glass-card p-4 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            {onBack && (
              <button onClick={onBack}
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{ background: 'var(--bg-hover, rgba(255,255,255,0.03))', border: '1px solid var(--border-subtle)' }}
                      title="Back to Journal">
                <ArrowLeft size={13} style={{ color: 'var(--text-muted)' }} />
              </button>
            )}
            <h1 className="text-lg font-bold flex-1" style={{ color: 'var(--text-primary)' }}>Trade Analysis</h1>
            <span className="text-[11px] font-bold px-2 py-1 rounded-full"
                  style={{ background: 'rgba(139,92,246,0.12)', color: 'var(--accent-purple-light)' }}>
              {filtered.length} {filtered.length === 1 ? 'trade' : 'trades'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {[['all', 'All', closedTrades.length], ['winners', 'Winners', winners.length], ['losers', 'Losers', losers.length]].map(([key, label, count]) => (
              <button key={key} onClick={() => setOutcomeTab(key)}
                      className="text-xs font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                      style={outcomeTab === key ? { background: 'var(--accent-purple)', color: '#fff' } : { background: 'var(--bg-hover, rgba(255,255,255,0.03))', color: 'var(--text-muted)' }}>
                {label}
                <span className="text-[10px] px-1.5 rounded-full" style={{ background: outcomeTab === key ? 'rgba(255,255,255,0.2)' : 'var(--border-subtle)' }}>{count}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 mb-3">
            <Dropdown value={dateFilter} onChange={setDateFilter} options={DATE_FILTERS} width={110} />
            <Dropdown value={sortBy} onChange={setSortBy} options={SORT_OPTIONS.map(o => o.key)}
                      labelOf={k => SORT_OPTIONS.find(o => o.key === k)?.label} width={110} />
          </div>

          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)', zIndex: 1 }} />
            <input className="input-dark text-sm py-2" style={{ paddingLeft: '2.25rem' }} placeholder="Search symbol…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 -mr-1 pr-1">
            {loading ? (
              <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>Loading…</p>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10">
                <BookOpen size={26} className="mx-auto mb-2" style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No trades found</p>
              </div>
            ) : filtered.map(t => {
              const win = (t.pnl || 0) >= 0
              const active = t.id === selectedTrade?.id
              return (
                <button key={t.id} onClick={() => setSelectedId(t.id)}
                        className="w-full text-left p-3 rounded-xl transition-colors"
                        style={{ background: active ? 'rgba(139,92,246,0.08)' : 'var(--bg-hover, rgba(255,255,255,0.03))', border: `1px solid ${active ? 'rgba(139,92,246,0.5)' : 'var(--border-subtle)'}` }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <PairIcon symbol={t.symbol} size={24} />
                      <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{t.symbol}</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={t.journaled_at ? { background: 'rgba(34,197,94,0.12)', color: 'var(--positive-green)' } : { background: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
                      {t.journaled_at ? 'JOURNALED' : 'PENDING'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs mb-1">
                    <span className="font-semibold" style={{ color: t.side === 'long' ? 'var(--positive-green)' : 'var(--negative-red)' }}>{(t.side || '').toUpperCase()}</span>
                    <span style={{ color: 'var(--text-muted)' }}>${t.entry_price}</span>
                    <span className="font-bold ml-auto" style={{ color: win ? 'var(--positive-green)' : 'var(--negative-red)' }}>{formatPnl(t.pnl)}</span>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{fmtDateTime(t.closed_at)}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── RIGHT: Trade DNA detail ────────────────────────────────────── */}
        <div className="flex-1 glass-card p-0 flex flex-col overflow-hidden">
          {!selectedTrade || !qualityScore ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <Layers size={22} style={{ color: 'var(--accent-purple)' }} />
              </div>
              <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Select a trade to analyze</p>
              <p className="text-xs max-w-xs text-center" style={{ color: 'var(--text-muted)' }}>
                Choose a trade from the list to view detailed analysis, performance metrics, and insights.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* Header */}
              <div className="flex items-start justify-between flex-wrap gap-3 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                    <PairIcon symbol={selectedTrade.symbol} size={32} />
                    <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{selectedTrade.symbol}</h2>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                          style={isWin ? { background: 'rgba(34,197,94,0.12)', color: 'var(--positive-green)' } : { background: 'rgba(239,68,68,0.12)', color: 'var(--negative-red)' }}>
                      {isWin ? 'WINNER' : 'LOSER'}
                    </span>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${qualityScore.gradeColor}20`, color: qualityScore.gradeColor }}>
                      Score: {qualityScore.total}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span className="font-semibold" style={{ color: selectedTrade.side === 'long' ? 'var(--positive-green)' : 'var(--negative-red)' }}>
                      {(selectedTrade.side || '').toUpperCase()}
                    </span>
                    {' · '}{fmtDateTime(selectedTrade.closed_at)} · Duration: {formatDuration(getDurationSeconds(selectedTrade))}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>P&amp;L</p>
                  <p className="text-2xl font-black" style={{ color: isWin ? 'var(--positive-green)' : 'var(--negative-red)' }}>{formatPnl(selectedTrade.pnl)}</p>
                </div>
              </div>

              {/* Stat row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatTile label="Entry Price" value={`$${selectedTrade.entry_price ?? '—'}`} />
                <StatTile label="Exit Price" value={selectedTrade.exit_price != null ? `$${selectedTrade.exit_price}` : '—'} />
                <StatTile label="Quantity" value={selectedTrade.size ?? selectedTrade.quantity ?? '—'} />
                <StatTile label="Price Move"
                          value={selectedTrade.entry_price && selectedTrade.exit_price
                            ? `${(((selectedTrade.exit_price - selectedTrade.entry_price) / selectedTrade.entry_price) * 100).toFixed(2)}%`
                            : '—'}
                          valueColor={selectedTrade.entry_price && selectedTrade.exit_price
                            ? (selectedTrade.exit_price >= selectedTrade.entry_price ? 'var(--positive-green)' : 'var(--negative-red)')
                            : undefined} />
              </div>

              {/* Journal Entry + Trade Quality */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Journal Entry card */}
                <div className="glass-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      <BookOpen size={15} style={{ color: 'var(--accent-purple-light)' }} /> Journal Entry
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={selectedTrade.journaled_at ? { background: 'rgba(139,92,246,0.15)', color: 'var(--accent-purple-light)' } : { background: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
                      {selectedTrade.journaled_at ? 'Journaled' : 'Not Journaled'}
                    </span>
                  </div>

                  {(selectedTrade.execution_checklist || []).length === 0 ? (
                    <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>No execution checklist recorded for this trade yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {selectedTrade.execution_checklist.map(item => (
                        <div key={item.id} className="flex items-center gap-2 p-2.5 rounded-lg"
                             style={item.checked ? { background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.35)' } : { background: 'var(--bg-hover, rgba(255,255,255,0.03))', border: '1px solid var(--border-subtle)' }}>
                          <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
                                style={item.checked ? { background: '#3b82f6' } : { border: '1.5px solid var(--text-muted)' }}>
                            {item.checked && <CheckCircle2 size={9} color="#fff" />}
                          </span>
                          <span className="text-[11px] font-medium truncate" style={{ color: item.checked ? 'var(--text-primary)' : 'var(--text-muted)' }}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Rating:</span>
                    <div className="flex gap-0.5">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <Star key={i} size={12} fill={i < (selectedTrade.rating || 0) ? '#F59E0B' : 'none'} color={i < (selectedTrade.rating || 0) ? '#F59E0B' : 'var(--border-subtle)'} />
                      ))}
                    </div>
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedTrade.rating ?? 0}/10</span>
                  </div>

                  <button onClick={handleViewFullJournal} className="btn-outline w-full text-xs py-2.5 justify-center">View Full Journal</button>
                </div>

                {/* Trade Quality card */}
                <div className="glass-card p-4">
                  <div className="flex items-center gap-1.5 text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                    <Shield size={15} style={{ color: 'var(--accent-purple-light)' }} /> Trade Quality
                  </div>

                  <div className="flex items-center gap-4 mb-4">
                    <ScoreRing score={qualityScore.total} color={qualityScore.gradeColor} />
                    <div className="flex-1 space-y-2">
                      <ScoreBar label="Profitability" value={qualityScore.profitability} max={30} color="var(--positive-green)" />
                      <ScoreBar label="Execution" value={qualityScore.execution} max={40} color="#3B82F6" />
                      <ScoreBar label="Journal" value={qualityScore.journal} max={20} color="var(--accent-purple-light)" />
                      <ScoreBar label="Rating" value={qualityScore.rating} max={10} color="#F59E0B" />
                    </div>
                  </div>

                  <div className="pt-3 space-y-1.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <p className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--text-muted)' }}>How is this calculated?</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}><b style={{ color: 'var(--text-primary)' }}>Profitability (30 pts)</b> — Win: 30 · Break-even: 15 · Loss: 0</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}><b style={{ color: 'var(--text-primary)' }}>Execution (40 pts)</b> — {qualityScore.checklistChecked}/{qualityScore.checklistTotal} checklist items completed</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}><b style={{ color: 'var(--text-primary)' }}>Journal (20 pts)</b> — 5 pts each: Pre-analysis, Post-review, Emotions, Lessons</p>
                    <p className="text-[11px] mb-2" style={{ color: 'var(--text-secondary)' }}><b style={{ color: 'var(--text-primary)' }}>Rating (10 pts)</b> — Your self-rating (1–10)</p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--positive-green)' }}>80+ Excellent</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.12)', color: '#3B82F6' }}>60+ Good</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--warning-orange)' }}>40+ Average</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(244,63,94,0.12)', color: 'var(--negative-red)' }}>&lt;40 Needs Work</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Insights */}
              <div className="glass-card p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    <Lightbulb size={15} style={{ color: 'var(--accent-purple-light)' }} /> Insights
                  </div>
                  <div className="flex items-center gap-2">
                    {screenshotCount > 0 && (
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1"
                            style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--accent-purple-light)' }}>
                        <ImageIcon size={10} /> {screenshotCount} screenshot{screenshotCount !== 1 ? 's' : ''} analyzed
                      </span>
                    )}
                    <button onClick={() => generateInsight(selectedTrade, qualityScore, true)} disabled={aiLoading}
                            className="btn-outline text-xs px-3 py-1.5 gap-1.5 disabled:opacity-60">
                      {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Regenerate
                    </button>
                  </div>
                </div>

                {/* AI-Powered Insights */}
                <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--bg-hover, rgba(255,255,255,0.03))', border: '1px solid rgba(139,92,246,0.15)' }}>
                  {aiLoading && !aiInsight ? (
                    <div className="flex items-start gap-3">
                      <div className="skeleton w-9 h-9 rounded-xl flex-shrink-0" />
                      <div className="flex-1 space-y-2 pt-1">
                        {[0, 1, 2].map(i => <div key={i} className="skeleton h-3 rounded-full" style={{ width: `${92 - i * 14}%` }} />)}
                      </div>
                    </div>
                  ) : aiError ? (
                    <AIUnavailableBanner message={aiError.message} />
                  ) : aiInsight ? (
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs text-white flex-shrink-0"
                             style={{ background: gradeColor(aiInsight.grade || 'C') }} title={`Trado AI grade for this trade: ${aiInsight.grade || '—'}`}>
                          {aiInsight.grade || '—'}
                        </div>
                        <div>
                          <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{aiInsight.verdict}</p>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{aiInsight.summary}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--accent-purple-light)' }}>
                            <Shield size={11} /> Risk Management
                          </p>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{aiInsight.riskManagement}</p>
                        </div>
                        <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--accent-purple-light)' }}>
                            <Brain size={11} /> Psychology
                          </p>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{aiInsight.psychology}</p>
                        </div>
                      </div>

                      {aiInsight.screenshotObservations && (
                        <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--accent-purple-light)' }}>
                            <ImageIcon size={11} /> From Your Screenshot
                          </p>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{aiInsight.screenshotObservations}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--positive-green)' }}>Strengths</p>
                          <BulletList items={aiInsight.strengths} color="var(--positive-green)" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--warning-orange)' }}>Areas to Improve</p>
                          <BulletList items={aiInsight.improvements} color="var(--warning-orange)" />
                        </div>
                      </div>

                      {aiInsight.keyTakeaway && (
                        <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                          <Sparkles size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-purple-light)' }} />
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}><b>Key takeaway:</b> {aiInsight.keyTakeaway}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.15)' }}>
                        <Sparkles size={15} style={{ color: 'var(--accent-purple-light)' }} />
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>AI-Powered Insights</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Get personalized analysis of this trade's risk, execution, and psychology.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* vs Your Average */}
                {vsAverage && (
                  <>
                    <div className="flex items-center gap-1.5 text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                      <TrendingUp size={15} style={{ color: 'var(--accent-purple-light)' }} /> vs Your Average
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-xl p-4" style={{ background: 'var(--bg-hover, rgba(255,255,255,0.03))', border: '1px solid var(--border-subtle)' }}>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>{vsAverage.vsAvgLabel.toUpperCase()}</p>
                        <p className="text-base font-bold" style={{ color: isWin ? 'var(--positive-green)' : 'var(--negative-red)' }}>{formatPnl(vsAverage.pnl)}</p>
                        <p className="text-[11px] font-semibold mt-0.5" style={{ color: vsAverage.hasBucket ? deltaColor(vsAverage.pnlDeltaPct) : 'var(--text-muted)' }}>
                          {vsAverage.hasBucket ? fmtDelta(vsAverage.pnlDeltaPct) : 'No baseline yet'}
                        </p>
                      </div>
                      <div className="rounded-xl p-4" style={{ background: 'var(--bg-hover, rgba(255,255,255,0.03))', border: '1px solid var(--border-subtle)' }}>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>HOLD DURATION</p>
                        <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{formatDuration(vsAverage.durationSec)}</p>
                        <p className="text-[11px] font-semibold mt-0.5" style={{ color: vsAverage.hasDurationBaseline ? deltaColor(vsAverage.holdDeltaPct) : 'var(--text-muted)' }}>
                          {vsAverage.hasDurationBaseline ? fmtDelta(vsAverage.holdDeltaPct) : 'No baseline yet'}
                        </p>
                      </div>
                      <div className="rounded-xl p-4" style={{ background: 'var(--bg-hover, rgba(255,255,255,0.03))', border: '1px solid var(--border-subtle)' }}>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>EXECUTION SCORE</p>
                        <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{vsAverage.executionPct != null ? `${vsAverage.executionPct.toFixed(0)}%` : '—'}</p>
                        <p className="text-[11px] font-semibold mt-0.5" style={{ color: vsAverage.hasExecBaseline ? deltaColor(vsAverage.execDeltaPct) : 'var(--text-muted)' }}>
                          {vsAverage.hasExecBaseline ? fmtDelta(vsAverage.execDeltaPct) : 'No baseline yet'}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
  )
}