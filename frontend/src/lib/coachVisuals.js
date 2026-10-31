// ═══════════════════════════════════════════════════════════════════════
// AI Coach visuals — deterministic chart data.
//
// Same philosophy as the rest of the app: every number here is computed from
// the trader's real trade rows. Gemini only does two things around it —
// (1) turns a chat message into a small JSON "visual spec" (see backend
// /api/ai/coach-plan) and (2) narrates the facts this file produces. It never
// computes, estimates or invents a figure that ends up in a chart.
//
// A spec looks like:
//   { kind: 'pnl_timeline' | 'equity' | 'breakdown' | 'whatif' | 'adherence',
//     period: 'last_month' | ... | 'custom', customStart, customEnd,
//     groupBy: 'strategy' | 'symbol' | 'session' | 'weekday' | 'hour' | 'side',
//     metric: 'profit_factor' | 'win_rate',
//     interval: 'auto' | 'day' | 'week' | 'month',
//     filters: { strategies, symbols, sides, sessions, excludeWeekdays, onlyWeekdays },
//     whatIf: { dimension, mode: 'exclude' | 'only', values } }
// ═══════════════════════════════════════════════════════════════════════
import { computeDrawdownSeries, sessionLabel, getDurationSeconds, formatDuration } from './analytics'
import { DEFAULT_EXECUTION_CHECKLIST } from '../data/executionChecklist'

export const VISUAL_KINDS = ['pnl_timeline', 'equity', 'breakdown', 'whatif', 'adherence']
export const GROUP_DIMENSIONS = ['strategy', 'symbol', 'session', 'weekday', 'hour', 'side']
export const PERIODS = [
  'today', 'yesterday', 'this_week', 'last_week', 'last_7_days', 'this_month', 'last_month',
  'last_30_days', 'last_90_days', 'this_quarter', 'this_year', 'all_time', 'custom',
]

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SESSION_ORDER = ['Asian', 'London', 'New York']
const PF_PLOT_CAP = 5 // keeps one huge profit factor from flattening the whole line

const fmtMoney = (v) => {
  const n = Number(v) || 0
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n >= 0 ? `+$${s}` : `-$${s}`
}
const fmtDay = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const fmtDayYear = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ── Period resolution ───────────────────────────────────────────────────
// Weeks start on Monday (matches computePeriodRange in analytics.js).
export function resolvePeriod(period = 'last_30_days', customStart, customEnd, now = new Date()) {
  const today = startOfDay(now)
  const mondayOffset = (today.getDay() + 6) % 7
  let start, end = endOfDay(today), label
  switch (period) {
    case 'today': start = today; label = 'Today'; break
    case 'yesterday': {
      start = new Date(today); start.setDate(start.getDate() - 1)
      end = endOfDay(start); label = 'Yesterday'; break
    }
    case 'this_week':
      start = new Date(today); start.setDate(start.getDate() - mondayOffset); label = 'This Week'; break
    case 'last_week': {
      start = new Date(today); start.setDate(start.getDate() - mondayOffset - 7)
      end = endOfDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)); label = 'Last Week'; break
    }
    case 'last_7_days': start = new Date(today); start.setDate(start.getDate() - 6); label = 'Last 7 Days'; break
    case 'this_month': start = new Date(today.getFullYear(), today.getMonth(), 1); label = 'This Month'; break
    case 'last_month':
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      end = endOfDay(new Date(today.getFullYear(), today.getMonth(), 0)); label = 'Last Month'; break
    case 'last_30_days': start = new Date(today); start.setDate(start.getDate() - 29); label = 'Last 30 Days'; break
    case 'last_90_days': start = new Date(today); start.setDate(start.getDate() - 89); label = 'Last 90 Days'; break
    case 'this_quarter': start = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1); label = 'This Quarter'; break
    case 'this_year': start = new Date(today.getFullYear(), 0, 1); label = 'This Year'; break
    case 'all_time': start = new Date(0); label = 'All Time'; break
    case 'custom': {
      const s = customStart ? new Date(`${customStart}T00:00:00`) : null
      const e = customEnd ? new Date(`${customEnd}T23:59:59.999`) : null
      if (s && !isNaN(s)) {
        start = s
        if (e && !isNaN(e)) end = e
        label = `${fmtDayYear(start)} – ${fmtDayYear(end)}`
        break
      }
      start = new Date(today); start.setDate(start.getDate() - 29); label = 'Last 30 Days'; break
    }
    default: start = new Date(today); start.setDate(start.getDate() - 29); label = 'Last 30 Days'
  }
  const range = period === 'all_time' ? 'All trades' : `${fmtDay(start)} – ${fmtDay(end)}`
  return { start, end, label, range }
}

