// ─────────────────────────────────────────────────────────────────────────
// Trado AI — deterministic analytics engine
//
// Every number in the Trado AI section comes from here (or from
// computeTradeScore in components/charts/TradeScoreRadar.jsx). Gemini is
// only ever handed these pre-computed, real facts and asked to *narrate*
// them — it never calculates a statistic itself. This keeps the AI section
// grounded in the trader's actual data instead of plausible-sounding
// invented numbers.
// ─────────────────────────────────────────────────────────────────────────

import { computeStats, formatPnl, buildEquityCurve } from './utils'
import { detectSession } from '../hooks/useTimezone'

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))

export function sessionLabel(s) {
  if (!s) return null
  const key = String(s).toLowerCase().replace(/\s+/g, '_')
  const map = { asian: 'Asian', london: 'London', new_york: 'New York', ny: 'New York' }
  return map[key] || s
}

// ── Week range helpers (Sunday → Saturday, matches rest of the app) ────────
export function getWeekRange(offset = 0) {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay() + offset * 7)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

export function formatWeekRange({ start, end }) {
  const opts = { month: 'short', day: 'numeric' }
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`
}

function tradesInRange(trades, range) {
  return trades.filter(t => t.status === 'closed' && t.closed_at &&
    new Date(t.closed_at) >= range.start && new Date(t.closed_at) <= range.end)
}

// ── Streaks (full history) ──────────────────────────────────────────────
export function computeStreakStats(trades = []) {
  const closed = trades.filter(t => t.status === 'closed' && t.pnl != null)
    .slice().sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at))

  let longestWin = 0, longestLoss = 0, curWin = 0, curLoss = 0
  closed.forEach(t => {
    if (t.pnl > 0) { curWin++; curLoss = 0 } else if (t.pnl < 0) { curLoss++; curWin = 0 } else { curWin = 0; curLoss = 0 }
    longestWin  = Math.max(longestWin, curWin)
    longestLoss = Math.max(longestLoss, curLoss)
  })

  return { longestWinStreak: longestWin, longestLossStreak: longestLoss }
}

// ── Revenge-trade detection ─────────────────────────────────────────────
// A "revenge trade" = a new position opened within REVENGE_WINDOW_MIN of
// closing a loser. Flags whether size was also escalated afterward.
const REVENGE_WINDOW_MIN = 15

export function detectRevengeTrades(trades = []) {
  const closed = trades.filter(t => t.status === 'closed' && t.opened_at && t.closed_at)
    .slice().sort((a, b) => new Date(a.opened_at) - new Date(b.opened_at))

  const instances = []
  for (let i = 1; i < closed.length; i++) {
    const prev = closed[i - 1], cur = closed[i]
    if (prev.pnl < 0) {
      const gapMin = (new Date(cur.opened_at) - new Date(prev.closed_at)) / 60000
      if (gapMin >= 0 && gapMin <= REVENGE_WINDOW_MIN) {
        const sizeEscalated = !!(prev.size && cur.size && cur.size > prev.size * 1.3)
        instances.push({ symbol: cur.symbol, pnl: cur.pnl, gapMin: Math.round(gapMin), sizeEscalated })
      }
    }
  }

  const cost = instances.reduce((s, i) => s + Math.min(0, i.pnl), 0)
  const netPnl = instances.reduce((s, i) => s + i.pnl, 0)
  const sizeEscalations = instances.filter(i => i.sizeEscalated).length

  return { count: instances.length, cost, netPnl, sizeEscalations, windowMin: REVENGE_WINDOW_MIN, instances }
}

// ── Journal-derived stats (discipline / self-assessment) ───────────────
export function computeJournalStats(trades = []) {
  const closed = trades.filter(t => t.status === 'closed')
  const journaled = closed.filter(t => t.journaled_at)
  const journaledRate = closed.length ? (journaled.length / closed.length) * 100 : 0

  const ratings = journaled.map(t => t.rating).filter(r => r != null)
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null

  const checklistRates = journaled
    .map(t => Array.isArray(t.execution_checklist) && t.execution_checklist.length
      ? (t.execution_checklist.filter(c => c.checked).length / t.execution_checklist.length) * 100
      : null)
    .filter(v => v != null)
  const avgChecklistCompletion = checklistRates.length
    ? checklistRates.reduce((a, b) => a + b, 0) / checklistRates.length : null

  return {
    closedCount: closed.length, journaledCount: journaled.length, journaledRate,
    avgRating, avgChecklistCompletion,
  }
}

// ── Risk Breakdown: Emotional / Sizing / Consistency / Discipline ──────
// Sizing & Consistency are pulled straight from computeTradeScore's axes
// (single source of truth shared with the Dashboard's Trade Score radar).
// Emotional & Discipline are new, journal + revenge-trade grounded scores.
export function computeRiskBreakdown(trades = [], tradeScoreAxes = []) {
  const axisMap = Object.fromEntries(tradeScoreAxes.map(a => [a.dimension, a.value]))
  const sizing      = axisMap['Discipline']  ?? 50 // size-CoV based in computeTradeScore
  const consistency = axisMap['Consistency'] ?? 50 // pnl-CoV based

  const closed = trades.filter(t => t.status === 'closed')
  const revenge = detectRevengeTrades(trades)
  const revengeRate = closed.length ? revenge.count / closed.length : 0
  const emotionalFromRevenge = clamp(100 - revengeRate * 300)

  const journal = computeJournalStats(trades)
  const emotionalFromRating = journal.avgRating != null ? (journal.avgRating / 10) * 100 : null
  const emotional = Math.round(emotionalFromRating != null
    ? emotionalFromRevenge * 0.5 + emotionalFromRating * 0.5
    : emotionalFromRevenge)

  let discipline
  if (journal.avgChecklistCompletion != null) {
    discipline = Math.round(journal.avgChecklistCompletion * 0.65 + journal.journaledRate * 0.35)
  } else {
    discipline = Math.round(journal.journaledRate)
  }

  return {
    emotional, sizing: Math.round(sizing), consistency: Math.round(consistency), discipline,
    facts: {
      revengeTradeCount: revenge.count,
      revengeTradeCost: revenge.cost,
      revengeWindowMin: revenge.windowMin,
      revengeSizeEscalations: revenge.sizeEscalations,
      journaledRate: journal.journaledRate,
      journaledCount: journal.journaledCount,
      closedCount: journal.closedCount,
      avgRating: journal.avgRating,
      avgChecklistCompletion: journal.avgChecklistCompletion,
    },
  }
}

export function riskGrade(score) {
  if (score >= 80) return { label: 'Strong',   color: 'var(--positive-green)' }
  if (score >= 60) return { label: 'Moderate', color: 'var(--warning-orange)' }
  return              { label: 'Needs Work', color: 'var(--negative-red)' }
}

// ── Breakdown helpers (session / symbol / day-of-week) ──────────────────
export function computeSessionBreakdown(trades = []) {
  const map = {}
  trades.filter(t => t.status === 'closed' && t.session).forEach(t => {
    const key = sessionLabel(t.session)
    if (!map[key]) map[key] = { pnl: 0, count: 0, wins: 0 }
    map[key].pnl += t.pnl || 0; map[key].count++
    if (t.pnl > 0) map[key].wins++
  })
  return Object.entries(map).map(([session, v]) => ({
    session, pnl: v.pnl, count: v.count, wins: v.wins,
    winRate: v.count ? (v.wins / v.count) * 100 : 0,
  })).sort((a, b) => b.pnl - a.pnl)
}

export function computeSymbolBreakdown(trades = []) {
  const map = {}
  trades.filter(t => t.status === 'closed').forEach(t => {
    if (!map[t.symbol]) map[t.symbol] = { pnl: 0, count: 0, wins: 0 }
    map[t.symbol].pnl += t.pnl || 0; map[t.symbol].count++
    if (t.pnl > 0) map[t.symbol].wins++
  })
  return Object.entries(map).map(([symbol, v]) => ({
    symbol, pnl: v.pnl, count: v.count, wins: v.wins,
    winRate: v.count ? (v.wins / v.count) * 100 : 0,
  })).sort((a, b) => b.pnl - a.pnl)
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function computeDayOfWeekBreakdown(trades = []) {
  const map = {}
  trades.filter(t => t.status === 'closed' && t.closed_at).forEach(t => {
    const day = WEEKDAYS[new Date(t.closed_at).getDay()]
    if (!map[day]) map[day] = { pnl: 0, count: 0, wins: 0 }
    map[day].pnl += t.pnl || 0; map[day].count++
    if (t.pnl > 0) map[day].wins++
  })
  return Object.entries(map).map(([day, v]) => ({
    day, pnl: v.pnl, count: v.count, wins: v.wins,
    winRate: v.count ? (v.wins / v.count) * 100 : 0,
  })).sort((a, b) => b.pnl - a.pnl)
}

// ── Grade mapping (0–100 process score → letter grade) ─────────────────
export function computeGrade(score) {
  if (score >= 97) return 'A+'
  if (score >= 93) return 'A'
  if (score >= 90) return 'A-'
  if (score >= 87) return 'B+'
  if (score >= 83) return 'B'
  if (score >= 80) return 'B-'
  if (score >= 77) return 'C+'
  if (score >= 73) return 'C'
  if (score >= 70) return 'C-'
  if (score >= 65) return 'D+'
  if (score >= 60) return 'D'
  return 'F'
}

// Red → orange → yellow → green band color for a 0–100 score, used by the
// AI Performance Score gauge on the Overview tab.
export function scoreBandColor(score) {
  if (score >= 75) return '#22C55E'
  if (score >= 60) return '#84CC16'
  if (score >= 40) return '#F59E0B'
  return '#EF4444'
}

export function gradeColor(grade) {
  if (grade.startsWith('A')) return '#22C55E'
  if (grade.startsWith('B')) return '#8B5CF6'
  if (grade.startsWith('C')) return '#F59E0B'
  return '#EF4444'
}

// ── Full weekly stats bundle (for the Weekly Summary tab) ──────────────
export function computeWeekStats(trades = [], range) {
  const inRange = tradesInRange(trades, range)
  const stats = computeStats(inRange)

  const days = new Set(inRange.map(t => t.closed_at?.slice(0, 10)).filter(Boolean))
  const tradingDays = days.size
  const avgPerDay = tradingDays ? inRange.length / tradingDays : 0

  const dayMap = {}
  inRange.forEach(t => {
    const d = t.closed_at?.slice(0, 10); if (!d) return
    dayMap[d] = (dayMap[d] || 0) + (t.pnl || 0)
  })
  const bestDayEntry = Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0]
  const bestDay = bestDayEntry ? { date: bestDayEntry[0], pnl: bestDayEntry[1] } : null

  const symbolBreakdown = computeSymbolBreakdown(inRange)
  const mostTraded = symbolBreakdown.slice().sort((a, b) => b.count - a.count)[0]?.symbol || null
  const mostProfitable = symbolBreakdown[0] || null

  const durations = inRange.map(t => t.duration_seconds).filter(d => d != null)
  const avgDurationMin = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length / 60 : null

  const longs  = inRange.filter(t => t.side === 'long')
  const shorts = inRange.filter(t => t.side === 'short')
  const longWinRate  = longs.length  ? (longs.filter(t => t.pnl > 0).length  / longs.length)  * 100 : null
  const shortWinRate = shorts.length ? (shorts.filter(t => t.pnl > 0).length / shorts.length) * 100 : null

  const rr = stats.avgLoss !== 0 ? Math.abs(stats.avgWin / stats.avgLoss) : 0

  return {
    ...stats, range, trades: inRange, tradingDays, avgPerDay, bestDay,
    mostTraded, mostProfitable, avgDurationMin, longWinRate, shortWinRate, rr,
  }
}

export function computeWeekDelta(current, previous) {
  const pnlDeltaPct = previous.totalPnl !== 0
    ? ((current.totalPnl - previous.totalPnl) / Math.abs(previous.totalPnl)) * 100
    : (current.totalPnl !== 0 ? 100 : 0)
  const wrDeltaPts = current.winRate - previous.winRate
  return { pnlDeltaPct, wrDeltaPts }
}

// Deterministic 0–100 "process quality" score for a set of trades — feeds
// the weekly letter grade. Deliberately about *how* they traded, not just
// whether they made money (a lucky, undisciplined week can still grade low).
export function computeProcessScore(weekRiskBreakdown, weekTradeScoreAxes = []) {
  const axisMap = Object.fromEntries(weekTradeScoreAxes.map(a => [a.dimension, a.value]))
  const profitability = axisMap['Profitability'] ?? 50
  const parts = [
    weekRiskBreakdown.emotional,
    weekRiskBreakdown.sizing,
    weekRiskBreakdown.consistency,
    weekRiskBreakdown.discipline,
    profitability,
  ]
  return Math.round(clamp(parts.reduce((a, b) => a + b, 0) / parts.length))
}

// ── Pattern detection — only returns patterns that are actually present ─
export function detectPatterns(trades = []) {
  const closed = trades.filter(t => t.status === 'closed')
  const patterns = []
  if (closed.length < 3) return patterns

  const stats = computeStats(closed)

  // Session strength / weakness (min sample size 3)
  const sessions = computeSessionBreakdown(closed).filter(s => s.count >= 3)
  if (sessions.length) {
    const best = sessions[0]
    if (best.pnl > 0) patterns.push({
      id: 'session_strength', severity: 'positive', title: `${best.session} Session Strength`,
      facts: { session: best.session, winRate: best.winRate, count: best.count, pnl: best.pnl },
    })
    const worst = sessions[sessions.length - 1]
    if (worst.pnl < 0 && worst.session !== best.session) patterns.push({
      id: 'session_weakness', severity: 'warning', title: `${worst.session} Session Bleed`,
      facts: { session: worst.session, winRate: worst.winRate, count: worst.count, pnl: worst.pnl },
    })
  }

  // Symbol concentration risk
  const symbols = computeSymbolBreakdown(closed)
  if (symbols.length) {
    const top = symbols.slice().sort((a, b) => b.count - a.count)[0]
    const concentration = (top.count / closed.length) * 100
    if (concentration >= 70 && symbols.length > 1) patterns.push({
      id: 'symbol_concentration', severity: 'info', title: 'Symbol Concentration',
      facts: { symbol: top.symbol, concentration, count: top.count, total: closed.length },
    })
  }

  // Revenge trading
  const revenge = detectRevengeTrades(trades)
  if (revenge.count > 0) patterns.push({
    id: 'revenge_trading', severity: 'warning', title: 'Revenge Trading Detected',
    facts: { count: revenge.count, cost: revenge.cost, windowMin: revenge.windowMin, sizeEscalations: revenge.sizeEscalations },
  })

  // Position sizing variance
  const sizes = closed.map(t => t.size || 0).filter(s => s > 0)
  if (sizes.length > 3) {
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length
    const variance = sizes.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / sizes.length
    const cov = Math.sqrt(variance) / (mean || 1)
    if (cov > 0.6) patterns.push({
      id: 'sizing_variance', severity: 'warning', title: 'Position Sizing Variance',
      facts: { cov: cov * 100, mean },
    })
  }

  // Long/short bias (min sample 3 each side)
  const longs  = closed.filter(t => t.side === 'long')
  const shorts = closed.filter(t => t.side === 'short')
  if (longs.length >= 3 && shorts.length >= 3) {
    const lwr = (longs.filter(t => t.pnl > 0).length / longs.length) * 100
    const swr = (shorts.filter(t => t.pnl > 0).length / shorts.length) * 100
    if (Math.abs(lwr - swr) >= 20) patterns.push({
      id: 'directional_bias', severity: 'info', title: lwr > swr ? 'Long-Side Edge' : 'Short-Side Edge',
      facts: { longWinRate: lwr, shortWinRate: swr, longCount: longs.length, shortCount: shorts.length },
    })
  }

  // Day-of-week effect (min sample 3)
  const dow = computeDayOfWeekBreakdown(closed).filter(d => d.count >= 3)
  if (dow.length) {
    const worst = dow[dow.length - 1]
    if (worst.pnl < 0 && worst.winRate < 40) patterns.push({
      id: 'weekday_weakness', severity: 'warning', title: `${worst.day} Underperformance`,
      facts: { day: worst.day, winRate: worst.winRate, count: worst.count, pnl: worst.pnl },
    })
  }

  // Low win rate relative to required breakeven
  if (stats.winRate < 50 && stats.avgLoss !== 0) {
    const breakeven = Math.abs(stats.avgLoss) / (Math.abs(stats.avgWin) + Math.abs(stats.avgLoss)) * 100
    if (stats.winRate < breakeven) patterns.push({
      id: 'below_breakeven', severity: 'warning', title: 'Win Rate Below Breakeven',
      facts: { winRate: stats.winRate, breakeven, profitFactor: stats.profitFactor },
    })
  }

  return patterns
}

// ── Trade DNA context (overall archetype inputs) ────────────────────────
export function computeTradeDnaContext(trades = []) {
  const closed = trades.filter(t => t.status === 'closed')
  const symbols = computeSymbolBreakdown(closed)
  const sessions = computeSessionBreakdown(closed)
  const topSymbol = symbols.slice().sort((a, b) => b.count - a.count)[0]?.symbol || null
  const topSessionByProfit = sessions[0]?.session || null
  const durations = closed.map(t => t.duration_seconds).filter(d => d != null)
  const avgDurationMin = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length / 60 : null

  const sizes = closed.map(t => t.size || 0).filter(s => s > 0)
  let sizeCoV = null
  if (sizes.length > 1) {
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length
    const variance = sizes.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / sizes.length
    sizeCoV = Math.sqrt(variance) / (mean || 1)
  }
  const riskProfile = sizeCoV == null ? 'unknown' : sizeCoV > 0.6 ? 'high' : sizeCoV > 0.3 ? 'medium' : 'low'

  const days = new Set(closed.map(t => t.closed_at?.slice(0, 10)).filter(Boolean))
  const tradesPerDay = days.size ? closed.length / days.size : 0
  const tradeFrequency = tradesPerDay >= 4 ? 'high' : tradesPerDay >= 1.5 ? 'moderate' : 'low'

  const stats = computeStats(closed)

  return { topSymbol, topSessionByProfit, avgDurationMin, riskProfile, tradeFrequency, tradesPerDay, stats }
}

// ─────────────────────────────────────────────────────────────────────────
// Per-trade "Trade DNA" scoring — powers the Trade DNA page (Journal →
// Analytics). Everything here is deterministic and computed from the single
// trade row; Gemini is only ever handed the result to narrate, same as the
// rest of this file.
// ─────────────────────────────────────────────────────────────────────────

// Falls back to opened_at/closed_at when duration_seconds hasn't been
// populated on the row (e.g. some manually-added trades).
export function getDurationSeconds(trade = {}) {
  if (trade.duration_seconds != null) return trade.duration_seconds
  if (trade.opened_at && trade.closed_at) {
    const secs = (new Date(trade.closed_at) - new Date(trade.opened_at)) / 1000
    return Number.isFinite(secs) && secs >= 0 ? secs : null
  }
  return null
}

export function formatDuration(seconds) {
  if (seconds == null) return '—'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem ? `${hrs}h ${rem}m` : `${hrs}h`
}

// 0–100 band used specifically by the Trade Quality card (distinct from the
// A–F letter-grade bands used elsewhere — this one mirrors the 4-tier
// Excellent/Good/Average/Needs Work legend shown on that card).
export function qualityBand(score) {
  if (score >= 80) return { label: 'Excellent', color: 'var(--positive-green)' }
  if (score >= 60) return { label: 'Good', color: '#3B82F6' }
  if (score >= 40) return { label: 'Average', color: 'var(--warning-orange)' }
  return { label: 'Needs Work', color: 'var(--negative-red)' }
}

// Trade Quality score (0–100) for a single trade:
//   Profitability (30 pts) — win/break-even/loss outcome
//   Execution     (40 pts) — % of that trade's execution checklist completed
//   Journal       (20 pts) — 5 pts each for pre-analysis / post-review / emotions / lessons
//   Rating        (10 pts) — the trader's own 1–10 self-rating, taken as-is
export function computeTradeQualityScore(trade = {}) {
  const pnl = trade.pnl ?? 0
  const isWin = pnl > 0, isBreakeven = pnl === 0, isLoss = pnl < 0
  const profitability = isWin ? 30 : isBreakeven ? 15 : 0

  const checklist = Array.isArray(trade.execution_checklist) ? trade.execution_checklist : []
  const checklistTotal = checklist.length
  const checklistChecked = checklist.filter(c => c.checked).length
  const execution = checklistTotal > 0 ? Math.round((checklistChecked / checklistTotal) * 40) : 0

  let journal = 0
  if ((trade.pre_trade_analysis || '').trim()) journal += 5
  if ((trade.post_trade_review  || '').trim()) journal += 5
  if ((trade.emotions           || '').trim()) journal += 5
  if ((trade.lessons_learned    || '').trim()) journal += 5

  const rating = trade.rating != null ? Math.max(0, Math.min(10, Math.round(trade.rating))) : 0

  const total = profitability + execution + journal + rating
  const band = qualityBand(total)

  return {
    total, profitability, execution, journal, rating,
    checklistChecked, checklistTotal,
    isWin, isBreakeven, isLoss,
    grade: band.label, gradeColor: band.color,
  }
}

// "vs Your Average" tiles on the Trade DNA page — compares this trade
// against the trader's OTHER closed trades (never against itself).
export function computeTradeVsAverage(trade, allTrades = []) {
  const others = allTrades.filter(t => t.status === 'closed' && t.id !== trade.id)
  const pnl = trade.pnl ?? 0
  const isWin = pnl > 0, isLoss = pnl < 0

  const bucket = isWin ? others.filter(t => (t.pnl || 0) > 0)
               : isLoss ? others.filter(t => (t.pnl || 0) < 0)
               : []
  const avgBucketPnl = bucket.length ? bucket.reduce((s, t) => s + (t.pnl || 0), 0) / bucket.length : null
  const pnlDeltaPct = avgBucketPnl ? ((Math.abs(pnl) - Math.abs(avgBucketPnl)) / Math.abs(avgBucketPnl)) * 100 : 0

  const thisDurationSec = getDurationSeconds(trade)
  const otherDurations = others.map(getDurationSeconds).filter(d => d != null)
  const avgDurationSec = otherDurations.length ? otherDurations.reduce((a, b) => a + b, 0) / otherDurations.length : null
  const holdDeltaPct = avgDurationSec && thisDurationSec != null ? ((thisDurationSec - avgDurationSec) / avgDurationSec) * 100 : 0

  const execPctOf = (t) => {
    const cl = Array.isArray(t.execution_checklist) ? t.execution_checklist : []
    return cl.length ? (cl.filter(c => c.checked).length / cl.length) * 100 : null
  }
  const thisExecPct = execPctOf(trade)
  const otherExecPcts = others.map(execPctOf).filter(v => v != null)
  const avgExecPct = otherExecPcts.length ? otherExecPcts.reduce((a, b) => a + b, 0) / otherExecPcts.length : null
  const execDeltaPct = avgExecPct && thisExecPct != null ? ((thisExecPct - avgExecPct) / avgExecPct) * 100 : 0

  return {
    isWin, isLoss,
    vsAvgLabel: isWin ? 'vs Avg Winner' : isLoss ? 'vs Avg Loser' : 'vs Avg Breakeven',
    pnl, pnlDeltaPct, hasBucket: bucket.length > 0,
    durationSec: thisDurationSec, holdDeltaPct, hasDurationBaseline: otherDurations.length > 0,
    executionPct: thisExecPct, execDeltaPct, hasExecBaseline: otherExecPcts.length > 0,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Trado AI 2.0 — Today's Plan, Live Cockpit, Advanced Patterns, Coach Rules
// Same philosophy as the rest of this file: everything below is a plain,
// deterministic computation over real trade rows. Gemini is only ever
// handed the result of these functions to narrate — never asked to
// calculate a number itself.
// ═══════════════════════════════════════════════════════════════════════

const DEFAULT_COACH_SETTINGS = {
  dailyLossLimit: 50,
  maxRiskPct: 2,
  lossStreakThreshold: 3,
  enabledRules: { lossStreak: true, dailyLoss: true, positionSize: true, sessionPattern: true, symbolWarning: true },
}

export function withCoachDefaults(settings = {}) {
  return {
    ...DEFAULT_COACH_SETTINGS,
    ...settings,
    enabledRules: { ...DEFAULT_COACH_SETTINGS.enabledRules, ...(settings.enabledRules || {}) },
  }
}

// ── Rolling N-day window stats (distinct from computeWeekStats, which is
// pinned to a Sunday–Saturday calendar week) — used for "last 7 days" facts.
export function computeRecentWindowStats(trades = [], days = 7) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const inWindow = trades.filter(t => t.status === 'closed' && t.closed_at && new Date(t.closed_at) >= cutoff)
  return { ...computeStats(inWindow), days, trades: inWindow }
}

// ── Today's realized P&L against the daily loss limit ──────────────────
export function computeDailyLossStatus(trades = [], dailyLossLimit = 50) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayTrades = trades.filter(t => t.status === 'closed' && t.closed_at?.slice(0, 10) === todayStr)
  const todayPnl = todayTrades.reduce((s, t) => s + (t.pnl || 0), 0)
  const loss = todayPnl < 0 ? Math.abs(todayPnl) : 0
  const isBreached = dailyLossLimit > 0 && loss >= dailyLossLimit
  const multiple = dailyLossLimit > 0 ? loss / dailyLossLimit : 0
  return {
    limit: dailyLossLimit, todayPnl, loss, tradeCount: todayTrades.length,
    overBy: Math.max(0, loss - dailyLossLimit), isBreached, multiple,
    pctOfLimit: dailyLossLimit > 0 ? clamp((loss / dailyLossLimit) * 100, 0, 999) : 0,
  }
}

// ── "Your Edge Today" composite score (0–100) — blends how the last 7
// days' win rate and profit factor compare against lifetime baselines.
export function computeEdgeScore(trades = []) {
  const closed = trades.filter(t => t.status === 'closed')
  const lifetime = computeStats(closed)
  const recent = computeRecentWindowStats(closed, 7)

  if (recent.tradeCount < 3 || lifetime.tradeCount < 5) {
    return { score: 50, band: 'moderate', hasEnoughData: false, recentWinRate: recent.winRate, lifetimeWinRate: lifetime.winRate }
  }

  const wrDelta = recent.winRate - lifetime.winRate
  const pfRatio = lifetime.profitFactor > 0 ? Math.min(3, recent.profitFactor / lifetime.profitFactor) : 1
  let score = 50 + wrDelta * 0.8 + (pfRatio - 1) * 25
  score = Math.round(clamp(score))
  const band = score >= 65 ? 'strong' : score >= 40 ? 'moderate' : 'weak'

  return { score, band, hasEnoughData: true, recentWinRate: recent.winRate, lifetimeWinRate: lifetime.winRate, recentTradeCount: recent.tradeCount }
}

// ── Live Cockpit tiles (Today's Plan tab) ───────────────────────────────
export function computeLiveCockpit(trades = [], coachSettings = {}) {
  const settings = withCoachDefaults(coachSettings)
  const closed = trades.filter(t => t.status === 'closed')
  const edge = computeEdgeScore(closed)
  const dailyLoss = computeDailyLossStatus(closed, settings.dailyLossLimit)
  return { edge, dailyLoss, todayPnl: dailyLoss.todayPnl, todayTradeCount: dailyLoss.tradeCount }
}

// ── The Today's Plan verdict — deterministic. Gemini is only handed this
// object afterwards and asked to write the headline/edge/max-loss/play copy;
// it never gets to decide GO / CAUTION / STAND DOWN itself.
export function computeTodaysPlanFacts(trades = [], coachSettings = {}) {
  const settings = withCoachDefaults(coachSettings)
  const closed = trades.filter(t => t.status === 'closed')
  const lifetime = computeStats(closed)
  const last7 = computeRecentWindowStats(closed, 7)
  const dailyLoss = computeDailyLossStatus(closed, settings.dailyLossLimit)

  const currentStreak = { count: lifetime.streak, type: lifetime.streakType }
  const lossStreakBreached = currentStreak.type === 'loss' && currentStreak.count >= settings.lossStreakThreshold

  let verdict = 'GO', reason = 'no_flags'
  if (dailyLoss.isBreached) { verdict = 'STAND DOWN'; reason = 'daily_loss' }
  else if (lossStreakBreached) { verdict = 'STAND DOWN'; reason = 'loss_streak' }
  else if (last7.tradeCount >= 5 && last7.totalPnl < 0 && last7.winRate < lifetime.winRate - 5) { verdict = 'STAND DOWN'; reason = 'cold_streak' }
  else if (last7.tradeCount >= 3 && (last7.totalPnl < 0 || last7.winRate < lifetime.winRate)) { verdict = 'CAUTION'; reason = 'below_average' }
  else if (lifetime.tradeCount < 5) { verdict = 'GO'; reason = 'insufficient_data' }

  return {
    verdict, reason,
    lifetime: { winRate: lifetime.winRate, pnl: lifetime.totalPnl, tradeCount: lifetime.tradeCount, profitFactor: lifetime.profitFactor },
    last7d: { winRate: last7.winRate, pnl: last7.totalPnl, tradeCount: last7.tradeCount },
    today: { pnl: dailyLoss.todayPnl, tradeCount: dailyLoss.tradeCount },
    dailyLoss,
    streak: { ...currentStreak, threshold: settings.lossStreakThreshold, breached: lossStreakBreached },
  }
}

// ── Combo breakdown: symbol × session × side (min-sample gated by caller) —
// powers the "Your Edge" / "Bleeding Zone" pattern cards.
export function computeComboBreakdown(trades = []) {
  const map = {}
  trades.filter(t => t.status === 'closed' && t.session && t.symbol && t.side).forEach(t => {
    const key = `${t.symbol}|${sessionLabel(t.session)}|${t.side}`
    if (!map[key]) map[key] = { symbol: t.symbol, session: sessionLabel(t.session), side: t.side, pnl: 0, count: 0, wins: 0 }
    map[key].pnl += t.pnl || 0
    map[key].count++
    if (t.pnl > 0) map[key].wins++
  })
  return Object.values(map).map(v => ({ ...v, winRate: v.count ? (v.wins / v.count) * 100 : 0 }))
}

// ── Fatigue curve: win rate by "nth trade of the day" ───────────────────
export function computeFatigueCurve(trades = []) {
  const closed = trades.filter(t => t.status === 'closed' && t.opened_at && t.closed_at)
  const byDay = {}
  closed.forEach(t => {
    const day = t.opened_at.slice(0, 10)
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(t)
  })
  const nthMap = {}
  Object.values(byDay).forEach(dayTrades => {
    dayTrades.sort((a, b) => new Date(a.opened_at) - new Date(b.opened_at))
    dayTrades.forEach((t, idx) => {
      const nth = idx + 1
      if (!nthMap[nth]) nthMap[nth] = { wins: 0, count: 0 }
      nthMap[nth].count++
      if (t.pnl > 0) nthMap[nth].wins++
    })
  })
  return Object.entries(nthMap)
    .map(([nth, v]) => ({ nth: Number(nth), count: v.count, winRate: v.count ? (v.wins / v.count) * 100 : 0 }))
    .sort((a, b) => a.nth - b.nth)
}

// ── Hold-time edge: win rate under vs. over a 30-minute hold ───────────
export function computeHoldTimeEdge(trades = [], thresholdMin = 30) {
  const closed = trades.filter(t => t.status === 'closed')
    .map(t => ({ ...t, durSec: getDurationSeconds(t) }))
    .filter(t => t.durSec != null)
  const thresholdSec = thresholdMin * 60
  const under = closed.filter(t => t.durSec < thresholdSec)
  const over = closed.filter(t => t.durSec >= thresholdSec)
  const wr = arr => arr.length ? (arr.filter(t => t.pnl > 0).length / arr.length) * 100 : null
  return {
    thresholdMin,
    underCount: under.length, underWinRate: wr(under),
    overCount: over.length, overWinRate: wr(over),
  }
}

// ── Weekday × hour-of-day breakdown (UTC hour bucket) ───────────────────
export function computeWeekdayHourBreakdown(trades = []) {
  const map = {}
  trades.filter(t => t.status === 'closed' && t.closed_at).forEach(t => {
    const d = new Date(t.closed_at)
    const day = WEEKDAYS[d.getUTCDay()]
    const hour = d.getUTCHours()
    const key = `${day}|${hour}`
    if (!map[key]) map[key] = { day, hour, pnl: 0, count: 0, wins: 0 }
    map[key].pnl += t.pnl || 0
    map[key].count++
    if (t.pnl > 0) map[key].wins++
  })
  return Object.values(map).map(v => ({ ...v, winRate: v.count ? (v.wins / v.count) * 100 : 0 }))
}

// ── Advanced pattern detection for the Patterns tab. Each entry only
// exists if the underlying sample size clears a minimum bar — Gemini
// narrates a punchy one-liner + action label per pattern afterwards, but
// never invents a pattern that isn't in this list.
export function detectAdvancedPatterns(trades = []) {
  const closed = trades.filter(t => t.status === 'closed')
  const patterns = []
  if (closed.length < 8) return patterns

  const combos = computeComboBreakdown(closed).filter(c => c.count >= 5)
  if (combos.length) {
    const best = combos.slice().sort((a, b) => b.pnl - a.pnl)[0]
    if (best.pnl > 0 && best.winRate >= 55) {
      patterns.push({ id: 'your_edge', category: 'edge', title: 'Your Edge', facts: { ...best } })
    }
    const worst = combos.slice().sort((a, b) => a.pnl - b.pnl)[0]
    const differsFromBest = !best || worst.symbol !== best.symbol || worst.session !== best.session || worst.side !== best.side
    if (worst.pnl < 0 && worst.winRate <= 35 && differsFromBest) {
      patterns.push({ id: 'bleeding_zone', category: 'bleed', title: 'Bleeding Zone', facts: { ...worst } })
    }
  }

  const fatigue = computeFatigueCurve(closed)
  const early = fatigue.filter(f => f.nth <= 2 && f.count >= 5)
  const later = fatigue.filter(f => f.nth >= 3 && f.count >= 5)
  if (early.length && later.length) {
    const earlyWR = early.reduce((s, f) => s + f.winRate * f.count, 0) / early.reduce((s, f) => s + f.count, 0)
    const laterWR = later.reduce((s, f) => s + f.winRate * f.count, 0) / later.reduce((s, f) => s + f.count, 0)
    if (earlyWR - laterWR >= 15) {
      patterns.push({ id: 'fatigue_curve', category: 'fatigue', title: 'Fatigue Curve', facts: { earlyWinRate: earlyWR, laterWinRate: laterWR, afterNth: 2 } })
    }
  }

  const hold = computeHoldTimeEdge(closed)
  if (hold.underCount >= 5 && hold.overCount >= 5 && hold.underWinRate != null && hold.overWinRate != null
      && Math.abs(hold.overWinRate - hold.underWinRate) >= 12) {
    patterns.push({ id: 'hold_time_edge', category: 'holdtime', title: 'Hold-Time Edge', facts: hold })
  }

  const wh = computeWeekdayHourBreakdown(closed).filter(w => w.count >= 5)
  if (wh.length) {
    const worst = wh.slice().sort((a, b) => a.pnl - b.pnl)[0]
    if (worst.pnl < 0 && worst.winRate <= 35) {
      patterns.push({
        id: 'eerie_pattern', category: 'eerie', title: 'Eerie Pattern',
        facts: { day: worst.day, hour: worst.hour, winRate: worst.winRate, redCount: worst.count - worst.wins, count: worst.count, pnl: worst.pnl },
      })
    }
  }

  return patterns
}

// ── Coach rule evaluation — the deterministic engine behind AI Alerts.
// Returns the rules currently in breach; the caller decides whether a new
// alert needs to be written for each (e.g. throttled to once per 15 min).
export function evaluateCoachRules(trades = [], coachSettings = {}, accountBalance = null) {
  const settings = withCoachDefaults(coachSettings)
  const enabled = settings.enabledRules
  const closed = trades.filter(t => t.status === 'closed')
  const breaches = []

  if (enabled.dailyLoss) {
    const dl = computeDailyLossStatus(closed, settings.dailyLossLimit)
    if (dl.isBreached) breaches.push({ ruleType: 'daily_loss', severity: 'critical', facts: dl })
  }

  if (enabled.lossStreak) {
    const stats = computeStats(trades)
    if (stats.streakType === 'loss' && stats.streak >= settings.lossStreakThreshold) {
      breaches.push({ ruleType: 'loss_streak', severity: 'warning', facts: { count: stats.streak, threshold: settings.lossStreakThreshold } })
    }
  }

  if (enabled.positionSize && accountBalance > 0) {
    const todayStr = new Date().toISOString().slice(0, 10)
    const todayLosers = closed.filter(t => t.closed_at?.slice(0, 10) === todayStr && t.pnl < 0)
    const worst = todayLosers.slice().sort((a, b) => a.pnl - b.pnl)[0]
    if (worst) {
      const lossPct = (Math.abs(worst.pnl) / accountBalance) * 100
      if (lossPct > settings.maxRiskPct) {
        breaches.push({ ruleType: 'position_size', severity: 'warning', facts: { symbol: worst.symbol, lossAmount: Math.abs(worst.pnl), lossPct, maxRiskPct: settings.maxRiskPct } })
      }
    }
  }

  if (enabled.sessionPattern) {
    const currentSession = detectSession(new Date().toISOString())
    const sessions = computeSessionBreakdown(closed).filter(s => s.count >= 5)
    const cur = sessions.find(s => s.session === currentSession)
    if (cur && cur.pnl < 0 && cur.winRate < 35) {
      breaches.push({ ruleType: 'session_pattern', severity: 'info', facts: { session: cur.session, winRate: cur.winRate, pnl: cur.pnl, count: cur.count } })
    }
  }

  if (enabled.symbolWarning) {
    const todayStr = new Date().toISOString().slice(0, 10)
    const todaySymbols = [...new Set(closed.filter(t => t.closed_at?.slice(0, 10) === todayStr).map(t => t.symbol))]
    const symbolStats = computeSymbolBreakdown(closed).filter(s => s.count >= 5)
    todaySymbols.forEach(sym => {
      const s = symbolStats.find(x => x.symbol === sym)
      if (s && s.pnl < 0 && s.winRate < 35) {
        breaches.push({ ruleType: 'symbol_warning', severity: 'info', facts: { symbol: s.symbol, winRate: s.winRate, pnl: s.pnl, count: s.count } })
      }
    })
  }

  return breaches
}
// ═══════════════════════════════════════════════════════════════════════
// AI Analysis page (renamed from "Trado AI") — Behavior & Discipline,
// Performance, Risk & Sizing, and Patterns & Timing tabs.
// Same philosophy as the rest of this file: every number below is computed
// deterministically from real trade/journal rows. Gemini (called
// separately, see backend /api/ai/deep-analysis) only narrates on top of
// these exact facts — it never invents or recalculates a number.
// ═══════════════════════════════════════════════════════════════════════

// ── Period filter ────────────────────────────────────────────────────────
export const PERIOD_OPTIONS = ['This Week', 'This Month', 'Last 30 Days', 'Last Month', 'This Quarter', 'This Year', 'All Time', 'Custom Range']

export function computePeriodRange(period, custom = {}) {
  const now = new Date()
  let start, end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  switch (period) {
    case 'This Week': {
      const day = now.getDay()
      const diff = day === 0 ? 6 : day - 1 // Monday-start week
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)
      break
    }
    case 'This Month': start = new Date(now.getFullYear(), now.getMonth(), 1); break
    case 'Last 30 Days': start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30); break
    case 'Last Month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      break
    case 'This Quarter': {
      const q = Math.floor(now.getMonth() / 3)
      start = new Date(now.getFullYear(), q * 3, 1)
      break
    }
    case 'This Year': start = new Date(now.getFullYear(), 0, 1); break
    case 'Custom Range':
      start = custom.start ? new Date(custom.start) : new Date(0)
      end = custom.end ? new Date(`${custom.end}T23:59:59.999`) : end
      break
    case 'All Time':
    default:
      start = new Date(0)
  }
  return { start, end }
}

export function filterTradesByPeriod(trades = [], period, custom = {}) {
  if (period === 'All Time') return trades
  const { start, end } = computePeriodRange(period, custom)
  return trades.filter(t => {
    const d = t.closed_at ? new Date(t.closed_at) : (t.opened_at ? new Date(t.opened_at) : null)
    return d && d >= start && d <= end
  })
}

export function periodLabel(period, custom = {}) {
  if (period !== 'Custom Range') return period
  if (!custom.start || !custom.end) return 'Custom Range'
  return `${custom.start} → ${custom.end}`
}

// ── Scaling verdict banner (top of Behavioral Flags) ───────────────────
export function computeScalingVerdict(overallStats) {
  const { totalPnl, winRate, avgWin, avgLoss, tradeCount } = overallStats
  const rr = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0
  if (tradeCount < 5) {
    return {
      positive: null, title: 'Not Enough Data Yet',
      text: `Log at least 5 closed trades to unlock a scaling verdict — you currently have ${tradeCount}.`,
      cta: null,
    }
  }
  if (totalPnl > 0 && winRate >= 45) {
    return {
      positive: true, title: 'Profitable — Consider Scaling Up',
      text: `Your total PnL is ${formatPnl(totalPnl)} — you are in the green. Your reward ratio is ${rr.toFixed(2)}:1 and your win rate is ${winRate.toFixed(1)}%. Your edge is proven. Now is a great time to consider scaling up to more accounts to multiply your returns systematically.`,
      cta: 'Scaling Guide',
    }
  }
  return {
    positive: false, title: 'Not Yet Profitable — Focus on Process',
    text: `Your total PnL is ${formatPnl(totalPnl)} across ${tradeCount} trades at a ${winRate.toFixed(1)}% win rate. Before scaling, focus on tightening execution and risk management until your edge is proven over a larger sample.`,
    cta: 'Improvement Guide',
  }
}

// ── Behavioral Flags ─────────────────────────────────────────────────────
export function computeBehavioralFlags(trades = []) {
  const closed = trades.filter(t => t.status === 'closed')
  const flags = []
  if (closed.length < 3) return flags

  const dayMap = {}
  closed.forEach(t => {
    const d = t.closed_at?.slice(0, 10); if (!d) return
    if (!dayMap[d]) dayMap[d] = []
    dayMap[d].push(t)
  })
  const dayEntries = Object.entries(dayMap)
  const avgPerDay = dayEntries.length ? closed.length / dayEntries.length : 0
  const overtradingThreshold = Math.max(4, Math.round(avgPerDay * 2))
  const overtradingDays = dayEntries
    .map(([date, dayTrades]) => ({
      date, count: dayTrades.length,
      losers: dayTrades.filter(t => t.pnl < 0).length,
      wins: dayTrades.filter(t => t.pnl > 0).length,
    }))
    .filter(d => d.count >= overtradingThreshold && d.losers >= d.wins)

  if (overtradingDays.length) {
    const worst = overtradingDays.slice().sort((a, b) => b.count - a.count)[0]
    const impact = overtradingDays.reduce((s, d) => s + dayMap[d.date].reduce((s2, t) => s2 + t.pnl, 0), 0)
    flags.push({
      id: 'overtrading', severity: 'high', icon: 'Repeat', title: 'Overtrading Detected',
      description: `On ${overtradingDays.length} day${overtradingDays.length > 1 ? 's' : ''} you took ${overtradingThreshold}+ trades with break-evens or losses making up the majority. This pattern suggests you kept forcing trades after the session had turned against you instead of stepping away. Overtrading bleeds your account through unnecessary commissions and emotional losses.`,
      examples: [`${worst.date} — ${worst.count} trades (${worst.losers}L ${worst.wins}W)`],
      occurredCount: overtradingDays.length, impact, cta: 'Fix Your Overtrading',
    })
  }

  const sorted = closed.filter(t => t.opened_at && t.closed_at).slice().sort((a, b) => new Date(a.opened_at) - new Date(b.opened_at))
  const reentries = []
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i]
    if (prev.pnl < 0) {
      const gapMin = (new Date(cur.opened_at) - new Date(prev.closed_at)) / 60000
      if (gapMin >= 0 && gapMin <= 10) reentries.push({ date: cur.closed_at?.slice(0, 10), gapMin: Math.round(gapMin), prevPnl: prev.pnl, pnl: cur.pnl })
    }
  }
  if (reentries.length) {
    const wins = reentries.filter(r => r.pnl > 0).length
    const losses = reentries.length - wins
    flags.push({
      id: 'impulsive_reentry', severity: 'medium', icon: 'Brain', title: 'Impulsive Re-Entry Detected',
      badge: `(${losses} losses, ${wins} wins)`,
      description: `${reentries.length} time${reentries.length > 1 ? 's' : ''} you entered a new trade within 10 minutes of closing a losing trade. Quick re-entries after losses often signal emotional trading rather than following your setup. Consider implementing a mandatory cooldown period.`,
      examples: reentries.slice(0, 2).map(r => `${r.date} — ${r.gapMin}min after ${formatPnl(r.prevPnl)} → ${formatPnl(r.pnl)}`),
      occurredCount: reentries.length, impact: reentries.reduce((s, r) => s + r.pnl, 0), cta: 'Fix Your Psychology',
    })
  }

  const journaled = closed.filter(t => t.journaled_at && Array.isArray(t.execution_checklist) && t.execution_checklist.length)
    .slice().sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at))
  if (journaled.length >= 6) {
    const half = Math.floor(journaled.length / 2)
    const pct = t => (t.execution_checklist.filter(c => c.checked).length / t.execution_checklist.length) * 100
    const firstAvg = journaled.slice(0, half).reduce((s, t) => s + pct(t), 0) / half
    const secondAvg = journaled.slice(half).reduce((s, t) => s + pct(t), 0) / (journaled.length - half)
    const improvementPct = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : (secondAvg > 0 ? 100 : 0)
    if (improvementPct >= 10) {
      flags.push({
        id: 'discipline_improving', severity: 'positive', icon: 'TrendingUp', title: 'Discipline Improvement',
        description: `Your execution checklist completion has improved from ${firstAvg.toFixed(0)}% to ${secondAvg.toFixed(0)}% across your journaled trades. Keep reinforcing this habit — consistent execution is what turns an edge into repeatable profit.`,
        examples: [], occurredCount: null, impact: null, cta: null,
      })
    }
  } else if (journaled.length === 0 && closed.length >= 5) {
    flags.push({
      id: 'no_journaling', severity: 'medium', icon: 'ClipboardCheck', title: 'Trades Not Being Journaled',
      description: `None of your ${closed.length} closed trades have a completed execution checklist. Journaling is the fastest way to turn raw P&L into a repeatable process — start logging your checklist on every trade.`,
      examples: [], occurredCount: closed.length, impact: null, cta: 'Start Journaling',
    })
  }

  return flags
}

// ── Emotional Patterns (incl. Tilt Risk Score) ──────────────────────────
export function computeEmotionalPatterns(trades = []) {
  const closed = trades.filter(t => t.status === 'closed' && t.opened_at && t.closed_at)
    .slice().sort((a, b) => new Date(a.opened_at) - new Date(b.opened_at))

  const avgSize = closed.length ? closed.reduce((s, t) => s + (t.size || 0), 0) / closed.length : 0

  const postLoss = []
  for (let i = 1; i < closed.length; i++) {
    const prev = closed[i - 1], cur = closed[i]
    if (prev.pnl < 0) {
      const gapMin = (new Date(cur.opened_at) - new Date(prev.closed_at)) / 60000
      postLoss.push({ cur, gapMin: gapMin >= 0 ? gapMin : null })
    }
  }
  const bucketStats = (bucket) => {
    if (!bucket.length) return null
    const sizes = bucket.map(b => b.cur.size).filter(s => s != null && s > 0)
    const avgBucketSize = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : null
    const sizeChangePct = avgBucketSize != null && avgSize ? ((avgBucketSize - avgSize) / avgSize) * 100 : null
    const winRate = (bucket.filter(b => b.cur.pnl > 0).length / bucket.length) * 100
    const gaps = bucket.map(b => b.gapMin).filter(g => g != null)
    const avgGapMin = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null
    return { count: bucket.length, sizeChangePct, winRate, avgGapMin }
  }
  const postLossStats = bucketStats(postLoss)

  let streak = 0
  const duringStreak = []
  closed.forEach(t => {
    if (streak >= 2) duringStreak.push(t)
    streak = t.pnl > 0 ? streak + 1 : 0
  })
  const streakSizes = duringStreak.map(t => t.size).filter(s => s != null && s > 0)
  const avgStreakSize = streakSizes.length ? streakSizes.reduce((a, b) => a + b, 0) / streakSizes.length : null
  const streakSizeChangePct = avgStreakSize != null && avgSize ? ((avgStreakSize - avgSize) / avgSize) * 100 : null
  const streakWinRate = duringStreak.length ? (duringStreak.filter(t => t.pnl > 0).length / duringStreak.length) * 100 : null
  const streaks = computeStreakStats(trades)

  const revenge = detectRevengeTrades(trades)

  const currentStats = computeStats(trades)
  const losingStreakPts = currentStats.streakType === 'loss' ? Math.min(60, currentStats.streak * 20) : 0
  const sizeIncreaseAfterLoss = postLossStats?.sizeChangePct != null && postLossStats.sizeChangePct > 10
  const sizeIncreasePts = sizeIncreaseAfterLoss ? 20 : 0

  const dayMap = {}
  closed.forEach(t => { const d = t.closed_at?.slice(0, 10); if (!d) return; if (!dayMap[d]) dayMap[d] = []; dayMap[d].push(t) })
  const dayEntries = Object.entries(dayMap)
  const avgPerDay = dayEntries.length ? closed.length / dayEntries.length : 0
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayCount = dayMap[todayStr]?.length || 0
  const overtradingToday = avgPerDay > 0 && todayCount >= avgPerDay * 2
  const overtradingPts = overtradingToday ? 20 : 0

  const tiltScore = Math.min(100, losingStreakPts + sizeIncreasePts + overtradingPts)
  const tiltBand = tiltScore >= 60 ? 'Tilt' : tiltScore >= 30 ? 'Warning' : tiltScore >= 1 ? 'Caution' : 'Calm'
  const tiltColor = tiltScore >= 60 ? 'var(--negative-red)' : tiltScore >= 30 ? 'var(--warning-orange)' : 'var(--positive-green)'

  const overtradingThreshold = Math.max(4, Math.round(avgPerDay * 2))
  const overtradingDaysCount = dayEntries.filter(([, dt]) => dt.length >= overtradingThreshold).length

  const wins = closed.filter(t => t.pnl > 0), losses = closed.filter(t => t.pnl < 0)
  const avgWinAmt = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0
  const avgLossAmt = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0
  const avgRecoveryTrades = avgWinAmt > 0 ? avgLossAmt / avgWinAmt : null

  return {
    postLoss: postLossStats,
    winStreak: { sizeChangePct: streakSizeChangePct, winRate: streakWinRate, maxConsecutiveWins: streaks.longestWinStreak, count: duringStreak.length },
    tiltScore, tiltBand, tiltColor, losingStreak: currentStats.streakType === 'loss' ? currentStats.streak : 0,
    sizeIncreaseAfterLoss, overtradingToday,
    revengeTrades: revenge.count, revengeTradePnl: revenge.netPnl,
    overtradingDays: overtradingDaysCount, avgRecoveryTrades, totalTradingDays: dayEntries.length,
    avgTradesPerDay: avgPerDay, overtradingRate: dayEntries.length ? (overtradingDaysCount / dayEntries.length) * 100 : 0,
  }
}

// ── Reality Check ────────────────────────────────────────────────────────
export function computeRealityCheck(trades = [], accountBalance = null) {
  const closed = trades.filter(t => t.status === 'closed')
  const stats = computeStats(trades)
  const revenge = detectRevengeTrades(trades)
  const risk = computeRiskBreakdown(trades, [])
  const journal = computeJournalStats(trades)

  // Tilt Tax — money lost specifically from revenge trades
  const tiltTax = Math.abs(revenge.cost)

  // Hourly Wage — total PnL / total hours spent in trades
  const totalSeconds = closed.reduce((s, t) => s + (getDurationSeconds(t) || 0), 0)
  const totalHours = totalSeconds / 3600
  const hourlyWage = totalHours > 0.1 ? stats.totalPnl / totalHours : null

  // What If — remove revenge-trade P&L from the total, see the delta
  const whatIfPnl = stats.totalPnl - revenge.netPnl
  const noLosingPatterns = revenge.count === 0

  // Luck vs Skill — consistency-driven proxy: high win-rate + low P&L variance = more skill
  const pnls = closed.map(t => t.pnl)
  const meanPnl = pnls.length ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0
  const variance = pnls.length ? pnls.reduce((s, p) => s + (p - meanPnl) ** 2, 0) / pnls.length : 0
  const stdDev = Math.sqrt(variance)
  const cov = meanPnl !== 0 ? Math.abs(stdDev / meanPnl) : 1
  const skillPct = Math.round(clamp(100 - cov * 20))
  const luckPct = 100 - skillPct

  // Recovery Hole — trades needed at avg win to recover avg loss
  const wins = closed.filter(t => t.pnl > 0), losses = closed.filter(t => t.pnl < 0)
  const avgWinAmt = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0
  const avgLossAmt = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0
  const recoveryTrades = avgWinAmt > 0 ? avgLossAmt / avgWinAmt : null

  // Gambling Score — low = systematic, high = gambling-like (revenge rate + sizing variance + low journaling)
  const revengeRate = closed.length ? (revenge.count / closed.length) * 100 : 0
  const sizingVariancePenalty = 100 - (risk.sizing ?? 50)
  const journalingPenalty = 100 - journal.journaledRate
  const gamblingScore = Math.round(clamp(revengeRate * 2 + sizingVariancePenalty * 0.3 + journalingPenalty * 0.3))
  const gamblingLabel = gamblingScore <= 30 ? 'Systematic trader' : gamblingScore <= 60 ? 'Some gambling tendencies' : 'High gambling tendencies'

  // Trading Report Card — letter grades across 5 dimensions
  const disciplinePct = risk.discipline
  const riskPct = Math.round(clamp(100 - revengeRate * 2 - sizingVariancePenalty * 0.3))
  const avgDurationMin = totalHours > 0 && closed.length ? (totalSeconds / closed.length) / 60 : null
  const patiencePct = Math.round(clamp(avgDurationMin != null ? Math.min(100, avgDurationMin / 30 * 100) : 50))
  const sizingPct = risk.sizing
  const executionPct = journal.avgChecklistCompletion != null ? Math.round(journal.avgChecklistCompletion) : Math.round(journal.journaledRate)
  const toGrade = pct => pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : 'F'
  const reportCard = [
    { key: 'discipline', label: 'Discipline', pct: disciplinePct, grade: toGrade(disciplinePct) },
    { key: 'risk', label: 'Risk', pct: riskPct, grade: toGrade(riskPct) },
    { key: 'patience', label: 'Patience', pct: patiencePct, grade: toGrade(patiencePct) },
    { key: 'sizing', label: 'Sizing', pct: sizingPct, grade: toGrade(sizingPct) },
    { key: 'execution', label: 'Execution', pct: executionPct, grade: toGrade(executionPct) },
  ]

  // Blind Spots — dimensions grading D or F
  const blindSpots = reportCard.filter(r => ['D', 'F'].includes(r.grade))
    .map(r => `${r.label} is grading ${r.grade} (${r.pct}%) — your biggest blind spot right now.`)

  // Break-even status
  const breakEven = { profitable: stats.totalPnl >= 0, amount: stats.totalPnl }

  // vs Pros — standard professional benchmarks
  const avgRR = avgLossAmt > 0 ? avgWinAmt / avgLossAmt : 0
  const avgRiskPct = accountBalance > 0 && closed.length
    ? (closed.reduce((s, t) => s + Math.abs(Math.min(0, t.pnl)), 0) / closed.filter(t => t.pnl < 0).length || 0) / accountBalance * 100
    : null
  const vsPros = {
    winRate: { yours: stats.winRate, target: 50, pass: stats.winRate >= 50 },
    profitFactor: { yours: stats.profitFactor, target: 1.5, pass: stats.profitFactor >= 1.5 },
    rr: { yours: avgRR, target: 1.5, pass: avgRR >= 1.5 },
    riskPerTrade: { yours: avgRiskPct, target: 2, pass: avgRiskPct != null ? avgRiskPct <= 2 : null },
  }
  const passCount = Object.values(vsPros).filter(v => v.pass === true).length
  const vsProsScore = Math.round((passCount / 4) * 100)

  const overallScore = Math.round(clamp((disciplinePct + riskPct + patiencePct + sizingPct + executionPct) / 5))

  return {
    totalPnl: stats.totalPnl, overallScore,
    tiltTax, revengeCount: revenge.count,
    hourlyWage, totalHours,
    whatIfPnl, noLosingPatterns, revengeNetPnl: revenge.netPnl,
    skillPct, luckPct,
    recoveryTrades, avgWinAmt, avgLossAmt,
    gamblingScore, gamblingLabel,
    reportCard, blindSpots,
    breakEven, vsPros, vsProsScore,
  }
}

// ── Streak Analysis (Performance tab) ────────────────────────────────────
export function computeStreakAnalysis(trades = []) {
  const closed = trades.filter(t => t.status === 'closed' && t.closed_at)
    .slice().sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at))
  const stats = computeStats(trades)
  const { longestWinStreak, longestLossStreak } = computeStreakStats(trades)

  // Segment into streak runs for avg length
  const runs = []
  closed.forEach(t => {
    const isWin = t.pnl > 0
    const last = runs[runs.length - 1]
    if (last && last.isWin === isWin) last.length++
    else runs.push({ isWin, length: 1 })
  })
  const avgStreakLength = runs.length ? runs.reduce((s, r) => s + r.length, 0) / runs.length : 0

  const sequence = closed.slice(-20).map(t => ({ result: t.pnl > 0 ? 'W' : 'L', pnl: t.pnl, date: t.closed_at, symbol: t.symbol }))

  return {
    current: stats.streak, currentType: stats.streakType,
    best: longestWinStreak, worst: longestLossStreak,
    avgStreakLength, sequence,
  }
}

// ── Performance Benchmarks (Performance tab) — trader's stats vs standard
// professional thresholds, expressed as pass/fail benchmark rows. ────────
export function computePerformanceBenchmarks(trades = []) {
  const stats = computeStats(trades)
  const closed = trades.filter(t => t.status === 'closed')
  const wins = closed.filter(t => t.pnl > 0), losses = closed.filter(t => t.pnl < 0)
  const avgWinAmt = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0
  const avgLossAmt = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0
  const avgRR = avgLossAmt > 0 ? avgWinAmt / avgLossAmt : 0

  const pnls = closed.map(t => t.pnl)
  const meanPnl = pnls.length ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0
  const variance = pnls.length ? pnls.reduce((s, p) => s + (p - meanPnl) ** 2, 0) / pnls.length : 0
  const stdDev = Math.sqrt(variance)
  const cov = meanPnl !== 0 ? Math.abs(stdDev / meanPnl) : 1
  const consistency = Math.round(clamp(100 - cov * 20))

  const benchmarks = [
    { key: 'winRate', label: 'Win Rate', yours: stats.winRate, target: 50, unit: '%', pass: stats.winRate >= 50 },
    { key: 'profitFactor', label: 'Profit Factor', yours: stats.profitFactor >= 999 ? 999 : stats.profitFactor, target: 1.5, unit: 'x', pass: stats.profitFactor >= 1.5 },
    { key: 'rr', label: 'Risk : Reward', yours: avgRR, target: 1.5, unit: ':1', pass: avgRR >= 1.5 },
    { key: 'consistency', label: 'Consistency', yours: consistency, target: 60, unit: '%', pass: consistency >= 60 },
  ]
  const score = benchmarks.length ? Math.round((benchmarks.filter(b => b.pass).length / benchmarks.length) * 100) : 0

  let insight
  if (score >= 75) insight = { severity: 'positive', title: 'Strong Profitability', text: `You're clearing ${benchmarks.filter(b => b.pass).length} of ${benchmarks.length} professional benchmarks — your process is working, not just your luck.` }
  else if (score >= 50) insight = { severity: 'info', title: 'Highly Consistent', text: `You're meeting ${benchmarks.filter(b => b.pass).length} of ${benchmarks.length} benchmarks. Tighten the ones you're missing to compound your edge.` }
  else insight = { severity: 'warning', title: 'Below Benchmark', text: `Only ${benchmarks.filter(b => b.pass).length} of ${benchmarks.length} professional benchmarks are being met — focus here before scaling size.` }

  return { benchmarks, score, consistency, avgRR, insight }
}

