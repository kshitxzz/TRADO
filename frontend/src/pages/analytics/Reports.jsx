import PageWrapper from '../../components/layout/PageWrapper'
import { useAuth } from '../../hooks/useAuth'
import { useTrades } from '../../hooks/useTrades'
import { formatPnl, pnlColor } from '../../lib/utils'

export default function Reports() {
  const { user }  = useAuth()
  const { trades, account, syncing, syncTrades, isManualAccount } = useTrades(user?.id)

  const monthly = {}
  trades.filter(t=>t.status==='closed').forEach(t=>{
    const m = t.closed_at?.slice(0,7); if(!m) return
    if(!monthly[m]) monthly[m]={month:m,pnl:0,trades:0,wins:0,losses:0}
    monthly[m].pnl+=t.pnl; monthly[m].trades++
    if(t.pnl>0) monthly[m].wins++; else monthly[m].losses++
  })
  const months = Object.values(monthly).sort((a,b)=>b.month.localeCompare(a.month))

  return (
    <PageWrapper onSync={account && !isManualAccount ? syncTrades : undefined} syncing={syncing}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{color:'var(--text-primary)'}}>Reports</h1>
        <p className="text-sm mt-0.5" style={{color:'var(--text-muted)'}}>Monthly trading performance summaries</p>
      </div>

      {months.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-sm" style={{color:'var(--text-muted)'}}>No trade history yet. Connect your account to generate reports.</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{borderBottom:'1px solid var(--border-subtle)'}}>
                {['Month','Trades','Wins','Losses','Win Rate','Total P&L','Avg/Trade'].map(h=>(
                  <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold" style={{color:'var(--text-muted)'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map(m=>(
                <tr key={m.month} className="table-row-hover" style={{borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                  <td className="px-5 py-3.5 font-semibold text-sm" style={{color:'var(--text-primary)'}}>
                    {new Date(m.month+'-01').toLocaleDateString('en-US',{month:'long',year:'numeric'})}
                  </td>
                  <td className="px-5 py-3.5 text-sm" style={{color:'var(--text-secondary)'}}>{m.trades}</td>
                  <td className="px-5 py-3.5 text-sm" style={{color:'var(--positive-green)'}}>{m.wins}</td>
                  <td className="px-5 py-3.5 text-sm" style={{color:'var(--negative-red)'}}>{m.losses}</td>
                  <td className="px-5 py-3.5 text-sm" style={{color:'var(--text-secondary)'}}>{m.trades?((m.wins/m.trades)*100).toFixed(1):0}%</td>
                  <td className="px-5 py-3.5 font-bold text-sm" style={{color:pnlColor(m.pnl)}}>{formatPnl(m.pnl)}</td>
                  <td className="px-5 py-3.5 text-sm" style={{color:'var(--text-secondary)'}}>{m.trades?formatPnl(m.pnl/m.trades):'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageWrapper>
  )
}