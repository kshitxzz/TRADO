import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Undo2, Redo2, Camera, Maximize2, Minimize2, Settings, Activity, RotateCcw, AlertTriangle,
} from 'lucide-react'
import PageWrapper from '../../components/layout/PageWrapper'
import PairIcon from '../../components/ui/PairIcon'
import BacktestChart from '../../components/backtest/BacktestChart'
import DrawingOverlay from '../../components/backtest/DrawingOverlay'
import DrawingToolbar from '../../components/backtest/DrawingToolbar'
import DrawingStyleBar, { DrawingSettingsDialog } from '../../components/backtest/DrawingStyleBar'
import IndicatorsDialog from '../../components/backtest/IndicatorsDialog'
import LayoutMenu from '../../components/backtest/LayoutMenu'
import OrderPanel from '../../components/backtest/OrderPanel'
import PositionsPanel from '../../components/backtest/PositionsPanel'
import ReplayBar from '../../components/backtest/ReplayBar'
import { useAuth } from '../../hooks/useAuth'
import { formatShortDateTime } from '../../hooks/useTimeFormat'
import * as api from '../../lib/backtest/api'
import * as E from '../../lib/backtest/engine'
import { getSpec, priceDigits, marginUsd } from '../../lib/backtest/specs'
import { computeStats, fmtUsd } from '../../lib/backtest/stats'
import {
  TIMEFRAMES, tfSecs as tfSecsOf, loadSessionData, buildTfIndex, candlesToNextBar, firstIndexAtOrAfter,
} from '../../lib/backtest/data'
import { TOOLS, cloneDrawing } from '../../lib/backtest/drawings'

const BASE_TICK_MS = 400
const clr = (n) => (n > 0 ? 'var(--positive-green)' : n < 0 ? 'var(--negative-red)' : 'var(--text-primary)')
const isTyping = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)

function TopBtn({ title, onClick, children, active, disabled }) {
  return (
    <button title={title} onClick={onClick} disabled={disabled}
            className="h-8 min-w-8 px-2 flex items-center justify-center gap-1.5 rounded-md text-[12.5px] font-medium transition-colors hover:bg-white/10 disabled:opacity-35 disabled:hover:bg-transparent"
            style={{ color: active ? 'var(--accent-purple-light)' : 'var(--text-secondary)', background: active ? 'rgba(139,92,246,0.15)' : undefined }}>
      {children}
    </button>
  )
}

