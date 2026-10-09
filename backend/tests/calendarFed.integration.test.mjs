// End-to-end: Forex Factory feed + Fed feeds + statement page are stubbed.
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.BLS_API_KEY = ''; process.env.FRED_API_KEY = ''; process.env.EIA_API_KEY = ''; process.env.FMP_API_KEY = ''
const { getCalendar } = await import('../services/calendar.js')

test('FOMC rate, statement and a Board member speech are filled from the Fed feeds', async () => {
  const now = Date.now()
  const at = now - 10 * 60_000
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at)).replaceAll('-', '')
  const ff = (title, impact, forecast, previous) => ({ title, country: 'USD', impact, date: new Date(at).toISOString(), forecast, previous })
  const rss = (items) => `<rss><channel>${items.map(i => `<item><title>${i.t}</title><link><![CDATA[${i.l}]]></link><pubDate><![CDATA[${new Date(at).toUTCString()}]]></pubDate></item>`).join('')}</channel></rss>`
  const statementUrl = `https://www.federalreserve.gov/newsevents/pressreleases/monetary${ymd}a.htm`
  const calls = []
  globalThis.fetch = async (url) => {
    const u = String(url); calls.push(u)
    if (u.includes('ff_calendar_thisweek')) return new Response(JSON.stringify([
      ff('Federal Funds Rate', 'High', '4.00%', '3.75%'),
      ff('FOMC Statement', 'High', null, null),
      ff('FOMC Member Bowman Speaks', 'Low', null, null),
      ff('FOMC Member Schmid Speaks', 'Low', null, null),
    ]), { status: 200 })
    if (u.includes('ff_calendar_nextweek')) return new Response('nope', { status: 404 })
    if (u.endsWith('/feeds/speeches_and_testimony.xml')) return new Response(rss([{ t: 'Bowman, Opening Remarks', l: `https://www.federalreserve.gov/newsevents/speech/bowman${ymd}a.htm` }]), { status: 200 })
    if (u.endsWith('/feeds/press_monetary.xml')) return new Response(rss([{ t: 'Federal Reserve issues FOMC statement', l: statementUrl }]), { status: 200 })
    if (u === statementUrl) return new Response('<html><body><nav>menu</nav><p>The Committee decided to raise the target range for the federal funds rate by 1/4 percentage point to 3-3/4 to 4 percent, in support of the dual mandate.</p></body></html>', { status: 200 })
    throw new Error(`unexpected fetch ${u}`)
  }
  const { events, meta } = await getCalendar()
  const get = (t) => events.find(e => e.title === t)
  assert.equal(get('Federal Funds Rate').actual, '4.00%')
  assert.equal(get('Federal Funds Rate').actualUrl, statementUrl)
  assert.equal(get('FOMC Statement').actual, 'Statement')
  assert.equal(get('FOMC Member Bowman Speaks').actual, 'Speech')
  assert.match(get('FOMC Member Bowman Speaks').actualUrl, /\/speech\/bowman\d{8}a\.htm$/)
  assert.equal(get('FOMC Member Bowman Speaks').actualNote, 'Bowman, Opening Remarks')
  assert.equal(get('FOMC Member Schmid Speaks').actual, null)       // regional president: not on the Board's feed
  assert.equal(get('Federal Funds Rate').actualSource, 'Federal Reserve Board')
  assert.equal(meta.actuals.enabled, true)
})
