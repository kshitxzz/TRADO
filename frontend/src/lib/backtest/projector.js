// ─────────────────────────────────────────────────────────────────────────
// Backtesting — indicators (pure). Computed ONLY from revealed bars, so they
// can never leak future data. `full()` recomputes everything (timeframe change,
// jump); `tick()` returns just the newest point and is exact for a replay that
// advances one base candle at a time.
// ─────────────────────────────────────────────────────────────────────────

export const INDICATOR_DEFS = [
  { type: 'sma', name: 'Moving Average',                short: 'SMA', pane: 'main', defaults: { period: 20 },            color: '#F59E0B', desc: 'Simple moving average of the close.' },
  { type: 'ema', name: 'Exponential Moving Average',    short: 'EMA', pane: 'main', defaults: { period: 50 },            color: '#38BDF8', desc: 'Moving average weighted toward recent bars.' },
  { type: 'bb',  name: 'Bollinger Bands',               short: 'BB',  pane: 'main', defaults: { period: 20, mult: 2 },   color: '#A78BFA', desc: 'Middle SMA with bands at ± N standard deviations.' },
  { type: 'rsi', name: 'Relative Strength Index',       short: 'RSI', pane: 'sub',  defaults: { period: 14 },            color: '#22D3EE', desc: 'Momentum oscillator, 0–100 (Wilder smoothing).' },
]
export const defOf = (type) => INDICATOR_DEFS.find(d => d.type === type)

