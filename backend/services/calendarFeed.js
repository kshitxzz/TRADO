// ─────────────────────────────────────────────────────────────────────────
// MT5 economic-calendar feed (Phase 2).
//
// One designated terminal running TradoSync with InpPushCalendar = true pushes the actual values
// of MetaQuotes' built-in MT5 calendar to POST /api/calendar/feed. This module stores them (in
// memory — the EA re-sends the last 24 h every 20 min, so a restart heals itself) and fills
// blank "actual" cells on the Forex Factory schedule. It is what covers the releases that have no
// free public API: ISM / S&P Global PMIs, UoM sentiment, ADP, RCM/TIPP, non-USD data, and more.
//
// ACCURACY RULES (a blank beats a wrong number):
//   • Only blank, already-released events are filled — official sources always win.
//   • An MT5 value is matched to an FF event only when ALL of these hold:
//       – same currency and release time within 2 minutes;
//       – the MT5 "previous" (or revised previous) reproduces FF's "previous" at FF's own
//         displayed precision — this also reveals the unit scale (142 vs 142K);
//       – the titles look alike, OR (names differ — MetaQuotes words things differently) the
//         numbers fit exactly one FF event at that time and no other.
//     Ambiguous → blank.
//   • The result is written in FF's own style ("151K", "0.3%") and must be a plausible size
//     next to FF's forecast / previous.
// ─────────────────────────────────────────────────────────────────────────
import { SCALE, parseNum, formatLike, near, roundHalfAway } from './calendarNumbers.js'
import { titleTokens, jaccard, CANDIDATE_SCALES } from './calendarMatch.js'

export const SOURCE = 'MetaTrader 5 economic calendar (MetaQuotes)'
const KEEP_MS = 9 * 86_400_000         // the EA back-fills 8 days after every start / server restart
const MAX_ROWS = 5000
const MAX_PER_PUSH = 400
const TIME_TOL_MS = 2 * 60_000
const WIDE_TOL_MS = 10 * 60_000          // allowed when the titles clearly agree (sources round release times differently)
const SUSPECT_TOL_MS = 3 * 3600_000

const store = new Map()                  // key → row
const stats = { lastPushAt: 0, pushes: 0, accepted: 0, rejected: 0, matched: 0, offsetHint: null, lastReject: null, unmatched: [] }

// Users (Supabase user ids) whose TradoSync terminal may feed the calendar. Empty → feature off.
export function feederIds() {
  return new Set(String(process.env.CALENDAR_FEEDER_USER_IDS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean))
}

export function resetFeed() {
  store.clear()
  Object.assign(stats, { lastPushAt: 0, pushes: 0, accepted: 0, rejected: 0, matched: 0, offsetHint: null, lastReject: null, unmatched: [] })
}

// ── Ingest ───────────────────────────────────────────────────────────────
const fin = (x) => {
  if (x == null || x === '' || typeof x === 'boolean') return null
  const n = Number(x)
  return Number.isFinite(n) && Math.abs(n) < 1e15 ? n : null
}

function sanitizeRow(v, now) {
  if (!v || typeof v !== 'object') return null
  const currency = String(v.cur || '').toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) return null
  const t = fin(v.t)
  if (t == null) return null
  const time = Math.round(t) * 1000
  if (time < now - KEEP_MS || time > now + 15 * 60_000) return null
  const actual = fin(v.a)
  if (actual == null) return null
  const name = String(v.name || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 160)
  if (!name) return null
  const id = String(v.id ?? '').replace(/[^0-9a-zA-Z_-]/g, '').slice(0, 40)
  return {
    key: id ? `id:${id}` : `n:${currency}|${time}|${name}`,
    time, currency, name, tokens: titleTokens(name),
    actual, previous: fin(v.p), revised: fin(v.rp), forecast: fin(v.f),
    mult: [0, 1, 2, 3, 4].includes(Number(v.m)) ? Number(v.m) : null,      // MT5 multiplier: 0 none, 1 K, 2 M, 3 B, 4 T
    used: false,
  }
}

export function ingest(values, now = Date.now()) {
  const list = Array.isArray(values) ? values.slice(0, MAX_PER_PUSH) : []
  let accepted = 0, rejected = 0
  for (const v of list) {
    const row = sanitizeRow(v, now)
    if (row) { store.set(row.key, row); accepted++ } else rejected++
  }
  for (const [k, r] of store) if (now - r.time > KEEP_MS) store.delete(k)
  if (store.size > MAX_ROWS) {
    const oldest = [...store.entries()].sort((a, b) => a[1].time - b[1].time).slice(0, store.size - MAX_ROWS)
    for (const [k] of oldest) store.delete(k)
  }
  stats.lastPushAt = now; stats.pushes++; stats.accepted += accepted; stats.rejected += rejected
  if (rejected) stats.lastReject = `${rejected} of ${list.length} values were rejected (bad format or time)`
  return { accepted, rejected }
}

