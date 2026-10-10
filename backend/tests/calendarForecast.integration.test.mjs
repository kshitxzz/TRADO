// A forecast that Forex Factory publishes later must reach the journal within ~5 minutes (not 15),
// while a quiet calendar keeps the normal 15-minute cadence.
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.BLS_API_KEY = ''; process.env.FRED_API_KEY = ''; process.env.EIA_API_KEY = ''; process.env.FMP_API_KEY = ''
const { getCalendar } = await import('../services/calendar.js')

test('forecast-less data release due soon → schedule re-read every 5 minutes; forecast shows up', async (t) => {
  const t0 = Date.now()
  t.mock.timers.enable({ apis: ['Date'], now: t0 })
  let ffCalls = 0
  let forecast = null
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes('ff_calendar_thisweek')) {
      ffCalls++
      return new Response(JSON.stringify([{ title: 'Consumer Credit m/m', country: 'USD', impact: 'Low', date: new Date(t0 + 3 * 3600_000).toISOString(), forecast, previous: '18.1B' }]), { status: 200 })
    }
    if (u.includes('ff_calendar_nextweek')) return new Response('nope', { status: 404 })
    throw new Error(`unexpected fetch ${u}`)
  }
  let snap = await getCalendar()
  assert.equal(ffCalls, 1)
  assert.equal(snap.events[0].forecast, null)

  t.mock.timers.tick(3 * 60_000)                         // 3 min: too soon
  await getCalendar()
  assert.equal(ffCalls, 1)

  forecast = '14.5B'                                     // FF publishes the forecast
  t.mock.timers.tick(3 * 60_000)                         // 6 min since the last read → re-read
  snap = await getCalendar()
  assert.equal(ffCalls, 2)
  assert.equal(snap.events[0].forecast, '14.5B')

  t.mock.timers.tick(6 * 60_000)                         // forecast known → back to the normal 15-minute TTL
  await getCalendar()
  assert.equal(ffCalls, 2)
})
