// ─────────────────────────────────────────────────────────────────────────
// Forex Market Hours — pure time logic (no React).
//
// Everything here is derived from the REAL clock of each financial centre via
// the browser's IANA time-zone database (same primitives as marketSessions.js),
// so Sydney / London / New York daylight-saving changes are applied
// automatically on the exact day each region switches. Nothing is hardcoded
// to a UTC offset or a calendar date.
//
// Session model (identical to the News page desk bar): each session runs in its
// own local business hours, Mon–Fri by that city's own calendar.
// Public holidays and individual broker hours are NOT modelled.
// ─────────────────────────────────────────────────────────────────────────
import { SESSIONS, zonedParts, zonedWallTimeToUtc } from './marketSessions'

export const HOUR_MS = 3600000
export const DAY_MS = 24 * HOUR_MS
const MIN_MS = 60000

// Track origin: the timeline's left edge is 05:30 in the viewer's zone, so the
// first hour label (6am) sits centred in its cell and the track covers 24h.
const ORIGIN_HOUR = 5
const ORIGIN_MIN = 30

// ── Cities (display metadata layered on top of SESSIONS) ──────────────────
const CITY_META = {
  SYD: { flag: 'AU', barColor: '#2FDB5F' },
  TOK: { flag: 'JP', barColor: '#CF3094' },
  LON: { flag: 'GB', barColor: '#4181EF' },
  NY:  { flag: 'US', barColor: '#2FDB5F' },
}
export const CITIES = SESSIONS.map(s => ({ ...s, ...CITY_META[s.id] }))

// ── Zone helpers ──────────────────────────────────────────────────────────
// UTC offset (minutes) of a zone at an instant.
export function offsetMinutes(ts, tz) {
  const p = zonedParts(ts, tz)
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000) / MIN_MS)
}

export function formatOffset(mins) {
  const sign = mins < 0 ? '-' : '+'
  const a = Math.abs(mins)
  const h = Math.floor(a / 60)
  const m = a % 60
  return `UTC ${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`
}

// Real abbreviation for the zone's CURRENT rules (EDT vs EST, BST vs GMT, ...).
const ABBR = {
  'Australia/Sydney': { 660: 'AEDT', 600: 'AEST' },
  'Asia/Tokyo':       { 540: 'JST' },
  'Europe/London':    { 60: 'BST', 0: 'GMT' },
  'America/New_York': { '-240': 'EDT', '-300': 'EST' },
}
export function zoneAbbr(ts, tz) {
  const off = offsetMinutes(ts, tz)
  return ABBR[tz]?.[off] || formatOffset(off).replace(' ', '')
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayIndex = (y, m, d) => Date.UTC(y, m, d) / DAY_MS          // m is 0–11

export function weekdayShort(ts, tz) {
  const p = zonedParts(ts, tz)
  return WD[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()]
}
// "Tue Oct 6"
export function dateLabel(ts, tz) {
  const p = zonedParts(ts, tz)
  return `${weekdayShort(ts, tz)} ${MON[p.month - 1]} ${p.day}`
}

// "6:59 pm" / "19:00" — honours the app-wide 12h/24h preference.
export function clockText(ts, tz, is24h) {
  const p = zonedParts(ts, tz)
  const mm = String(p.minute).padStart(2, '0')
  if (is24h) return `${String(p.hour).padStart(2, '0')}:${mm}`
  return `${p.hour % 12 || 12}:${mm} ${p.hour >= 12 ? 'pm' : 'am'}`
}
// Hour-only axis label parts: 12h → { num: '6', suffix: 'am' }, 24h → { num: '18', suffix: '' }
export function hourLabel(ts, tz, is24h) {
  const p = zonedParts(ts, tz)
  if (is24h) return { num: String(p.hour), suffix: '', noon: p.hour === 12 }
  return { num: String(p.hour % 12 || 12), suffix: p.hour >= 12 ? 'pm' : 'am', noon: p.hour === 12 }
}

// ── Sessions ──────────────────────────────────────────────────────────────
function windowFor(city, y, m, d) {
  const wd = new Date(Date.UTC(y, m, d)).getUTCDay()
  if (wd === 0 || wd === 6) return null
  return {
    open:  zonedWallTimeToUtc(y, m, d, city.open, 0, city.tz).getTime(),
    close: zonedWallTimeToUtc(y, m, d, city.close, 0, city.tz).getTime(),
  }
}

// Every session window (real instants) whose local date lies within ±pad days of ts.
function windowsAround(city, fromTs, toTs) {
  const a = zonedParts(fromTs, city.tz)
  const b = zonedParts(toTs, city.tz)
  const startDay = dayIndex(a.year, a.month - 1, a.day) - 1
  const endDay = dayIndex(b.year, b.month - 1, b.day) + 1
  const out = []
  for (let di = startDay; di <= endDay; di++) {
    const dt = new Date(di * DAY_MS)
    const w = windowFor(city, dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())
    if (w) out.push(w)
  }
  return out
}

export function isSessionOpen(city, ts) {
  return windowsAround(city, ts, ts).some(w => w.open <= ts && ts < w.close)
}

// ── Timeline ──────────────────────────────────────────────────────────────
// Start of the 24h track containing `ts`: the most recent 05:30 in `tz`.
export function trackOrigin(ts, tz) {
  const p = zonedParts(ts, tz)
  let dI = dayIndex(p.year, p.month - 1, p.day)
  if (p.hour < ORIGIN_HOUR || (p.hour === ORIGIN_HOUR && p.minute < ORIGIN_MIN)) dI -= 1
  const dt = new Date(dI * DAY_MS)
  return zonedWallTimeToUtc(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), ORIGIN_HOUR, ORIGIN_MIN, tz).getTime()
}

