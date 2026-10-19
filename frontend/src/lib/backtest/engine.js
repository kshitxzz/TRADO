// ─────────────────────────────────────────────────────────────────────────
// Backtesting engine — pure functions, no React, no network.
//
// Rules (candle data has no tick order, so these are deliberately conservative):
//   • Market orders fill at the CURRENT candle's close: buys at ask, sells at bid.
//     ask = bid + spread.
//   • Longs exit at bid, shorts exit at ask.
//   • If a candle touches both SL and TP, the STOP LOSS is assumed to hit first.
//   • If a candle OPENS beyond a stop/limit level (a gap), the fill is at the open,
//     not at the level.
//   • A pending order that fills inside a candle can only be stopped out by that same
//     candle (worst case); its take-profit is evaluated from the next candle on.
//   • Equity ≤ 0 closes everything (stop-out).
// ─────────────────────────────────────────────────────────────────────────

import { pnlUsd, marginUsd, normaliseLots } from './specs'

let _id = 0
const uid = (p) => `${p}_${Date.now().toString(36)}_${(++_id).toString(36)}`
const round = (n, d = 8) => Number(Number(n).toFixed(d))

export function createState({ balance = 10000, leverage = 100, spread = 0 } = {}) {
  return { startBalance: balance, balance, leverage, spread, positions: [], orders: [], closed: [] }
}

/** Rebuild engine state from persisted rows (open positions + pending orders + closed trades). */
export function hydrateState(base, { positions = [], orders = [], closed = [] } = {}) {
  const realised = closed.reduce((s, t) => s + (Number(t.pnl) || 0), 0)
  return { ...base, balance: round(base.startBalance + realised, 2), positions, orders, closed }
}

export const bidOf = (candle) => candle.close
export const askOf = (candle, spread) => candle.close + spread

// ── Marks / account numbers ──────────────────────────────────────────────
export function positionPnl(spec, pos, candle, spread) {
  const price = pos.side === 'buy' ? bidOf(candle) : askOf(candle, spread)
  const diff = pos.side === 'buy' ? price - pos.entry : pos.entry - price
  return pnlUsd(spec, pos.lots, diff, price)
}

export function account(state, spec, candle) {
  const floating = candle
    ? state.positions.reduce((s, p) => s + positionPnl(spec, p, candle, state.spread), 0)
    : 0
  const equity = state.balance + floating
  const margin = candle
    ? state.positions.reduce((s, p) => s + marginUsd(spec, p.lots, p.entry, state.leverage), 0)
    : 0
  return {
    balance: state.balance,
    floating,
    equity,
    margin,
    freeMargin: equity - margin,
    marginLevel: margin > 0 ? (equity / margin) * 100 : null,
  }
}

// ── Validation helpers ───────────────────────────────────────────────────
function checkLevels(side, ref, sl, tp) {
  if (sl != null && (side === 'buy' ? sl >= ref : sl <= ref)) {
    return side === 'buy' ? 'Stop loss must be below the entry price for a buy.' : 'Stop loss must be above the entry price for a sell.'
  }
  if (tp != null && (side === 'buy' ? tp <= ref : tp >= ref)) {
    return side === 'buy' ? 'Take profit must be above the entry price for a buy.' : 'Take profit must be below the entry price for a sell.'
  }
  return null
}

const numOrNull = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) || Number(v) <= 0 ? null : Number(v))

// ── Orders ───────────────────────────────────────────────────────────────
/** @returns {{ state, position?, error? }} */
export function openMarket(state, spec, { side, lots, sl, tp }, candle, now) {
  if (!(Number(lots) > 0)) return { state, error: 'Enter a volume.' }
  const vol = normaliseLots(spec, lots)
  const entry = side === 'buy' ? askOf(candle, state.spread) : bidOf(candle)
  const slv = numOrNull(sl), tpv = numOrNull(tp)
  const bad = checkLevels(side, entry, slv, tpv)
  if (bad) return { state, error: bad }

  const acc = account(state, spec, candle)
  const need = marginUsd(spec, vol, entry, state.leverage)
  if (need > acc.freeMargin) {
    return { state, error: `Not enough free margin — needs $${need.toFixed(2)}, you have $${Math.max(0, acc.freeMargin).toFixed(2)}.` }
  }

  const position = { id: uid('pos'), side, lots: vol, entry: round(entry), sl: slv, tp: tpv, openedAt: now }
  return { state: { ...state, positions: [...state.positions, position] }, position }
}

