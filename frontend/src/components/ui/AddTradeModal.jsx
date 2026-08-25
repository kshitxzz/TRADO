import { useState, useMemo, useRef, useEffect } from 'react'
import { X, TrendingUp, TrendingDown, ChevronDown, ChevronUp, Search,
         PenLine, FileUp, RefreshCw, Zap, CheckCircle2, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import DateTimePicker from './DateTimePicker'
import PairIcon from './PairIcon'
import ImportTradesPanel from './ImportTradesPanel'
import { detectSession, SESSION_UTC } from '../../hooks/useTimezone'
import { calcPnl } from '../../lib/pnlCalculator'
import { useTrades } from '../../hooks/useTrades'
import { TRADE_CHECKLIST_ITEMS } from '../../data/tradeChecklist'

// ── Symbol metadata: category + accent color + short tag ──────────────────────
const SYMBOLS = [
  { symbol:'XAUUSD', name:'Gold / US Dollar',        cat:'Metals',  tag:'XAU', color:'#F59E0B' },
  { symbol:'XAGUSD', name:'Silver / US Dollar',       cat:'Metals',  tag:'XAG', color:'#9CA3AF' },
  { symbol:'EURUSD', name:'Euro / US Dollar',         cat:'Forex',   tag:'EUR', color:'#3B82F6' },
  { symbol:'GBPUSD', name:'British Pound / US Dollar',cat:'Forex',   tag:'GBP', color:'#6366F1' },
  { symbol:'USDJPY', name:'US Dollar / Japanese Yen', cat:'Forex',   tag:'JPY', color:'#EF4444' },
  { symbol:'AUDUSD', name:'Australian Dollar / USD',  cat:'Forex',   tag:'AUD', color:'#22C55E' },
  { symbol:'USDCAD', name:'US Dollar / Canadian Dollar', cat:'Forex', tag:'CAD', color:'#EC4899' },
  { symbol:'USDCHF', name:'US Dollar / Swiss Franc',  cat:'Forex',   tag:'CHF', color:'#A855F7' },
  { symbol:'GBPJPY', name:'British Pound / Yen',      cat:'Forex',   tag:'GBJ', color:'#14B8A6' },
  { symbol:'EURJPY', name:'Euro / Japanese Yen',      cat:'Forex',   tag:'EUJ', color:'#F97316' },
  { symbol:'EURGBP', name:'Euro / British Pound',     cat:'Forex',   tag:'EUG', color:'#0EA5E9' },
  { symbol:'NZDUSD', name:'New Zealand Dollar / USD', cat:'Forex',   tag:'NZD', color:'#84CC16' },
  { symbol:'NAS100',  name:'Nasdaq 100 Index',         cat:'Indices', tag:'NAS', color:'#8B5CF6' },
  { symbol:'US30',    name:'Dow Jones 30 Index',       cat:'Indices', tag:'US30',color:'#6D28D9' },
  { symbol:'SPX500',  name:'S&P 500 Index',            cat:'Indices', tag:'SPX', color:'#7C3AED' },
  { symbol:'BTCUSD', name:'Bitcoin / US Dollar',       cat:'Crypto',  tag:'BTC', color:'#F7931A' },
  { symbol:'ETHUSD', name:'Ethereum / US Dollar',      cat:'Crypto',  tag:'ETH', color:'#627EEA' },
]

const CHECKLIST = TRADE_CHECKLIST_ITEMS

export default function AddTradeModal({ open, onClose, onSave, userId, brokerAccountId, onImported }) {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const localNow = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`

  const [activeTab, setActiveTab] = useState('manual') // 'manual' | 'upload' | 'sync'
  const { account, getEAStatus } = useTrades(userId)
  const [eaStatus, setEaStatus] = useState(null)

  const [side, setSide]           = useState('long')
  const [showChecklist, setShowCL] = useState(false)
  const [checklist, setChecklist]  = useState({})
  const [saving, setSaving]        = useState(false)
  const [symbolOpen, setSymbolOpen] = useState(false)
  const [activeIdx, setActiveIdx]   = useState(0)
  const symbolRef = useRef(null)
  const [form, setForm] = useState({
    symbol: '', size: '', entry_price: '', exit_price: '',
    opened_at: localNow, closed_at: '', notes: '',
  })

  function update(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const filteredSymbols = useMemo(() => {
    const q = form.symbol.trim().toUpperCase()
    if (!q) return SYMBOLS
    return SYMBOLS.filter(s => s.symbol.includes(q) || s.tag.includes(q))
  }, [form.symbol])

  function handleSymbolInput(val) {
    update('symbol', val.toUpperCase())
    setSymbolOpen(true)
    setActiveIdx(0)
  }

  function pickSymbol(sym) {
    update('symbol', sym)
    setSymbolOpen(false)
  }

  function handleSymbolKeyDown(e) {
    if (!symbolOpen) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i+1, filteredSymbols.length-1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i-1, 0)) }
    if (e.key === 'Enter' && filteredSymbols[activeIdx]) { e.preventDefault(); pickSymbol(filteredSymbols[activeIdx].symbol) }
    if (e.key === 'Escape') setSymbolOpen(false)
  }

  useEffect(() => {
    if (activeTab !== 'sync' || account?.sync_method !== 'ea' || !account?.id) return
    let cancelled = false
    async function poll() { const s = await getEAStatus(account.id); if (!cancelled) setEaStatus(s) }
    poll()
    const id = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [activeTab, account?.id, account?.sync_method]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onClickOutside(e) {
      if (symbolRef.current && !symbolRef.current.contains(e.target)) setSymbolOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const estimatedPnl = calcPnl(form.symbol, side, form.entry_price, form.exit_price, form.size)
  const autoSession  = detectSession(form.opened_at)
  const sessionCfg   = SESSION_UTC[autoSession] || SESSION_UTC['Asian']

  async function handleSave() {
    if (!form.symbol.trim() || !form.size || !form.entry_price || !form.opened_at) return
    setSaving(true)

    // A trade only counts as closed once BOTH the exit price and the exit
    // date/time are known — if either is missing (most commonly: the user
    // hasn't closed the position yet, so there's no exit timestamp), it
    // belongs in Open Trades until the trade is later edited to add it.
    const isClosed = !!(form.exit_price && form.closed_at)

    await onSave({
      user_id:           userId,
      broker_account_id: brokerAccountId,
      symbol:      form.symbol.trim(),
      side:        side === 'long' ? 'BUY' : 'SELL',
      size:        parseFloat(form.size),
      entry_price: parseFloat(form.entry_price),
      exit_price:  form.exit_price ? parseFloat(form.exit_price) : null,
      pnl:         estimatedPnl ?? null,
      status:      isClosed ? 'closed' : 'open',
      session:     autoSession,  // auto-detected from entry time
      opened_at:   new Date(form.opened_at).toISOString(),
      closed_at:   form.closed_at ? new Date(form.closed_at).toISOString() : null,
      notes:       form.notes || null,
    })

    setSaving(false)
    handleClose()
  }

  function handleClose() {
    setForm({ symbol:'', size:'', entry_price:'', exit_price:'', opened_at:localNow, closed_at:'', notes:'' })
    setSide('long')
    setChecklist({})
    setShowCL(false)
    setSymbolOpen(false)
    setActiveTab('manual')
    onClose()
  }

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
        onClick={e => e.target === e.currentTarget && handleClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="w-full max-w-md rounded-2xl flex flex-col"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', maxHeight: '92vh' }}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0"
               style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                   style={{ background: 'var(--gradient-primary)' }}>+</div>
              <h2 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>Add Trade</h2>
            </div>
            <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                    style={{ color: 'var(--text-muted)' }}>
              <X size={16} />
            </button>
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-1 px-6 pt-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {[
              { id: 'manual', label: 'Manual', icon: PenLine },
              { id: 'upload', label: 'File Upload', icon: FileUp },
              { id: 'sync',   label: 'Broker Sync', icon: RefreshCw },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                      className="flex items-center gap-1.5 px-3 pb-3 text-xs font-semibold transition-colors relative"
                      style={{ color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                <tab.icon size={13} /> {tab.label}
                {activeTab === tab.id && (
                  <motion.div layoutId="addTradeTabIndicator" className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full"
                              style={{ background: 'var(--gradient-primary)' }} />
                )}
              </button>
            ))}
          </div>

          {/* ── Body ── */}
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

            {activeTab === 'manual' && (<>
            {/* Long / Short toggle */}
            <div className="grid grid-cols-2 rounded-xl overflow-hidden p-1 gap-1"
                 style={{ background: 'var(--bg-card-hover)', border: '1px solid var(--border-subtle)' }}>
              {[['long', TrendingUp, 'var(--accent-purple)'], ['short', TrendingDown, '#EF4444']].map(([s, Icon, color]) => (
                <button key={s} onClick={() => setSide(s)}
                        className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all capitalize"
                        style={{ background: side === s ? color : 'transparent', color: side === s ? 'white' : 'var(--text-muted)' }}>
                  <Icon size={14} /> {s}
                </button>
              ))}
            </div>

            {/* Symbol — full width for spacious dropdown */}
            <div ref={symbolRef} className="relative">
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                SYMBOL <span style={{ color: 'var(--negative-red)' }}>*</span>
              </label>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--text-muted)', zIndex: 1 }} />
                <input
                  className="input-dark font-mono uppercase"
                  style={{ paddingLeft: '2.5rem' }}
                  placeholder="SEARCH SYMBOL — E.G. XAUUSD"
                  value={form.symbol}
                  onFocus={() => setSymbolOpen(true)}
                  onChange={e => handleSymbolInput(e.target.value)}
                  onKeyDown={handleSymbolKeyDown}
                />
              </div>

              <AnimatePresence>
                {symbolOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.14, ease: 'easeOut' }}
                    className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden z-50"
                    style={{
                      background: '#15151f',
                      border: '1px solid rgba(255,255,255,0.1)',
                      boxShadow: '0 24px 60px rgba(0,0,0,0.65), 0 0 0 1px rgba(139,92,246,0.06)',
                    }}
                  >
                    <div className="max-h-64 overflow-y-auto py-1.5">
                      {filteredSymbols.length === 0 ? (
                        <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>
                          No symbols found
                        </p>
                      ) : filteredSymbols.map((s, i) => {
                        const isActive = i === activeIdx
                        return (
                          <button
                            key={s.symbol}
                            onMouseEnter={() => setActiveIdx(i)}
                            onClick={() => pickSymbol(s.symbol)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
                            style={{ background: isActive ? 'rgba(139,92,246,0.12)' : 'transparent' }}
                          >
                            <PairIcon symbol={s.symbol} size={32} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                                {s.symbol}
                              </p>
                              <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                                {s.name}
                              </p>
                            </div>
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0"
                              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}
                            >
                              {s.cat}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Quantity */}
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                QUANTITY (LOTS) <span style={{ color: 'var(--negative-red)' }}>*</span>
              </label>
              <input className="input-dark font-mono" placeholder="e.g. 0.10"
                     type="number" step="0.01" min="0.01"
                     value={form.size} onChange={e => update('size', e.target.value)} />
            </div>

            {/* Entry + Exit price */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  ENTRY PRICE <span style={{ color: 'var(--negative-red)' }}>*</span>
                </label>
                <input className="input-dark font-mono" placeholder="0.00"
                       type="number" step="any" value={form.entry_price}
                       onChange={e => update('entry_price', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>EXIT PRICE</label>
                <input className="input-dark font-mono" placeholder="Optional"
                       type="number" step="any" value={form.exit_price}
                       onChange={e => update('exit_price', e.target.value)} />
              </div>
            </div>

            {/* Entry Date / Time */}
            <DateTimePicker
              label="ENTRY DATE & TIME"
              value={form.opened_at}
              onChange={v => update('opened_at', v)}
              placeholder="Select entry date & time"
            />

            {/* Exit Date / Time */}
            <DateTimePicker
              label="EXIT DATE & TIME"
              value={form.closed_at}
              onChange={v => update('closed_at', v)}
              placeholder="Select exit date & time"
              optional
            />

            {/* Auto-detected session badge */}
            {form.opened_at && (
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                   style={{ background: sessionCfg.bg, border: `1px solid ${sessionCfg.color}30` }}>
                <div className="w-2 h-2 rounded-full" style={{ background: sessionCfg.color }} />
                <div>
                  <span className="text-xs font-semibold" style={{ color: sessionCfg.color }}>
                    {autoSession} Session
                  </span>
                  <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
                    — auto-detected from entry time
                  </span>
                </div>
              </div>
            )}

            {/* P&L preview (read-only, from price calc) */}
            {estimatedPnl !== null && (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm"
                   style={{
                     background: estimatedPnl >= 0 ? 'rgba(34,197,94,0.07)' : 'rgba(244,63,94,0.07)',
                     border: `1px solid ${estimatedPnl >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(244,63,94,0.2)'}`,
                   }}>
                <span style={{ color: 'var(--text-muted)' }}>Calculated P&L</span>
                <span className="font-bold" style={{ color: estimatedPnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }}>
                  {estimatedPnl >= 0 ? '+' : ''}${estimatedPnl.toFixed(2)}
                </span>
              </div>
            )}

            {/* Pre-Trade Checklist */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
              <button onClick={() => setShowCL(c => !c)}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-white/5"
                      style={{ color: 'var(--text-secondary)' }}>
                <span className="flex items-center gap-2">
                  <span className="text-xs px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--accent-purple-light)' }}>
                    {Object.values(checklist).filter(Boolean).length}/{CHECKLIST.length}
                  </span>
                  Pre-Trade Checklist (Optional)
                </span>
                {showChecklist ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <AnimatePresence>
                {showChecklist && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                              className="overflow-hidden" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <div className="px-4 py-3 space-y-2">
                      {CHECKLIST.map(item => (
                        <label key={item} className="flex items-center gap-3 py-1 cursor-pointer">
                          <div className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-all"
                               style={{ background: checklist[item] ? 'var(--accent-purple)' : 'transparent',
                                        border: `1.5px solid ${checklist[item] ? 'var(--accent-purple)' : 'var(--border-subtle)'}` }}>
                            {checklist[item] && <span className="text-white text-[9px] font-bold">✓</span>}
                          </div>
                          <input type="checkbox" className="hidden" checked={!!checklist[item]}
                                 onChange={e => setChecklist(c => ({ ...c, [item]: e.target.checked }))} />
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>NOTES</label>
              <textarea className="input-dark resize-y" rows={3}
                        placeholder="Trade rationale, market context, lessons…"
                        value={form.notes} onChange={e => update('notes', e.target.value)} />
            </div>
            </>)}

            {activeTab === 'upload' && (
              <ImportTradesPanel mode="existing" brokerAccountId={brokerAccountId} compact
                                  onImported={(data) => { onImported && onImported(data) }} />
            )}

            {activeTab === 'sync' && (
              account?.sync_method === 'ea' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
                       style={{ background: eaStatus?.connected ? 'rgba(34,197,94,0.08)' : 'rgba(139,92,246,0.08)',
                                border: `1px solid ${eaStatus?.connected ? 'rgba(34,197,94,0.25)' : 'rgba(139,92,246,0.2)'}` }}>
                    {eaStatus?.connected
                      ? <><CheckCircle2 size={15} style={{ color: 'var(--positive-green)' }} /><span style={{ color: 'var(--positive-green)' }} className="font-semibold">EA connected — trades sync automatically</span></>
                      : <><Loader2 size={15} className="animate-spin" style={{ color: 'var(--accent-purple)' }} /><span style={{ color: 'var(--text-secondary)' }}>Waiting for EA connection…</span></>}
                  </div>
                  {eaStatus?.lastSynced && (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Last synced {new Date(eaStatus.lastSynced).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
                    </p>
                  )}
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    Real-time sync is active for this account — new trades appear here automatically as the EA pushes them from your MT5 terminal. Nothing to do on this tab.
                  </p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-3"
                       style={{ background: 'rgba(139,92,246,0.1)' }}>
                    <Zap size={20} style={{ color: 'var(--accent-purple)' }} />
                  </div>
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Real-time sync isn't set up yet</p>
                  <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                    Set up the free MT5 Expert Advisor from the Accounts page to have trades sync here automatically.
                  </p>
                  <a href="/accounts" className="btn-outline inline-flex justify-center py-2 px-4 text-sm">Go to Accounts</a>
                </div>
              )
            )}
          </div>

          {/* ── Footer ── */}
          {activeTab === 'manual' && (
          <div className="flex gap-3 px-6 pb-5 pt-3 flex-shrink-0"
               style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <button onClick={handleClose}
                    className="btn-outline flex-1 justify-center py-2.5 text-sm">Cancel</button>
            <button onClick={handleSave}
                    disabled={saving || !form.symbol.trim() || !form.size || !form.entry_price}
                    className="btn-primary flex-1 justify-center py-2.5 text-sm disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Trade'}
            </button>
          </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}