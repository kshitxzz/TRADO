// ─────────────────────────────────────────────────────────────────────────
// Backtesting — data layer (no React).
//
//  • A session loads ONE series: 1-minute candles. Every other timeframe is computed
//    from it (see aggregate.js), so timeframes can never disagree and the forming
//    candle only contains minutes up to the replay clock (no look-ahead).
//  • Forex / metals / energy → the Trado market-data store (Dukascopy bid candles,
//    ingested once; see candleStore.js). Crypto → Binance spot 1m, which is the real
//    exchange's own data.
//  • Nothing is ever approximated: when verified data is missing the app says so.
//  • Higher timeframes get deep history from hourly bars folded from the same 1m data.
// ─────────────────────────────────────────────────────────────────────────

import { loadCandles } from '../loadCandles'
import { normaliseSymbol, resolveBinanceSymbol } from '../binanceDirect'
import { cleanCandles, ANCHOR_NY17, ANCHOR_UTC, BASE_SECS } from './aggregate'
import { StoreError, coverage, loadStoreCandles, loadStoreHourly, idbGet, idbSet } from './candleStore'

export * from './aggregate'
export { StoreError }

// ── Sizing ───────────────────────────────────────────────────────────────
const WARMUP_SECS = 7 * 86400          // 1m history shown before the start date (a full trading week for minute charts)
const HIST_SECS = 180 * 86400          // hourly history before that, for 1h and higher charts
export const MAX_BASE_CANDLES = 60000
// A long session cannot hold every 1m candle, so it is loaded as a WINDOW around the replay position and extended as the
// replay moves on. WINDOW_CANDLES is both the first window and each extension.
export const WINDOW_CANDLES = 20000
const CHUNK_BARS = 1400                // crypto requests stay under Binance's per-request cap

const floorTo = (t, step) => Math.floor(t / step) * step

/** Range → number of 1m candles to load (incl. warm-up), counting calendar minutes (markets that close load fewer). */
export const plannedCandles = (startSec, endSec) => Math.ceil((endSec - startSec + WARMUP_SECS) / BASE_SECS)

/** Window of 1m candles around the market moment `clockSec`: history to the left, then as much future as fits. */
export function planWindow(clockSec, endSec) {
  const fromSec = floorTo(clockSec - WARMUP_SECS, 86400)
  const histBars = Math.ceil((clockSec - fromSec) / BASE_SECS)
  const toSec = Math.min(endSec, clockSec + Math.max(WINDOW_CANDLES - histBars, WINDOW_CANDLES / 2) * BASE_SECS)
  return { fromSec, toSec, more: toSec < endSec }
}

// ── Symbols ──────────────────────────────────────────────────────────────
export const SYMBOL_CATALOG = [
  { group: 'Forex Majors',  items: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD'] },
  { group: 'Forex Crosses', items: ['EURGBP', 'EURJPY', 'GBPJPY', 'EURAUD', 'GBPAUD', 'AUDJPY'] },
  { group: 'Metals',        items: ['XAUUSD', 'XAGUSD'] },
  { group: 'Energy',        items: ['WTIUSD', 'BRENTUSD', 'NATGAS'] },
  { group: 'Crypto',        items: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'LINKUSDT'] },
]

export function searchSymbols(query = '') {
  const q = query.trim().toUpperCase()
  return SYMBOL_CATALOG
    .map(g => ({ group: g.group, items: g.items.filter(s => !q || s.includes(q)) }))
    .filter(g => g.items.length)
}

// Broker names (MT5 decorates them) → the store's canonical symbol.
const ALIASES = {
  GOLD: 'XAUUSD', SILVER: 'XAGUSD',
  USOIL: 'WTIUSD', XTIUSD: 'WTIUSD', USOUSD: 'WTIUSD', WTI: 'WTIUSD',
  UKOIL: 'BRENTUSD', XBRUSD: 'BRENTUSD', UKOUSD: 'BRENTUSD', BRENT: 'BRENTUSD',
  NGAS: 'NATGAS', XNGUSD: 'NATGAS',
}
const STORE_SYMBOLS = new Set(SYMBOL_CATALOG.filter(g => !/Crypto/.test(g.group)).flatMap(g => g.items))

/** → { kind: 'crypto' | 'store', symbol } or null when no feed exists for it. */
export function feedFor(raw) {
  const sym = normaliseSymbol(raw)
  if (!sym) return null
  const b = resolveBinanceSymbol(sym)
  if (b?.market === 'spot') return { kind: 'crypto', symbol: sym }
  const canon = ALIASES[sym] || sym
  return STORE_SYMBOLS.has(canon) ? { kind: 'store', symbol: canon } : null
}

/** Where a symbol's daily/weekly candles start: crypto at 00:00 UTC; everything else at the 17:00 New York close. */
export const anchorFor = (raw) => (feedFor(raw)?.kind === 'crypto' ? ANCHOR_UTC : ANCHOR_NY17)

/** Static description shown under the symbol field. */
export function describeSource(raw) {
  const f = feedFor(raw)
  if (!f) return normaliseSymbol(raw) ? { ok: false, note: 'No verified data feed for this symbol.' } : null
  return f.kind === 'crypto'
    ? { ok: true, note: 'Binance spot — the exchange’s own 1-minute candles. Days start 00:00 UTC.' }
    : { ok: true, note: 'Dukascopy bid candles from the Trado data store. Daily candles close 17:00 New York, like MT5 and TradingView forex.' }
}
export const isSupportedSymbol = (raw) => !!feedFor(raw)

