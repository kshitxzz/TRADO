import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// MetaAPI polyfill
if (typeof global.window === 'undefined') {
  global.window = global
}

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

import aiRoutes       from './routes/ai.js'
import tradesRoutes   from './routes/trades.js'
import paymentsRoutes from './routes/payments.js'
import brokerRoutes   from './routes/broker.js'
import statsRoutes    from './routes/stats.js'
import notificationsRoutes from './routes/notifications.js'

const app  = express()
const PORT = process.env.PORT || 4000

// ── Middleware ──
app.use(helmet())
app.use(cors({
  origin: [process.env.FRONTEND_URL || 'http://localhost:5173'],
  credentials: true,
}))
app.use(express.json({
  limit: '15mb', // bumped from 2mb — trade-insight sends journal screenshots as base64
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8') },
}))

// Global rate limit — the EA sync route gets its own budget below since it
// now syncs on every price tick (throttled client-side to ~1/sec), which
// would otherwise eat most of this shared quota and start 429-ing normal
// app usage (dashboard loads, AI calls, etc.) from the same machine.
app.use(rateLimit({
  windowMs: 60_000, max: 120, message: { error: 'Too many requests' },
  skip: (req) => req.path === '/api/broker/ea/sync',
}))

// EA sync gets its own generous budget: tick-driven, throttled to ~1/sec
// client-side (InpMinTickSyncMs), so worst case is ~60/min per account —
// this leaves headroom without starving it or the rest of the app.
app.use('/api/broker/ea/sync', rateLimit({
  windowMs: 60_000, max: 300, message: { error: 'Too many requests' },
}))

// ── Static: downloadable MT5 Expert Advisor ──
app.use('/ea', express.static(path.join(__dirname, 'public/ea')))

// ── Routes ──
app.use('/api/ai',       aiRoutes)
app.use('/api/trades',   tradesRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api/broker',   brokerRoutes)
app.use('/api/stats',    statsRoutes)
app.use('/api/notifications', notificationsRoutes)

// ── Health ──
app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

// ── Error handler ──
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err)
  const body = { error: err.message || 'Internal server error' }

  // TEMPORARY diagnostic: when the EA sends malformed JSON, show exactly
  // what text is around the failure point so we can see the real bug
  // instead of guessing blind. Safe to remove once EA sync is confirmed
  // working end to end.
  if (err instanceof SyntaxError && req.rawBody) {
    const m = /position (\d+)/.exec(err.message)
    if (m) {
      const pos = parseInt(m[1], 10)
      body.snippet = req.rawBody.slice(Math.max(0, pos - 40), pos + 40)
      body.snippetPointer = ' '.repeat(Math.min(40, pos)) + '^'
    }
  }

  res.status(err.status || 500).json(body)
})

app.listen(PORT, () => console.log(`Trado backend running on :${PORT}`))