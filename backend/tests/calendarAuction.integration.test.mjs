import test from 'node:test'
import assert from 'node:assert/strict'

process.env.BLS_API_KEY = ''; process.env.FRED_API_KEY = ''; process.env.EIA_API_KEY = ''; process.env.FMP_API_KEY = ''
const { getCalendar } = await import('../services/calendar.js')

test('a just-finished 10-year auction is filled from the Treasury in FF\'s "yield|bid-to-cover" format', async () => {
  const now = Date.now()
  const at = now - 10 * 60_000
  const et = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes('ff_calendar_thisweek')) return new Response(JSON.stringify([{ title: '10-y Bond Auction', country: 'USD', impact: 'Low', date: new Date(at).toISOString(), forecast: '', previous: '4.83|2.7' }]), { status: 200 })
    if (u.includes('ff_calendar_nextweek')) return new Response('nope', { status: 404 })
    if (u.includes('treasurydirect.gov/TA_WS/securities/auctioned')) {
      assert.match(u, /type=Note/)
      return new Response(JSON.stringify([
        { auctionDate: `${et(at)}T00:00:00`, securityType: 'Note', securityTerm: '10-Year', highYield: '4.276', bidToCoverRatio: '2.58' },
        { auctionDate: `${et(at - 28 * 86_400_000)}T00:00:00`, securityType: 'Note', securityTerm: '9-Year 11-Month', highYield: '4.83', bidToCoverRatio: '2.65' },
      ]), { status: 200 })
    }
    throw new Error(`unexpected fetch ${u}`)
  }
  const { events, meta } = await getCalendar()
  assert.equal(events[0].actual, '4.28|2.6')
  assert.equal(events[0].actualSource, 'U.S. Treasury (TreasuryDirect)')
  assert.equal(meta.actuals.auctions.matched, 1)
})
