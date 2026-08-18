import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Brain, Calendar, ChevronDown, LayoutGrid, Flag, TrendingUp, Shield, Clock, RefreshCw, Loader2,
} from 'lucide-react'
import PageWrapper from '../components/layout/PageWrapper'
import { useAuth } from '../hooks/useAuth'
import { useTrades } from '../hooks/useTrades'
import { computeStats } from '../lib/utils'
import {
  PERIOD_OPTIONS, filterTradesByPeriod, periodLabel,
  computeScalingVerdict, computeBehavioralFlags, computeEmotionalPatterns, computeRealityCheck,
  computeStreakAnalysis, computePerformanceBenchmarks, computeTradeQualityAggregate,
  computeRiskSizing, computeTimeInsights, computeCorrelations, computeSmartInsights,
} from '../lib/analytics'
import OverviewTab from '../components/ai-analysis/OverviewTab'
import BehaviorDisciplineTab from '../components/ai-analysis/BehaviorDisciplineTab'
import PerformanceTab from '../components/ai-analysis/PerformanceTab'
import RiskSizingTab from '../components/ai-analysis/RiskSizingTab'
import PatternsTimingTab from '../components/ai-analysis/PatternsTimingTab'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

const TABS = [
  { key: 'Overview', icon: LayoutGrid },
  { key: 'Behavior & Discipline', icon: Flag },
  { key: 'Performance', icon: TrendingUp },
  { key: 'Risk & Sizing', icon: Shield },
  { key: 'Patterns & Timing', icon: Clock },
]

