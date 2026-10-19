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

// ── Timeframes ───────────────────────────────────────────────────────────
// A timeframe key is "<n><unit>": 7m, 90m, 4h, 1d, 1w, 1M … any whole number.
const UNIT_SECS = { m: 60, h: 3600, d: 86400, w: 604800, M: 2592000 }   // M = nominal 30 days (axis spacing only)
export const TF_UNITS = [
  { unit: 'm', label: 'minutes' }, { unit: 'h', label: 'hours' }, { unit: 'd', label: 'days' },
  { unit: 'w', label: 'weeks' },   { unit: 'M', label: 'months' },
]

export function parseTf(key) {
  const m = /^(\d{1,4})([mhdwM])$/.exec(String(key || ''))
  if (!m || +m[1] < 1) return { n: 15, unit: 'm', secs: 900, valid: false }
  return { n: +m[1], unit: m[2], secs: +m[1] * UNIT_SECS[m[2]], valid: true }
}
export const isValidTf = (key) => parseTf(key).valid
export const tfKey = (n, unit) => `${n}${unit}`
export const tfSecs = (key) => parseTf(key).secs
export const tfUnit = (key) => parseTf(key).unit

/** 1m 5m 90m 4h D 3D W M — the label shown on the chart toolbar. */
export function tfLabel(key) {
  const { n, unit } = parseTf(key)
  if (unit === 'd') return n === 1 ? 'D' : `${n}D`
  if (unit === 'w') return n === 1 ? 'W' : `${n}W`
  if (unit === 'M') return n === 1 ? 'M' : `${n}M`
  return `${n}${unit}`
}

/** Spoken name for menus: "5 minutes", "1 hour", "1 day". */
export function tfName(key) {
  const { n, unit } = parseTf(key)
  const word = { m: 'minute', h: 'hour', d: 'day', w: 'week', M: 'month' }[unit]
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Ready-made intervals shown in the timeframe menu. */
export const TF_PRESETS = [
  { title: 'Minutes', keys: ['1m', '2m', '3m', '5m', '10m', '15m', '30m', '45m'] },
  { title: 'Hours',   keys: ['1h', '2h', '3h', '4h', '6h', '8h', '12h'] },
  { title: 'Days',    keys: ['1d', '2d', '3d'] },
  { title: 'Weeks & months', keys: ['1w', '2w', '1M'] },
]
export const DEFAULT_FAVORITE_TFS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w']

/** Start of the bar containing `t` (unix seconds, UTC). Weeks start Monday; months on the 1st. */
export function bucketStart(t, key) {
  const { n, unit, secs } = parseTf(key)
  if (unit === 'w') { const off = 4 * 86400; return Math.floor((t - off) / secs) * secs + off }   // 1970-01-05 was a Monday
  if (unit === 'M') {
    const d = new Date(t * 1000)
    const idx = d.getUTCFullYear() * 12 + d.getUTCMonth()
    const b = Math.floor(idx / n) * n
    return Date.UTC(Math.floor(b / 12), b % 12, 1) / 1000
  }
  return Math.floor(t / secs) * secs
}

/** Finest timeframes a session can be loaded at (what the data feeds serve natively). */
export const BASE_TFS = ['1m', '5m', '15m', '1h']

/**
 * Which loaded candle size can build `tf` exactly?
 *  • calendar intervals (days/weeks/months) work from any base;
 *  • minute/hour intervals need a base that divides them evenly.
 * Returns the current base when it already works, else the COARSEST base that does
 * (least data), or null if the interval is finer than any feed (e.g. under a minute).
 */
export function baseFor(tf, currentBase) {
  const t = parseTf(tf)
  if (!t.valid) return null
  const cur = tfSecs(currentBase)
  if ('dwM'.includes(t.unit)) return currentBase
  if (t.secs >= cur && t.secs % cur === 0) return currentBase
  const fits = [...BASE_TFS].reverse().find(b => tfSecs(b) <= t.secs && t.secs % tfSecs(b) === 0)
  return fits || null
}

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
    const t = bucketStart(c.time, tf)
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