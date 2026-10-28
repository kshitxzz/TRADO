// ─────────────────────────────────────────────────────────────────────────
// Backtesting — time formatting that honours the chart's timezone, date format,
// "day of week" and 12 / 24-hour settings. Pure: takes unix SECONDS.
// ─────────────────────────────────────────────────────────────────────────

import { resolveTimezone } from './chartSettings'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const cache = new Map()

/** { weekday, day, month(1-12), year, hour(0-23), minute, second } of an instant in a timezone. */
export function zonedParts(secs, tz) {
  let f = cache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
    cache.set(tz, f)
  }
  const p = {}
  for (const x of f.formatToParts(new Date(secs * 1000))) p[x.type] = x.value
  return { weekday: p.weekday, day: +p.day, month: +p.month, year: +p.year, hour: +p.hour % 24, minute: +p.minute, second: +p.second }
}

const two = (n) => String(n).padStart(2, '0')

/**
 * @param settings  the scales.* block of chart settings
 * @param tzSetting symbol.timezone ('local' | 'UTC' | IANA)
 * @param appHour12 the app-wide 12 / 24-hour preference (true = 12h), used when the chart doesn't override it
 */
export function makeTimeFormatter({ scales, timezone, appHour12 = true }) {
  const tz = resolveTimezone(timezone)
  const hour12 = scales.hours == null ? appHour12 : scales.hours === '12'

  const date = (secs, { weekday = scales.dayOfWeek } = {}) => {
    const d = zonedParts(secs, tz), yy = two(d.year % 100), mon = MON[d.month - 1]
    const body = {
      'dd MMM yy': `${d.day} ${mon} '${yy}`, 'MMM dd yy': `${mon} ${d.day} '${yy}`, 'dd/MM/yyyy': `${two(d.day)}/${two(d.month)}/${d.year}`,
      'MM/dd/yyyy': `${two(d.month)}/${two(d.day)}/${d.year}`, 'yyyy-MM-dd': `${d.year}-${two(d.month)}-${two(d.day)}`, 'dd-MM-yy': `${two(d.day)}-${two(d.month)}-${yy}`,
    }[scales.dateFormat] ?? `${d.day} ${mon} '${yy}`
    return weekday ? `${d.weekday} ${body}` : body
  }

  const time = (secs, { seconds = false } = {}) => {
    const d = zonedParts(secs, tz)
    if (!hour12) return `${two(d.hour)}:${two(d.minute)}${seconds ? ':' + two(d.second) : ''}`
    const h = d.hour % 12 || 12
    return `${h}:${two(d.minute)}${seconds ? ':' + two(d.second) : ''} ${d.hour < 12 ? 'AM' : 'PM'}`
  }

  return {
    tz, hour12, date, time,
    /** Date and time for a clock / table cell. */
    dateTime: (secs) => `${date(secs)}  ${time(secs)}`,
    /** Replay clock — shorter, always with the time. */
    clock: (secs) => `${date(secs, { weekday: false })}, ${time(secs)}`,
    /** Crosshair / tooltip label for a bar; date only once bars are a day or longer. */
    crosshair: (secs, tfSecs) => (tfSecs >= 86400 ? date(secs) : `${date(secs)}  ${time(secs)}`),
    /** Time-axis tick. `type` is lightweight-charts' TickMarkType: 0 year, 1 month, 2 day, 3 time, 4 time+seconds. */
    axisTick: (secs, type) => {
      const d = zonedParts(secs, tz)
      if (type === 0) return String(d.year)
      if (type === 1) return MON[d.month - 1]
      if (type === 2) return String(d.day)
      return time(secs, { seconds: type === 4 })
    },
    /** Start (unix secs) of the day containing `secs` in this timezone — for previous-day close and separators. */
    dayKey: (secs) => { const d = zonedParts(secs, tz); return d.year * 10000 + d.month * 100 + d.day },
  }
}