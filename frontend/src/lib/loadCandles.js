import { api } from './api'
import { fetchBinanceCandles, resolveBinanceForex, resolveBinanceSymbol } from './binanceDirect'

// ── Broker candles (captured by the TradoSync EA) ────────────────────────
// Exact prices the trader saw, for every timeframe. Fetched once per trade and
// kept in memory; "nothing captured yet" is only remembered briefly because the
// EA fills trades in over time.
const BROKER_CACHE = new Map()   // tradeId → { at, series | null }
const MISS_TTL_MS = 60_000

async function fetchBrokerSeries(tradeId) {
  const hit = BROKER_CACHE.get(tradeId)
  if (hit && (hit.series || Date.now() - hit.at < MISS_TTL_MS)) return hit.series
  let series = null
  try {
    const res = await api.get(`/candles/trade/${encodeURIComponent(tradeId)}`)
    series = res?.series || null
  } catch { /* offline / not deployed yet → fall back to market-data feeds */ }
  BROKER_CACHE.set(tradeId, { at: Date.now(), series })
  return series
}

const toCandles = (rows) => rows.map(([time, open, high, low, close]) => ({ time, open, high, low, close }))

/**
 * Resolves to { candles, source } where source is:
 *   'broker' → the broker's own candles from the EA (exact)
 *   'feed'   → an external market-data feed (approximate)
 *
 * Order:
 *   1. broker candles for this trade/timeframe
 *   2. crypto / gold / oil → Binance from the browser, then the backend
 *      forex                → backend (Twelve Data), then Binance's EUR/GBP/AUD pairs
 * Throws the most useful error when nothing works. `deps` lets the ordering be
 * unit-tested without a network.
 */
export async function loadCandles(
  { tradeId, symbol, interval, from, to },
  deps = {},
) {
  const fetchDirect  = deps.fetchDirect  || fetchBinanceCandles
  const fetchBroker  = deps.fetchBroker  || fetchBrokerSeries
  const fetchBackend = deps.fetchBackend || (async () => {
    const res = await api.get(`/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}&from=${from}&to=${to}`)
    return res?.candles || []
  })

  const feed = (candles) => ({ candles, source: 'feed' })
  const tryDirect = async (target) => {
    try {
      const c = await fetchDirect({ ...target, interval, from, to })
      return c.length ? c : null
    } catch { return null }
  }

  if (tradeId) {
    const series = await fetchBroker(tradeId)
    const rows = series?.[interval]
    if (rows?.length) return { candles: toCandles(rows), source: 'broker' }
  }

  const direct = resolveBinanceSymbol(symbol)
  if (direct) {
    const c = await tryDirect(direct)
    if (c) return feed(c)
    return feed(await fetchBackend())
  }

  let backendErr = null
  try {
    const c = await fetchBackend()
    if (c.length) return feed(c)
  } catch (e) { backendErr = e }

  const forex = resolveBinanceForex(symbol)
  if (forex) {
    const c = await tryDirect(forex)
    if (c) return feed(c)
  }
  if (backendErr) throw backendErr
  return feed([])
}

/** { total, ready } of closed MT5 trades vs. trades with broker candles, or null if unavailable. */
export async function fetchCaptureStatus() {
  try {
    const res = await api.get('/candles/status')
    return Number.isFinite(res?.total) ? { total: res.total, ready: res.ready || 0 } : null
  } catch { return null }
}