// ── Trade Quality aggregate (Performance tab) — reuses the same per-trade
// computeTradeQualityScore() used by Trade DNA, so the numbers stay
// consistent everywhere they appear in the app. ─────────────────────────
export function computeTradeQualityAggregate(trades = []) {
  const closed = trades.filter(t => t.status === 'closed').slice().sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))
  if (!closed.length) return { avgScore: 0, distribution: [], recentScores: [], commonIssues: [], trend: null }

  const scored = closed.map(t => ({ trade: t, score: computeTradeQualityScore(t) }))
  const avgScore = Math.round(scored.reduce((s, x) => s + x.score.total, 0) / scored.length)

  const bands = [{ label: '0-20', min: 0, max: 20 }, { label: '21-40', min: 21, max: 40 }, { label: '41-60', min: 41, max: 60 }, { label: '61-80', min: 61, max: 80 }, { label: '81-100', min: 81, max: 100 }]
  const distribution = bands.map(b => ({ ...b, count: scored.filter(x => x.score.total >= b.min && x.score.total <= b.max).length }))

  const recentScores = scored.slice(0, 8).map(x => ({
    id: x.trade.id, date: x.trade.closed_at?.slice(0, 10), symbol: x.trade.symbol,
    score: x.score.total, band: x.score.grade, color: x.score.gradeColor, pnl: x.trade.pnl,
  }))

  // Common issues — checklist labels most often left unchecked across all journaled trades
  const issueMap = {}
  closed.forEach(t => {
    if (!Array.isArray(t.execution_checklist)) return
    t.execution_checklist.forEach(item => {
      const label = item.label
      if (!label) return
      if (!issueMap[label]) issueMap[label] = { total: 0, missed: 0 }
      issueMap[label].total++
      if (!item.checked) issueMap[label].missed++
    })
  })
  const commonIssues = Object.entries(issueMap)
    .filter(([, v]) => v.total >= 2)
    .map(([label, v]) => ({ label, missRate: Math.round((v.missed / v.total) * 100), missed: v.missed, total: v.total }))
    .sort((a, b) => b.missRate - a.missRate)
    .slice(0, 3)

  // Trend — compare first half vs second half chronologically
  const chrono = scored.slice().reverse()
  let trend = null
  if (chrono.length >= 6) {
    const half = Math.floor(chrono.length / 2)
    const firstAvg = chrono.slice(0, half).reduce((s, x) => s + x.score.total, 0) / half
    const secondAvg = chrono.slice(half).reduce((s, x) => s + x.score.total, 0) / (chrono.length - half)
    trend = { firstAvg: Math.round(firstAvg), secondAvg: Math.round(secondAvg), improving: secondAvg > firstAvg + 3 }
  }

  return { avgScore, distribution, recentScores, commonIssues, trend, scoredCount: scored.length }
}

