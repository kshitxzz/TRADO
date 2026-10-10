import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { ingest, mergeFeed, feedScale, feedStatus, feedDebug, resetFeed } from '../services/calendarFeed.js'
import { createCalendarFeedRouter } from '../routes/calendarFeed.js'

const NOW = Date.now()
const MIN = 60_000
const ev = (title, forecast, previous, offsetMin = -10, currency = 'USD') =>
  ({ currency, title, time: NOW + offsetMin * MIN, impact: 'high', forecast, previous, actual: null })
const row = (name, a, p, offsetMin = -10, extra = {}) =>
  ({ id: `${name}`.replace(/\W/g, '').slice(0, 20) + offsetMin, cur: 'USD', name, t: Math.round((NOW + offsetMin * MIN) / 1000), a, p, rp: null, f: null, ...extra })

beforeEach(() => resetFeed())

test('ingest accepts good rows and rejects malformed or implausible ones', () => {
  const good = row('Unemployment Rate', 4.4, 4.3)
  const r = ingest([
    good,
    { ...good, id: 'x1', cur: 'usd1' },                         // bad currency
    { ...good, id: 'x2', a: 'abc' },                            // actual not numeric
    { ...good, id: 'x3', a: null },                             // no actual
    { ...good, id: 'x4', t: Math.round((NOW + 3600_000) / 1000) },   // future
    { ...good, id: 'x5', t: Math.round((NOW - 10 * 86_400_000) / 1000) }, // older than the 9-day retention
    { ...good, id: 'x6', name: '   ' },                         // no name
    'junk', null,
  ], NOW)
  assert.deepEqual(r, { accepted: 1, rejected: 8 })
  assert.equal(feedStatus().rows, 1)
})

test('scale detection: FF previous must be reproduced by MT5 previous at FF precision', () => {
  assert.equal(feedScale(ev('NFP', '150K', '22K'), { previous: 22, revised: null, forecast: 150 }), 1e3)
  assert.equal(feedScale(ev('CPI m/m', '0.3%', '0.2%'), { previous: 0.2, revised: null, forecast: null }), 1)
  assert.equal(feedScale(ev('CPI m/m', '0.3%', '0.3%'), { previous: 0.28, revised: null, forecast: null }), 1)    // FF shows 1 decimal
  assert.equal(feedScale(ev('NFP', '150K', '22K'), { previous: 25, revised: 22, forecast: null }), 1e3)            // revised previous also counts
  assert.equal(feedScale(ev('NFP', '150K', '22K'), { previous: 31, revised: null, forecast: null }), null)         // different figure → no match
  assert.equal(feedScale(ev('Rate', '0.0%', '0.0%'), { previous: 0, revised: null, forecast: null }), null)        // zero can't reveal the scale
  assert.equal(feedScale(ev('Housing', '1.31M', '1.29M'), { previous: 1290, revised: null, forecast: null }), 1e3)
})

test('different wording, unique numbers: "Nonfarm Payrolls" fills "Non-Farm Employment Change"', () => {
  const events = [ev('Non-Farm Employment Change', '150K', '22K'), ev('Unemployment Rate', '4.3%', '4.3%')]
  ingest([row('Nonfarm Payrolls', 151, 22), row('Unemployment Rate', 4.4, 4.3)], NOW)
  assert.equal(mergeFeed(events, NOW), 2)
  assert.equal(events[0].actual, '151K')
  assert.equal(events[1].actual, '4.4%')
  assert.match(events[0].actualSource, /MetaTrader 5/)
})

test('PMI wording differences ("ISM Non-Manufacturing PMI" vs "ISM Services PMI")', () => {
  const events = [ev('ISM Services PMI', '55.1', '55.4')]
  ingest([row('ISM Non-Manufacturing PMI', 54.8, 55.4)], NOW)
  assert.equal(mergeFeed(events, NOW), 1)
  assert.equal(events[0].actual, '54.8')
})

