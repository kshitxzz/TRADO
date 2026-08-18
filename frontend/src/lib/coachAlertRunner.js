import { supabase } from './supabaseClient'
import { api } from './api'
import { evaluateCoachRules, withCoachDefaults } from './analytics'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'
export const RECHECK_WINDOW_MIN = 15

// Evaluates coach rules against the given trades/settings/balance, writes
// any newly-breached (and not-recently-fired, per RECHECK_WINDOW_MIN) rule
// to ai_alerts, and — if emailEnabled — fires exactly one email per new
// alert right here at the point of creation. Extracted out of AIAlertsTab
// so Dashboard (and anywhere else) can trigger the same check using
// whatever trades/account data it already has, instead of breaches only
// ever being caught while the AI Alerts tab happens to be open.
export async function checkAndFireCoachAlerts({ userId, trades, coachSettings, accountBalance, emailEnabled }) {
  if (!userId) return []
  const settings  = withCoachDefaults(coachSettings)
  const breaches  = evaluateCoachRules(trades, settings, accountBalance)
  if (!breaches.length) return []

  const cutoff = new Date(Date.now() - RECHECK_WINDOW_MIN * 60 * 1000).toISOString()
  const { data: recent } = await supabase.from('ai_alerts').select('rule_type')
    .eq('user_id', userId).gte('created_at', cutoff)
  const recentTypes = new Set((recent || []).map(r => r.rule_type))

  const created = []
  for (const b of breaches) {
    if (recentTypes.has(b.ruleType)) continue
    try {
      const res = await fetch(`${BACKEND}/api/ai/alert-message`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleType: b.ruleType, severity: b.severity, facts: b.facts }),
      })
      const data = await res.json()
      if (!data.aiAvailable) continue

      const { data: row, error } = await supabase.from('ai_alerts').insert({
        user_id: userId, rule_type: b.ruleType, severity: b.severity,
        title: data.title, message: data.message, meta: b.facts,
      }).select().single()
      if (error || !row) continue

      created.push(row)

      // Fired once, right here — not from the realtime subscription that
      // drives the toast/bell — so having multiple tabs open never sends
      // more than one email for the same breach.
      if (emailEnabled) {
        api.post('/notifications/email-alert', {
          title: row.title, message: row.message, severity: row.severity, ruleType: row.rule_type,
        }).catch(() => {}) // best-effort — email delivery failing shouldn't affect the UI
      }
    } catch (err) {
      console.error('[coachAlertRunner] failed to fire alert', b.ruleType, err)
    }
  }
  return created
}