// ── Risk & Sizing tab ─────────────────────────────────────────────────────
export function computeRiskSizing(trades = [], accountBalance = null) {
  const closed = trades.filter(t => t.status === 'closed')
  const stats = computeStats(trades)
  const curve = buildEquityCurve(trades)

  const losers = closed.filter(t => t.pnl < 0)
  const avgRiskAmount = losers.length ? Math.abs(losers.reduce((s, t) => s + t.pnl, 0) / losers.length) : 0
  const avgRiskPct = accountBalance > 0 ? (avgRiskAmount / accountBalance) * 100 : null

  const currentBalance = accountBalance != null ? accountBalance : 10000 + stats.totalPnl
  const startBalance = currentBalance - stats.totalPnl
  let running = startBalance, peak = startBalance, maxDrawdownPct = 0
  curve.forEach(pt => {
    running = startBalance + pt.pnl
    peak = Math.max(peak, running)
    const dd = peak > 0 ? ((peak - running) / peak) * 100 : 0
    maxDrawdownPct = Math.max(maxDrawdownPct, dd)
  })

  const wins = closed.filter(t => t.pnl > 0)
  const avgWinAmt = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0
  const avgRR = avgRiskAmount > 0 ? avgWinAmt / avgRiskAmount : 0

  const sizes = closed.map(t => t.size).filter(s => s != null && s > 0)
  const meanSize = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0
  const sizeStdDev = sizes.length ? Math.sqrt(sizes.reduce((s, v) => s + (v - meanSize) ** 2, 0) / sizes.length) : 0
  const sizeCov = meanSize ? sizeStdDev / meanSize : 0
  const sizingConsistency = Math.round(clamp(100 - sizeCov * 100))

  // Size by outcome (does the trader size up after wins/losses?)
  const sorted = closed.filter(t => t.opened_at && t.closed_at).slice().sort((a, b) => new Date(a.opened_at) - new Date(b.opened_at))
  let afterWinSizes = [], afterLossSizes = []
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].size == null) continue
    if (sorted[i - 1].pnl > 0) afterWinSizes.push(sorted[i].size)
    else if (sorted[i - 1].pnl < 0) afterLossSizes.push(sorted[i].size)
  }
  const avgAfterWin = afterWinSizes.length ? afterWinSizes.reduce((a, b) => a + b, 0) / afterWinSizes.length : null
  const avgAfterLoss = afterLossSizes.length ? afterLossSizes.reduce((a, b) => a + b, 0) / afterLossSizes.length : null

  let insight
  if (avgRR >= 1.5 && sizingConsistency >= 60) {
    insight = { severity: 'positive', title: 'Strong Risk Reward', text: `You're averaging ${avgRR.toFixed(2)}:1 reward-to-risk with ${sizingConsistency}% sizing consistency — your risk management is doing real work for your edge.` }
  } else if (avgRR < 1) {
    insight = { severity: 'warning', title: 'Risk/Reward Needs Work', text: `Your average reward-to-risk is only ${avgRR.toFixed(2)}:1 — your losers are outsizing your winners. Tighten stops or let winners run further.` }
  } else {
    insight = { severity: 'info', title: 'Sizing Inconsistent', text: `Your position sizing varies ${Math.round(sizeCov * 100)}% from trade to trade. Standardizing to a fixed risk % per trade would steady your equity curve.` }
  }

  return {
    avgRiskAmount, avgRiskPct, currentBalance, peakBalance: peak, maxDrawdownPct,
    avgRR, sizingConsistency, avgAfterWin, avgAfterLoss, meanSize,
    insight,
  }
}