export function placePending(state, spec, { side, type, price, lots, sl, tp }, candle, now) {
  if (!(Number(lots) > 0)) return { state, error: 'Enter a volume.' }
  const vol = normaliseLots(spec, lots)
  const px = numOrNull(price)
  if (px == null) return { state, error: 'Enter an entry price.' }
  const ask = askOf(candle, state.spread), bid = bidOf(candle)
  if (side === 'buy'  && type === 'limit' && px >= ask) return { state, error: 'A buy limit must be below the current ask.' }
  if (side === 'buy'  && type === 'stop'  && px <= ask) return { state, error: 'A buy stop must be above the current ask.' }
  if (side === 'sell' && type === 'limit' && px <= bid) return { state, error: 'A sell limit must be above the current bid.' }
  if (side === 'sell' && type === 'stop'  && px >= bid) return { state, error: 'A sell stop must be below the current bid.' }
  const slv = numOrNull(sl), tpv = numOrNull(tp)
  const bad = checkLevels(side, px, slv, tpv)
  if (bad) return { state, error: bad }

  const order = { id: uid('ord'), side, type, price: round(px), lots: vol, sl: slv, tp: tpv, createdAt: now }
  return { state: { ...state, orders: [...state.orders, order] }, order }
}

export function modifyPosition(state, id, { sl, tp }) {
  const pos = state.positions.find(p => p.id === id)
  if (!pos) return { state, error: 'Position not found.' }
  const nextSl = sl === undefined ? pos.sl : numOrNull(sl)
  const nextTp = tp === undefined ? pos.tp : numOrNull(tp)
  const bad = checkLevels(pos.side, pos.entry, nextSl, nextTp)
  if (bad) return { state, error: bad }
  return { state: { ...state, positions: state.positions.map(p => (p.id === id ? { ...p, sl: nextSl, tp: nextTp } : p)) } }
}

export function modifyOrder(state, id, patch) {
  const ord = state.orders.find(o => o.id === id)
  if (!ord) return { state, error: 'Order not found.' }
  const next = {
    ...ord,
    price: patch.price === undefined ? ord.price : numOrNull(patch.price) ?? ord.price,
    sl: patch.sl === undefined ? ord.sl : numOrNull(patch.sl),
    tp: patch.tp === undefined ? ord.tp : numOrNull(patch.tp),
  }
  const bad = checkLevels(next.side, next.price, next.sl, next.tp)
  if (bad) return { state, error: bad }
  return { state: { ...state, orders: state.orders.map(o => (o.id === id ? next : o)) } }
}

export const cancelOrder = (state, id) => ({ ...state, orders: state.orders.filter(o => o.id !== id) })

function closeAt(state, spec, pos, exit, now, reason) {
  const diff = pos.side === 'buy' ? exit - pos.entry : pos.entry - exit
  const pnl = round(pnlUsd(spec, pos.lots, diff, exit), 2)
  const trade = {
    id: pos.id, side: pos.side, lots: pos.lots, entry: pos.entry, exit: round(exit),
    sl: pos.sl, tp: pos.tp, openedAt: pos.openedAt, closedAt: now, pnl, reason,
  }
  return {
    trade,
    state: {
      ...state,
      balance: round(state.balance + pnl, 2),
      positions: state.positions.filter(p => p.id !== pos.id),
      closed: [...state.closed, trade],
    },
  }
}

