import { useMemo, useState } from 'react'
import { TrendingUp, LayoutGrid, FileText, ArrowLeftRight, Calendar as CalendarIcon } from 'lucide-react'
import PageWrapper from '../../components/layout/PageWrapper'
import { useAuth } from '../../hooks/useAuth'
import { useTrades } from '../../hooks/useTrades'
import { computeStats } from '../../lib/utils'
import { BLUE } from '../../components/advanced-reports/shared'
import PerformanceTab from '../../components/advanced-reports/PerformanceTab'
import OverviewTab from '../../components/advanced-reports/OverviewTab'
import ReportsTab from '../../components/advanced-reports/ReportsTab'
import CompareTab from '../../components/advanced-reports/CompareTab'
import CalendarTab from '../../components/advanced-reports/CalendarTab'

const TABS = [
  { value: 'performance', label: 'Performance', icon: TrendingUp },
  { value: 'overview',    label: 'Overview',    icon: LayoutGrid },
  { value: 'reports',     label: 'Reports',     icon: FileText },
  { value: 'compare',     label: 'Compare',     icon: ArrowLeftRight },
  { value: 'calendar',    label: 'Calendar',    icon: CalendarIcon },
]

export default function AdvancedReports() {
  const { user } = useAuth()
  const { trades, account, syncing, syncTrades, isManualAccount } = useTrades(user?.id)
  const [tab, setTab] = useState('performance')

  const closed = useMemo(() => trades.filter(t => t.status === 'closed'), [trades])
  const wins   = useMemo(() => closed.filter(t => (t.pnl || 0) > 0), [closed])
  const losses = useMemo(() => closed.filter(t => (t.pnl || 0) < 0), [closed])

  const stats = useMemo(() => computeStats(closed), [closed])

  const totalTradingDays = useMemo(() => {
    const set = new Set(closed.map(t => t.closed_at?.slice(0, 10)).filter(Boolean))
    return set.size
  }, [closed])

  const avgDailyVolume = useMemo(() => {
    if (totalTradingDays === 0) return 0
    const totalLots = closed.reduce((s, t) => s + (t.size || 0), 0)
    return totalLots / totalTradingDays
  }, [closed, totalTradingDays])

  const { avgHoldAll, avgHoldWins, avgHoldLoss } = useMemo(() => {
    function mins(t) {
      if (!t.opened_at || !t.closed_at) return null
      return (new Date(t.closed_at) - new Date(t.opened_at)) / 60000
    }
    function avg(arr) {
      const m = arr.map(mins).filter(x => x != null && x >= 0)
      return m.length > 0 ? m.reduce((s, x) => s + x, 0) / m.length : null
    }
    return { avgHoldAll: avg(closed), avgHoldWins: avg(wins), avgHoldLoss: avg(losses) }
  }, [closed, wins, losses])

  const sharedProps = { closed, trades, stats, avgHoldAll, avgHoldWins, avgHoldLoss, avgDailyVolume, totalTradingDays }

  return (
    <PageWrapper onSync={account && !isManualAccount ? syncTrades : undefined} syncing={syncing}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Advanced Reports</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Complete statistical breakdown of your trading history</p>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-1.5 flex-wrap pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {TABS.map(t => {
            const isActive = t.value === tab
            return (
              <button key={t.value} onClick={() => setTab(t.value)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
                      style={{
                        background: isActive ? BLUE : 'transparent',
                        color: isActive ? '#fff' : 'var(--text-muted)',
                      }}>
                <t.icon size={15} />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'performance' && <PerformanceTab {...sharedProps} />}
      {tab === 'overview'    && <OverviewTab {...sharedProps} />}
      {tab === 'reports'     && <ReportsTab {...sharedProps} />}
      {tab === 'compare'     && <CompareTab {...sharedProps} />}
      {tab === 'calendar'    && <CalendarTab {...sharedProps} />}
    </PageWrapper>
  )
}