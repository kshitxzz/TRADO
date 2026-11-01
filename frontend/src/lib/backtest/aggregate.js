// ─────────────────────────────────────────────────────────────────────────
// Backtesting — timeframe maths. PURE: no React, no network, no imports, so the
// same code runs in the browser, in the data-ingest tool and in the unit tests.
//
// The rule that keeps candles accurate:
//   ONE canonical series (1-minute candles) is loaded per session, and EVERY other
//   timeframe is computed from it here — never fetched separately. Two timeframes
//   can therefore never disagree, and the forming candle only ever contains minutes
//   up to the replay clock (no look-ahead).
//
// Session anchors (where a 4h / daily / weekly / monthly candle starts):
//   • 'ny17' — forex, metals, energy. A trading day runs 17:00 → 17:00 America/New_York,
//              DST-aware. This is what MT5 brokers (GMT+2/+3 servers) and TradingView
//              forex charts use, so a daily candle here matches the one the trader sees
//              on their broker. NY DST switches happen Sunday 02:00, while FX is closed,
//              so no trading day is ever 23 or 25 hours long.
//   • 'utc'  — crypto (24/7). Days start 00:00 UTC, weeks Monday 00:00 UTC.
// ─────────────────────────────────────────────────────────────────────────

const HOUR = 3600
const DAY = 86400

// ── Timeframe keys ───────────────────────────────────────────────────────
// A timeframe key is "<n><unit>": 7m, 90m, 4h, 1d, 1w, 1M … any whole number.
const UNIT_SECS = { m: 60, h: 3600, d: 86400, w: 604800, M: 2592000 }   // M = nominal 30 days (axis spacing only)
export const TF_UNITS = [
  { unit: 'm', label: 'minutes' }, { unit: 'h', label: 'hours' }, { unit: 'd', label: 'days' },
  { unit: 'w', label: 'weeks' },   { unit: 'M', label: 'months' },
]

export function parseTf(key) {
  const m = /^(\d{1,4})([mhdwM])$/.exec(String(key || ''))
  if (!m || +m[1] < 1) return { n: 15, unit: 'm', secs: 900, valid: false }
  return { n: +m[1], unit: m[2], secs: +m[1] * UNIT_SECS[m[2]], valid: true }
}
export const isValidTf = (key) => parseTf(key).valid
export const tfKey = (n, unit) => `${n}${unit}`
export const tfSecs = (key) => parseTf(key).secs
export const tfUnit = (key) => parseTf(key).unit

/** 1m 5m 90m 4h D 3D W M — the label shown on the chart toolbar. */
export function tfLabel(key) {
  const { n, unit } = parseTf(key)
  if (unit === 'd') return n === 1 ? 'D' : `${n}D`
  if (unit === 'w') return n === 1 ? 'W' : `${n}W`
  if (unit === 'M') return n === 1 ? 'M' : `${n}M`
  return `${n}${unit}`
}

/** Spoken name for menus: "5 minutes", "1 hour", "1 day". */
export function tfName(key) {
  const { n, unit } = parseTf(key)
  const word = { m: 'minute', h: 'hour', d: 'day', w: 'week', M: 'month' }[unit]
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Ready-made intervals shown in the timeframe menu. */
export const TF_PRESETS = [
  { title: 'Minutes', keys: ['1m', '2m', '3m', '5m', '10m', '15m', '30m', '45m'] },
  { title: 'Hours',   keys: ['1h', '2h', '3h', '4h', '6h', '8h', '12h'] },
  { title: 'Days',    keys: ['1d', '2d', '3d'] },
  { title: 'Weeks & months', keys: ['1w', '2w', '1M'] },
]
export const DEFAULT_FAVORITE_TFS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w']

/** Every session replays on 1-minute candles; every timeframe is built from them. */
export const BASE_TF = '1m'
export const BASE_SECS = 60

/** Any valid interval of a minute or more can be built from the 1m base, so no reload is ever needed. */
export const baseFor = (tf) => (parseTf(tf).valid ? BASE_TF : null)

// ── New York 17:00 trading-day maths (no Intl, no per-call Date churn) ──
const dstCache = new Map()
const dowOf = (y, m, d) => new Date(Date.UTC(y, m, d)).getUTCDay()           // 0 = Sunday
const nthSunday = (y, m, n) => 1 + ((7 - dowOf(y, m, 1)) % 7) + 7 * (n - 1)
const lastSunday = (y, m) => { const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); return last - dowOf(y, m, last) }

/** US daylight-saving window for a year, in UTC seconds. 2007+: 2nd Sun Mar → 1st Sun Nov. Before: 1st Sun Apr → last Sun Oct. */
function dstWindow(y) {
  let w = dstCache.get(y)
  if (!w) {
    const [sm, sd, em, ed] = y >= 2007
      ? [2, nthSunday(y, 2, 2), 10, nthSunday(y, 10, 1)]
      : [3, nthSunday(y, 3, 1), 9, lastSunday(y, 9)]
    w = { start: Date.UTC(y, sm, sd, 7) / 1000, end: Date.UTC(y, em, ed, 6) / 1000 }   // switch at 02:00 local: 07:00 UTC (EST) / 06:00 UTC (EDT)
    dstCache.set(y, w)
  }
  return w
}