/** Async check that the store really has data for a symbol → { ok, note, first, last }. Crypto needs no store. */
export async function sessionCoverage(raw) {
  const f = feedFor(raw)
  if (!f) return { ok: false, note: 'No verified data feed for this symbol.' }
  if (f.kind === 'crypto') return { ok: true, note: 'Binance spot 1-minute candles.', first: null, last: null }
  try {
    const c = await coverage(f.symbol)
    if (!c) return { ok: false, note: `No verified ${f.symbol} data in the store yet — ingest it first (tools/data-store/README.md).` }
    return { ok: true, first: c.first, last: c.last, note: `Verified Dukascopy ${c.priceType} candles · ${new Date(c.first * 1000).toISOString().slice(0, 10)} → ${new Date(c.last * 1000).toISOString().slice(0, 10)}` }
  } catch (e) {
    return { ok: false, note: e.message || 'The market-data store could not be reached.' }
  }
}

// ── Crypto (Binance spot) ────────────────────────────────────────────────
const MEM = new Map()
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchChunk(symbol, interval, from, to, tries = 3) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      const { candles } = await loadCandles({ symbol, interval, from, to })
      return candles
    } catch (e) {
      lastErr = e
      if (i < tries - 1) await sleep(e?.status === 429 ? 8000 * (i + 1) : 600)
    }
  }
  throw lastErr
}

async function loadCrypto({ symbol, interval, from, to, onProgress, signal }) {
  const step = interval === '1h' ? 3600 : BASE_SECS
  const key = `v2|${symbol}|${interval}|${from}|${to}`
  const mem = MEM.get(key)
  if (mem) return mem
  const stored = await idbGet(key)
  if (Array.isArray(stored) && stored.length) { MEM.set(key, stored); return stored }

  const windows = []
  for (let a = from; a <= to; a += CHUNK_BARS * step) windows.push([a, Math.min(to, a + CHUNK_BARS * step - step)])
  const total = Math.ceil((to - from) / step) + 1
  const parts = new Array(windows.length)
  let done = 0, next = 0
  const worker = async () => {
    while (next < windows.length) {
      if (signal?.aborted) return
      const i = next++
      parts[i] = await fetchChunk(symbol, interval, windows[i][0], windows[i][1])
      done += parts[i].length
      onProgress?.({ loaded: Math.min(done, total), total })
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const { candles } = cleanCandles(parts.flat())
  if (candles.length) { MEM.set(key, candles); idbSet(key, candles) }
  return candles
}

// ── Loader ───────────────────────────────────────────────────────────────
/**
 * Load the 1-minute candles for a session: [start − warm-up, end] — or, when `fromSec` / `toSec` are given, just that window
 * (see planWindow). Also loads the hourly history before it (`history: false` skips that, e.g. when extending a window).
 * @returns {{ base: Candle[], baseSecs: 60, startIndex, hist: Candle[], feed }}
 */
export async function loadSessionData({ symbol, startSec, endSec, fromSec, toSec, onProgress, signal, history = true }) {
  const feed = feedFor(symbol)
  if (!feed) { const e = new Error(`No verified data feed for ${normaliseSymbol(symbol) || symbol}.`); e.code = 'NO_FEED'; throw e }

  const windowed = fromSec != null
  const from = floorTo(windowed ? fromSec : startSec - WARMUP_SECS, 86400)           // day-aligned: caches are reused, and hour-aligned for the history seam
  const to = Math.min(floorTo(windowed ? toSec : endSec, BASE_SECS), floorTo(Date.now() / 1000, BASE_SECS))
  const total = Math.ceil((to - from) / BASE_SECS) + 1
  if (total > MAX_BASE_CANDLES) {
    const e = new Error(`That range needs about ${total.toLocaleString()} 1m candles (max ${MAX_BASE_CANDLES.toLocaleString()}). Shorten the dates.`)
    e.code = 'TOO_LARGE'; throw e
  }

  let base
  if (feed.kind === 'store') {
    base = await loadStoreCandles(feed.symbol, from, to, { signal, onProgress: ({ done, total: n }) => onProgress?.({ loaded: Math.round(total * done / n), total }) })
  } else {
    base = await loadCrypto({ symbol: feed.symbol, interval: '1m', from, to, onProgress, signal })
  }
  if (!base.length) {
    const e = new Error(`No ${feed.symbol} price data in that period.`)
    e.code = 'NO_DATA'; throw e
  }

  let hist = []
  if (history) {
    const hFrom = from - HIST_SECS
    try {
      if (feed.kind === 'store') hist = await loadStoreHourly(feed.symbol, hFrom, from, { signal })
      else hist = (await loadCrypto({ symbol: feed.symbol, interval: '1h', from: hFrom, to: from - 3600, signal })).filter(b => b.time + 3600 <= from)
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      if (e?.code !== 'NO_DATA') throw e                  // "no history before the data starts" is fine; a broken store is not
    }
  }
  const startIdx = (windowed ? fromSec : startSec)
  const i = base.findIndex(c => c.time + BASE_SECS >= startIdx)
  return { base, baseSecs: BASE_SECS, startIndex: i < 0 ? base.length : i, hist, feed }
}