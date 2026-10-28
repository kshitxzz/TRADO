import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Undo2, Redo2, Camera, Maximize2, Minimize2, Settings, Activity, RotateCcw, AlertTriangle,
  Copy, ClipboardPaste, BellPlus, TrendingUp, TrendingDown, PlusSquare, Table, ListTree, Lock, Unlock, Trash2, Layers, Crosshair,
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
import TimeframeMenu from '../../components/backtest/TimeframeMenu'
import StatusLine, { isMarketOpen } from '../../components/backtest/StatusLine'
import ChartSettingsDialog from '../../components/backtest/ChartSettingsDialog'
import ChartContextMenu from '../../components/backtest/ChartContextMenu'
import TableView from '../../components/backtest/TableView'
import ObjectTree from '../../components/backtest/ObjectTree'
import { useAuth } from '../../hooks/useAuth'
import { formatShortDateTime, useTimeFormat } from '../../hooks/useTimeFormat'
import { useTheme } from '../../hooks/useTheme'
import * as api from '../../lib/backtest/api'
import * as E from '../../lib/backtest/engine'
import { getSpec, priceDigits, marginUsd } from '../../lib/backtest/specs'
import { computeStats, fmtUsd } from '../../lib/backtest/stats'
import {
  tfSecs as tfSecsOf, tfLabel, isValidTf, baseFor, DEFAULT_FAVORITE_TFS, loadSessionData, buildTfIndex, candlesToNextBar, firstIndexAtOrAfter,
} from '../../lib/backtest/data'
import { DEFAULT_RECENT_EMOJI } from '../../lib/backtest/emojiData'
import { mergeSettings, clone, symbolDescription } from '../../lib/backtest/chartSettings'
import { makeTimeFormatter } from '../../lib/backtest/timefmt'
import { playSound } from '../../lib/backtest/sound'
import { TOOLS, cloneDrawing, makeDrawing } from '../../lib/backtest/drawings'

const BASE_TICK_MS = 400

/** useState that survives reloads (preferences only — never anything about trades). */
function useStored(key, initial) {
  const [v, setV] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial } catch { return initial }
  })
  const set = useCallback((next) => {
    setV(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* private mode */ }
  }, [key])
  return [v, set]
}
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

/** Confirms a backward jump that would undo trades. */
function RewindConfirm({ clock, summary: u, onCancel, onConfirm }) {
  const lines = []
  const n = (c, w) => `${c} ${w}${c === 1 ? '' : 's'}`
  if (u.reopened) lines.push(`${n(u.reopened, 'trade')} that ${u.reopened === 1 ? 'was' : 'were'} open at that moment will be re-opened.`)
  if (u.undone) lines.push(`${n(u.undone, 'trade')} opened after that moment will be removed from the session.`)
  if (u.cancelledPositions) lines.push(`${n(u.cancelledPositions, 'open position')} opened after that moment will be cancelled.`)
  if (u.ordersRemoved) lines.push(`${n(u.ordersRemoved, 'pending order')} placed after that moment will be removed.`)
  if (u.ordersRestored) lines.push(`${n(u.ordersRestored, 'pending order')} will be pending again.`)
  if (u.pnlRemoved) lines.push(`Their profit and loss (${fmtUsd(u.pnlRemoved, { sign: true })}) is removed from your balance.`)
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onPointerDown={onCancel}>
      <div className="w-full max-w-[440px] rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 30px 100px rgba(0,0,0,0.7)' }} onPointerDown={(e) => e.stopPropagation()}>
        <h3 className="text-[17px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Go back to {clock}?</h3>
        <p className="text-[13px] mb-3" style={{ color: 'var(--text-muted)' }}>Your account will be restored to how it was at that moment:</p>
        <ul className="space-y-1.5 mb-5">
          {lines.map(l => <li key={l} className="text-[13px] flex gap-2" style={{ color: 'var(--text-secondary)' }}><span style={{ color: 'var(--accent-purple-light)' }}>•</span>{l}</li>)}
        </ul>
        <p className="text-[12px] mb-5" style={{ color: 'var(--text-muted)' }}>Replaying forward from there plays the same candles again — you can trade them differently.</p>
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-[13px] font-semibold hover:bg-white/5" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>Cancel</button>
          <button type="button" onClick={onConfirm} className="btn-primary px-5 py-2 rounded-lg text-[13px] font-semibold text-white">Go back</button>
        </div>
      </div>
    </div>
  )
}

