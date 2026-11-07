// ─────────────────────────────────────────────────────────────────────────
// Backtesting — drawing tools (pure: catalog, defaults, geometry, measuring).
// Rendering lives in components/backtest/DrawingShapes.jsx, interaction in DrawingOverlay.jsx.
//
// A drawing is anchored in MARKET coordinates, never pixels:
//   { id, type, points:[{ time (unix s), price }], style:{…}, text?, emoji?,
//     locked, visible, tfs? (legacy), vis? (timeframe visibility ranges) }
// so it survives zooming, scrolling and timeframe changes.
// ─────────────────────────────────────────────────────────────────────────

import { parseTf } from './aggregate'
import { pnlUsd } from './specs'

export const DASHES = { solid: undefined, dashed: '8 5', dotted: '2 4' }

// type → how it is created / drawn.   points: clicks needed ('free' = freehand, 'poly' = click per vertex, double-click to finish)
export const TOOLS = {
  trendline: { label: 'Trend line',         points: 2, kind: 'line',     key: 'T' },
  ray:       { label: 'Ray',                points: 2, kind: 'line' },
  info:      { label: 'Info line',          points: 2, kind: 'line' },
  extended:  { label: 'Extended line',      points: 2, kind: 'line' },
  arrow:     { label: 'Arrow',              points: 2, kind: 'line' },
  hline:     { label: 'Horizontal line',    points: 1, kind: 'line',     key: 'H' },
  hray:      { label: 'Horizontal ray',     points: 1, kind: 'line',     key: 'J' },
  vline:     { label: 'Vertical line',      points: 1, kind: 'line',     key: 'V' },
  cross:     { label: 'Cross line',         points: 1, kind: 'line',     key: 'C' },
  channel:   { label: 'Parallel channel',   points: 3, kind: 'channel' },
  fib:       { label: 'Fib retracement',    points: 2, kind: 'fib' },
  rect:      { label: 'Rectangle',          points: 2, kind: 'shape',    key: 'Shift+R' },
  circle:    { label: 'Circle',             points: 2, kind: 'shape' },
  ellipse:   { label: 'Ellipse',            points: 2, kind: 'shape' },
  triangle:  { label: 'Triangle',           points: 3, kind: 'shape' },
  path:      { label: 'Path',               points: 'poly', kind: 'poly' },
  polyline:  { label: 'Polyline',           points: 'poly', kind: 'poly' },
  long:      { label: 'Long position',      points: 1, kind: 'position' },
  short:     { label: 'Short position',     points: 1, kind: 'position' },
  priceRange:{ label: 'Price range',        points: 2, kind: 'measure' },
  dateRange: { label: 'Date range',         points: 2, kind: 'measure' },
  measure:   { label: 'Date & price range', points: 2, kind: 'measure',  key: 'M' },
  brush:     { label: 'Brush',              points: 'free', kind: 'brush' },
  highlighter:{ label: 'Highlighter',       points: 'free', kind: 'brush' },
  arrowUp:   { label: 'Arrow mark up',      points: 1, kind: 'marker' },
  arrowDown: { label: 'Arrow mark down',    points: 1, kind: 'marker' },
  text:      { label: 'Text',               points: 1, kind: 'text' },
  emoji:     { label: 'Emoji',              points: 1, kind: 'emoji' },
  eraser:    { label: 'Eraser',             points: 1, kind: 'eraser' },   // click a drawing to delete it
  alert:     { label: 'Alert',              points: 1, kind: 'alert' },   // created from the right-click menu, not a toolbar tool
}

// Toolbar structure (left rail). `sections` = fly-out menu.
export const TOOL_MENUS = [
  { id: 'lines',    label: 'Trend line tools',       icon: 'trendline', sections: [
    { title: 'Lines', tools: ['trendline', 'ray', 'info', 'extended', 'hline', 'hray', 'vline', 'cross'] },
  ] },
  { id: 'fib',      label: 'Fib & channels',         icon: 'fib',      sections: [{ title: 'Fibonacci', tools: ['fib'] }, { title: 'Channels', tools: ['channel'] }] },
  { id: 'forecast', label: 'Forecasting & measurers', icon: 'long',    sections: [
    { title: 'Forecasting', tools: ['long', 'short'] },
    { title: 'Measurers',   tools: ['priceRange', 'dateRange', 'measure'] },
  ] },
  { id: 'shapes',   label: 'Brushes, arrows & shapes', icon: 'rect',   sections: [
    { title: 'Brushes', tools: ['brush', 'highlighter'] },
    { title: 'Arrows',  tools: ['arrow', 'arrowUp', 'arrowDown'] },
    { title: 'Shapes',  tools: ['rect', 'path', 'circle', 'ellipse', 'polyline', 'triangle'] },
  ] },
]

