// End-to-end glue test: Forex Factory feed + BLS are stubbed; checks that an actual reaches
// getCalendar() with its source, and that API keys never leak into the public snapshot.
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.BLS_API_KEY = 'test-bls-key-123'
process.env.FRED_API_KEY = ''
process.env.EIA_API_KEY = ''
process.env.FMP_API_KEY = ''

const { getCalendar } = await import('../services/calendar.js')

test('a just-released Unemployment Rate is filled from BLS and tagged with its source', async () => {
  const now = new Date()
  const ref = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))      // month the release covers
  const mk = (back) => { const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - back, 1)); return { year: String(d.getUTCFullYear()), period: `M${String(d.getUTCMonth() + 1).padStart(2, '0')}` } }
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    calls.push(u)
    if (u.includes('ff_calendar_thisweek')) {
      return new Response(JSON.stringify([{ title: 'Unemployment Rate', country: 'USD', impact: 'High', date: new Date(now - 60_000).toISOString(), forecast: '4.3%', previous: '4.3%' }]), { status: 200 })
    }
    if (u.includes('ff_calendar_nextweek')) return new Response('nope', { status: 404 })
    if (u.includes('api.bls.gov')) {
      const body = JSON.parse(init.body)
      assert.equal(body.registrationkey, 'test-bls-key-123')
      return new Response(JSON.stringify({ status: 'REQUEST_SUCCEEDED', message: [], Results: { series: [{ seriesID: 'LNS14000000', data: [{ ...mk(0), value: '4.4' }, { ...mk(1), value: '4.3' }, { ...mk(2), value: '4.2' }] }] } }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${u}`)
  }
  const snap = await getCalendar()
  const e = snap.events.find(x => x.title === 'Unemployment Rate')
  assert.equal(e.actual, '4.4%')
  assert.equal(e.actualSource, 'U.S. Bureau of Labor Statistics')
  assert.equal(snap.meta.actuals.enabled, true)
  assert.ok(!JSON.stringify(snap).includes('test-bls-key-123'), 'API key must never appear in the response')
})