/** America/New_York offset from UTC at instant t: −4h in daylight time, −5h otherwise. */
export function nyOffsetSecs(t) {
  const w = dstWindow(new Date(t * 1000).getUTCFullYear())
  return t >= w.start && t < w.end ? -4 * HOUR : -5 * HOUR
}

/** UTC instant whose New York wall-clock reading is L (L = wall-clock seconds treated as if they were UTC). Used at 17:00 only. */
function wallToUtc(L) {
  const est = L + 5 * HOUR
  return nyOffsetSecs(est) === -5 * HOUR ? est : L + 4 * HOUR
}

/** Index of the trading day (= the calendar date on which it ENDS, days since 1970-01-01). */
const fxDayStartUtc = (idx) => wallToUtc(idx * DAY - 7 * HOUR)             // 17:00 New York on the previous calendar date

let _fd = { s: 0, e: 0, idx: 0 }                                           // one-entry memo: consecutive candles share a day
function fxDay(t) {
  if (t >= _fd.s && t < _fd.e) return _fd
  const idx = Math.floor((t + nyOffsetSecs(t) + 7 * HOUR) / DAY)
  _fd = { s: fxDayStartUtc(idx), e: fxDayStartUtc(idx + 1), idx }
  return _fd
}

/** Start (UTC seconds) of the New York trading day containing t. */
export const fxDayStart = (t) => fxDay(t).s

// ── Bucket maths ─────────────────────────────────────────────────────────
export const ANCHOR_UTC = 'utc'
export const ANCHOR_NY17 = 'ny17'

function nyBucketStart(t, n, unit, secs) {
  const d = fxDay(t)
  if (unit === 'm' || unit === 'h') return d.s + Math.floor((t - d.s) / secs) * secs     // anchored to the day start; never crosses it
  if (unit === 'd') return n === 1 ? d.s : fxDayStartUtc(Math.floor(d.idx / n) * n)
  if (unit === 'w') {
    const wd = (d.idx + 3) % 7                                                           // 0 = Monday (1970-01-01 was a Thursday)
    const weekNo = (d.idx - wd + 3) / 7                                                  // whole number: d.idx - wd is a Monday
    return fxDayStartUtc(Math.floor(weekNo / n) * n * 7 - 3)                             // the Monday trading day = opens Sunday 17:00 NY
  }
  const dt = new Date(d.idx * DAY * 1000)
  const mi = Math.floor((dt.getUTCFullYear() * 12 + dt.getUTCMonth()) / n) * n
  return fxDayStartUtc(Date.UTC(Math.floor(mi / 12), mi % 12, 1) / 1000 / DAY)
}

/** Start of the bar containing `t` (unix seconds). */
export function bucketStart(t, key, anchor = ANCHOR_UTC) {
  const { n, unit, secs } = parseTf(key)
  if (anchor === ANCHOR_NY17) return nyBucketStart(t, n, unit, secs)
  if (unit === 'w') { const off = 4 * DAY; return Math.floor((t - off) / secs) * secs + off }   // 1970-01-05 was a Monday
  if (unit === 'M') {
    const d = new Date(t * 1000)
    const b = Math.floor((d.getUTCFullYear() * 12 + d.getUTCMonth()) / n) * n
    return Date.UTC(Math.floor(b / 12), b % 12, 1) / 1000
  }
  return Math.floor(t / secs) * secs
}

// ── Building bars ────────────────────────────────────────────────────────
const fresh = (time, c) => ({ time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 })
function fold(bar, c) {
  if (c.high > bar.high) bar.high = c.high
  if (c.low < bar.low) bar.low = c.low
  bar.close = c.close
  bar.volume += c.volume || 0
}

/** Aggregate an ascending candle list (any resolution that fits the bars) into `tf` bars. Reference implementation. */
export function aggregate(candles, tf, anchor = ANCHOR_UTC) {
  const out = []
  let cur = null
  for (const c of candles) {
    const t = bucketStart(c.time, tf, anchor)
    if (!cur || cur.time !== t) { cur = fresh(t, c); out.push(cur) } else fold(cur, c)
  }
  return out
}

/** 1m candles → hourly bars (UTC hours, which every anchor shares). Used to give higher timeframes deep history cheaply. */
export function foldToHourly(m1) { return aggregate(m1, '1h', ANCHOR_UTC) }

/**
 * History bars are hourly, so they can only feed intervals made of whole hours.
 * Minute charts (5m, 15m…) simply start where the 1m candles start — they never get coarse bars faked into them.
 */
export const histFeeds = (tf) => tfSecs(tf) % HOUR === 0