// ─── Period dropdown ─────────────────────────────────────────────────────
function PeriodSelector({ period, setPeriod, custom, setCustom }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="btn-outline text-xs px-3.5 py-2 flex items-center gap-2">
        <Calendar size={13} /> {periodLabel(period, custom)} <ChevronDown size={13} className={open ? 'rotate-180' : ''} style={{ transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl overflow-hidden z-20" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}>
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt} onClick={() => { setPeriod(opt); if (opt !== 'Custom Range') setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-xs flex items-center justify-between transition-colors"
              style={{ color: period === opt ? 'var(--accent-purple-light)' : 'var(--text-secondary)', background: period === opt ? 'rgba(139,92,246,0.1)' : 'transparent' }}>
              {opt} {period === opt && <span>✓</span>}
            </button>
          ))}
          {period === 'Custom Range' && (
            <div className="p-3 border-t space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
              <div>
                <label className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Start Date</label>
                <input type="date" value={custom.start || ''} onChange={e => setCustom(c => ({ ...c, start: e.target.value }))} className="input-dark w-full text-xs mt-1" />
              </div>
              <div>
                <label className="text-[10px]" style={{ color: 'var(--text-muted)' }}>End Date</label>
                <input type="date" value={custom.end || ''} onChange={e => setCustom(c => ({ ...c, end: e.target.value }))} className="input-dark w-full text-xs mt-1" />
              </div>
              <button onClick={() => setOpen(false)} className="btn-primary w-full text-xs py-2">Apply</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Data hook: filters trades by period, computes every section's stats,
// and fetches the single deep-analysis AI narrative call. ─────────────────
function useAIAnalysis(trades, account) {
  const [period, setPeriod] = useState('This Month')
  const [custom, setCustom] = useState({ start: '', end: '' })

  const filteredTrades = useMemo(() => filterTradesByPeriod(trades, period, custom), [trades, period, custom.start, custom.end])
  const accountBalance = account?.balance != null
    ? parseFloat(account.balance)
    : account
      ? 10000 + computeStats(trades).totalPnl
      : 0

  const computed = useMemo(() => {
    const overallStats = computeStats(filteredTrades)
    const behavioralFlags = computeBehavioralFlags(filteredTrades)
    return {
      overallStats,
      scalingVerdict: computeScalingVerdict(overallStats),
      behavioralFlags,
      emotionalPatterns: computeEmotionalPatterns(filteredTrades),
      realityCheck: computeRealityCheck(filteredTrades, accountBalance),
      streakAnalysis: computeStreakAnalysis(filteredTrades),
      performanceBenchmarks: computePerformanceBenchmarks(filteredTrades),
      tradeQuality: computeTradeQualityAggregate(filteredTrades),
      riskSizing: computeRiskSizing(filteredTrades, accountBalance),
      timeInsights: computeTimeInsights(filteredTrades),
      correlations: computeCorrelations(filteredTrades),
      smartInsights: computeSmartInsights(filteredTrades),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTrades, accountBalance])

  const [ai, setAi] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const closedCount = filteredTrades.filter(t => t.status === 'closed').length
    if (closedCount === 0) { setAi(null); return }
    let cancelled = false
    setAiLoading(true)

    const context = {
      streaks: computed.streakAnalysis,
      benchmarks: computed.performanceBenchmarks,
      quality: computed.tradeQuality,
      risk: computed.riskSizing,
      time: computed.timeInsights,
      correlations: computed.correlations,
    }

    fetch(`${BACKEND}/api/ai/deep-analysis`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context }),
    })
      .then(r => r.json())
      .then(data => { if (!cancelled) setAi(data) })
      .catch(() => { if (!cancelled) setAi({ aiAvailable: false, reason: 'network_error', message: 'Could not reach the backend.' }) })
      .finally(() => { if (!cancelled) setAiLoading(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTrades.length, period, nonce])

  return { period, setPeriod, custom, setCustom, computed, ai, aiLoading, regenerate: () => setNonce(n => n + 1) }
}

export default function TradoAIPage() {
  const { user } = useAuth()
  const { trades, account, loading, syncing, syncTrades } = useTrades(user?.id)
  const location = useLocation()

  const [activeTab, setActiveTab] = useState(location.state?.tab && TABS.some(t => t.key === location.state.tab) ? location.state.tab : 'Overview')

  const { period, setPeriod, custom, setCustom, computed, ai, aiLoading, regenerate } = useAIAnalysis(trades, account)

  const closedCount = computed.overallStats.tradeCount

  return (
    <PageWrapper onSync={syncTrades} syncing={syncing}>
      <div className="glass-card p-5 mb-5 flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--gradient-primary)' }}>
            <Brain size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>AI Analysis</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Advanced statistical insights from your trading data</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {aiLoading && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
          <button onClick={regenerate} title="Regenerate AI insights" className="btn-outline text-xs px-3 py-2 flex items-center gap-1.5">
            <RefreshCw size={13} /> Regenerate
          </button>
          <PeriodSelector period={period} setPeriod={setPeriod} custom={custom} setCustom={setCustom} />
        </div>
      </div>

      <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium flex-shrink-0 transition-colors"
            style={{
              background: activeTab === t.key ? 'rgba(139,92,246,0.14)' : 'transparent',
              color: activeTab === t.key ? 'var(--accent-purple-light)' : 'var(--text-secondary)',
              border: `1px solid ${activeTab === t.key ? 'rgba(139,92,246,0.3)' : 'transparent'}`,
            }}>
            <t.icon size={15} /> {t.key}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-3">{[0, 1, 2].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}</div>
      ) : closedCount === 0 ? (
        <div className="glass-card p-10 text-center">
          <Brain size={26} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>No Closed Trades in This Period</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Log or sync trades, or widen the period above, to unlock your AI analysis.</p>
        </div>
      ) : (
        <>
          {activeTab === 'Overview' && <OverviewTab computed={computed} onNavigate={setActiveTab} />}
          {activeTab === 'Behavior & Discipline' && <BehaviorDisciplineTab computed={computed} />}
          {activeTab === 'Performance' && <PerformanceTab computed={computed} ai={ai} aiLoading={aiLoading} />}
          {activeTab === 'Risk & Sizing' && <RiskSizingTab computed={computed} ai={ai} />}
          {activeTab === 'Patterns & Timing' && <PatternsTimingTab computed={computed} ai={ai} />}
        </>
      )}
    </PageWrapper>
  )
}