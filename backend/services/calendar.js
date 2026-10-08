// ─────────────────────────────────────────────────────────────────────────
// Economic Calendar service.
//
// ACCURACY RULES (the whole point of this file):
//   • Every number shown to a user comes from a named data provider. Nothing is
//     estimated, generated, or filled in by an AI.
//   • If a value is unknown it stays null — the UI shows "—". A blank is always
//     preferred to a guess.
//
// SOURCES
//   1. Forex Factory weekly calendar feed (free, no key) — schedule, impact,
//      forecast (consensus) and previous for every currency. Timestamps carry
//      an explicit UTC offset, so daylight-saving is already resolved upstream.
//      https://nfs.faireconomy.media/ff_calendar_thisweek.json  (+ nextweek)
//      This feed does NOT publish actual values.
//   2. OPTIONAL — Financial Modeling Prep (FMP_API_KEY) fills in "actual" after
//      a release. NOTE: FMP's free Basic plan is an end-of-day test plan, so
//      real-time actuals need a paid plan, and showing FMP data to your own
//      users needs FMP's data display licence. It is merged ONLY when the match is
//      unambiguous (same currency, same release time, same title family AND
//      matching forecast/previous numbers). Anything doubtful is left blank.
//
//   3. OPTIONAL — a MetaTrader 5 feed (CALENDAR_FEED_SECRET). MT5 ships MetaQuotes'
//      own economic calendar with actual / forecast / revised-previous values that
//      update within seconds of a release. A small EA (public/ea/TradoCalendarFeed.mq5)
//      running in the OWNER's terminal pushes it to POST /api/calendar/feed. Rows are
//      merged with the same strict rules (currency + release time + title family +
//      forecast agreement); rows that match nothing are shown as extra events.
//
// Events are identical for every user, so the feeds are fetched once, cached in
// memory and shared. Forex Factory throttles aggressively, so the cache TTL is
// 15 minutes and a manual refresh is limited to once every 2 minutes.
// ─────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto'

const FF_THIS = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'
const FF_NEXT = 'https://nfs.faireconomy.media/ff_calendar_nextweek.json'
const FMP_URL = 'https://financialmodelingprep.com/stable/economic-calendar'

const UA = 'Mozilla/5.0 (compatible; TradoCalendarBot/1.0)'
const TTL_MS           = Math.max(5, parseInt(process.env.CALENDAR_TTL_MINUTES, 10) || 15) * 60_000
const FORCE_MIN_AGE_MS = 2 * 60_000
const FF_BACKOFF_MS    = 10 * 60_000
const FMP_MIN_GAP_MS   = 20 * 60_000   // catch-up polling for older releases
// Around a release the actual is what traders are waiting for, so poll much faster —
// but only for High/Medium events and only for 8 minutes after the release time.
// Default 30s is conservative on quota; raise the speed on a paid plan.
const HOT_GAP_MS       = Math.max(5, parseInt(process.env.ACTUALS_HOT_SECONDS, 10) || 30) * 1000
const HOT_WINDOW_MS    = 8 * 60_000
const HOUR = 3600_000

