// ─────────────────────────────────────────────────────────────────────────
// Official-source ACTUALS for the Economic Calendar (US releases).
//
// Forex Factory publishes the schedule, forecast and previous but never the
// actual. For US releases the actual can be read straight from the agency that
// publishes it, for free:
//   • BLS  — U.S. Bureau of Labor Statistics   (jobs, unemployment, CPI, PPI)
//   • FRED — St. Louis Fed                      (claims, retail sales, trade, PCE, GDP …)
//   • EIA  — U.S. Energy Information Admin.     (crude oil inventories, natural gas storage)
//
// ACCURACY RULES (same spirit as calendar.js — a blank beats a wrong number):
//   1. An event is only filled when its title matches an explicit mapping below.
//   2. The observation used must be for the reference period this release is
//      expected to cover (e.g. a CPI released in October covers September). If
//      the agency has not published that period yet, nothing is shown — this is
//      what stops last month's number appearing as "actual" before the release.
//   3. Headline figures (m/m %, y/y %, change in payrolls …) are computed from
//      the published series and rounded the way the agencies round them.
//   4. Cross-check against Forex Factory's own numbers:
//        check 'previous' → the same calculation for the PRIOR period must equal
//                           FF's "previous" exactly, otherwise the series/units
//                           are not what we think and the actual stays blank.
//        check 'loose'    → for series whose prior value is routinely revised
//                           (payrolls, retail sales …) the actual must be within
//                           a wide scale-sanity band of FF's forecast/previous.
//   5. Output is formatted exactly like FF's forecast/previous ("150K", "0.3%").
//
// API keys are read from the environment at call time and never logged or sent
// to the browser.
// ─────────────────────────────────────────────────────────────────────────
import { SCALE, parseNum, formatLike, near, roundHalfAway } from './calendarNumbers.js'

const UA = 'Mozilla/5.0 (compatible; TradoCalendarBot/1.0)'
const BLS_URL  = 'https://api.bls.gov/publicAPI/v2/timeseries/data/'
const FRED_URL = 'https://api.stlouisfed.org/fred/series/observations'
const EIA_URL  = 'https://api.eia.gov/v2'

const ENV = { bls: 'BLS_API_KEY', fred: 'FRED_API_KEY', eia: 'EIA_API_KEY' }
export const LABEL = {
  bls: 'U.S. Bureau of Labor Statistics',
  fred: 'FRED (St. Louis Fed)',
  eia: 'U.S. Energy Information Administration',
}
const BLS_DAILY_CAP = 450          // BLS allows 500 queries/day on a free v2 key — keep headroom

const mkStatus = () => ({ calls: 0, day: '', lastOk: 0, lastError: null, pausedUntil: 0, seriesErrors: 0, lastSeriesError: null })
const status = { bls: mkStatus(), fred: mkStatus(), eia: mkStatus() }

const keyOf = (p) => (process.env[ENV[p]] || '').trim()
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10)

export const providerEnabled = (p) => !!keyOf(p)
export const officialEnabled = () => Object.keys(ENV).some(providerEnabled)

function usable(p, now) {
  if (!providerEnabled(p)) return false
  const s = status[p]
  if (now < s.pausedUntil) return false
  if (s.day !== dayOf(now)) { s.day = dayOf(now); s.calls = 0 }
  if (p === 'bls' && s.calls >= BLS_DAILY_CAP) return false
  return true
}

// Safe-to-expose summary for /api/calendar/status (no keys).
export function officialStatus(now = Date.now()) {
  const providers = {}
  for (const p of Object.keys(ENV)) {
    const s = status[p]
    providers[p] = {
      name: LABEL[p], enabled: providerEnabled(p), callsToday: s.day === dayOf(now) ? s.calls : 0,
      lastOk: s.lastOk || null, lastError: s.lastError, pausedUntil: s.pausedUntil > now ? s.pausedUntil : null,
      seriesErrors: s.seriesErrors, lastSeriesError: s.lastSeriesError,
    }
  }
  const firstError = Object.values(providers).find(p => p.enabled && p.lastError)?.lastError || null
  return { enabled: officialEnabled(), providers, lastError: firstError, mappedEvents: SPECS.length }
}

