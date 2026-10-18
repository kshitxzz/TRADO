// ─────────────────────────────────────────────────────────────────────────
// Backtesting — data layer (no React).
//
//  • The session is loaded ONCE at its finest ("base") timeframe.
//  • Every higher timeframe is built locally from those base candles, so
//    switching timeframe mid-replay costs no network and — crucially — the
//    forming candle only contains data up to the replay clock (no look-ahead).
//  • Candles are cached in the browser (memory + IndexedDB). Nothing is stored
//    in Supabase, which keeps free-tier egress flat.
// ─────────────────────────────────────────────────────────────────────────

import { loadCandles } from '../loadCandles'
import { normaliseSymbol, resolveBinanceSymbol, resolveBinanceForex } from '../binanceDirect'

export const TIMEFRAMES = [
  { key: '1m',  label: '1m',  secs: 60 },
  { key: '5m',  label: '5m',  secs: 300 },
  { key: '15m', label: '15m', secs: 900 },
  { key: '30m', label: '30m', secs: 1800 },
  { key: '1h',  label: '1h',  secs: 3600 },
  { key: '4h',  label: '4h',  secs: 14400 },
  { key: '1d',  label: 'D',   secs: 86400 },
]
export const tfSecs = (key) => (TIMEFRAMES.find(t => t.key === key) || TIMEFRAMES[2]).secs
export const tfLabel = (key) => (TIMEFRAMES.find(t => t.key === key) || TIMEFRAMES[2]).label

/** Finest timeframes a session can be loaded at (what the data feeds serve natively). */
export const BASE_TFS = ['1m', '5m', '15m', '1h']

// History shown to the left of the start date, per base timeframe.
const WARMUP_SECS = { '1m': 2 * 86400, '5m': 10 * 86400, '15m': 30 * 86400, '1h': 180 * 86400 }
export const MAX_BASE_CANDLES = 60000
const CHUNK_BARS = 1400   // stays under every provider's per-request cap

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

/** Where a symbol's candles come from and what to expect — shown under the symbol field. */
export function describeSource(raw) {
  const sym = normaliseSymbol(raw)
  if (!sym) return null
  const b = resolveBinanceSymbol(sym)
  if (b?.market === 'futures') return { ok: true, note: 'Binance futures feed — gold & silver history starts Jan 2026, crude & gas Apr 2026.' }
  if (b?.market === 'spot')    return { ok: true, note: 'Binance spot feed — years of history, free.' }
  if (/^[A-Z]{6}$/.test(sym)) {
    return resolveBinanceForex(sym)
      ? { ok: true, note: 'Forex feed (Twelve Data), with a Binance fallback for this pair. Free-plan limits apply.' }
      : { ok: true, note: 'Forex feed (Twelve Data). Free-plan limits apply — use 15m or 1h for long ranges.' }
  }
  return { ok: false, note: 'No data feed for this symbol yet.' }
}

export const isSupportedSymbol = (raw) => !!describeSource(raw)?.ok

// ── Time-grid helpers ────────────────────────────────────────────────────
const floorTo = (t, step) => Math.floor(t / step) * step

/** Range → number of base candles to load (incl. warm-up). */
export function plannedCandles(baseKey, startSec, endSec) {
  const step = tfSecs(baseKey)
  return Math.ceil((endSec - startSec + WARMUP_SECS[baseKey]) / step)
}

// ── Aggregation without look-ahead ───────────────────────────────────────
/**
 * Index of the bucket layout of `base` candles into `tfSecs`-wide bars.
 * bars[i] = the FULL bar; starts[i] = index of its first base candle;
 * bucketOf[j] = bar index containing base candle j.
 */
export function buildTfIndex(base, tf) {
  const step = tfSecs(tf)
  const bars = [], starts = []
  const bucketOf = new Int32Array(base.length)
  let cur = null
  for (let j = 0; j < base.length; j++) {
    const c = base[j]
    const t = floorTo(c.time, step)
    if (!cur || cur.time !== t) {
      cur = { time: t, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 }
      bars.push(cur); starts.push(j)
    } else {
      if (c.high > cur.high) cur.high = c.high
      if (c.low < cur.low) cur.low = c.low
      cur.close = c.close
      cur.volume += c.volume || 0
    }
    bucketOf[j] = bars.length - 1
  }
  return { tf, step, bars, starts, bucketOf }
}

/**
 * Bars visible when `count` base candles are revealed: all completed bars,
 * plus the forming bar built ONLY from revealed base candles.
 */
export function barsAt(base, idx, count) {
  if (count <= 0) return []
  const last = Math.min(count, base.length) - 1
  const b = idx.bucketOf[last]
  const out = idx.bars.slice(0, b)           // completed (their data ends before `last`'s bucket)
  out.push(partialBar(base, idx, b, last))
  return out
}

