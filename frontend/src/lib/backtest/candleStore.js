// ─────────────────────────────────────────────────────────────────────────
// Trado market-data store — browser loader (no React).
//
// Forex, metals and energy backtests read 1-minute BID candles from an immutable store
// (Dukascopy data, ingested once with tools/data-store — see its README), not from a
// live feed. Why:
//   • the same bytes every time → a backtest never changes between sessions;
//   • no rate limits, no geo-blocks, no weekend "perpetual contract" prints;
//   • nothing is approximated: if a month is not in the store the app says so.
//
// Layout (static files, served from VITE_TRADO_DATA_URL or /market-data):
//   manifest.json                        what exists, per symbol
//   <SYMBOL>/<YYYY-MM>.bin.gz?v=<hash>   one gzip'd month file (format: storeFormat.js)
// ─────────────────────────────────────────────────────────────────────────

import { decodeMonth, monthsBetween, monthStart } from './storeFormat.js'
import { cleanCandles, foldToHourly } from './aggregate.js'

export class StoreError extends Error {
  constructor(code, message) { super(message); this.code = code; this.name = 'StoreError' }
}

const ENV_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_TRADO_DATA_URL) || '/market-data'
let cfg = { baseUrl: String(ENV_BASE).replace(/\/+$/, ''), fetchFn: null }

/** Point the loader somewhere else / inject fetch (tests). Clears every cache. */
export function configureStore({ baseUrl, fetchFn } = {}) {
  if (baseUrl != null) cfg.baseUrl = String(baseUrl).replace(/\/+$/, '')
  if (fetchFn !== undefined) cfg.fetchFn = fetchFn
  manifest = null; DECODED.clear(); HOURLY.clear()
}
export const storeBaseUrl = () => cfg.baseUrl

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const doFetch = (url, opts) => (cfg.fetchFn || fetch)(url, opts)

// ── tiny persistent cache (IndexedDB) — an extra layer under the HTTP cache ─
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
export async function idbGet(key) {
  try {
    const db = await openDb()
    return await new Promise((res) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key)
      r.onsuccess = () => res(r.result || null)
      r.onerror = () => res(null)
    })
  } catch { return null }
}
export async function idbSet(key, value) {
  try {
    const db = await openDb()
    await new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = res; tx.onerror = res; tx.onabort = res
    })
  } catch { /* private mode / quota — the HTTP cache still works */ }
}

// ── gzip ─────────────────────────────────────────────────────────────────
async function gunzip(bytes) {
  if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new StoreError('STORE_UNSUPPORTED', 'This browser is too old to read market data. Please update it.')
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }
  return bytes                                                       // already plain (a CDN may have decompressed it)
}

async function fetchBytes(url, { signal, noCache = false } = {}) {
  let last
  for (let i = 0; i < 3; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const res = await doFetch(url, { signal, cache: noCache ? 'no-cache' : 'default' })
      if (res.status === 404) throw new StoreError('NO_DATA', 'not found')
      if (!res.ok) throw new StoreError('STORE_UNREACHABLE', `HTTP ${res.status}`)
      return new Uint8Array(await res.arrayBuffer())
    } catch (e) {
      if (e?.name === 'AbortError' || e?.code === 'NO_DATA') throw e
      last = e
      if (i < 2) await sleep(500 * (i + 1))
    }
  }
  throw new StoreError('STORE_UNREACHABLE', `Could not reach the market-data store (${last?.message || 'network error'}).`)
}

// ── manifest ─────────────────────────────────────────────────────────────
let manifest = null            // { at, promise }
const MANIFEST_TTL_MS = 5 * 60_000

async function getManifest(signal) {
  if (manifest && Date.now() - manifest.at < MANIFEST_TTL_MS) return manifest.promise
  const promise = (async () => {
    let bytes
    try { bytes = await fetchBytes(`${cfg.baseUrl}/manifest.json`, { signal, noCache: true }) } catch (e) {
      if (e.code === 'NO_DATA') throw new StoreError('STORE_NOT_CONFIGURED', `No market-data store found at ${cfg.baseUrl}. Upload the ingested data there, or set VITE_TRADO_DATA_URL (see tools/data-store/README.md).`)
      throw e
    }
    let json
    try { json = JSON.parse(new TextDecoder().decode(bytes)) } catch { json = null }
    if (!json || json.version !== 1 || typeof json.symbols !== 'object') {
      throw new StoreError('STORE_NOT_CONFIGURED', `${cfg.baseUrl}/manifest.json is not a Trado market-data manifest — is the data deployed there?`)
    }
    return json
  })()
  manifest = { at: Date.now(), promise }
  promise.catch(() => { if (manifest?.promise === promise) manifest = null })
  return promise
}

