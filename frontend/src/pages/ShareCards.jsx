import PageWrapper from '../components/layout/PageWrapper'
import { Copy, Twitter, Download } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useTrades } from '../hooks/useTrades'
import { computeStats, formatPnl } from '../lib/utils'
import Logo from '../components/ui/Logo'
import toast from 'react-hot-toast'

export default function ShareCards() {
  const { user, profile }  = useAuth()
  const { trades, account, syncing, syncTrades, isManualAccount } = useTrades(user?.id)
  const stats    = computeStats(trades)
  const userName = profile?.full_name?.toLowerCase().replace(/\s+/g,'_') || user?.email?.split('@')[0] || 'trader'

  return (
    <PageWrapper onSync={account && !isManualAccount ? syncTrades : undefined} syncing={syncing}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{color:'var(--text-primary)'}}>Share Cards</h1>
        <p className="text-sm mt-0.5" style={{color:'var(--text-muted)'}}>Shareable trading performance cards</p>
      </div>
      <div className="flex flex-col items-start gap-6">
        {/* Card */}
        <div className="rounded-2xl p-6 w-72 select-none"
             style={{background:'linear-gradient(135deg,#1A1030 0%,#0D0B1F 100%)',border:'1px solid rgba(139,92,246,0.3)',boxShadow:'0 20px 60px rgba(139,92,246,0.25)'}}>
          <div className="flex items-center gap-2 mb-5">
            <Logo forceTheme="dark" height={18} />
            <span className="ml-auto text-xs" style={{color:'var(--accent-purple-light)'}}>{new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'})}</span>
          </div>
          <p className="text-sm mb-1" style={{color:'rgba(255,255,255,0.5)'}}>@{userName}</p>
          <p className="text-3xl font-black mb-4" style={{color:stats.totalPnl>=0?'#22C55E':'#F43F5E'}}>{formatPnl(stats.totalPnl)}</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[{l:'Trades',v:stats.tradeCount},{l:'Win Rate',v:`${stats.winRate.toFixed(0)}%`},{l:'Profit Factor',v:stats.profitFactor.toFixed(2)}].map(s=>(
              <div key={s.l} className="rounded-lg p-2" style={{background:'rgba(255,255,255,0.06)'}}>
                <p className="text-sm font-bold text-white">{s.v}</p>
                <p className="text-[10px] mt-0.5" style={{color:'rgba(255,255,255,0.4)'}}>{s.l}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[10px] text-center" style={{color:'rgba(255,255,255,0.3)'}}>tradoapp.com</p>
        </div>
        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={()=>{navigator.clipboard.writeText('https://tradoapp.com/@'+userName);toast.success('Link copied!')}} className="btn-outline text-sm px-4 py-2"><Copy size={14}/>Copy Link</button>
          <button className="btn-outline text-sm px-4 py-2"><Twitter size={14}/>Share on X</button>
          <button className="btn-primary text-sm px-4 py-2"><Download size={14}/>Download</button>
        </div>
      </div>
    </PageWrapper>
  )
}