// Bar segments (0–1 of the track) for a city — clipped, so a session that
// crosses the track edge shows as two bars (e.g. Sydney).
export function barSegments(city, origin) {
  const end = origin + DAY_MS
  const segs = []
  for (const w of windowsAround(city, origin, end)) {
    const s = Math.max(w.open, origin)
    const e = Math.min(w.close, end)
    if (e > s) segs.push({ start: (s - origin) / DAY_MS, end: (e - origin) / DAY_MS })
  }
  return segs
}

// 24 hour labels, each centred on its hour tick (6am … 5am).
export function axisHours(origin, tz, is24h) {
  return Array.from({ length: 24 }, (_, i) => {
    const ts = origin + (i + 0.5) * HOUR_MS
    return { ts, pos: (i + 0.5) / 24, ...hourLabel(ts, tz, is24h) }
  })
}

// Day / night shading: night = 18:00 → 06:00 in the viewer's zone.
export function nightStartPos(origin, tz) {
  for (let i = 0; i < 24; i++) {
    const ts = origin + (i + 0.5) * HOUR_MS
    if (zonedParts(ts, tz).hour === 18) return (i + 0.5) / 24
  }
  return 0.5
}

// ── Volume profile ────────────────────────────────────────────────────────
// Typical intraday FX activity (96 × 15-minute samples, normalised 0–1) taken
// from the reference design, expressed on the northern-winter clock where
// London = 08:00 UTC, New York = 13:00 UTC. It is then time-warped onto the
// REAL session open/close instants of the day being shown, so the London-open
// ramp, the London/New York overlap peak and the New York close all land on
// the true (DST-correct) times.
//
// NOTE: spot FX is OTC — there is no live volume feed. This is a "usually
// busy" profile, which is exactly how the UI words it.
const PROFILE = [0.353,0.374,0.391,0.399,0.399,0.399,0.391,0.374,0.366,0.357,0.332,0.307,0.294,0.273,0.235,0.202,0.181,0.160,0.130,0.105,0.088,0.067,0.046,0.029,0.025,0.059,0.126,0.189,0.231,0.294,0.412,0.529,0.592,0.622,0.647,0.672,0.685,0.664,0.618,0.576,0.550,0.529,0.500,0.475,0.466,0.462,0.450,0.437,0.441,0.492,0.592,0.685,0.735,0.781,0.843,0.898,0.929,0.945,0.971,0.996,1.000,0.979,0.941,0.908,0.882,0.840,0.769,0.697,0.651,0.613,0.563,0.508,0.471,0.445,0.416,0.387,0.366,0.345,0.315,0.286,0.265,0.244,0.210,0.176,0.155,0.130,0.097,0.067,0.046,0.029,0.013,0.000,0.008,0.063,0.172,0.290]

