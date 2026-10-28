// ─────────────────────────────────────────────────────────────────────────
// Backtesting — chart settings (pure).
// One object holds every option of the Settings dialog. Colours that are `null`
// follow the app theme (light / dark); anything the user changes is stored.
// ─────────────────────────────────────────────────────────────────────────

const UP = '#26B570', DOWN = '#D4263A'

export const DEFAULT_SETTINGS = {
  symbol: {
    colorByPrevClose: false,
    body:    { on: true, up: UP, down: DOWN },
    borders: { on: true, up: UP, down: DOWN },
    wick:    { on: true, up: UP, down: DOWN },
    precision: 'default',            // 'default' | 0..14
    timezone: 'local',               // 'local' | 'UTC' | IANA id
  },
  status: {
    logo: true, title: true, titleMode: 'symbol-name',   // 'symbol-name' | 'symbol' | 'description'
    marketStatus: true, chartValues: false, barChange: false, volume: false, lastDayChange: false, buySell: true,
    indTitles: true, indInputs: true, indValues: true, indBackground: true, indBackgroundOpacity: 0.5,
  },
  scales: {
    currencyUnit: 'always',          // 'always' | 'hover' | 'hidden'
    scaleModes: 'always',
    lockRatio: false, ratio: 0,
    placement: 'auto',               // 'auto' | 'left' | 'right'
    plusButton: true, countdown: true,
    symbolLabel: 'name-value-line',  // see SYMBOL_LABEL_MODES
    symbolLineColor: null, symbolLineStyle: 'solid',
    prevDayClose: 'hidden', prevDayColor: '#6B7280', prevDayStyle: 'dashed',
    indicatorValues: 'value',        // 'hidden' | 'value'
    highLow: 'hidden', highColor: '#26B570', lowColor: '#D4263A',
    bidAsk: 'hidden', bidColor: '#3B82F6', askColor: '#D4263A',
    dayOfWeek: true, dateFormat: 'dd MMM yy', hours: null,       // hours: null → follow the app's 12 / 24-hour setting
    saveLeftEdge: false,
  },
  canvas: {
    bgType: 'solid', bg: null, bg2: null,
    vGrid: { on: true, color: null }, hGrid: { on: true, color: null },
    crosshair: { color: null, style: 'dashed' },
    watermark: { mode: 'hidden', color: null },
    scaleText: { color: null, size: 12 }, scaleLines: { color: null },
    navButtons: 'hover', paneButtons: 'hover',
    margins: { top: 10, bottom: 8, right: 10 },
  },
  trading: {
    buySell: true, oneClick: false,
    sound: { on: false, volume: 0.5, kind: 'calling' },
    onlyRejections: false,
    positionsAndOrders: true, reverseButton: true, projectOrder: true,
    pnl: { on: true, positionsOn: true, positions: 'money', bracketsOn: true, brackets: 'money' },
    executionMarks: true, executionLabels: false,
    extendedLines: true, alignment: 'right', snapshots: true,
  },
  alerts: { lines: true, color: '#E11D48', onlyActive: true, autoHideToasts: true },
  events: { daySeparators: false, separatorColor: null },
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

/** Deep-merge saved settings over the defaults, keeping only keys the app knows about. */
export function mergeSettings(saved, base = DEFAULT_SETTINGS) {
  const out = {}
  for (const k of Object.keys(base)) {
    const b = base[k], s = saved?.[k]
    if (isObj(b)) out[k] = mergeSettings(isObj(s) ? s : {}, b)
    else out[k] = s === undefined ? b : s
  }
  return out
}

export const clone = (o) => JSON.parse(JSON.stringify(o))
export const sameSettings = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ── option lists ─────────────────────────────────────────────────────────
export const LINE_STYLES = [
  { id: 'solid', label: 'Solid' }, { id: 'dashed', label: 'Dashed' }, { id: 'dotted', label: 'Dotted' },
]
export const TITLE_MODES = [
  { id: 'symbol-name', label: 'Symbol and name' }, { id: 'symbol', label: 'Symbol' }, { id: 'description', label: 'Description' },
]
export const VISIBILITY = [
  { id: 'always', label: 'Always visible' }, { id: 'hover', label: 'Visible on mouse over' }, { id: 'hidden', label: 'Hidden' },
]
export const PLACEMENTS = [{ id: 'auto', label: 'Auto' }, { id: 'left', label: 'Left' }, { id: 'right', label: 'Right' }]
export const SYMBOL_LABEL_MODES = [
  { id: 'name-value-line', label: 'Name, value, line' }, { id: 'name-value', label: 'Name, value' },
  { id: 'value-line', label: 'Value, line' }, { id: 'value', label: 'Value' }, { id: 'line', label: 'Line' }, { id: 'hidden', label: 'Hidden' },
]
export const LEVEL_MODES = [{ id: 'hidden', label: 'Hidden' }, { id: 'line', label: 'Line' }, { id: 'line-label', label: 'Line and label' }]
export const INDICATOR_VALUE_MODES = [{ id: 'hidden', label: 'Hidden' }, { id: 'value', label: 'Value' }]
export const WATERMARK_MODES = [
  { id: 'hidden', label: 'Hidden' }, { id: 'ticker', label: 'Ticker' }, { id: 'ticker-interval', label: 'Ticker and interval' },
  { id: 'ticker-interval-desc', label: 'Ticker, Interval, Description' },
]
export const PNL_MODES = [{ id: 'money', label: 'Money' }, { id: 'pips', label: 'Pips / points' }, { id: 'percent', label: '% of balance' }]
export const ALIGNMENTS = [{ id: 'left', label: 'Left' }, { id: 'center', label: 'Center' }, { id: 'right', label: 'Right' }]
export const HOURS_FORMATS = [{ id: '12', label: '12-hours' }, { id: '24', label: '24-hours' }]
export const FONT_SIZES = [10, 11, 12, 14, 16, 18, 20].map(n => ({ id: n, label: String(n) }))
export const SOUND_KINDS = [
  { id: 'calling', label: 'Calling' }, { id: 'chime', label: 'Chime' }, { id: 'ping', label: 'Ping' }, { id: 'pop', label: 'Pop' }, { id: 'beep', label: 'Beep' },
]

export const DATE_FORMATS = [
  { id: 'dd MMM yy', label: '29 Sep \'97' }, { id: 'MMM dd yy', label: 'Sep 29 \'97' }, { id: 'dd/MM/yyyy', label: '29/09/1997' },
  { id: 'MM/dd/yyyy', label: '09/29/1997' }, { id: 'yyyy-MM-dd', label: '1997-09-29' }, { id: 'dd-MM-yy', label: '29-09-97' },
]

export const PRECISION_OPTIONS = [
  { id: 'default', label: 'Default' },
  ...Array.from({ length: 15 }, (_, n) => ({ id: n, label: `${n} decimal${n === 1 ? '' : 's'}` })),
]

// ── timezones ────────────────────────────────────────────────────────────
const TZ_IDS = [
  'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Vancouver', 'America/Phoenix', 'America/Denver', 'America/Chicago',
  'America/Mexico_City', 'America/Bogota', 'America/Lima', 'America/New_York', 'America/Toronto', 'America/Caracas', 'America/Santiago',
  'America/Halifax', 'America/Argentina/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/Azores', 'Atlantic/Reykjavik', 'Africa/Casablanca',
  'Europe/Dublin', 'Africa/Lagos', 'Europe/Lisbon', 'Europe/London', 'Africa/Tunis', 'Europe/Amsterdam', 'Europe/Belgrade', 'Europe/Berlin',
  'Europe/Bratislava', 'Europe/Brussels', 'Europe/Budapest', 'Europe/Copenhagen', 'Europe/Madrid', 'Europe/Oslo', 'Europe/Paris', 'Europe/Prague',
  'Europe/Rome', 'Europe/Stockholm', 'Europe/Vienna', 'Europe/Warsaw', 'Europe/Zurich', 'Africa/Johannesburg', 'Africa/Cairo', 'Europe/Athens',
  'Europe/Helsinki', 'Europe/Istanbul', 'Asia/Jerusalem', 'Europe/Kiev', 'Asia/Riyadh', 'Africa/Nairobi', 'Europe/Moscow', 'Asia/Tehran',
  'Asia/Dubai', 'Asia/Muscat', 'Asia/Kabul', 'Asia/Ashgabat', 'Asia/Almaty', 'Asia/Karachi', 'Asia/Colombo', 'Asia/Kolkata', 'Asia/Kathmandu',
  'Asia/Dhaka', 'Asia/Yangon', 'Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Jakarta', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore',
  'Asia/Kuala_Lumpur', 'Asia/Manila', 'Asia/Taipei', 'Australia/Perth', 'Asia/Seoul', 'Asia/Tokyo', 'Australia/Adelaide', 'Australia/Brisbane',
  'Australia/Sydney', 'Pacific/Guam', 'Pacific/Auckland', 'Pacific/Fiji',
]
const CITY = { 'Asia/Shanghai': 'Chongqing', 'Asia/Almaty': 'Astana', 'Europe/Kiev': 'Kyiv', 'Asia/Ho_Chi_Minh': 'Ho Chi Minh', 'America/Argentina/Buenos_Aires': 'Buenos Aires' }

export const browserTimezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' } }

/** Current UTC offset of an IANA zone in minutes (DST-aware). */
export function tzOffsetMinutes(tz, atMs = Date.now()) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(atMs)).find(p => p.type === 'timeZoneName')?.value || 'GMT'
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part)
    return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0)) : 0
  } catch { return 0 }
}
export function offsetLabel(min) {
  if (!min) return 'UTC'
  const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60
  return `UTC${min < 0 ? '-' : '+'}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`
}

