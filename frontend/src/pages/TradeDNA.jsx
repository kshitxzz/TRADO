import { useLocation, useNavigate } from 'react-router-dom'
import PageWrapper from '../components/layout/PageWrapper'
import TradeAnalysisPanel from '../components/trade-dna/TradeAnalysisPanel'
import { useAuth } from '../hooks/useAuth'
import { useTrades } from '../hooks/useTrades'

// Standalone page for the /trade-dna route (reached via Journal → Analytics).
// The actual content lives in <TradeAnalysisPanel/> so it can also be
// embedded inside Trado AI's "Trade DNA" tab without duplicating any logic.
export default function TradeDNA() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { account, syncing, syncTrades, isManualAccount } = useTrades(user?.id)

  return (
    <PageWrapper onSync={account && !isManualAccount ? syncTrades : undefined} syncing={syncing}>
      <TradeAnalysisPanel
        initialTradeId={location.state?.tradeId || null}
        heightOffset="112px"
        onBack={() => navigate('/journal')}
      />
    </PageWrapper>
  )
}