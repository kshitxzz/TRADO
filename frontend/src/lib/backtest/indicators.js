// ─────────────────────────────────────────────────────────────────────────
// Backtesting — indicators (pure).
//
// Every indicator is a small STREAM:  create(params) → { peek(bar), push(bar) }
//   peek(bar)  outputs for a bar that is still forming — does NOT change state
//   push(bar)  outputs for a bar that is final — commits it to the state
// The runner replays final bars with push() and shows the forming bar with
// peek(), so a full recompute and a one-bar replay tick are the same maths and
// can never disagree. Only revealed bars are ever fed in: no look-ahead.
// ─────────────────────────────────────────────────────────────────────────

const ok = (v) => v != null && Number.isFinite(v)
const GREEN = '#26B570', RED = '#D4263A'

// ── building blocks ──────────────────────────────────────────────────────
/** Last `period` pushed values with a running sum. */
function rolling(period) {
  const arr = []
  let sum = 0
  return {
    get len() { return arr.length },
    push(v) { arr.push(v); sum += v; if (arr.length > period) sum -= arr.shift() },
    peekAvg(v) {
      if (arr.length + 1 < period) return null
      return (arr.length === period ? sum - arr[0] + v : sum + v) / period
    },
    /** Window that would exist if `v` were pushed (at most `period` long). */
    peekWindow(v) { const w = arr.length === period ? arr.slice(1) : arr.slice(); w.push(v); return w },
  }
}

/** EMA (SMA-seeded). */
function makeEma(period) {
  const a = 2 / (period + 1)
  let n = 0, sum = 0, ema = null
  return {
    push(v) {
      n++
      if (n < period) sum += v
      else if (n === period) { sum += v; ema = sum / period }
      else ema = a * v + (1 - a) * ema
      return ema
    },
    peek(v) {
      const m = n + 1
      if (m < period) return null
      if (m === period) return (sum + v) / period
      return a * v + (1 - a) * ema
    },
  }
}

/** Wilder's RMA (SMA-seeded) — what RSI / ATR / ADX use. */
function makeRma(period) {
  let n = 0, sum = 0, rma = null
  return {
    push(v) {
      n++
      if (n < period) sum += v
      else if (n === period) { sum += v; rma = sum / period }
      else rma = (rma * (period - 1) + v) / period
      return rma
    },
    peek(v) {
      const m = n + 1
      if (m < period) return null
      if (m === period) return (sum + v) / period
      return (rma * (period - 1) + v) / period
    },
  }
}

/** True range; the first bar is simply high − low. */
function makeTr() {
  let pc = null
  return {
    peek(b) { return pc == null ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc)) },
    push(b) { pc = b.close },
  }
}

const hlc3 = (b) => (b.high + b.low + b.close) / 3
const mean = (w) => w.reduce((s, x) => s + x, 0) / w.length

/** Wrap a pure `peek` and a `commit` into the { peek, push } interface. */
const stream = (peek, commit) => ({ peek, push(b) { const o = peek(b); commit(b, o); return o } })