// ── Aggregates ──────────────────────────────────────────────────────────
function agg(trades) {
  let pnl = 0, gp = 0, gl = 0, wins = 0
  trades.forEach(t => {
    const p = t.pnl || 0
    pnl += p
    if (p > 0) { gp += p; wins++ } else if (p < 0) gl += -p
  })
  const count = trades.length
  // pf: number when both sides exist, Infinity when there were wins but no losses, null when no wins/losses at all
  const pf = gl > 0 ? gp / gl : gp > 0 ? Infinity : null
  return { pnl, count, wins, losses: count - wins, grossProfit: gp, grossLoss: gl, winRate: count ? (wins / count) * 100 : 0, pf }
}
const pfText = (pf) => pf == null ? '—' : pf === Infinity ? '∞' : pf.toFixed(2)
const pfPlot = (pf) => pf == null ? null : Math.min(pf === Infinity ? PF_PLOT_CAP : pf, PF_PLOT_CAP)
const tradeDate = (t) => new Date(t.closed_at)

function closedTrades(trades = []) {
  return trades.filter(t => t.status === 'closed' && t.closed_at && t.pnl != null && !isNaN(tradeDate(t)))
}

// ── Dimension helpers (strategy / symbol / session / weekday / hour / side) ──
function dimValue(t, dim) {
  switch (dim) {
    case 'strategy': return (t.strategy && String(t.strategy).trim()) || 'Untagged'
    case 'symbol': return t.symbol || 'Unknown'
    case 'session': return sessionLabel(t.session) || 'Unassigned'
    case 'weekday': return WEEKDAY_NAMES[tradeDate(t).getDay()]
    case 'hour': return String(tradeDate(t).getHours())
    case 'side': return String(t.side || '').toLowerCase() === 'short' ? 'Short' : 'Long'
    default: return 'Other'
  }
}
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`
const dimLabel = (dim, value) => dim === 'hour' ? hourLabel(Number(value)) : dim === 'weekday' ? value : value
const DIM_TITLE = { strategy: 'Strategy', symbol: 'Symbol', session: 'Session', weekday: 'Weekday', hour: 'Hour of Day', side: 'Direction' }

// Match requested names (from Gemini or the fallback planner) to what's really in the data.
function matchNames(requested = [], actual = []) {
  const matched = [], unmatched = []
  requested.forEach(r => {
    const rn = norm(r)
    if (!rn) return
    const hit = actual.filter(a => { const an = norm(a); return an === rn || (rn.length >= 3 && (an.includes(rn) || rn.includes(an))) })
    if (hit.length) hit.forEach(h => { if (!matched.includes(h)) matched.push(h) })
    else unmatched.push(r)
  })
  return { matched, unmatched }
}

function toWeekdayNums(list = []) {
  return list.map(v => {
    if (typeof v === 'number') return v
    const i = WEEKDAY_NAMES.findIndex(n => n.toLowerCase().startsWith(String(v).toLowerCase().slice(0, 3)))
    return i >= 0 ? i : null
  }).filter(v => v != null && v >= 0 && v <= 6)
}

function applyFilters(trades, filters = {}) {
  const notes = []
  let out = trades

  const strategies = [...new Set(out.map(t => dimValue(t, 'strategy')))]
  const symbols = [...new Set(out.map(t => dimValue(t, 'symbol')))]
  const filterBy = (dim, requested, universe, label) => {
    if (!requested?.length) return
    const { matched, unmatched } = matchNames(requested, universe)
    if (unmatched.length) notes.push(`No ${label} called "${unmatched.join('", "')}" in this period`)
    out = matched.length ? out.filter(t => matched.includes(dimValue(t, dim))) : []
  }
  filterBy('strategy', filters.strategies, strategies, 'strategy')
  filterBy('symbol', filters.symbols, symbols, 'symbol')

  if (filters.sides?.length) {
    const want = filters.sides.map(s => /short|sell/i.test(s) ? 'Short' : 'Long')
    out = out.filter(t => want.includes(dimValue(t, 'side')))
  }
  if (filters.sessions?.length) {
    const want = filters.sessions.map(s => sessionLabel(s))
    out = out.filter(t => want.includes(dimValue(t, 'session')))
  }
  const excl = toWeekdayNums(filters.excludeWeekdays)
  if (excl.length) out = out.filter(t => !excl.includes(tradeDate(t).getDay()))
  const only = toWeekdayNums(filters.onlyWeekdays)
  if (only.length) out = out.filter(t => only.includes(tradeDate(t).getDay()))

  return { trades: out, notes }
}

function filterSummary(filters = {}) {
  const parts = []
  if (filters.strategies?.length) parts.push(filters.strategies.join(', '))
  if (filters.symbols?.length) parts.push(filters.symbols.join(', '))
  if (filters.sessions?.length) parts.push(`${filters.sessions.map(s => sessionLabel(s)).join(', ')} session`)
  if (filters.sides?.length) parts.push(filters.sides.join(', '))
  const ex = toWeekdayNums(filters.excludeWeekdays)
  if (ex.length) parts.push(`excl. ${ex.map(d => WEEKDAY_NAMES[d] + 's').join(', ')}`)
  const on = toWeekdayNums(filters.onlyWeekdays)
  if (on.length) parts.push(`only ${on.map(d => WEEKDAY_NAMES[d] + 's').join(', ')}`)
  return parts.join(' · ')
}

// ── Tiles shared by several visuals ─────────────────────────────────────
function statTiles(a) {
  return [
    { label: 'Net P&L', value: fmtMoney(a.pnl), tone: a.pnl > 0 ? 'pos' : a.pnl < 0 ? 'neg' : 'neutral' },
    { label: 'Trades', value: String(a.count), tone: 'neutral' },
    { label: 'Win Rate', value: `${a.winRate.toFixed(0)}%`, tone: a.winRate >= 50 ? 'pos' : 'neg' },
    { label: 'Profit Factor', value: pfText(a.pf), tone: a.pf == null ? 'neutral' : a.pf >= 1 ? 'pos' : 'neg' },
  ]
}

// ── Builders ────────────────────────────────────────────────────────────
function buildTimeline(spec, trades, range) {
  const spanDays = Math.max(1, Math.round((Math.min(range.end, new Date()) - (trades.length ? Math.min(...trades.map(t => +tradeDate(t))) : range.start)) / 86400000))
  const interval = spec.interval && spec.interval !== 'auto' ? spec.interval : spanDays <= 35 ? 'day' : spanDays <= 150 ? 'week' : 'month'

  const buckets = new Map()
  trades.slice().sort((a, b) => tradeDate(a) - tradeDate(b)).forEach(t => {
    const d = tradeDate(t)
    let key, label
    if (interval === 'day') { key = dayKey(d); label = fmtDay(d) }
    else if (interval === 'week') {
      const m = startOfDay(d); m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
      key = dayKey(m); label = fmtDay(m)
    } else { key = `${d.getFullYear()}-${d.getMonth()}`; label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) }
    if (!buckets.has(key)) buckets.set(key, { label, pnl: 0, trades: 0 })
    const b = buckets.get(key); b.pnl += t.pnl || 0; b.trades++
  })

  let cum = 0
  const points = [...buckets.values()].map(b => { cum += b.pnl; return { label: b.label, pnl: +b.pnl.toFixed(2), cum: +cum.toFixed(2), trades: b.trades } })
  const a = agg(trades)
  const best = points.reduce((m, p) => (!m || p.pnl > m.pnl ? p : m), null)
  const worst = points.reduce((m, p) => (!m || p.pnl < m.pnl ? p : m), null)
  const unit = { day: 'day', week: 'week', month: 'month' }[interval]
  const green = points.filter(p => p.pnl > 0).length

  return {
    visual: {
      kind: 'pnl_timeline', title: 'P&L Over Time', subtitle: `${unit === 'day' ? 'Daily' : unit === 'week' ? 'Weekly' : 'Monthly'} P&L with cumulative line`,
      points, tiles: statTiles(a), interval,
    },
    facts: [
      `Net P&L ${fmtMoney(a.pnl)} over ${a.count} closed trades (win rate ${a.winRate.toFixed(0)}%, profit factor ${pfText(a.pf)}).`,
      points.length ? `${green} of ${points.length} ${unit}s were profitable. Best ${unit}: ${best.label} (${fmtMoney(best.pnl)}). Worst ${unit}: ${worst.label} (${fmtMoney(worst.pnl)}).` : '',
    ].filter(Boolean),
  }
}

function buildEquity(spec, trades) {
  const dd = computeDrawdownSeries(trades)
  const sorted = trades.slice().sort((a, b) => tradeDate(a) - tradeDate(b))
  const points = dd.points.map((p, i) => ({
    label: fmtDay(tradeDate(sorted[i])), n: i + 1, equity: +p.equity.toFixed(2), drawdown: +p.drawdown.toFixed(2),
  }))
  const a = agg(trades)
  const peak = points.reduce((m, p) => Math.max(m, p.equity), 0)
  return {
    visual: {
      kind: 'equity', title: 'Equity Curve', subtitle: 'Cumulative P&L, trade by trade',
      points, positive: a.pnl >= 0,
      tiles: [
        { label: 'Net P&L', value: fmtMoney(a.pnl), tone: a.pnl >= 0 ? 'pos' : 'neg' },
        { label: 'Peak', value: fmtMoney(peak), tone: 'neutral' },
        { label: 'Max Drawdown', value: fmtMoney(dd.maxDrawdown), tone: dd.maxDrawdown < 0 ? 'neg' : 'neutral' },
        { label: 'Trades', value: String(a.count), tone: 'neutral' },
      ],
    },
    facts: [
      `Equity ended ${fmtMoney(a.pnl)} over ${a.count} trades; peak ${fmtMoney(peak)}; max drawdown ${fmtMoney(dd.maxDrawdown)}${dd.maxDate ? ` (around ${fmtDay(new Date(dd.maxDate))})` : ''}.`,
    ],
  }
}

function groupRows(trades, dim) {
  const map = new Map()
  trades.forEach(t => { const k = dimValue(t, dim); if (!map.has(k)) map.set(k, []); map.get(k).push(t) })
  let rows = [...map.entries()].map(([k, ts]) => ({ key: k, label: dimLabel(dim, k), ...agg(ts) }))
  if (dim === 'weekday') rows.sort((a, b) => ((WEEKDAY_NAMES.indexOf(a.key) + 6) % 7) - ((WEEKDAY_NAMES.indexOf(b.key) + 6) % 7)).forEach(r => { r.label = WEEKDAY_SHORT[WEEKDAY_NAMES.indexOf(r.key)] })
  else if (dim === 'hour') rows.sort((a, b) => Number(a.key) - Number(b.key))
  else if (dim === 'session') rows.sort((a, b) => SESSION_ORDER.indexOf(a.key) - SESSION_ORDER.indexOf(b.key))
  else {
    rows = rows.sort((a, b) => b.count - a.count).slice(0, 10) // keep the busiest 10, then order like the reference: weakest → strongest
    rows.sort((a, b) => a.pnl - b.pnl)
  }
  return rows
}

function buildBreakdown(spec, trades) {
  const dim = GROUP_DIMENSIONS.includes(spec.groupBy) ? spec.groupBy : 'strategy'
  const metric = spec.metric === 'win_rate' ? 'win_rate' : 'profit_factor'
  const rows = groupRows(trades, dim)
  const points = rows.map(r => ({
    label: r.label, pnl: +r.pnl.toFixed(2), trades: r.count, winRate: +r.winRate.toFixed(1),
    pf: r.pf === Infinity ? null : r.pf, pfInfinite: r.pf === Infinity, pfText: pfText(r.pf),
    line: metric === 'win_rate' ? +r.winRate.toFixed(1) : pfPlot(r.pf),
  }))
  const best = rows.reduce((m, r) => (!m || r.pnl > m.pnl ? r : m), null)
  const worst = rows.reduce((m, r) => (!m || r.pnl < m.pnl ? r : m), null)
  const metricName = metric === 'win_rate' ? 'Win Rate' : 'Profit Factor'
  return {
    visual: {
      kind: 'breakdown', title: `P&L & ${metricName} by ${DIM_TITLE[dim]}`, subtitle: `${rows.length} ${DIM_TITLE[dim].toLowerCase()} group${rows.length === 1 ? '' : 's'}`,
      points, metric, metricName, dim,
      callouts: [best && { label: 'Best', value: `${best.label} ${fmtMoney(best.pnl)}`, tone: best.pnl >= 0 ? 'pos' : 'neg' }, worst && rows.length > 1 && { label: 'Weakest', value: `${worst.label} ${fmtMoney(worst.pnl)}`, tone: worst.pnl >= 0 ? 'pos' : 'neg' }].filter(Boolean),
    },
    facts: rows.map(r => `${DIM_TITLE[dim]} ${r.label}: P&L ${fmtMoney(r.pnl)}, ${r.count} trades, win rate ${r.winRate.toFixed(0)}%, profit factor ${pfText(r.pf)}.`),
  }
}

function buildWhatIf(spec, trades) {
  const w = spec.whatIf || {}
  const dim = GROUP_DIMENSIONS.includes(w.dimension) ? w.dimension : (GROUP_DIMENSIONS.includes(spec.groupBy) ? spec.groupBy : 'weekday')
  const mode = w.mode === 'only' ? 'only' : 'exclude'
  const universe = [...new Set(trades.map(t => dimValue(t, dim)))]
  const requested = (w.values || []).map(v => dim === 'weekday' && typeof v === 'number' ? WEEKDAY_NAMES[v] : dim === 'hour' ? String(parseInt(v, 10)) : v)
  const { matched, unmatched } = matchNames(requested.map(String), universe)
  if (!matched.length) {
    return { note: `I couldn't find any ${DIM_TITLE[dim].toLowerCase()} matching "${requested.join(', ')}" in these trades, so there's nothing to compare.` }
  }
  const kept = (t) => { const hit = matched.includes(dimValue(t, dim)); return mode === 'only' ? hit : !hit }
  const projectedTrades = trades.filter(kept)
  const actual = agg(trades), projected = agg(projectedTrades)

  const rows = groupRows(trades, dim)
  const points = rows.map(r => {
    const keep = mode === 'only' ? matched.includes(r.key) : !matched.includes(r.key)
    return { label: r.label, actual: +r.pnl.toFixed(2), projected: keep ? +r.pnl.toFixed(2) : 0, skipped: !keep }
  })
  const ruleText = `${mode === 'only' ? 'Only' : 'Excluding'} ${matched.map(m => dimLabel(dim, m)).join(', ')}`
  const delta = projected.pnl - actual.pnl

  return {
    visual: {
      kind: 'whatif', title: 'What-If: Actual vs Projected', subtitle: ruleText, dim,
      points,
      summary: {
        returnUsd: { actual: +actual.pnl.toFixed(2), projected: +projected.pnl.toFixed(2) },
        profitFactor: { actual: actual.pf === Infinity ? PF_PLOT_CAP : actual.pf, projected: projected.pf === Infinity ? PF_PLOT_CAP : projected.pf, actualText: pfText(actual.pf), projectedText: pfText(projected.pf) },
        trades: { actual: actual.count, projected: projected.count },
      },
      footnote: 'Hindsight what-if on your real trades — it removes the skipped trades and changes nothing else. Not a forecast.',
    },
    facts: [
      `Rule tested: ${ruleText}.`,
      `Actual: ${fmtMoney(actual.pnl)} over ${actual.count} trades, profit factor ${pfText(actual.pf)}, win rate ${actual.winRate.toFixed(0)}%.`,
      `With the rule applied: ${fmtMoney(projected.pnl)} over ${projected.count} trades, profit factor ${pfText(projected.pf)}, win rate ${projected.winRate.toFixed(0)}%.`,
      `Difference: ${fmtMoney(delta)}. This is a hindsight comparison, not a prediction.`,
      ...(unmatched.length ? [`Not found in data: ${unmatched.join(', ')}.`] : []),
    ],
  }
}

function pctTone(p) { return p >= 70 ? 'good' : p >= 55 ? 'warn' : 'bad' }

function buildAdherence(spec, trades, coachSettings = {}) {
  const limit = Number(coachSettings?.dailyLossLimit) > 0 ? Number(coachSettings.dailyLossLimit) : 50
  const journaled = trades.filter(t => Array.isArray(t.execution_checklist) && t.execution_checklist.length)
  const rows = []

  DEFAULT_EXECUTION_CHECKLIST.forEach(item => {
    const withItem = journaled.filter(t => t.execution_checklist.some(c => c.id === item.id))
    if (!withItem.length) return
    const ok = withItem.filter(t => t.execution_checklist.find(c => c.id === item.id)?.checked).length
    rows.push({ id: item.id, label: item.label, value: ok, total: withItem.length, pct: (ok / withItem.length) * 100 })
  })

  // Max daily loss — days where realized loss stayed within the user's own limit
  const days = new Map()
  trades.forEach(t => { const k = dayKey(tradeDate(t)); days.set(k, (days.get(k) || 0) + (t.pnl || 0)) })
  if (days.size) {
    const within = [...days.values()].filter(v => v >= -limit).length
    rows.push({ id: 'daily_loss', label: `Max daily loss ($${limit} limit)`, value: within, total: days.size, pct: (within / days.size) * 100, unit: 'days' })
  }
  rows.forEach(r => { r.tone = pctTone(r.pct) })

  if (!rows.length) return { note: 'There are no journaled trades or trading days in this period yet, so I have nothing to measure plan adherence against.' }

  // Findings — all derived from the "Fits my trading plan" tick
  const findings = []
  const planTracked = journaled.filter(t => t.execution_checklist.some(c => c.id === 'trading_plan'))
  const off = planTracked.filter(t => !t.execution_checklist.find(c => c.id === 'trading_plan')?.checked)
  const on = planTracked.filter(t => t.execution_checklist.find(c => c.id === 'trading_plan')?.checked)
  if (off.length) {
    const offPnl = agg(off).pnl
    findings.push({
      label: 'Cost of Non-Adherence',
      text: offPnl < 0
        ? `The ${off.length} trade${off.length === 1 ? '' : 's'} that didn't fit your plan lost ${fmtMoney(offPnl).replace('-', '')} in total.`
        : `The ${off.length} trade${off.length === 1 ? '' : 's'} that didn't fit your plan netted ${fmtMoney(offPnl)} — profitable, but not repeatable if it wasn't the plan.`,
    })
  }
  if (off.length >= 3) {
    const bucket = (t) => { const h = tradeDate(t).getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening' }
    const counts = {}
    off.forEach(t => { const b = bucket(t); counts[b] = (counts[b] || 0) + 1 })
    const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    findings.push({ label: 'Time of Day Pattern', text: `${Math.round((n / off.length) * 100)}% of your off-plan trades happen in the ${top} (${n} of ${off.length}).` })
  }
  const durOff = off.map(getDurationSeconds).filter(v => v != null)
  const durOn = on.map(getDurationSeconds).filter(v => v != null)
  if (durOff.length >= 2 && durOn.length >= 2) {
    const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length
    const diff = avg(durOff) - avg(durOn)
    if (Math.abs(diff) >= 60) {
      findings.push({
        label: 'Holding Time Variation',
        text: `You hold off-plan trades ${formatDuration(Math.abs(diff))} ${diff > 0 ? 'longer' : 'shorter'} than on-plan ones (${formatDuration(avg(durOff))} vs ${formatDuration(avg(durOn))}).`,
      })
    }
  }

  const a = agg(trades)
  return {
    visual: {
      kind: 'adherence', title: 'Adherence to Trading Plan', subtitle: `${journaled.length} journaled of ${a.count} trades`,
      rows, findings, limit,
    },
    facts: [
      ...rows.map(r => `${r.label}: ${r.value}/${r.total}${r.unit ? ` ${r.unit}` : ' trades'} (${r.pct.toFixed(0)}%).`),
      `Only ${journaled.length} of ${a.count} trades in this period have a completed checklist, so the checklist rows describe those trades only.`,
      ...findings.map(f => `${f.label}: ${f.text}`),
    ],
  }
}

