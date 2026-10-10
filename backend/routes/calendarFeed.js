import { Router } from 'express'
import { ingest, feederIds } from '../services/calendarFeed.js'

// Mounted at /api/calendar/feed. Called by the TradoSync EA on ONE designated terminal
// (InpPushCalendar = true) with the actual values of MT5's economic calendar. Same token-in-body
// auth as /api/broker/ea/sync (MT5 can't hold a Supabase session), plus an allow-list: only users
// listed in CALENDAR_FEEDER_USER_IDS may feed the shared calendar. Nobody else can change what
// every user sees.
const TOKEN_TTL_MS = 60_000

async function defaultResolveUser(token) {
  const { supabase } = await import('../config/supabase.js')
  const { data } = await supabase.from('broker_accounts').select('user_id').eq('ea_token', token).maybeSingle()
  return data?.user_id || null
}

export function createCalendarFeedRouter({ resolveUser = defaultResolveUser } = {}) {
  const router = Router()
  const tokenCache = new Map()                       // token → { userId, until } (misses are cached too)

  router.post('/', async (req, res) => {
    try {
      const allowed = feederIds()
      if (!allowed.size) return res.status(503).json({ error: 'Calendar feed is not enabled on this server' })

      const { token, values } = req.body || {}
      if (typeof token !== 'string' || token.length < 8 || token.length > 200) return res.status(401).json({ error: 'Invalid sync token' })

      let hit = tokenCache.get(token)
      if (!hit || hit.until < Date.now()) {
        hit = { userId: await resolveUser(token), until: Date.now() + TOKEN_TTL_MS }
        if (tokenCache.size > 200) tokenCache.clear()
        tokenCache.set(token, hit)
      }
      if (!hit.userId) return res.status(401).json({ error: 'Invalid sync token' })
      if (!allowed.has(String(hit.userId).toLowerCase())) {
        console.warn(`[calendar/feed] user ${hit.userId} pushed calendar data but is not in CALENDAR_FEEDER_USER_IDS`)
        return res.status(403).json({ error: 'This account is not an allowed calendar feeder' })
      }
      if (!Array.isArray(values)) return res.status(400).json({ error: 'values must be an array' })

      res.json(ingest(values))
    } catch (err) {
      console.error('[calendar/feed]', err.message)
      res.status(500).json({ error: 'Feed failed' })
    }
  })

  return router
}

export default createCalendarFeedRouter()