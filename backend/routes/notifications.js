import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth } from '../middleware/auth.js'
import { sendMail } from '../services/mailer.js'

const router = Router()
const LIMITER = rateLimit({ windowMs: 60_000, max: 30, message: { error: 'Too many notification requests' } })

const SEVERITY_LABEL = { critical: 'Critical', warning: 'Warning', info: 'Info' }

// POST /api/notifications/email-alert — fires one email for one already-created
// AI Alert. Recipient is always req.user.email (from the verified session) —
// never trusted from the request body — so this can't be used to spam an
// arbitrary address. Called once, right after the alert is inserted, by
// whichever client happened to trigger the coach check (not by every open
// tab), so a single breach never sends more than one email.
router.post('/email-alert', requireAuth, LIMITER, async (req, res) => {
  const { title, message, severity = 'warning', ruleType } = req.body
  if (!title || !message) return res.status(400).json({ error: 'title and message are required' })

  const to = req.user.email
  const label = SEVERITY_LABEL[severity] || 'Alert'

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0B0A0F;color:#F4F4F5;border-radius:16px;">
      <p style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#8B5CF6;margin:0 0 12px;">Trado AI Coach · ${label}</p>
      <h1 style="font-size:20px;margin:0 0 8px;">${title}</h1>
      <p style="font-size:14px;line-height:1.6;color:#A1A1AA;margin:0 0 20px;">${message}</p>
      <a href="${process.env.FRONTEND_URL || 'https://app.tradofx.com'}/trado-ai-2"
         style="display:inline-block;padding:10px 18px;background:#8B5CF6;color:#fff;text-decoration:none;border-radius:10px;font-size:13px;font-weight:600;">
        Open AI Alerts
      </a>
    </div>`

  const result = await sendMail({ to, subject: `${label}: ${title}`, html })
  res.json(result)
})

export default router