// ── Patterns & Timing: Time Insights (sessions + heatmap) ────────────────
export function computeTimeInsights(trades = []) {
  const sessions = computeSessionBreakdown(trades)
  const heatmap = computeWeekdayHourBreakdown(trades)
  const closed = trades.filter(t => t.status === 'closed')

  let trueEdge = null
  const validHeat = heatmap.filter(h => h.count >= 3)
  if (validHeat.length) {
    const best = validHeat.slice().sort((a, b) => b.pnl - a.pnl)[0]
    if (best.pnl > 0) {
      trueEdge = {
        day: best.day, hour: best.hour, winRate: best.winRate, count: best.count, pnl: best.pnl,
        text: `Your best window is ${best.day} around ${String(best.hour).padStart(2, '0')}:00 UTC — ${best.winRate.toFixed(0)}% win rate across ${best.count} trades, netting ${formatPnl(best.pnl)}.`,
      }
    }
  }

  return { sessions, heatmap, tradeCount: closed.length, trueEdge }
}

// ── Patterns & Timing: Correlations (symbol performance) ─────────────────
export function computeCorrelations(trades = []) {
  const symbols = computeSymbolBreakdown(trades).filter(s => s.count >= 1)
  let insight = null
  if (symbols.length) {
    const best = symbols[0]
    insight = { symbol: best.symbol, winRate: best.winRate, pnl: best.pnl, count: best.count, text: `${best.symbol} is your best-performing symbol — ${best.winRate.toFixed(0)}% win rate across ${best.count} trades, netting ${formatPnl(best.pnl)}.` }
  }
  return { symbols, insight }
}

