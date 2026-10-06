// ─────────────────────────────────────────────────────────────────────────
// Forex-style market sessions for the News page desk bar (SYD / TOK / LON / NY chips).
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