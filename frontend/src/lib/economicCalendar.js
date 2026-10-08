// ─────────────────────────────────────────────────────────────────────────
// Economic Calendar — pure helpers (no React, no network).
// All day boundaries are computed in the viewer's own time zone with the IANA
// database, so "Today" / "Tomorrow" / "This Week" are correct around midnight
// and across daylight-saving changes.
// ─────────────────────────────────────────────────────────────────────────
import { zonedParts } from './marketSessions'

export const CURRENCIES = [
  { code: 'USD', flag: 'US', name: 'US Dollar' },
  { code: 'EUR', flag: 'EU', name: 'Euro' },
  { code: 'GBP', flag: 'GB', name: 'British Pound' },
  { code: 'JPY', flag: 'JP', name: 'Japanese Yen' },
  { code: 'AUD', flag: 'AU', name: 'Australian Dollar' },
  { code: 'CAD', flag: 'CA', name: 'Canadian Dollar' },
  { code: 'CHF', flag: 'CH', name: 'Swiss Franc' },
  { code: 'NZD', flag: 'NZ', name: 'New Zealand Dollar' },
  { code: 'CNY', flag: 'CN', name: 'Chinese Yuan' },
]
export const CCY = Object.fromEntries(CURRENCIES.map(c => [c.code, c]))

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY = 86400000

// ── Day keys ──────────────────────────────────────────────────────────────
// A day key is the calendar date in the viewer's zone, as a day number.
export function dayNumber(ts, tz) {
  const p = zonedParts(ts, tz)
  return Date.UTC(p.year, p.month - 1, p.day) / DAY
}
export const weekdayOf = (dayNum) => new Date(dayNum * DAY).getUTCDay()           // 0 = Sun
export function dayLabel(dayNum, todayNum) {
  if (dayNum === todayNum) return 'Today'
  if (dayNum === todayNum + 1) return 'Tomorrow'
  if (dayNum === todayNum - 1) return 'Yesterday'
  const d = new Date(dayNum * DAY)
  return `${WD[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`
}

// ── Tabs ──────────────────────────────────────────────────────────────────
export const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'today',    label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'week',     label: 'This Week' },
  { id: 'all',      label: 'All' },
]

export function tabPredicate(tab, now, tz) {
  const today = dayNumber(now, tz)
  const wd = weekdayOf(today)
  const monday = today - ((wd + 6) % 7)                 // calendar week, Monday → Sunday
  switch (tab) {
    case 'upcoming': return (e) => e.time >= now
    case 'today':    return (e) => dayNumber(e.time, tz) === today
    case 'tomorrow': return (e) => dayNumber(e.time, tz) === today + 1
    case 'week':     return (e) => { const d = dayNumber(e.time, tz); return d >= monday && d <= monday + 6 }
    default:         return () => true
  }
}

// ── Filters ───────────────────────────────────────────────────────────────
// Bank holidays travel with "Low" so they are never silently hidden.
const impactBucket = (e) => (e.impact === 'holiday' ? 'low' : e.impact)

export function filterEvents(events, { tab, impacts, currency, query }, now, tz) {
  const inTab = tabPredicate(tab, now, tz)
  const q = (query || '').trim().toLowerCase()
  return events.filter(e => {
    if (!inTab(e)) return false
    if (!impacts.has(impactBucket(e))) return false
    if (currency !== 'ALL' && e.currency !== currency) return false
    if (q) {
      const hay = `${e.title} ${e.currency} ${CCY[e.currency]?.name || ''} ${e.category}`.toLowerCase()
      if (!q.split(/\s+/).every(w => hay.includes(w))) return false
    }
    return true
  })
}

export function groupByDay(events, now, tz) {
  const today = dayNumber(now, tz)
  const groups = []
  for (const e of events) {
    const d = dayNumber(e.time, tz)
    const last = groups[groups.length - 1]
    if (last && last.day === d) last.events.push(e)
    else groups.push({ day: d, label: dayLabel(d, today), events: [e] })
  }
  return groups
}

// ── Countdown ─────────────────────────────────────────────────────────────
export function countdownText(time, now) {
  const ms = time - now
  if (ms <= 0) return null
  if (ms < 60000) return `${Math.max(1, Math.ceil(ms / 1000))}s left`
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m left`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ${mins % 60}m left`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h left`
}

// ── Labels ────────────────────────────────────────────────────────────────
export function zoneLabel(tz, now) {
  const p = zonedParts(now, tz)
  const mins = Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(now / 1000) * 1000) / 60000)
  const sign = mins < 0 ? '-' : '+'
  const a = Math.abs(mins)
  const h = Math.floor(a / 60), m = a % 60
  const name = tz === 'UTC' ? 'UTC' : tz.split('/').pop().replace(/_/g, ' ')
  return { name, offset: `GMT${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}` }
}

// Forex Factory's day page for an event, e.g. …/calendar?day=oct7.2026 (US Eastern date).
export function sourceUrl(time) {
  const p = zonedParts(time, 'America/New_York')
  return `https://www.forexfactory.com/calendar?day=${MON[p.month - 1].toLowerCase()}${p.day}.${p.year}`
}

export const IMPACT_LABEL = { high: 'HIGH', medium: 'MED', low: 'LOW', holiday: 'HOLIDAY' }