// ── Patterns & Timing: Smart Insights (needs a larger sample) ────────────
export function computeSmartInsights(trades = []) {
  const closed = trades.filter(t => t.status === 'closed')
  const MIN_SAMPLE = 15
  if (closed.length < MIN_SAMPLE) {
    return { ready: false, needed: MIN_SAMPLE - closed.length, insights: [] }
  }
  const advanced = detectAdvancedPatterns(trades)
  const insights = advanced.map(p => ({ id: p.id, category: p.category, title: p.title, facts: p.facts }))
  return { ready: true, needed: 0, insights }
}

// ═══════════════════════════════════════════════════════════════════════
// Smart Insights — full AI report. Every number below (P&L, win rate,
// pair/session breakdowns, sizing, journal compliance, trend points) is
// computed here, deterministically, from real trade rows. The candidate
// arrays (`blindspotCandidates` / `patternCandidates`) are the ONLY things
// Gemini is allowed to pick from and narrate — it never invents an id, a
// number, or a pair/session that isn't already in these lists. The `evidence`
// string on each candidate is what actually gets displayed in the UI; the
// backend only ever supplies the surrounding narrative copy.
// ═══════════════════════════════════════════════════════════════════════
const MIN_REPORT_SAMPLE = 3

export function computeSmartReportFacts(trades = [], accountBalance = null) {
  const closed = trades.filter(t => t.status === 'closed')
  if (closed.length < MIN_REPORT_SAMPLE) {
    return { ready: false, needed: MIN_REPORT_SAMPLE - closed.length }
  }

  const stats = computeStats(trades)
  const symbols = computeSymbolBreakdown(trades)
  const sessions = computeSessionBreakdown(trades)
  const journal = computeJournalStats(trades)
  const riskSizing = computeRiskSizing(trades, accountBalance)
  const verdict = computeScalingVerdict(stats)

  const withDuration = closed.filter(t => t.opened_at && t.closed_at)
  const avgHoldSec = withDuration.length
    ? withDuration.reduce((s, t) => s + (getDurationSeconds(t) || 0), 0) / withDuration.length
    : null

  const sizes = closed.map(t => t.size).filter(s => s != null && s > 0)
  const minSize = sizes.length ? Math.min(...sizes) : 0
  const maxSize = sizes.length ? Math.max(...sizes) : 0
  const sizeVariance = minSize > 0 ? maxSize / minSize : (maxSize > 0 ? maxSize : 0)

  const bestPair = symbols[0] || null
  const losingPairs = symbols.filter(s => s.pnl < 0).sort((a, b) => a.pnl - b.pnl)
  const worstPair = losingPairs[0] || null

  const topSession = sessions[0] || null
  const sessionDominancePct = topSession && closed.length ? (topSession.count / closed.length) * 100 : 0

  // Performance trend — cumulative win rate / profit factor / avg R:R, sampled
  // once per calendar day that had a closed trade, in chronological order.
  const byDay = {}
  closed.filter(t => t.closed_at).forEach(t => {
    const d = t.closed_at.slice(0, 10)
    if (!byDay[d]) byDay[d] = []
    byDay[d].push(t)
  })
  const days = Object.keys(byDay).sort()
  let running = []
  const trend = days.map(d => {
    running = running.concat(byDay[d])
    const wins = running.filter(t => t.pnl > 0)
    const losses = running.filter(t => t.pnl < 0)
    const winRate = (wins.length / running.length) * 100
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0)
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
    const profitFactor = grossLoss > 0 ? Math.min(grossProfit / grossLoss, 10) : (grossProfit > 0 ? 10 : 0)
    const avgWin = wins.length ? grossProfit / wins.length : 0
    const avgLoss = losses.length ? grossLoss / losses.length : 0
    const rr = avgLoss > 0 ? Math.min(avgWin / avgLoss, 10) : (avgWin > 0 ? 10 : 0)
    return { date: d, winRate, profitFactor, rr }
  })

  // ── Blindspot candidates (deterministic thresholds decide WHICH issues
  // are even eligible — Gemini only ever narrates ones on this list) ──────
  const blindspotCandidates = []
  if (journal.journaledRate < 50 && closed.length >= 3) {
    blindspotCandidates.push({
      id: 'journal_gap',
      severity: journal.journaledRate === 0 ? 'warning' : 'minor',
      title: 'Process Documentation Gap',
      evidence: `Journal compliance is ${journal.journaledCount}/${journal.closedCount} (${journal.journaledRate.toFixed(0)}%) despite a ${stats.winRate.toFixed(0)}% win rate.`,
    })
  }
  if (sizes.length >= 3 && sizeVariance >= 2) {
    blindspotCandidates.push({
      id: 'erratic_sizing',
      severity: sizeVariance >= 4 ? 'warning' : 'minor',
      title: 'Erratic Position Sizing',
      evidence: `Position size variation is ${sizeVariance.toFixed(1)}x, ranging from ${minSize.toFixed(2)} to ${maxSize.toFixed(2)} lots.`,
    })
  }
  if (closed.length >= 5 && riskSizing.avgRR > 0 && riskSizing.avgRR < 1.2) {
    blindspotCandidates.push({
      id: 'weak_rr',
      severity: 'warning',
      title: 'Thin Reward-to-Risk',
      evidence: `Average reward-to-risk is ${riskSizing.avgRR.toFixed(2)}:1 across ${closed.length} trades.`,
    })
  }
  if (bestPair && symbols.length === 1 && bestPair.count >= 3) {
    blindspotCandidates.push({
      id: 'single_symbol_dependency',
      severity: 'minor',
      title: 'Single-Symbol Dependency',
      evidence: `100% of your trades (${bestPair.count}/${closed.length}) were on ${bestPair.symbol} alone — no other symbol has been tested yet.`,
    })
  }
  if (stats.streak >= 5 && stats.streakType === 'win') {
    blindspotCandidates.push({
      id: 'hot_streak_risk',
      severity: 'minor',
      title: 'Unbroken Win Streak',
      evidence: `Current streak is ${stats.streak} consecutive winners with no losing trade to pressure-test risk controls yet.`,
    })
  }

  // ── Recurring pattern candidates ────────────────────────────────────────
  const patternCandidates = []
  if (bestPair) {
    patternCandidates.push({
      id: 'top_symbol',
      title: `${bestPair.symbol} Specialist`,
      pnl: bestPair.pnl,
      evidence: `${bestPair.count} out of ${closed.length} trades, ${bestPair.winRate.toFixed(0)}% win rate.`,
    })
  }
  if (topSession && sessionDominancePct >= 50) {
    patternCandidates.push({
      id: 'top_session',
      title: `${topSession.session} Overlap Dominance`,
      pnl: topSession.pnl,
      evidence: `${sessionDominancePct.toFixed(0)}% of trade volume, ${topSession.winRate.toFixed(0)}% win rate.`,
    })
  }

  return {
    ready: true,
    stats, symbols, sessions, journal, riskSizing, verdict,
    avgHoldSec, minSize, maxSize, sizeVariance,
    bestPair, worstPair, topSession, sessionDominancePct,
    trend, blindspotCandidates, patternCandidates,
  }
}