export function newIndicator(type, patch = {}) {
  const d = defOf(type)
  return { id: `ind_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, type, params: { ...d.defaults }, color: d.color, visible: true, ...patch }
}

export const indicatorLabel = (ind) => {
  const d = defOf(ind.type)
  return `${d.short} ${Object.values(ind.params).join(' ')}`
}

const pt = (time, value) => (Number.isFinite(value) ? { time, value } : null)
const push = (arr, p) => { if (p) arr.push(p) }

// ── Math ─────────────────────────────────────────────────────────────────
function smaAt(bars, i, period) {
  if (i < period - 1) return NaN
  let s = 0
  for (let k = i - period + 1; k <= i; k++) s += bars[k].close
  return s / period
}
function bbAt(bars, i, period, mult) {
  const m = smaAt(bars, i, period)
  if (!Number.isFinite(m)) return null
  let v = 0
  for (let k = i - period + 1; k <= i; k++) v += (bars[k].close - m) ** 2
  const sd = Math.sqrt(v / period)
  return { upper: m + mult * sd, middle: m, lower: m - mult * sd }
}

// ── Full computation ─────────────────────────────────────────────────────
export function computeFull(ind, bars) {
  const { type, params } = ind
  const n = bars.length

  if (type === 'sma') {
    const line = []
    for (let i = 0; i < n; i++) push(line, pt(bars[i].time, smaAt(bars, i, params.period)))
    return { line }
  }

  if (type === 'bb') {
    const upper = [], middle = [], lower = []
    for (let i = 0; i < n; i++) {
      const b = bbAt(bars, i, params.period, params.mult)
      if (!b) continue
      upper.push({ time: bars[i].time, value: b.upper })
      middle.push({ time: bars[i].time, value: b.middle })
      lower.push({ time: bars[i].time, value: b.lower })
    }
    return { upper, middle, lower }
  }

  if (type === 'ema') {
    const line = []
    const a = 2 / (params.period + 1)
    let ema = NaN
    for (let i = 0; i < n; i++) {
      const c = bars[i].close
      if (i < params.period - 1) continue
      ema = i === params.period - 1 ? smaAt(bars, i, params.period) : a * c + (1 - a) * ema
      push(line, pt(bars[i].time, ema))
    }
    return { line }
  }

  if (type === 'rsi') {
    const line = []
    const p = params.period
    let ag = 0, al = 0
    for (let i = 1; i < n; i++) {
      const ch = bars[i].close - bars[i - 1].close
      const g = Math.max(0, ch), l = Math.max(0, -ch)
      if (i <= p) {
        ag += g / p; al += l / p
        if (i < p) continue
      } else {
        ag = (ag * (p - 1) + g) / p
        al = (al * (p - 1) + l) / p
      }
      push(line, pt(bars[i].time, al === 0 ? 100 : 100 - 100 / (1 + ag / al)))
    }
    return { line }
  }
  return {}
}

// ── Incremental runner ───────────────────────────────────────────────────
/**
 * const run = createRunner(ind)
 * run.full(bars)  → outputs (arrays)         — also seeds the incremental state
 * run.tick(bars)  → outputs ({ line: [pt] })  — newest point only; falls back to full()
 *                   when more than one bar was added since the last call.
 */
export function createRunner(ind) {
  const { type, params } = ind
  let len = 0
  // state of the PREVIOUS (completed) bar: EMA value / RSI averages
  let prevEma = NaN, lastEma = NaN
  let prevAg = 0, prevAl = 0, lastAg = 0, lastAl = 0

  function seed(bars) {
    len = bars.length
    if (type === 'ema') {
      const a = 2 / (params.period + 1)
      let e = NaN, prev = NaN
      for (let i = params.period - 1; i < len; i++) {
        prev = e
        e = i === params.period - 1 ? smaAt(bars, i, params.period) : a * bars[i].close + (1 - a) * e
      }
      prevEma = prev; lastEma = e
    }
    if (type === 'rsi') {
      const p = params.period
      let ag = 0, al = 0, pag = 0, pal = 0
      for (let i = 1; i < len; i++) {
        pag = ag; pal = al
        const ch = bars[i].close - bars[i - 1].close
        const g = Math.max(0, ch), l = Math.max(0, -ch)
        if (i <= p) { ag += g / p; al += l / p }
        else { ag = (ag * (p - 1) + g) / p; al = (al * (p - 1) + l) / p }
      }
      prevAg = pag; prevAl = pal; lastAg = ag; lastAl = al
    }
  }

  return {
    full(bars) { seed(bars); return computeFull(ind, bars) },

    tick(bars) {
      const n = bars.length
      if (!n || n < len || n > len + 1) return this.full(bars)
      const i = n - 1
      const time = bars[i].time

      if (type === 'sma') { len = n; return { line: [pt(time, smaAt(bars, i, params.period))].filter(Boolean) } }

      if (type === 'bb') {
        len = n
        const b = bbAt(bars, i, params.period, params.mult)
        return b ? { upper: [{ time, value: b.upper }], middle: [{ time, value: b.middle }], lower: [{ time, value: b.lower }] } : { upper: [], middle: [], lower: [] }
      }

      if (type === 'ema') {
        if (i < params.period - 1) { len = n; return { line: [] } }
        if (n === len + 1) prevEma = lastEma           // the old forming bar is now complete
        len = n
        const a = 2 / (params.period + 1)
        lastEma = i === params.period - 1 ? smaAt(bars, i, params.period) : a * bars[i].close + (1 - a) * prevEma
        return { line: [pt(time, lastEma)].filter(Boolean) }
      }

      if (type === 'rsi') {
        const p = params.period
        if (n === len + 1) { prevAg = lastAg; prevAl = lastAl }
        len = n
        if (i < 1) return { line: [] }
        const ch = bars[i].close - bars[i - 1].close
        const g = Math.max(0, ch), l = Math.max(0, -ch)
        if (i <= p) { lastAg = prevAg + g / p; lastAl = prevAl + l / p }
        else { lastAg = (prevAg * (p - 1) + g) / p; lastAl = (prevAl * (p - 1) + l) / p }
        if (i < p) return { line: [] }
        return { line: [pt(time, lastAl === 0 ? 100 : 100 - 100 / (1 + lastAg / lastAl))].filter(Boolean) }
      }
      return {}
    },
  }
}