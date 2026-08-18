import PageWrapper from '../../components/layout/PageWrapper'
import { useAuth } from '../../hooks/useAuth'
import { useTrades } from '../../hooks/useTrades'

function ComingSoon({ title, desc }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="text-5xl mb-4">🚀</div>
      <h2 className="text-xl font-bold mb-2" style={{color:'var(--text-primary)'}}>{title}</h2>
      <p className="text-sm max-w-xs" style={{color:'var(--text-muted)'}}>{desc || 'This feature is under development — coming soon.'}</p>
    </div>
  )
}

function wrap(title, desc) {
  return function Page() {
    const { user } = useAuth()
    const { account, syncing, syncTrades, isManualAccount } = useTrades(user?.id)
    return (
      <PageWrapper onSync={account && !isManualAccount ? syncTrades : undefined} syncing={syncing}>
        <ComingSoon title={title} desc={desc}/>
      </PageWrapper>
    )
  }
}

export const AdvancedReports = wrap('Advanced Reports', 'Deep statistical analysis with custom date ranges and export options.')
export const DayView         = wrap('Day View',         'Trade-by-trade breakdown for any single trading day.')
export const Strategies      = wrap('Strategies',       'Compare strategy performance head-to-head with full metrics.')
export const TradeReplay     = wrap('Trade Replay',     'Visually replay any trade on a chart with entry/exit markers.')