// ── Timeframe visibility ─────────────────────────────────────────────────
// Visibility is by interval TYPE, so it works for any custom timeframe (7m, 90m, 3D …).
export const TF_CATEGORIES = [
  { id: 'm', label: 'Minutes', max: 59 }, { id: 'h', label: 'Hours', max: 24 }, { id: 'd', label: 'Days', max: 366 },
  { id: 'w', label: 'Weeks', max: 52 },   { id: 'M', label: 'Months', max: 12 },
]
export const tfCategoryOf = (key) => String(key || '').slice(-1)
export const defaultVis = () => Object.fromEntries(TF_CATEGORIES.map(c => [c.id, [1, c.max, true]]))

/**
 * Does this drawing show on the given timeframe?
 *   vis  { m:[min,max,on], h:[…], d, w, M }  — TradingView-style ranges per interval type
 *   tfs  legacy list of interval types / exact keys from older saves
 */
export function visibleOnTf(d, tfKey) {
  if (d.vis) {
    const { n, unit } = parseTf(tfKey)
    const r = d.vis[unit]
    return !r || (r[2] !== false && n >= r[0] && n <= r[1])
  }
  return !d.tfs || d.tfs.includes(tfKey) || d.tfs.includes(tfCategoryOf(tfKey))
}

// ── Defaults ─────────────────────────────────────────────────────────────
export const BLUE = '#2962FF'
export const GREEN = '#089981'
export const RED = '#F23645'
export const DEFAULT_STYLE = {
  color: BLUE, width: 2, dash: 'solid',
  fill: BLUE, fillOpacity: 0.2,
  textColor: '#D1D4DC', fontSize: 12,
}

export function defaultStyleFor(type) {
  const s = { ...DEFAULT_STYLE }
  if (type === 'long' || type === 'short') Object.assign(s, {
    color: '#9598A1', fill: GREEN, stopFill: RED, fillOpacity: 0.2, width: 1, textColor: '#FFFFFF',
    accountSize: 10000, riskPct: 1, showLabels: true, compact: false, priceLabels: true,
  })
  if (type === 'rect' || type === 'ellipse' || type === 'circle' || type === 'triangle') Object.assign(s, { width: 1, bold: false, italic: false, vAlign: 'middle', hAlign: 'center' })
  if (type === 'measure' || type === 'priceRange' || type === 'dateRange') Object.assign(s, { color: BLUE, fill: BLUE, fillOpacity: 0.2, width: 1 })
  if (type === 'brush') Object.assign(s, { color: BLUE, width: 2, showFill: false })
  if (type === 'highlighter') Object.assign(s, { color: '#FFEB3B', width: 20, opacity: 0.4 })
  if (type === 'fib')   Object.assign(s, { color: '#787B86', width: 1, fillOpacity: 0.12, showPrices: true, showFill: true })
  if (type === 'channel') Object.assign(s, { fillOpacity: 0.1, middleLine: true })
  if (type === 'hline' || type === 'hray' || type === 'vline' || type === 'cross') { s.width = 1; s.priceLabel = true }
  if (type === 'trendline' || type === 'ray' || type === 'extended' || type === 'arrow' || type === 'info')
    Object.assign(s, { stats: type === 'info' ? 'values' : 'hidden', statsPos: 'right', alwaysStats: type === 'info', middlePoint: false, priceLabels: false, bold: false, italic: false, vAlign: 'middle', hAlign: 'center' })
  if (type === 'arrow') s.arrowEnd = true
  if (type === 'path') Object.assign(s, { arrowEnd: true, showFill: false })
  if (type === 'polyline') Object.assign(s, { showFill: true })
  if (type === 'arrowUp') s.color = GREEN
  if (type === 'arrowDown') s.color = RED
  if (type === 'text')  Object.assign(s, { fontSize: 14, textColor: '#F3F4F6', showBg: false, bg: '#2A2E39', showBorder: false, bold: false, italic: false })
  if (type === 'emoji') s.fontSize = 13
  return s
}

/** A drawing's style with every default filled in, so drawings saved by older versions render too. */
export const styleOf = (d) => ({ ...defaultStyleFor(d.type), ...(d.style || {}) })

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

/** Ramer–Douglas–Peucker: keeps a freehand stroke light (hundreds of mouse samples → a few dozen points). */
export function simplifyPx(pts, eps) {
  if (pts.length < 3) return pts.map((_, i) => i)
  const keep = new Array(pts.length).fill(false)
  keep[0] = keep[pts.length - 1] = true
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()
    let max = 0, idx = -1
    for (let i = s + 1; i < e; i++) { const d = distToSegment(pts[i], pts[s], pts[e]); if (d > max) { max = d; idx = i } }
    if (idx > -1 && max > eps) { keep[idx] = true; stack.push([s, idx], [idx, e]) }
  }
  return keep.map((k, i) => (k ? i : -1)).filter(i => i >= 0)
}

/** Smooth (Catmull-Rom → cubic Bézier) SVG path through pixel points — brush & highlighter strokes. */
export function smoothPath(P) {
  if (!P.length) return ''
  if (P.length === 1) return `M${P[0].x},${P[0].y} l0.01,0`
  if (P.length === 2) return `M${P[0].x},${P[0].y} L${P[1].x},${P[1].y}`
  let d = `M${P[0].x.toFixed(1)},${P[0].y.toFixed(1)}`
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2
    d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)},${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)},${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}