export default function BacktestWorkspace() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  // ── load state ─────────────────────────────────────────────────────────
  const [session, setSession] = useState(null)
  const [phase, setPhase] = useState('loading')           // loading | ready | error
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(null)
  const [data, setData] = useState(null)                   // { base, baseSecs }
  const [attempt, setAttempt] = useState(0)

  // ── replay / account ───────────────────────────────────────────────────
  const [count, setCount] = useState(0)
  const [engine, setEngine] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [selecting, setSelecting] = useState(false)
  const [tf, setTf] = useState('15m')

  // ── chart UI ───────────────────────────────────────────────────────────
  const [drawings, setDrawings] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [tool, setTool] = useState('cursor')
  const [magnet, setMagnet] = useState(false)
  const [stay, setStay] = useState(false)
  const [lockAll, setLockAll] = useState(false)
  const [hideAll, setHideAll] = useState(false)
  const [emoji, setEmoji] = useState('🚀')
  const [indicators, setIndicators] = useState([])
  const [showIndicators, setShowIndicators] = useState(false)
  const [settingsFor, setSettingsFor] = useState(null)
  const [chartSettings, setChartSettings] = useState({ grid: true, priceLine: true })
  const [showChartSettings, setShowChartSettings] = useState(false)
  const [ticket, setTicket] = useState(null)
  const [layouts, setLayouts] = useState([])
  const [activeLayoutId, setActiveLayoutId] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [, bump] = useState(0)

  // ── refs ───────────────────────────────────────────────────────────────
  const chartRef = useRef(null)
  const svgRef = useRef(null)
  const boxRef = useRef(null)
  const rootRef = useRef(null)
  const countRef = useRef(0)
  const engineRef = useRef(null)
  const idxCache = useRef(new Map())
  const history = useRef({ past: [], future: [], committed: [] })
  const dirty = useRef(false)
  const timer = useRef(null)
  const spent = useRef(0)
  const latest = useRef({})

  const spec = useMemo(() => getSpec(session?.symbol || ''), [session?.symbol])
  const base = data?.base
  const baseSecs = data?.baseSecs || 900
  const spread = Number(session?.spread) || 0

  const endCount = useMemo(() => {
    if (!base || !session) return 0
    return Math.min(base.length, firstIndexAtOrAfter(base, baseSecs, Math.floor(new Date(session.end_at).getTime() / 1000) + baseSecs))
  }, [base, baseSecs, session])

  const candle = base && count > 0 ? base[count - 1] : null
  const now = candle ? candle.time + baseSecs : 0
  const atEnd = !!base && count >= endCount
  const digits = priceDigits(spec, candle?.close)
  const quote = candle ? { bid: candle.close, ask: candle.close + spread } : { bid: 0, ask: 0 }

  // ── persistence ────────────────────────────────────────────────────────
  latest.current = {
    cursor_time: candle ? now : null,
    state: { positions: engine?.positions || [], orders: engine?.orders || [] },
    drawings, indicators, chart_tf: tf,
    status: atEnd && base ? 'completed' : 'active',
  }

  const flush = useCallback(async () => {
    if (!dirty.current || !session) return
    dirty.current = false
    try {
      await api.updateSession(id, { ...latest.current, time_spent_secs: (session.time_spent_secs || 0) + Math.round(spent.current) })
    } catch (e) {
      dirty.current = true
      toast.error(e.message || 'Could not save progress')
    }
  }, [id, session])

  const flushRef = useRef(flush)
  flushRef.current = flush
  const schedule = useCallback(() => {
    dirty.current = true
    clearTimeout(timer.current)
    timer.current = setTimeout(() => flushRef.current(), 1800)
  }, [])

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushRef.current() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    const tick = setInterval(() => { if (document.visibilityState === 'visible') spent.current += 1 }, 1000)
    return () => {
      document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide)
      clearInterval(tick); clearTimeout(timer.current)
      dirty.current = true; flushRef.current()            // leaving the page saves immediately
    }
  }, [])

  // ── load session + candles ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    const ctl = new AbortController()
    let cancelled = false
    setPhase('loading'); setError(''); setProgress(null)

    ;(async () => {
      try {
        const row = await api.getSession(id)
        if (!row) throw Object.assign(new Error('This backtest session was not found.'), { fatal: true })
        const trades = await api.listTrades(id)
        const startSec = Math.floor(new Date(row.start_at).getTime() / 1000)
        const endSec = Math.floor(new Date(row.end_at).getTime() / 1000)
        const d = await loadSessionData({ symbol: row.symbol, baseTf: row.base_tf, startSec, endSec, signal: ctl.signal, onProgress: (p) => !cancelled && setProgress(p) })
        if (cancelled) return

        const step = d.baseSecs
        const initial = row.cursor_time
          ? firstIndexAtOrAfter(d.base, step, Number(row.cursor_time) + 1)
          : firstIndexAtOrAfter(d.base, step, startSec + step)
        if (initial < 40) throw new Error(`There isn't enough ${row.base_tf} history before ${new Date(row.start_at).toLocaleDateString()} for ${row.symbol} (the feed starts ${formatShortDateTime(d.base[0].time * 1000)}). Create a session with a later start date.`)

        const st0 = E.createState({ balance: Number(row.start_balance), leverage: row.leverage, spread: Number(row.spread) || 0 })
        const st = E.hydrateState(st0, { positions: row.state?.positions || [], orders: row.state?.orders || [], closed: trades })

        idxCache.current = new Map()
        engineRef.current = st; countRef.current = initial
        history.current = { past: [], future: [], committed: row.drawings || [] }
        setSession(row); setData(d); setEngine(st); setCount(initial)
        setDrawings(row.drawings || []); setIndicators(row.indicators || [])
        setTf(row.chart_tf && tfSecsOf(row.chart_tf) >= step ? row.chart_tf : row.base_tf)
        setPhase('ready')

        const lastBar = d.base[d.base.length - 1]
        if (lastBar.time + step < endSec - step * 3 && endSec < Date.now() / 1000) {
          toast(`Market data for ${row.symbol} ends ${formatShortDateTime(lastBar.time * 1000)} — the replay stops there.`, { icon: 'ℹ️', duration: 6000 })
        }
      } catch (e) {
        if (cancelled || e.name === 'AbortError') return
        setError(e.message || 'Could not load this session.'); setPhase('error')
      }
    })()

    api.listLayouts(user.id).then(l => !cancelled && setLayouts(l)).catch(() => {})
    return () => { cancelled = true; ctl.abort() }
  }, [id, user, attempt])

  // ── timeframe index (cached) ───────────────────────────────────────────
  const idx = useMemo(() => {
    if (!base) return null
    const key = `${tf}`
    if (!idxCache.current.has(key)) idxCache.current.set(key, buildTfIndex(base, tf))
    return idxCache.current.get(key)
  }, [base, tf])
  const view = useMemo(() => (base && idx ? { base, idx, count } : null), [base, idx, count])
  const tfSecs = tfSecsOf(tf)
  const tfList = TIMEFRAMES.filter(t => t.secs >= baseSecs)

  // ── trading helpers ────────────────────────────────────────────────────
  const commit = useCallback((next) => { engineRef.current = next; setEngine(next); schedule() }, [schedule])

  const persistTrades = useCallback((trades) => {
    if (!trades.length || !user) return
    api.saveTrades(user.id, id, trades).catch(() => toast.error('A closed trade could not be synced — it will retry on the next save.'))
  }, [id, user])

  const announce = useCallback((events) => {
    const closed = []
    for (const ev of events) {
      if (ev.type === 'closed') {
        closed.push(ev.trade)
        const t = ev.trade
        const label = t.reason === 'tp' ? 'Take profit hit' : t.reason === 'sl' ? 'Stop loss hit' : t.reason === 'stopout' ? 'Stop-out' : 'Closed'
        ;(t.pnl >= 0 ? toast.success : toast.error)(`${label}: ${t.side === 'buy' ? 'Buy' : 'Sell'} ${t.lots} · ${fmtUsd(t.pnl, { sign: true })}`)
      } else if (ev.type === 'filled') {
        toast.success(`${ev.position.side === 'buy' ? 'Buy' : 'Sell'} order filled @ ${ev.position.entry}`)
      } else if (ev.type === 'rejected') {
        toast.error('A pending order was cancelled — not enough margin.')
      }
    }
    persistTrades(closed)
  }, [persistTrades])

  /** Step the replay forward n base candles, running every one through the engine. */
  const advance = useCallback((n) => {
    if (!base) return 0
    const cur = countRef.current
    const target = Math.min(endCount, cur + n)
    if (target <= cur) return 0
    let s = engineRef.current
    const events = []
    for (let i = cur; i < target; i++) {
      const c = base[i]
      const r = E.processCandle(s, spec, c, c.time + baseSecs)
      s = r.state
      if (r.events.length) events.push(...r.events)
    }
    countRef.current = target
    engineRef.current = s
    setCount(target); setEngine(s)
    schedule()
    if (events.length) announce(events)
    if (target >= endCount) { setPlaying(false); toast('You reached the end of the session range.', { icon: '🏁' }) }
    return target - cur
  }, [base, endCount, spec, baseSecs, schedule, announce])

  const next = useCallback(() => {
    if (!idx) return
    advance(candlesToNextBar(idx, countRef.current, base.length))
  }, [advance, idx, base])

  // play loop
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => advance(1), Math.max(45, BASE_TICK_MS / speed))
    return () => clearInterval(t)
  }, [playing, speed, advance])

  const jumpToTime = useCallback((tSecs, { silent } = {}) => {
    const target = Math.min(endCount, firstIndexAtOrAfter(base, baseSecs, Math.floor(tSecs) + 1))
    if (target <= countRef.current) { if (!silent) toast.error('Pick a later time — a replay only moves forward.'); return }
    setPlaying(false)
    advance(target - countRef.current)
  }, [base, baseSecs, endCount, advance])

  // select-bar: the next click on the chart jumps to the end of that bar
  const onBoxPointerDown = (e) => {
    if (!selecting) { if (tool === 'cursor') setSelectedId(null); return }
    const proj = chartRef.current?.projector()
    const rect = boxRef.current?.getBoundingClientRect()
    if (!proj || !rect) return
    const t = proj.xToTime(e.clientX - rect.left)
    setSelecting(false)
    if (t == null) return
    jumpToTime(Math.floor(t / tfSecs) * tfSecs + tfSecs - 1)
  }

  const pnlOf = useCallback((pos) => (candle ? E.positionPnl(spec, pos, candle, spread) : 0), [candle, spec, spread])
  const projectPnl = useCallback((pos, price) => E.projectPnl(spec, pos, price), [spec])
  const acct = useMemo(() => (engine ? E.account(engine, spec, candle) : { balance: 0, floating: 0, equity: 0, margin: 0, freeMargin: 0 }), [engine, spec, candle])
  const stats = useMemo(() => computeStats(engine?.closed || [], Number(session?.start_balance) || 0), [engine?.closed, session?.start_balance])

  const avgRange = () => {
    const bars = (chartRef.current?.bars() || []).slice(-20)
    return bars.length ? bars.reduce((s, b) => s + (b.high - b.low), 0) / bars.length : (candle?.close || 1) * 0.002
  }
  const suggest = (side, entry) => {
    const d = avgRange() * 1.5
    const r = (n) => Number(n.toFixed(digits))
    return side === 'buy' ? { sl: r(entry - d), tp: r(entry + d * 2) } : { sl: r(entry + d), tp: r(entry - d * 2) }
  }

  const confirmTicket = () => {
    if (!ticket || !candle) return
    const o = { side: ticket.side, lots: ticket.lots, sl: ticket.sl, tp: ticket.tp }
    const r = ticket.orderType === 'market'
      ? E.openMarket(engineRef.current, spec, o, candle, now)
      : E.placePending(engineRef.current, spec, { ...o, type: ticket.orderType, price: ticket.price }, candle, now)
    if (r.error) { toast.error(r.error); return }
    commit(r.state)
    toast.success(ticket.orderType === 'market'
      ? `${ticket.side === 'buy' ? 'Bought' : 'Sold'} ${r.position.lots} @ ${r.position.entry}`
      : `${ticket.orderType} order placed @ ${r.order.price}`)
    setTicket(null)
  }

  const modifyPosition = (pid, patch) => {
    const r = E.modifyPosition(engineRef.current, pid, patch)
    if (r.error) toast.error(r.error); else commit(r.state)
  }
  const modifyOrder = (oid, patch) => {
    const r = E.modifyOrder(engineRef.current, oid, patch)
    if (r.error) toast.error(r.error); else commit(r.state)
  }
  const quickLevel = (pid, key) => {
    const pos = engineRef.current.positions.find(p => p.id === pid)
    if (!pos) return
    const d = avgRange() * 1.5
    const up = (pos.side === 'buy') === (key === 'tp')
    const price = Number((pos.entry + (up ? d * (key === 'tp' ? 2 : 1) : -d * (key === 'tp' ? 2 : 1))).toFixed(digits))
    modifyPosition(pid, { [key]: price })
  }
  const closePosition = (pid) => {
    if (!candle) return
    const r = E.closePosition(engineRef.current, spec, pid, candle, now, 'manual')
    commit(r.state)
    if (r.trade) announce([{ type: 'closed', trade: r.trade }])
  }
  const closeAllPositions = () => {
    if (!candle) return
    const r = E.closeAll(engineRef.current, spec, candle, now, 'manual')
    commit(r.state)
    announce(r.trades.map(trade => ({ type: 'closed', trade })))
  }
  const cancelOrder = (oid) => commit(E.cancelOrder(engineRef.current, oid))

  // levels the chart must keep in view: open positions, pending orders and the order ticket
  const extraPrices = useMemo(() => {
    const out = []
    const add = (n) => { if (Number.isFinite(n) && n > 0) out.push(n) }
    for (const p of engine?.positions || []) { add(p.entry); add(p.sl); add(p.tp) }
    for (const o of engine?.orders || []) { add(o.price); add(o.sl); add(o.tp) }
    if (ticket) { add(ticket.sl); add(ticket.tp) }
    return out
  }, [engine?.positions, engine?.orders, ticket?.sl, ticket?.tp])  // eslint-disable-line react-hooks/exhaustive-deps

  const trading = useMemo(() => ({
    positions: engine?.positions || [], orders: engine?.orders || [], pnlOf, projectPnl,
    projectTicketPnl: (t, price) => E.projectPnl(spec, { side: t.side, lots: t.lots, entry: t.orderType === 'market' ? t.entry : t.price }, price),
    onModifyPosition: modifyPosition, onModifyOrder: modifyOrder, onClosePosition: closePosition,
    onCancelOrder: cancelOrder, onQuickLevel: quickLevel,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [engine, pnlOf, projectPnl, spec, candle, digits])

  // ── drawings + history ─────────────────────────────────────────────────
  const changeDrawings = useCallback((nextList, committed) => {
    setDrawings(nextList)
    if (!committed) return
    const h = history.current
    if (nextList === h.committed) return
    h.past = [...h.past.slice(-49), h.committed]; h.future = []; h.committed = nextList
    schedule(); bump(n => n + 1)
  }, [schedule])

  const undo = () => {
    const h = history.current
    if (!h.past.length) return
    h.future = [h.committed, ...h.future]
    h.committed = h.past[h.past.length - 1]; h.past = h.past.slice(0, -1)
    setDrawings(h.committed); setSelectedId(null); schedule(); bump(n => n + 1)
  }
  const redo = () => {
    const h = history.current
    if (!h.future.length) return
    h.past = [...h.past, h.committed]
    h.committed = h.future[0]; h.future = h.future.slice(1)
    setDrawings(h.committed); setSelectedId(null); schedule(); bump(n => n + 1)
  }

  const selected = drawings.find(d => d.id === selectedId) || null
  const updateDrawing = (d) => changeDrawings(drawings.map(x => (x.id === d.id ? d : x)), true)
  const deleteSelected = () => { if (selected) { changeDrawings(drawings.filter(d => d.id !== selected.id), true); setSelectedId(null) } }
  const duplicateSelected = () => {
    if (!selected) return
    const copy = cloneDrawing(selected, tfSecs * 3, 0)
    changeDrawings([...drawings, copy], true); setSelectedId(copy.id)
  }
  const clearAll = () => {
    if (!drawings.length) return
    if (window.confirm('Remove all drawings from this chart?')) { changeDrawings([], true); setSelectedId(null) }
  }

  const changeTf = (k) => { setTf(k); schedule() }
  const changeIndicators = (list) => { setIndicators(list); schedule() }

  // ── layouts ────────────────────────────────────────────────────────────
  const layoutData = () => ({ tf, drawings, indicators, settings: chartSettings })
  const saveLayoutAs = async (name) => {
    try {
      const row = await api.saveLayout(user.id, name, layoutData())
      setLayouts(ls => [...ls.filter(l => l.id !== row.id && l.name !== row.name), row].sort((a, b) => a.name.localeCompare(b.name)))
      setActiveLayoutId(row.id); toast.success(`Layout “${name}” saved`)
    } catch (e) { toast.error(e.message) }
  }
  const updateLayout = (l) => saveLayoutAs(l.name)
  const loadLayout = (l) => {
    const d = l.data || {}
    if (d.tf && tfSecsOf(d.tf) >= baseSecs) setTf(d.tf)
    changeDrawings(d.drawings || [], true); setSelectedId(null)
    setIndicators(d.indicators || []); if (d.settings) setChartSettings(d.settings)
    setActiveLayoutId(l.id); schedule()
  }
  const renameLayout = async (lid, name) => {
    try { await api.renameLayout(lid, name); setLayouts(ls => ls.map(l => (l.id === lid ? { ...l, name } : l))) } catch (e) { toast.error(e.message) }
  }
  const deleteLayout = async (l) => {
    try { await api.deleteLayout(l.id); setLayouts(ls => ls.filter(x => x.id !== l.id)); if (activeLayoutId === l.id) setActiveLayoutId(null) } catch (e) { toast.error(e.message) }
  }

  // ── screenshot / fullscreen ────────────────────────────────────────────
  const screenshot = async () => {
    const canvas = await chartRef.current?.screenshot(svgRef.current)
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${session.symbol}-${tf}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`
      a.click(); URL.revokeObjectURL(a.href)
    })
  }
  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else rootRef.current?.requestFullscreen?.()
  }

  const forwardWheel = (e) => {
    const els = document.elementsFromPoint(e.clientX, e.clientY)
    const target = els.find(el => boxRef.current?.contains(el) && !el.closest('svg.bt-overlay'))
    target?.dispatchEvent(new WheelEvent('wheel', { clientX: e.clientX, clientY: e.clientY, deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, ctrlKey: e.ctrlKey, bubbles: true, cancelable: true }))
  }

  // ── keyboard ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (phase !== 'ready') return
      if (isTyping()) return
      const k = e.key
      if (e.shiftKey && k === 'ArrowRight') { e.preventDefault(); setPlaying(false); next(); return }
      if (e.shiftKey && k === 'ArrowDown') { e.preventDefault(); if (!atEnd) setPlaying(p => !p); return }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if (k === 'Delete' || k === 'Backspace') { if (selected && !selected.locked) { e.preventDefault(); deleteSelected() } return }
      if (k === 'Escape') { setTool('cursor'); setSelectedId(null); setSelecting(false); setTicket(null); setShowChartSettings(false); return }
      if (e.altKey) {
        const hit = Object.entries(TOOLS).find(([, t]) => t.key && t.key.toLowerCase() === (e.code || '').replace('Key', '').toLowerCase())
        if (hit) { e.preventDefault(); setTool(hit[0]) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── render ─────────────────────────────────────────────────────────────
  const clock = candle ? formatShortDateTime(now * 1000) : ''
  const startSec = session ? Math.floor(new Date(session.start_at).getTime() / 1000) : 0
  const endSec = session ? Math.floor(new Date(session.end_at).getTime() / 1000) : 0
  const initialCount = base ? firstIndexAtOrAfter(base, baseSecs, startSec + baseSecs) : 0
  const prog = endCount > initialCount ? (count - initialCount) / (endCount - initialCount) : 0
  const toInput = (s) => { const d = new Date(s * 1000), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }

  if (phase === 'error') {
    return (
      <PageWrapper flush>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="glass-card max-w-md w-full p-8 text-center">
            <AlertTriangle size={28} className="mx-auto mb-3" style={{ color: '#F59E0B' }} />
            <h2 className="text-lg font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>Couldn’t open this session</h2>
            <p className="text-[13px] mb-5" style={{ color: 'var(--text-muted)' }}>{error}</p>
            <div className="flex gap-2 justify-center">
              <Link to={`/backtesting/${id}`} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Back</Link>
              <button onClick={() => setAttempt(a => a + 1)} className="btn-primary px-4 py-2 rounded-lg text-[13px] font-semibold text-white flex items-center gap-1.5"><RotateCcw size={14} /> Try again</button>
            </div>
          </div>
        </div>
      </PageWrapper>
    )
  }

  const loadingMsg = phase === 'loading'
    ? (progress ? `Loading ${session?.symbol || ''} ${session?.base_tf || ''} candles… ${Math.round((progress.loaded / Math.max(1, progress.total)) * 100)}%` : 'Opening session…')
    : null

  return (
    <PageWrapper flush>
      <div ref={rootRef} className="flex-1 min-h-0 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
        {/* ── top bar ── */}
        <div className="flex-shrink-0 flex items-center gap-1 px-2 h-11 overflow-x-auto" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-subtle)' }}>
          <TopBtn title="Back to session overview" onClick={() => navigate(`/backtesting/${id}`)}><ArrowLeft size={16} /></TopBtn>
          {session && (
            <div className="flex items-center gap-2 px-2 mr-1">
              <PairIcon symbol={session.symbol} size={20} />
              <div className="leading-tight">
                <p className="text-[13px] font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{session.symbol}</p>
                <p className="text-[10.5px] whitespace-nowrap max-w-[150px] truncate" style={{ color: 'var(--text-muted)' }}>{session.name}</p>
              </div>
            </div>
          )}
          <div className="w-px h-5 mx-1" style={{ background: 'var(--border-subtle)' }} />
          {tfList.map(t => (
            <TopBtn key={t.key} active={tf === t.key} onClick={() => changeTf(t.key)}>{t.label}</TopBtn>
          ))}
          <div className="w-px h-5 mx-1" style={{ background: 'var(--border-subtle)' }} />
          <TopBtn onClick={() => setShowIndicators(true)} active={indicators.length > 0}><Activity size={15} /> Indicators{indicators.length ? ` (${indicators.length})` : ''}</TopBtn>
          <TopBtn title="Undo (Ctrl+Z)" onClick={undo} disabled={!history.current.past.length}><Undo2 size={15} /></TopBtn>
          <TopBtn title="Redo (Ctrl+Y)" onClick={redo} disabled={!history.current.future.length}><Redo2 size={15} /></TopBtn>

          <div className="flex-1 min-w-4" />

          <div className="hidden lg:flex items-center gap-4 px-3 text-[12px] whitespace-nowrap">
            <span style={{ color: 'var(--text-muted)' }}>Balance <b className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtUsd(acct.balance)}</b></span>
            <span style={{ color: 'var(--text-muted)' }}>Equity <b className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtUsd(acct.equity)}</b></span>
            <span style={{ color: 'var(--text-muted)' }}>P&L <b className="tabular-nums" style={{ color: clr(acct.equity - (Number(session?.start_balance) || 0)) }}>{fmtUsd(acct.equity - (Number(session?.start_balance) || 0), { sign: true })}</b></span>
          </div>

          <LayoutMenu layouts={layouts} activeId={activeLayoutId} onSave={saveLayoutAs} onUpdate={updateLayout} onLoad={loadLayout} onRename={renameLayout} onDelete={deleteLayout} />
          <div className="relative">
            <TopBtn title="Chart settings" onClick={() => setShowChartSettings(s => !s)} active={showChartSettings}><Settings size={15} /></TopBtn>
            {showChartSettings && (
              <div className="absolute right-0 top-full mt-1.5 z-50 w-[210px] rounded-xl p-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 16px 50px rgba(0,0,0,0.55)' }}>
                {[['grid', 'Grid lines'], ['priceLine', 'Last price line']].map(([k, label]) => (
                  <label key={k} className="flex items-center justify-between px-2 py-2 text-[12.5px] cursor-pointer rounded-md hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>
                    {label}
                    <input type="checkbox" className="accent-[#8B5CF6]" checked={chartSettings[k] !== false} onChange={(e) => { setChartSettings(s => ({ ...s, [k]: e.target.checked })) }} />
                  </label>
                ))}
                <button onClick={() => { chartRef.current?.fit(); setShowChartSettings(false) }} className="w-full text-left px-2 py-2 text-[12.5px] rounded-md hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>Reset chart view</button>
              </div>
            )}
          </div>
          <TopBtn title="Save a screenshot" onClick={screenshot}><Camera size={15} /></TopBtn>
          <TopBtn title="Fullscreen" onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</TopBtn>
        </div>

        {/* ── body ── */}
        <div className="flex-1 min-h-0 flex">
          <DrawingToolbar tool={tool} onTool={(t) => { setTool(t); setSelecting(false); if (t !== 'cursor') setSelectedId(null) }}
                          magnet={magnet} onMagnet={() => setMagnet(m => !m)} stay={stay} onStay={() => setStay(s => !s)}
                          lockAll={lockAll} onLock={() => setLockAll(l => !l)} hideAll={hideAll} onHide={() => setHideAll(h => !h)}
                          onClear={clearAll} emoji={emoji} onEmoji={setEmoji} hasDrawings={drawings.length > 0} />

          <div className="flex-1 min-w-0 flex flex-col">
            <div ref={boxRef} className="flex-1 min-h-0 relative" onPointerDown={onBoxPointerDown} style={{ cursor: selecting ? 'crosshair' : undefined }}>
              <BacktestChart ref={chartRef} view={view} tf={tf} digits={digits} indicators={indicators} settings={chartSettings} loading={loadingMsg} extraPrices={extraPrices}>
                {(capi) => (
                  <DrawingOverlay api={capi} getPane={() => chartRef.current?.pane() || { w: 0, h: 0 }} tfSecs={tfSecs} tfKey={tf} digits={digits}
                                  drawings={drawings} onDrawingsChange={changeDrawings} selectedId={selectedId} onSelect={setSelectedId}
                                  tool={tool} onToolChange={setTool} stayInDrawing={stay} magnet={magnet} lockAll={lockAll} hideAll={hideAll} emoji={emoji}
                                  onZoom={(r) => chartRef.current?.zoomTo(r)} trading={trading}
                                  ticket={ticket} onTicketChange={(p) => setTicket(t => (t ? { ...t, ...p } : t))}
                                  svgRef={svgRef} forwardWheelTo={forwardWheel} />
                )}
              </BacktestChart>

              {tool === 'cursor' && selected && !hideAll && (
                <DrawingStyleBar drawing={selected} onChange={updateDrawing} onDelete={deleteSelected} onDuplicate={duplicateSelected} onSettings={() => setSettingsFor(selected)} />
              )}

              {selecting && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3.5 py-2 rounded-lg text-[12.5px] font-medium"
                     style={{ background: 'rgba(139,92,246,0.95)', color: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
                  Click a candle to jump forward to it · Esc to cancel
                </div>
              )}
              {tool !== 'cursor' && tool !== 'zoom' && (
                <div className="absolute bottom-3 left-3 z-20 px-2.5 py-1 rounded-md text-[11.5px]" style={{ background: 'rgba(17,17,22,0.85)', color: 'var(--text-secondary)' }}>
                  {TOOLS[tool]?.label}{TOOLS[tool]?.points > 1 ? ' — click or drag to place' : ' — click to place'} · Esc to stop
                </div>
              )}
            </div>

            <ReplayBar clock={clock} playing={playing} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onNext={() => { setPlaying(false); next() }}
                       speed={speed} onSpeed={setSpeed} selecting={selecting} onSelectBar={() => setSelecting(s => !s)}
                       onJump={(v) => jumpToTime(new Date(v).getTime() / 1000)} progress={prog} atEnd={atEnd}
                       minDate={candle ? toInput(now) : undefined} maxDate={endSec ? toInput(endSec) : undefined} />

            <PositionsPanel positions={engine?.positions || []} orders={engine?.orders || []} closed={engine?.closed || []} digits={digits}
                            pnlOf={pnlOf} onClose={closePosition} onCloseAll={closeAllPositions} onCancelOrder={cancelOrder} floating={acct.floating} />
          </div>

          <div className="hidden md:block flex-shrink-0">
            <OrderPanel symbol={session?.symbol || ''} spec={spec} digits={digits} quote={quote} ready={!!candle && phase === 'ready'}
                        ticket={ticket} onTicket={setTicket} suggest={suggest} projectTicketPnl={trading.projectTicketPnl}
                        ticketMargin={(t) => marginUsd(spec, t.lots, t.entry || candle?.close || 0, session?.leverage || 100)}
                        onConfirm={confirmTicket} stats={stats} account={acct} openCount={engine?.positions?.length || 0} />
          </div>
        </div>
      </div>

      {showIndicators && <IndicatorsDialog indicators={indicators} onChange={changeIndicators} onClose={() => setShowIndicators(false)} />}
      {settingsFor && (
        <DrawingSettingsDialog drawing={settingsFor} digits={digits} onClose={() => setSettingsFor(null)}
                               onApply={(d) => { updateDrawing(d); setSettingsFor(null) }} />
      )}
    </PageWrapper>
  )
}