/** [{ id, label }] sorted by offset, like "(UTC+5:30) Kolkata". The browser's own zone is always included. */
export function timezoneOptions(atMs = Date.now()) {
  const ids = [...new Set([browserTimezone(), ...TZ_IDS])]
  const rows = ids.map(id => {
    const off = tzOffsetMinutes(id, atMs)
    const city = CITY[id] || id.split('/').pop().replace(/_/g, ' ')
    return { id, off, label: `(${offsetLabel(off)}) ${city}` }
  }).sort((a, b) => a.off - b.off || a.label.localeCompare(b.label))
  return [{ id: 'UTC', label: 'UTC' }, ...rows.filter(r => r.id !== 'UTC').map(({ id, label }) => ({ id, label }))]
}
export const resolveTimezone = (tz) => (tz === 'local' || !tz ? browserTimezone() : tz)

// ── symbol text ──────────────────────────────────────────────────────────
const CCY = { USD: 'U.S. Dollar', EUR: 'Euro', GBP: 'British Pound', JPY: 'Japanese Yen', CHF: 'Swiss Franc', CAD: 'Canadian Dollar', AUD: 'Australian Dollar', NZD: 'New Zealand Dollar' }
const CRYPTO = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', BNB: 'BNB', XRP: 'XRP', DOGE: 'Dogecoin', ADA: 'Cardano', LINK: 'Chainlink' }

