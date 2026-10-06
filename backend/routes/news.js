import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth } from '../middleware/auth.js'
import { getNews, getTicker } from '../services/news.js'
import { currentItems, tickerMeta, subscribe } from '../services/liveTicker.js'

const MAX_STREAMS_PER_USER = 3
const MAX_STREAM_LIFETIME_MS = 10 * 60_000   // the page reconnects, which re-checks the login
const HEARTBEAT_MS = 20_000

const tickerPayload = async () => {
  await getTicker().catch(() => {}) // warms / refreshes the snapshot; never blocks long
  const items = currentItems()
  return { ticker: items, tickerMeta: tickerMeta(items) }
}

export function createNewsRouter({ auth = requireAuth } = {}) {
  const router = Router()
  const LIMITER = rateLimit({ windowMs: 60_000, max: 60, message: { error: 'Too many news requests' } })
  const STREAM_LIMITER = rateLimit({ windowMs: 60_000, max: 20, message: { error: 'Too many price stream connections' } })
  const openStreams = new Map() // userId → count

  // GET /api/news            → cached stories + live wire + current prices
  // GET /api/news?refresh=1  → asks for a fresh pull (throttled to once per couple of minutes, shared by everyone)
  //
  // The payload is the same for every user — "your markets" matching is done in
  // the browser against the user's own watchlist/symbols, so nothing personal is
  // sent here.
  router.get('/', auth, LIMITER, async (req, res) => {
    try {
      const force = req.query.refresh === '1'
      const [news, ticker] = await Promise.all([
        getNews({ force }),
        tickerPayload().catch(() => ({ ticker: [], tickerMeta: { ok: 0, total: 0, live: 0, failed: [] } })),
      ])
      res.set('Cache-Control', 'no-store')
      res.json({ ...news, ...ticker })
    } catch (err) {
      console.error('[news]', err.message)
      res.status(502).json({ error: 'News feeds are unreachable right now. Try again in a minute.' })
    }
  })

  // GET /api/news/ticker → current prices only (fallback for when the stream can't connect)
  router.get('/ticker', auth, LIMITER, async (_req, res) => {
    try {
      res.set('Cache-Control', 'no-store')
      res.json(await tickerPayload())
    } catch (err) {
      console.error('[news] ticker:', err.message)
      res.json({ ticker: [], tickerMeta: { ok: 0, total: 0, live: 0, failed: [] } })
    }
  })

  // GET /api/news/stream → Server-Sent Events.
  // One connection per open page, logged in ONCE (not per second), so a live
  // ticker doesn't cost an auth + database lookup every tick.
  //   event: snapshot  full list (with spark lines) on connect and once a minute
  //   event: tick      only the prices that changed, every second
  router.get('/stream', auth, STREAM_LIMITER, async (req, res) => {
    const uid = req.user?.id || req.ip
    if ((openStreams.get(uid) || 0) >= MAX_STREAMS_PER_USER) {
      return res.status(429).json({ error: 'Too many open price streams' })
    }
    openStreams.set(uid, (openStreams.get(uid) || 0) + 1)

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // tell proxies not to hold the stream back
    })
    res.flushHeaders?.()
    req.socket?.setKeepAlive?.(true)
    req.socket?.setNoDelay?.(true)
    req.socket?.setTimeout?.(0)

    const send = (event, data) => {
      if (res.writableEnded || res.destroyed) return
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    let unsubscribe = () => {}
    let heartbeat = null
    let lifetime = null
    let closed = false
    const cleanup = () => {
      if (closed) return
      closed = true
      clearInterval(heartbeat)
      clearTimeout(lifetime)
      unsubscribe()
      const left = (openStreams.get(uid) || 1) - 1
      if (left <= 0) openStreams.delete(uid); else openStreams.set(uid, left)
      if (!res.writableEnded) res.end()
    }
    // Use the response's 'close' (fires when the client goes away); on recent Node
    // versions a GET request's own 'close' can fire early and would end the stream.
    res.on('close', cleanup)
    res.on('error', cleanup)

    try {
      await getTicker({ maxWaitMs: 6000 }).catch(() => {})
      if (closed) return
      const items = currentItems()
      send('snapshot', { items, meta: tickerMeta(items) })
      unsubscribe = subscribe({ send })
      heartbeat = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n') }, HEARTBEAT_MS)
      lifetime = setTimeout(() => { send('bye', { reconnect: true }); cleanup() }, MAX_STREAM_LIFETIME_MS)
    } catch (err) {
      console.error('[news] stream:', err.message)
      cleanup()
    }
  })

  return router
}

export default createNewsRouter()