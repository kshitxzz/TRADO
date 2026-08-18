export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function formatCurrency(val, currency = 'USD') {
  const num = parseFloat(val) || 0
  const prefix = num >= 0 ? '+$' : '-$'
  return prefix + Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatPnl(val) {
  const num = parseFloat(val) || 0
  const formatted = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return num >= 0 ? `+$${formatted}` : `-$${formatted}`
}

export function pnlColor(val) {
  return parseFloat(val) >= 0 ? 'var(--positive-green)' : 'var(--negative-red)'
}

export function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

export function tradingSession(utcHour) {
  if (utcHour >= 0  && utcHour < 8)  return 'Asian'
  if (utcHour >= 8  && utcHour < 16) return 'London'
  if (utcHour >= 13 && utcHour < 21) return 'New York'
  return 'Asian'
}

// Total P&L = the full picture, exactly like the broker's own P&L tile:
// realized P&L from every closed trade PLUS live unrealized P&L from any
// currently-open position(s). Open trades' `pnl` is kept fresh by the MT5
// EA sync + Supabase Realtime, so `totalPnl` (and therefore this tile)
// updates the instant a position's floating P&L ticks — it is never just
// "today's" number, and never just the closed/realized number alone.
export function computeStats(trades = []) {
  const closed = trades.filter(t => t.status === 'closed')
  const open   = trades.filter(t => t.status === 'open')

  const realizedPnl   = closed.reduce((s, t) => s + (t.pnl || 0), 0)
  const unrealizedPnl = open.reduce((s, t) => s + (t.pnl || 0), 0)
  const totalPnl = realizedPnl + unrealizedPnl

  const wins = closed.filter(t => t.pnl > 0)
  const losses = closed.filter(t => t.pnl < 0)
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0
  const avgWin  = wins.length   ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0)
  const grossLoss   = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0
  const bestTrade  = closed.length ? Math.max(...closed.map(t => t.pnl)) : 0
  const worstTrade = closed.length ? Math.min(...closed.map(t => t.pnl)) : 0

  // Streak
  let streak = 0, streakType = 'win'
  for (let i = closed.length - 1; i >= 0; i--) {
    const isWin = closed[i].pnl > 0
    if (i === closed.length - 1) { streakType = isWin ? 'win' : 'loss'; streak = 1 }
    else if ((isWin && streakType === 'win') || (!isWin && streakType === 'loss')) streak++
    else break
  }

  return {
    totalPnl, realizedPnl, unrealizedPnl,
    winRate, avgWin, avgLoss, profitFactor, bestTrade, worstTrade,
    streak, streakType, tradeCount: closed.length,
  }
}

export function buildEquityCurve(trades = []) {
  const sorted = [...trades].filter(t => t.status === 'closed').sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at))
  let cumulative = 0
  return sorted.map(t => {
    cumulative += t.pnl
    return { date: t.closed_at?.slice(0,10) || '', pnl: parseFloat(cumulative.toFixed(2)) }
  })
}

// Today's P&L = realized P&L from trades closed today, plus live unrealized
// P&L from any currently-open position(s). While a trade is open its `pnl`
// field is kept fresh by the MT5 EA sync + Supabase Realtime, so `unrealized`
// updates live; the moment nothing is open, `total` collapses back to plain
// realized "today" P&L exactly as before.
export function getTodayPnl(trades = []) {
  const today = new Date().toISOString().slice(0,10)

  const realized = trades
    .filter(t => t.status === 'closed' && t.closed_at?.slice(0,10) === today)
    .reduce((s, t) => s + (t.pnl || 0), 0)

  const openTrades = trades.filter(t => t.status === 'open')
  const unrealized = openTrades.reduce((s, t) => s + (t.pnl || 0), 0)

  return {
    total:     realized + unrealized,
    realized,
    unrealized,
    openCount: openTrades.length,
  }
}

export function getMonthPnl(trades = []) {
  const month = new Date().toISOString().slice(0,7)
  return trades.filter(t => t.closed_at?.slice(0,7) === month).reduce((s,t) => s + (t.pnl||0), 0)
}

export function getMonthStats(trades = []) {
  const month = new Date().toISOString().slice(0,7)
  const monthTrades = trades.filter(t => t.closed_at?.slice(0,7) === month)
  const pnl = monthTrades.reduce((s,t) => s + (t.pnl||0), 0)
  return { pnl, count: monthTrades.length }
}