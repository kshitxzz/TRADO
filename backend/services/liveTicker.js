// ─────────────────────────────────────────────────────────────────────────
// Live prices for the News ticker — one shared feed for every open page.
//
//   Crypto (BTC/ETH/SOL)        Binance public websocket, ~1 update/second.
//   Forex, gold, silver         Deriv's public tick websocket (free, no key).
//   Everything else + any feed  Polled every ~15s through the normal provider
//   that is down or stale       chain in news.js (Yahoo / Binance / Twelve Data).
//
// Sockets only run while at least one browser is connected (plus a short grace
// period), so an idle server does no work. Each second the changed prices are
// pushed to every connected page.
//
// A streamed price is only used when the daily-change baseline is the SAME
// instrument (see `baseline` in TICKER_DEFS) — otherwise the % change would be
// computed against a different contract and be wrong.
// ─────────────────────────────────────────────────────────────────────────
import { TICKER_DEFS, getTicker, loadTickerItem, peekTicker, mapLimit } from './news.js'

const LIVE_FRESH_MS   = 20_000   // a streamed price older than this is no longer shown as "live"
const POLL_STALE_MS   = 45_000   // …and after this the feed is considered down → poll instead
const POLL_MS         = 15_000
const IDLE_GRACE_MS   = 60_000
const SNAPSHOT_EVERY  = 60       // seconds between full snapshots (refreshes spark lines)

// Overridable for tests / if a provider moves its endpoint.
const BINANCE_HOSTS = (process.env.TICKER_BINANCE_WS || 'wss://data-stream.binance.vision,wss://stream.binance.com:9443').split(',').map(s => s.trim()).filter(Boolean)
const DERIV_URLS    = (process.env.TICKER_DERIV_WS || 'wss://api.derivws.com/trading/v1/options/ws/public,wss://ws.derivws.com/websockets/v3?app_id=1089').split(',').map(s => s.trim()).filter(Boolean)

const quotes = new Map()        // label → { price, prev?, at, src: 'ws' | 'poll' }
const unsupported = new Set()   // labels whose live symbol the provider rejected
const subscribers = new Set()   // connected pages: { send(event, data) }
let feeds = []
let pollTimer = null
let tickTimer = null
let stopTimer = null
let polling = false
let running = false
let lastSent = new Map()
let tickCount = 0

// ── WebSocket plumbing ───────────────────────────────────────────────────
let wsCtor
async function getWS() {
  if (wsCtor !== undefined) return wsCtor
  try { wsCtor = (await import('ws')).default } catch { wsCtor = globalThis.WebSocket || null }
  return wsCtor
}

// A self-reconnecting socket: backs off on failure and rotates through `urls`
// when one never manages to open.
function createFeed({ name, urls, onOpen, onMessage, heartbeat }) {
  let stopped = false
  let current = null
  let urlIdx = 0
  let attempt = 0
  let retryTimer = null
  let hbTimer = null

  const retry = () => {
    if (stopped) return
    clearTimeout(retryTimer)
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)) + Math.random() * 500
    attempt++
    retryTimer = setTimeout(connect, delay)
  }

  async function connect() {
    if (stopped) return
    const WS = await getWS()
    if (!WS) { console.warn(`[live:${name}] no WebSocket implementation available — falling back to polling`); return }
    const url = urls[urlIdx % urls.length]
    let sock
    try { sock = new WS(url) } catch { urlIdx++; return retry() }
    current = sock
    let opened = false
    let done = false

    const down = () => {
      if (done) return
      done = true
      clearInterval(hbTimer)
      if (current === sock) current = null
      if (!opened) urlIdx++
      retry()
    }

    sock.addEventListener('open', () => {
      opened = true
      attempt = 0
      try { onOpen?.(sock) } catch { /* ignore */ }
      if (heartbeat) hbTimer = setInterval(() => { try { sock.send(heartbeat.message) } catch { /* ignore */ } }, heartbeat.everyMs)
    })
    sock.addEventListener('message', (ev) => {
      const d = ev.data
      try { onMessage(typeof d === 'string' ? d : String(d)) } catch { /* malformed frame */ }
    })
    sock.addEventListener('close', down)
    sock.addEventListener('error', () => { try { sock.close() } catch { /* ignore */ } down() })
  }

  connect()
  return {
    stop() {
      stopped = true
      clearTimeout(retryTimer)
      clearInterval(hbTimer)
      try { current?.close() } catch { /* ignore */ }
    },
  }
}

