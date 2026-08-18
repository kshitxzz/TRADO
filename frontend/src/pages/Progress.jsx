import { useState, useEffect, useMemo } from 'react'
import { Rocket, LayoutGrid, TrendingUp, Lightbulb, Target, Calculator } from 'lucide-react'
import PageWrapper from '../components/layout/PageWrapper'
import { useAuth } from '../hooks/useAuth'
import { useTrades } from '../hooks/useTrades'
import {
  computeGrowthOverview, computeScaleUpOpportunities, computeStrengthsWeaknesses, computeActionItems,
} from '../lib/analytics'
import OverviewTab from '../components/growth-roadmap/OverviewTab'
import GrowthPathTab from '../components/growth-roadmap/GrowthPathTab'
import InsightsTab from '../components/growth-roadmap/InsightsTab'
import ActionItemsTab from '../components/growth-roadmap/ActionItemsTab'
import GoalCalculatorTab from '../components/growth-roadmap/GoalCalculatorTab'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

const TABS = [
  { key: 'Overview', icon: LayoutGrid },
  { key: 'Growth Path', icon: TrendingUp },
  { key: 'Insights', icon: Lightbulb },
  { key: 'Action Items', icon: Target },
  { key: 'Goal Calculator', icon: Calculator },
]

export default function Progress() {
  const { user } = useAuth()
  const { trades, syncing, syncTrades, isManualAccount } = useTrades(user?.id)
  const [activeTab, setActiveTab] = useState('Overview')

  const overview = useMemo(() => computeGrowthOverview(trades), [trades])
  const opportunities = useMemo(() => computeScaleUpOpportunities(trades, overview), [trades, overview])
  const strengthsWeaknesses = useMemo(() => computeStrengthsWeaknesses(overview), [overview])
  const actionItems = useMemo(() => computeActionItems(trades, overview, strengthsWeaknesses), [trades, overview, strengthsWeaknesses])

  const [ai, setAi] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    if (overview.stats.tradeCount === 0) { setAi(null); return }
    let cancelled = false
    setAiLoading(true)

    const context = {
      status: overview.status, healthScore: overview.healthScore, focusMessage: overview.focusMessage,
      stats: overview.stats, opportunities, weaknesses: strengthsWeaknesses.weaknesses, strengths: strengthsWeaknesses.strengths,
    }

    fetch(`${BACKEND}/api/ai/growth-roadmap`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context }),
    })
      .then(r => r.json())
      .then(data => { if (!cancelled) setAi(data) })
      .catch(() => { if (!cancelled) setAi({ aiAvailable: false, reason: 'network_error', message: 'Could not reach the backend.' }) })
      .finally(() => { if (!cancelled) setAiLoading(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview.stats.tradeCount, overview.status, overview.healthScore])

  return (
    <PageWrapper onSync={!isManualAccount ? syncTrades : undefined} syncing={syncing}>
      <div className="glass-card p-5 mb-5 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--gradient-primary)' }}>
          <Rocket size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Growth Roadmap</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Your personalized path to trading success</p>
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

      {overview.stats.tradeCount === 0 ? (
        <div className="glass-card p-10 text-center">
          <Rocket size={26} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>No Closed Trades Yet</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Log or sync trades to unlock your Growth Roadmap.</p>
        </div>
      ) : (
        <>
          {activeTab === 'Overview' && <OverviewTab overview={overview} ai={ai} aiLoading={aiLoading} />}
          {activeTab === 'Growth Path' && <GrowthPathTab opportunities={opportunities} closedCount={overview.stats.tradeCount} />}
          {activeTab === 'Insights' && <InsightsTab overview={overview} strengthsWeaknesses={strengthsWeaknesses} />}
          {activeTab === 'Action Items' && <ActionItemsTab items={actionItems} />}
          {activeTab === 'Goal Calculator' && <GoalCalculatorTab overview={overview} />}
        </>
      )}
    </PageWrapper>
  )
}