function profileAt(refHour) {
  const x = (((refHour % 24) + 24) % 24) * 4          // 4 samples / hour
  const i = Math.floor(x) % 96
  const f = x - Math.floor(x)
  const a = PROFILE[i]
  const b = PROFILE[(i + 1) % 96]
  return a + (b - a) * f
}

// Anchors: [city id, local hour, reference-clock hour]
const ANCHORS = [
  ['TOK', 9, 0], ['LON', 8, 8], ['NY', 8, 13], ['LON', 17, 17], ['NY', 17, 22],
]
const cityById = Object.fromEntries(CITIES.map(c => [c.id, c]))

function warpedRefHour(ts) {
  const u = new Date(ts)
  const d0 = dayIndex(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate())
  const pts = []
  for (let di = d0 - 2; di <= d0 + 2; di++) {
    const dt = new Date(di * DAY_MS)
    for (const [id, hour, ref] of ANCHORS) {
      const real = zonedWallTimeToUtc(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), hour, 0, cityById[id].tz).getTime()
      pts.push([real, di * 24 + ref])
    }
  }
  pts.sort((p, q) => p[0] - q[0])
  for (let i = 0; i < pts.length - 1; i++) {
    const [r0, h0] = pts[i]
    const [r1, h1] = pts[i + 1]
    if (ts >= r0 && ts < r1) return h0 + ((ts - r0) / (r1 - r0)) * (h1 - h0)
  }
  return (ts / HOUR_MS) % 24
}

// 0–1 activity at an instant; 0 while every session is closed (weekend).
export function volumeAt(ts) {
  if (!CITIES.some(c => isSessionOpen(c, ts))) return 0
  return profileAt(warpedRefHour(ts))
}

export function volumeCurve(origin, steps = 96) {
  return Array.from({ length: steps + 1 }, (_, i) => volumeAt(origin + (i / steps) * DAY_MS - (i === steps ? 1 : 0)))
}

// Levels calibrated against the reference recording.
export function volumeLevel(v, anyOpen) {
  if (!anyOpen) return 'closed'
  if (v >= 0.58) return 'high'
  if (v >= 0.2) return 'medium'
  return 'low'
}

// ── Snapshot of everything shown at one instant ───────────────────────────
export function snapshotAt(ts, userTz, is24h) {
  const cities = CITIES.map(c => {
    const open = isSessionOpen(c, ts)
    return {
      ...c,
      open,
      time: clockText(ts, c.tz, is24h),
      sub: `${dateLabel(ts, c.tz)} ${zoneAbbr(ts, c.tz)} (${formatOffset(offsetMinutes(ts, c.tz))})`,
    }
  })
  const openCities = cities.filter(c => c.open)
  const v = volumeAt(ts)
  return {
    cities,
    openCount: openCities.length,
    onlyOpen: openCities.length === 1 ? openCities[0].name : null,
    volume: v,
    level: volumeLevel(v, openCities.length > 0),
    clock: clockText(ts, userTz, is24h),
    day: weekdayShort(ts, userTz),
  }
}

// ── Best times to trade (in the viewer's zone, for the track's day) ───────
function firstWindow(city, fromTs) {
  return windowsAround(city, fromTs, fromTs + 8 * DAY_MS)
    .filter(w => w.open >= fromTs)
    .sort((a, b) => a.open - b.open)[0] || null
}

export function bestTimes(origin) {
  const lon = cityById.LON
  const ny = cityById.NY
  const tok = cityById.TOK

  // London/New York overlap: New York open → London close, same real day.
  const lonWins = windowsAround(lon, origin, origin + 8 * DAY_MS)
  const nyWins = windowsAround(ny, origin, origin + 8 * DAY_MS)
  let overlap = null
  for (const lw of lonWins.sort((a, b) => a.open - b.open)) {
    const nw = nyWins.find(n => n.open < lw.close && n.close > lw.open)
    if (!nw) continue
    const start = Math.max(lw.open, nw.open)
    const end = Math.min(lw.close, nw.close)
    if (start >= origin && end > start) { overlap = { start, end }; break }
  }

  const lonNext = firstWindow(lon, origin)
  const tokNext = firstWindow(tok, origin)
  return {
    overlap,
    londonOpen: lonNext ? { start: lonNext.open, end: lonNext.open + 2 * HOUR_MS } : null,
    tokyoOpen: tokNext ? { start: tokNext.open, end: tokNext.open + 3 * HOUR_MS } : null,
  }
}