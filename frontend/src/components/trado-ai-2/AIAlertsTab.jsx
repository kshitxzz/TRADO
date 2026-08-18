import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Activity, Loader2, Settings2, Save, Check,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { withCoachDefaults } from '../../lib/analytics'
import { checkAndFireCoachAlerts, RECHECK_WINDOW_MIN } from '../../lib/coachAlertRunner'
import { RULE_META, SEVERITY_COLOR, timeAgo } from '../../lib/alertMeta'

const RULE_TOGGLES = [
  { key: 'lossStreak',     title: 'Loss streak',     desc: 'Nudges after N losing trades in a row to break the tilt loop.' },
  { key: 'dailyLoss',      title: 'Daily loss limit', desc: "Warns at 80% and stops you at 100% of your daily loss cap." },
  { key: 'positionSize',   title: 'Position size',   desc: 'Flags trades whose realized loss exceeds your max-per-trade rule.' },
  { key: 'sessionPattern', title: 'Session pattern', desc: "Heads-up when you trade in a session that's been costly recently." },
  { key: 'symbolWarning',  title: 'Symbol warning',  desc: "Heads-up when you take a position on a symbol that's been bleeding." },
]

export default function AIAlertsTab({ trades, account }) {
  const { user, profile, fetchProfile } = useAuth()
  const [alerts, setAlerts] = useState([])
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  const [checking, setChecking] = useState(false)
  const [form, setForm] = useState(() => withCoachDefaults(profile?.coach_settings))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const initializedFor = useRef(null)

  useEffect(() => { setForm(withCoachDefaults(profile?.coach_settings)) }, [profile?.coach_settings])

  const loadAlerts = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase.from('ai_alerts').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(50)
    setAlerts(data || [])
    setLoadingAlerts(false)
  }, [user?.id])

  const checkAndFireAlerts = useCallback(async () => {
    if (!user?.id) return
    setChecking(true)
    try {
      await checkAndFireCoachAlerts({
        userId: user.id,
        trades,
        coachSettings: profile?.coach_settings,
        accountBalance: account?.balance != null ? parseFloat(account.balance) : null,
        emailEnabled: !!profile?.notification_settings?.email,
      })
    } finally {
      await loadAlerts()
      setChecking(false)
    }
  }, [user?.id, profile?.coach_settings, profile?.notification_settings?.email, trades, account?.balance, loadAlerts])

  useEffect(() => {
    if (!user?.id || initializedFor.current === user.id) return
    initializedFor.current = user.id
    checkAndFireAlerts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function saveSettings() {
    if (!user?.id) return
    setSaving(true)
    const { error } = await supabase.from('users').update({ coach_settings: form }).eq('id', user.id)
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      fetchProfile?.(user.id)
      checkAndFireAlerts()
    }
  }

  const todayCount = alerts.filter(a => a.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length

  return (
    <div className="space-y-5">
      {/* Alerts feed */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.14)' }}>
              <Activity size={16} style={{ color: 'var(--accent-purple)' }} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Today's Alerts</h2>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Coach fires checked every {RECHECK_WINDOW_MIN} minutes{checking ? ' · checking now…' : ''}
              </p>
            </div>
          </div>
          <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{todayCount} today</p>
        </div>

        {loadingAlerts ? (
          <div className="flex items-center gap-2 justify-center p-8" style={{ color: 'var(--text-muted)' }}>
            <Loader2 size={15} className="animate-spin" /> <span className="text-sm">Checking your rules…</span>
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>No alerts — you're clean</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nothing has breached your coach rules yet.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {alerts.map(a => {
              const meta = RULE_META[a.rule_type] || RULE_META.daily_loss
              const color = SEVERITY_COLOR[a.severity] || 'var(--text-muted)'
              return (
                <div key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />
                  <meta.icon size={13} className="flex-shrink-0 mt-0.5" style={{ color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{a.title}</p>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${color}18`, color }}>{meta.label}</span>
                    </div>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{a.message}</p>
                  </div>
                  <p className="text-[10px] flex-shrink-0 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{timeAgo(a.created_at)}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Coach Settings */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.14)' }}>
            <Settings2 size={16} style={{ color: 'var(--accent-purple)' }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Coach Settings</h2>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Thresholds the evaluator uses on each check</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Daily loss limit (USD)</label>
            <input type="number" min="0" className="input-dark w-full" value={form.dailyLossLimit}
                   onChange={e => setForm(f => ({ ...f, dailyLossLimit: parseFloat(e.target.value) || 0 }))} />
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Warns at 80%, stops at 100%.</p>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Max risk per trade (%)</label>
            <input type="number" min="0" step="0.1" className="input-dark w-full" value={form.maxRiskPct}
                   onChange={e => setForm(f => ({ ...f, maxRiskPct: parseFloat(e.target.value) || 0 }))} />
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Risk = realized loss / account balance.</p>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Loss streak threshold</label>
            <input type="number" min="1" step="1" className="input-dark w-full" value={form.lossStreakThreshold}
                   onChange={e => setForm(f => ({ ...f, lossStreakThreshold: parseInt(e.target.value) || 1 }))} />
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Fires when consecutive losses reach this.</p>
          </div>
        </div>

        <div className="mb-2">
          <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-secondary)' }}>Enabled rules</p>
          <p className="text-[10px] mb-3" style={{ color: 'var(--text-muted)' }}>Uncheck to silence individual coach behaviors without changing thresholds.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {RULE_TOGGLES.map(rt => (
              <label key={rt.key} className="flex items-start gap-2.5 p-3 rounded-lg cursor-pointer"
                     style={{ background: 'var(--bg-hover, rgba(255,255,255,0.03))', border: '1px solid var(--border-subtle)' }}>
                <input type="checkbox" className="mt-0.5 accent-[var(--accent-purple)]" checked={!!form.enabledRules[rt.key]}
                       onChange={e => setForm(f => ({ ...f, enabledRules: { ...f.enabledRules, [rt.key]: e.target.checked } }))} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{rt.title}</p>
                  <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{rt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button onClick={saveSettings} disabled={saving}
                  className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 disabled:opacity-60">
            {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Save size={13} />}
            {saved ? 'Saved' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}