import { api } from './api'
import { fetchBinanceCandles, resolveBinanceForex, resolveBinanceSymbol } from './binanceDirect'

/**
 * Source order:
 *   crypto / gold / oil  → Binance from the browser, then the backend
 *   forex                → backend (Twelve Data), then Binance's EUR/GBP/AUD pairs
 * Resolves to a non-empty candle array, or throws the most useful error.
 * `deps` exists so the ordering can be unit-tested without a network.
 */
export async function loadCandles(
  { symbol, interval, from, to },
  deps = { fetchDirect: fetchBinanceCandles, fetchBackend: null },
) {
  const fetchDirect = deps.fetchDirect
  const fetchBackend = deps.fetchBackend || (async () => {
    const res = await api.get(`/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}&from=${from}&to=${to}`)
    return res?.candles || []
  })
  const tryDirect = async (target) => {
    try {
      const c = await fetchDirect({ ...target, interval, from, to })
      return c.length ? c : null
    } catch { return null }
  }

  const direct = resolveBinanceSymbol(symbol)
  if (direct) {
    const c = await tryDirect(direct)
    if (c) return c
    return fetchBackend()
  }

  let backendErr = null
  try {
    const c = await fetchBackend()
    if (c.length) return c
  } catch (e) { backendErr = e }

  const forex = resolveBinanceForex(symbol)
  if (forex) {
    const c = await tryDirect(forex)
    if (c) return c
  }
  if (backendErr) throw backendErr
  return []
}