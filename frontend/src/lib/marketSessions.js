// ─────────────────────────────────────────────────────────────────────────
// Forex-style market sessions for the News page (Desk bar + Market Hours tab).
//
// Each session is modelled in its own financial centre's local time and the
// browser's IANA time-zone database handles DST, so boundaries shift on their
// own when a region changes its clocks — no hardcoded dates to maintain.
// Standard local business hours, Mon–Fri. Public holidays and individual
// broker hours are NOT modelled.
// ─────────────────────────────────────────────────────────────────────────

export const SESSIONS = [
  { id: 'SYD', name: 'Sydney',   tz: 'Australia/Sydney', open: 7, close: 16, color: '#F59E0B' },
  { id: 'TOK', name: 'Tokyo',    tz: 'Asia/Tokyo',       open: 9, close: 18, color: '#A78BFA' },
  { id: 'LON', name: 'London',   tz: 'Europe/London',    open: 8, close: 17, color: '#3B82F6' },
  { id: 'NY',  name: 'New York', tz: 'America/New_York', open: 8, close: 17, color: '#10B981' },
]

const OVERLAP_NOTES = {
  'SYD+TOK': 'Sydney / Tokyo overlap — the Asia-Pacific session is in full swing.',
  'TOK+LON': 'Tokyo / London overlap — Asian and European flows meet.',
  'LON+NY':  'London / New York overlap — commonly the most active window for EUR, GBP and USD pairs.',
}

// ── Time-zone arithmetic ─────────────────────────────────────────────────
const dtfCache = new Map()
function dtf(tz) {
  if (!dtfCache.has(tz)) {
    dtfCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    }))
  }
  return dtfCache.get(tz)
}

// Wall-clock parts of an instant in a zone: { year, month (1–12), day, hour, minute, second }
export function zonedParts(ts, tz) {
  const o = {}
  for (const p of dtf(tz).formatToParts(new Date(ts))) {
    if (p.type !== 'literal') o[p.type] = parseInt(p.value, 10)
  }
  if (o.hour === 24) o.hour = 0 // ICU midnight quirk
  return o
}

function tzOffsetMs(ts, tz) {
  const p = zonedParts(ts, tz)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000
}

// The instant at which a zone's wall clock reads y-m-d h:min (month is 0–11;
// day/hour overflow is normalised by Date.UTC, so day 0 = last day of prior month).
export function zonedWallTimeToUtc(y, m, d, h, min, tz) {
  const guess = Date.UTC(y, m, d, h, min)
  const ts = guess - tzOffsetMs(guess, tz)
  return new Date(guess - tzOffsetMs(ts, tz)) // second pass settles DST edges
}

// ── Sessions ─────────────────────────────────────────────────────────────
// Window for the session-local calendar date y-m-d, or null on a weekend.
function sessionWindow(session, y, m, d) {
  const weekday = new Date(Date.UTC(y, m, d)).getUTCDay()
  if (weekday === 0 || weekday === 6) return null
  return {
    open:  zonedWallTimeToUtc(y, m, d, session.open, 0, session.tz),
    close: zonedWallTimeToUtc(y, m, d, session.close, 0, session.tz),
  }
}

// { open, opensAt, closesAt, win } — `win` is the current window if open, else the next one.
export function sessionStatus(session, now = Date.now()) {
  const p = zonedParts(now, session.tz)
  let current = null
  let next = null
  for (let off = -1; off <= 8; off++) {
    const w = sessionWindow(session, p.year, p.month - 1, p.day + off)
    if (!w) continue
    if (w.open.getTime() <= now && now < w.close.getTime()) current = w
    else if (w.open.getTime() > now && !next) next = w
  }
  return {
    open: !!current,
    closesAt: current ? current.close : null,
    opensAt: next ? next.open : null,
    win: current || next,
  }
}

export function activeSessionIds(now = Date.now()) {
  return SESSIONS.filter(s => sessionStatus(s, now).open).map(s => s.id)
}

export function overlapNote(activeIds) {
  return OVERLAP_NOTES[activeIds.join('+')] || null
}

// "2h 15m" / "45m" / "3d 4h"
export function formatCountdown(ms) {
  const mins = Math.max(0, Math.round(ms / 60000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ${mins % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

// Today (in the user's zone) as 0–100% bars, one row per session.
export function dayTimeline(userTz, now = Date.now()) {
  const u = zonedParts(now, userTz)
  const dayStart = zonedWallTimeToUtc(u.year, u.month - 1, u.day, 0, 0, userTz).getTime()
  const dayEnd   = zonedWallTimeToUtc(u.year, u.month - 1, u.day + 1, 0, 0, userTz).getTime()
  const span = dayEnd - dayStart

  const rows = SESSIONS.map(session => {
    const p = zonedParts(now, session.tz)
    const segs = []
    for (let off = -2; off <= 2; off++) {
      const w = sessionWindow(session, p.year, p.month - 1, p.day + off)
      if (!w) continue
      const a = Math.max(w.open.getTime(), dayStart)
      const b = Math.min(w.close.getTime(), dayEnd)
      if (b > a) segs.push({ left: ((a - dayStart) / span) * 100, width: ((b - a) / span) * 100 })
    }
    return { session, segs }
  })

  return { rows, nowPct: ((now - dayStart) / span) * 100, dayStart, span }
}