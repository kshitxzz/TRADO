import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { formatPending, sanitizeSeries } from '../services/eaCandles.js'

// Mounted at /api/broker/ea/candles. Called by the TradoSync EA (token auth in
// the JSON body — same scheme as /ea/sync, MT5 can't hold a Supabase session).
const router = Router()

// Resolve the broker account the terminal is logged into right now. Unlike
// /ea/sync this never auto-provisions: candles only attach to accounts that
// already exist.
async function resolveAccount(token, login) {
  if (!token) return null
  const { data: tokenRow } = await supabase
    .from('broker_accounts').select('id, user_id, account_number').eq('ea_token', token).maybeSingle()
  if (!tokenRow) return null
  if (login != null && String(login) !== String(tokenRow.account_number)) {
    const { data: other } = await supabase
      .from('broker_accounts').select('id, user_id, account_number')
      .eq('user_id', tokenRow.user_id).eq('account_number', String(login)).maybeSingle()
    return other || null
  }
  return tokenRow
}

// POST /pending → plain-text lines "positionId|SYMBOL|openEpoch|closeEpoch"
router.post('/pending', async (req, res) => {
  try {
    const { token, login } = req.body || {}
    const limit = Math.min(Math.max(parseInt(req.body?.limit, 10) || 2, 1), 5)
    const account = await resolveAccount(token, login)
    if (!account) return res.status(401).type('text/plain').send('invalid token')

    const { data, error } = await supabase.rpc('pending_trade_candles', { p_account: account.id, p_limit: limit })
    if (error) throw error
    res.type('text/plain').send(formatPending(data || []))
  } catch (err) {
    console.error('[ea/candles/pending]', err.message)
    res.status(500).type('text/plain').send('error')
  }
})

// POST / → store the broker's candles for one closed trade
router.post('/', async (req, res) => {
  try {
    const { token, login, positionId, series: rawSeries } = req.body || {}
    if (!/^\d+$/.test(String(positionId ?? ''))) return res.status(400).json({ error: 'positionId required' })

    const account = await resolveAccount(token, login)
    if (!account) return res.status(401).json({ error: 'Invalid sync token' })

    const { data: trade } = await supabase
      .from('trades').select('id')
      .eq('user_id', account.user_id)
      .eq('broker_account_id', account.id)
      .eq('external_id', `mt5_${positionId}`)
      .maybeSingle()
    if (!trade) return res.status(404).json({ error: 'Trade not found' })

    // An empty series is valid on purpose: "the terminal has no history for
    // this trade" — it stops the EA from re-requesting it forever.
    const { series, bars } = sanitizeSeries(rawSeries)

    const { error } = await supabase.from('trade_candles').upsert(
      { trade_id: trade.id, user_id: account.user_id, series, source: 'mt5' },
      { onConflict: 'trade_id' },
    )
    if (error) throw error

    res.json({ stored: true, bars })
  } catch (err) {
    console.error('[ea/candles]', err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router