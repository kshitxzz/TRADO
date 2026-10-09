// ─────────────────────────────────────────────────────────────────────────
// FOMC / Federal Reserve "actuals" for the Economic Calendar — straight from the
// Federal Reserve Board's own public feeds (federalreserve.gov, free, no key).
//
//   Federal Funds Rate        → the new target-range UPPER bound, read from the FOMC statement
//   FOMC Statement            → link to the statement
//   FOMC Meeting Minutes      → link to the minutes release
//   FOMC Economic Projections → link to the projections release
//   <Board member> Speaks     → link to the speech / testimony text once the Fed posts it
//
// ACCURACY RULES (same spirit as calendar.js):
//   • Nothing is summarised, interpreted or generated. A link points at the Fed's own page;
//     the rate is parsed from the statement text and sanity-checked against Forex Factory.
//   • Matching is by member surname + the same US-Eastern calendar day (speeches) or by
//     release time within 3 hours (statement / minutes / projections). Doubtful → blank.
//   • Only Board of Governors members publish on federalreserve.gov. Regional Reserve Bank
//     presidents (e.g. Schmid, Logan, Musalem …) publish on their own banks' sites, so their
//     rows stay blank. Appearances without a prepared text (panels, interviews) stay blank.
// ─────────────────────────────────────────────────────────────────────────
import * as cheerio from 'cheerio'
import { parseNum, formatLike } from './calendarNumbers.js'

const UA = 'Mozilla/5.0 (compatible; TradoCalendarBot/1.0)'
const HOST = 'www.federalreserve.gov'
const SPEECH_FEED = `https://${HOST}/feeds/speeches_and_testimony.xml`
const MONETARY_FEEDS = [`https://${HOST}/feeds/press_monetary.xml`, `https://${HOST}/feeds/press_all.xml`]
export const SOURCE = 'Federal Reserve Board'
const WINDOW_MS = 3 * 3600_000

const status = { calls: 0, lastOk: 0, lastError: null }
export function fedStatus() { return { enabled: true, name: SOURCE, calls: status.calls, lastOk: status.lastOk || null, lastError: status.lastError } }

// ── Which events does this module handle? ────────────────────────────────
export function fedKindOf(ev) {
  if (!ev || ev.currency !== 'USD' || typeof ev.title !== 'string') return null
  const t = ev.title.trim()
  if (/^federal funds rate$/i.test(t)) return { kind: 'rate' }
  if (/^fomc statement$/i.test(t)) return { kind: 'statement' }
  if (/^fomc meeting minutes$/i.test(t)) return { kind: 'minutes' }
  if (/^fomc economic projections$/i.test(t)) return { kind: 'projections' }
  const m = /^(?:fomc member|fed (?:chair|vice chair(?: for supervision)?|governor))\s+(.+?)\s+(?:speaks|testifies)$/i.exec(t)
  if (m) {
    const surname = m[1].trim().split(/\s+/).pop().toLowerCase().replace(/[^a-z]/g, '')
    if (surname) return { kind: 'speech', surname }
  }
  return null
}

// ── Feed parsing (RSS 2.0; items use CDATA for link/guid/pubDate) ────────
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' }
const decode = (s) => s.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
function tag(block, name) {
  const m = new RegExp(`<${name}\\b[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${name}>`, 'i').exec(block)
  return m ? decode((m[1] ?? m[2] ?? '').trim()) : ''
}
export function parseFeed(xml) {
  const out = []
  for (const block of String(xml || '').match(/<item\b[\s\S]*?<\/item>/gi) || []) {
    const link = tag(block, 'link')
    let url
    try { url = new URL(link) } catch { continue }
    if (url.protocol !== 'https:' || url.hostname !== HOST) continue          // only ever link to federalreserve.gov
    const time = Date.parse(tag(block, 'pubDate'))
    if (!Number.isFinite(time)) continue
    out.push({ title: tag(block, 'title'), link: url.href, desc: tag(block, 'description'), time })
  }
  return out
}

// US-Eastern calendar day ("2026-10-06") — Fed speech URLs and dates are Eastern.
const etFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
export const etDay = (ms) => etFmt.format(new Date(ms))

export function pickSpeech(ev, surname, items) {
  const day = etDay(ev.time)
  const c = items.filter(it =>
    /^\/newsevents\/(?:speech|testimony)\//.test(new URL(it.link).pathname) &&
    it.title.split(',')[0].trim().split(/\s+/).pop().toLowerCase().replace(/[^a-z]/g, '') === surname &&
    etDay(it.time) === day)
  if (!c.length) return null
  c.sort((a, b) => Math.abs(a.time - ev.time) - Math.abs(b.time - ev.time) || a.link.localeCompare(b.link))
  return c[0]
}

const MONETARY_TITLE = {
  statement: /issues FOMC statement/i,
  rate: /issues FOMC statement/i,
  minutes: /^Minutes of the Federal Open Market Committee/i,
  projections: /economic projections/i,
}
export function pickMonetary(ev, kind, items) {
  const re = MONETARY_TITLE[kind]
  const c = items.filter(it =>
    re.test(it.title) && /^\/(?:newsevents\/pressreleases|monetarypolicy)\//.test(new URL(it.link).pathname) &&
    Math.abs(it.time - ev.time) <= WINDOW_MS)
  if (!c.length) return null
  c.sort((a, b) => Math.abs(a.time - ev.time) - Math.abs(b.time - ev.time))
  return c[0]
}