/** The bar `b`, aggregated from its first base candle up to base index `last` (inclusive). */
export function partialBar(base, idx, b, last) {
  const s = idx.starts[b]
  const first = base[s]
  const bar = { time: idx.bars[b].time, open: first.open, high: first.high, low: first.low, close: first.close, volume: first.volume || 0 }
  for (let j = s + 1; j <= last; j++) {
    const c = base[j]
    if (c.high > bar.high) bar.high = c.high
    if (c.low < bar.low) bar.low = c.low
    bar.close = c.close
    bar.volume += c.volume || 0
  }
  return bar
}

/**
 * How many base candles to step so the chart's own timeframe advances by one bar:
 * mid-bar → finish the forming bar; on a bar boundary → one whole new bar.
 */
export function candlesToNextBar(idx, count, baseLen) {
  if (count >= baseLen) return 0
  const nb = idx.bucketOf[count]                    // bar that the next base candle belongs to
  const end = idx.starts[nb + 1] ?? baseLen
  return Math.max(1, end - count)
}

/** Index of the first base candle whose CLOSE is >= t (first candle not yet closed at time t). */
export function firstIndexAtOrAfter(base, baseSecs, t) {
  let lo = 0, hi = base.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (base[mid].time + baseSecs >= t) hi = mid; else lo = mid + 1
  }
  return lo
}

// ── Cache ────────────────────────────────────────────────────────────────
const MEM = new Map()
const DB_NAME = 'trado-backtest', STORE = 'candles'

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no idb'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function idbGet(key) {
  try {
    const db = await openDb()
    return await new Promise((res) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key)
      r.onsuccess = () => res(r.result || null)
      r.onerror = () => res(null)
    })
  } catch { return null }
}
async function idbSet(key, value) {
  try {
    const db = await openDb()
    await new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = res; tx.onerror = res; tx.onabort = res
    })
  } catch { /* private mode / quota — the memory cache still works */ }
}

// ── Loader ───────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchChunk(symbol, interval, from, to, tries = 3) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      const { candles } = await loadCandles({ symbol, interval, from, to })
      return candles
    } catch (e) {
      lastErr = e
      if (e?.status === 429 || /limit/i.test(e?.message || '')) await sleep(8000 * (i + 1))   // Twelve Data per-minute cap
      else if (i < tries - 1) await sleep(600)
    }
  }
  throw lastErr
}

/**
 * Load every base candle for a session: [start − warm-up, end].
 * @param onProgress ({ loaded, total }) => void
 * @returns {{ base: Candle[], baseSecs, warmupIndex }} warmupIndex = first base candle at/after the session start
 */
export async function loadSessionData({ symbol, baseTf, startSec, endSec, onProgress, signal }) {
  const step = tfSecs(baseTf)
  const total = plannedCandles(baseTf, startSec, endSec)
  if (total > MAX_BASE_CANDLES) {
    const e = new Error(`That range needs about ${total.toLocaleString()} ${baseTf} candles (max ${MAX_BASE_CANDLES.toLocaleString()}). Shorten the dates or pick a coarser timeframe.`)
    e.code = 'TOO_LARGE'; throw e
  }

  const from = floorTo(startSec - WARMUP_SECS[baseTf], step)
  const to = Math.min(floorTo(endSec, step), floorTo(Date.now() / 1000, step))
  const key = `${normaliseSymbol(symbol)}|${baseTf}|${from}|${to}`

  const mem = MEM.get(key)
  if (mem) return finish(mem)
  const stored = await idbGet(key)
  if (stored?.length) { MEM.set(key, stored); return finish(stored) }

  const windows = []
  for (let a = from; a <= to; a += CHUNK_BARS * step) windows.push([a, Math.min(to, a + CHUNK_BARS * step - step)])

  const parts = new Array(windows.length)
  let done = 0, next = 0
  const worker = async () => {
    while (next < windows.length) {
      if (signal?.aborted) return
      const i = next++
      parts[i] = await fetchChunk(symbol, baseTf, windows[i][0], windows[i][1])
      done += parts[i].length
      onProgress?.({ loaded: Math.min(done, total), total })
    }
  }
  // Binance tolerates parallel requests; the forex feed is rate-limited, so go one at a time there.
  const parallel = resolveBinanceSymbol(symbol) ? 4 : 1
  await Promise.all(Array.from({ length: parallel }, worker))
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const seen = new Set()
  const base = parts.flat()
    .filter(c => c && Number.isFinite(c.time) && !seen.has(c.time) && (seen.add(c.time), true))
    .sort((a, b) => a.time - b.time)

  if (!base.length) {
    const e = new Error(`No ${baseTf} price data for ${normaliseSymbol(symbol)} in that period.`)
    e.code = 'NO_DATA'; throw e
  }
  MEM.set(key, base)
  idbSet(key, base)
  return finish(base)

  function finish(candles) {
    return { base: candles, baseSecs: step, startIndex: firstIndexAtOrAfter(candles, step, startSec) }
  }
}