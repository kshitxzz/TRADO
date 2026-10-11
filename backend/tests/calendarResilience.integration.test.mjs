// Forex Factory refusing the request (HTTP 429) right after a server restart must never blank the page,
// and must never make things worse by retrying in a loop.
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.BLS_API_KEY = ''; process.env.FRED_API_KEY = ''; process.env.EIA_API_KEY = ''; process.env.FMP_API_KEY = ''
const { getCalendar, __test } = await import('../services/calendar.js')
const { __setStore } = await import('../services/calendarStore.js')

test('restart + FF refusing: the saved copy is served at once, FF is not hammered, and it recovers after the back-off', async (t) => {
  const t0 = Date.now()
  t.mock.timers.enable({ apis: ['Date'], now: t0 })
  const raw = (extra = {}) => ({ title: 'Unemployment Rate', country: 'USD', impact: 'High', date: new Date(t0 - 3600_000).toISOString(), forecast: '4.3%', previous: '4.3%', ...extra })
  const saved = __test.normalizeFF([raw()])
  saved[0].actual = '4.4%'
  const writes = []
  __setStore({
    load: async (key) => key === 'schedule'
      ? { payload: { events: JSON.parse(JSON.stringify(saved)), actuals: [[saved[0].id, { actual: '4.4%', source: 'U.S. Bureau of Labor Statistics', url: null, note: null }]] }, updatedAt: t0 - 3600_000 }
      : null,
    save: async (key, payload) => { writes.push([key, payload]); return true },
  })
  let ffCalls = 0
  let ffOk = false
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes('ff_calendar_thisweek')) {
      ffCalls++
      return ffOk ? new Response(JSON.stringify([raw()]), { status: 200 }) : new Response('Too Many Requests', { status: 429 })
    }
    if (u.includes('ff_calendar_nextweek')) return new Response('nope', { status: 404 })
    throw new Error(`unexpected fetch ${u}`)
  }

  let snap = await getCalendar()
  assert.equal(snap.events.length, 1)                       // not an error: the saved copy
  assert.equal(snap.events[0].actual, '4.4%')
  assert.equal(ffCalls, 1)

  t.mock.timers.tick(5 * 60_000)                            // FF said 429 → wait the full 10 minutes
  snap = await getCalendar()
  assert.equal(ffCalls, 1)
  assert.equal(snap.events.length, 1)

  ffOk = true
  t.mock.timers.tick(6 * 60_000)                            // 11 minutes in → one retry, which succeeds
  snap = await getCalendar()
  assert.equal(ffCalls, 2)
  assert.equal(snap.events[0].actual, '4.4%')               // actuals survived the refresh
  assert.ok(writes.some(([k]) => k === 'schedule'), 'a fresh copy is saved for the next restart')
})