/** Close one position at the current candle (longs at bid, shorts at ask). */
export function closePosition(state, spec, id, candle, now, reason = 'manual') {
  const pos = state.positions.find(p => p.id === id)
  if (!pos) return { state }
  const exit = pos.side === 'buy' ? bidOf(candle) : askOf(candle, state.spread)
  return closeAt(state, spec, pos, exit, now, reason)
}

export function closeAll(state, spec, candle, now, reason = 'manual') {
  let s = state
  const trades = []
  for (const p of state.positions) {
    const r = closePosition(s, spec, p.id, candle, now, reason)
    s = r.state
    if (r.trade) trades.push(r.trade)
  }
  return { state: s, trades }
}

// ── The per-candle step ──────────────────────────────────────────────────
/**
 * Advance the account through ONE newly revealed candle.
 * `candle.time` is its open; `now` is its close (the new market clock).
 * @returns {{ state, events: Array<{type:'filled'|'closed', ...}> }}
 */
export function processCandle(state, spec, candle, now) {
  const { spread } = state
  const events = []
  let s = state

  // 1 ── pending orders that trigger inside this candle
  const justFilled = new Set()
  for (const o of state.orders) {
    let fill = null
    if (o.side === 'buy') {
      const askOpen = candle.open + spread, askLow = candle.low + spread, askHigh = candle.high + spread
      if (o.type === 'limit' && askLow <= o.price) fill = Math.min(o.price, askOpen)
      if (o.type === 'stop'  && askHigh >= o.price) fill = Math.max(o.price, askOpen)
    } else {
      if (o.type === 'limit' && candle.high >= o.price) fill = Math.max(o.price, candle.open)
      if (o.type === 'stop'  && candle.low <= o.price) fill = Math.min(o.price, candle.open)
    }
    if (fill == null) continue

    const acc = account(s, spec, candle)
    const need = marginUsd(spec, o.lots, fill, s.leverage)
    s = { ...s, orders: s.orders.filter(x => x.id !== o.id) }
    if (need > acc.freeMargin) { events.push({ type: 'rejected', order: o, reason: 'margin' }); continue }
    const position = { id: o.id, side: o.side, lots: o.lots, entry: round(fill), sl: o.sl, tp: o.tp, openedAt: now }
    s = { ...s, positions: [...s.positions, position] }
    justFilled.add(position.id)
    events.push({ type: 'filled', position, from: 'pending' })
  }

  // 2 ── SL / TP on open positions
  for (const p of [...s.positions]) {
    const fresh = justFilled.has(p.id)
    let exit = null, reason = null

    if (p.side === 'buy') {
      // exits at bid = raw candle prices
      if (p.sl != null && candle.low <= p.sl)  { exit = Math.min(p.sl, candle.open); reason = 'sl' }
      else if (!fresh && p.tp != null && candle.high >= p.tp) { exit = Math.max(p.tp, candle.open); reason = 'tp' }
    } else {
      // exits at ask = raw + spread
      const aHigh = candle.high + spread, aLow = candle.low + spread, aOpen = candle.open + spread
      if (p.sl != null && aHigh >= p.sl)       { exit = Math.max(p.sl, aOpen); reason = 'sl' }
      else if (!fresh && p.tp != null && aLow <= p.tp) { exit = Math.min(p.tp, aOpen); reason = 'tp' }
    }
    if (exit == null) continue
    const r = closeAt(s, spec, p, exit, now, reason)
    s = r.state
    events.push({ type: 'closed', trade: r.trade })
  }

  // 3 ── stop-out
  if (s.positions.length) {
    const acc = account(s, spec, candle)
    if (acc.equity <= 0) {
      const r = closeAll(s, spec, candle, now, 'stopout')
      s = r.state
      r.trades.forEach(t => events.push({ type: 'closed', trade: t }))
      events.push({ type: 'stopout' })
    }
  }

  return { state: s, events }
}

/** Plan P&L if price reaches `price` (used by the order panel and the on-chart handles). */
export function projectPnl(spec, { side, lots, entry }, price) {
  const diff = side === 'buy' ? price - entry : entry - price
  return pnlUsd(spec, lots, diff, price)
}