/**
 * Index of the bucket layout of `base` (1m) candles into `tf` bars.
 *   bars[i]    = the FULL bar;  starts[i] = index of its first base candle;  bucketOf[j] = bar index of base candle j
 *   histBars   = completed bars from the hourly history that lies BEFORE base[0]
 *   seed       = when the first base bar began inside the history, the part of it that lies in the history
 */
export function buildTfIndex(base, tf, { anchor = ANCHOR_UTC, hist = null } = {}) {
  const step = tfSecs(tf)
  const bars = [], starts = []
  const bucketOf = new Int32Array(base.length)
  let cur = null
  for (let j = 0; j < base.length; j++) {
    const c = base[j]
    const t = bucketStart(c.time, tf, anchor)
    if (!cur || cur.time !== t) { cur = fresh(t, c); bars.push(cur); starts.push(j) } else fold(cur, c)
    bucketOf[j] = bars.length - 1
  }

  let histBars = [], seed = null
  if (hist && hist.length && histFeeds(tf)) {
    histBars = aggregate(hist, tf, anchor)
    if (bars.length && histBars.length && histBars[histBars.length - 1].time === bars[0].time) {
      seed = histBars.pop()
      const f = bars[0]
      bars[0] = { time: f.time, open: seed.open, high: Math.max(seed.high, f.high), low: Math.min(seed.low, f.low), close: f.close, volume: seed.volume + f.volume }
    }
  }
  return { tf, step, anchor, bars, starts, bucketOf, histBars, seed }
}

/** The bar `b`, aggregated from its first base candle up to base index `last` (inclusive) — only what has been revealed. */
export function partialBar(base, idx, b, last) {
  const s = idx.starts[b]
  const first = base[s]
  const bar = (b === 0 && idx.seed)
    ? { time: idx.bars[0].time, open: idx.seed.open, high: Math.max(idx.seed.high, first.high), low: Math.min(idx.seed.low, first.low), close: first.close, volume: idx.seed.volume + (first.volume || 0) }
    : fresh(idx.bars[b].time, first)
  for (let j = s + 1; j <= last; j++) fold(bar, base[j])
  return bar
}

/** Bars visible when `count` base candles are revealed: history, all completed bars, plus the forming bar built ONLY from revealed candles. */
export function barsAt(base, idx, count) {
  if (count <= 0) return []
  const last = Math.min(count, base.length) - 1
  const b = idx.bucketOf[last]
  const out = idx.histBars.slice()
  for (let i = 0; i < b; i++) out.push(idx.bars[i])     // completed: their candles all precede `last`'s bucket
  out.push(partialBar(base, idx, b, last))
  return out
}

/**
 * How many base candles to step so the chart's own timeframe advances by one bar:
 * mid-bar → finish the forming bar; on a bar boundary → one whole new bar.
 */
export function candlesToNextBar(idx, count, baseLen) {
  if (count >= baseLen) return 0
  const nb = idx.bucketOf[count]                    // bar that the next base candle belongs to
  const end = idx.starts[nb + 1] ?? baseLen
  return Math.max(1, end - count)
}

/** Index of the first base candle whose CLOSE is >= t (first candle not yet closed at time t). */
export function firstIndexAtOrAfter(base, baseSecs, t) {
  let lo = 0, hi = base.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (base[mid].time + baseSecs >= t) hi = mid; else lo = mid + 1
  }
  return lo
}

// ── Integrity ────────────────────────────────────────────────────────────
/**
 * Make a raw candle list safe to build bars from, and say exactly what was wrong.
 * Nothing is invented: bad rows are dropped, an inconsistent high/low is widened to
 * contain open and close, duplicates keep their first row. Real gaps (weekends,
 * holidays, no-quote minutes) are left as gaps — exactly as an MT5 chart shows them.
 */
export function cleanCandles(raw) {
  const rep = { input: raw.length, output: 0, invalid: 0, repaired: 0, duplicates: 0, outOfOrder: 0, largestGapSecs: 0 }
  const ok = []
  for (const c of raw) {
    if (!c || ![c.time, c.open, c.high, c.low, c.close].every(Number.isFinite) || c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) { rep.invalid++; continue }
    let { high, low } = c
    const hi = Math.max(c.open, c.close, high), lo = Math.min(c.open, c.close, low)
    if (hi !== high || lo !== low) { high = hi; low = lo; rep.repaired++ }
    ok.push({ time: c.time, open: c.open, high, low, close: c.close, volume: Number.isFinite(c.volume) ? c.volume : 0 })
  }
  for (let i = 1; i < ok.length; i++) if (ok[i].time < ok[i - 1].time) { rep.outOfOrder++; break }
  if (rep.outOfOrder) ok.sort((a, b) => a.time - b.time)
  const out = []
  for (const c of ok) {
    const prev = out[out.length - 1]
    if (prev && prev.time === c.time) { rep.duplicates++; continue }
    if (prev && c.time - prev.time > rep.largestGapSecs) rep.largestGapSecs = c.time - prev.time
    out.push(c)
  }
  rep.output = out.length
  return { candles: out, report: rep }
}