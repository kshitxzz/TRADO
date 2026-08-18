import { useState, useEffect, useMemo } from 'react'
import { useTimezone } from './useTimezone'
import { TRADING_QUOTES } from '../data/tradingQuotes'

const DISMISSED_KEY = 'trado_wisdom_dismissed_date' // last date (in tz) the popup was closed
const STATE_KEY      = 'trado_wisdom_state'           // { date, quoteIndex, queue }
const POLL_MS         = 60 * 1000 // cheap 1-min check in case the app is left open past midnight

// ── "Today" as YYYY-MM-DD in a given IANA timezone ────────────────────────────
// en-CA formats as YYYY-MM-DD natively, which also compares correctly as a
// plain string.
function todayKeyInTZ(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

// ── Fisher–Yates shuffle of quote indices ──────────────────────────────────────
function shuffledIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY)) } catch { return null }
}
function saveState(state) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
}

// ── Pick (or recall) today's quote ─────────────────────────────────────────────
// Quotes are drawn from a shuffled "bag" of every quote in the bank, so none
// repeats until all of them have been shown once — then the bag reshuffles.
// If this is called again the same day (e.g. the popup re-mounts on a page
// navigation before being dismissed), it returns the same quote already
// picked for today rather than drawing a new one.
function quoteIndexForDate(dateKey) {
  const n = TRADING_QUOTES.length
  const state = loadState()
  if (state && state.date === dateKey && Number.isInteger(state.quoteIndex)) {
    return state.quoteIndex
  }
  let queue = Array.isArray(state?.queue) ? [...state.queue] : []
  if (queue.length === 0) queue = shuffledIndices(n)
  const quoteIndex = queue.shift()
  saveState({ date: dateKey, quoteIndex, queue })
  return quoteIndex
}

// ── Hook ────────────────────────────────────────────────────────────────────
// App-wide daily gate: shows the Daily Wisdom popup exactly once per calendar
// day, over whichever screen the user lands on first that day — the post-
// login dashboard, or whatever page a still-open session reloads into. The
// day boundary is midnight in the timezone selected in Settings (defaults to
// IST). Dismissing it (via "Start My Trading Day") hides it until the next
// day's boundary passes; navigating between pages the same day (before
// dismissing) keeps it showing since it re-evaluates on every mount.
export function useDailyWisdom() {
  const { timezone } = useTimezone()
  const [dateKey, setDateKey] = useState(() => todayKeyInTZ(timezone))
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function evaluate() {
      const today = todayKeyInTZ(timezone)
      setDateKey(prev => (prev === today ? prev : today))
      const dismissedDate = localStorage.getItem(DISMISSED_KEY)
      setVisible(dismissedDate !== today)
    }
    evaluate()
    const id = setInterval(evaluate, POLL_MS)
    return () => clearInterval(id)
  }, [timezone])

  const quote = useMemo(() => {
    const idx = quoteIndexForDate(dateKey)
    return TRADING_QUOTES[idx] || TRADING_QUOTES[0]
  }, [dateKey])

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, dateKey)
    setVisible(false)
  }

  return { quote, visible, dismiss }
}