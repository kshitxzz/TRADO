import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth } from '../middleware/auth.js'
import crypto from 'node:crypto'
import { getCalendar, snapshot, ingestFeed } from '../services/calendar.js'

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
      res.json(data)
    } catch (err) {
      console.error('[calendar]', err.message)
      res.status(502).json({ error: 'The economic calendar feed is unreachable right now. Try again in a minute.' })
    }
  })

  // POST /api/calendar/feed → MetaTrader 5 calendar values pushed by public/ea/TradoCalendarFeed.mq5
  // running in the OWNER's terminal. MT5 can't hold a Supabase session, so it authenticates with a
  // shared secret (CALENDAR_FEED_SECRET) in the JSON body — same idea as the TradoSync token. These
  // values are shown to every user, so ordinary EA sync tokens are deliberately NOT accepted here.
  const FEED_LIMITER = rateLimit({ windowMs: 60_000, max: 90, message: { error: 'Too many feed requests' } })
  router.post('/feed', FEED_LIMITER, (req, res) => {
    const secret = process.env.CALENDAR_FEED_SECRET
    if (!secret) return res.status(503).json({ error: 'Calendar feed is not enabled on this server' })
    const given = Buffer.from(String(req.body?.secret ?? ''))
    const want = Buffer.from(secret)
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.status(401).json({ error: 'Invalid feed secret' })
    try {
      res.set('Cache-Control', 'no-store')
      res.json({ ok: true, ...ingestFeed(req.body) })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  })

  // GET /api/calendar/status → provider diagnostics only (no events). Handy after deploying
  // to confirm the schedule feed and the optional actuals provider are healthy.
  router.get('/status', auth, LIMITER, (_req, res) => {
    const { meta } = snapshot()
    res.set('Cache-Control', 'no-store')
    res.json({ ...meta, events: undefined })
  })

  return router
}

export default createCalendarRouter()