// ── Rate from the FOMC statement text ────────────────────────────────────
// "…decided to raise the target range for the federal funds rate by 1/4 percentage point to 3-3/4 to 4 percent"
// "…decided to maintain the target range for the federal funds rate at 3-1/2 to 3-3/4 percent"
const TOK = String.raw`\d+(?:\.\d+)?(?:[- ]\d\/\d)?|\d\/\d|\d*[¼½¾]`
const UNI = { '¼': 0.25, '½': 0.5, '¾': 0.75 }
function toNum(tok) {
  const s = tok.trim()
  let m = /^(\d*)([¼½¾])$/.exec(s); if (m) return Number(m[1] || 0) + UNI[m[2]]
  m = /^(\d+)[- ](\d)\/(\d)$/.exec(s); if (m) return Number(m[1]) + Number(m[2]) / Number(m[3])
  m = /^(\d)\/(\d)$/.exec(s); if (m) return Number(m[1]) / Number(m[2])
  return /^\d+(?:\.\d+)?$/.test(s) ? Number(s) : NaN
}
export function parseRateUpper(text) {
  const t = String(text || '').replace(/\s+/g, ' ')
  const i = t.search(/target range for the federal funds rate/i)
  if (i < 0) return null
  const m = new RegExp(`\\b(?:at|to) (${TOK}) to (${TOK}) percent`, 'i').exec(t.slice(i, i + 400))
  if (!m) return null
  const lo = toNum(m[1]), hi = toNum(m[2])
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo || hi - lo > 0.5 + 1e-9 || hi > 20) return null   // the range is normally 0.25 wide
  return hi
}

// ── HTTP ─────────────────────────────────────────────────────────────────
async function fetchText(url, timeoutMs = 10_000) {
  status.calls++
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/xml,application/xml,text/html,*/*' } })
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e }
    const text = await res.text()
    if (text.length > 3_000_000) throw new Error('Response too large')
    return text
  } finally {
    clearTimeout(timer)
  }
}
const fail = (err) => { status.lastError = `Fed feed: ${err.status ? `HTTP ${err.status}` : err.name === 'AbortError' ? 'timeout' : err.message}` }

async function loadFeed(urls) {
  for (const u of urls) {
    try { const items = parseFeed(await fetchText(u)); status.lastOk = Date.now(); status.lastError = null; return items } catch (err) { fail(err) }
  }
  return []
}

const rateCache = new Map()                         // statement URL → { v, at }
async function rateFromStatement(url, now) {
  const hit = rateCache.get(url)
  if (hit && (hit.v != null || now - hit.at < 5 * 60_000)) return hit.v
  let v = null
  try {
    if (!/\/newsevents\/pressreleases\/monetary\d{8}[a-z]\.htm$/.test(new URL(url).pathname)) return null
    const $ = cheerio.load(await fetchText(url))
    $('script,style,nav,header,footer').remove()
    v = parseRateUpper($('body').text())
  } catch (err) { fail(err) }
  rateCache.set(url, { v, at: now })
  return v
}

function formatRate(ev, hi) {
  const prev = parseNum(ev.previous)
  if (prev && Math.abs(prev.raw - hi) > 1) return null           // far from FF's previous → something is off
  const sample = parseNum(ev.previous)?.pct ? ev.previous : (parseNum(ev.forecast)?.pct ? ev.forecast : null)
  return sample ? formatLike(sample, hi) : `${hi.toFixed(2)}%`
}

const LABEL = { statement: 'Statement', minutes: 'Minutes', projections: 'Projections', speech: 'Speech' }

// `events` should already be limited to released-and-still-blank ones.
export async function fetchFedActuals(events, now = Date.now()) {
  const todo = events.map(ev => ({ ev, k: fedKindOf(ev) })).filter(x => x.k)
  if (!todo.length) return { updates: [] }
  const [speeches, monetary] = await Promise.all([
    todo.some(x => x.k.kind === 'speech') ? loadFeed([SPEECH_FEED]) : [],
    todo.some(x => x.k.kind !== 'speech') ? loadFeed(MONETARY_FEEDS) : [],
  ])
  const updates = []
  for (const { ev, k } of todo) {
    if (k.kind === 'speech') {
      const it = pickSpeech(ev, k.surname, speeches)
      if (it) updates.push({ ev, text: LABEL.speech, source: SOURCE, url: it.link, note: it.title })
      continue
    }
    const it = pickMonetary(ev, k.kind, monetary)
    if (!it) continue
    if (k.kind === 'rate') {
      const hi = await rateFromStatement(it.link, now)
      const text = hi == null ? null : formatRate(ev, hi)
      if (text) updates.push({ ev, text, source: SOURCE, url: it.link, note: it.title })
    } else {
      updates.push({ ev, text: LABEL[k.kind], source: SOURCE, url: it.link, note: it.title })
    }
  }
  return { updates }
}

export const __test = { tag, decode, toNum }