// ── HTTP ─────────────────────────────────────────────────────────────────
async function httpJson(url, { method = 'GET', body, timeoutMs = 10_000 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method, signal: ctrl.signal, redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (text.length > 5_000_000) throw new Error('Response too large')
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`)
      err.status = res.status
      try { const j = JSON.parse(text); err.detail = String(j.error_message || j.error || j.message || '').slice(0, 200) } catch { /* not JSON */ }
      throw err
    }
    try { return JSON.parse(text) } catch { throw new Error('Not JSON') }
  } finally {
    clearTimeout(timer)
  }
}

// ── Providers — each returns rows [{ k: periodKey, v: number }] ──────────
// BLS keys are 'YYYY-MM'; FRED/EIA keys are the observation date as published.
async function fetchBls(ids, now) {
  status.bls.calls++
  const y = new Date(now).getUTCFullYear()
  const json = await httpJson(BLS_URL, {
    method: 'POST',
    body: { seriesid: ids, startyear: String(y - 2), endyear: String(y), registrationkey: keyOf('bls') },
  })
  if (json?.status !== 'REQUEST_SUCCEEDED') {
    const msg = Array.isArray(json?.message) ? json.message.join(' ') : String(json?.status || 'no status')
    const err = new Error(msg.slice(0, 160))
    if (/threshold|limit|exceed/i.test(msg)) err.quota = true
    else if (/\bkey\b/i.test(msg)) err.badKey = true
    throw err
  }
  const out = new Map()
  for (const ser of json.Results?.series || []) {
    const rows = []
    for (const d of ser.data || []) {
      const m = /^M(0[1-9]|1[0-2])$/.exec(d.period || '')           // skip M13 (annual average)
      const v = Number(d.value)
      if (!m || !Number.isFinite(v)) continue                       // "-" = value not available
      rows.push({ k: `${d.year}-${m[1]}`, v })
    }
    out.set(ser.seriesID, rows)
  }
  return out
}

async function fetchFred(id) {
  status.fred.calls++
  const q = new URLSearchParams({ series_id: id, api_key: keyOf('fred'), file_type: 'json', sort_order: 'desc', limit: '30' })
  try {
    const json = await httpJson(`${FRED_URL}?${q}`)
    return (json?.observations || []).map(o => ({ k: String(o.date), v: Number(o.value) })).filter(r => Number.isFinite(r.v))   // "." → NaN → dropped
  } catch (err) {
    if (err.status === 400) { if (/api_key/i.test(err.detail || '')) err.badKey = true; else err.seriesError = true }
    throw err
  }
}

async function fetchEia(route, id) {
  status.eia.calls++
  const q = new URLSearchParams({ api_key: keyOf('eia'), frequency: 'weekly' })
  q.append('data[0]', 'value')
  q.append('facets[series][]', id)
  q.append('sort[0][column]', 'period')
  q.append('sort[0][direction]', 'desc')
  q.append('length', '8')
  try {
    const json = await httpJson(`${EIA_URL}/${route}/data/?${q}`)
    return (json?.response?.data || []).map(o => ({ k: String(o.period), v: Number(o.value) })).filter(r => Number.isFinite(r.v))
  } catch (err) {
    if (err.status === 403) err.badKey = true
    else if (err.status === 400) err.seriesError = true
    throw err
  }
}

function noteOk(p, now) { status[p].lastOk = now; status[p].lastError = null }
function noteFail(p, err, now) {
  const s = status[p]
  if (err.seriesError) { s.seriesErrors++; s.lastSeriesError = `${err.detail || err.message}`.slice(0, 120); return }   // one bad series ≠ provider down
  s.lastError = `${p.toUpperCase()}: ${err.status ? `HTTP ${err.status}` : err.name === 'AbortError' ? 'timeout' : err.message}`
  if (err.badKey || [401, 403].includes(err.status)) s.pausedUntil = now + 60 * 60_000
  else if (err.quota) s.pausedUntil = now + 6 * 60 * 60_000
  else if (err.status === 429) s.pausedUntil = now + 10 * 60_000
}

const srcKey = (s) => `${s.p}|${s.route || ''}|${s.id}`

// Fetch every distinct source once. Result: Map(srcKey → rows[] | Error).
async function fetchMany(srcs, now) {
  const uniq = new Map()
  for (const s of srcs) uniq.set(srcKey(s), s)
  const out = new Map()
  const tasks = []
  const bls = [...uniq.values()].filter(s => s.p === 'bls')
  if (bls.length) {
    tasks.push((async () => {
      try {
        const m = await fetchBls(bls.map(s => s.id), now)
        noteOk('bls', now)
        for (const s of bls) out.set(srcKey(s), m.get(s.id) || new Error('series not returned'))
      } catch (err) {
        noteFail('bls', err, now)
        for (const s of bls) out.set(srcKey(s), err)
      }
    })())
  }
  for (const s of uniq.values()) {
    if (s.p === 'bls') continue
    tasks.push((async () => {
      try {
        const rows = s.p === 'fred' ? await fetchFred(s.id) : await fetchEia(s.route, s.id)
        noteOk(s.p, now)
        out.set(srcKey(s), rows)
      } catch (err) {
        noteFail(s.p, err, now)
        out.set(srcKey(s), err)
      }
    })())
  }
  await Promise.all(tasks)
  return out
}

// ── Mapping: Forex Factory USD event → official series + calculation ─────
//  per   : which reference period the release covers, relative to the release date
//            M1 = previous month · M2 = two months back · Q1 = previous quarter
//            SAT / FRI = the most recent Saturday / Friday before the release (weekly data)
//  calc  : level | diff (latest − prior) | pct1 (% change vs prior period) | pct12 (% change vs 12 months ago)
//  unit  : multiplier that turns the calculated number into base units (for K / M / B formatting)
//  fmt   : 'pct' → FF shows "0.3%"; 'sfx' → FF shows "150K", "-2.1M", "-100.8B"
//  check : see header (rule 4)
const bls  = (id) => ({ p: 'bls', id })
const fred = (id) => ({ p: 'fred', id })
const eia  = (route, id) => ({ p: 'eia', route, id })

export const SPECS = [
  { name: 'Non-Farm Employment Change', re: /^non-?farm employment change$/i, per: 'M1', calc: 'diff',  unit: 1e3, fmt: 'sfx', check: 'loose',    src: [bls('CES0000000001'), fred('PAYEMS')] },
  { name: 'Unemployment Rate',          re: /^unemployment rate$/i,           per: 'M1', calc: 'level', unit: 1,   fmt: 'pct', check: 'previous', src: [bls('LNS14000000'), fred('UNRATE')] },
  { name: 'Average Hourly Earnings m/m',re: /^average hourly earnings m\/m$/i,per: 'M1', calc: 'pct1',  unit: 1,   fmt: 'pct', check: 'loose',    src: [bls('CES0500000003'), fred('CES0500000003')] },
  { name: 'CPI m/m',                    re: /^cpi m\/m$/i,                    per: 'M1', calc: 'pct1',  unit: 1,   fmt: 'pct', check: 'previous', src: [bls('CUSR0000SA0'), fred('CPIAUCSL')] },
  { name: 'CPI y/y',                    re: /^cpi y\/y$/i,                    per: 'M1', calc: 'pct12', unit: 1,   fmt: 'pct', check: 'previous', src: [bls('CUUR0000SA0'), fred('CPIAUCNS')] },
  { name: 'Core CPI m/m',               re: /^core cpi m\/m$/i,               per: 'M1', calc: 'pct1',  unit: 1,   fmt: 'pct', check: 'previous', src: [bls('CUSR0000SA0L1E'), fred('CPILFESL')] },
  { name: 'PPI m/m',                    re: /^ppi m\/m$/i,                    per: 'M1', calc: 'pct1',  unit: 1,   fmt: 'pct', check: 'loose',    src: [bls('WPSFD4'), fred('PPIFIS')] },
  { name: 'Core PPI m/m',               re: /^core ppi m\/m$/i,               per: 'M1', calc: 'pct1',  unit: 1,   fmt: 'pct', check: 'loose',    src: [fred('PPIFES')] },
  { name: 'Unemployment Claims',        re: /^unemployment claims$/i,         per: 'SAT',calc: 'level', unit: 1,   fmt: 'sfx', check: 'loose',    src: [fred('ICSA')] },
  { name: 'Retail Sales m/m',           re: /^retail sales m\/m$/i,           per: 'M1', calc: 'pct1',  unit: 1,   fmt: 'pct', check: 'loose',    src: [fred('RSAFS')] },
  { name: 'Trade Balance',              re: /^trade balance$/i,               per: 'M2', calc: 'level', unit: 1e6, fmt: 'sfx', check: 'loose',    src: [fred('BOPGSTB')] },
  { name: 'Core PCE Price Index m/m',   re: /^core pce price index m\/m$/i,   per: 'M1', calc: 'pct1',  unit: 1,   fmt: 'pct', check: 'loose',    src: [fred('PCEPILFE')] },
  // Only the ADVANCE estimate: the Second/Third estimates revise the same quarter in place, so a
  // stale advance value could be mistaken for the new one. Those two are deliberately not mapped.
  { name: 'Consumer Credit m/m',         re: /^consumer credit m\/m$/i,         per: 'M2', calc: 'diff',  unit: 1e9, unitAlt: [1e6], fmt: 'sfx', check: 'loose', src: [fred('TOTALSL')] },
  { name: 'Industrial Production m/m',   re: /^industrial production m\/m$/i,   per: 'M1', calc: 'pct1',  unit: 1,   fmt: 'pct', check: 'loose',    src: [fred('INDPRO')] },
  { name: 'Housing Starts',              re: /^housing starts$/i,               per: 'M1', calc: 'level', unit: 1e3, fmt: 'sfx', check: 'loose',    src: [fred('HOUST')] },
  { name: 'Building Permits',            re: /^building permits$/i,             per: 'M1', calc: 'level', unit: 1e3, fmt: 'sfx', check: 'loose',    src: [fred('PERMIT')] },
  { name: 'JOLTS Job Openings',          re: /^jolts job openings$/i,           per: 'M2', calc: 'level', unit: 1e3, fmt: 'sfx', check: 'loose',    src: [bls('JTS000000000000000JOL'), fred('JTSJOL')] },
  { name: 'Advance GDP q/q',            re: /^advance gdp q\/q$/i,            per: 'Q1', calc: 'level', unit: 1,   fmt: 'pct', check: 'loose',    src: [fred('A191RL1Q225SBEA')] },
  { name: 'Crude Oil Inventories',      re: /^crude oil inventories$/i,       per: 'FRI',calc: 'diff',  unit: 1e3, fmt: 'sfx', check: 'previous', src: [eia('petroleum/stoc/wstk', 'WCESTUS1')] },
  { name: 'Natural Gas Storage',        re: /^natural gas storage$/i,         per: 'FRI',calc: 'diff',  unit: 1e9, fmt: 'sfx', check: 'previous', src: [eia('natural-gas/stor/wkly', 'NW2_EPG0_SWO_R48_BCF')] },
]

export function specFor(ev) {
  if (!ev || ev.currency !== 'USD' || typeof ev.title !== 'string') return null
  const t = ev.title.trim()
  return SPECS.find(s => s.re.test(t)) || null
}

// ── Period arithmetic (all UTC — US releases land mid-day UTC, so the UTC date is the US date) ──
const pad = (n) => String(n).padStart(2, '0')
function monthKey(y, m0) { const d = new Date(Date.UTC(y, m0, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}` }
function shiftMonth(key, n) { const [y, m] = key.split('-').map(Number); return monthKey(y, m - 1 + n) }
function shiftDay(key, n) { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const isMonthly = (per) => per === 'M1' || per === 'M2' || per === 'Q1'

export function expectedPeriod(per, evTime) {
  const d = new Date(evTime)
  const y = d.getUTCFullYear(), m = d.getUTCMonth()
  if (per === 'M1') return monthKey(y, m - 1)
  if (per === 'M2') return monthKey(y, m - 2)
  if (per === 'Q1') return monthKey(y, Math.floor(m / 3) * 3 - 3)           // first month of the previous quarter
  const target = per === 'SAT' ? 6 : 5                                       // weekly data is dated by week-ending day
  const day = new Date(Date.UTC(y, m, d.getUTCDate()))
  let back = (day.getUTCDay() - target + 7) % 7
  if (back === 0) back = 7
  day.setUTCDate(day.getUTCDate() - back)
  return day.toISOString().slice(0, 10)
}

const stepKey = (per, key, n) => isMonthly(per) ? shiftMonth(key, n * (per === 'Q1' ? 3 : 1)) : shiftDay(key, 7 * n)

function toMap(spec, rows) {
  const map = new Map()
  for (const r of rows) if (Number.isFinite(r.v)) map.set(isMonthly(spec.per) ? r.k.slice(0, 7) : r.k, r.v)
  return map
}

function calcAt(spec, map, key) {
  const cur = map.get(key)
  if (cur == null) return null
  if (spec.calc === 'level') return cur
  const prior = map.get(spec.calc === 'pct12' ? shiftMonth(key, -12) : stepKey(spec.per, key, -1))
  if (prior == null) return null
  if (spec.calc === 'diff') return cur - prior
  return prior === 0 ? null : (cur / prior - 1) * 100                         // pct1 / pct12
}

// Returns the formatted actual (e.g. "0.3%", "150K") or null when anything is doubtful.
export function evaluate(spec, ev, rows) {
  // Some series' units are easy to misremember (FRED reports consumer credit in billions or millions depending on
  // the series). Try the expected unit first, then any alternatives; the size check against FF picks the right one.
  for (const unit of [spec.unit, ...(spec.unitAlt || [])]) {
    const text = evaluateWithUnit(spec, unit, ev, rows)
    if (text) return text
  }
  return null
}

function evaluateWithUnit(spec, unit, ev, rows) {
  const map = toMap(spec, rows)
  const key = expectedPeriod(spec.per, ev.time)

  const sampleStr = parseNum(ev.previous) ? ev.previous : (parseNum(ev.forecast) ? ev.forecast : null)
  const sp = sampleStr ? parseNum(sampleStr) : null
  if (!sp || sp.pct !== (spec.fmt === 'pct')) return null                    // FF formats it differently than expected
  if (spec.fmt === 'sfx' && !sp.suffix) return null

  const dec = Math.min(2, sp.decimals)
  const val = (k) => {
    const raw = calcAt(spec, map, k)
    if (raw == null) return null
    return spec.fmt === 'pct' ? roundHalfAway(raw, dec) : raw * unit
  }
  const textOf = (n) => { const t = formatLike(sampleStr, n); return t ? t.replace(/^-(0(?:\.0+)?)(?=[KMBT%]|$)/, '$1') : null }
  const dom = (p) => (p.pct ? p.raw : p.value)

  const act = val(key)                                                       // null until the agency has published this period
  if (act == null) return null
  const text = textOf(act)
  if (!text) return null

  if (spec.check === 'previous') {
    const pv = parseNum(ev.previous)
    const prev = val(stepKey(spec.per, key, -1))
    const pt = prev == null ? null : parseNum(textOf(prev))
    if (!pv || !pt || !near(dom(pt), dom(pv))) return null
  } else {
    const anchors = [parseNum(ev.forecast), parseNum(ev.previous)].filter(Boolean).map(dom)
    if (!anchors.length) return null
    const floor = sp.pct ? 1 : (sp.suffix ? SCALE[sp.suffix] : 1)
    const bound = Math.max(10 * Math.max(...anchors.map(Math.abs)), floor)
    if (Math.abs(dom(parseNum(text)) - anchors[0]) > bound) return null
  }
  return text
}

// ── Orchestration ────────────────────────────────────────────────────────
// `events` should already be limited to released-and-still-blank ones.
// Sources are tried in order (BLS first, FRED as fallback) and only for events still unresolved.
export async function fetchOfficialActuals(events, now = Date.now()) {
  const updates = []
  let pending = []
  for (const ev of events) { const spec = specFor(ev); if (spec) pending.push({ ev, spec }) }
  const depth = Math.max(0, ...pending.map(x => x.spec.src.length))
  for (let i = 0; i < depth && pending.length; i++) {
    const want = pending.filter(x => x.spec.src[i] && usable(x.spec.src[i].p, now))
    if (!want.length) continue
    const rows = await fetchMany(want.map(x => x.spec.src[i]), now)
    const done = new Set()
    for (const x of want) {
      const r = rows.get(srcKey(x.spec.src[i]))
      if (!Array.isArray(r)) continue
      const text = evaluate(x.spec, x.ev, r)
      if (text) { updates.push({ ev: x.ev, text, source: LABEL[x.spec.src[i].p] }); done.add(x) }
    }
    pending = pending.filter(x => !done.has(x))
  }
  return { updates }
}

// Dry run for /api/calendar/actuals-check: reads the latest observation of every mapped
// series so keys, series IDs and reachability can be verified without waiting for a release.
export async function probeOfficial(now = Date.now()) {
  const reqs = []
  for (const spec of SPECS) for (const src of spec.src) reqs.push({ spec, src, ok: usable(src.p, now) })
  const rows = await fetchMany(reqs.filter(r => r.ok).map(r => r.src), now)
  const items = reqs.map(({ spec, src, ok }) => {
    const base = { event: spec.name, provider: src.p, series: src.id }
    if (!ok) return { ...base, ok: false, error: providerEnabled(src.p) ? 'provider paused or daily limit reached' : 'no API key configured' }
    const r = rows.get(srcKey(src))
    if (!Array.isArray(r)) return { ...base, ok: false, error: String(r?.detail || r?.message || r).slice(0, 120) }
    const map = toMap(spec, r)
    const latest = [...map.keys()].sort().pop() || null
    const raw = latest ? calcAt(spec, map, latest) : null
    return { ...base, ok: raw != null, latestPeriod: latest, value: raw == null ? null : Math.round(raw * 1000) / 1000, calc: spec.calc }
  })
  return { at: now, items }
}

export const __test = { expectedPeriod, calcAt, toMap, roundHalfAway, stepKey }