// ── Public entry point ──────────────────────────────────────────────────
// Returns { visual, facts, notes, periodLabel } or { note } when there's nothing honest to draw.
export function buildVisual(spec = {}, allTrades = [], { coachSettings } = {}) {
  if (!VISUAL_KINDS.includes(spec.kind)) return { note: null }
  const range = resolvePeriod(PERIODS.includes(spec.period) ? spec.period : 'last_30_days', spec.customStart, spec.customEnd)
  const inRange = closedTrades(allTrades).filter(t => { const d = tradeDate(t); return d >= range.start && d <= range.end })
  const { trades, notes } = applyFilters(inRange, spec.filters)
  const fsum = filterSummary(spec.filters)

  if (!trades.length) {
    return { note: `No closed trades found for ${range.label.toLowerCase()}${fsum ? ` with ${fsum}` : ''}${notes.length ? ` (${notes.join('; ')})` : ''}.`, notes }
  }

  let built
  switch (spec.kind) {
    case 'pnl_timeline': built = buildTimeline(spec, trades, range); break
    case 'equity': built = buildEquity(spec, trades); break
    case 'breakdown': built = buildBreakdown(spec, trades); break
    case 'whatif': built = buildWhatIf(spec, trades); break
    case 'adherence': built = buildAdherence(spec, trades, coachSettings); break
    default: return { note: null }
  }
  if (built.note) return { note: built.note, notes }

  return {
    visual: { ...built.visual, periodLabel: range.label, range: range.range, filterText: fsum, notes },
    facts: [`Period: ${range.label} (${range.range})${fsum ? `; filters: ${fsum}` : ''}.`, ...built.facts],
    notes,
  }
}