function startBinance() {
  const defs = TICKER_DEFS.filter(d => d.live?.binance)
  if (!defs.length) return null
  const bySymbol = new Map(defs.map(d => [d.live.binance.toUpperCase(), d]))
  const streams = defs.map(d => `${d.live.binance}@miniTicker`).join('/')
  return createFeed({
    name: 'binance',
    urls: BINANCE_HOSTS.map(h => `${h}/stream?streams=${streams}`),
    onMessage: (txt) => {
      const msg = JSON.parse(txt)
      const d = msg.data || msg
      const def = d?.s && bySymbol.get(d.s)
      const price = Number(d?.c)
      const prev = Number(d?.o)
      if (!def || !Number.isFinite(price)) return
      quotes.set(def.label, { price, prev: prev > 0 ? prev : undefined, at: Date.now(), src: 'ws' })
    },
  })
}

function startDeriv() {
  const defs = TICKER_DEFS.filter(d => d.live?.deriv)
  if (!defs.length) return null
  const bySymbol = new Map(defs.map(d => [d.live.deriv, d]))
  return createFeed({
    name: 'deriv',
    urls: DERIV_URLS,
    heartbeat: { message: JSON.stringify({ ping: 1 }), everyMs: 30_000 },
    onOpen: (sock) => { for (const d of defs) sock.send(JSON.stringify({ ticks: d.live.deriv, subscribe: 1 })) },
    onMessage: (txt) => {
      const msg = JSON.parse(txt)
      if (msg.error) {
        const def = bySymbol.get(msg.echo_req?.ticks)
        if (def) {
          unsupported.add(def.label)
          console.warn(`[live:deriv] ${def.label} not available as a live stream (${msg.error.code || 'error'}) — polling instead`)
        }
        return
      }
      if (msg.msg_type === 'tick' && msg.tick) {
        const def = bySymbol.get(msg.tick.symbol)
        const price = Number(msg.tick.quote)
        if (def && Number.isFinite(price)) quotes.set(def.label, { price, at: Date.now(), src: 'ws' })
      }
    },
  })
}

// ── Merging snapshot + live quotes ───────────────────────────────────────
function liveUsable(def, base, q, now) {
  if (!def.live || !q || q.src !== 'ws' || unsupported.has(def.label)) return false
  if (now - q.at > LIVE_FRESH_MS) return false
  if (q.prev > 0) return true                                   // stream carries its own baseline (Binance)
  return !!base && Array.isArray(def.live.baseline) && def.live.baseline.includes(base.sym)
}

export function currentItems() {
  const snap = peekTicker()
  const baseBy = new Map(snap.items.map(i => [i.label, i]))
  const now = Date.now()
  const out = []

  for (const def of TICKER_DEFS) {
    const base = baseBy.get(def.label)
    const q = quotes.get(def.label)
    let price
    let prev
    let live = false

    if (liveUsable(def, base, q, now)) {
      price = q.price
      prev = q.prev > 0 ? q.prev : base.prev
      live = true
    } else if (q && q.src === 'poll' && q.at >= snap.at) {
      price = q.price
      prev = q.prev > 0 ? q.prev : base?.prev
    } else if (base) {
      price = base.price
      prev = base.prev
    } else {
      continue
    }
    if (!Number.isFinite(price)) continue

    let changePct
    if (prev > 0) changePct = (price / prev - 1) * 100
    else if (base) changePct = base.changePct
    else continue

    const spark = base?.spark?.length > 1 ? [...base.spark.slice(0, -1), price] : (base?.spark || [])
    out.push({ label: def.label, tag: def.tag, price, changePct, spark, live })
  }
  return out
}