// ═══════════════════════════════════════════════════════════════════════
// Growth Roadmap (renamed from "Progress Tracker"). Same philosophy as the
// rest of this file: every number is computed deterministically from real
// trade/journal rows. The one Gemini call (backend /api/ai/growth-roadmap)
// only ever narrates a short coaching tip on top of these exact facts.
// ═══════════════════════════════════════════════════════════════════════

// ── Overview: trader status, Health Score, and headline metrics ─────────
export function computeGrowthOverview(trades = []) {
  const closed = trades.filter(t => t.status === 'closed')
  const stats = computeStats(trades)
  const avgRR = stats.avgLoss !== 0 ? Math.abs(stats.avgWin / stats.avgLoss) : 0

  const tradingDays = new Set(closed.map(t => t.closed_at?.slice(0, 10)).filter(Boolean)).size
  const avgTradesPerDay = tradingDays ? closed.length / tradingDays : 0
  const avgProfitPerTrade = closed.length ? stats.totalPnl / closed.length : 0

  const curve = buildEquityCurve(trades)
  let peak = 0, maxDrawdownPct = 0
  curve.forEach(pt => {
    peak = Math.max(peak, pt.pnl)
    if (peak > 0) maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - pt.pnl) / peak) * 100)
  })

  const checks = [
    { label: 'Win Rate ≥ 50%', pass: stats.winRate >= 50 },
    { label: 'Profit Factor ≥ 1.5', pass: stats.profitFactor >= 1.5 },
    { label: 'Risk:Reward ≥ 1.2', pass: avgRR >= 1.2 },
    { label: 'Drawdown ≤ 20%', pass: maxDrawdownPct <= 20 },
  ]
  const healthScore = closed.length ? Math.round((checks.filter(c => c.pass).length / checks.length) * 100) : 0

  let status, focusMessage, tone
  if (closed.length < 5) {
    status = 'Getting Started'; tone = 'info'
    const remaining = 5 - closed.length
    focusMessage = `Log ${remaining} more trade${remaining === 1 ? '' : 's'} to unlock your full growth roadmap.`
  } else if (stats.totalPnl > 0 && healthScore >= 75) {
    status = 'Profitable Trader'; tone = 'positive'
    focusMessage = 'Focus on scaling up and protecting your edge'
  } else if (stats.totalPnl > 0) {
    status = 'Inconsistent Trader'; tone = 'warning'
    focusMessage = 'Your edge is unproven — tighten execution before scaling'
  } else if (stats.winRate >= 45) {
    status = 'Building Consistency'; tone = 'warning'
    focusMessage = 'Your win rate is solid — focus on cutting losers faster'
  } else {
    status = 'Needs Improvement'; tone = 'negative'
    focusMessage = 'Focus on capital preservation and process over profit right now'
  }

  return {
    stats, avgRR, avgTradesPerDay, avgProfitPerTrade, tradingDays,
    maxDrawdownPct, healthScore, checks, status, focusMessage, tone,
  }
}

