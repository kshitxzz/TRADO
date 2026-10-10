// ─────────────────────────────────────────────────────────────────────────
// U.S. Treasury note / bond auction results for the Economic Calendar, straight from the
// Treasury's own public API (TreasuryDirect — free, no key).
//
// Forex Factory shows an auction as "yield | bid-to-cover" (e.g. "4.83|2.7"). The actual is the
// auction's high yield and bid-to-cover ratio in that exact format.
//
// ACCURACY RULES: matched by tenor + the auction's US-Eastern date; and the PREVIOUS auction of the
// same tenor in the Treasury data must reproduce Forex Factory's "previous" figure (yield exactly,
// bid-to-cover within 0.1) — otherwise the actual stays blank. Reopenings (e.g. a "9-Year 11-Month"
// note sold as the 10-year) are matched by rounding the term to the nearest whole year.
// Not covered: bills, TIPS and floating-rate notes.
// ─────────────────────────────────────────────────────────────────────────
import { roundHalfAway } from './calendarNumbers.js'
import { etDay } from './fedActuals.js'

const UA = 'Mozilla/5.0 (compatible; TradoCalendarBot/1.0)'
const BASE = 'https://www.treasurydirect.gov/TA_WS/securities/auctioned'
export const SOURCE = 'U.S. Treasury (TreasuryDirect)'

const status = { calls: 0, lastOk: 0, lastError: null }
export const treasuryStatus = () => ({ enabled: true, name: SOURCE, calls: status.calls, lastOk: status.lastOk || null, lastError: status.lastError })

const YEARS = [2, 3, 5, 7, 10, 20, 30]
// FF calls the 10-year a "Bond Auction" even though Treasury sells it as a Note — the type comes from the tenor.
export function auctionSpecFor(ev) {
  if (!ev || ev.currency !== 'USD' || typeof ev.title !== 'string') return null
  const m = /^(\d+)-y (?:bond|note) auction$/i.exec(ev.title.trim())
  if (!m) return null
  const years = Number(m[1])
  return YEARS.includes(years) ? { years, type: years >= 20 ? 'Bond' : 'Note' } : null
}

export function termMonths(term) {
  const m = /^(\d+)-Year(?:\s+(\d+)-Month)?$/i.exec(String(term || '').trim())
  return m ? Number(m[1]) * 12 + Number(m[2] || 0) : null
}

// Number('') is 0, which would pass as a real yield — blanks and nulls must stay NaN.
const num = (v) => (v == null || String(v).trim() === '' ? NaN : Number(v))

export function normalizeRows(json) {
  const out = []
  for (const r of Array.isArray(json) ? json : []) {
    const y = num(r.highYield), b = num(r.bidToCoverRatio)
    const months = termMonths(r.securityTerm)
    const date = String(r.auctionDate || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || months == null || !Number.isFinite(y) || !Number.isFinite(b) || r.securityType == null) continue
    out.push({ date, type: String(r.securityType), months, y, b })
  }
  return out
}

const cmp2 = (n) => roundHalfAway(n, 2)
const cmp1 = (n) => roundHalfAway(n, 1)

// Returns "4.83|2.7" (FF's own format) or null.
export function evaluateAuction(ev, spec, rows) {
  const day = etDay(ev.time)
  const same = rows.filter(r => r.type === spec.type && Math.round(r.months / 12) === spec.years).sort((a, b) => b.date.localeCompare(a.date))
  const cur = same.find(r => r.date === day)
  const prior = same.find(r => r.date < day)
  const pv = /^(\d+(?:\.\d+)?)\s*%?\s*\|\s*(\d+(?:\.\d+)?)$/.exec(String(ev.previous ?? '').trim())
  if (!cur || !prior || !pv) return null
  if (Math.abs(cmp2(prior.y) - Number(pv[1])) > 1e-9 || Math.abs(cmp1(prior.b) - Number(pv[2])) > 0.1 + 1e-9) return null
  return `${cmp2(cur.y).toFixed(2)}|${cmp1(cur.b).toFixed(1)}`
}

async function fetchRows(type) {
  status.calls++
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(`${BASE}?format=json&type=${type}&days=75`, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e }
    const text = await res.text()
    if (text.length > 4_000_000) throw new Error('Response too large')
    return normalizeRows(JSON.parse(text))
  } finally {
    clearTimeout(timer)
  }
}

// `events` should already be limited to released-and-still-blank ones.
export async function fetchAuctionActuals(events, now = Date.now()) {
  const todo = events.map(ev => ({ ev, spec: auctionSpecFor(ev) })).filter(x => x.spec)
  const updates = []
  for (const type of [...new Set(todo.map(x => x.spec.type))]) {
    let rows
    try {
      rows = await fetchRows(type)
      status.lastOk = now; status.lastError = null
    } catch (err) {
      status.lastError = `Treasury: ${err.status ? `HTTP ${err.status}` : err.name === 'AbortError' ? 'timeout' : err.message}`
      continue
    }
    for (const { ev, spec } of todo) {
      if (spec.type !== type) continue
      const text = evaluateAuction(ev, spec, rows)
      if (text) updates.push({ ev, text, source: SOURCE })
    }
  }
  return { updates }
}