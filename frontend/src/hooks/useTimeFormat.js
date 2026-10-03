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
  return d.toLocaleTimeString('en-US', o)
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

  return {
    timeFormat,
    is24h: timeFormat === '24h',
    setTimeFormat,
    fmtTime,
    fmtDateTime,
    fmtNumericDateTime,
  }
}