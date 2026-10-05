import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth } from '../middleware/auth.js'
import { getNews, getTicker } from '../services/news.js'

const router = Router()
const LIMITER = rateLimit({ windowMs: 60_000, max: 30, message: { error: 'Too many news requests' } })

// GET /api/news            → cached stories + live wire + ticker
// GET /api/news?refresh=1  → asks for a fresh pull (the service throttles this
//                            to once per couple of minutes, shared by everyone)
//
// The payload is the same for every user — "your markets" matching is done in
// the browser against the user's own symbols, so nothing personal is sent here.
router.get('/', requireAuth, LIMITER, async (req, res) => {
  try {
    const force = req.query.refresh === '1'
    const [news, ticker] = await Promise.all([
      getNews({ force }),
      getTicker().catch(() => []),
    ])
    res.set('Cache-Control', 'no-store')
    res.json({ ...news, ticker })
  } catch (err) {
    console.error('[news]', err.message)
    res.status(502).json({ error: 'News feeds are unreachable right now. Try again in a minute.' })
  }
})

export default router