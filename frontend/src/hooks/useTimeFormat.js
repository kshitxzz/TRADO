import { useSyncExternalStore, useCallback } from 'react'

// ── 12-hour / 24-hour clock preference ────────────────────────────────────────
// Unlike useTimezone (per-component state), this is a tiny shared store: the
// Settings toggle and every page that renders times subscribe to the same
// value, so flipping the switch re-renders the Journal instantly — no reload,
// no prop drilling, and it also syncs across open browser tabs.
const STORAGE_KEY = 'trado_time_format'
const DEFAULT_FORMAT = '12h' // matches how the app displayed times before this setting existed

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '24h' ? '24h' : DEFAULT_FORMAT
  } catch (_) {
    return DEFAULT_FORMAT
  }
}

let current = readStored()
const listeners = new Set()
const notify = () => listeners.forEach(fn => fn())

// Another tab changed the preference → pick it up here too.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    const next = readStored()
    if (next === current) return
    current = next
    notify()
  })
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const getSnapshot = () => current

// Current value for non-React code (analytics helpers, chart formatters).
export const getTimeFormat = () => current

export function setTimeFormat(format) {
  const next = format === '24h' ? '24h' : '12h'
  if (next === current) return
  current = next
  try { localStorage.setItem(STORAGE_KEY, next) } catch (_) { /* private mode — still applies for this session */ }
  notify()
}

// ── Pure formatters (usable outside React too) ────────────────────────────────
// 12h → "09:20 PM"   24h → "21:20"   (+ ":SS" when opts.seconds is true)
// hourCycle 'h23' guarantees midnight renders as 00:xx, never 24:xx.
export function formatTime(value, format = current, opts = {}) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return ''
  const o = { hour: opts.hour || '2-digit', minute: '2-digit' }
  if (opts.seconds) o.second = '2-digit'
  if (format === '24h') o.hourCycle = 'h23'
  else o.hour12 = true
  if (opts.timeZone) o.timeZone = opts.timeZone
  try {
    return d.toLocaleTimeString('en-US', o)
  } catch (_) {
    return '--:--' // unknown IANA zone
  }
}

// A bare clock reading from numbers (no Date / time zone involved):
//   formatClock(7, 0, '12h') -> "07:00 AM"    formatClock(21, 30, '24h') -> "21:30"
// Used for hour-of-day buckets (charts, heatmaps, insight text).
export function formatClock(hour, minute = 0, format = current) {
  const h = ((Math.floor(Number(hour)) % 24) + 24) % 24
  const m = String(minute).padStart(2, '0')
  if (format === '24h') return `${String(h).padStart(2, '0')}:${m}`
  const h12 = h % 12 || 12
  return `${String(h12).padStart(2, '0')}:${m} ${h >= 12 ? 'PM' : 'AM'}`
}
export const formatHour = (hour, format = current) => formatClock(hour, 0, format)

// Compact hour for tight chart axes / heatmap headers: 24h → "7", "21"; 12h → "7a", "9p".
export function formatHourShort(hour, format = current) {
  const h = ((Math.floor(Number(hour)) % 24) + 24) % 24
  if (format === '24h') return String(h)
  return `${h % 12 || 12}${h >= 12 ? 'p' : 'a'}`
}

// "Sep 3, 09:20 PM" / "Sep 3, 21:20" — short date + time, no year (last-synced labels).
export function formatShortDateTime(value, format = current) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + formatTime(d, format)
}

// "Sep 3, 2026, 09:20 PM"  /  "Sep 3, 2026, 21:20"
export function formatDateTime(value, format = current) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ', ' + formatTime(d, format)
}

// "9/3/2026, 09:20:41 PM"  /  "9/3/2026, 21:20:41"  (numeric date, with seconds)
export function formatNumericDateTime(value, format = current) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return ''
  // 12h keeps the original un-padded hour ("9:20:41 AM"); 24h pads ("09:20:41").
  return d.toLocaleDateString('en-US') + ', ' +
    formatTime(d, format, { seconds: true, hour: format === '24h' ? '2-digit' : 'numeric' })
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useTimeFormat() {
  const timeFormat = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_FORMAT)

  const fmtTime            = useCallback((v, opts) => formatTime(v, timeFormat, opts), [timeFormat])
  const fmtDateTime        = useCallback((v) => formatDateTime(v, timeFormat), [timeFormat])
  const fmtNumericDateTime = useCallback((v) => formatNumericDateTime(v, timeFormat), [timeFormat])
  const fmtHour            = useCallback((h) => formatHour(h, timeFormat), [timeFormat])
  const fmtHourShort       = useCallback((h) => formatHourShort(h, timeFormat), [timeFormat])
  const fmtShortDateTime   = useCallback((v) => formatShortDateTime(v, timeFormat), [timeFormat])
  const fmtClock           = useCallback((h, m) => formatClock(h, m, timeFormat), [timeFormat])

  return {
    timeFormat,
    is24h: timeFormat === '24h',
    setTimeFormat,
    fmtTime,
    fmtDateTime,
    fmtNumericDateTime,
    fmtHour,
    fmtHourShort,
    fmtShortDateTime,
    fmtClock,
  }
}