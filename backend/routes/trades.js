import { Router } from 'express'
import { supabase } from '../config/supabase.js'

const router = Router()

// GET /api/trades/:userId
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const { status, symbol, session, limit = 200 } = req.query

    let query = supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('closed_at', { ascending: false })
      .limit(Number(limit))

    if (status)  query = query.eq('status', status)
    if (symbol)  query = query.eq('symbol', symbol)
    if (session) query = query.eq('session', session)

    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/trades — Insert a single trade manually
router.post('/', async (req, res) => {
  try {
    const trade = req.body
    if (!trade.user_id) return res.status(400).json({ error: 'user_id required' })
    const { data, error } = await supabase.from('trades').insert(trade).select().single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/trades/:id — Update trade (tags, notes, etc.)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body
    const { data, error } = await supabase.from('trades').update(updates).eq('id', id).select().single()
    if (error) throw error
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/trades/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await supabase.from('trades').delete().eq('id', id)
    if (error) throw error
    res.json({ deleted: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/trades/:userId/stats — Aggregated stats
router.get('/:userId/stats', async (req, res) => {
  try {
    const { userId } = req.params
    const { data: trades, error } = await supabase.from('trades').select('*').eq('user_id', userId).eq('status', 'closed')
    if (error) throw error

    const wins   = trades.filter(t => t.pnl > 0)
    const losses = trades.filter(t => t.pnl < 0)
    const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0)
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0)
    const grossLoss   = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))

    res.json({
      tradeCount:    trades.length,
      winCount:      wins.length,
      lossCount:     losses.length,
      winRate:       trades.length ? (wins.length / trades.length) * 100 : 0,
      totalPnl,
      grossProfit,
      grossLoss,
      profitFactor:  grossLoss > 0 ? grossProfit / grossLoss : 0,
      avgWin:        wins.length   ? grossProfit / wins.length : 0,
      avgLoss:       losses.length ? grossLoss   / losses.length : 0,
      bestTrade:     trades.length ? Math.max(...trades.map(t => t.pnl)) : 0,
      worstTrade:    trades.length ? Math.min(...trades.map(t => t.pnl)) : 0,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