// ── the library ──────────────────────────────────────────────────────────
// outputs[].color null → uses the indicator's own colour (the one the user can change)
export const INDICATOR_DEFS = [
  // ─── Trend (on price) ───
  {
    type: 'sma', name: 'Moving Average', short: 'SMA', category: 'Trend', pane: 'main', color: '#F59E0B',
    desc: 'Simple moving average of the close.',
    params: [{ key: 'period', label: 'Length', def: 20, min: 1, max: 500 }],
    outputs: [{ key: 'line', kind: 'line', color: null }],
    create: ({ period }) => { const w = rolling(period); return stream((b) => ({ line: w.peekAvg(b.close) }), (b) => w.push(b.close)) },
  },
  {
    type: 'ema', name: 'Exponential Moving Average', short: 'EMA', category: 'Trend', pane: 'main', color: '#38BDF8',
    desc: 'Moving average weighted toward recent bars.',
    params: [{ key: 'period', label: 'Length', def: 50, min: 1, max: 500 }],
    outputs: [{ key: 'line', kind: 'line', color: null }],
    create: ({ period }) => { const e = makeEma(period); return stream((b) => ({ line: e.peek(b.close) }), (b) => e.push(b.close)) },
  },
  {
    type: 'wma', name: 'Weighted Moving Average', short: 'WMA', category: 'Trend', pane: 'main', color: '#F472B6',
    desc: 'Linearly weighted: the newest bar counts the most.',
    params: [{ key: 'period', label: 'Length', def: 20, min: 1, max: 500 }],
    outputs: [{ key: 'line', kind: 'line', color: null }],
    create: ({ period }) => {
      const w = rolling(period), div = (period * (period + 1)) / 2
      return stream((b) => {
        const win = w.peekWindow(b.close)
        return { line: win.length < period ? null : win.reduce((s, x, i) => s + x * (i + 1), 0) / div }
      }, (b) => w.push(b.close))
    },
  },
  {
    type: 'vwap', name: 'VWAP (daily)', short: 'VWAP', category: 'Trend', pane: 'main', color: '#E879F9',
    desc: 'Volume-weighted average price, restarting each UTC day. Needs volume data (crypto).',
    params: [],
    outputs: [{ key: 'line', kind: 'line', color: null }],
    create: () => {
      let day = null, pv = 0, vol = 0
      const calc = (b) => {
        const d = Math.floor(b.time / 86400)
        const same = d === day
        const npv = (same ? pv : 0) + hlc3(b) * (b.volume || 0)
        const nv = (same ? vol : 0) + (b.volume || 0)
        return { d, npv, nv }
      }
      return stream((b) => { const c = calc(b); return { line: c.nv > 0 ? c.npv / c.nv : null } }, (b) => { const c = calc(b); day = c.d; pv = c.npv; vol = c.nv })
    },
  },
  {
    type: 'supertrend', name: 'Supertrend', short: 'ST', category: 'Trend', pane: 'main', color: GREEN,
    desc: 'ATR-based trailing stop that flips with the trend.',
    params: [{ key: 'period', label: 'ATR length', def: 10, min: 1, max: 200 }, { key: 'mult', label: 'Factor', def: 3, min: 0.1, max: 20, step: 0.1 }],
    outputs: [{ key: 'up', kind: 'line', color: GREEN, gaps: true, width: 2 }, { key: 'down', kind: 'line', color: RED, gaps: true, width: 2 }],
    create: ({ period, mult }) => {
      const tr = makeTr(), rma = makeRma(period)
      let st = null                                  // { fu, fl, dir, pc }
      const step = (b) => {
        const atr = rma.peek(tr.peek(b))
        if (atr == null) return { out: { up: null, down: null }, next: null }
        const hl2 = (b.high + b.low) / 2
        const bu = hl2 + mult * atr, bl = hl2 - mult * atr
        let fu = bu, fl = bl, dir = 1
        if (st) {
          fu = bu < st.fu || st.pc > st.fu ? bu : st.fu
          fl = bl > st.fl || st.pc < st.fl ? bl : st.fl
          dir = st.dir === -1 ? (b.close > fu ? 1 : -1) : (b.close < fl ? -1 : 1)
        }
        return { out: { up: dir === 1 ? fl : null, down: dir === -1 ? fu : null }, next: { fu, fl, dir, pc: b.close } }
      }
      return stream((b) => step(b).out, (b) => { const r = step(b); if (r.next) st = r.next; rma.push(tr.peek(b)); tr.push(b) })
    },
  },
  {
    type: 'psar', name: 'Parabolic SAR', short: 'SAR', category: 'Trend', pane: 'main', color: '#FBBF24',
    desc: 'Stop-and-reverse dots that trail price.',
    params: [{ key: 'step', label: 'Start / step', def: 0.02, min: 0.001, max: 1, step: 0.01 }, { key: 'max', label: 'Maximum', def: 0.2, min: 0.01, max: 1, step: 0.01 }],
    outputs: [{ key: 'dots', kind: 'dots', color: null }],
    create: ({ step: af0, max }) => {
      let s = { n: 0 }
      const next = (b) => {
        if (s.n === 0) return { out: null, s: { n: 1, h1: b.high, l1: b.low, c1: b.close } }
        if (s.n === 1) {
          const long = b.close >= s.c1
          const sar = long ? s.l1 : s.h1, ep = long ? b.high : b.low
          return { out: sar, s: { n: 2, long, sar, ep, af: af0, h1: b.high, l1: b.low, h2: s.h1, l2: s.l1 } }
        }
        let { long, sar, ep, af } = s
        let nsar = sar + af * (ep - sar)
        if (long) {
          nsar = Math.min(nsar, s.l1, s.l2)
          if (b.low < nsar) { long = false; nsar = ep; ep = b.low; af = af0 }
          else if (b.high > ep) { ep = b.high; af = Math.min(af + af0, max) }
        } else {
          nsar = Math.max(nsar, s.h1, s.h2)
          if (b.high > nsar) { long = true; nsar = ep; ep = b.high; af = af0 }
          else if (b.low < ep) { ep = b.low; af = Math.min(af + af0, max) }
        }
        return { out: nsar, s: { n: s.n + 1, long, sar: nsar, ep, af, h1: b.high, l1: b.low, h2: s.h1, l2: s.l1 } }
      }
      return stream((b) => ({ dots: next(b).out }), (b) => { s = next(b).s })
    },
  },
  {
    type: 'adx', name: 'Average Directional Index', short: 'ADX', category: 'Trend', pane: 'sub', color: '#F59E0B',
    desc: 'Trend strength (ADX) with the +DI / −DI direction lines.',
    params: [{ key: 'period', label: 'Length', def: 14, min: 1, max: 200 }],
    outputs: [
      { key: 'adx', kind: 'line', color: null, width: 2 },
      { key: 'pdi', kind: 'line', color: GREEN, width: 1 },
      { key: 'mdi', kind: 'line', color: RED, width: 1 },
    ],
    levels: [{ value: 25, color: 'rgba(156,163,175,0.5)' }],
    create: ({ period }) => {
      const trI = makeTr(), trR = makeRma(period), pR = makeRma(period), mR = makeRma(period), aR = makeRma(period)
      let prev = null
      const calc = (b) => {
        const none = { adx: null, pdi: null, mdi: null }
        if (!prev) return { out: none }
        const up = b.high - prev.high, dn = prev.low - b.low
        const pdm = up > dn && up > 0 ? up : 0, mdm = dn > up && dn > 0 ? dn : 0
        const trv = trI.peek(b)
        const ps = pR.peek(pdm), ms = mR.peek(mdm), ts = trR.peek(trv)
        if (ps == null || ms == null || ts == null) return { out: none, pdm, mdm, trv }
        const pdi = ts === 0 ? 0 : (100 * ps) / ts, mdi = ts === 0 ? 0 : (100 * ms) / ts
        const dx = pdi + mdi === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / (pdi + mdi)
        return { out: { adx: aR.peek(dx), pdi, mdi }, pdm, mdm, trv, dx, di: true }
      }
      return stream((b) => calc(b).out, (b) => {
        const c = calc(b)
        if (prev) { pR.push(c.pdm); mR.push(c.mdm); trR.push(c.trv); if (c.di) aR.push(c.dx) }
        trI.push(b); prev = b
      })
    },
  },

  // ─── Volatility ───
  {
    type: 'bb', name: 'Bollinger Bands', short: 'BB', category: 'Volatility', pane: 'main', color: '#A78BFA',
    desc: 'Middle SMA with bands at ± N standard deviations.',
    params: [{ key: 'period', label: 'Length', def: 20, min: 2, max: 500 }, { key: 'mult', label: 'Std dev', def: 2, min: 0.1, max: 10, step: 0.1 }],
    outputs: [
      { key: 'upper', kind: 'line', color: null, width: 1 },
      { key: 'middle', kind: 'line', color: '#F59E0B', width: 1, dashed: true },
      { key: 'lower', kind: 'line', color: null, width: 1 },
    ],
    create: ({ period, mult }) => {
      const w = rolling(period)
      return stream((b) => {
        const win = w.peekWindow(b.close)
        if (win.length < period) return { upper: null, middle: null, lower: null }
        const m = mean(win), sd = Math.sqrt(mean(win.map(x => (x - m) ** 2)))
        return { upper: m + mult * sd, middle: m, lower: m - mult * sd }
      }, (b) => w.push(b.close))
    },
  },
  {
    type: 'keltner', name: 'Keltner Channels', short: 'KC', category: 'Volatility', pane: 'main', color: '#60A5FA',
    desc: 'EMA with bands at ± a multiple of ATR.',
    params: [{ key: 'period', label: 'EMA length', def: 20, min: 1, max: 500 }, { key: 'atr', label: 'ATR length', def: 10, min: 1, max: 200 }, { key: 'mult', label: 'Multiplier', def: 2, min: 0.1, max: 20, step: 0.1 }],
    outputs: [
      { key: 'upper', kind: 'line', color: null, width: 1 },
      { key: 'middle', kind: 'line', color: '#9CA3AF', width: 1, dashed: true },
      { key: 'lower', kind: 'line', color: null, width: 1 },
    ],
    create: ({ period, atr, mult }) => {
      const e = makeEma(period), tr = makeTr(), rma = makeRma(atr)
      return stream((b) => {
        const m = e.peek(b.close), a = rma.peek(tr.peek(b))
        return m == null || a == null ? { upper: null, middle: null, lower: null } : { upper: m + mult * a, middle: m, lower: m - mult * a }
      }, (b) => { e.push(b.close); rma.push(tr.peek(b)); tr.push(b) })
    },
  },
  {
    type: 'donchian', name: 'Donchian Channels', short: 'DC', category: 'Volatility', pane: 'main', color: '#2DD4BF',
    desc: 'Highest high and lowest low over N bars.',
    params: [{ key: 'period', label: 'Length', def: 20, min: 1, max: 500 }],
    outputs: [
      { key: 'upper', kind: 'line', color: null, width: 1 },
      { key: 'middle', kind: 'line', color: '#9CA3AF', width: 1, dashed: true },
      { key: 'lower', kind: 'line', color: null, width: 1 },
    ],
    create: ({ period }) => {
      const hi = rolling(period), lo = rolling(period)
      return stream((b) => {
        const h = hi.peekWindow(b.high), l = lo.peekWindow(b.low)
        if (h.length < period) return { upper: null, middle: null, lower: null }
        const u = Math.max(...h), d = Math.min(...l)
        return { upper: u, middle: (u + d) / 2, lower: d }
      }, (b) => { hi.push(b.high); lo.push(b.low) })
    },
  },
  {
    type: 'atr', name: 'Average True Range', short: 'ATR', category: 'Volatility', pane: 'sub', color: '#FB923C',
    desc: 'Average bar range (Wilder smoothing) — a volatility gauge.',
    params: [{ key: 'period', label: 'Length', def: 14, min: 1, max: 200 }],
    outputs: [{ key: 'line', kind: 'line', color: null, width: 1.5 }],
    create: ({ period }) => { const tr = makeTr(), r = makeRma(period); return stream((b) => ({ line: r.peek(tr.peek(b)) }), (b) => { r.push(tr.peek(b)); tr.push(b) }) },
  },

  // ─── Momentum ───
  {
    type: 'rsi', name: 'Relative Strength Index', short: 'RSI', category: 'Momentum', pane: 'sub', color: '#22D3EE',
    desc: 'Momentum oscillator, 0–100 (Wilder smoothing).',
    params: [{ key: 'period', label: 'Length', def: 14, min: 2, max: 200 }],
    outputs: [{ key: 'line', kind: 'line', color: null, width: 1.5 }],
    levels: [{ value: 70, color: 'rgba(244,63,94,0.55)' }, { value: 30, color: 'rgba(34,197,94,0.55)' }],
    range: [0, 100],
    create: ({ period }) => {
      const g = makeRma(period), l = makeRma(period)
      let pc = null
      const calc = (b) => {
        if (pc == null) return null
        const ch = b.close - pc
        const ag = g.peek(Math.max(ch, 0)), al = l.peek(Math.max(-ch, 0))
        if (ag == null) return null
        return al === 0 ? 100 : 100 - 100 / (1 + ag / al)
      }
      return stream((b) => ({ line: calc(b) }), (b) => { if (pc != null) { const ch = b.close - pc; g.push(Math.max(ch, 0)); l.push(Math.max(-ch, 0)) } pc = b.close })
    },
  },
  {
    type: 'macd', name: 'MACD', short: 'MACD', category: 'Momentum', pane: 'sub', color: '#3B82F6',
    desc: 'Fast EMA − slow EMA, its signal line and the histogram.',
    params: [{ key: 'fast', label: 'Fast', def: 12, min: 1, max: 200 }, { key: 'slow', label: 'Slow', def: 26, min: 2, max: 400 }, { key: 'signal', label: 'Signal', def: 9, min: 1, max: 100 }],
    outputs: [
      { key: 'hist', kind: 'hist', posColor: GREEN, negColor: RED },
      { key: 'macd', kind: 'line', color: null, width: 1.5 },
      { key: 'signal', kind: 'line', color: '#F59E0B', width: 1.5 },
    ],
    levels: [{ value: 0, color: 'rgba(156,163,175,0.4)' }],
    create: ({ fast, slow, signal }) => {
      const f = makeEma(fast), s = makeEma(slow), sig = makeEma(signal)
      const calc = (b) => {
        const fv = f.peek(b.close), sv = s.peek(b.close)
        if (fv == null || sv == null) return { out: { macd: null, signal: null, hist: null } }
        const m = fv - sv, sg = sig.peek(m)
        return { out: { macd: m, signal: sg, hist: sg == null ? null : m - sg }, m }
      }
      return stream((b) => calc(b).out, (b) => { const c = calc(b); f.push(b.close); s.push(b.close); if (c.m != null) sig.push(c.m) })
    },
  },
  {
    type: 'stoch', name: 'Stochastic', short: 'Stoch', category: 'Momentum', pane: 'sub', color: '#3B82F6',
    desc: '%K / %D — where the close sits in the recent high–low range.',
    params: [{ key: 'k', label: '%K length', def: 14, min: 1, max: 200 }, { key: 'smooth', label: '%K smoothing', def: 3, min: 1, max: 50 }, { key: 'd', label: '%D smoothing', def: 3, min: 1, max: 50 }],
    outputs: [{ key: 'k', kind: 'line', color: null, width: 1.5 }, { key: 'd', kind: 'line', color: '#F59E0B', width: 1.5 }],
    levels: [{ value: 80, color: 'rgba(244,63,94,0.55)' }, { value: 20, color: 'rgba(34,197,94,0.55)' }],
    range: [0, 100],
    create: ({ k, smooth, d }) => {
      const hi = rolling(k), lo = rolling(k), ks = rolling(smooth), ds = rolling(d)
      const calc = (b) => {
        const h = hi.peekWindow(b.high), l = lo.peekWindow(b.low)
        if (h.length < k) return { out: { k: null, d: null } }
        const hh = Math.max(...h), ll = Math.min(...l)
        const raw = hh === ll ? 50 : (100 * (b.close - ll)) / (hh - ll)
        const kv = ks.peekAvg(raw)
        return { out: { k: kv, d: kv == null ? null : ds.peekAvg(kv) }, raw }
      }
      return stream((b) => calc(b).out, (b) => {
        const c = calc(b)
        hi.push(b.high); lo.push(b.low)
        if (c.raw != null) ks.push(c.raw)
        if (c.out.k != null) ds.push(c.out.k)
      })
    },
  },
  {
    type: 'cci', name: 'Commodity Channel Index', short: 'CCI', category: 'Momentum', pane: 'sub', color: '#A78BFA',
    desc: 'How far the typical price is from its average, in mean deviations.',
    params: [{ key: 'period', label: 'Length', def: 20, min: 2, max: 300 }],
    outputs: [{ key: 'line', kind: 'line', color: null, width: 1.5 }],
    levels: [{ value: 100, color: 'rgba(244,63,94,0.5)' }, { value: -100, color: 'rgba(34,197,94,0.5)' }],
    create: ({ period }) => {
      const w = rolling(period)
      return stream((b) => {
        const tp = hlc3(b), win = w.peekWindow(tp)
        if (win.length < period) return { line: null }
        const m = mean(win), md = mean(win.map(x => Math.abs(x - m)))
        return { line: md === 0 ? 0 : (tp - m) / (0.015 * md) }
      }, (b) => w.push(hlc3(b)))
    },
  },
  {
    type: 'willr', name: 'Williams %R', short: '%R', category: 'Momentum', pane: 'sub', color: '#F472B6',
    desc: 'Close vs the recent high–low range, from −100 to 0.',
    params: [{ key: 'period', label: 'Length', def: 14, min: 1, max: 200 }],
    outputs: [{ key: 'line', kind: 'line', color: null, width: 1.5 }],
    levels: [{ value: -20, color: 'rgba(244,63,94,0.5)' }, { value: -80, color: 'rgba(34,197,94,0.5)' }],
    range: [-100, 0],
    create: ({ period }) => {
      const hi = rolling(period), lo = rolling(period)
      return stream((b) => {
        const h = hi.peekWindow(b.high), l = lo.peekWindow(b.low)
        if (h.length < period) return { line: null }
        const hh = Math.max(...h), ll = Math.min(...l)
        return { line: hh === ll ? -50 : (-100 * (hh - b.close)) / (hh - ll) }
      }, (b) => { hi.push(b.high); lo.push(b.low) })
    },
  },
  {
    type: 'roc', name: 'Rate of Change', short: 'ROC', category: 'Momentum', pane: 'sub', color: '#34D399',
    desc: 'Percent change of the close over N bars.',
    params: [{ key: 'period', label: 'Length', def: 9, min: 1, max: 300 }],
    outputs: [{ key: 'line', kind: 'line', color: null, width: 1.5 }],
    levels: [{ value: 0, color: 'rgba(156,163,175,0.4)' }],
    create: ({ period }) => {
      const w = rolling(period + 1)
      return stream((b) => { const win = w.peekWindow(b.close); return { line: win.length < period + 1 || win[0] === 0 ? null : ((b.close - win[0]) / win[0]) * 100 } }, (b) => w.push(b.close))
    },
  },
  {
    type: 'mom', name: 'Momentum', short: 'MOM', category: 'Momentum', pane: 'sub', color: '#FBBF24',
    desc: 'Close minus the close N bars ago.',
    params: [{ key: 'period', label: 'Length', def: 10, min: 1, max: 300 }],
    outputs: [{ key: 'line', kind: 'line', color: null, width: 1.5 }],
    levels: [{ value: 0, color: 'rgba(156,163,175,0.4)' }],
    create: ({ period }) => {
      const w = rolling(period + 1)
      return stream((b) => { const win = w.peekWindow(b.close); return { line: win.length < period + 1 ? null : b.close - win[0] } }, (b) => w.push(b.close))
    },
  },

  // ─── Volume ───
  {
    type: 'volume', name: 'Volume', short: 'Vol', category: 'Volume', pane: 'sub', color: '#9CA3AF',
    desc: 'Traded volume per bar, coloured by candle direction. Needs volume data (crypto).',
    params: [],
    outputs: [{ key: 'vol', kind: 'hist', posColor: GREEN, negColor: RED }],
    create: () => stream((b) => ({ vol: b.volume || 0, vol_c: b.close >= b.open ? 'rgba(38,181,112,0.75)' : 'rgba(212,38,58,0.75)' }), () => {}),
  },
  {
    type: 'obv', name: 'On-Balance Volume', short: 'OBV', category: 'Volume', pane: 'sub', color: '#38BDF8',
    desc: 'Running total of volume, added on up closes and subtracted on down closes.',
    params: [],
    outputs: [{ key: 'line', kind: 'line', color: null, width: 1.5 }],
    create: () => {
      let obv = 0, pc = null
      const calc = (b) => (pc == null ? 0 : obv + Math.sign(b.close - pc) * (b.volume || 0))
      return stream((b) => ({ line: calc(b) }), (b) => { obv = calc(b); pc = b.close })
    },
  },
]

