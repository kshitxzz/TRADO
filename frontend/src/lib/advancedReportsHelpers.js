// ── Helpers for the Advanced Reports page ──────────────────────────────────
// Deterministic, pure functions only — every number here is computed from
// real trade rows (never invented). Anything we can't compute honestly
// (e.g. realized R-multiple without stop-loss data) resolves to null so the
// UI can render "N/A" instead of a fabricated value.

export const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
export const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
export const DOW_MIN = ['S','M','T','W','T','F','S']

const pad = n => String(n).padStart(2, '0')
export const toDateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// ── Money formatting ────────────────────────────────────────────────────────
// Whole-dollar, comma-grouped — used for most stat cards / calendar cells.
export function fmtMoney(n, { sign = false } = {}) {
  if (n == null || isNaN(n)) n = 0
  const neg = n < 0
  const abs = Math.round(Math.abs(n))
  const s = abs.toLocaleString('en-US')
  const prefix = neg ? '-' : (sign ? '+' : '')
  return `${prefix}$${s}`
}
// Cents-precise — used for weekly totals / tooltips.
export function fmtMoneyPrecise(n, { sign = false } = {}) {
  if (n == null || isNaN(n)) n = 0
  const neg = n < 0
  const abs = Math.abs(n)
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const prefix = neg ? '-' : (sign ? '+' : '')
  return `${prefix}$${s}`
}
// Compact K-notation — used for the "hero" day cards on the Reports tab.
export function fmtK(n) {
  if (n == null || isNaN(n)) return '$0'
  const neg = n < 0
  const abs = Math.abs(n)
  const body = abs >= 1000 ? `${(abs / 1000).toFixed(1)}K` : abs.toFixed(0)
  return `${neg ? '-' : ''}$${body}`
}
export function fmtPct(n, digits = 2) {
  if (n == null || isNaN(n)) return 'N/A'
  return `${n.toFixed(digits)}%`
}
// Signed duration in minutes -> "Xh Ym" (never shows a stray leading minus —
// hold time is always displayed as a plain magnitude).
export function fmtHold(minutes) {
  if (minutes == null || isNaN(minutes)) return 'N/A'
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = Math.round(abs % 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}
export function pnlColor(n) {
  return n > 0 ? 'var(--positive-green)' : n < 0 ? 'var(--negative-red)' : 'var(--text-muted)'
}

// ── Streaks ─────────────────────────────────────────────────────────────────
export function maxConsecutive(arr, predicate) {
  let max = 0, cur = 0
  arr.forEach(item => { if (predicate(item)) { cur++; max = Math.max(max, cur) } else cur = 0 })
  return max
}

// ── Day-of-week aggregation (Sun..Sat) ──────────────────────────────────────
export function computeDayOfWeekStats(closedTrades) {
  const byDate = {}
  closedTrades.forEach(t => {
    if (!t.closed_at) return
    const key = t.closed_at.slice(0, 10)
    if (!byDate[key]) byDate[key] = { pnl: 0, count: 0, wins: 0, volume: 0 }
    byDate[key].pnl += t.pnl || 0
    byDate[key].count++
    byDate[key].volume += t.size || 0
    if ((t.pnl || 0) > 0) byDate[key].wins++
  })

  const rows = DOW_LABELS.map(label => ({
    day: label, pnl: 0, count: 0, wins: 0, days: 0, volume: 0,
    avgWinSum: 0, avgWinCount: 0, avgLossSum: 0, avgLossCount: 0,
  }))

  closedTrades.forEach(t => {
    if (!t.closed_at) return
    const dow = new Date(t.closed_at).getDay()
    const row = rows[dow]
    row.pnl += t.pnl || 0
    row.count++
    if ((t.pnl || 0) > 0) { row.wins++; row.avgWinSum += t.pnl; row.avgWinCount++ }
    if ((t.pnl || 0) < 0) { row.avgLossSum += t.pnl; row.avgLossCount++ }
  })

  Object.entries(byDate).forEach(([dateKey, agg]) => {
    const dow = new Date(dateKey + 'T00:00:00').getDay()
    rows[dow].days++
    rows[dow].volume += agg.volume
  })

  return rows.map(r => ({
    day: r.day,
    pnl: r.pnl,
    count: r.count,
    winRate: r.count ? (r.wins / r.count) * 100 : 0,
    tradingDays: r.days,
    avgDailyVolume: r.days ? r.volume / r.days : 0,
    avgWin: r.avgWinCount ? r.avgWinSum / r.avgWinCount : 0,
    avgLoss: r.avgLossCount ? r.avgLossSum / r.avgLossCount : 0,
  }))
}

// "Best/least performing", "most active", "best win rate" hero cards
export function computeDayHeroCards(closedTrades) {
  const rows = computeDayOfWeekStats(closedTrades).filter(r => r.count > 0)
  if (rows.length === 0) return null
  const best   = [...rows].sort((a, b) => b.pnl - a.pnl)[0]
  const worst  = [...rows].sort((a, b) => a.pnl - b.pnl)[0]
  const active = [...rows].sort((a, b) => b.count - a.count)[0]
  const winner = [...rows].sort((a, b) => b.winRate - a.winRate || b.count - a.count)[0]
  return { best, worst, active, winner }
}

// ── Period-bucketed grouping for the Performance-tab charts ────────────────
// granularity: 'day' | 'week' | 'month' | 'year'
function bucketKey(dateObj, granularity) {
  const y = dateObj.getFullYear()
  if (granularity === 'year') return `${y}`
  if (granularity === 'month') return `${y}-${pad(dateObj.getMonth() + 1)}`
  if (granularity === 'week') {
    // Monday-start ISO-ish week key = date of that week's Monday
    const d = new Date(dateObj)
    const day = d.getDay()
    const diff = day === 0 ? 6 : day - 1
    d.setDate(d.getDate() - diff)
    return toDateKey(d)
  }
  return toDateKey(dateObj) // day
}
function bucketLabel(key, granularity) {
  if (granularity === 'year') return key
  if (granularity === 'month') {
    const [y, m] = key.split('-')
    return `${MONTHS_SHORT[parseInt(m, 10) - 1]} ${y}`
  }
  const d = new Date(key + 'T00:00:00')
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
}

export function groupTradesByGranularity(closedTrades, granularity = 'day') {
  const map = {}
  closedTrades.forEach(t => {
    if (!t.closed_at) return
    const d = new Date(t.closed_at)
    const key = bucketKey(d, granularity)
    if (!map[key]) map[key] = { key, pnl: 0, count: 0, wins: 0 }
    map[key].pnl += t.pnl || 0
    map[key].count++
    if ((t.pnl || 0) > 0) map[key].wins++
  })
  const buckets = Object.values(map).sort((a, b) => a.key.localeCompare(b.key))
  let cumulative = 0
  return buckets.map(b => {
    cumulative += b.pnl
    return {
      ...b,
      label: bucketLabel(b.key, granularity),
      cumulative: parseFloat(cumulative.toFixed(2)),
      winRate: b.count ? (b.wins / b.count) * 100 : 0,
    }
  })
}

// ── Calendar-month grid (always 6 rows x 7 cols, Sun-first) ────────────────
export function buildMonthCalendar(closedTrades, year, monthIndex) {
  const byDate = {}
  closedTrades.forEach(t => {
    if (!t.closed_at) return
    const key = t.closed_at.slice(0, 10)
    if (!byDate[key]) byDate[key] = { pnl: 0, count: 0 }
    byDate[key].pnl += t.pnl || 0
    byDate[key].count++
  })

  const firstOfMonth = new Date(year, monthIndex, 1)
  const startOffset = firstOfMonth.getDay() // 0=Sun
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()

  const cells = []
  // leading blanks
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, monthIndex, day)
    const key = toDateKey(dateObj)
    const agg = byDate[key]
    cells.push({
      date: day,
      dateKey: key,
      pnl: agg ? agg.pnl : 0,
      count: agg ? agg.count : 0,
      hasTrades: !!agg,
    })
  }
  // trailing blanks to complete 6 rows (42 cells)
  while (cells.length < 42) cells.push(null)

  const weeks = []
  for (let i = 0; i < 6; i++) {
    const weekCells = cells.slice(i * 7, i * 7 + 7)
    const weekPnl = weekCells.reduce((s, c) => s + (c ? c.pnl : 0), 0)
    const weekTrades = weekCells.reduce((s, c) => s + (c ? c.count : 0), 0)
    weeks.push({ index: i + 1, cells: weekCells, pnl: weekPnl, tradeCount: weekTrades })
  }

  return { year, monthIndex, weeks, cells }
}

