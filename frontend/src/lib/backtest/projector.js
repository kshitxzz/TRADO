// ─────────────────────────────────────────────────────────────────────────
// Backtesting — projector: market coordinates ⇄ chart pixels.
//
// Lightweight Charts only maps times that exist as bars, but drawings (a long
// position box, a ray) routinely extend into the not-yet-revealed future. So
// time is mapped through the chart's LOGICAL index: a time inside the data is
// interpolated between its two neighbouring bars; a time beyond the last bar
// is extrapolated with the timeframe's width.
// ─────────────────────────────────────────────────────────────────────────

export function makeProjector({ chart, series, getBars, getTfSecs }) {
  const ts = () => chart.timeScale()

  function timeToLogical(t) {
    const bars = getBars(), n = bars.length, tf = getTfSecs()
    if (!n) return null
    if (t <= bars[0].time) return (t - bars[0].time) / tf
    if (t >= bars[n - 1].time) return n - 1 + (t - bars[n - 1].time) / tf
    let lo = 0, hi = n - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (bars[mid].time <= t) lo = mid; else hi = mid
    }
    return lo + (t - bars[lo].time) / (bars[hi].time - bars[lo].time)
  }

  function logicalToTime(l) {
    const bars = getBars(), n = bars.length, tf = getTfSecs()
    if (!n || l == null) return null
    if (l <= 0) return bars[0].time + l * tf
    if (l >= n - 1) return bars[n - 1].time + (l - (n - 1)) * tf
    const i = Math.floor(l), f = l - i
    return bars[i].time + f * (bars[i + 1].time - bars[i].time)
  }

  const timeToX = (t) => {
    const l = timeToLogical(t)
    return l == null ? null : ts().logicalToCoordinate(l)
  }
  const xToTime = (x) => {
    const l = ts().coordinateToLogical(x)
    return l == null ? null : logicalToTime(l)
  }
  /** Snap an x to the nearest bar centre (works in the empty future too). */
  const snapX = (x) => {
    const l = ts().coordinateToLogical(x)
    if (l == null) return null
    const r = Math.round(l)
    return { time: logicalToTime(r), logical: r }
  }
  const priceToY = (p) => series.priceToCoordinate(p)
  const yToPrice = (y) => series.coordinateToPrice(y)

  /** Market point → pixel point (null if off-chart / not yet computable). */
  const toPx = (pt) => {
    const x = timeToX(pt.time), y = priceToY(pt.price)
    return x == null || y == null ? null : { x, y }
  }
  /** Pixel → market point; optional magnet snaps the price to the nearest O/H/L/C of that bar. */
  const toMarket = (px, { magnet = false, magnetRange = 14 } = {}) => {
    const snap = snapX(px.x)
    let price = yToPrice(px.y)
    if (snap == null || price == null) return null
    if (magnet) {
      const bars = getBars()
      const bar = bars[snap.logical]
      if (bar) {
        let best = null, bestD = magnetRange
        for (const v of [bar.open, bar.high, bar.low, bar.close]) {
          const vy = priceToY(v)
          if (vy != null && Math.abs(vy - px.y) < bestD) { best = v; bestD = Math.abs(vy - px.y) }
        }
        if (best != null) price = best
      }
    }
    return { time: snap.time, price }
  }

  /** x of the bar that CONTAINS `time` (never a fractional position, which the chart library can't place). */
  const barX = (time) => {
    const bars = getBars(), n = bars.length
    if (!n) return null
    let lo = 0, hi = n - 1, ans = 0
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (bars[mid].time <= time) { ans = mid; lo = mid + 1 } else hi = mid - 1 }
    return ts().logicalToCoordinate(ans)
  }

  const barCountBetween = (t0, t1) => {
    const a = timeToLogical(t0), b = timeToLogical(t1)
    return a == null || b == null ? null : b - a
  }

  return { timeToLogical, logicalToTime, timeToX, barX, xToTime, snapX, priceToY, yToPrice, toPx, toMarket, barCountBetween }
}