export function feedStatus() {
  return { enabled: feederIds().size > 0, lastPushAt: stats.lastPushAt || null, pushes: stats.pushes, rows: store.size,
           matched: stats.matched, offsetHint: stats.offsetHint, lastReject: stats.lastReject }
}

// ── Matching ─────────────────────────────────────────────────────────────
const dom = (p) => (p.pct ? p.raw : p.value)
const unitOf = (p) => (p.suffix ? SCALE[p.suffix] : 1)

// Does v × s, shown at FF's precision, equal FF's figure p?
function reproduces(p, v, s) {
  if (v == null) return false
  const dec = Math.min(2, p.decimals)
  const shown = p.pct ? roundHalfAway(v * s, dec) : roundHalfAway((v * s) / unitOf(p), dec) * unitOf(p)
  return near(shown, dom(p))
}

// The multiplier that turns MT5's number into FF's unit, or null. FF's "previous" must be reproduced
// by MT5's previous (or revised previous). A previous of exactly 0 can't reveal the scale, so then
// FF's forecast has to reproduce MT5's forecast instead.
export function feedScale(ev, r) {
  const prev = parseNum(ev.previous)
  const fc = parseNum(ev.forecast)
  const anchor = prev ? { p: prev, vals: [r.previous, r.revised] } : fc ? { p: fc, vals: [r.forecast] } : null
  if (!anchor) return null
  const ok = CANDIDATE_SCALES.filter(s => anchor.vals.some(v => reproduces(anchor.p, v, s)))
  if (!ok.length) return null
  if (dom(anchor.p) !== 0) return ok[0]
  if (prev && fc && dom(fc) !== 0) {
    const byForecast = CANDIDATE_SCALES.find(s => reproduces(fc, r.forecast, s))
    if (byForecast != null) return byForecast
  }
  return null
}

function plausible(ev, text) {
  const t = parseNum(text)
  const anchors = [parseNum(ev.forecast), parseNum(ev.previous)].filter(Boolean)
  if (!t || !anchors.length) return false
  const floor = t.pct ? 1 : (t.suffix ? SCALE[t.suffix] : 1)
  const bound = Math.max(10 * Math.max(...anchors.map(a => Math.abs(dom(a)))), floor)
  return Math.abs(dom(t) - dom(anchors[0])) <= bound
}

// Why is each still-blank, already-released event not filled? (shown only with ?debug on the calendar page)
function diagnose(open, rows) {
  const out = []
  for (const ev of open.filter(e => e.actual == null).sort((a, b) => b.time - a.time)) {
    if (out.length >= 25) break
    const spec = anchorlessSpec(ev)
    if (spec) {
      const named = rows.filter(r => r.currency === ev.currency && spec.mt5.test(r.name))
      out.push({ event: ev.title, currency: ev.currency, at: new Date(ev.time).toISOString(), ffForecast: ev.forecast, ffPrevious: ev.previous,
                 why: named.length ? 'an MT5 value exists but its time/unit did not fit (see mt5Nearby)' : 'no MT5 value named like this (the MT5 calendar may not carry it)',
                 mt5Nearby: named.slice(0, 3).map(r => ({ name: r.name, at: new Date(r.time).toISOString(), actual: r.actual, multiplier: r.mult })) })
      continue
    }
    const near = rows.filter(r => r.currency === ev.currency && Math.abs(r.time - ev.time) <= WIDE_TOL_MS)
    let why
    if (!near.length) {
      const off = rows.find(r => r.currency === ev.currency && Math.abs(r.time - ev.time) <= SUSPECT_TOL_MS && feedScale(ev, r) != null && jaccard(titleTokens(ev.title), r.tokens) >= 0.34)
      why = off ? `MT5 has it ${Math.round((off.time - ev.time) / 60_000)} min away from FF's time (clock offset)` : 'no MT5 value at this time (not in the MT5 calendar, not published yet, or older than what the EA has sent)'
    } else if (!near.some(r => feedScale(ev, r) != null)) {
      why = "MT5's previous value does not reproduce FF's previous"
    } else {
      why = 'numbers fit but the title / ambiguity / size check refused it'
    }
    out.push({ event: ev.title, currency: ev.currency, at: new Date(ev.time).toISOString(), ffForecast: ev.forecast, ffPrevious: ev.previous, why,
               mt5Nearby: near.slice(0, 3).map(r => ({ name: r.name, actual: r.actual, previous: r.previous, revisedPrevious: r.revised, forecast: r.forecast })) })
  }
  return out
}

