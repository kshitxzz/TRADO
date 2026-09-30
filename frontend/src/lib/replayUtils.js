// ─────────────────────────────────────────────────────────────────────────
// Trade Replay — pure helpers (no React, no chart library).
// ─────────────────────────────────────────────────────────────────────────

export const TIMEFRAMES = [
  { key: '1m',  label: '1m',  secs: 60 },
  { key: '5m',  label: '5m',  secs: 300 },
  { key: '15m', label: '15m', secs: 900 },
  { key: '1h',  label: '1h',  secs: 3600 },
  { key: '4h',  label: '4h',  secs: 14400 },
  { key: '1d',  label: 'D',   secs: 86400 },
]
export const DEFAULT_TIMEFRAME = '15m'

export const SPEEDS = [0.25, 0.5, 1, 2, 4]
export const BASE_TICK_MS = 400          // one candle per 400ms at 1x

// Candles fetched around the trade (before the entry / after the exit).
export const WINDOW_BEFORE = 40
export const WINDOW_AFTER  = 20
// Replay shape: how many candles are already on screen when Play is pressed,
// and how many candles keep playing after the exit before it stops.
export const START_LEAD = 12
export const END_TRAIL  = 5
// Overview (before Play): padding around the entry→exit span — ~25 minutes of
// market time, but never fewer than 2 candles (so 5m ≈ 5 candles, 15m ≈ 2).
export const VIEW_PAD_SECS = 25 * 60
export const VIEW_PAD_MIN_CANDLES = 2

export const REPLAY_BAR_SPACING = 22

export const tfByKey = (key) => TIMEFRAMES.find(t => t.key === key) || TIMEFRAMES[2]

// ── Trades ───────────────────────────────────────────────────────────────
const toSecs = (iso) => Math.floor(new Date(iso).getTime() / 1000)

export function normalizeTrade(t) {
  const isLong = ['long', 'buy'].includes(String(t.side || '').toLowerCase())
  const entryTs = toSecs(t.opened_at || t.closed_at)
  const exitTs  = toSecs(t.closed_at || t.opened_at)
  const num = (v) => (v == null || v === '' ? null : Number(v))
  return {
    id: t.id,
    symbol: t.symbol,
    side: isLong ? 'long' : 'short',
    entryPrice: num(t.entry_price),
    exitPrice: num(t.exit_price),
    size: num(t.size) || 0,
    pnl: num(t.pnl) || 0,
    entryTs,
    exitTs: Math.max(exitTs, entryTs),
    durationSec: t.duration_seconds != null ? Number(t.duration_seconds) : Math.max(0, exitTs - entryTs),
    closedAt: t.closed_at,
    openedAt: t.opened_at,
  }
}

/** Closed trades that actually have what a replay needs, newest first. */
export function replayableTrades(trades = [], limit = 100) {
  return trades
    .filter(t => t.status === 'closed' && t.closed_at && t.entry_price != null && t.exit_price != null)
    .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))
    .slice(0, limit)
    .map(normalizeTrade)
}

// ── Candle window / indices ──────────────────────────────────────────────
const floorTo = (ts, step) => Math.floor(ts / step) * step

export function replayWindow(trade, tf) {
  return {
    from: floorTo(trade.entryTs, tf.secs) - WINDOW_BEFORE * tf.secs,
    to:   floorTo(trade.exitTs,  tf.secs) + WINDOW_AFTER  * tf.secs + (tf.secs - 1),
  }
}

/** Index of the candle containing `ts` (last candle opening at/before it). */
export function candleIndexAt(candles, ts) {
  if (!candles.length) return -1
  let lo = 0, hi = candles.length - 1, ans = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (candles[mid].time <= ts) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans
}

/**
 * Everything the player needs, derived once per (trade, candles):
 *   startCount — candles shown when Play is pressed
 *   endCount   — candles shown when the trade is "completed"
 *   view       — logical range for the not-playing overview
 */
