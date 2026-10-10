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
//   2. FREE official sources fill in "actual" for US releases (services/officialActuals.js):
//      BLS (jobs, CPI, PPI), FRED (claims, retail sales, trade, PCE, GDP) and EIA (oil / gas
//      inventories). Each needs a free key (BLS_API_KEY, FRED_API_KEY, EIA_API_KEY). They run
//      on the server, so they work whether or not anyone has an EA connected.
//   3. OPTIONAL — Financial Modeling Prep (FMP_API_KEY) fills in "actual" after
//      a release, only for events the official sources left blank. NOTE: FMP's free Basic plan is an end-of-day test plan, so
//      real-time actuals need a paid plan, and showing FMP data to your own
//      users needs FMP's data display licence. It is merged ONLY when the match is
//      unambiguous (same currency, same release time, same title family AND
//      matching forecast/previous numbers). Anything doubtful is left blank.
//
// Events are identical for every user, so the feeds are fetched once, cached in
// memory and shared. Forex Factory throttles aggressively, so the cache TTL is
// 15 minutes and a manual refresh is limited to once every 2 minutes.
// ─────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import { parseNum, formatLike, near } from './calendarNumbers.js'
import { officialEnabled, officialStatus, fetchOfficialActuals, specFor } from './officialActuals.js'
import { fedStatus, fetchFedActuals, fedKindOf } from './fedActuals.js'
import { treasuryStatus, fetchAuctionActuals, auctionSpecFor } from './treasuryAuctions.js'

export { parseNum, formatLike }

const FF_THIS = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'
const FF_NEXT = 'https://nfs.faireconomy.media/ff_calendar_nextweek.json'
const FMP_URL = 'https://financialmodelingprep.com/stable/economic-calendar'

const UA = 'Mozilla/5.0 (compatible; TradoCalendarBot/1.0)'
const TTL_MS           = Math.max(5, parseInt(process.env.CALENDAR_TTL_MINUTES, 10) || 15) * 60_000
const FORCE_MIN_AGE_MS = 2 * 60_000
// When a data release due within the next 6 hours (or just out) still has no forecast, look at Forex
// Factory every 5 minutes instead of every TTL, so a forecast shows up in the journal soon after FF
// publishes it. Next week's file is only re-read every 30 minutes, which keeps total requests low.
const FAST_TTL_MS          = Math.min(TTL_MS, 5 * 60_000)
const NEXT_WEEK_MIN_AGE_MS = 30 * 60_000
const FF_BACKOFF_MS    = 10 * 60_000
const FMP_MIN_GAP_MS   = 20 * 60_000   // catch-up polling for older releases
// Around a release the actual is what traders are waiting for, so poll much faster —
// but only for High/Medium events and only for 8 minutes after the release time.
// Default 30s is conservative on quota; raise the speed on a paid plan.
const HOT_GAP_MS       = Math.max(5, parseInt(process.env.ACTUALS_HOT_SECONDS, 10) || 30) * 1000
const HOT_WINDOW_MS    = 8 * 60_000
const HOUR = 3600_000
// Official sources are free and first-party, so they are polled faster and for every mapped
// release (not only High/Medium) — but only for 10 minutes after the release time.
const OFF_HOT_GAP_MS     = Math.max(5, parseInt(process.env.OFFICIAL_ACTUALS_HOT_SECONDS, 10) || 15) * 1000
const OFF_HOT_WINDOW_MS  = 10 * 60_000
const OFF_CATCHUP_GAP_MS = 30 * 60_000   // releases that are still blank (e.g. after a deploy or restart)
const OFF_BACKFILL_MS    = 8 * 24 * HOUR // how far back to look: the whole Forex Factory week
// Federal Reserve feeds (FOMC statement / minutes / projections, rate decision, Board members' speeches):
// speeches are sometimes posted a little after the scheduled start, so watch for an hour.
const FED_HOT_GAP_MS     = 30_000
const FED_HOT_WINDOW_MS  = 60 * 60_000
const FED_CATCHUP_GAP_MS = 10 * 60_000

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

// Number helpers (parseNum, formatLike, near) live in calendarNumbers.js.

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
      actualSource: null,
      actualUrl: null,     // link to the source page (Federal Reserve items)
      actualNote: null,    // e.g. the speech title
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
    ev.actualSource = 'Financial Modeling Prep'
    r.used = true
    matched++
  }
  return matched
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
  actuals: { provider: null, enabled: false, lastFetch: 0, lastError: null, matched: 0 },   // FMP (optional)
  official: { lastFetch: 0, matched: 0 },
  fed: { lastFetch: 0, matched: 0 },
  auctions: { lastFetch: 0, matched: 0 },
  nextWeek: { at: 0, events: [] },
  actualByKey: new Map(),  // id → { actual, source, url, note }, so a value survives a schedule refresh
}

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10)