export const INDICATOR_CATEGORIES = ['Trend', 'Momentum', 'Volatility', 'Volume']
export const defOf = (type) => INDICATOR_DEFS.find(d => d.type === type)

export function newIndicator(type, patch = {}) {
  const d = defOf(type)
  const params = {}
  d.params.forEach(p => { params[p.key] = p.def })
  return { id: `ind_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, type, params, color: d.color, visible: true, ...patch }
}

/** Params with any missing / out-of-range value replaced by its default (old saved indicators stay valid). */
export function cleanParams(ind) {
  const d = defOf(ind.type)
  const out = {}
  for (const p of d.params) {
    const v = Number(ind.params?.[p.key])
    out[p.key] = Number.isFinite(v) && v >= p.min && v <= p.max ? v : p.def
  }
  return out
}

export const indicatorLabel = (ind) => {
  const d = defOf(ind.type)
  const v = d.params.map(p => ind.params?.[p.key] ?? p.def)
  return v.length ? `${d.short} ${v.join(' ')}` : d.short
}

// ── runner ───────────────────────────────────────────────────────────────
function toPoints(def, time, out, into) {
  for (const o of def.outputs) {
    const v = out[o.key]
    const arr = into[o.key] || (into[o.key] = [])
    if (ok(v)) {
      const p = { time, value: v }
      if (o.kind === 'hist') p.color = out[`${o.key}_c`] || (v >= 0 ? o.posColor : o.negColor)
      arr.push(p)
    } else if (o.gaps) {
      arr.push({ time })                    // whitespace — breaks the line
    }
  }
  return into
}

/**
 * const run = createRunner(ind)
 * run.full(bars) → { [outputKey]: points[] }
 * run.tick(bars) → same keys, newest point only (exact; falls back to full() if more than one bar was added)
 */
export function createRunner(ind) {
  const def = defOf(ind.type)
  const params = cleanParams(ind)
  let inst = def.create(params)
  let len = 0

  return {
    full(bars) {
      inst = def.create(params)
      const out = {}
      const n = bars.length
      for (let i = 0; i < n - 1; i++) toPoints(def, bars[i].time, inst.push(bars[i]), out)
      if (n) toPoints(def, bars[n - 1].time, inst.peek(bars[n - 1]), out)
      len = n
      return out
    },
    tick(bars) {
      const n = bars.length
      if (!n || n < len || n > len + 1) return this.full(bars)
      if (n === len + 1) inst.push(bars[n - 2])          // the previous forming bar is now final
      len = n
      return toPoints(def, bars[n - 1].time, inst.peek(bars[n - 1]), {})
    },
  }
}