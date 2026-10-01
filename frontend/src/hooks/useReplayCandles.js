import { useEffect, useMemo, useState } from 'react'
import { loadCandles } from '../lib/loadCandles'
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
 *   → { candles, source, loading, error, ready }   (source: 'broker' | 'feed')
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
    return { tf, from, to, key: `${tradeId}|${symbol}|${tf.key}|${from}|${to}` }
  }, [tradeId, symbol, entryTs, exitTs, timeframe])

  // Last settled result for whatever was requested most recently.
  const [settled, setSettled] = useState({ key: null, candles: [], error: null, source: null })

  const cached = wanted ? CACHE.get(wanted.key) : null

  useEffect(() => {
    if (!wanted || CACHE.has(wanted.key)) return
    let cancelled = false

    const { tf, from, to } = wanted

    loadCandles({ tradeId, symbol, interval: tf.key, from, to })
      .then(({ candles, source }) => {
        if (cancelled) return
        if (candles.length) remember(wanted.key, { candles, source })
        setSettled({
          key: wanted.key,
          candles,
          source,
          error: candles.length ? null : 'No market data was returned for this trade’s time window.',
        })
      })
      .catch(err => {
        if (cancelled) return
        setSettled({ key: wanted.key, candles: [], source: null, error: err?.message || 'Failed to load market data' })
      })

    return () => { cancelled = true }
  }, [wanted, symbol])

  if (!wanted) return { candles: [], source: null, loading: false, error: null, ready: false }
  if (cached) return { candles: cached.candles, source: cached.source, loading: false, error: null, ready: true }
  if (settled.key === wanted.key) {
    return {
      candles: settled.candles,
      source: settled.source,
      loading: false,
      error: settled.error,
      ready: !settled.error && settled.candles.length > 0,
    }
  }
  // Still loading: hand back whatever we last had so the chart can blur it.
  return { candles: settled.candles, source: settled.source, loading: true, error: null, ready: false }
}