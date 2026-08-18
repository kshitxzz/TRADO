import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Search, TrendingUp, TrendingDown, Target, BarChart3, DollarSign, Plus, Trash2,
  Link, Pencil, Eye, Share2, Sparkles, RefreshCw,
  LayoutList, CalendarDays, ChevronDown, Calendar,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import PageWrapper from '../components/layout/PageWrapper'
import AddTradeModal from '../components/ui/AddTradeModal'
import EditTradeModal from '../components/ui/EditTradeModal'
import ShareTradeModal from '../components/ui/ShareTradeModal'
import PairIcon from '../components/ui/PairIcon'
import { useAuth } from '../hooks/useAuth'
import { useTrades } from '../hooks/useTrades'
import { computeStats, formatPnl, pnlColor } from '../lib/utils'

const DATE_OPTIONS = ['All Time', '7 Days', '30 Days', '90 Days', 'Custom']

// ── Dark custom dropdown ──────────────────────────────────────────────────────
function CustomDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  return (
    <div ref={ref} style={{ position:'relative', minWidth:110 }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between gap-2 text-xs font-semibold px-3 py-2 rounded-lg w-full transition-all"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${open ? 'var(--accent-purple)' : 'var(--border-subtle)'}`,
          color: 'var(--text-primary)',
          boxShadow: open ? '0 0 0 2px rgba(139,92,246,0.15)' : 'none',
        }}>
        {value}
        <ChevronDown size={12} style={{ color:'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.15s' }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity:0, y:-6, scale:0.97 }}
            animate={{ opacity:1, y:0, scale:1 }}
            exit={{ opacity:0, y:-6, scale:0.97 }}
            transition={{ duration:0.12 }}
            style={{
              position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:50,
              background:'#16162a', border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:10, overflow:'hidden', minWidth:130,
              boxShadow:'0 16px 48px rgba(0,0,0,0.5)',
            }}>
            {options.map(opt => (
              <button key={opt} onClick={() => { onChange(opt); setOpen(false) }}
                      className="w-full text-left px-4 py-2.5 text-xs font-medium transition-colors"
                      style={{
                        color: opt === value ? '#C4B5FD' : 'rgba(255,255,255,0.75)',
                        background: opt === value ? 'rgba(139,92,246,0.18)' : 'transparent',
                      }}
                      onMouseEnter={e => { if (opt !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                      onMouseLeave={e => { if (opt !== value) e.currentTarget.style.background = 'transparent' }}>
                {opt}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Reusable action button ────────────────────────────────────────────────────
function ActionBtn({ icon: Icon, title, accent, onClick }) {
  return (
    <button onClick={onClick} title={title}
            className="p-1.5 rounded-lg transition-all"
            style={{ color: accent || 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.07)'; e.currentTarget.style.color=accent||'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color=accent||'var(--text-muted)' }}>
      <Icon size={14} />
    </button>
  )
}

// ── Trade row (reused in both views) ─────────────────────────────────────────
function TradeRow({ t, isManualAccount, onEdit, onDelete, onShare }) {
  const navigate = useNavigate()
  const isBuy    = t.side === 'BUY'
  const isManual = t.source === 'manual' || isManualAccount
  const date     = t.closed_at || t.opened_at
  const pnl      = t.pnl ?? null

  return (
    <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}
        onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.025)'}
        onMouseLeave={e => e.currentTarget.style.background='transparent'}>

      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <PairIcon symbol={t.symbol} size={26} />
          <span className="text-sm font-bold" style={{ color:'var(--text-primary)' }}>{t.symbol}</span>
        </div>
      </td>

      <td className="px-5 py-3.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-xl"
              style={{ background: isBuy?'rgba(59,130,246,0.14)':'rgba(239,68,68,0.12)',
                       color: isBuy?'#3B82F6':'#EF4444',
                       border: `1px solid ${isBuy?'rgba(59,130,246,0.3)':'rgba(239,68,68,0.3)'}` }}>
          {isBuy ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {isBuy ? 'Long' : 'Short'}
        </span>
      </td>

      <td className="px-5 py-3.5 text-sm font-mono" style={{ color:'var(--text-secondary)' }}>
        {t.entry_price != null ? `$${parseFloat(t.entry_price).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:5})}` : '—'}
      </td>

      <td className="px-5 py-3.5 text-sm font-mono" style={{ color:'var(--text-secondary)' }}>
        {t.exit_price != null ? `$${parseFloat(t.exit_price).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:5})}` : '—'}
      </td>

      <td className="px-5 py-3.5">
        <div className="flex items-center gap-1.5">
          {/* Keying on the pnl value re-triggers the pop transition every time
              the EA sync pushes a fresh number for an open position, giving a
              visible "it just updated" cue instead of a silent number swap. */}
          <motion.span
            key={t.status === 'open' ? `${t.id}-${pnl}` : `${t.id}-static`}
            initial={t.status === 'open' ? { opacity: 0.45, y: -2 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="text-sm font-bold"
            style={{ color: pnl==null?'var(--text-muted)':pnl>=0?'var(--positive-green)':'var(--negative-red)' }}>
            {pnl!=null ? `${pnl>=0?'':'-'}$${Math.abs(pnl).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—'}
          </motion.span>
          {t.status === 'open' && (
            <span className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
                  style={{ background: pnl>=0?'#22C55E':'#EF4444' }} title="Live" />
          )}
        </div>
      </td>

      <td className="px-5 py-3.5 text-sm" style={{ color:'var(--text-muted)' }}>
        {date ? new Date(date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}
      </td>

      <td className="px-5 py-3.5">
        {isManual ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg"
                style={{ background:'rgba(139,92,246,0.1)', color:'var(--accent-purple-light)', border:'1px solid rgba(139,92,246,0.2)' }}>
            <Pencil size={9} /> Manual
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg"
                style={{ background:'rgba(34,197,94,0.08)', color:'#22C55E', border:'1px solid rgba(34,197,94,0.2)' }}>
            ⬡ MT5
          </span>
        )}
      </td>

      <td className="px-5 py-3.5">
        <div className="flex items-center justify-end gap-0.5">
          <ActionBtn icon={Eye}      title="View in journal" onClick={() => navigate('/journal', { state: { tradeId: t.id } })} />
          <ActionBtn icon={Sparkles} title="Trade DNA" accent="var(--accent-purple)" onClick={() => navigate('/trado-ai', { state: { tab: 'Trade DNA', tradeId: t.id } })} />
          <ActionBtn icon={Share2}   title="Share trade" onClick={() => onShare(t)} />
          {isManualAccount && (
            <>
              <div style={{ width:1, height:14, background:'rgba(255,255,255,0.08)', margin:'0 3px' }} />
              <ActionBtn icon={Pencil} title="Edit trade"   accent="#F59E0B" onClick={() => onEdit(t)} />
              <ActionBtn icon={Trash2} title="Delete trade" accent="#EF4444" onClick={() => onDelete(t.id)} />
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

const TABLE_HEADERS = [
  {label:'SYMBOL',  align:'left'},  {label:'SIDE',    align:'left'},
  {label:'ENTRY',   align:'left'},  {label:'EXIT',    align:'left'},
  {label:'P&L',     align:'left'},  {label:'DATE',    align:'left'},
  {label:'SOURCE',  align:'left'},  {label:'ACTIONS', align:'right'},
]

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Trades() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const {
    trades, account, loading, syncing, syncTrades,
    isManualAccount, addTrade, updateTrade, deleteTrade, refetch,
  } = useTrades(user?.id)

  const [search,        setSearch]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState('All')
  const [dateFilter,    setDateFilter]    = useState('All Time')
  const [customFrom,    setCustomFrom]    = useState('')
  const [customTo,      setCustomTo]      = useState('')
  const [viewMode,      setViewMode]      = useState('List')
  const [showAdd,       setShowAdd]       = useState(false)
  const [editingTrade,  setEditingTrade]  = useState(null)
  const [sharingTrade,  setSharingTrade]  = useState(null)

  // "Add Manual Trade" from the Quick Actions menu or command palette lands
  // here with this flag set — open the modal immediately, then clear the
  // flag so a refresh or back-navigation doesn't reopen it.
  useEffect(() => {
    if (location.state?.openAdd) {
      setShowAdd(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats     = computeStats(trades)
  const openCount = trades.filter(t => t.status === 'open').length

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...trades]
    const dateKey = d => d.closed_at || d.opened_at || ''

    if (search)
      list = list.filter(t => t.symbol?.toLowerCase().includes(search.toLowerCase()))

    if (statusFilter === 'Open')   list = list.filter(t => t.status === 'open')
    if (statusFilter === 'Closed') list = list.filter(t => t.status === 'closed')

    if (dateFilter === '7 Days') {
      const w = new Date(Date.now() - 7*864e5)
      list = list.filter(t => new Date(dateKey(t)) >= w)
    } else if (dateFilter === '30 Days') {
      const w = new Date(Date.now() - 30*864e5)
      list = list.filter(t => new Date(dateKey(t)) >= w)
    } else if (dateFilter === '90 Days') {
      const w = new Date(Date.now() - 90*864e5)
      list = list.filter(t => new Date(dateKey(t)) >= w)
    } else if (dateFilter === 'Custom' && customFrom && customTo) {
      const from = new Date(customFrom + 'T00:00:00')
      const to   = new Date(customTo   + 'T23:59:59')
      list = list.filter(t => { const d = new Date(dateKey(t)); return d >= from && d <= to })
    }

    return list
  }, [trades, search, statusFilter, dateFilter, customFrom, customTo])

  // ── Day view grouping ─────────────────────────────────────────────────────
  const dayGroups = useMemo(() => {
    if (viewMode !== 'Day') return null
    const map = {}
    filtered.forEach(t => {
      const key = (t.closed_at || t.opened_at || '').slice(0,10)
      if (!map[key]) map[key] = []
      map[key].push(t)
    })
    return Object.entries(map).sort(([a],[b]) => b.localeCompare(a))
  }, [filtered, viewMode])

  async function handleDelete(id) {
    if (!window.confirm('Delete this trade?')) return
    await deleteTrade(id)
  }

  if (loading) return (
    <PageWrapper>
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_,i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
        {[...Array(6)].map((_,i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
      </div>
    </PageWrapper>
  )

  return (
    <PageWrapper onSync={!isManualAccount && account ? syncTrades : undefined} syncing={syncing}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color:'var(--text-primary)' }}>Trades</h1>
          <p className="text-sm mt-0.5" style={{ color:'var(--text-muted)' }}>
            Track, manage, and analyze your trading activity
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!account && (
            <button onClick={() => navigate('/accounts')} className="btn-outline text-sm py-2 px-4">
              <Link size={13} /> Connect Account
            </button>
          )}
          {isManualAccount && (
            <button onClick={() => setShowAdd(true)} className="btn-primary text-sm py-2 px-4">
              <Plus size={14} /> Add Trade
            </button>
          )}
          {!isManualAccount && account && (
            <button onClick={syncTrades} disabled={syncing}
                    className="btn-primary text-sm py-2 px-4 disabled:opacity-60">
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync Trades'}
            </button>
          )}
        </div>
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { icon:DollarSign, iconBg:'rgba(139,92,246,0.15)', iconColor:'var(--accent-purple)', label:'TOTAL P&L',  value:formatPnl(stats.totalPnl), valueColor:pnlColor(stats.totalPnl) },
          { icon:TrendingUp, iconBg:'rgba(245,158,11,0.15)', iconColor:'#F59E0B',             label:'OPEN',        value:openCount,                  valueColor:'var(--text-primary)' },
          { icon:Target,     iconBg:'rgba(34,197,94,0.15)',  iconColor:'#22C55E',             label:'WIN RATE',    value:`${stats.winRate.toFixed(1)}%`, valueColor:stats.winRate>=50?'var(--positive-green)':'var(--negative-red)' },
          { icon:BarChart3,  iconBg:'rgba(139,92,246,0.15)', iconColor:'var(--accent-purple)', label:'TRADES',      value:trades.length,              valueColor:'var(--text-primary)' },
        ].map(s => (
          <div key={s.label} className="glass-card p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:s.iconBg }}>
              <s.icon size={18} style={{ color:s.iconColor }} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1 truncate" style={{ color:'var(--text-muted)' }}>{s.label}</p>
              <p className="text-xl font-bold" style={{ color:s.valueColor }}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="glass-card p-4 mb-4">
        {/* ── Search bar — use inline paddingLeft to override input-dark's 10px 14px rule */}
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color:'var(--text-muted)', zIndex:1 }} />
          <input
            className="input-dark w-full text-sm"
            style={{ paddingLeft:'2.5rem', paddingTop:'10px', paddingBottom:'10px' }}
            placeholder="Search by symbol..."
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-lg p-1 gap-0.5"
               style={{ background:'rgba(255,255,255,0.04)', border:'1px solid var(--border-subtle)' }}>
            {[{ id:'List', Icon:LayoutList }, { id:'Day', Icon:CalendarDays }].map(({ id, Icon }) => (
              <button key={id} onClick={() => setViewMode(id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all"
                      style={{ background: viewMode===id?'var(--accent-purple)':'transparent',
                               color: viewMode===id?'white':'var(--text-muted)' }}>
                <Icon size={12} /> {id}
              </button>
            ))}
          </div>

          {/* Status pills */}
          <div className="flex rounded-lg p-1 gap-0.5"
               style={{ background:'rgba(255,255,255,0.04)', border:'1px solid var(--border-subtle)' }}>
            {['All','Open','Closed'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-md transition-all"
                      style={{ background: statusFilter===s?'var(--accent-purple)':'transparent',
                               color: statusFilter===s?'white':'var(--text-muted)' }}>
                {s}
              </button>
            ))}
          </div>

          {/* Date dropdown */}
          <div className="ml-auto">
            <CustomDropdown value={dateFilter} onChange={setDateFilter} options={DATE_OPTIONS} />
          </div>
        </div>

        {/* Custom date range — only when "Custom" is selected */}
        <AnimatePresence>
          {dateFilter === 'Custom' && (
            <motion.div
              initial={{ opacity:0, height:0 }}
              animate={{ opacity:1, height:'auto' }}
              exit={{ opacity:0, height:0 }}
              transition={{ duration:0.18 }}
              className="overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-3 pt-3"
                   style={{ borderTop:'1px solid var(--border-subtle)' }}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1">
                  <div className="flex items-center gap-2 w-full sm:flex-1">
                    <Calendar size={13} style={{ color:'var(--text-muted)', flexShrink:0 }} />
                    <input
                      type="date"
                      className="input-dark text-xs flex-1"
                      style={{ padding:'7px 10px' }}
                      value={customFrom}
                      onChange={e => setCustomFrom(e.target.value)}
                    />
                  </div>
                  <span className="text-xs font-medium self-start sm:self-auto" style={{ color:'var(--text-muted)', flexShrink:0 }}>to</span>
                  <div className="flex items-center gap-2 w-full sm:flex-1">
                    <Calendar size={13} style={{ color:'var(--text-muted)', flexShrink:0 }} />
                    <input
                      type="date"
                      className="input-dark text-xs flex-1"
                      style={{ padding:'7px 10px' }}
                      value={customTo}
                      onChange={e => setCustomTo(e.target.value)}
                    />
                  </div>
                </div>
                {(customFrom || customTo) && (
                  <button onClick={() => { setCustomFrom(''); setCustomTo('') }}
                          className="text-xs px-2 py-1 rounded-lg transition-colors self-start sm:self-auto flex-shrink-0"
                          style={{ color:'var(--text-muted)', background:'rgba(255,255,255,0.05)' }}>
                    Clear
                  </button>
                )}
              </div>
              {customFrom && customTo && new Date(customFrom) > new Date(customTo) && (
                <p className="text-[11px] mt-1.5 ml-5" style={{ color:'var(--negative-red)' }}>
                  Start date must be before end date
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Trade table */}
      <div className="glass-card overflow-hidden">
        {/* Table header label */}
        <div className="flex items-center justify-between px-5 py-4"
             style={{ borderBottom:'1px solid var(--border-subtle)' }}>
          <div>
            <h2 className="font-bold" style={{ color:'var(--text-primary)' }}>
              {statusFilter === 'All' ? 'All Trades' : `${statusFilter} Trades`}
              {viewMode === 'Day' && <span className="text-sm font-normal ml-2" style={{ color:'var(--text-muted)' }}>· Day view</span>}
            </h2>
            <p className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>
              {filtered.length} trade{filtered.length !== 1 ? 's' : ''}
              {dateFilter !== 'All Time' && ` · ${dateFilter}`}
            </p>
          </div>
          {account && !isManualAccount && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background:'var(--positive-green)' }} />
              <span className="text-xs" style={{ color:'var(--positive-green)' }}>MT5 Connected</span>
            </div>
          )}
          {isManualAccount && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background:'#F59E0B' }} />
              <span className="text-xs" style={{ color:'#F59E0B' }}>Manual Account</span>
            </div>
          )}
        </div>

        {/* ── LIST VIEW ──────────────────────────────────────────────────── */}
        {viewMode === 'List' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border-subtle)' }}>
                  {TABLE_HEADERS.map(h => (
                    <th key={h.label}
                        className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-${h.align}`}
                        style={{ color:'var(--text-muted)' }}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="py-16 text-center">
                    <EmptyState isManualAccount={isManualAccount} trades={trades} onAdd={() => setShowAdd(true)} />
                  </td></tr>
                ) : filtered.map(t => (
                  <TradeRow key={t.id} t={t} isManualAccount={isManualAccount}
                            onEdit={setEditingTrade} onDelete={handleDelete} onShare={setSharingTrade} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── DAY VIEW ───────────────────────────────────────────────────── */}
        {viewMode === 'Day' && (
          <div className="overflow-x-auto">
            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                <EmptyState isManualAccount={isManualAccount} trades={trades} onAdd={() => setShowAdd(true)} />
              </div>
            ) : dayGroups?.map(([date, dayTrades]) => {
              const dayPnl     = dayTrades.reduce((s,t) => s+(t.pnl||0), 0)
              const dayWins    = dayTrades.filter(t => (t.pnl||0) > 0).length
              const displayDate = date
                ? new Date(date + 'T00:00:00').toLocaleDateString('en-US',{ weekday:'long', month:'long', day:'numeric', year:'numeric' })
                : 'Unknown date'

              return (
                <div key={date}>
                  {/* Day section header */}
                  <div className="flex items-center justify-between flex-wrap gap-2 px-5 py-3"
                       style={{ background:'rgba(255,255,255,0.02)', borderBottom:'1px solid var(--border-subtle)' }}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <CalendarDays size={14} style={{ color:'var(--accent-purple)' }} />
                      <span className="text-sm font-semibold" style={{ color:'var(--text-primary)' }}>{displayDate}</span>
                      <span className="text-xs px-2 py-0.5 rounded-md font-medium"
                            style={{ background:'rgba(139,92,246,0.12)', color:'var(--accent-purple-light)' }}>
                        {dayTrades.length} trade{dayTrades.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span style={{ color:'var(--text-muted)' }}>{dayWins}W / {dayTrades.length - dayWins}L</span>
                      <span className="font-bold"
                            style={{ color: dayPnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }}>
                        {dayPnl >= 0 ? '+' : '-'}${Math.abs(dayPnl).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Trades for this day */}
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                        {TABLE_HEADERS.map(h => (
                          <th key={h.label}
                              className={`px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-${h.align}`}
                              style={{ color:'rgba(255,255,255,0.25)' }}>
                            {h.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dayTrades.map(t => (
                        <TradeRow key={t.id} t={t} isManualAccount={isManualAccount}
                                  onEdit={setEditingTrade} onDelete={handleDelete} onShare={setSharingTrade} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 text-xs"
               style={{ borderTop:'1px solid var(--border-subtle)', color:'var(--text-muted)' }}>
            <span>Showing {filtered.length} of {trades.length} trades</span>
            {isManualAccount && <span style={{ color:'rgba(139,92,246,0.6)' }}>Manual account</span>}
          </div>
        )}
      </div>

      <AddTradeModal
        open={showAdd} onClose={() => setShowAdd(false)}
        onSave={addTrade} userId={user?.id} brokerAccountId={account?.id}
        onImported={refetch}
      />
      <EditTradeModal
        open={!!editingTrade} onClose={() => setEditingTrade(null)}
        onSave={updateTrade} trade={editingTrade}
      />
      <ShareTradeModal
        trade={sharingTrade} open={!!sharingTrade} onClose={() => setSharingTrade(null)}
      />
    </PageWrapper>
  )
}

function EmptyState({ isManualAccount, trades, onAdd }) {
  return isManualAccount ? (
    <div className="flex flex-col items-center gap-3">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center"
           style={{ background:'rgba(139,92,246,0.1)', border:'1px solid rgba(139,92,246,0.2)' }}>
        <Plus size={20} style={{ color:'var(--accent-purple)' }} />
      </div>
      <p className="text-sm" style={{ color:'var(--text-muted)' }}>No trades yet — click Add Trade to get started</p>
      <button onClick={onAdd} className="btn-primary text-sm py-2 px-5">
        <Plus size={14} /> Add Your First Trade
      </button>
    </div>
  ) : (
    <p className="text-sm" style={{ color:'var(--text-muted)' }}>
      {trades.length === 0 ? 'Connect your MT5 account or add trades manually' : 'No trades match your filters'}
    </p>
  )
}