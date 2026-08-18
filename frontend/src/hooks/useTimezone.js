import { useState, useCallback } from 'react'

// ── Default timezone: IST ─────────────────────────────────────────────────────
const DEFAULT_TZ  = 'Asia/Kolkata'
const STORAGE_KEY = 'trado_timezone'

// ── Financial center timezones (IANA) ─────────────────────────────────────────
// We model two DST-sensitive sessions directly against their real financial
// center's local trading hours (08:00–17:00 local), and let the IANA timezone
// database — which every browser/OS ships and keeps current — handle the
// actual DST math (BST/GMT for London, EDT/EST for New York). This means the
// session boundaries shift automatically the moment a region's DST starts or
// ends, with no hardcoded calendar dates that would need yearly maintenance.
const LONDON_TZ = 'Europe/London'
const NY_TZ     = 'America/New_York'
const SESSION_OPEN_HOUR  = 8   // 8:00 AM local
const SESSION_CLOSE_HOUR = 17  // 5:00 PM local

// ── Visual config per session (consumed by Sessions.jsx / AddTradeModal) ──────
export const SESSION_UTC = {
  Asian:      { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  London:     { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  'New York': { color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
}

// ── Get the local decimal hour (0–23.99) for a Date in a given IANA zone ──────
function getZonedHour(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  let h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)
  if (h === 24) h = 0 // ICU midnight quirk safeguard
  return h + m / 60
}

// ── Is this instant within [openHour, closeHour) local time in this zone? ─────
function isWithinLocalWindow(date, timeZone, openHour, closeHour) {
  const localH = getZonedHour(date, timeZone)
  return localH >= openHour && localH < closeHour
}

// ── Detect session from a trade's open datetime — DST-aware ───────────────────
// Priority during the London/New York overlap: New York (the session that
// opened most recently, and conventionally the dominant label for the
// highest-volume overlap window). Outside both windows → Asian.
export function detectSession(dateStr) {
  if (!dateStr) return 'Asian'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 'Asian'

  const isNY     = isWithinLocalWindow(d, NY_TZ,     SESSION_OPEN_HOUR, SESSION_CLOSE_HOUR)
  const isLondon = isWithinLocalWindow(d, LONDON_TZ, SESSION_OPEN_HOUR, SESSION_CLOSE_HOUR)

  if (isNY)     return 'New York'
  if (isLondon) return 'London'
  return 'Asian'
}

// ── Find the UTC instant matching a given local wall-clock time in a zone ─────
// (Single-pass DST-correct conversion: works because IANA offsets are constant
// across the few hours separating our guess from the corrected result.)
function zonedWallTimeToUtc(year, month, day, hour, minute, timeZone) {
  let guess = new Date(Date.UTC(year, month, day, hour, minute))
  const guessLocalHour = getZonedHour(guess, timeZone)
  const targetHour     = hour + minute / 60
  let diff = targetHour - guessLocalHour
  if (diff > 12)  diff -= 24
  if (diff < -12) diff += 24
  return new Date(guess.getTime() + diff * 3600 * 1000)
}

// ── Format a UTC instant as HH:MM in a given display timezone ─────────────────
function fmtInZone(date, displayTimezone) {
  try {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: displayTimezone,
    })
  } catch (_) {
    return '--:--'
  }
}

// ── Build today's session boundary strings, converted to the display TZ ───────
// Recomputed from "today" so the window automatically reflects whichever side
// of the DST transition the calendar currently sits on.
export function sessionTimesForTZ(displayTimezone) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()

  const londonOpen  = zonedWallTimeToUtc(y, m, d, SESSION_OPEN_HOUR,  0, LONDON_TZ)
  const londonClose = zonedWallTimeToUtc(y, m, d, SESSION_CLOSE_HOUR, 0, LONDON_TZ)
  const nyOpen       = zonedWallTimeToUtc(y, m, d, SESSION_OPEN_HOUR,  0, NY_TZ)
  const nyClose       = zonedWallTimeToUtc(y, m, d, SESSION_CLOSE_HOUR, 0, NY_TZ)

  return {
    London:     `${fmtInZone(londonOpen, displayTimezone)} – ${fmtInZone(londonClose, displayTimezone)}`,
    'New York': `${fmtInZone(nyOpen, displayTimezone)} – ${fmtInZone(nyClose, displayTimezone)}`,
    // Asian = the remaining hours once London and New York close for the day
    Asian:      `${fmtInZone(nyClose, displayTimezone)} – ${fmtInZone(londonOpen, displayTimezone)}`,
  }
}

// ── Available timezones ───────────────────────────────────────────────────────
export const TIMEZONES = [
  { label: 'IST — India Standard Time (UTC+5:30)',      value: 'Asia/Kolkata'   },
  { label: 'UTC — Coordinated Universal Time (UTC+0)',  value: 'UTC'            },
  { label: 'GMT — Greenwich Mean Time (UTC+0)',         value: 'Europe/London'  },
  { label: 'EST — Eastern Standard Time (UTC-5)',       value: 'America/New_York' },
  { label: 'PST — Pacific Standard Time (UTC-8)',       value: 'America/Los_Angeles' },
  { label: 'CST — Central Standard Time (UTC-6)',       value: 'America/Chicago' },
  { label: 'CET — Central European Time (UTC+1)',       value: 'Europe/Paris'   },
  { label: 'MSK — Moscow Time (UTC+3)',                 value: 'Europe/Moscow'  },
  { label: 'GST — Gulf Standard Time (UTC+4)',          value: 'Asia/Dubai'     },
  { label: 'PKT — Pakistan Standard Time (UTC+5)',      value: 'Asia/Karachi'   },
  { label: 'SGT — Singapore Time (UTC+8)',              value: 'Asia/Singapore' },
  { label: 'HKT — Hong Kong Time (UTC+8)',              value: 'Asia/Hong_Kong' },
  { label: 'JST — Japan Standard Time (UTC+9)',         value: 'Asia/Tokyo'     },
  { label: 'AEST — Australian Eastern Time (UTC+10)',   value: 'Australia/Sydney' },
]

// ── Next session-open countdown (used by Trado AI 2.0's Today's Plan tab) ─────
// Finds the soonest upcoming London or New York open, DST-aware, looking at
// today and tomorrow so it always resolves even late in the trading day.
export function getNextSessionOpen() {
  const now = new Date()
  const candidates = []
  for (const dayOffset of [0, 1]) {
    const d = new Date(now)
    d.setDate(d.getDate() + dayOffset)
    const y = d.getFullYear(), m = d.getMonth(), day = d.getDate()
    candidates.push({ session: 'London', opensAt: zonedWallTimeToUtc(y, m, day, SESSION_OPEN_HOUR, 0, LONDON_TZ) })
    candidates.push({ session: 'New York', opensAt: zonedWallTimeToUtc(y, m, day, SESSION_OPEN_HOUR, 0, NY_TZ) })
  }
  const future = candidates.filter(c => c.opensAt > now).sort((a, b) => a.opensAt - b.opensAt)
  return future[0] || null
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useTimezone() {
  const [timezone, setTZState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || DEFAULT_TZ
  )

  const setTimezone = useCallback((tz) => {
    setTZState(tz)
    localStorage.setItem(STORAGE_KEY, tz)
  }, [])

  const sessionTimes = sessionTimesForTZ(timezone)

  return { timezone, setTimezone, sessionTimes }
}