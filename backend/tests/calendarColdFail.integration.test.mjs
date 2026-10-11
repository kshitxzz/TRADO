// No saved copy and Forex Factory refusing: the page shows its error, but the server must not retry in a loop.
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.BLS_API_KEY = ''; process.env.FRED_API_KEY = ''; process.env.EIA_API_KEY = ''; process.env.FMP_API_KEY = ''
const { getCalendar } = await import('../services/calendar.js')
const { __setStore } = await import('../services/calendarStore.js')

test('cold start, nothing saved, FF returns 429: one attempt per back-off window, then recovery', async (t) => {
  const t0 = Date.now()
  t.mock.timers.enable({ apis: ['Date'], now: t0 })
  __setStore({ load: async () => null, save: async () => true })
  let ffCalls = 0
  let ffOk = false
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes('ff_calendar_thisweek')) {
      ffCalls++
      return ffOk
        ? new Response(JSON.stringify([{ title: 'CPI m/m', country: 'USD', impact: 'High', date: new Date(t0 + 3600_000).toISOString(), forecast: '0.3%', previous: '0.2%' }]), { status: 200 })
        : new Response('Too Many Requests', { status: 429 })
    }
    if (u.includes('ff_calendar_nextweek')) return new Response('nope', { status: 404 })
    throw new Error(`unexpected fetch ${u}`)
  }

  await assert.rejects(getCalendar(), /429/)
  assert.equal(ffCalls, 1)
  for (const wait of [5_000, 60_000, 4 * 60_000]) {          // page polls every few seconds / minutes — none may reach FF
    t.mock.timers.tick(wait)
    await assert.rejects(getCalendar())
  }
  assert.equal(ffCalls, 1)

  ffOk = true
  t.mock.timers.tick(6 * 60_000)                             // > 10 minutes after the 429
  const snap = await getCalendar()
  assert.equal(ffCalls, 2)
  assert.equal(snap.events.length, 1)
})
