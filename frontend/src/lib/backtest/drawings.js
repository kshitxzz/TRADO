// ─────────────────────────────────────────────────────────────────────────
// Backtesting — drawing tools (pure: catalog, defaults, geometry, measuring).
// Rendering lives in components/backtest/DrawingOverlay.jsx.
//
// A drawing is anchored in MARKET coordinates, never pixels:
//   { id, type, points:[{ time (unix s), price }], style:{…}, text?, emoji?,
//     locked, visible, tfs? (timeframes it shows on; undefined = all) }
// so it survives zooming, scrolling and timeframe changes.
// ─────────────────────────────────────────────────────────────────────────

export const DASHES = { solid: undefined, dashed: '8 5', dotted: '2 4' }

// type → how it is created / drawn.   points: clicks needed ('free' = freehand)
export const TOOLS = {
  trendline: { label: 'Trend line',         points: 2, kind: 'line',     key: 'T' },
  ray:       { label: 'Ray',                points: 2, kind: 'line' },
  info:      { label: 'Info line',          points: 2, kind: 'line' },
  extended:  { label: 'Extended line',      points: 2, kind: 'line' },
  hline:     { label: 'Horizontal line',    points: 1, kind: 'line',     key: 'H' },
  hray:      { label: 'Horizontal ray',     points: 1, kind: 'line',     key: 'J' },
  vline:     { label: 'Vertical line',      points: 1, kind: 'line',     key: 'V' },
  cross:     { label: 'Cross line',         points: 1, kind: 'line',     key: 'C' },
  channel:   { label: 'Parallel channel',   points: 3, kind: 'channel' },
  fib:       { label: 'Fib retracement',    points: 2, kind: 'fib' },
  rect:      { label: 'Rectangle',          points: 2, kind: 'shape',    key: 'Shift+R' },
  ellipse:   { label: 'Ellipse',            points: 2, kind: 'shape' },
  triangle:  { label: 'Triangle',           points: 3, kind: 'shape' },
  long:      { label: 'Long position',      points: 1, kind: 'position' },
  short:     { label: 'Short position',     points: 1, kind: 'position' },
  priceRange:{ label: 'Price range',        points: 2, kind: 'measure' },
  dateRange: { label: 'Date range',         points: 2, kind: 'measure' },
  measure:   { label: 'Date & price range', points: 2, kind: 'measure',  key: 'M' },
  brush:     { label: 'Brush',              points: 'free', kind: 'brush' },
  text:      { label: 'Text',               points: 1, kind: 'text' },
  emoji:     { label: 'Emoji',              points: 1, kind: 'emoji' },
  alert:     { label: 'Alert',              points: 1, kind: 'alert' },   // created from the right-click menu, not a toolbar tool
}

// Toolbar structure (left rail). `tools` = fly-out menu; `solo` = a single button.
export const TOOL_MENUS = [
  { id: 'lines',    label: 'Lines',                  icon: 'trend',    sections: [
    { title: 'Lines', tools: ['trendline', 'ray', 'info', 'extended', 'hline', 'hray', 'vline', 'cross'] },
  ] },
  { id: 'fib',      label: 'Fib & channels',         icon: 'fib',      sections: [{ title: 'Fibonacci', tools: ['fib'] }, { title: 'Channels', tools: ['channel'] }] },
  { id: 'shapes',   label: 'Shapes',                 icon: 'shapes',   sections: [{ title: 'Shapes', tools: ['rect', 'ellipse', 'triangle'] }] },
  { id: 'forecast', label: 'Forecasting & measure',  icon: 'forecast', sections: [
    { title: 'Forecasting', tools: ['long', 'short'] },
    { title: 'Measurers',   tools: ['priceRange', 'dateRange', 'measure'] },
  ] },
]