test('same previous at the same time: the closer title wins, a tie stays blank', () => {
  const events = [ev('CPI m/m', '0.3%', '0.3%'), ev('Core CPI m/m', '0.3%', '0.3%')]
  ingest([row('Core Inflation Rate MoM', 0.2, 0.3), row('Inflation Rate MoM', 0.4, 0.3)], NOW)
  assert.equal(mergeFeed(events, NOW), 2)
  assert.equal(events[0].actual, '0.4%')
  assert.equal(events[1].actual, '0.2%')
  // two unrelated names that fit both events equally → nothing is guessed
  resetFeed()
  const a = [ev('Alpha Index', '0.3%', '0.3%'), ev('Beta Index', '0.3%', '0.3%')]
  ingest([row('Gamma Reading', 0.5, 0.3)], NOW)
  assert.equal(mergeFeed(a, NOW), 0)
  assert.equal(a[0].actual, null)
})

test('never overwrites an existing actual, never fills a future event, never crosses currencies', () => {
  const events = [{ ...ev('Unemployment Rate', '4.3%', '4.3%'), actual: '4.2%' }, ev('Retail Sales m/m', '0.4%', '0.5%', +30), ev('Unemployment Rate', '4.3%', '4.3%', -10, 'CAD')]
  ingest([row('Unemployment Rate', 4.4, 4.3), row('Retail Sales MoM', 0.6, 0.5, +3)], NOW)
  assert.equal(mergeFeed(events, NOW), 0)
  assert.equal(events[0].actual, '4.2%')
  assert.equal(events[1].actual, null)
  assert.equal(events[2].actual, null)
})

test('an implausible value is refused', () => {
  const events = [ev('ISM Services PMI', '55.1', '55.4')]
  ingest([row('ISM Non-Manufacturing PMI', 5400, 55.4)], NOW)
  assert.equal(mergeFeed(events, NOW), 0)
})

test('a one-hour clock error is reported as an offset hint, not silently matched', () => {
  const events = [ev('Unemployment Rate', '4.3%', '4.3%', -70)]
  ingest([row('Unemployment Rate', 4.4, 4.3, -10)], NOW)              // the row's clock is 60 min later than FF's time
  assert.equal(mergeFeed(events, NOW), 0)
  assert.deepEqual(feedStatus().offsetHint, { count: 1, minutes: 60 })
})

// ── Route ────────────────────────────────────────────────────────────────
async function withServer(fn, env) {
  const old = process.env.CALENDAR_FEEDER_USER_IDS
  process.env.CALENDAR_FEEDER_USER_IDS = env
  const users = { 'good-token-1': 'AAAA-1111', 'other-token-1': 'BBBB-2222' }
  const app = express()
  app.use(express.json())
  app.use('/feed', createCalendarFeedRouter({ resolveUser: async (t) => users[t] || null }))
  const srv = app.listen(0)
  const url = `http://127.0.0.1:${srv.address().port}/feed`
  try { await fn((body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })) }
  finally { srv.close(); process.env.CALENDAR_FEEDER_USER_IDS = old }
}

test('route: feature off until a feeder is configured', async () => {
  await withServer(async (post) => { assert.equal((await post({ token: 'good-token-1', values: [] })).status, 503) }, '')
})

test('route: only an allow-listed user can feed the shared calendar', async () => {
  await withServer(async (post) => {
    const v = [row('Unemployment Rate', 4.4, 4.3)]
    assert.equal((await post({ token: 'nope', values: v })).status, 401)
    assert.equal((await post({ values: v })).status, 401)
    assert.equal((await post({ token: 'other-token-1', values: v })).status, 403)
    assert.equal(feedStatus().rows, 0)
    const ok = await post({ token: 'good-token-1', values: v })
    assert.equal(ok.status, 200)
    const okBody = await ok.json()
    assert.deepEqual({ accepted: okBody.accepted, rejected: okBody.rejected }, { accepted: 1, rejected: 0 })
    assert.match(okBody.boot, /^[0-9a-f]{12}$/)                       // restart id the EA uses to re-send history
    assert.equal((await post({ token: 'good-token-1', values: 'x' })).status, 400)
    assert.equal(feedStatus().rows, 1)
  }, 'aaaa-1111')                                                      // ids are compared case-insensitively
})