export function symbolDescription(symbol = '') {
  const s = symbol.toUpperCase()
  if (s.startsWith('XAU')) return 'Gold Spot / U.S. Dollar'
  if (s.startsWith('XAG')) return 'Silver Spot / U.S. Dollar'
  if (/WTI/.test(s)) return 'WTI Crude Oil / U.S. Dollar'
  if (/BRENT/.test(s)) return 'Brent Crude Oil / U.S. Dollar'
  if (/NATGAS/.test(s)) return 'Natural Gas / U.S. Dollar'
  const c = /^([A-Z]{2,5})USDT$/.exec(s)
  if (c && CRYPTO[c[1]]) return `${CRYPTO[c[1]]} / TetherUS`
  if (/^[A-Z]{6}$/.test(s) && CCY[s.slice(0, 3)] && CCY[s.slice(3)]) return `${CCY[s.slice(0, 3)]} / ${CCY[s.slice(3)]}`
  return s
}
export const quoteLabel = (symbol = '') => (/USDT$/i.test(symbol) ? 'USDT' : /^[A-Z]{6}$/i.test(symbol) ? symbol.slice(3).toUpperCase() : 'USD')

/** Colours used while a setting is left on "theme default". */
export function themeColors(isDark) {
  return isDark
    ? { bg: '#0A0A0D', bg2: '#16131D', grid: 'rgba(255,255,255,0.045)', crosshair: 'rgba(255,255,255,0.45)', scaleText: '#9CA3AF', scaleLine: 'rgba(255,255,255,0.12)', watermark: 'rgba(255,255,255,0.07)', separator: 'rgba(255,255,255,0.14)', crossLabel: '#211D26' }
    : { bg: '#F7F6FB', bg2: '#ECEAF4', grid: 'rgba(0,0,0,0.07)', crosshair: 'rgba(0,0,0,0.4)', scaleText: '#6B7280', scaleLine: 'rgba(0,0,0,0.14)', watermark: 'rgba(0,0,0,0.07)', separator: 'rgba(0,0,0,0.16)', crossLabel: '#374151' }
}