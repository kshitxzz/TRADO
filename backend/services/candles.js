// ─────────────────────────────────────────────────────────────────────────
// Historical candles for the Trade Replay page.
//
// Providers (resolved per symbol):
//   • Binance public market data — crypto pairs. Free, no API key.
//   • Twelve Data                — forex / metals (XAUUSD, EURUSD, …).
//                                  OPT-IN: only active when TWELVEDATA_API_KEY
//                                  is set. NOTE: Twelve Data's free "Basic" plan
//                                  is meant for evaluation / non-commercial use —
//                                  a paid SaaS needs one of their Business plans
//                                  (or swap this provider for another feed).
//
// Everything is normalised to  { time (unix seconds, candle OPEN), open, high,
// low, close, volume? }  sorted ascending with unique timestamps.
// ─────────────────────────────────────────────────────────────────────────

export const INTERVAL_SECS = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
}

const BINANCE_INTERVAL = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d' }
const TD_INTERVAL      = { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1day' }

// Binance market-data hosts. data-api.binance.vision is the region-friendly,
// market-data-only mirror (api.binance.com returns HTTP 451 from some US hosts).
const BINANCE_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com']

const CRYPTO_BASES = new Set([
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'LTC', 'AVAX', 'DOT',
  'LINK', 'MATIC', 'TRX', 'SHIB', 'BCH', 'ATOM', 'UNI', 'XLM', 'ETC', 'NEAR',
  'APT', 'ARB', 'OP', 'FIL', 'INJ', 'SUI', 'PEPE', 'TON',
])

const METALS = new Set(['XAU', 'XAG', 'XPT', 'XPD'])

const MAX_CANDLES = 1500          // hard ceiling per request
const MAX_SPAN_SECS = 400 * 86400 // sanity ceiling on the requested window

// ── Symbol normalisation ─────────────────────────────────────────────────
// MT5 brokers decorate symbols: "XAUUSD.m", "EURUSDm", "XAUUSD#", "GOLD"…
export function normaliseSymbol(raw = '') {
  let s = String(raw).trim()
  s = s.replace(/[.#_-].*$/, '')                      // XAUUSD.pro → XAUUSD
  s = s.replace(/^([A-Z0-9]{5,})[a-z]{1,3}$/, '$1')   // EURUSDm    → EURUSD
  return s.toUpperCase()
}

export function resolveProvider(rawSymbol) {
  const sym = normaliseSymbol(rawSymbol)

  // Crypto: BTCUSD / BTCUSDT → Binance BTCUSDT
  const m = /^([A-Z0-9]{2,6}?)(USDT|USD)$/.exec(sym)
  if (m && CRYPTO_BASES.has(m[1])) {
    return { provider: 'binance', symbol: `${m[1]}USDT` }
  }

  // Metals + 6-letter forex pairs → Twelve Data (needs a key)
  if (/^[A-Z]{6}$/.test(sym)) {
    const base = sym.slice(0, 3), quote = sym.slice(3)
    if (METALS.has(base) || !METALS.has(quote)) {
      return { provider: 'twelvedata', symbol: `${base}/${quote}` }
    }
  }
  if (sym === 'WTIUSD' || sym === 'USOIL') return { provider: 'twelvedata', symbol: 'WTI/USD' }

  return null
}

// ── Tiny fetch helper with timeout ───────────────────────────────────────
async function getJson(url, { timeoutMs = 9000 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = null }
    return { ok: res.ok, status: res.status, json }
  } finally {
    clearTimeout(timer)
  }
}

// ── Binance ──────────────────────────────────────────────────────────────
async function fromBinance(symbol, interval, from, to) {
  const stepMs = INTERVAL_SECS[interval] * 1000
  const endMs = to * 1000
  const out = []
  let start = from * 1000

  for (let page = 0; page < 3 && start <= endMs; page++) {
    let rows = null
    let lastErr = null
    for (const host of BINANCE_HOSTS) {
      const url = `${host}/api/v3/klines?symbol=${symbol}&interval=${BINANCE_INTERVAL[interval]}` +
                  `&startTime=${start}&endTime=${endMs}&limit=1000`
      try {
        const r = await getJson(url)
        if (r.ok && Array.isArray(r.json)) { rows = r.json; break }
        lastErr = new Error(r.json?.msg || `Binance HTTP ${r.status}`)
      } catch (e) { lastErr = e }
    }
    if (!rows) throw lastErr || new Error('Binance request failed')
    if (!rows.length) break

    for (const r of rows) {
      out.push({
        time: Math.floor(r[0] / 1000),
        open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5],
      })
    }
    if (rows.length < 1000) break
    start = rows[rows.length - 1][0] + stepMs
  }
  return out
}

// ── Twelve Data ──────────────────────────────────────────────────────────
const iso = (secs) => new Date(secs * 1000).toISOString().slice(0, 19) // YYYY-MM-DDTHH:mm:ss (UTC)

async function fromTwelveData(symbol, interval, from, to) {
  const key = process.env.TWELVEDATA_API_KEY
  if (!key) {
    const err = new Error('No market-data provider is configured for this symbol yet.')
    err.status = 501
    throw err
  }
  const url = 'https://api.twelvedata.com/time_series' +
    `?symbol=${encodeURIComponent(symbol)}&interval=${TD_INTERVAL[interval]}` +
    `&start_date=${iso(from)}&end_date=${iso(to)}&timezone=UTC&order=ASC&outputsize=5000` +
    `&apikey=${encodeURIComponent(key)}`

  const r = await getJson(url)
  const j = r.json
  if (!j) throw new Error(`Twelve Data HTTP ${r.status}`)

  if (j.status === 'error') {
    // "No data is available on the specified dates" is an empty result, not a failure.
    if (/no data/i.test(j.message || '')) return []
    const err = new Error(j.message || 'Twelve Data error')
    err.status = j.code === 429 ? 429 : 502
    throw err
  }

  return (j.values || []).map(v => ({
    time: Math.floor(Date.parse(v.datetime.replace(' ', 'T') + 'Z') / 1000),
    open: +v.open, high: +v.high, low: +v.low, close: +v.close,
    ...(v.volume != null ? { volume: +v.volume } : {}),
  }))
}

// ── Cache (in-memory; free-tier friendly) ────────────────────────────────
const CACHE = new Map()       // key → { at, ttl, value }
const INFLIGHT = new Map()    // key → Promise
const CACHE_MAX = 400

function cacheGet(key) {
  const hit = CACHE.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > hit.ttl) { CACHE.delete(key); return null }
  return hit.value
}
function cacheSet(key, value, ttl) {
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value) // drop oldest
  CACHE.set(key, { at: Date.now(), ttl, value })
}