export function tickerMeta(items = currentItems()) {
  const snap = peekTicker()
  return {
    ok: items.length,
    total: snap.total || TICKER_DEFS.length,
    live: items.filter(i => i.live).length,
    failed: snap.failed || [],
  }
}

// ── Fast polling for anything without a healthy live stream ──────────────
async function pollOnce() {
  if (polling) return
  polling = true
  try {
    const snap = peekTicker()
    const baseBy = new Map(snap.items.map(i => [i.label, i]))
    const now = Date.now()
    const targets = TICKER_DEFS.filter(def => {
      const q = quotes.get(def.label)
      if (liveUsable(def, baseBy.get(def.label), q, now)) return false
      // Give a freshly-connected stream a moment before falling back.
      return !(q?.src === 'ws' && now - q.at < POLL_STALE_MS)
    })
    await mapLimit(targets, 4, async (def) => {
      const it = await loadTickerItem(def)
      if (it) quotes.set(def.label, { price: it.price, prev: it.prev, at: Date.now(), src: 'poll' })
    })
  } catch (err) {
    console.warn('[live] poll error:', err.message)
  } finally {
    polling = false
  }
}

// ── Broadcast ────────────────────────────────────────────────────────────
const r = (n, d) => Math.round(n * 10 ** d) / 10 ** d
const toSentMap = (items) => new Map(items.map(i => [i.label, [i.price, r(i.changePct, 3), i.live ? 1 : 0]]))

function broadcast() {
  if (!subscribers.size) return
  tickCount++
  if (tickCount % 30 === 0) getTicker({ maxWaitMs: 0 }).catch(() => {}) // keeps the snapshot (spark lines, closes) fresh

  const items = currentItems()
  if (tickCount % SNAPSHOT_EVERY === 0) {
    sendAll('snapshot', { items, meta: tickerMeta(items) })
    lastSent = toSentMap(items)
    return
  }

  const next = toSentMap(items)
  const changed = {}
  let n = 0
  for (const [label, v] of next) {
    const p = lastSent.get(label)
    if (!p || p[0] !== v[0] || p[1] !== v[1] || p[2] !== v[2]) { changed[label] = v; n++ }
  }
  lastSent = next
  if (n) sendAll('tick', changed)
}

function sendAll(event, data) {
  for (const c of subscribers) {
    try { c.send(event, data) } catch { /* a dead client is removed by its own close handler */ }
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────
function start() {
  if (running) return
  running = true
  feeds = [startBinance(), startDeriv()].filter(Boolean)
  pollOnce()
  pollTimer = setInterval(pollOnce, POLL_MS)
  tickTimer = setInterval(broadcast, 1000)
}

export function stopLive() {
  running = false
  clearInterval(pollTimer); clearInterval(tickTimer); clearTimeout(stopTimer)
  for (const f of feeds) f.stop()
  feeds = []
  lastSent = new Map()
  tickCount = 0
}

// A page connects: start the feeds if needed and register for pushes.
export function subscribe(client) {
  clearTimeout(stopTimer)
  subscribers.add(client)
  start()
  // The page already has a full snapshot; only genuine changes should follow it.
  if (lastSent.size === 0) lastSent = toSentMap(currentItems())
  return () => {
    subscribers.delete(client)
    if (!subscribers.size) stopTimer = setTimeout(() => { if (!subscribers.size) stopLive() }, IDLE_GRACE_MS)
  }
}

export const __test = { quotes, unsupported, subscribers, pollOnce, broadcast, isRunning: () => running }