import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth } from '../middleware/auth.js'
import { getCandles } from '../services/candles.js'
import { supabase } from '../config/supabase.js'

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

// GET /api/candles/status → { total, ready }: closed MT5 trades vs. trades whose
// broker candles the EA has already uploaded. Tiny query; polled while ready < total.
router.get('/status', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('trade_candle_status', { p_user: req.user.id })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    res.set('Cache-Control', 'private, max-age=15')
    res.json({ total: row?.total ?? 0, ready: row?.ready ?? 0 })
  } catch (err) {
    console.error('[candles/status]', err.message)
    res.status(500).json({ error: 'Status unavailable' })
  }
})

// GET /api/candles/trade/:tradeId → the broker's own candles for one trade,
// captured by the TradoSync EA: { series: { '1m': [[t,o,h,l,c],…], … } | null }
// `null` = nothing captured yet (the EA fills these in over time).
router.get('/trade/:tradeId', requireAuth, async (req, res) => {
  try {
    const { tradeId } = req.params
    if (!/^[0-9a-f-]{36}$/i.test(tradeId)) return res.status(400).json({ error: 'Invalid trade id' })

    const { data, error } = await supabase
      .from('trade_candles').select('series')
      .eq('trade_id', tradeId).eq('user_id', req.user.id).maybeSingle()
    if (error) throw error

    const series = data?.series && Object.keys(data.series).length ? data.series : null
    res.set('Cache-Control', 'private, max-age=60')
    res.json({ series })
  } catch (err) {
    console.error('[candles/trade]', err.message)
    res.status(500).json({ error: 'Failed to load broker candles' })
  }
})

export default router