// ── Public entry point ───────────────────────────────────────────────────
export async function getCandles({ symbol, interval, from, to }) {
  if (!INTERVAL_SECS[interval]) {
    const e = new Error('Unsupported interval'); e.status = 400; throw e
  }
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    const e = new Error('Invalid time range'); e.status = 400; throw e
  }
  if (to - from > MAX_SPAN_SECS) {
    const e = new Error('Requested range is too large'); e.status = 400; throw e
  }

  const resolved = resolveProvider(symbol)
  if (!resolved) {
    const e = new Error(`No market data is available for ${symbol}.`)
    e.status = 404
    throw e
  }

  // Snap the window to the interval grid so nearby requests share a cache entry.
  const step = INTERVAL_SECS[interval]
  const f = Math.floor(from / step) * step
  const t = Math.floor(to / step) * step
  const key = `${resolved.provider}|${resolved.symbol}|${interval}|${f}|${t}`

  const cached = cacheGet(key)
  if (cached) return cached
  if (INFLIGHT.has(key)) return INFLIGHT.get(key)

  const job = (async () => {
    const raw = resolved.provider === 'binance'
      ? await fromBinance(resolved.symbol, interval, f, t)
      : await fromTwelveData(resolved.symbol, interval, f, t)

    // Clean: finite OHLC, ascending, unique timestamps, capped.
    const seen = new Set()
    const candles = raw
      .filter(c => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite))
      .sort((a, b) => a.time - b.time)
      .filter(c => (seen.has(c.time) ? false : (seen.add(c.time), true)))
      .slice(-MAX_CANDLES)

    const value = { candles, source: resolved.provider }
    // History that has fully closed is immutable → cache for a day; recent windows briefly.
    const ttl = t < Date.now() / 1000 - 3600 ? 24 * 3600_000 : 60_000
    if (candles.length) cacheSet(key, value, ttl)
    return value
  })()

  INFLIGHT.set(key, job)
  try { return await job } finally { INFLIGHT.delete(key) }
}