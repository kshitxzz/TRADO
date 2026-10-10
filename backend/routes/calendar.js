import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth } from '../middleware/auth.js'
import { getCalendar, snapshot, debugSnapshot } from '../services/calendar.js'
import { probeOfficial } from '../services/officialActuals.js'

export function createCalendarRouter({ auth = requireAuth } = {}) {
  const router = Router()
  const LIMITER = rateLimit({ windowMs: 60_000, max: 60, message: { error: 'Too many calendar requests' } })

  // GET /api/calendar            → cached schedule (identical for every user)
  // GET /api/calendar?refresh=1  → asks for a fresh pull (server-throttled, shared by everyone)
  // Times are UTC milliseconds; the browser converts to the user's own time zone.
  router.get('/', auth, LIMITER, async (req, res) => {
    try {
      const data = await getCalendar({ force: req.query.refresh === '1' })
      res.set('Cache-Control', 'no-store')
      res.json(req.query.debug === '1' ? { ...data, debug: debugSnapshot() } : data)   // ?debug=1 → why actuals are blank
    } catch (err) {
      console.error('[calendar]', err.message)
      res.status(502).json({ error: 'The economic calendar feed is unreachable right now. Try again in a minute.' })
    }
  })

  // GET /api/calendar/status → provider diagnostics only (no events). Handy after deploying
  // to confirm the schedule feed and the optional actuals provider are healthy.
  router.get('/status', auth, LIMITER, (_req, res) => {
    const { meta } = snapshot()
    res.set('Cache-Control', 'no-store')
    res.json({ ...meta, events: undefined })
  })

  // GET /api/calendar/actuals-check → dry run of the official actuals sources. Reads the latest
  // observation of every mapped series (BLS / FRED / EIA) so you can confirm after deploying that the
  // keys work and every series ID resolves, without waiting for a release. Result is cached for
  // 10 minutes and shared, so it cannot be used to burn the free API quotas.
  let probeCache = null
  let probeInflight = null
  router.get('/actuals-check', auth, LIMITER, async (_req, res) => {
    try {
      if (!probeCache || Date.now() - probeCache.at > 10 * 60_000) {
        if (!probeInflight) probeInflight = probeOfficial().then(r => { probeCache = r }).finally(() => { probeInflight = null })
        await probeInflight
      }
      res.set('Cache-Control', 'no-store')
      res.json(probeCache)
    } catch (err) {
      console.error('[calendar] actuals-check:', err.message)
      res.status(500).json({ error: 'Check failed' })
    }
  })

  return router
}

export default createCalendarRouter()