async function pullSchedule() {
  const needNext = Date.now() - state.nextWeek.at >= NEXT_WEEK_MIN_AGE_MS
  const [thisWeek, nextWeek] = await Promise.allSettled([fetchJson(FF_THIS), needNext ? fetchJson(FF_NEXT) : Promise.resolve(null)])
  if (thisWeek.status === 'rejected') {
    if (thisWeek.reason?.status === 429) state.ffBackoffUntil = Date.now() + FF_BACKOFF_MS
    throw thisWeek.reason
  }
  const a = normalizeFF(thisWeek.value)
  if (!a.length) throw new Error('Forex Factory feed returned no events')
  // Next week's file only exists part-way through the week — a miss is normal.
  if (needNext) state.nextWeek = { at: Date.now(), events: nextWeek.status === 'fulfilled' ? normalizeFF(nextWeek.value) : [] }
  const seen = new Set(a.map(e => e.id))                                        // week roll-over: never list an event twice
  const b = state.nextWeek.events.filter(e => !seen.has(e.id))
  state.weeks = { this: a.length, next: b.length }
  return [...a, ...b].sort((x, y) => x.time - y.time || x.title.localeCompare(y.title))
}

async function pullFmp(events) {
  if (!process.env.FMP_API_KEY) return
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

// Official US sources first (free, first-party); FMP only fills what is still blank.
async function pullOfficial(events) {
  if (!officialEnabled()) return
  const now = Date.now()
  // Anything released this week that is still blank. Releases older than 24h are only backfilled when
  // they are the LATEST release of that indicator: once a newer one is out, the agency's series may
  // have been revised and would no longer show the originally published number.
  const latest = new Map()
  for (const e of events) {
    const sp = e.time <= now + 15_000 ? specFor(e) : null
    if (sp && !(latest.get(sp.name) >= e.time)) latest.set(sp.name, e.time)
  }
  const open = events.filter(e => {
    if (e.actual != null || e.impact === 'holiday' || e.time > now + 15_000 || e.time < now - OFF_BACKFILL_MS) return false
    const sp = specFor(e)
    return !!sp && (now - e.time <= 24 * HOUR || latest.get(sp.name) === e.time)
  })
  if (!open.length) return
  const hot = open.some(e => now - e.time <= OFF_HOT_WINDOW_MS)
  if (now - state.official.lastFetch < (hot ? OFF_HOT_GAP_MS : OFF_CATCHUP_GAP_MS)) return
  state.official.lastFetch = now
  try {
    const { updates } = await fetchOfficialActuals(open, now)
    for (const u of updates) { u.ev.actual = u.text; u.ev.actualSource = u.source }
    state.official.matched += updates.length
  } catch (err) {
    console.error('[calendar] official actuals:', err.message)        // never includes a key
  }
}

// Federal Reserve items need no key, so the actuals machinery is always on.
async function pullFed(events) {
  const now = Date.now()
  const open = events.filter(e => e.actual == null && e.time <= now + 15_000 && e.time >= now - OFF_BACKFILL_MS && fedKindOf(e))
  if (!open.length) return
  const hot = open.some(e => now - e.time <= FED_HOT_WINDOW_MS)
  if (now - state.fed.lastFetch < (hot ? FED_HOT_GAP_MS : FED_CATCHUP_GAP_MS)) return
  state.fed.lastFetch = now
  try {
    const { updates } = await fetchFedActuals(open, now)
    for (const u of updates) { u.ev.actual = u.text; u.ev.actualSource = u.source; u.ev.actualUrl = u.url || null; u.ev.actualNote = u.note || null }
    state.fed.matched += updates.length
  } catch (err) {
    console.error('[calendar] fed actuals:', err.message)
  }
}

async function pullAuctions(events) {
  const now = Date.now()
  const open = events.filter(e => e.actual == null && e.time <= now + 15_000 && e.time >= now - OFF_BACKFILL_MS && auctionSpecFor(e))
  if (!open.length) return
  const hot = open.some(e => now - e.time <= FED_HOT_WINDOW_MS)          // results post within minutes of the 1 pm ET auction
  if (now - state.auctions.lastFetch < (hot ? FED_HOT_GAP_MS : FED_CATCHUP_GAP_MS)) return
  state.auctions.lastFetch = now
  try {
    const { updates } = await fetchAuctionActuals(open, now)
    for (const u of updates) { u.ev.actual = u.text; u.ev.actualSource = u.source }
    state.auctions.matched += updates.length
  } catch (err) {
    console.error('[calendar] auction actuals:', err.message)
  }
}

const actualsEnabled = () => true

async function pullActuals(events) {
  await pullOfficial(events)
  await pullFed(events)
  await pullAuctions(events)
  await pullFmp(events)
}

const remember = () => { for (const e of state.events) if (e.actual != null) state.actualByKey.set(e.id, { actual: e.actual, source: e.actualSource, url: e.actualUrl, note: e.actualNote }) }

async function refresh() {
  state.attemptAt = Date.now()
  try {
    const events = await pullSchedule()
    // Carry over actuals we already know so a schedule refresh never blanks them.
    for (const e of events) if (state.actualByKey.has(e.id)) { const k = state.actualByKey.get(e.id); e.actual = k.actual; e.actualSource = k.source; e.actualUrl = k.url || null; e.actualNote = k.note || null }
    state.events = events
    state.updatedAt = Date.now()
    state.lastError = null
  } catch (err) {
    state.lastError = err.status ? `Forex Factory HTTP ${err.status}` : err.message
    console.error('[calendar] schedule:', state.lastError)
    if (!state.events.length) throw err                  // nothing cached → caller reports failure
  }
  await pullActuals(state.events)
  remember()
}

// A data release (not a speech / statement / auction) due soon that has no forecast yet.
const expectsForecast = (e) => e.impact !== 'holiday' && e.category !== 'Speech' && e.category !== 'Holiday' && e.category !== 'Bond Auction' &&
  !/\b(statement|minutes|projections|speaks|testifies|api weekly)\b/i.test(e.title)
function ttlNow(now) {
  const waiting = state.events.some(e => e.forecast == null && expectsForecast(e) && e.time > now - 15 * 60_000 && e.time < now + 6 * HOUR)
  return waiting ? FAST_TTL_MS : TTL_MS
}

export async function getCalendar({ force = false } = {}) {
  const now = Date.now()
  const age = now - state.updatedAt
  const minAge = force ? FORCE_MIN_AGE_MS : ttlNow(now)
  const throttled = now < state.ffBackoffUntil
  const needs = !state.events.length || (age >= minAge && now - state.attemptAt >= 30_000 && !throttled)
  if (needs) {
    if (!state.inflight) state.inflight = refresh().finally(() => { state.inflight = null })
    // First load must wait; later refreshes also wait briefly so the response is fresh.
    await state.inflight
  } else if (actualsEnabled() && !state.inflight) {
    // Schedule is fresh, but a release may have just landed — let the actuals path decide.
    state.inflight = pullActuals(state.events).then(remember).finally(() => { state.inflight = null })
    await state.inflight
  }
  return snapshot()
}

function actualsMeta() {
  const off = officialStatus()
  const fmpOn = !!process.env.FMP_API_KEY
  const fed = fedStatus()
  const tre = treasuryStatus()
  const names = [off.enabled && 'U.S. official sources (BLS · FRED · EIA)', 'Federal Reserve Board', 'U.S. Treasury', fmpOn && 'Financial Modeling Prep'].filter(Boolean)
  return {
    enabled: true,
    provider: names.join(' + '),
    lastError: off.lastError || fed.lastError || tre.lastError || state.actuals.lastError,
    matched: state.official.matched + state.fed.matched + state.auctions.matched + state.actuals.matched,
    official: { ...off, matched: state.official.matched },
    fed: { ...fed, matched: state.fed.matched },
    auctions: { ...tre, matched: state.auctions.matched },
    fmp: { enabled: fmpOn, lastError: state.actuals.lastError, matched: state.actuals.matched },
  }
}

export function snapshot() {
  const stale = Date.now() - state.updatedAt > TTL_MS * 3
  return {
    events: state.events,
    serverTime: Date.now(),                 // lets the browser correct a wrong device clock
    meta: {
      updatedAt: state.updatedAt,
      stale,
      error: state.lastError,
      source: 'Forex Factory economic calendar',
      weeks: state.weeks,
      actuals: actualsMeta(),
    },
  }
}

export const __test = { normalizeFF, classify, describe, measureOf, parseNum, formatLike, mergeActuals, titleTokens, agreeingScale, expectsForecast }