// ── Fetch helper ─────────────────────────────────────────────────────────
async function fetchJson(url, timeoutMs = 10_000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`)
      err.status = res.status
      throw err
    }
    const text = await res.text()
    if (text.length > 5_000_000) throw new Error('Response too large')
    try { return JSON.parse(text) } catch { throw new Error('Not JSON (blocked or throttled)') }
  } finally {
    clearTimeout(timer)
  }
}

// ── Classification (deterministic keyword rules — no AI, no guessing) ────
const CATEGORY_RULES = [
  ['Holiday',        /holiday/i],
  ['Speech',         /\b(speaks|speech|testifies|testimony|press conference)\b/i],
  ['Central Bank',   /\b(minutes|meeting accounts|monetary policy|rate statement|rate decision|official bank rate|cash rate|federal funds|policy rate|interest rate|fomc statement|economic projections|monetary policy report|sdf rate|deposit facility)\b/i],
  ['Bond Auction',   /\b(bond|bill|note|gilt|bund|jgb)\b.*\bauction\b|\bauction\b/i],
  ['Energy',         /\b(crude|oil|natural gas|opec|api weekly|eia|gasoline|distillate|rig count)\b/i],
  ['Commodities',    /\b(commodity prices|gdt price index)\b/i],
  ['Employment',     /\b(employment|payrolls?|unemployment|jobless|claims|jobs|job advertisements|vacancies|labou?r|earnings|wages?|adp|participation rate|nonfarm|non-farm)\b/i],
  ['Inflation',      /\b(cpi|inflation|ppi|price index|deflator|pce|prices|rpi|hicp|inflation expectations)\b/i],
  ['Growth',         /\b(gdp|gross domestic|economic activity|leading indicators|leading index)\b/i],
  ['Services',       /\b(services pmi|non-manufacturing|services index)\b/i],
  ['Manufacturing',  /\b(manufacturing|factory orders|industrial production|durable goods|machine tool|capacity utilization|empire state|philly fed|tankan manufacturing)\b/i],
  ['Consumer',       /\b(consumer|household|uom|michigan|economy watchers|economic optimism|sentiment)\b/i],
  ['Retail',         /\bretail\b/i],
  ['Housing',        /\b(housing|home sales|house price|hpi|building permits|construction|mortgage|rics|home price|pending home|existing home|new home)\b/i],
  ['Trade',          /\b(trade balance|current account|exports|imports|foreign currency reserves|reserves)\b/i],
  ['Business Survey',/\b(pmi|business confidence|investor confidence|ifo|zew|sentix|ivey|tankan|nfib|business climate|economic sentiment)\b/i],
]

export function classify(title) {
  for (const [cat, re] of CATEGORY_RULES) if (re.test(title)) return cat
  return 'Other'
}

// Plain-language definitions of what an indicator IS. Definitions only — no
// claims about how markets will react.
const SUMMARY_RULES = [
  [/non-?farm|nfp/i,                        'Monthly change in the number of employed people in the U.S., excluding the farm sector.'],
  [/unemployment (claims|insurance)|jobless claims/i, 'Weekly count of people filing new claims for unemployment insurance.'],
  [/unemployment rate/i,                    'Share of the labour force that is jobless and actively looking for work.'],
  [/employment change|employment level|payrolls/i, 'Change in the number of people in work over the period.'],
  [/average (cash )?earnings|average hourly earnings|wage/i, 'Change in average pay for employees over the period.'],
  [/\bcore cpi\b|core inflation|core pce|core ppi/i, 'Inflation measure that excludes volatile food and energy prices.'],
  [/\bcpi\b|consumer price|inflation rate|\bhicp\b/i, 'Measures the change in prices paid by consumers for a basket of goods and services.'],
  [/\bppi\b|producer price/i,               'Measures the change in prices received by producers for their output.'],
  [/inflation expectations/i,               'Survey-based measure of the inflation rate people expect in the future.'],
  [/\bgdp\b|gross domestic/i,               'Broadest measure of economic activity: the total value of goods and services produced.'],
  [/retail sales/i,                         'Change in the total value of sales at the retail level.'],
  [/trade balance/i,                        'Difference between the value of exports and imports over the period.'],
  [/current account/i,                      'Broadest measure of a country’s international transactions in goods, services and income.'],
  [/minutes|meeting accounts/i,             'Detailed record of a central bank’s most recent policy meeting, published after the decision.'],
  [/rate (decision|statement)|official bank rate|cash rate|federal funds|policy rate|monetary policy (meeting|statement)/i, 'Central bank’s decision on its benchmark interest rate and accompanying guidance.'],
  [/speaks|speech|testifies|testimony|press conference/i, 'Scheduled public remarks by an official. Wording on rates or the economic outlook is what traders watch for.'],
  [/auction/i,                              'Government debt auction. The two figures shown are the average yield and the bid-to-cover ratio.'],
  [/crude oil inventories/i,                'Weekly change in U.S. commercial crude oil stockpiles, reported by the EIA.'],
  [/api weekly/i,                           'Weekly American Petroleum Institute report on U.S. oil inventories.'],
  [/natural gas storage/i,                  'Weekly change in U.S. natural gas held in underground storage, reported by the EIA.'],
  [/consumer (confidence|sentiment)|uom|michigan|optimism/i, 'Survey-based gauge of how optimistic consumers are about the economy and their finances.'],
  [/services pmi|non-manufacturing/i,       'Business survey index for the services sector; readings above 50 indicate expansion and below 50 indicate contraction.'],
  [/manufacturing pmi|\bpmi\b/i,            'Business survey index; readings above 50 indicate expansion and below 50 indicate contraction.'],
  [/business confidence|investor confidence|sentix|zew|ifo|sentiment/i, 'Survey-based gauge of business or investor optimism.'],
  [/industrial production/i,                'Change in the inflation-adjusted output of factories, mines and utilities.'],
  [/factory orders|durable goods/i,         'Change in new orders placed with manufacturers.'],
  [/housing|house price|home|building permits|construction/i, 'Indicator of activity or prices in the housing and construction sector.'],
  [/holiday/i,                              'Bank holiday: local financial markets are closed or trade with reduced liquidity.'],
]
export function describe(title) {
  for (const [re, text] of SUMMARY_RULES) if (re.test(title)) return text
  return 'Scheduled economic event.'
}

// "m/m" → "Month over month", read straight off the title.
const MEASURES = [[/\bm\/m\b/i, 'Month over month'], [/\by\/y\b/i, 'Year over year'], [/\bq\/q\b/i, 'Quarter over quarter'], [/\bw\/w\b/i, 'Week over week']]
export function measureOf(title) {
  for (const [re, label] of MEASURES) if (re.test(title)) return label
  return null
}

// ── Number handling (used only to verify cross-provider matches) ─────────
const SCALE = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }
export function parseNum(s) {
  if (s == null) return null
  const str = String(s).trim()
  if (!str || str.includes('|')) return null              // auction "yield|bid-to-cover" pairs
  const m = str.match(/^(-?\d+(?:\.\d+)?)\s*([KMBT])?\s*(%)?$/i)
  if (!m) return null
  const scale = m[2] ? SCALE[m[2].toUpperCase()] : 1
  return { value: parseFloat(m[1]) * scale, raw: parseFloat(m[1]), suffix: m[2] ? m[2].toUpperCase() : '', pct: !!m[3], decimals: (m[1].split('.')[1] || '').length }
}

// Render `num` in the same style as an existing sample string ("200K", "5.4%", "55.1").
export function formatLike(sample, num) {
  const p = parseNum(sample)
  if (!p || !Number.isFinite(num)) return null
  const v = p.suffix ? num / SCALE[p.suffix] : num
  return `${v.toFixed(Math.min(2, p.decimals))}${p.suffix}${p.pct ? '%' : ''}`
}

const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))

// ── Forex Factory normalisation ──────────────────────────────────────────
const IMPACTS = { high: 'high', medium: 'medium', low: 'low', holiday: 'holiday' }

export function normalizeFF(raw) {
  const out = []
  const seen = new Map()
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!r || typeof r.title !== 'string' || typeof r.date !== 'string') continue
    const time = Date.parse(r.date)                       // ISO with offset → exact UTC instant
    if (!Number.isFinite(time)) continue
    const impact = IMPACTS[String(r.impact || '').toLowerCase()]
    if (!impact) continue
    const currency = String(r.country || '').trim().toUpperCase()
    const title = r.title.trim()
    const base = crypto.createHash('sha1').update(`${currency}|${title}|${time}`).digest('hex').slice(0, 12)
    const n = (seen.get(base) || 0) + 1
    seen.set(base, n)
    const clean = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s }
    out.push({
      id: n === 1 ? base : `${base}-${n}`,
      time,
      currency,                                           // 'USD' … or 'ALL' for global events
      title,
      impact,
      forecast: clean(r.forecast),
      previous: clean(r.previous),
      actual: null,
      category: classify(title),
      measure: measureOf(title),
      summary: describe(title),
    })
  }
  return out.sort((a, b) => a.time - b.time || a.title.localeCompare(b.title))
}

// ── Optional actuals (FMP) with strict matching ──────────────────────────
const TOKEN_ALIASES = [
  [/s\s*&\s*p global/g, ' '], [/non[- ]?manufacturing/g, 'services'],
  [/non[- ]?farm payrolls?/g, 'nfp'], [/consumer price index/g, 'cpi'], [/inflation rate/g, 'cpi'],
  [/producer price index/g, 'ppi'], [/\bmom\b|m\/m/g, 'mom'], [/\byoy\b|y\/y/g, 'yoy'], [/\bqoq\b|q\/q/g, 'qoq'],
  [/initial jobless claims|unemployment claims/g, 'claims'], [/&/g, ' and '],
]
// Words that differ between providers without changing which release it is (periods, revision stage, publisher).
const STOP = new Set(['the', 'of', 'and', 'rate', 'index', 'change', 'final', 'prelim', 'preliminary', 'flash', 'global',
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'q1', 'q2', 'q3', 'q4'])
function titleTokens(t) {
  let s = String(t || '').toLowerCase()
  for (const [re, to] of TOKEN_ALIASES) s = s.replace(re, to)
  return new Set(s.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w)))
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

// FMP scale is not guaranteed to equal FF's (142 vs 142K). Find the scale at
// which FMP's own previous/estimate reproduce FF's forecast/previous exactly.
const CANDIDATE_SCALES = [1, 1e3, 1e6, 1e9, 1e-3, 1e-6, 1e-9]
function agreeingScale(ff, fmp) {
  const pairs = [[parseNum(ff.previous), fmp.previous], [parseNum(ff.forecast), fmp.estimate]]
    .filter(([p, v]) => p && typeof v === 'number' && Number.isFinite(v))
  if (!pairs.length) return null
  for (const s of CANDIDATE_SCALES) {
    // Percent strings are plain numbers on both sides; K/M/B strings are expanded by parseNum.
    const hits = pairs.filter(([p, v]) => near(p.pct ? p.raw : p.value, v * s)).length
    if (hits === pairs.length) return s            // every available figure must agree
  }
  return null
}

export function mergeActuals(events, fmpRows) {
  let matched = 0
  const rows = (Array.isArray(fmpRows) ? fmpRows : [])
    .map(r => ({
      time: Date.parse(String(r.date || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(r.date)) ? '' : 'Z')),
      currency: String(r.currency || '').toUpperCase(),
      title: r.event, tokens: titleTokens(r.event),
      actual: r.actual, estimate: r.estimate, previous: r.previous,
      used: false,
    }))
    .filter(r => Number.isFinite(r.time) && r.currency && typeof r.actual === 'number' && Number.isFinite(r.actual))

  for (const ev of events) {
    if (ev.actual != null || ev.impact === 'holiday' || ev.time > Date.now() + 5 * 60_000) continue
    const evTokens = titleTokens(ev.title)
    const cands = []
    for (const r of rows) {
      if (r.used || r.currency !== ev.currency || Math.abs(r.time - ev.time) > 2 * 60_000) continue
      const scale = agreeingScale(ev, { previous: r.previous, estimate: r.estimate })
      if (scale == null) continue
      const sim = jaccard(evTokens, r.tokens)
      if (sim < 0.34) continue
      cands.push({ r, scale, sim })
    }
    if (!cands.length) continue
    cands.sort((a, b) => b.sim - a.sim)
    if (cands.length > 1 && cands[0].sim === cands[1].sim) continue      // ambiguous → leave blank
    const { r, scale } = cands[0]
    const sample = ev.previous && parseNum(ev.previous) ? ev.previous : ev.forecast
    const p = parseNum(sample)
    if (!p) continue
    const text = formatLike(sample, r.actual * scale)
    if (!text) continue
    ev.actual = text
    r.used = true
    matched++
  }
  return matched
}

// ── MetaTrader 5 feed ────────────────────────────────────────────────────
const MT5_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'CNY'])
const MT5_MULT = [1, 1e3, 1e6, 1e9, 1e12]                 // CALENDAR_MULTIPLIER_NONE … TRILLIONS
const MT5_SUFFIX = ['', 'K', 'M', 'B', 'T']
const MT5_IMPACT = ['low', 'low', 'medium', 'high']       // CALENDAR_IMPORTANCE_NONE, LOW, MODERATE, HIGH
const FEED_MAX_AGE_MS = 5 * 60_000                        // feed counts as "live" for 5 min after its last post

const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// MT5 values arrive already expressed in the event's own multiplier ("8.28" + billions).
export function fmtFeed(v, row) {
  if (v == null) return null
  const dig = Math.min(6, Math.max(0, row.dig | 0))
  return `${v.toFixed(dig)}${MT5_SUFFIX[row.mult] || ''}${row.unit === 1 ? '%' : ''}`
}

export function normalizeFeed(body) {
  const offset = Number(body?.serverOffsetSec)
  if (!Number.isFinite(offset) || Math.abs(offset) > 14 * 3600) throw new Error('serverOffsetSec missing or out of range')
  const rows = []
  for (const r of Array.isArray(body?.events) ? body.events.slice(0, 3000) : []) {
    if (!r || r.id == null || typeof r.name !== 'string') continue
    const cur = String(r.cur || '').toUpperCase()
    if (!MT5_CURRENCIES.has(cur) || !Number.isFinite(r.t)) continue
    const time = (Number(r.t) - offset) * 1000                // server time → UTC ms
    const mult = Math.min(4, Math.max(0, r.mult | 0))
    const row = {
      id: String(r.id), time, currency: cur, name: r.name.trim().slice(0, 200),
      imp: Math.min(3, Math.max(0, r.imp | 0)), holiday: r.type === 2,
      unit: r.unit | 0, mult, dig: r.dig | 0,
      a: numOrNull(r.a), f: numOrNull(r.f), p: numOrNull(r.p), r: numOrNull(r.r),
    }
    row.tokens = titleTokens(row.name)
    rows.push(row)
  }
  return rows
}

// Forecasts agree when they are equal after rounding to the precision Forex Factory printed.
function forecastsAgree(ev, row) {
  const p = parseNum(ev.forecast)
  if (!p || row.f == null) return null                      // nothing to compare
  const ffAbs = p.value
  const feedAbs = row.f * MT5_MULT[row.mult]
  const tol = 0.5 * Math.pow(10, -p.decimals) * (p.suffix ? SCALE[p.suffix] : 1)
  return Math.abs(ffAbs - feedAbs) <= tol * 1.001 + 1e-9
}

function candidatePairs(events, rows) {
  const pairs = []
  const loose = []                                          // same currency + time + agreeing forecast, any title
  for (const ev of events) {
    if (ev.impact === 'holiday') continue
    const evTokens = titleTokens(ev.title)
    for (const r of rows) {
      if (r.holiday || r.currency !== ev.currency || Math.abs(r.time - ev.time) > 2 * 60_000) continue
      const agree = forecastsAgree(ev, r)
      if (agree === false) continue
      const sim = jaccard(evTokens, r.tokens)
      if (agree === true) loose.push({ ev, r, sim })
      if (sim < (agree === true ? 0.34 : 0.5)) continue     // without a forecast to confirm, demand a closer title
      pairs.push({ ev, r, sim })
    }
  }
  // Providers word titles differently ("ISM Services PMI" vs "ISM Non-Manufacturing PMI"). If an event and a
  // feed row are the ONLY two things sharing a release minute, currency AND forecast figure, that is a match
  // even with a weak title score — provided they are the same kind of release.
  const perEv = new Map(), perRow = new Map()
  for (const l of loose) { perEv.set(l.ev.id, (perEv.get(l.ev.id) || 0) + 1); perRow.set(l.r.id, (perRow.get(l.r.id) || 0) + 1) }
  for (const l of loose) {
    if (l.sim >= 0.34 || perEv.get(l.ev.id) !== 1 || perRow.get(l.r.id) !== 1) continue
    if (l.sim >= 0.15 || classify(l.ev.title) === classify(l.r.name)) pairs.push(l)
  }
  return pairs.sort((x, y) => y.sim - x.sim)
}

// A wrong server-offset would shift every row; catch it by comparing rows that obviously are
// the same event (same title family AND matching forecast) but whose times differ by minutes/hours.
export function feedClockSane(events, rows) {
  const deltas = []
  for (const ev of events) {
    if (ev.impact === 'holiday') continue
    const evTokens = titleTokens(ev.title)
    for (const r of rows) {
      if (r.holiday || r.currency !== ev.currency || Math.abs(r.time - ev.time) > 4 * HOUR) continue
      if (forecastsAgree(ev, r) !== true || jaccard(evTokens, r.tokens) < 0.6) continue
      deltas.push(r.time - ev.time)
    }
  }
  if (deltas.length < 3) return { ok: true, verified: false, checked: deltas.length }
  deltas.sort((a, b) => a - b)
  const median = deltas[Math.floor(deltas.length / 2)]
  const ok = Math.abs(median) <= 2 * 60_000
  return { ok, verified: ok, checked: deltas.length, medianMs: median }
}

export function buildOverlay(events, rows, now = Date.now(), { allowExtras = true } = {}) {
  const overlay = new Map()
  const used = new Set()
  for (const { ev, r } of candidatePairs(events, rows)) {
    if (overlay.has(ev.id) || used.has(r.id)) continue
    used.add(r.id)
    const fix = { source: 'MetaQuotes' }
    const a = fmtFeed(r.a, r); if (a != null) fix.actual = a
    const f = fmtFeed(r.f, r); if (f != null) fix.forecast = f
    const prev = r.r != null ? r.r : r.p
    const p = fmtFeed(prev, r); if (p != null) { fix.previous = p; if (r.r != null) fix.previousRevised = true }
    overlay.set(ev.id, fix)
  }
  const extras = !allowExtras ? [] : rows
    .filter(r => !used.has(r.id) && !(r.imp === 0 && !r.holiday) && Math.abs(r.time - now) < 9 * 24 * HOUR)
    .map(r => ({
      id: `mt5-${r.id}`, time: r.time, currency: r.currency, title: r.name,
      impact: r.holiday ? 'holiday' : MT5_IMPACT[r.imp],
      forecast: fmtFeed(r.f, r), previous: fmtFeed(r.r != null ? r.r : r.p, r), actual: fmtFeed(r.a, r),
      previousRevised: r.r != null, category: classify(r.name), measure: measureOf(r.name), summary: describe(r.name), source: 'MetaQuotes',
    }))
  return { overlay, extras, matched: overlay.size }
}

function recomputeFeed() {
  const rows = [...state.feed.rows.values()]
  if (!rows.length) { state.overlay = new Map(); state.extras = []; return }
  const sane = feedClockSane(state.events, rows)
  if (!sane.ok) {
    state.feed.error = `Clock mismatch (feed is ${Math.round(sane.medianMs / 60000)} min off) — ignored`
    state.overlay = new Map(); state.extras = []
    return
  }
  state.feed.error = null
  // Extra (MT5-only) events carry no second opinion on their release time, so they are shown only
  // once the feed's clock has been proven right: ≥3 forecast-confirmed events line up to the minute,
  // or such a check passed in the last 24h with the same server offset.
  if (sane.verified) { state.feed.verifiedAt = Date.now(); state.feed.verifiedOffset = state.feed.offsetSec }
  const trusted = sane.verified || (state.feed.verifiedOffset === state.feed.offsetSec && Date.now() - (state.feed.verifiedAt || 0) < 24 * HOUR)
  const { overlay, extras, matched } = buildOverlay(state.events, rows, Date.now(), { allowExtras: trusted })
  state.overlay = overlay; state.extras = extras
  state.feed.matched = matched; state.feed.added = extras.length
}

// Called by POST /api/calendar/feed. `full: true` replaces everything, otherwise rows are upserted by id.
export function ingestFeed(body) {
  const rows = normalizeFeed(body)
  if (body?.full === true) state.feed.rows = new Map()
  state.feed.offsetSec = Number(body.serverOffsetSec)
  for (const r of rows) state.feed.rows.set(r.id, r)
  const cutoff = Date.now() - 9 * 24 * HOUR
  for (const [k, r] of state.feed.rows) if (r.time < cutoff) state.feed.rows.delete(k)
  state.feed.receivedAt = Date.now()
  state.feed.count = state.feed.rows.size
  recomputeFeed()
  return { accepted: rows.length, total: state.feed.count, matched: state.feed.matched, added: state.feed.added, error: state.feed.error }
}

// ── Cache + orchestration ────────────────────────────────────────────────
const state = {
  events: [],
  updatedAt: 0,            // when the schedule was last pulled successfully
  attemptAt: 0,
  inflight: null,
  ffBackoffUntil: 0,
  lastError: null,
  weeks: { this: 0, next: 0 },
  actuals: { provider: process.env.FMP_API_KEY ? 'Financial Modeling Prep' : null, enabled: !!process.env.FMP_API_KEY, lastFetch: 0, lastError: null, matched: 0 },
  actualByKey: new Map(),  // id → actual, so a value survives a schedule refresh
  feed: { configured: !!process.env.CALENDAR_FEED_SECRET, rows: new Map(), receivedAt: 0, error: null, matched: 0, added: 0, count: 0 },
  overlay: new Map(),      // FF event id → values supplied by the MT5 feed
  extras: [],              // MT5 events Forex Factory does not list
}

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10)

async function pullSchedule() {
  const [thisWeek, nextWeek] = await Promise.allSettled([fetchJson(FF_THIS), fetchJson(FF_NEXT)])
  if (thisWeek.status === 'rejected') {
    if (thisWeek.reason?.status === 429) state.ffBackoffUntil = Date.now() + FF_BACKOFF_MS
    throw thisWeek.reason
  }
  const a = normalizeFF(thisWeek.value)
  if (!a.length) throw new Error('Forex Factory feed returned no events')
  // Next week's file only exists part-way through the week — a miss is normal.
  const b = nextWeek.status === 'fulfilled' ? normalizeFF(nextWeek.value) : []
  state.weeks = { this: a.length, next: b.length }
  return [...a, ...b].sort((x, y) => x.time - y.time || x.title.localeCompare(y.title))
}

async function pullActuals(events) {
  if (!state.actuals.enabled) return
  const now = Date.now()
  if (now < (state.actuals.pausedUntil || 0)) return
  // Anything released (or releasing within 15s) that still has no actual.
  const open = events.filter(e => e.actual == null && e.impact !== 'holiday' && e.time <= now + 15_000 && e.time >= now - 72 * HOUR)
  if (!open.length) return
  const hot = open.some(e => e.impact !== 'low' && now - e.time <= HOT_WINDOW_MS)
  if (now - state.actuals.lastFetch < (hot ? HOT_GAP_MS : FMP_MIN_GAP_MS)) return
  state.actuals.lastFetch = now
  try {
    const url = `${FMP_URL}?from=${ymd(now - 3 * 24 * HOUR)}&to=${ymd(now + 24 * HOUR)}&apikey=${encodeURIComponent(process.env.FMP_API_KEY)}`
    const rows = await fetchJson(url)
    if (!Array.isArray(rows)) throw new Error(rows?.['Error Message'] || 'Unexpected FMP response')
    state.actuals.matched = mergeActuals(events, rows)
    state.actuals.lastError = null
    state.actuals.pausedUntil = 0
  } catch (err) {
    state.actuals.lastError = err.status ? `FMP HTTP ${err.status}` : err.message
    // Plan has no access / bad key → stop hammering for an hour; rate-limited → 10 minutes.
    if ([401, 402, 403].includes(err.status)) state.actuals.pausedUntil = now + 60 * 60_000
    else if (err.status === 429) state.actuals.pausedUntil = now + 10 * 60_000
    console.error('[calendar] actuals:', state.actuals.lastError)
  }
}

async function refresh() {
  state.attemptAt = Date.now()
  try {
    const events = await pullSchedule()
    // Carry over actuals we already know so a schedule refresh never blanks them.
    for (const e of events) if (state.actualByKey.has(e.id)) e.actual = state.actualByKey.get(e.id)
    state.events = events
    state.updatedAt = Date.now()
    state.lastError = null
    recomputeFeed()
  } catch (err) {
    state.lastError = err.status ? `Forex Factory HTTP ${err.status}` : err.message
    console.error('[calendar] schedule:', state.lastError)
    if (!state.events.length) throw err                  // nothing cached → caller reports failure
  }
  await pullActuals(state.events)
  for (const e of state.events) if (e.actual != null) state.actualByKey.set(e.id, e.actual)
}

export async function getCalendar({ force = false } = {}) {
  const now = Date.now()
  const age = now - state.updatedAt
  const minAge = force ? FORCE_MIN_AGE_MS : TTL_MS
  const throttled = now < state.ffBackoffUntil
  const needs = !state.events.length || (age >= minAge && now - state.attemptAt >= 30_000 && !throttled)
  if (needs) {
    if (!state.inflight) state.inflight = refresh().finally(() => { state.inflight = null })
    // First load must wait; later refreshes also wait briefly so the response is fresh.
    await state.inflight
  } else if (state.actuals.enabled && !state.inflight) {
    // Schedule is fresh, but a release may have just landed — let the actuals path decide.
    state.inflight = pullActuals(state.events).then(() => {
      for (const e of state.events) if (e.actual != null) state.actualByKey.set(e.id, e.actual)
    }).finally(() => { state.inflight = null })
    await state.inflight
  }
  return snapshot()
}

export function snapshot() {
  const now = Date.now()
  const stale = now - state.updatedAt > TTL_MS * 3
  const feedLive = state.feed.configured && now - state.feed.receivedAt < FEED_MAX_AGE_MS
  const merged = state.events.map(e => (state.overlay.has(e.id) ? { ...e, ...state.overlay.get(e.id) } : e))
  const events = state.extras.length ? [...merged, ...state.extras].sort((a, b) => a.time - b.time || a.title.localeCompare(b.title)) : merged
  return {
    events,
    serverTime: now,                        // lets the browser correct a wrong device clock
    meta: {
      updatedAt: state.updatedAt,
      stale,
      error: state.lastError,
      source: 'Forex Factory economic calendar',
      weeks: state.weeks,
      actuals: { ...state.actuals, enabled: state.actuals.enabled || state.feed.configured },
      feed: {
        configured: state.feed.configured, live: feedLive, receivedAt: state.feed.receivedAt,
        error: state.feed.error, matched: state.feed.matched, added: state.feed.added,
      },
    },
  }
}

export const __test = { normalizeFeed, buildOverlay, feedClockSane, fmtFeed, ingestFeed, normalizeFF, classify, describe, measureOf, parseNum, formatLike, mergeActuals, titleTokens, agreeingScale }