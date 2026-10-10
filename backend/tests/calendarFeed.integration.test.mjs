// End to end: Forex Factory schedule (stubbed) + a push from the MT5 feeder → actual in getCalendar().
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.BLS_API_KEY = ''; process.env.FRED_API_KEY = ''; process.env.EIA_API_KEY = ''; process.env.FMP_API_KEY = ''
process.env.CALENDAR_FEEDER_USER_IDS = 'feeder-1'
const { getCalendar } = await import('../services/calendar.js')
const { ingest } = await import('../services/calendarFeed.js')

test('an ISM PMI that only the MT5 calendar knows is filled after the feeder pushes it', async () => {
  const at = Date.now() - 10 * 60_000
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes('ff_calendar_thisweek')) return new Response(JSON.stringify([
      { title: 'ISM Services PMI', country: 'USD', impact: 'Medium', date: new Date(at).toISOString(), forecast: '55.1', previous: '55.4' },
      { title: 'Prelim UoM Consumer Sentiment', country: 'USD', impact: 'Medium', date: new Date(at).toISOString(), forecast: '47.5', previous: '47.8' },
    ]), { status: 200 })
    if (u.includes('ff_calendar_nextweek')) return new Response('nope', { status: 404 })
    throw new Error(`unexpected fetch ${u}`)
  }
  let snap = await getCalendar()
  assert.equal(snap.events.find(e => e.title === 'ISM Services PMI').actual, null)

  ingest([{ id: '1001', cur: 'USD', name: 'ISM Non-Manufacturing PMI', t: Math.round(at / 1000), a: 54.8, p: 55.4, f: 55.1 }], Date.now())
  snap = await getCalendar()
  const ism = snap.events.find(e => e.title === 'ISM Services PMI')
  assert.equal(ism.actual, '54.8')
  assert.match(ism.actualSource, /MetaTrader 5/)
  assert.equal(snap.events.find(e => e.title === 'Prelim UoM Consumer Sentiment').actual, null)   // MT5 hasn't published it → still blank
  assert.equal(snap.meta.actuals.feed.enabled, true)
  assert.equal(snap.meta.actuals.feed.pushes, 1)
})
