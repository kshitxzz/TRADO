import { Router } from 'express'
import crypto from 'crypto'
import { supabase } from '../config/supabase.js'

const router = Router()

const PLANS = {
  pro_monthly:  { amount: 849,  currency: 'INR', name: 'Trado Pro Monthly' },
  pro_yearly:   { amount: 8199, currency: 'INR', name: 'Trado Pro Yearly' },
}

function cashfreeHeaders() {
  return {
    'x-client-id':     process.env.CASHFREE_CLIENT_ID,
    'x-client-secret': process.env.CASHFREE_CLIENT_SECRET,
    'x-api-version':   '2023-08-01',
    'Content-Type':    'application/json',
  }
}

const CF_BASE = process.env.CASHFREE_ENV === 'production'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg'

// GET /api/payments/plans — single source of truth for pricing shown in the UI
router.get('/plans', (_req, res) => res.json({ plans: PLANS }))

// POST /api/payments/create-order
router.post('/create-order', async (req, res) => {
  try {
    const { planId, userId, userEmail, userName } = req.body
    const plan = PLANS[planId]
    if (!plan) return res.status(400).json({ error: 'Invalid plan' })

    const orderId = `TRADO_${userId.slice(0,8)}_${Date.now()}`

    const payload = {
      order_id:       orderId,
      order_amount:   plan.amount,
      order_currency: plan.currency,
      customer_details: {
        customer_id:    userId,
        customer_email: userEmail,
        customer_name:  userName || 'Trader',
        customer_phone: '9999999999',
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL}/dashboard?payment=success&plan=${planId}`,
        notify_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
      },
      order_note: plan.name,
    }

    const cfRes = await fetch(`${CF_BASE}/orders`, {
      method:  'POST',
      headers: cashfreeHeaders(),
      body:    JSON.stringify(payload),
    })
    const cfData = await cfRes.json()

    if (!cfRes.ok) {
      console.error('[Cashfree order error]', cfData)
      return res.status(500).json({ error: cfData.message || 'Payment creation failed' })
    }

    res.json({
      orderId:         cfData.order_id,
      paymentSessionId: cfData.payment_session_id,
      amount:          plan.amount,
      currency:        plan.currency,
      mode:            process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox',
    })
  } catch (err) {
    console.error('[Payment create error]', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/payments/verify
router.post('/verify', async (req, res) => {
  try {
    const { orderId, userId } = req.body
    const cfRes  = await fetch(`${CF_BASE}/orders/${orderId}`, { headers: cashfreeHeaders() })
    const cfData = await cfRes.json()

    const status  = cfData.order_status
    const success = status === 'PAID'

    if (success && userId) {
      const { error } = await supabase.from('users').update({ plan: 'pro' }).eq('id', userId)
      if (error) console.error('[Payment verify] failed to persist plan upgrade', error)
    }

    res.json({ success, status, orderId })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/payments/webhook — Cashfree webhook
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature']
    const timestamp = req.headers['x-webhook-timestamp']
    const body      = JSON.stringify(req.body)
    const secret    = process.env.CASHFREE_WEBHOOK_SECRET || ''

    // Verify signature
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(timestamp + body)
    const expectedSig = hmac.digest('base64')

    if (signature !== expectedSig) {
      console.warn('[Webhook] Invalid signature')
      return res.status(400).json({ error: 'Invalid signature' })
    }

    const event = req.body
    if (event.type === 'PAYMENT_SUCCESS_WEBHOOK') {
      const orderId = event.data?.order?.order_id
      const userId  = event.data?.order?.customer_details?.customer_id
      console.log(`[Webhook] Payment success: ${orderId} for user ${userId}`)
      if (userId) {
        const { error } = await supabase.from('users').update({ plan: 'pro' }).eq('id', userId)
        if (error) console.error('[Webhook] failed to persist plan upgrade', error)
      }
    }

    res.json({ received: true })
  } catch (err) {
    console.error('[Webhook error]', err)
    res.status(500).json({ error: err.message })
  }
})

export default router