// Mini year-overview calendar (numbers only, no P&L needed)
export function buildMiniMonth(year, monthIndex) {
  const firstOfMonth = new Date(year, monthIndex, 1)
  const startOffset = firstOfMonth.getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

// ── Symbol breakdown per day-of-week (for Cross Analysis) ──────────────────
export function computeTopSymbolByDay(closedTrades) {
  const byDow = DOW_LABELS.map(() => ({}))
  closedTrades.forEach(t => {
    if (!t.closed_at || !t.symbol) return
    const dow = new Date(t.closed_at).getDay()
    const bucket = byDow[dow]
    if (!bucket[t.symbol]) bucket[t.symbol] = { symbol: t.symbol, pnl: 0, count: 0 }
    bucket[t.symbol].pnl += t.pnl || 0
    bucket[t.symbol].count++
  })
  return byDow.map(bucket => {
    const list = Object.values(bucket).sort((a, b) => b.pnl - a.pnl)
    return list[0] || null
  })
}

// ── Planned R-multiple (only computable field we actually have) ────────────
export function computePlannedRMultiple(closedTrades) {
  const withRR = closedTrades.filter(t => t.rr_risk != null && t.rr_reward != null && t.rr_risk > 0)
  if (withRR.length === 0) return null
  const sum = withRR.reduce((s, t) => s + (t.rr_reward / t.rr_risk), 0)
  return sum / withRR.length
}

// ── Max drawdown from an equity curve (array of {pnl} running totals) ──────
export function computeDrawdown(curve) {
  let peak = 0, maxDD = 0
  curve.forEach(pt => {
    if (pt.pnl > peak) peak = pt.pnl
    const dd = peak - pt.pnl
    if (dd > maxDD) maxDD = dd
  })
  const pct = peak > 0 ? -(maxDD / peak) * 100 : null
  return { maxDrawdown: -maxDD, maxDrawdownPct: pct }
}