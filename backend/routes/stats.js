import { Router } from 'express'
import { supabase } from '../config/supabase.js'

const router = Router()

// GET /api/stats/:userId/by-symbol
router.get('/:userId/by-symbol', async (req, res) => {
  try {
    const { data: trades } = await supabase
      .from('trades')
      .select('symbol, pnl, status')
      .eq('user_id', req.params.userId)
      .eq('status', 'closed')

    const map = {}
    ;(trades || []).forEach(t => {
      if (!map[t.symbol]) map[t.symbol] = { symbol: t.symbol, pnl: 0, count: 0, wins: 0 }
      map[t.symbol].pnl   += t.pnl
      map[t.symbol].count += 1
      if (t.pnl > 0) map[t.symbol].wins++
    })

    res.json(Object.values(map).sort((a, b) => b.pnl - a.pnl))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/stats/:userId/by-session
router.get('/:userId/by-session', async (req, res) => {
  try {
    const { data: trades } = await supabase
      .from('trades')
      .select('session, pnl, status')
      .eq('user_id', req.params.userId)
      .eq('status', 'closed')

    const map = { Asian: { pnl:0,count:0,wins:0 }, London: { pnl:0,count:0,wins:0 }, 'New York': { pnl:0,count:0,wins:0 } }
    ;(trades || []).forEach(t => {
      if (t.session && map[t.session]) {
        map[t.session].pnl   += t.pnl
        map[t.session].count += 1
        if (t.pnl > 0) map[t.session].wins++
      }
    })

    res.json(Object.entries(map).map(([session, v]) => ({ session, ...v })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/stats/:userId/equity-curve
router.get('/:userId/equity-curve', async (req, res) => {
  try {
    const { data: trades } = await supabase
      .from('trades')
      .select('pnl, closed_at')
      .eq('user_id', req.params.userId)
      .eq('status', 'closed')
      .order('closed_at', { ascending: true })

    let cumulative = 0
    const curve = (trades || []).map(t => {
      cumulative += t.pnl || 0
      return { date: t.closed_at?.slice(0, 10), pnl: parseFloat(cumulative.toFixed(2)) }
    })

    res.json(curve)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/stats/:userId/heatmap — daily pnl for calendar heatmap
router.get('/:userId/heatmap', async (req, res) => {
  try {
    const { data: trades } = await supabase
      .from('trades')
      .select('pnl, closed_at')
      .eq('user_id', req.params.userId)
      .eq('status', 'closed')

    const map = {}
    ;(trades || []).forEach(t => {
      const day = t.closed_at?.slice(0, 10)
      if (!day) return
      if (!map[day]) map[day] = { date: day, pnl: 0, count: 0 }
      map[day].pnl   += t.pnl
      map[day].count += 1
    })

    res.json(Object.values(map).sort((a, b) => a.date.localeCompare(b.date)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/stats/:userId/monthly
router.get('/:userId/monthly', async (req, res) => {
  try {
    const { data: trades } = await supabase
      .from('trades')
      .select('pnl, closed_at, status')
      .eq('user_id', req.params.userId)
      .eq('status', 'closed')

    const map = {}
    ;(trades || []).forEach(t => {
      const month = t.closed_at?.slice(0, 7)
      if (!month) return
      if (!map[month]) map[month] = { month, pnl: 0, trades: 0, wins: 0 }
      map[month].pnl    += t.pnl
      map[month].trades += 1
      if (t.pnl > 0) map[month].wins++
    })

    res.json(Object.values(map).sort((a, b) => a.month.localeCompare(b.month)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