export const feedDebug = () => stats.unmatched

// Events Forex Factory lists WITHOUT any numbers (so there is nothing to cross-check) but whose figure the MT5
// calendar carries under a different name. Matched by name + time (±5 min) and only when exactly one MT5 row fits.
const ANCHORLESS = [
  { ff: /^api weekly statistical bulletin$/i, mt5: /^api\b.*\bcrude/i },     // API crude-oil stock change
]
const SUFFIX = ['', 'K', 'M', 'B', 'T']
function anchorlessText(r) {
  if (r.mult == null || r.mult < 1) return null                             // no unit information → don't guess
  const v = roundHalfAway(r.actual, 1)
  if (Math.abs(v) >= 1000) return null
  return `${v.toFixed(1)}${SUFFIX[r.mult]}`.replace(/^-(0\.0)/, '$1')
}
const anchorlessSpec = (ev) => (typeof ev.title === 'string' ? ANCHORLESS.find(a => a.ff.test(ev.title.trim())) : null)

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

export function mergeFeed(events, now = Date.now()) {
  const rows = [...store.values()].filter(r => now - r.time <= KEEP_MS)
  if (!rows.length) return 0
  for (const r of rows) r.used = false
  const open = events.filter(e => e.actual == null && e.impact !== 'holiday' && e.time <= now + 5 * 60_000 && (parseNum(e.previous) || parseNum(e.forecast)))
  let matched = 0

  for (const ev of open) {
    const evTokens = titleTokens(ev.title)
    const cands = []
    for (const r of rows) {
      if (r.used || r.currency !== ev.currency) continue
      const dt = Math.abs(r.time - ev.time)
      if (dt > WIDE_TOL_MS) continue
      const scale = feedScale(ev, r)
      if (scale == null) continue
      const sim = jaccard(evTokens, r.tokens)
      if (dt > TIME_TOL_MS && sim < 0.34) continue                          // a few minutes apart needs a clear title match
      cands.push({ r, scale, sim })
    }
    if (!cands.length) continue
    cands.sort((a, b) => b.sim - a.sim)
    const top = cands[0]
    if (cands.length > 1 && (top.sim === cands[1].sim || top.sim < 0.34)) continue         // ambiguous → blank
    if (cands.length === 1 && top.sim < 0.2) {
      // Names look different. Accept only if this row's numbers fit no other FF event at that time.
      const rivals = events.filter(o => o !== ev && o.currency === ev.currency && Math.abs(o.time - ev.time) <= TIME_TOL_MS && feedScale(o, top.r) != null)
      if (rivals.length) continue
    }
    const sample = parseNum(ev.previous) ? ev.previous : ev.forecast
    const text = formatLike(sample, top.r.actual * top.scale)
    if (!text || !plausible(ev, text)) continue
    ev.actual = text
    ev.actualSource = SOURCE
    top.r.used = true
    matched++
  }

  // Number-less events (API bulletin): by name + time, unit from MT5's own multiplier.
  const anchorless = events.filter(e => e.actual == null && e.impact !== 'holiday' && e.time <= now + 5 * 60_000 && anchorlessSpec(e))
  for (const ev of anchorless) {
    const spec = anchorlessSpec(ev)
    const c = rows.filter(r => !r.used && r.currency === ev.currency && Math.abs(r.time - ev.time) <= 5 * 60_000 && spec.mt5.test(r.name))
    const text = c.length === 1 ? anchorlessText(c[0]) : null
    if (!text) continue
    ev.actual = text
    ev.actualSource = SOURCE
    c[0].used = true
    matched++
  }

  // Diagnostics: rows that fit an FF event perfectly except for the clock → the EA's time offset is off.
  const deltas = []
  for (const r of rows) {
    if (r.used) continue
    for (const ev of open) {
      if (ev.actual != null || ev.currency !== r.currency) continue
      const dt = r.time - ev.time
      if (Math.abs(dt) <= TIME_TOL_MS || Math.abs(dt) > SUSPECT_TOL_MS) continue
      if (feedScale(ev, r) == null || jaccard(titleTokens(ev.title), r.tokens) < 0.34) continue
      deltas.push(Math.round(dt / 60_000))
      break
    }
  }
  stats.offsetHint = deltas.length ? { count: deltas.length, minutes: median(deltas) } : null
  stats.unmatched = diagnose([...open, ...anchorless], rows)
  stats.matched += matched
  return matched
}