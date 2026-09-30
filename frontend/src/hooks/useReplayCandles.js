import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { fetchBinanceCandles, resolveBinanceSymbol } from '../lib/binanceDirect'
import { replayWindow, tfByKey } from '../lib/replayUtils'

// Module-level cache: flipping between trades / timeframes you've already
// opened is instant and costs no backend or data-provider call.
const CACHE = new Map()
const CACHE_MAX = 60

function remember(key, value) {
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value)
  CACHE.set(key, value)
}

/**
 * Loads the candles for one trade at one timeframe.
 *   → { candles, loading, error, ready }
 *
 * While a new dataset loads, `candles` keeps the previous one so the page can
 * blur it behind the "Loading market data…" overlay instead of flashing empty.
 * `ready` is only true when `candles` really belong to the requested trade +
 * timeframe — derive anything trade-specific (markers, replay plan) from it.
 */
export function useReplayCandles(trade, timeframe) {
  const tradeId = trade?.id
  const symbol  = trade?.symbol
  const entryTs = trade?.entryTs
  const exitTs  = trade?.exitTs

  const wanted = useMemo(() => {
    if (!tradeId) return null
    const tf = tfByKey(timeframe)
    const { from, to } = replayWindow({ entryTs, exitTs }, tf)
    return { tf, from, to, key: `${symbol}|${tf.key}|${from}|${to}` }
  }, [tradeId, symbol, entryTs, exitTs, timeframe])

  // Last settled result for whatever was requested most recently.
  const [settled, setSettled] = useState({ key: null, candles: [], error: null })

  const cached = wanted ? CACHE.get(wanted.key) : null

  useEffect(() => {
    if (!wanted || CACHE.has(wanted.key)) return
    let cancelled = false

    const { tf, from, to } = wanted
    const direct = resolveBinanceSymbol(symbol)

    // 1) Binance straight from the browser (no cold start, no server region
    //    issues). 2) Backend route — the fallback, and the only path for forex.
    const viaBackend = () =>
      api.get(`/candles?symbol=${encodeURIComponent(symbol)}&interval=${tf.key}&from=${from}&to=${to}`)
        .then(res => res?.candles || [])

    const load = direct
      ? fetchBinanceCandles({ ...direct, interval: tf.key, from, to })
          .then(c => (c.length ? c : Promise.reject(new Error('empty'))))
          .catch(() => viaBackend())
      : viaBackend()

    load
      .then(candles => {
        if (cancelled) return
        if (candles.length) remember(wanted.key, candles)
        setSettled({
          key: wanted.key,
          candles,
          error: candles.length ? null : 'No market data was returned for this trade’s time window.',
        })
      })
      .catch(err => {
        if (cancelled) return
        setSettled({ key: wanted.key, candles: [], error: err?.message || 'Failed to load market data' })
      })

    return () => { cancelled = true }
  }, [wanted, symbol])

  if (!wanted) return { candles: [], loading: false, error: null, ready: false }
  if (cached) return { candles: cached, loading: false, error: null, ready: true }
  if (settled.key === wanted.key) {
    return {
      candles: settled.candles,
      loading: false,
      error: settled.error,
      ready: !settled.error && settled.candles.length > 0,
    }
  }
  // Still loading: hand back whatever we last had so the chart can blur it.
  return { candles: settled.candles, loading: true, error: null, ready: false }
}