// ── Growth Path: real, data-grounded scale-up opportunities ─────────────
export function computeScaleUpOpportunities(trades = [], overview) {
  const closed = trades.filter(t => t.status === 'closed')
  const opportunities = []
  if (closed.length < 10 || !overview) return opportunities

  const { stats, avgTradesPerDay, avgProfitPerTrade } = overview

  if (stats.winRate >= 55 && stats.profitFactor >= 1.8) {
    const potential = Math.max(10, Math.round(avgProfitPerTrade * 0.15 * avgTradesPerDay))
    opportunities.push({
      id: 'increase_size', icon: 'TrendingUp', risk: 'medium', title: 'Increase Position Size',
      description: `Your ${stats.winRate.toFixed(1)}% win rate and ${stats.profitFactor.toFixed(2)} profit factor suggest you can safely increase position size by 10-25%.`,
      potentialPerDay: potential,
    })
  }

  const sessions = computeSessionBreakdown(trades).filter(s => s.count >= 3)
  if (sessions.length >= 2) {
    const best = sessions.slice().sort((a, b) => (b.pnl / b.count) - (a.pnl / a.count))[0]
    const bestAvg = best.pnl / best.count
    const potential = Math.max(10, Math.round((bestAvg - avgProfitPerTrade) * avgTradesPerDay))
    if (potential > 0) {
      opportunities.push({
        id: 'best_session', icon: 'Compass', risk: 'low', title: 'Double Down on Best Session',
        description: `Focus more on the ${best.session} session (${best.winRate.toFixed(1)}% WR) and reduce trading during your lower-performing sessions.`,
        potentialPerDay: potential,
      })
    }
  }

  const symbols = computeSymbolBreakdown(trades).filter(s => s.count >= 2)
  if (symbols.length >= 1) {
    const best = symbols[0]
    const bestAvg = best.pnl / best.count
    const potential = Math.max(10, Math.round((bestAvg - avgProfitPerTrade) * avgTradesPerDay))
    opportunities.push({
      id: 'top_symbol', icon: 'Star', risk: 'low', title: 'Specialize in Top Symbols',
      description: `Your top symbol is ${best.symbol} (${best.winRate.toFixed(1)}% WR). Consider specializing to increase your edge.`,
      potentialPerDay: Math.max(10, potential),
    })
  }

  const heatmap = computeWeekdayHourBreakdown(trades).filter(h => h.count >= 2)
  if (heatmap.length >= 1) {
    const best = heatmap.slice().sort((a, b) => (b.pnl / b.count) - (a.pnl / a.count))[0]
    const bestAvg = best.pnl / best.count
    const potential = Math.max(10, Math.round((bestAvg - avgProfitPerTrade) * avgTradesPerDay))
    opportunities.push({
      id: 'best_hours', icon: 'Clock', risk: 'low', title: 'Optimize Trading Hours',
      description: `Your best hour is ${String(best.hour).padStart(2, '0')}:00 UTC on ${best.day}s. Focus trading during your peak performance windows.`,
      potentialPerDay: Math.max(10, potential),
    })
  }

  return opportunities
}