export const FIB_LEVELS = [
  { r: 0,     color: '#787B86' },
  { r: 0.236, color: '#F23645' },
  { r: 0.382, color: '#FF9800' },
  { r: 0.5,   color: '#4CAF50' },
  { r: 0.618, color: '#089981' },
  { r: 0.786, color: '#00BCD4' },
  { r: 1,     color: '#787B86' },
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

/**
 * Everything the Long / Short box prints, in the instrument's own money terms:
 * lots sized so a stop-out risks `riskPct`% of `accountSize`, the USD at stake at the target / stop, and live open P&L.
 */
export function positionInfo(d, spec, lastPrice) {
  const s = styleOf(d)
  const [p0, pT, pS] = d.points
  const long = d.type === 'long'
  const reward = Math.abs(pT.price - p0.price)
  const risk = Math.abs(p0.price - pS.price)
  const rr = risk > 0 ? reward / risk : 0
  const pip = spec?.pipSize || 0
  const riskUsd = ((Number(s.accountSize) || 0) * (Number(s.riskPct) || 0)) / 100
  const perLot = spec && risk > 0 ? Math.abs(pnlUsd(spec, 1, risk, p0.price)) : 0
  const lots = perLot > 0 ? Math.max(spec.minLot || 0.01, Math.round((riskUsd / perLot) / (spec.lotStep || 0.01)) * (spec.lotStep || 0.01)) : 0
  const cash = (dist) => (spec && lots ? Math.abs(pnlUsd(spec, lots, dist, p0.price)) : 0)
  const last = Number.isFinite(lastPrice) ? lastPrice : null
  const open = last != null && spec && lots ? pnlUsd(spec, lots, long ? last - p0.price : p0.price - last, last) : 0
  return {
    long, reward, risk, rr, lots, riskUsd,
    rewardPct: p0.price ? (reward / p0.price) * 100 : 0,
    riskPct: p0.price ? (risk / p0.price) * 100 : 0,
    rewardPips: pip ? reward / pip : null, riskPips: pip ? risk / pip : null,
    rewardUsd: cash(reward), riskUsdAtStop: cash(risk), open, hasLast: last != null,
    entry: p0.price, target: pT.price, stop: pS.price,
  }
}

// ── Mutations ────────────────────────────────────────────────────────────
export const movePoints = (points, dTime, dPrice) => points.map(p => ({ time: p.time + dTime, price: p.price + dPrice }))

/** Legacy (idx 0/1/2) handle logic — kept for saves made before the handle ids became named. */
export function movePositionPoint(points, idx, pt) {
  const next = points.map(p => ({ ...p }))
  if (idx === 0) {
    next[0] = { time: pt.time, price: pt.price }
  } else if (idx === 1) {
    next[1] = { time: pt.time, price: pt.price }
    next[2] = { ...next[2], time: pt.time }
  } else {
    next[2] = { time: pt.time, price: pt.price }
    next[1] = { ...next[1], time: pt.time }
  }
  return next
}

/**
 * Move one handle to market point `m` and return the drawing's new points.
 *  rect / ellipse / measure boxes: 8 handles named by compass point (nw n ne e se s sw w)
 *  positions: target · stop (price only) · left · right (time only)
 *  hline / vline: constrained to their axis;  everything else: handle `idx` is a vertex
 */
export function applyHandle(d, idx, m, tfSecs = 60) {
  const pts = d.points.map(p => ({ ...p }))
  const boxed = d.type === 'rect' || d.type === 'ellipse' || d.type === 'priceRange' || d.type === 'dateRange' || d.type === 'measure'
  if (boxed && typeof idx === 'string') {
    let tL = Math.min(pts[0].time, pts[1].time), tR = Math.max(pts[0].time, pts[1].time)
    let pT = Math.max(pts[0].price, pts[1].price), pB = Math.min(pts[0].price, pts[1].price)
    if (idx.includes('n')) pT = m.price
    if (idx.includes('s')) pB = m.price
    if (idx.includes('w')) tL = m.time
    if (idx.includes('e')) tR = m.time
    return [{ time: tL, price: pT }, { time: tR, price: pB }]
  }
  if (d.type === 'long' || d.type === 'short') {
    if (idx === 'target') pts[1].price = m.price
    else if (idx === 'stop') pts[2].price = m.price
    else if (idx === 'right') { const t = Math.max(m.time, pts[0].time + tfSecs); pts[1].time = t; pts[2].time = t }
    else if (idx === 'left') pts[0].time = Math.min(m.time, pts[1].time - tfSecs)
    else return movePositionPoint(d.points, idx, m)
    return pts
  }
  if (d.type === 'hline') { pts[0] = { time: pts[0].time, price: m.price }; return pts }
  if (d.type === 'vline') { pts[0] = { time: m.time, price: pts[0].price }; return pts }
  pts[idx] = m
  return pts
}

export function cloneDrawing(d, dTime = 0, dPrice = 0) {
  return { ...JSON.parse(JSON.stringify(d)), id: newId(), points: movePoints(d.points, dTime, dPrice), locked: false }
}