// ── Offline fallback planner ────────────────────────────────────────────
// Only used if the Gemini planner call fails, so charts still appear when the
// model is down. English keywords only — Gemini handles every other language.
export function localPlan(message = '') {
  const m = ` ${message.toLowerCase()} `
  const has = (...words) => words.some(w => m.includes(w))

  let period = 'last_30_days'
  if (has('today')) period = 'today'
  else if (has('yesterday')) period = 'yesterday'
  else if (has('last week')) period = 'last_week'
  else if (has('this week')) period = 'this_week'
  else if (has('last month', 'previous month')) period = 'last_month'
  else if (has('this month')) period = 'this_month'
  else if (has('3 months', 'three months', '90 days', 'quarter')) period = has('this quarter') ? 'this_quarter' : 'last_90_days'
  else if (has('7 days', 'seven days')) period = 'last_7_days'
  else if (has('this year')) period = 'this_year'
  else if (has('all time', 'overall', 'lifetime')) period = 'all_time'

  const excludeWeekdays = []
  if (has('exclud', 'except', 'without', 'skip', 'avoid', 'not on', 'no ')) {
    WEEKDAY_NAMES.forEach((n, i) => { if (m.includes(n.toLowerCase())) excludeWeekdays.push(i) })
  }
  const filters = excludeWeekdays.length ? { excludeWeekdays } : {}

  if (has('what if', 'what-if', 'what would', 'if i had', 'if i skipped', 'if i avoided')) {
    if (excludeWeekdays.length) return [{ kind: 'whatif', period, whatIf: { dimension: 'weekday', mode: 'exclude', values: excludeWeekdays }, filters: {} }]
  }
  if (has('adherence', 'follow my plan', 'following my plan', 'trading plan', 'discipline', 'my rules')) return [{ kind: 'adherence', period, filters }]
  if (has('equity', 'drawdown', 'account curve', 'growth')) return [{ kind: 'equity', period, filters }]
  if (has('by strategy', 'strateg')) return [{ kind: 'breakdown', period, groupBy: 'strategy', filters }]
  if (has('by symbol', 'which pair', 'which symbol', 'by pair', 'best pair', 'worst pair')) return [{ kind: 'breakdown', period, groupBy: 'symbol', filters }]
  if (has('session', 'london', 'new york', 'asian')) return [{ kind: 'breakdown', period, groupBy: 'session', filters }]
  if (has('weekday', 'day of the week', 'which day', 'best day', 'worst day')) return [{ kind: 'breakdown', period, groupBy: 'weekday', filters }]
  if (has('best time', 'best hour', 'time of day', 'what time', 'hours')) return [{ kind: 'breakdown', period, groupBy: 'hour', filters }]
  if (has('p&l', 'pnl', 'p/l', 'profit', 'performance', 'how did i do', 'results')) return [{ kind: 'pnl_timeline', period, filters }]
  return []
}