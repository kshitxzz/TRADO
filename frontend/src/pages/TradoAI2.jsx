import { useState } from 'react'
import { Sparkles, MessageCircle, Radar, ShieldAlert, Camera } from 'lucide-react'
import PageWrapper from '../components/layout/PageWrapper'
import { useAuth } from '../hooks/useAuth'
import { useTrades } from '../hooks/useTrades'
import { greeting } from '../lib/utils'
import TodaysPlanTab from '../components/trado-ai-2/TodaysPlanTab'
import AICoachTab from '../components/trado-ai-2/AICoachTab'
import PatternsTab from '../components/trado-ai-2/PatternsTab'
import AIAlertsTab from '../components/trado-ai-2/AIAlertsTab'
import ChartVisionTab from '../components/trado-ai-2/ChartVisionTab'

const TABS = [
  { key: 'plan',     label: "Today's Plan", icon: Sparkles },
  { key: 'coach',    label: 'AI Coach',     icon: MessageCircle },
  { key: 'patterns', label: 'Patterns',     icon: Radar },
  { key: 'alerts',   label: 'AI Alerts',    icon: ShieldAlert },
  { key: 'vision',   label: 'Chart Vision', icon: Camera },
]

export default function TradoAI2() {
  const { user, profile } = useAuth()
  const { trades, account, loading, syncing, syncTrades, isManualAccount } = useTrades(user?.id)
  const [tab, setTab] = useState('plan')

  return (
    <PageWrapper onSync={account && !isManualAccount ? syncTrades : undefined} syncing={syncing}>
      {/* Header */}
      <div className="rounded-2xl p-5 mb-4 relative overflow-hidden"
           style={{ background: 'linear-gradient(135deg, rgba(168,30,120,0.14), rgba(20,14,26,0.35))', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg,#7c3aed,#db2777)' }}>
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-extrabold" style={{
                backgroundImage: 'linear-gradient(90deg,#f97316,#ec4899,#a855f7)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>
                Trado AI 2.0
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{ background: 'rgba(16,185,129,0.14)', color: 'var(--positive-green)', border: '1px solid rgba(16,185,129,0.35)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--positive-green)' }} /> LIVE
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Good {greeting()}. Your edge, decoded.</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap items-center gap-1.5 mb-5 p-1.5 rounded-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={tab === t.key
                    ? { background: 'linear-gradient(90deg,#7c3aed,#db2777)', color: 'white' }
                    : { color: 'var(--text-secondary)' }}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
        {['Coming Soon', 'Coming Soon'].map((label, i) => (
          <button key={i} disabled
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold opacity-40 cursor-not-allowed"
                  style={{ color: 'var(--text-muted)' }}>
            {label}
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--warning-orange)', color: '#1a1206' }}>SOON</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {loading ? (
        <div className="glass-card p-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading your trade data…</div>
      ) : (
        <>
          {tab === 'plan'     && <TodaysPlanTab user={user} trades={trades} account={account} profile={profile} />}
          {tab === 'coach'    && <AICoachTab user={user} trades={trades} />}
          {tab === 'patterns' && <PatternsTab trades={trades} />}
          {tab === 'alerts'   && <AIAlertsTab trades={trades} account={account} />}
          {tab === 'vision'   && <ChartVisionTab user={user} trades={trades} />}
        </>
      )}
    </PageWrapper>
  )
}