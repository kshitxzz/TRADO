import nodemailer from 'nodemailer'

// Gmail SMTP is the interim option until Trado has a custom domain +
// branded sending address. Requires a Gmail *App Password* (not the normal
// account password) — generate one at myaccount.google.com/apppasswords
// with 2-Step Verification turned on, then set GMAIL_USER / GMAIL_APP_PASSWORD
// in the backend .env. Until those are set, every call below no-ops with a
// console warning instead of throwing — email is a nice-to-have delivery
// channel, not something that should ever break a request.
let transporter = null
let warned = false

function getTransporter() {
  if (transporter) return transporter
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    if (!warned) {
      console.warn('[mailer] GMAIL_USER / GMAIL_APP_PASSWORD not set — email notifications are disabled until configured.')
      warned = true
    }
    return null
  }
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  })
  return transporter
}

// Returns { sent: boolean, reason?: string } instead of throwing, so callers
// (notification routes especially) can treat email as best-effort.
export async function sendMail({ to, subject, html, text }) {
  const t = getTransporter()
  if (!t) return { sent: false, reason: 'not_configured' }
  if (!to) return { sent: false, reason: 'no_recipient' }

  try {
    await t.sendMail({
      from: `"Trado" <${process.env.GMAIL_USER}>`,
      to, subject, html, text: text || html?.replace(/<[^>]+>/g, ''),
    })
    return { sent: true }
  } catch (err) {
    console.error('[mailer] send failed:', err.message)
    return { sent: false, reason: 'send_failed' }
  }
}