export function buildReplayPlan(candles, trade, tfSecs = 900) {
  if (!candles.length) return null
  const entryIdx = candleIndexAt(candles, trade.entryTs)
  const exitIdx  = Math.max(entryIdx, candleIndexAt(candles, trade.exitTs))
  const total = candles.length
  const pad = Math.max(VIEW_PAD_MIN_CANDLES, Math.round(VIEW_PAD_SECS / tfSecs))
  return {
    total,
    entryIdx,
    exitIdx,
    startCount: Math.max(1, Math.min(total, entryIdx - START_LEAD + 1)),
    endCount:   Math.min(total, exitIdx + END_TRAIL + 1),
    view: { from: Math.max(0, entryIdx - pad), to: Math.min(total - 1, exitIdx + pad) },
  }
}

// ── Money / price formatting ─────────────────────────────────────────────
export function fmtPnl(n, { sign = true } = {}) {
  const v = Number(n) || 0
  const body = '$' + Math.abs(v).toFixed(2)
  if (v < 0) return '-' + body
  return (sign && v > 0 ? '+' : '') + body
}

const decimalsOf = (n) => {
  if (n == null || !Number.isFinite(n)) return 0
  const s = String(n)
  return s.includes('.') ? s.split('.')[1].length : 0
}

/** Price decimals for the axis / labels. */
export function pricePrecision(symbol = '', ...refs) {
  const s = symbol.toUpperCase()
  const ref = refs.find(r => Number.isFinite(r)) ?? 1
  let base
  if (/^[A-Z]{6}$/.test(s) && s.endsWith('JPY')) base = 3
  else if (ref >= 100) base = 2
  else if (ref >= 10) base = 3
  else if (ref >= 1) base = 5
  else base = 6
  const seen = Math.max(...refs.map(decimalsOf), 0)
  return Math.min(6, Math.max(base, Math.min(seen, 6)))
}

export const fmtPrice = (n, prec = 2) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: prec, maximumFractionDigits: prec })

// ── Live P&L while the trade is open ─────────────────────────────────────
/**
 * P&L per 1.0 of price move, learnt from the trade's own realised result —
 * this bakes in lot size × contract size for any instrument without a lookup
 * table. Falls back to a rough per-symbol guess when entry ≈ exit.
 */
export function pnlPerPoint(trade) {
  const dir = trade.side === 'long' ? 1 : -1
  const move = (trade.exitPrice - trade.entryPrice) * dir
  if (Math.abs(move) > 1e-9 && Number.isFinite(trade.pnl) && trade.pnl !== 0) {
    const k = trade.pnl / move
    if (Number.isFinite(k) && k > 0) return k
  }
  const s = trade.symbol.toUpperCase()
  if (s.startsWith('XAU')) return trade.size * 100
  if (s.startsWith('XAG')) return trade.size * 5000
  if (s.includes('WTI') || s.includes('OIL')) return trade.size * 1000
  if (/^[A-Z]{6}$/.test(s)) return trade.size * 100000
  return trade.size
}

export function livePnl(trade, price) {
  const dir = trade.side === 'long' ? 1 : -1
  return (price - trade.entryPrice) * dir * pnlPerPoint(trade)
}

// ── Time labels (browser-local, matching Day View) ───────────────────────
const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const time12 = (d) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

/** "Sep 3 at 09:20 PM" — the market time once this candle has closed. */
export function fmtReplayClock(candle, tfSecs) {
  if (!candle) return ''
  if (tfSecs >= 86400) {
    const d = new Date(candle.time * 1000)
    return `${MONTH[d.getMonth()]} ${d.getDate()}`
  }
  const d = new Date((candle.time + tfSecs) * 1000)
  return `${MONTH[d.getMonth()]} ${d.getDate()} at ${time12(d)}`
}

/** Chart axis labels — LWC works in UTC, so format in the viewer's zone. */
export function fmtAxisTick(unixSecs, tfSecs, isDayBoundary) {
  const d = new Date(unixSecs * 1000)
  if (tfSecs >= 86400) return `${MONTH[d.getMonth()]} ${d.getDate()}`
  if (isDayBoundary) return `${MONTH[d.getMonth()]} ${d.getDate()}`
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false })
}

export function fmtCrosshairTime(unixSecs, tfSecs) {
  const d = new Date(unixSecs * 1000)
  if (tfSecs >= 86400) return `${MONTH[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
  return `${MONTH[d.getMonth()]} ${d.getDate()}  ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}