/** A one-field name prompt. */
function NameDialog({ title, placeholder, onSubmit, onClose }) {
  const [v, setV] = useState('')
  const go = () => { const n = v.trim(); if (n) { onSubmit(n); onClose() } }
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onPointerDown={onClose}>
      <div className="w-full max-w-[380px] rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }} onPointerDown={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        <input autoFocus value={v} onChange={(e) => setV(e.target.value)} maxLength={40} placeholder={placeholder} onKeyDown={(e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') onClose(); e.stopPropagation() }}
               className="w-full h-10 rounded-lg px-3 text-[13px] outline-none mb-4" style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-semibold hover:bg-white/5" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>Cancel</button>
          <button type="button" onClick={go} className="btn-primary px-5 py-2 rounded-lg text-[13px] font-semibold text-white">Save</button>
        </div>
      </div>
    </div>
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
  const [emoji, setEmoji] = useStored('trado_bt_emoji', '🚀')
  const [recentEmoji, setRecentEmoji] = useStored('trado_bt_recent_emoji', DEFAULT_RECENT_EMOJI)
  const [favTfs, setFavTfs] = useStored('trado_bt_fav_tfs', DEFAULT_FAVORITE_TFS)
  const [customTfs, setCustomTfs] = useStored('trado_bt_custom_tfs', [])
  const [reload, setReload] = useState(null)               // { tf, pct } while finer candles load for a new timeframe
  const [indicators, setIndicators] = useState([])
  const [showIndicators, setShowIndicators] = useState(false)
  const [settingsFor, setSettingsFor] = useState(null)
  // chart settings (the Settings dialog) — saved per browser; `preview` shows unsaved edits while the dialog is open
  const [savedSettings, setSavedSettings] = useStored('trado_bt_settings', null)
  const settings = useMemo(() => mergeSettings(savedSettings), [savedSettings])
  const [preview, setPreview] = useState(null)
  const cs = preview || settings
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTemplates, setSettingsTemplates] = useStored('trado_bt_settings_templates', [])
  const [chartTemplates, setChartTemplates] = useStored('trado_bt_chart_templates', [])
  const [scaleMode, setScaleMode] = useState({ auto: true, log: false, pct: false })
  const [ctx, setCtx] = useState(null)                     // right-click menu { x, y, price, time, drawingId, mini }
  const [tableOpen, setTableOpen] = useState(false)
  const [treeOpen, setTreeOpen] = useState(false)
  const [lockedTime, setLockedTime] = useState(null)
  const [rewindAsk, setRewindAsk] = useState(null)         // { T, result } while waiting for the user to confirm a rewind
  const [nameDialog, setNameDialog] = useState(null)
  const { isDark } = useTheme()
  const { timeFormat } = useTimeFormat()
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
  const orderRef = useRef(null)
  const clipRef = useRef(null)
  const pointerRef = useRef({ time: null, price: null })
  const csRef = useRef(cs)
  const drawingsLive = useRef([])
  const changeDrawingsRef = useRef(() => {})
  csRef.current = cs
  drawingsLive.current = drawings

  const spec = useMemo(() => getSpec(session?.symbol || ''), [session?.symbol])
  const base = data?.base
  const baseSecs = data?.baseSecs || 900
  const baseTf = data?.baseTf || session?.base_tf || '15m'
  const spread = Number(session?.spread) || 0

  const endCount = useMemo(() => {
    if (!base || !session) return 0
    return Math.min(base.length, firstIndexAtOrAfter(base, baseSecs, Math.floor(new Date(session.end_at).getTime() / 1000) + baseSecs))
  }, [base, baseSecs, session])

  const initialCount = useMemo(
    () => (base && session ? firstIndexAtOrAfter(base, baseSecs, Math.floor(new Date(session.start_at).getTime() / 1000) + baseSecs) : 0),
    [base, baseSecs, session])
  const candle = base && count > 0 ? base[count - 1] : null
  const now = candle ? candle.time + baseSecs : 0
  const atEnd = !!base && count >= endCount
  const baseDigits = priceDigits(spec, candle?.close)
  const digits = cs.symbol.precision === 'default' ? baseDigits : cs.symbol.precision
  const tzFmt = useMemo(() => makeTimeFormatter({ scales: cs.scales, timezone: cs.symbol.timezone, appHour12: timeFormat !== '24h' }),
    [cs.scales, cs.symbol.timezone, timeFormat])
  const description = symbolDescription(session?.symbol || '')
  const quote = candle ? { bid: candle.close, ask: candle.close + spread } : { bid: 0, ask: 0 }

  // ── persistence ────────────────────────────────────────────────────────
  latest.current = {
    cursor_time: candle ? now : null,
    state: { positions: engine?.positions || [], orders: engine?.orders || [] },
    drawings, indicators, chart_tf: tf, base_tf: baseTf,
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
        setSession(row); setData({ ...d, baseTf: row.base_tf }); setEngine(st); setCount(initial)
        setDrawings(row.drawings || []); setIndicators(row.indicators || [])
        setTf(isValidTf(row.chart_tf) && tfSecsOf(row.chart_tf) >= step && (row.chart_tf.slice(-1) !== 'm' && row.chart_tf.slice(-1) !== 'h' || tfSecsOf(row.chart_tf) % step === 0) ? row.chart_tf : row.base_tf)
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

  // ── trading helpers ────────────────────────────────────────────────────
  const commit = useCallback((next) => { engineRef.current = next; setEngine(next); schedule() }, [schedule])

  const persistTrades = useCallback((trades) => {
    if (!trades.length || !user) return
    api.saveTrades(user.id, id, trades).catch(() => toast.error('A closed trade could not be synced — it will retry on the next save.'))
  }, [id, user])

  // notifications honour "Show only rejection notifications"; sounds honour "Execution sound"
  const tn = useMemo(() => ({
    success: (m, o) => { if (!csRef.current.trading.onlyRejections) toast.success(m, o) },
    result: (positive, m) => { if (!csRef.current.trading.onlyRejections) (positive ? toast.success : toast.error)(m) },
  }), [])
  const execSound = useCallback(() => { const sd = csRef.current.trading.sound; if (sd.on) playSound(sd.kind, sd.volume) }, [])
  const alertToast = useCallback((m) => {
    toast(m, { icon: '🔔', duration: csRef.current.alerts.autoHideToasts ? 5000 : Infinity })
    execSound()
  }, [execSound])

  const announce = useCallback((events) => {
    const closed = []
    for (const ev of events) {
      if (ev.type === 'closed') {
        closed.push(ev.trade)
        const t = ev.trade
        const label = t.reason === 'tp' ? 'Take profit hit' : t.reason === 'sl' ? 'Stop loss hit' : t.reason === 'stopout' ? 'Stop-out' : 'Closed'
        tn.result(t.pnl >= 0, `${label}: ${t.side === 'buy' ? 'Buy' : 'Sell'} ${t.lots} · ${fmtUsd(t.pnl, { sign: true })}`)
      } else if (ev.type === 'filled') {
        tn.success(`${ev.position.side === 'buy' ? 'Buy' : 'Sell'} order filled @ ${ev.position.entry}`)
      } else if (ev.type === 'rejected') {
        toast.error('A pending order was cancelled — not enough margin.')
      }
    }
    persistTrades(closed)
    if (events.some(e => e.type === 'closed' || e.type === 'filled')) execSound()
  }, [persistTrades, tn, execSound])

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

    // price alerts fire when a revealed candle touches their level
    const live = drawingsLive.current.filter(d => d.type === 'alert' && d.active !== false)
    if (live.length) {
      const hit = new Map()
      for (let i = cur; i < target; i++) {
        const c = base[i]
        for (const a of live) if (!hit.has(a.id) && c.low <= a.points[0].price && a.points[0].price <= c.high) hit.set(a.id, c.time + baseSecs)
      }
      if (hit.size) {
        changeDrawingsRef.current(drawingsLive.current.map(d => (hit.has(d.id) ? { ...d, active: false, triggeredAt: hit.get(d.id) } : d)), true)
        for (const id of hit.keys()) { const a = live.find(x => x.id === id); alertToast(`Alert: ${session.symbol} reached ${a.points[0].price.toFixed(digits)}`) }
      }
    }
    if (target >= endCount) { setPlaying(false); toast('You reached the end of the session range.', { icon: '🏁' }) }
    return target - cur
  }, [base, endCount, spec, baseSecs, schedule, announce, alertToast, session?.symbol, digits])

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

  /** Put the replay clock back to market time T: re-open / undo trades, restore the balance, move the cursor. */
  const applyRewind = useCallback((T, result) => {
    setPlaying(false)
    const target = Math.max(initialCount, firstIndexAtOrAfter(base, baseSecs, T + 1))
    engineRef.current = result.state
    countRef.current = target
    setEngine(result.state); setCount(target)
    // alerts that fired after T are armed again
    const dr = drawingsLive.current
    if (dr.some(d => d.type === 'alert' && d.active === false && d.triggeredAt > T)) {
      changeDrawingsRef.current(dr.map(d => (d.type === 'alert' && d.active === false && d.triggeredAt > T ? { ...d, active: true, triggeredAt: null } : d)), true)
    }
    schedule()
    if (result.removedKeys.length) api.deleteTradesByKeys(id, result.removedKeys).catch(() => toast.error('Could not remove the undone trades from your saved session.'))
    const u = result.summary
    if (E.rewindAffectsAccount(u)) toast.success('Went back in time — your account was restored to that moment.')
  }, [initialCount, base, baseSecs, schedule, id])

  /** Jump the replay to market time T — forward replays candle by candle, backward rewinds (asking first if it changes trades). */
  const seekTo = useCallback((T) => {
    if (!base || !countRef.current) return
    const clockNow = base[countRef.current - 1].time + baseSecs
    const minClock = base[Math.max(0, initialCount - 1)].time + baseSecs
    setPlaying(false)
    if (T > clockNow) {
      const target = Math.min(endCount, firstIndexAtOrAfter(base, baseSecs, Math.floor(T) + 1))
      if (target > countRef.current) advance(target - countRef.current)
      return
    }
    if (T === clockNow) return
    let target = T
    if (T < minClock) { toast('That’s before the session start — going back to the start.', { icon: 'ℹ️' }); target = minClock }
    if (target >= clockNow) return
    const result = E.rewindState(engineRef.current, target)
    if (E.rewindAffectsAccount(result.summary)) setRewindAsk({ T: target, result })
    else applyRewind(target, result)
  }, [base, baseSecs, initialCount, endCount, advance, applyRewind])

  // select-bar: the next click on the chart jumps to the end of that bar (forward or back)
  const onBoxPointerDown = (e) => {
    if (!selecting) { if (tool === 'cursor') setSelectedId(null); return }
    const proj = chartRef.current?.projector()
    const rect = boxRef.current?.getBoundingClientRect()
    if (!proj || !rect) return
    const t = proj.xToTime(e.clientX - rect.left - (chartRef.current?.pane().x || 0))
    setSelecting(false)
    if (t == null) return
    seekTo(Math.floor(t / tfSecs) * tfSecs + tfSecs)
  }

  // chart crosshair feed for the status line, the "+" button and the keyboard shortcuts
  const crossHook = useCallback((cb) => chartRef.current?.onCrosshair(cb) ?? (() => {}), [])
  useEffect(() => {
    if (phase !== 'ready') return
    return chartRef.current?.onCrosshair((info) => { if (info.price != null) pointerRef.current = { time: info.time, price: info.price } })
  }, [phase])

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

  /** Place an order. Used by the order ticket, the chart's Buy/Sell buttons and the right-click menu. */
  const placeOrder = (o) => {
    if (!candle) return false
    if (!(o.lots > 0)) { toast.error('Enter a volume first.'); return false }
    const base0 = { side: o.side, lots: o.lots, sl: o.sl ?? null, tp: o.tp ?? null }
    const r = o.orderType === 'market' || !o.orderType
      ? E.openMarket(engineRef.current, spec, base0, candle, now)
      : E.placePending(engineRef.current, spec, { ...base0, type: o.orderType, price: o.price }, candle, now)
    if (r.error) { toast.error(r.error); return false }
    commit(r.state)
    tn.success(o.orderType === 'market' || !o.orderType
      ? `${o.side === 'buy' ? 'Bought' : 'Sold'} ${r.position.lots} @ ${r.position.entry}`
      : `${o.orderType} order placed @ ${r.order.price}`)
    execSound()
    return true
  }
  const confirmTicket = () => { if (ticket && placeOrder(ticket)) setTicket(null) }

  /** One-click trading executes at once when a volume is typed; otherwise (or when off) it opens the ticket. */
  const quickTrade = (side, { orderType, price } = {}) => {
    const lots = orderRef.current?.getLots()
    const type = orderType || 'market'
    if (cs.trading.oneClick && lots) { placeOrder({ side, lots, orderType: type, price }); return }
    if (!orderRef.current) return
    if (!lots && cs.trading.oneClick) toast('Type a volume in the order panel first.', { icon: 'ℹ️' })
    orderRef.current.startTicket(side, { orderType, price })
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
  /** Close a position at market and open the opposite one of the same size. */
  const reversePosition = (pid) => {
    if (!candle) return
    const pos = engineRef.current.positions.find(p => p.id === pid)
    if (!pos) return
    const closed = E.closePosition(engineRef.current, spec, pid, candle, now, 'manual')
    const opened = E.openMarket(closed.state, spec, { side: pos.side === 'buy' ? 'sell' : 'buy', lots: pos.lots }, candle, now)
    if (opened.error) { toast.error(`Couldn’t reverse: ${opened.error}`); return }
    commit(opened.state)
    if (closed.trade) announce([{ type: 'closed', trade: closed.trade }])
    execSound()
  }
  const markPrice = (pos) => (candle ? (pos.side === 'buy' ? candle.close : candle.close + spread) : pos.entry)
  /** Profit text in the unit chosen in Settings → Trading → Profit and loss value. */
  const pnlText = (mode, usd, pos, price) => {
    if (mode === 'pips') {
      const diff = (pos.side === 'buy' ? 1 : -1) * (price - pos.entry)
      const unit = spec.kind === 'forex' ? 'pips' : 'pts'
      const v = diff / spec.pipSize
      return `${v >= 0 ? '+' : ''}${v.toFixed(1)} ${unit}`
    }
    if (mode === 'percent') { const v = (usd / (Number(session?.start_balance) || 1)) * 100; return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` }
    return fmtUsd(usd, { sign: true })
  }

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
    onCancelOrder: cancelOrder, onQuickLevel: quickLevel, onReverse: reversePosition, markPrice,
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

  changeDrawingsRef.current = changeDrawings

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

  /**
   * Switch the chart timeframe. Higher / equal timeframes are built from the loaded candles instantly.
   * A finer one (or one that doesn't divide evenly) loads finer candles once, then continues from the same moment.
   */
  const changeTf = async (k) => {
    if (!isValidTf(k) || k === tf) return
    const need = baseFor(k, baseTf)
    if (!need) { toast.error('That interval can’t be built from the available data.'); return }
    if (need === baseTf) { setTf(k); schedule(); return }

    setPlaying(false); setSelecting(false)
    setReload({ tf: k, pct: 0 })
    try {
      const startSec = Math.floor(new Date(session.start_at).getTime() / 1000)
      const endSec = Math.floor(new Date(session.end_at).getTime() / 1000)
      const d = await loadSessionData({ symbol: session.symbol, baseTf: need, startSec, endSec, onProgress: (p) => setReload({ tf: k, pct: Math.round((p.loaded / Math.max(1, p.total)) * 100) }) })
      const clockNow = base[countRef.current - 1].time + baseSecs                       // the market moment we are at
      const idx2 = firstIndexAtOrAfter(d.base, d.baseSecs, clockNow + 1)
      if (idx2 < 40) throw new Error(`Not enough ${tfLabel(need)} history before this point for ${session.symbol}.`)
      idxCache.current = new Map()
      countRef.current = idx2
      setData({ ...d, baseTf: need })
      setCount(idx2)
      setTf(k)
      setSession(sess => ({ ...sess, base_tf: need }))
      schedule()
      toast.success(`Now replaying with ${tfLabel(need)} candles for the ${tfLabel(k)} chart.`)
    } catch (e) {
      toast.error(e.message || 'Could not load finer candles for that timeframe.')
    } finally {
      setReload(null)
    }
  }
  const pickEmoji = (e) => {
    setEmoji(e)
    setRecentEmoji([e, ...recentEmoji.filter(x => x !== e)].slice(0, 18))
  }
  const changeIndicators = (list) => { setIndicators(list); schedule() }

  // ── layouts ────────────────────────────────────────────────────────────
  // ── chart extras: levels, execution marks ───────────────────────────────
  const dayKeyNow = candle ? tzFmt.dayKey(now - 1) : 0
  const pdc = useMemo(() => {                       // close of the last candle of the previous day (in the chosen timezone)
    if (!base || !countRef.current) return null
    const k = tzFmt.dayKey(base[countRef.current - 1].time)
    for (let i = countRef.current - 1; i >= 0; i--) if (tzFmt.dayKey(base[i].time) !== k) return base[i].close
    return null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, dayKeyNow, tzFmt])
  const barEnd = idx && count ? (idx.bars[idx.bucketOf[count - 1] + 1]?.time ?? idx.bars[idx.bucketOf[count - 1]].time + tfSecs) : null
  const levels = candle ? { pdc, bid: quote.bid, ask: quote.ask, lastClose: candle.close, countdownSecs: barEnd != null ? barEnd - now : null } : null
  const marks = useMemo(() => {
    const out = []
    const label = (side, kind, lots, price, pnl) => (kind === 'entry' ? `${side === 'buy' ? 'Buy' : 'Sell'} ${lots} @ ${price}` : `Close ${pnl >= 0 ? '+' : ''}${pnl}`)
    for (const t of engine?.closed || []) {
      out.push({ time: t.openedAt, side: t.side, kind: 'entry', text: label(t.side, 'entry', t.lots, t.entry) })
      out.push({ time: t.closedAt, side: t.side, kind: 'exit', pnl: t.pnl, text: label(t.side, 'exit', t.lots, t.exit, t.pnl) })
    }
    for (const p of engine?.positions || []) out.push({ time: p.openedAt, side: p.side, kind: 'entry', text: label(p.side, 'entry', p.lots, p.entry) })
    return out
  }, [engine?.closed, engine?.positions])

  // ── right-click menu actions ────────────────────────────────────────────
  const fmtPx = (n) => Number(n).toFixed(digits)
  const copyPrice = async (price) => {
    try { await navigator.clipboard.writeText(fmtPx(price)); toast.success(`Copied ${fmtPx(price)}`) } catch { toast.error('Couldn’t copy — the browser blocked clipboard access.') }
  }
  const addAlert = (price) => {
    if (!candle || price == null) return
    const d = makeDrawing('alert', [{ time: now, price: Number(fmtPx(price)) }], { active: true })
    changeDrawings([...drawings, d], true)
    toast.success(`Alert set at ${fmtPx(price)}`, { duration: 2500 })
  }
  const copyDrawing = () => { if (selected) { clipRef.current = JSON.parse(JSON.stringify(selected)); toast.success('Drawing copied', { duration: 1500 }) } }
  const pasteDrawing = (at) => {
    const src = clipRef.current
    if (!src) return
    const p0 = src.points[0]
    const copy = cloneDrawing(src, at?.time != null ? at.time - p0.time : tfSecs * 3, at?.price != null ? at.price - p0.price : 0)
    changeDrawings([...drawings, copy], true); setSelectedId(copy.id)
  }
  const orderKind = (side, price) => (side === 'buy' ? (price < quote.ask ? 'limit' : 'stop') : (price > quote.bid ? 'limit' : 'stop'))
  const tradeAt = (side, price) => quickTrade(side, { orderType: orderKind(side, price), price: Number(fmtPx(price)) })
  const addOrderAt = (price) => { const side = price < quote.ask ? 'buy' : 'sell'; tradeAt(side, price) }

  const saveChartTemplate = (name) => {
    setChartTemplates([...chartTemplates.filter(t => t.name !== name), { name, settings: cs, indicators }])
    toast.success(`Chart template “${name}” saved`)
  }
  const applyChartTemplate = (t) => {
    setSavedSettings(mergeSettings(t.settings)); changeIndicators((t.indicators || []).map(i => ({ ...i })))
    toast.success(`Applied “${t.name}”`, { duration: 1800 })
  }

  const buildMenu = (m) => {
    const lots = orderRef.current?.getLots()
    const lot = lots ? `${lots} ` : ''
    const buyType = orderKind('buy', m.price), sellType = orderKind('sell', m.price)
    const trade = [
      { label: `Add alert on ${session.symbol} at ${fmtPx(m.price)}`, shortcut: 'Alt + A', icon: BellPlus, onClick: () => addAlert(m.price) },
      { label: `Buy ${lot}${session.symbol} @ ${fmtPx(m.price)} ${buyType}`, shortcut: 'Alt + Shift + B', icon: TrendingUp, onClick: () => tradeAt('buy', m.price) },
      { label: `Sell ${lot}${session.symbol} @ ${fmtPx(m.price)} ${sellType}`, shortcut: 'Alt + Shift + S', icon: TrendingDown, onClick: () => tradeAt('sell', m.price) },
      { label: `Add order on ${session.symbol} at ${fmtPx(m.price)}…`, shortcut: 'Shift + T', icon: PlusSquare, onClick: () => addOrderAt(m.price) },
    ]
    if (m.mini) return trade
    const nDraw = drawings.filter(d => d.type !== 'alert').length
    const items = []
    if (m.drawingId) {
      items.push(
        { label: 'Settings…', icon: Settings, onClick: () => setSettingsFor(drawings.find(d => d.id === m.drawingId)) },
        { label: 'Clone', icon: Copy, onClick: duplicateSelected },
        { label: 'Copy', shortcut: 'Ctrl + C', icon: Copy, onClick: copyDrawing },
        { label: 'Remove', icon: Trash2, danger: true, onClick: deleteSelected },
        { type: 'sep' },
      )
    }
    items.push(
      { label: 'Reset chart view', shortcut: 'Alt + R', icon: RotateCcw, onClick: () => chartRef.current?.fit() },
      { type: 'sep' },
      { label: `Copy price ${fmtPx(m.price)}`, onClick: () => copyPrice(m.price) },
      { label: 'Paste', shortcut: 'Ctrl + V', disabled: !clipRef.current, onClick: () => pasteDrawing(m) },
      { type: 'sep' }, ...trade, { type: 'sep' },
      { label: lockedTime != null ? 'Unlock vertical cursor line' : 'Lock vertical cursor line by time', icon: lockedTime != null ? Unlock : Lock, onClick: () => setLockedTime(lockedTime != null ? null : m.time) },
      { type: 'sep' },
      { label: 'Table view', icon: Table, onClick: () => setTableOpen(true) },
      { label: 'Object tree', icon: ListTree, onClick: () => setTreeOpen(true) },
      {
        label: 'Chart template', icon: Layers,
        children: [
          { label: 'Save chart template…', onClick: () => setNameDialog({ title: 'Save chart template', placeholder: 'Template name', onSubmit: saveChartTemplate }) },
          ...(chartTemplates.length ? [{ type: 'sep' }, ...chartTemplates.map(t => ({ label: t.name, onClick: () => applyChartTemplate(t) })), { type: 'sep' }, { label: 'Delete all templates', danger: true, onClick: () => setChartTemplates([]) }] : []),
        ],
      },
      { type: 'sep' },
    )
    if (nDraw) items.push({ label: `Remove ${nDraw} drawing${nDraw === 1 ? '' : 's'}`, onClick: clearAll })
    if (indicators.length) items.push({ label: `Remove ${indicators.length} indicator${indicators.length === 1 ? '' : 's'}`, onClick: () => changeIndicators([]) })
    if (nDraw || indicators.length) items.push({ type: 'sep' })
    items.push({ label: 'Settings…', icon: Settings, onClick: () => setSettingsOpen(true) })
    return items
  }

  const onContextMenu = (e) => {
    e.preventDefault()
    const proj = chartRef.current?.projector(), rect = svgRef.current?.getBoundingClientRect() || boxRef.current?.getBoundingClientRect()
    if (!proj || !rect || !candle) { setCtx(null); return }
    const x = e.clientX - rect.left, y = e.clientY - rect.top
    const m = proj.toMarket({ x, y }, {})
    const price = m?.price ?? candle.close
    const dEl = e.target.closest?.('[data-draw-id]')
    const drawingId = dEl?.getAttribute('data-draw-id') || null
    if (drawingId) setSelectedId(drawingId)
    setCtx({ x: e.clientX, y: e.clientY, price, time: m?.time ?? now, drawingId })
  }

  const layoutData = () => ({ tf, drawings, indicators, settings })
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
    setIndicators(d.indicators || []); if (d.settings) setSavedSettings(mergeSettings(d.settings))
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
    const hide = cs.trading.snapshots ? [] : [...(svgRef.current?.querySelectorAll('.bt-trade') || [])]
    hide.forEach(el => { el.style.display = 'none' })
    const canvas = await chartRef.current?.screenshot(svgRef.current)
    hide.forEach(el => { el.style.display = '' })
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
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'c') { if (selected) { e.preventDefault(); copyDrawing() } return }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'v') { if (clipRef.current) { e.preventDefault(); pasteDrawing(pointerRef.current) } return }
      if (k === 'Escape') { setTool('cursor'); setSelectedId(null); setSelecting(false); setTicket(null); setCtx(null); return }
      if (e.altKey) {
        const code = (e.code || '').replace('Key', '')
        const px = pointerRef.current.price
        if (!e.shiftKey && code === 'R') { e.preventDefault(); chartRef.current?.fit(); return }
        if (!e.shiftKey && code === 'A') { e.preventDefault(); addAlert(px ?? candle?.close); return }
        if (e.shiftKey && code === 'B') { e.preventDefault(); tradeAt('buy', px ?? candle?.close); return }
        if (e.shiftKey && code === 'S') { e.preventDefault(); tradeAt('sell', px ?? candle?.close); return }
        const combo = `${e.shiftKey ? 'shift+' : ''}${code}`.toLowerCase()
        const hit = Object.entries(TOOLS).find(([, t]) => t.key && t.key.toLowerCase() === combo)
        if (hit) { e.preventDefault(); setTool(hit[0]) }
      }
      if (e.shiftKey && !e.altKey && !e.ctrlKey && k.toLowerCase() === 't') { e.preventDefault(); addOrderAt(pointerRef.current.price ?? candle?.close); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── render ─────────────────────────────────────────────────────────────
  const clock = candle ? tzFmt.clock(now) : ''
  const startSec = session ? Math.floor(new Date(session.start_at).getTime() / 1000) : 0
  const endSec = session ? Math.floor(new Date(session.end_at).getTime() / 1000) : 0
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
  const reloadMsg = reload ? `Loading finer candles for the ${tfLabel(reload.tf)} chart… ${reload.pct}%` : null

  return (
    <PageWrapper flush>
      <div ref={rootRef} className="flex-1 min-h-0 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
        {/* ── top bar ──
             No overflow on this row's right side and every dropdown renders through <Popover> (a portal),
             so nothing can be clipped and no scrollbar can appear when a menu opens. */}
        <div className="flex-shrink-0 flex items-center gap-1 px-2 h-11" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            <TopBtn title="Back to session overview" onClick={() => navigate(`/backtesting/${id}`)}><ArrowLeft size={16} /></TopBtn>
            {session && (
              <div className="flex items-center gap-2 px-2 mr-1 flex-shrink-0">
                <PairIcon symbol={session.symbol} size={20} />
                <div className="leading-tight">
                  <p className="text-[13px] font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{session.symbol}</p>
                  <p className="text-[10.5px] whitespace-nowrap max-w-[150px] truncate" style={{ color: 'var(--text-muted)' }}>{session.name}</p>
                </div>
              </div>
            )}
            <div className="w-px h-5 mx-1 flex-shrink-0" style={{ background: 'var(--border-subtle)' }} />
            <TimeframeMenu value={tf} onChange={changeTf} baseTf={baseTf} favorites={favTfs} onFavorites={setFavTfs} recentCustom={customTfs} onRecentCustom={setCustomTfs} />
            <div className="w-px h-5 mx-1 flex-shrink-0" style={{ background: 'var(--border-subtle)' }} />
            <TopBtn onClick={() => setShowIndicators(true)} active={indicators.length > 0}><Activity size={15} /> Indicators{indicators.length ? ` (${indicators.length})` : ''}</TopBtn>
            <TopBtn title="Undo (Ctrl+Z)" onClick={undo} disabled={!history.current.past.length}><Undo2 size={15} /></TopBtn>
            <TopBtn title="Redo (Ctrl+Y)" onClick={redo} disabled={!history.current.future.length}><Redo2 size={15} /></TopBtn>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <div className="hidden lg:flex items-center gap-4 px-3 text-[12px] whitespace-nowrap">
              <span style={{ color: 'var(--text-muted)' }}>Balance <b className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtUsd(acct.balance)}</b></span>
              <span style={{ color: 'var(--text-muted)' }}>Equity <b className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtUsd(acct.equity)}</b></span>
              <span style={{ color: 'var(--text-muted)' }}>P&L <b className="tabular-nums" style={{ color: clr(acct.equity - (Number(session?.start_balance) || 0)) }}>{fmtUsd(acct.equity - (Number(session?.start_balance) || 0), { sign: true })}</b></span>
            </div>

            <LayoutMenu layouts={layouts} activeId={activeLayoutId} onSave={saveLayoutAs} onUpdate={updateLayout} onLoad={loadLayout} onRename={renameLayout} onDelete={deleteLayout} />

            <TopBtn title="Settings" onClick={() => setSettingsOpen(true)} active={settingsOpen}><Settings size={15} /></TopBtn>

            <TopBtn title="Save a screenshot" onClick={screenshot}><Camera size={15} /></TopBtn>
            <TopBtn title="Fullscreen" onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</TopBtn>
          </div>
        </div>

        {/* ── body ── */}
        <div className="flex-1 min-h-0 flex">
          <DrawingToolbar tool={tool} onTool={(t) => { setTool(t); setSelecting(false); if (t !== 'cursor') setSelectedId(null) }}
                          magnet={magnet} onMagnet={() => setMagnet(m => !m)} stay={stay} onStay={() => setStay(s => !s)}
                          lockAll={lockAll} onLock={() => setLockAll(l => !l)} hideAll={hideAll} onHide={() => setHideAll(h => !h)}
                          onClear={clearAll} emoji={emoji} onEmoji={pickEmoji} recentEmoji={recentEmoji} hasDrawings={drawings.length > 0} />

          <div className="flex-1 min-w-0 flex flex-col">
            <div ref={boxRef} className="flex-1 min-h-0 relative" onPointerDown={onBoxPointerDown} onContextMenu={onContextMenu} style={{ cursor: selecting ? 'crosshair' : undefined }}>
              <BacktestChart ref={chartRef} view={view} tf={tf} tfName={tfLabel(tf)} digits={digits} indicators={indicators} cs={cs} tzFmt={tzFmt}
                             symbol={session?.symbol || ''} description={description} scaleMode={scaleMode} onScaleMode={setScaleMode} marks={marks}
                             loading={loadingMsg || reloadMsg} extraPrices={extraPrices} onClosePane={(ids) => changeIndicators(indicators.filter(i => !ids.includes(i.id)))}>
                {(capi) => (<>
                  <DrawingOverlay api={capi} getPane={() => chartRef.current?.pane() || { w: 0, h: 0, x: 0 }} tfSecs={tfSecs} tfKey={tf} digits={digits}
                                  drawings={drawings} onDrawingsChange={changeDrawings} selectedId={selectedId} onSelect={setSelectedId}
                                  tool={tool} onToolChange={setTool} stayInDrawing={stay} magnet={magnet} lockAll={lockAll} hideAll={hideAll} emoji={emoji}
                                  onZoom={(r) => chartRef.current?.zoomTo(r)} trading={trading}
                                  ticket={ticket} onTicketChange={(p) => setTicket(t => (t ? { ...t, ...p } : t))}
                                  svgRef={svgRef} forwardWheelTo={forwardWheel}
                                  cs={cs} levels={levels} tzFmt={tzFmt} spec={spec} lockedTime={lockedTime} pnlText={pnlText}
                                  onCrosshair={crossHook} onPlus={(x, y, price) => setCtx({ x, y, price, time: now, mini: true })} />
                  <StatusLine cs={cs} symbol={session?.symbol || ''} description={description} tfLabel={tfLabel(tf)} spec={spec} digits={digits}
                              getBars={capi.getBars} version={capi.version} onCrosshair={crossHook} quote={candle ? quote : null}
                              marketOpen={candle ? isMarketOpen(spec, now) : true} clockSecs={now} pdc={pdc}
                              onSell={() => quickTrade('sell')} onBuy={() => quickTrade('buy')}
                              indicators={indicators} indicatorValues={() => chartRef.current?.indicatorValues()} onSettings={() => setShowIndicators(true)}
                              onToggle={(iid) => changeIndicators(indicators.map(i => (i.id === iid ? { ...i, visible: i.visible === false } : i)))}
                              onRemove={(iid) => changeIndicators(indicators.filter(i => i.id !== iid))} />
                </>)}
              </BacktestChart>

              {tableOpen && <TableView getBars={() => chartRef.current?.bars() || []} version={count} tzFmt={tzFmt} digits={digits} tfSecs={tfSecs} symbol={session?.symbol || ''} tfLabel={tfLabel(tf)} onClose={() => setTableOpen(false)} />}
              {treeOpen && (
                <ObjectTree drawings={drawings} indicators={indicators} selectedId={selectedId} digits={digits} onSelect={setSelectedId}
                            onChangeDrawing={updateDrawing} onDeleteDrawing={(did) => { changeDrawings(drawings.filter(d => d.id !== did), true); if (selectedId === did) setSelectedId(null) }}
                            onToggleIndicator={(iid) => changeIndicators(indicators.map(i => (i.id === iid ? { ...i, visible: i.visible === false } : i)))}
                            onRemoveIndicator={(iid) => changeIndicators(indicators.filter(i => i.id !== iid))} onIndicatorSettings={() => setShowIndicators(true)} onClose={() => setTreeOpen(false)} />
              )}

              {tool === 'cursor' && selected && !hideAll && (
                <DrawingStyleBar drawing={selected} onChange={updateDrawing} onDelete={deleteSelected} onDuplicate={duplicateSelected} onSettings={() => setSettingsFor(selected)} />
              )}

              {selecting && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3.5 py-2 rounded-lg text-[12.5px] font-medium"
                     style={{ background: 'rgba(139,92,246,0.95)', color: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
                  Click any candle to jump to it — forward or back · Esc to cancel
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
                       onJump={(v) => seekTo(new Date(v).getTime() / 1000)} progress={prog} atEnd={atEnd}
                       minDate={candle ? toInput(now) : undefined} maxDate={endSec ? toInput(endSec) : undefined} />

            <PositionsPanel fmtTime={tzFmt.dateTime} positions={engine?.positions || []} orders={engine?.orders || []} closed={engine?.closed || []} digits={digits}
                            pnlOf={pnlOf} onClose={closePosition} onCloseAll={closeAllPositions} onCancelOrder={cancelOrder} floating={acct.floating} />
          </div>

          <div className="hidden md:block flex-shrink-0">
            <OrderPanel ref={orderRef} symbol={session?.symbol || ''} spec={spec} digits={digits} quote={quote} ready={!!candle && phase === 'ready'}
                        ticket={ticket} onTicket={setTicket} suggest={suggest} projectTicketPnl={trading.projectTicketPnl}
                        ticketMargin={(t) => marginUsd(spec, t.lots, t.entry || candle?.close || 0, session?.leverage || 100)}
                        onConfirm={confirmTicket} stats={stats} account={acct} openCount={engine?.positions?.length || 0} />
          </div>
        </div>
      </div>

      {settingsOpen && (
        <ChartSettingsDialog settings={settings} isDark={isDark} symbol={session?.symbol || ''} appHour12={timeFormat !== '24h'}
                             templates={settingsTemplates} getRatio={() => chartRef.current?.currentRatio() || 0}
                             onPreview={(d) => setPreview(d)}
                             onApply={(d) => { setSavedSettings(d); setPreview(null); setSettingsOpen(false) }}
                             onCancel={() => { setPreview(null); setSettingsOpen(false) }}
                             onSaveTemplate={(name, d) => setSettingsTemplates([...settingsTemplates.filter(t => t.name !== name), { name, settings: clone(d) }])}
                             onDeleteTemplate={(name) => setSettingsTemplates(settingsTemplates.filter(t => t.name !== name))} />
      )}
      {ctx && <ChartContextMenu x={ctx.x} y={ctx.y} items={buildMenu(ctx)} onClose={() => setCtx(null)} />}
      {rewindAsk && <RewindConfirm clock={tzFmt.clock(rewindAsk.T)} summary={rewindAsk.result.summary}
                                   onCancel={() => setRewindAsk(null)} onConfirm={() => { applyRewind(rewindAsk.T, rewindAsk.result); setRewindAsk(null) }} />}
      {nameDialog && <NameDialog {...nameDialog} onClose={() => setNameDialog(null)} />}
      {showIndicators && <IndicatorsDialog indicators={indicators} onChange={changeIndicators} onClose={() => setShowIndicators(false)} />}
      {settingsFor && (
        <DrawingSettingsDialog drawing={settingsFor} digits={digits} onClose={() => setSettingsFor(null)}
                               onApply={(d) => { updateDrawing(d); setSettingsFor(null) }} />
      )}
    </PageWrapper>
  )
}