test('an 8-day-old release is kept so the EA\'s week back-fill can fill the whole week', () => {
  const events = [ev('ISM Services PMI', '55.1', '55.4', -7 * 1440)]
  ingest([row('ISM Non-Manufacturing PMI', 54.8, 55.4, -7 * 1440)], NOW)
  assert.equal(mergeFeed(events, NOW), 1)
  assert.equal(events[0].actual, '54.8')
})

test('debug explains each blank: no MT5 value / previous differs / clock offset', () => {
  const events = [
    ev('Prelim UoM Consumer Sentiment', '47.5', '47.8'),
    ev('Final Services PMI', '58.7', '58.7', -30),
    ev('RCM/TIPP Economic Optimism', '44.5', '45.6', -50),
  ]
  ingest([row('Michigan Consumer Sentiment', 48.1, 47.6), row('RCM/TIPP Economic Optimism Index', 46.0, 45.6, 10)], NOW)
  mergeFeed(events, NOW)
  const d = Object.fromEntries(feedDebug().map(x => [x.event, x.why]))
  assert.match(d['Prelim UoM Consumer Sentiment'], /previous value does not reproduce/)
  assert.match(d['Final Services PMI'], /no MT5 value at this time/)
  assert.match(d['RCM/TIPP Economic Optimism'], /60 min/)
})

test('number-less API bulletin is filled from the MT5 "API Crude Oil Stock Change" row, with MT5\'s own unit', () => {
  const events = [ev('API Weekly Statistical Bulletin', null, null, -10)]
  ingest([row('API Crude Oil Stock Change', -2.43, -1.1, -10, { m: 2 })], NOW)
  assert.equal(mergeFeed(events, NOW), 1)
  assert.equal(events[0].actual, '-2.4M')
})

test('API bulletin: no unit information, two candidate rows, or another event → stays blank', () => {
  let events = [ev('API Weekly Statistical Bulletin', null, null, -10)]
  ingest([row('API Crude Oil Stock Change', -2.43, -1.1, -10)], NOW)                  // no multiplier
  assert.equal(mergeFeed(events, NOW), 0)
  resetFeed()
  events = [ev('API Weekly Statistical Bulletin', null, null, -10)]
  ingest([row('API Crude Oil Stock Change', -2.43, null, -10, { m: 2, id: 'a' }), row('API Crude Oil Stock Change Cushing', 0.4, null, -10, { m: 2, id: 'b' })], NOW)
  assert.equal(mergeFeed(events, NOW), 0)
  resetFeed()
  events = [ev('API Weekly Statistical Bulletin', null, null, -10)]
  ingest([row('EIA Crude Oil Stocks Change', -3.2, null, -10, { m: 2 })], NOW)
  assert.equal(mergeFeed(events, NOW), 0)
  assert.match(feedDebug()[0].why, /no MT5 value named like this/)
})

test('a few minutes apart is fine when the titles clearly agree, not otherwise', () => {
  const same = [ev('ISM Services PMI', '55.1', '55.4', -20)]
  ingest([row('ISM Non-Manufacturing PMI', 54.8, 55.4, -14)], NOW)                     // 6 min later
  assert.equal(mergeFeed(same, NOW), 1)
  resetFeed()
  const differ = [ev('Non-Farm Employment Change', '150K', '22K', -20)]
  ingest([row('Employment Report', 151, 22, -14)], NOW)                                // 6 min later, unrelated name
  assert.equal(mergeFeed(differ, NOW), 0)
})