// Visibility is by interval TYPE, so it works for any custom timeframe (7m, 90m, 3D …).
export const TF_CATEGORIES = [
  { id: 'm', label: 'Minutes' }, { id: 'h', label: 'Hours' }, { id: 'd', label: 'Days' },
  { id: 'w', label: 'Weeks' }, { id: 'M', label: 'Months' },
]
export const tfCategoryOf = (key) => String(key || '').slice(-1)
/** Does this drawing show on the given timeframe? (`tfs` may also hold exact keys from older saves.) */
export const visibleOnTf = (d, tfKey) => !d.tfs || d.tfs.includes(tfKey) || d.tfs.includes(tfCategoryOf(tfKey))

// ── Palette (grays + 6 hues × 10 lightness steps, TradingView-style) ─────
const hsl = (h, s, l) => {
  s /= 100; l /= 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const hex = (x) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`
}
export const PALETTE = [
  ['#FFFFFF', '#E5E7EB', '#D1D5DB', '#9CA3AF', '#6B7280', '#4B5563', '#374151', '#1F2937', '#111827', '#000000'],
  ...[0, 28, 52, 140, 205, 275].map(h =>
    [92, 84, 74, 64, 56, 50, 42, 34, 26, 18].map(l => hsl(h, 78, l))),
]

// ── Defaults ─────────────────────────────────────────────────────────────
const BLUE = '#3B82F6'
export const DEFAULT_STYLE = {
  color: BLUE, width: 2, dash: 'solid',
  fill: BLUE, fillOpacity: 0.15,
  textColor: '#E5E7EB', fontSize: 13,
}

export function defaultStyleFor(type) {
  const s = { ...DEFAULT_STYLE }
  if (type === 'long')  Object.assign(s, { color: '#22C55E', fill: '#22C55E', stopColor: '#F43F5E', stopFill: '#F43F5E', fillOpacity: 0.18 })
  if (type === 'short') Object.assign(s, { color: '#22C55E', fill: '#22C55E', stopColor: '#F43F5E', stopFill: '#F43F5E', fillOpacity: 0.18 })
  if (type === 'rect')  Object.assign(s, { color: '#3B82F6', fill: '#3B82F6', fillOpacity: 0.15, width: 1 })
  if (type === 'measure' || type === 'priceRange' || type === 'dateRange') Object.assign(s, { color: '#60A5FA', fill: '#3B82F6', fillOpacity: 0.12, width: 1 })
  if (type === 'brush') Object.assign(s, { color: '#2DD4BF', width: 2 })
  if (type === 'fib')   Object.assign(s, { color: '#9CA3AF', width: 1, fillOpacity: 0.07 })
  if (type === 'hline' || type === 'hray' || type === 'vline' || type === 'cross') s.width = 1
  if (type === 'text')  Object.assign(s, { fontSize: 14, textColor: '#F3F4F6' })
  return s
}

export const EMOJIS = ['🚀', '📈', '📉', '🎯', '⚠️', '✅', '❌', '🔥', '💰', '👀', '🐂', '🐻']

let _n = 0
export const newId = () => `dr_${Date.now().toString(36)}${(++_n).toString(36)}${Math.random().toString(36).slice(2, 5)}`

export function makeDrawing(type, points, extra = {}) {
  return { id: newId(), type, points, style: defaultStyleFor(type), locked: false, visible: true, ...extra }
}

/**
 * Long / short position tool: entry + a stop and target spaced from recent volatility
 * (2 × average range stop, 2R target) and a 30-bar width. Handles let the user reshape it.
 */
export function defaultPosition(type, anchor, bars, tfSecs) {
  const recent = bars.slice(-20)
  const avg = recent.length ? recent.reduce((s, b) => s + (b.high - b.low), 0) / recent.length : anchor.price * 0.002
  const stop = Math.max(avg * 2, anchor.price * 0.0005)
  const long = type === 'long'
  const end = anchor.time + tfSecs * 30
  return [
    { time: anchor.time, price: anchor.price },                                  // entry (left edge)
    { time: end, price: long ? anchor.price + stop * 2 : anchor.price - stop * 2 }, // target (right edge)
    { time: end, price: long ? anchor.price - stop : anchor.price + stop },      // stop
  ]
}

// ── Number / time formatting ─────────────────────────────────────────────
export function fmtDur(secs) {
  const s = Math.abs(Math.round(secs))
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d) return h ? `${d}d ${h}h` : `${d}d`
  if (h) return m ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

// ── Pixel geometry ───────────────────────────────────────────────────────
/** Clip the infinite line through a→b to the box [0,w]×[0,h]. `left`/`right` choose which ends run to the edge. */
export function lineToBounds(a, b, w, h, { left = false, right = false } = {}) {
  const dx = b.x - a.x, dy = b.y - a.y
  if (dx === 0 && dy === 0) return [a, b]
  const hits = []
  const addT = (t) => hits.push(t)
  if (dx !== 0) { addT((0 - a.x) / dx); addT((w - a.x) / dx) }
  if (dy !== 0) { addT((0 - a.y) / dy); addT((h - a.y) / dy) }
  const pts = hits
    .map(t => ({ t, x: a.x + t * dx, y: a.y + t * dy }))
    .filter(p => p.x >= -1 && p.x <= w + 1 && p.y >= -1 && p.y <= h + 1)
    .sort((p, q) => p.t - q.t)
  if (pts.length < 2) return [a, b]
  const tMin = pts[0].t, tMax = pts[pts.length - 1].t
  const t0 = left ? tMin : 0, t1 = right ? tMax : 1
  return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }]
}

/** Distance from point p to the SEGMENT a→b (for hit-testing outside SVG, e.g. snapping). */
export function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export const FIB_LEVELS = [
  { r: 0,     color: '#9CA3AF' },
  { r: 0.236, color: '#F43F5E' },
  { r: 0.382, color: '#F59E0B' },
  { r: 0.5,   color: '#22C55E' },
  { r: 0.618, color: '#2DD4BF' },
  { r: 0.786, color: '#38BDF8' },
  { r: 1,     color: '#9CA3AF' },
]

/** Measurements shown on the price/date range tools. */
export function measureInfo(p0, p1, tfSecs, barsBetween) {
  const dp = p1.price - p0.price
  const pct = p0.price ? (dp / p0.price) * 100 : 0
  const dt = p1.time - p0.time
  return {
    dp, pct, dt,
    bars: Math.round(barsBetween ?? dt / tfSecs),
    up: dp >= 0,
  }
}

/** Risk/reward numbers for the long/short tools (price domain). */
export function positionInfo(d) {
  const [p0, pT, pS] = d.points
  const long = d.type === 'long'
  const reward = Math.abs(pT.price - p0.price)
  const risk = Math.abs(p0.price - pS.price)
  const rr = risk > 0 ? reward / risk : 0
  return {
    long, reward, risk, rr,
    rewardPct: p0.price ? (reward / p0.price) * 100 : 0,
    riskPct: p0.price ? (risk / p0.price) * 100 : 0,
    entry: p0.price, target: pT.price, stop: pS.price,
  }
}

// ── Mutations ────────────────────────────────────────────────────────────
export const movePoints = (points, dTime, dPrice) => points.map(p => ({ time: p.time + dTime, price: p.price + dPrice }))

/** Position tools keep target & stop on the same right edge. */
export function movePositionPoint(points, idx, pt) {
  const next = points.map(p => ({ ...p }))
  if (idx === 0) {                      // entry handle: moves the whole box in time, entry price only
    next[0] = { time: pt.time, price: pt.price }
  } else if (idx === 1) {               // target: price + right edge
    next[1] = { time: pt.time, price: pt.price }
    next[2] = { ...next[2], time: pt.time }
  } else {                              // stop: price + right edge
    next[2] = { time: pt.time, price: pt.price }
    next[1] = { ...next[1], time: pt.time }
  }
  return next
}

export function cloneDrawing(d, dTime = 0, dPrice = 0) {
  return { ...JSON.parse(JSON.stringify(d)), id: newId(), points: movePoints(d.points, dTime, dPrice), locked: false }
}