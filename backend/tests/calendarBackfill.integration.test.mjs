// A release from earlier in the week must still be filled in (e.g. after a deploy), but only the
// LATEST release of each indicator — older ones may have been revised since.
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.BLS_API_KEY = ''
process.env.EIA_API_KEY = ''
process.env.FMP_API_KEY = ''
process.env.FRED_API_KEY = 'test-fred-key'

const { getCalendar } = await import('../services/calendar.js')
const { __test } = await import('../services/officialActuals.js')

test('earlier-this-week releases are backfilled; superseded ones are not', async () => {
  const now = Date.now()
  const DAY = 86_400_000
  const trade = now - 3 * DAY, claimsOld = now - 6 * DAY, claimsNew = now - 2 * DAY
  const ff = (title, t, forecast, previous) => ({ title, country: 'USD', impact: 'Low', date: new Date(t).toISOString(), forecast, previous })
  const obs = {
    BOPGSTB: [{ date: `${__test.expectedPeriod('M2', trade)}-01`, value: '-78300' }, { date: '2026-01-01', value: '-80000' }],
    ICSA: [
      { date: __test.expectedPeriod('SAT', claimsNew), value: '219000' },
      { date: __test.expectedPeriod('SAT', claimsOld), value: '230000' },
    ],
  }
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes('ff_calendar_thisweek')) return new Response(JSON.stringify([
      ff('Trade Balance', trade, '-100.8B', '-88.6B'),
      ff('Unemployment Claims', claimsOld, '225K', '222K'),
      ff('Unemployment Claims', claimsNew, '225K', '222K'),
    ]), { status: 200 })
    if (u.includes('ff_calendar_nextweek')) return new Response('nope', { status: 404 })
    if (u.includes('api.stlouisfed.org')) {
      const id = new URL(u).searchParams.get('series_id')
      return new Response(JSON.stringify({ observations: obs[id] || [] }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${u}`)
  }
  const { events } = await getCalendar()
  const by = (title, t) => events.find(e => e.title === title && e.time === Math.floor(t / 1000) * 1000 || e.title === title && Math.abs(e.time - t) < 1000)
  assert.equal(by('Trade Balance', trade).actual, '-78.3B')
  assert.equal(by('Unemployment Claims', claimsNew).actual, '219K')
  assert.equal(by('Unemployment Claims', claimsOld).actual, null)
})