/** What the store holds for a canonical symbol, or null. `first`/`last` are the first and last candle opens (unix s). */
export async function coverage(symbol, signal) {
  const man = await getManifest(signal)
  const s = man.symbols[symbol]
  if (!s || !s.months || !Object.keys(s.months).length) return null
  return { symbol, digits: s.digits, first: s.first, last: s.last, months: Object.keys(s.months).sort(), source: man.source || 'Dukascopy', priceType: man.priceType || 'bid', generated: man.generated || null }
}

// ── month files ──────────────────────────────────────────────────────────
const DECODED = new Map()      // `${symbol}|${month}|${hash}` → { digits, candles }   (small LRU)
const HOURLY = new Map()       // same key → hourly bars folded from that month
const LRU_MAX = 3

function lru(map, key, value) { map.delete(key); map.set(key, value); while (map.size > LRU_MAX) map.delete(map.keys().next().value) }

async function monthData(symbol, month, entry, signal) {
  const key = `${symbol}|${month}|${entry.h}`
  const hit = DECODED.get(key)
  if (hit) { lru(DECODED, key, hit); return hit }

  const idbKey = `store|${key}`
  const cached = await idbGet(idbKey)
  let gz = cached instanceof Uint8Array ? cached : (cached instanceof ArrayBuffer ? new Uint8Array(cached) : null)
  let fromCache = !!gz

  const url = `${cfg.baseUrl}/${symbol}/${month}.bin.gz?v=${encodeURIComponent(entry.h)}`
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!gz) { gz = await fetchBytes(url, { signal }); fromCache = false }
    try {
      const m = decodeMonth(await gunzip(gz))
      if (entry.n != null && m.candles.length !== entry.n) throw new Error(`expected ${entry.n} candles, found ${m.candles.length}`)
      if (monthStart(month) !== m.monthStart) throw new Error('file is for a different month')
      if (!fromCache) idbSet(idbKey, gz)
      lru(DECODED, key, m)
      return m
    } catch (e) {
      // a bad cached copy gets one clean re-download; a bad download is reported, never drawn
      if (fromCache) { idbSet(idbKey, null); gz = null; fromCache = false; continue }
      if (e instanceof StoreError) throw e
      throw new StoreError('STORE_CORRUPT', `The ${symbol} ${month} market-data file failed its integrity check (${e.message}). It was not used.`)
    }
  }
}

/** Month keys the store actually has, within [fromSec, toSec], as one contiguous run — a hole is an error, never skipped. */
async function monthsFor(symbol, fromSec, toSec, signal) {
  const cov = await coverage(symbol, signal)
  if (!cov) throw new StoreError('NO_DATA', `There is no verified ${symbol} data in the store yet. Ingest it first (tools/data-store/README.md).`)
  const man = await getManifest(signal)
  const entries = man.symbols[symbol].months
  const want = monthsBetween(fromSec, toSec).filter(m => m >= cov.months[0] && m <= cov.months[cov.months.length - 1])
  if (!want.length) throw new StoreError('NO_DATA', `No ${symbol} data for that period (the store covers ${cov.months[0]} to ${cov.months[cov.months.length - 1]}).`)
  for (const m of want) if (!entries[m]) throw new StoreError('STORE_HOLE', `The ${symbol} data has a hole at ${m}. Re-run the ingest for that month.`)
  return { months: want, entries }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i) }
  }))
  return out
}

/** 1-minute candles with open time in [fromSec, toSec]. */
export async function loadStoreCandles(symbol, fromSec, toSec, { signal, onProgress } = {}) {
  const { months, entries } = await monthsFor(symbol, fromSec, toSec, signal)
  let done = 0
  const parts = await mapLimit(months, 3, async (m) => {
    const d = await monthData(symbol, m, entries[m], signal)
    done++; onProgress?.({ done, total: months.length })
    return d.candles.filter(c => c.time >= fromSec && c.time <= toSec)
  })
  const { candles } = cleanCandles(parts.flat())
  return candles
}

/**
 * Completed hourly bars in [fromSec, toSec) — folded from the SAME 1-minute files, so history can never disagree with the replay.
 * `fromSec` and `toSec` should be hour-aligned (a bar that would cross `toSec` is left out).
 */
export async function loadStoreHourly(symbol, fromSec, toSec, { signal } = {}) {
  const { months, entries } = await monthsFor(symbol, fromSec, toSec - 1, signal)
  const parts = await mapLimit(months, 3, async (m) => {
    const key = `${symbol}|${m}|${entries[m].h}`
    let h = HOURLY.get(key)
    if (!h) { h = foldToHourly((await monthData(symbol, m, entries[m], signal)).candles); lru(HOURLY, key, h) }
    return h
  })
  return parts.flat().filter(b => b.time >= fromSec && b.time + 3600 <= toSec)
}