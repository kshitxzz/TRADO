import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth } from '../middleware/auth.js'
import { getCandles } from '../services/candles.js'

const router = Router()

// Replay opens fire a handful of requests (one per timeframe switch), so a
// per-route budget keeps a runaway client from burning the data-provider quota.
const LIMITER = rateLimit({
  windowMs: 60_000, max: 40,
  message: { error: 'Too many market-data requests — slow down a little.' },
})

// GET /api/candles?symbol=XAUUSD&interval=5m&from=<unix s>&to=<unix s>
router.get('/', requireAuth, LIMITER, async (req, res) => {
  try {
    const { symbol, interval } = req.query
    const from = Number(req.query.from)
    const to   = Number(req.query.to)

    if (!symbol || !/^[A-Za-z0-9._#\-\/]{2,24}$/.test(String(symbol))) {
      return res.status(400).json({ error: 'Invalid symbol' })
    }

    const data = await getCandles({ symbol: String(symbol), interval: String(interval), from, to })
    res.set('Cache-Control', 'private, max-age=60')
    res.json(data)
  } catch (err) {
    const status = err.status || (err.name === 'AbortError' ? 504 : 502)
    if (status >= 500) console.error('[candles]', err.message)
    res.status(status).json({ error: err.message || 'Failed to load market data' })
  }
})

export default router