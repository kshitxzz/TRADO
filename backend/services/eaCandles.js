// Pure helpers for the EA candle-capture endpoints (kept free of I/O so they
// can be unit-tested).

export const SERIES_KEYS = ['1m', '5m', '15m', '1h', '4h', '1d']
export const MAX_BARS_PER_SERIES = 1500

/**
 * Validate + normalise what the EA posted. Rows are [t, o, h, l, c]; anything
 * malformed is dropped, the rest is sorted, de-duplicated and capped.
 * Returns { series, bars } — `series` only contains non-empty timeframes.
 */
export function sanitizeSeries(input) {
  const series = {}
  let bars = 0
  if (!input || typeof input !== 'object') return { series, bars }

  for (const key of SERIES_KEYS) {
    const rows = input[key]
    if (!Array.isArray(rows)) continue

    const seen = new Set()
    const clean = []
    for (const r of rows) {
      if (!Array.isArray(r) || r.length < 5) continue
      const [t, o, h, l, c] = r.map(Number)
      if (![t, o, h, l, c].every(Number.isFinite)) continue
      if (t <= 0 || h < l || o <= 0 || c <= 0) continue
      if (seen.has(t)) continue
      seen.add(t)
      clean.push([Math.floor(t), o, h, l, c])
    }
    clean.sort((a, b) => a[0] - b[0])
    const capped = clean.slice(-MAX_BARS_PER_SERIES)
    if (capped.length) { series[key] = capped; bars += capped.length }
  }
  return { series, bars }
}

/** One line per trade: positionId|SYMBOL|openEpochUtc|closeEpochUtc — trivial for MQL5 to parse. */
export function formatPending(rows = []) {
  return rows
    .map(r => {
      const posId = String(r.external_id || '').replace(/^mt5_/, '')
      const open = Math.floor(new Date(r.opened_at).getTime() / 1000)
      const close = Math.floor(new Date(r.closed_at).getTime() / 1000)
      if (!/^\d+$/.test(posId) || !r.symbol || !Number.isFinite(open) || !Number.isFinite(close)) return null
      return `${posId}|${String(r.symbol).replace(/[|\n\r]/g, '')}|${open}|${close}`
    })
    .filter(Boolean)
    .join('\n')
}