// ─────────────────────────────────────────────────────────────────────────
// Browser-side candle fetch straight from Binance's public market-data API.
//
// Why: the Render API may sit in a region Binance blocks (HTTP 451), and a
// free-tier Render service also cold-starts slowly. Binance market data needs
// no key, so the user's own browser can ask for it directly. The backend route
// (/api/candles) stays as the fallback and as the only path for forex.
//
// Keep the symbol tables in sync with backend/services/candles.js.
// ─────────────────────────────────────────────────────────────────────────

const STEP = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 }

const SPOT_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com']
const FUTURES_HOST = 'https://fapi.binance.com'

const CRYPTO_BASES = new Set([
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'LTC', 'AVAX', 'DOT',
  'LINK', 'MATIC', 'TRX', 'SHIB', 'BCH', 'ATOM', 'UNI', 'XLM', 'ETC', 'NEAR',
  'APT', 'ARB', 'OP', 'FIL', 'INJ', 'SUI', 'PEPE', 'TON',
])

const FUTURES_MAP = {
  XAUUSD: 'XAUUSDT', GOLD: 'XAUUSDT', XAUUSDT: 'XAUUSDT',
  XAGUSD: 'XAGUSDT', SILVER: 'XAGUSDT', XAGUSDT: 'XAGUSDT',
  WTIUSD: 'CLUSDT', USOIL: 'CLUSDT', XTIUSD: 'CLUSDT', USOUSD: 'CLUSDT', WTI: 'CLUSDT', CLUSDT: 'CLUSDT',
  BRENTUSD: 'BZUSDT', UKOIL: 'BZUSDT', XBRUSD: 'BZUSDT', UKOUSD: 'BZUSDT', BRENT: 'BZUSDT', BZUSDT: 'BZUSDT',
  NATGAS: 'NATGASUSDT', NGAS: 'NATGASUSDT', XNGUSD: 'NATGASUSDT', NATGASUSDT: 'NATGASUSDT',
}

// MT5 brokers decorate symbols: "XAUUSD.m", "EURUSDm", "XAUUSD#" …
export function normaliseSymbol(raw = '') {
  let s = String(raw).trim()
  s = s.replace(/[.#_-].*$/, '')
  s = s.replace(/^([A-Z0-9]{5,})[a-z]{1,3}$/, '$1')
  return s.toUpperCase()
}

/** → { market: 'spot' | 'futures', symbol } or null when Binance can't serve it. */
export function resolveBinanceSymbol(raw) {
  const sym = normaliseSymbol(raw)
  if (FUTURES_MAP[sym]) return { market: 'futures', symbol: FUTURES_MAP[sym] }
  const m = /^([A-Z0-9]{2,6}?)(USDT|USD)$/.exec(sym)
  if (m && CRYPTO_BASES.has(m[1])) return { market: 'spot', symbol: `${m[1]}USDT` }
  return null
}

async function getRows(url, timeoutMs = 8000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`Binance HTTP ${res.status}`)
    const rows = await res.json()
    if (!Array.isArray(rows)) throw new Error(rows?.msg || 'Unexpected Binance response')
    return rows
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch candles for [from, to] (unix seconds). Throws on any failure (network,
 * CORS, geo-block) so the caller can fall back to the backend.
 */
export async function fetchBinanceCandles({ market, symbol, interval, from, to }) {
  const stepMs = STEP[interval] * 1000
  const endMs = to * 1000
  const limit = market === 'futures' ? 1500 : 1000
  const hosts = market === 'futures' ? [FUTURES_HOST] : SPOT_HOSTS
  const path = market === 'futures' ? '/fapi/v1/klines' : '/api/v3/klines'

  const out = []
  let start = from * 1000

  for (let page = 0; page < 3 && start <= endMs; page++) {
    let rows = null, lastErr = null
    for (const host of hosts) {
      try {
        rows = await getRows(`${host}${path}?symbol=${symbol}&interval=${interval}&startTime=${start}&endTime=${endMs}&limit=${limit}`)
        break
      } catch (e) { lastErr = e }
    }
    if (!rows) throw lastErr || new Error('Binance request failed')
    if (!rows.length) break

    for (const k of rows) {
      out.push({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] })
    }
    if (rows.length < limit) break
    start = rows[rows.length - 1][0] + stepMs
  }

  // Clean: finite OHLC, ascending, unique timestamps.
  const seen = new Set()
  return out
    .filter(c => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite))
    .sort((a, b) => a.time - b.time)
    .filter(c => (seen.has(c.time) ? false : (seen.add(c.time), true)))
}