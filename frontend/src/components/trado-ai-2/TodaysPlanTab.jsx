import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, ChevronDown, ChevronUp, Loader2, ShieldAlert, Gauge, Radio, AlarmClock, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabaseClient'
import { computeTodaysPlanFacts, computeLiveCockpit, withCoachDefaults } from '../../lib/analytics'
import { getNextSessionOpen } from '../../hooks/useTimezone'
import { formatPnl } from '../../lib/utils'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

const VERDICT_STYLE = {
  'STAND DOWN': { color: '#F43F5E', glow: 'rgba(244,63,94,0.10)', border: 'rgba(244,63,94,0.35)' },
  'CAUTION':    { color: '#F59E0B', glow: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.35)' },
  'GO':         { color: '#22C55E', glow: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.35)' },
}

function todayStr() { return new Date().toISOString().slice(0, 10) }

function formatCountdown(ms) {
  if (ms == null || ms < 0) return '—'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  const s = Math.floor((ms % 60000) / 1000)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function fmtPlanDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ── Live Cockpit tile ─────────────────────────────────────────────────────
function CockpitTile({ icon: Icon, label, children, accent }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={11} style={{ color: accent || 'var(--text-muted)' }} />
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</p>
      </div>
      {children}
    </div>
  )
}

export default function TodaysPlanTab({ user, trades, account, profile }) {
  const coachSettings = withCoachDefaults(profile?.coach_settings)
  const [plan, setPlan] = useState(null) // { verdict, headline, edge, maxLoss, thePlay, aiAvailable, aiMessage }
  const [loadingPlan, setLoadingPlan] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [pastPlans, setPastPlans] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const fetchedForUser = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const cockpit = computeLiveCockpit(trades, coachSettings)
  const nextWindow = getNextSessionOpen()
  const countdownMs = nextWindow ? nextWindow.opensAt.getTime() - now.getTime() : null

  const generatePlan = useCallback(async (force = false) => {
    if (!user?.id) return
    if (force) setRegenerating(true); else setLoadingPlan(true)

    try {
      if (!force) {
        const { data: existing } = await supabase
          .from('ai_daily_plans').select('*')
          .eq('user_id', user.id).eq('plan_date', todayStr()).maybeSingle()
        if (existing) {
          setPlan({ verdict: existing.verdict, ...existing.body })
          setLoadingPlan(false)
          return
        }
      }

      const facts = computeTodaysPlanFacts(trades, coachSettings)
      const res = await fetch(`${BACKEND}/api/ai/todays-plan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facts }),
      })
      const data = await res.json()
      const body = data.aiAvailable
        ? { headline: data.headline, edge: data.edge, maxLoss: data.maxLoss, thePlay: data.thePlay }
        : { headline: null, edge: null, maxLoss: null, thePlay: null, aiUnavailable: true, aiMessage: data.message }

      setPlan({ verdict: facts.verdict, ...body })

      await supabase.from('ai_daily_plans').upsert(
        { user_id: user.id, plan_date: todayStr(), verdict: facts.verdict, body },
        { onConflict: 'user_id,plan_date' }
      )
      loadPastPlans()
    } catch (err) {
      console.error('[TodaysPlan] generate failed', err)
      setPlan({ verdict: 'GO', headline: null, aiUnavailable: true, aiMessage: 'Could not reach the AI service.' })
    }
    setLoadingPlan(false)
    setRegenerating(false)
  }, [user?.id, trades, coachSettings])

  const loadPastPlans = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase
      .from('ai_daily_plans').select('*')
      .eq('user_id', user.id).neq('plan_date', todayStr())
      .order('plan_date', { ascending: false }).limit(14)
    setPastPlans(data || [])
  }, [user?.id])

  const deletePastPlan = useCallback(async (planId) => {
    if (!user?.id) return
    if (!window.confirm('Delete this plan?')) return
    const { error } = await supabase.from('ai_daily_plans').delete()
      .eq('id', planId).eq('user_id', user.id)
    if (error) { toast.error('Could not delete plan: ' + error.message); return }
    setPastPlans(prev => prev.filter(p => p.id !== planId))
    setExpandedId(prev => (prev === planId ? null : prev))
    toast.success('Plan deleted')
  }, [user?.id])

  useEffect(() => {
    if (!user?.id || fetchedForUser.current === user.id) return
    fetchedForUser.current = user.id
    generatePlan(false)
    loadPastPlans()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const vStyle = VERDICT_STYLE[plan?.verdict] || VERDICT_STYLE['CAUTION']
  const edgeBand = cockpit.edge.band
  const edgeColor = edgeBand === 'strong' ? 'var(--positive-green)' : edgeBand === 'weak' ? 'var(--negative-red)' : 'var(--warning-orange)'

  return (
    <div className="space-y-5">
      {/* Verdict card */}
      <div className="rounded-2xl p-5" style={{ background: `linear-gradient(160deg, ${vStyle.glow}, transparent 60%)`, border: `1px solid ${vStyle.border}` }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Verdict for Today</p>
          <button onClick={() => generatePlan(true)} disabled={regenerating || loadingPlan}
                  className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ color: 'var(--text-secondary)' }}>
            <RefreshCw size={11} className={regenerating ? 'animate-spin' : ''} /> Regenerate
          </button>
        </div>

        {loadingPlan ? (
          <div className="flex items-center gap-2 py-6" style={{ color: 'var(--text-muted)' }}>
            <Loader2 size={16} className="animate-spin" /> <span className="text-sm">Building today's plan from your trade history…</span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4">
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight" style={{ color: vStyle.color }}>{plan?.verdict || 'GO'}</h2>
              <p className="text-sm max-w-xl" style={{ color: 'var(--text-secondary)' }}>
                {plan?.headline || (plan?.aiUnavailable ? plan.aiMessage : '')}
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Edge</p>
                <p className="text-xs leading-relaxed" style={{ color: vStyle.color }}>{plan?.edge || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Max Loss</p>
                <p className="text-xs leading-relaxed font-medium" style={{ color: 'var(--text-primary)' }}>{plan?.maxLoss || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>The Play</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>{plan?.thePlay || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Next Window</p>
                <p className="text-xs leading-relaxed font-semibold" style={{ color: 'var(--warning-orange)' }}>
                  {nextWindow ? `${nextWindow.session} · ${formatCountdown(countdownMs)}` : '—'}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Live Cockpit */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Live Cockpit</p>
          <p className="text-[10px] flex items-center gap-1" style={{ color: 'var(--positive-green)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--positive-green)' }} /> updating every 30s
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <CockpitTile icon={Gauge} label="Your Edge Today" accent={edgeColor}>
            <p className="text-lg font-extrabold uppercase mb-1.5" style={{ color: edgeColor }}>{edgeBand}</p>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover, rgba(255,255,255,0.06))' }}>
              <div className="h-full rounded-full" style={{ width: `${cockpit.edge.score}%`, background: edgeColor }} />
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
              {cockpit.edge.hasEnoughData ? `band: ${edgeBand} · score ${cockpit.edge.score}` : 'not enough recent trades yet'}
            </p>
          </CockpitTile>

          <CockpitTile icon={Radio} label="Today · Live">
            <p className="text-lg font-extrabold" style={{ color: cockpit.todayPnl > 0 ? 'var(--positive-green)' : cockpit.todayPnl < 0 ? 'var(--negative-red)' : 'var(--text-primary)' }}>
              {formatPnl(cockpit.todayPnl)}
            </p>
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
              {cockpit.todayTradeCount === 0 ? 'no trades yet today' : `${cockpit.todayTradeCount} trade${cockpit.todayTradeCount === 1 ? '' : 's'} today`}
            </p>
          </CockpitTile>

          <CockpitTile icon={AlarmClock} label="Window Opening" accent="var(--warning-orange)">
            <p className="text-lg font-extrabold" style={{ color: 'var(--text-primary)' }}>{nextWindow?.session || '—'}</p>
            <p className="text-[10px] mt-1.5 font-mono" style={{ color: 'var(--warning-orange)' }}>{formatCountdown(countdownMs)}</p>
          </CockpitTile>

          <CockpitTile icon={ShieldAlert} label="Coach" accent={cockpit.dailyLoss.isBreached ? 'var(--negative-red)' : 'var(--text-muted)'}>
            {cockpit.dailyLoss.isBreached ? (
              <p className="text-xs font-semibold leading-relaxed" style={{ color: 'var(--negative-red)' }}>
                Limit was ${cockpit.dailyLoss.limit}. Loss is ${cockpit.dailyLoss.loss.toFixed(0)}.
              </p>
            ) : (
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {cockpit.dailyLoss.loss > 0
                  ? `Using ${cockpit.dailyLoss.pctOfLimit.toFixed(0)}% of your $${cockpit.dailyLoss.limit} daily loss limit.`
                  : `Within your $${cockpit.dailyLoss.limit} daily loss limit.`}
              </p>
            )}
          </CockpitTile>
        </div>
      </div>

      {/* Past Plans */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Past Plans</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>last 14 days</p>
        </div>
        <div className="glass-card divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {pastPlans.length === 0 && (
            <p className="text-xs p-4" style={{ color: 'var(--text-muted)' }}>No past plans yet — check back tomorrow.</p>
          )}
          {pastPlans.map(p => {
            const style = VERDICT_STYLE[p.verdict] || VERDICT_STYLE['CAUTION']
            const isOpen = expandedId === p.id
            return (
              <div key={p.id} style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="flex items-center gap-1 pr-2">
                  <button onClick={() => setExpandedId(isOpen ? null : p.id)}
                          className="flex-1 min-w-0 flex items-center justify-between px-4 py-3 text-left hover:opacity-90">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: style.color }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{fmtPlanDate(p.plan_date)}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: style.color }}>{p.verdict}</p>
                      </div>
                    </div>
                    {isOpen ? <ChevronUp size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                  </button>
                  <button onClick={() => deletePastPlan(p.id)}
                          title="Delete plan"
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(244,63,94,0.1)'; e.currentTarget.style.color = '#EF4444' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                {isOpen && (
                  <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {['edge', 'maxLoss', 'thePlay'].map(key => p.body?.[key] && (
                      <div key={key}>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                          {key === 'edge' ? 'Edge' : key === 'maxLoss' ? 'Max Loss' : 'The Play'}
                        </p>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{p.body[key]}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-[11px] mt-2 px-1 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
          Plans are saved automatically — switch accounts to see per-account history.
        </p>
      </div>
    </div>
  )
}