// ── Insights: strengths & weaknesses derived from the same Health Score
// checks so the two tabs never contradict each other. ───────────────────
export function computeStrengthsWeaknesses(overview) {
  const { stats, avgRR, maxDrawdownPct } = overview
  const strengths = [], weaknesses = []

  if (stats.winRate >= 55) strengths.push({ title: 'Strong Win Rate', detail: `${stats.winRate.toFixed(1)}% — above average` })
  else if (stats.winRate < 40 && stats.tradeCount >= 5) weaknesses.push({ title: 'Low Win Rate', detail: `${stats.winRate.toFixed(1)}% — review your entry criteria` })

  if (avgRR >= 1.5) strengths.push({ title: 'Good Risk/Reward', detail: `${avgRR.toFixed(2)}R average` })
  else if (avgRR < 1 && stats.tradeCount >= 5) weaknesses.push({ title: 'Poor Risk/Reward', detail: `${avgRR.toFixed(2)}R average — losers outsizing winners` })

  if (stats.profitFactor >= 2) strengths.push({ title: 'Excellent Profit Factor', detail: `${stats.profitFactor.toFixed(2)} — strong edge` })
  else if (stats.profitFactor < 1.2 && stats.tradeCount >= 5) weaknesses.push({ title: 'Weak Profit Factor', detail: `${stats.profitFactor.toFixed(2)} — edge needs work` })

  if (maxDrawdownPct <= 10 && stats.tradeCount >= 5) strengths.push({ title: 'Controlled Drawdowns', detail: `${maxDrawdownPct.toFixed(1)}% max drawdown` })
  else if (maxDrawdownPct > 25) weaknesses.push({ title: 'Deep Drawdowns', detail: `${maxDrawdownPct.toFixed(1)}% max drawdown — tighten risk per trade` })

  return { strengths, weaknesses }
}

// ── Action Items: only the concrete, high-priority fixes ────────────────
export function computeActionItems(trades = [], overview, strengthsWeaknesses) {
  const items = (strengthsWeaknesses?.weaknesses || []).map(w => ({
    title: `Fix: ${w.title}`, detail: w.detail, priority: 'high',
  }))

  const revenge = detectRevengeTrades(trades)
  if (revenge.count > 0) {
    items.push({ title: 'Eliminate Revenge Trading', detail: `${revenge.count} revenge trade${revenge.count === 1 ? '' : 's'} cost you ${formatPnl(revenge.netPnl)} — add a cooldown period after losses.`, priority: 'high' })
  }

  const journal = computeJournalStats(trades)
  if (journal.closedCount >= 10 && journal.journaledRate < 60) {
    items.push({ title: 'Journal More Consistently', detail: `Only ${journal.journaledRate.toFixed(0)}% of your trades are journaled — you're leaving insight on the table.`, priority: 'medium' })
  }

  return items
}

// ── Goal Calculator: pure, live, client-side projection math ────────────
export function computeGoalProjection({ targetProfit, projectedWinRate, projectedRR, avgLossAmount, avgTradesPerDay, currentTotalPnl }) {
  const winP = Math.max(0, Math.min(1, (projectedWinRate || 0) / 100))
  const loss = Math.max(0, avgLossAmount || 0)
  const avgWin = loss * Math.max(0, projectedRR || 0)
  const expectedValue = winP * avgWin - (1 - winP) * loss

  const remaining = Math.max(0, (targetProfit || 0) - (currentTotalPnl || 0))
  const tradesToGoal = expectedValue > 0 && remaining > 0 ? Math.ceil(remaining / expectedValue) : (remaining <= 0 ? 0 : null)
  const estimatedDays = tradesToGoal != null && avgTradesPerDay > 0 ? Math.ceil(tradesToGoal / avgTradesPerDay) : null
  const estimatedWeeks = estimatedDays != null ? Math.max(1, Math.round(estimatedDays / 7)) : null
  const progressToGoalPct = targetProfit > 0 ? Math.min(100, Math.max(0, ((currentTotalPnl || 0) / targetProfit) * 100)) : 0

  return { expectedValue, tradesToGoal, estimatedDays, estimatedWeeks, progressToGoalPct }
}