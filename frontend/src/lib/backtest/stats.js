// ─────────────────────────────────────────────────────────────────────────
// Backtesting — session statistics (pure). Every number is computed from the
// closed trades; nothing is estimated.
// trade: { side:'buy'|'sell', pnl:number, openedAt:unix, closedAt:unix, ... }
// ─────────────────────────────────────────────────────────────────────────

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Market-time day key (UTC) — a backtest "day" is the day on the chart, not the user's wall clock.
const dayKey = (secs) => new Date(secs * 1000).toISOString().slice(0, 10)
const monthKey = (secs) => new Date(secs * 1000).toISOString().slice(0, 7)

export const EMPTY_STATS = {
  trades: 0, wins: 0, losses: 0, breakeven: 0, winRate: 0,
  netPnl: 0, returnPct: 0, grossProfit: 0, grossLoss: 0, profitFactor: 0,
  expectancy: 0, avgWin: 0, avgLoss: 0, largestWin: 0, largestLoss: 0,
  long: { trades: 0, wins: 0, losses: 0, winRate: 0, pnl: 0 },
  short: { trades: 0, wins: 0, losses: 0, winRate: 0, pnl: 0 },
  maxDrawdown: 0, maxDrawdownPct: 0,
  streaks: { current: { type: null, count: 0 }, bestWin: 0, worstLoss: 0 },
  bestDay: null, worstDay: null, tradingDays: 0, profitDays: 0, lossDays: 0,
  equity: [], drawdown: [], monthly: [], avgHoldSecs: 0,
  weekdays: WEEKDAYS.map(label => ({ label, trades: 0, pnl: 0 })),
}

export function computeStats(trades = [], startBalance = 0) {
  if (!trades.length) return { ...EMPTY_STATS }

  const sorted = [...trades].sort((a, b) => a.closedAt - b.closedAt)
  const pnls = sorted.map(t => Number(t.pnl) || 0)

  const wins = sorted.filter(t => t.pnl > 0)
  const losses = sorted.filter(t => t.pnl < 0)
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
  const netPnl = pnls.reduce((s, n) => s + n, 0)

  const side = (name) => {
    const list = sorted.filter(t => t.side === name)
    const w = list.filter(t => t.pnl > 0).length
    const l = list.filter(t => t.pnl < 0).length
    return {
      trades: list.length, wins: w, losses: l,
      winRate: list.length ? (w / list.length) * 100 : 0,
      pnl: list.reduce((s, t) => s + t.pnl, 0),
    }
  }

  // Equity (closed-trade balance) + drawdown
  let bal = startBalance, peak = startBalance, maxDd = 0, maxDdPct = 0
  const equity = [{ t: sorted[0].openedAt ?? sorted[0].closedAt, balance: startBalance }]
  const drawdown = []
  for (const t of sorted) {
    bal += t.pnl
    peak = Math.max(peak, bal)
    const dd = peak - bal
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0
    if (dd > maxDd) maxDd = dd
    if (ddPct > maxDdPct) maxDdPct = ddPct
    equity.push({ t: t.closedAt, balance: bal })
    drawdown.push({ t: t.closedAt, dd: -dd, pct: -ddPct })
  }

  // Streaks
  let cur = { type: null, count: 0 }, bestWin = 0, worstLoss = 0
  for (const t of sorted) {
    const type = t.pnl > 0 ? 'win' : t.pnl < 0 ? 'loss' : null
    if (!type) { cur = { type: null, count: 0 }; continue }
    cur = cur.type === type ? { type, count: cur.count + 1 } : { type, count: 1 }
    if (type === 'win') bestWin = Math.max(bestWin, cur.count)
    else worstLoss = Math.max(worstLoss, cur.count)
  }

  // Days / months
  const days = new Map(), months = new Map()
  for (const t of sorted) {
    const d = dayKey(t.closedAt), m = monthKey(t.closedAt)
    days.set(d, (days.get(d) || 0) + t.pnl)
    const mm = months.get(m) || { trades: 0, pnl: 0, wins: 0 }
    mm.trades += 1; mm.pnl += t.pnl; mm.wins += t.pnl > 0 ? 1 : 0
    months.set(m, mm)
  }
  // trades and P&L per weekday (market-time day, Monday first)
  const weekdays = WEEKDAYS.map(label => ({ label, trades: 0, pnl: 0 }))
  for (const t of sorted) {
    const w = weekdays[(new Date(t.closedAt * 1000).getUTCDay() + 6) % 7]
    w.trades += 1; w.pnl += t.pnl
  }
  const dayList = [...days.entries()].map(([date, pnl]) => ({ date, pnl }))
  const bestDay = dayList.reduce((a, b) => (!a || b.pnl > a.pnl ? b : a), null)
  const worstDay = dayList.reduce((a, b) => (!a || b.pnl < a.pnl ? b : a), null)

  const holds = sorted.map(t => Math.max(0, (t.closedAt ?? 0) - (t.openedAt ?? t.closedAt ?? 0)))

  return {
    trades: sorted.length,
    wins: wins.length, losses: losses.length, breakeven: sorted.length - wins.length - losses.length,
    winRate: (wins.length / sorted.length) * 100,
    netPnl,
    returnPct: startBalance > 0 ? (netPnl / startBalance) * 100 : 0,
    grossProfit, grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    expectancy: netPnl / sorted.length,
    avgWin: wins.length ? grossProfit / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    largestWin: wins.length ? Math.max(...wins.map(t => t.pnl)) : 0,
    largestLoss: losses.length ? Math.min(...losses.map(t => t.pnl)) : 0,
    long: side('buy'), short: side('sell'),
    maxDrawdown: maxDd, maxDrawdownPct: maxDdPct,
    streaks: { current: cur, bestWin, worstLoss },
    bestDay, worstDay,
    tradingDays: dayList.length,
    profitDays: dayList.filter(d => d.pnl > 0).length,
    lossDays: dayList.filter(d => d.pnl < 0).length,
    equity, drawdown,
    monthly: [...months.entries()].sort().map(([key, v]) => {
      const [y, m] = key.split('-')
      return { key, label: `${MONTHS[+m - 1]} ${y}`, ...v, winRate: v.trades ? (v.wins / v.trades) * 100 : 0 }
    }),
    avgHoldSecs: holds.reduce((s, n) => s + n, 0) / holds.length,
    weekdays,
  }
}

// ── Formatting helpers shared by the backtesting UI ──────────────────────
export const fmtUsd = (n, { sign = false, dp = 2 } = {}) => {
  const v = Number.isFinite(n) ? n : 0
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
  const lead = v < 0 ? '-' : sign && v > 0 ? '+' : ''
  return `${lead}$${s}`
}

export const fmtFactor = (n) => (n === Infinity ? '∞' : Number.isFinite(n) ? n.toFixed(2) : '0.00')

export function fmtDuration(secs) {
  const s = Math.max(0, Math.round(secs || 0))
  if (s < 60) return '< 1m'
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m`
}