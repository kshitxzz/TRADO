import PageWrapper from '../../components/layout/PageWrapper'
import { useAuth } from '../../hooks/useAuth'
import { useTrades } from '../../hooks/useTrades'
import { useTimezone, detectSession, SESSION_UTC } from '../../hooks/useTimezone'
import { Globe, TrendingUp, BarChart2, Award } from 'lucide-react'

const SESSION_ICONS = {
  Asian:      { icon: '🌅', utcRange: '22:00 – 08:00 UTC' },
  London:     { icon: '🏛️', utcRange: '08:00 – 13:00 UTC' },
  'New York': { icon: '🗽', utcRange: '13:00 – 22:00 UTC' },
}

const SESSION_ORDER = ['Asian', 'London', 'New York']

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return `${n >= 0 ? '+' : ''}$${Math.abs(n).toFixed(0)}`
}
function fmtK(n) {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  const str = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(0)}`
  return (n >= 0 ? '+' : '-') + str
}

export default function Sessions() {
  const { user } = useAuth()
  const { trades, account, loading, syncing, syncTrades, isManualAccount } = useTrades(user?.id)
  const { timezone, sessionTimes } = useTimezone()

  // Compute per-session stats from real trades
  const sessionStats = (() => {
    const stats = {}
    SESSION_ORDER.forEach(s => {
      stats[s] = { trades: 0, wins: 0, losses: 0, pnl: 0, totalVolume: 0 }
    })

    const closed = trades.filter(t => t.status === 'closed' && t.pnl != null)
    closed.forEach(t => {
      const s = t.session || detectSession(t.opened_at)
      if (!stats[s]) return
      stats[s].trades++
      stats[s].pnl += parseFloat(t.pnl || 0)
      stats[s].totalVolume += parseFloat(t.size || 0)
      if (parseFloat(t.pnl) > 0) stats[s].wins++
      else stats[s].losses++
    })
    return stats
  })()

  const totalTrades = Object.values(sessionStats).reduce((s, v) => s + v.trades, 0)
  const maxPnl      = Math.max(...Object.values(sessionStats).map(s => Math.abs(s.pnl)), 1)
  const bestSession = SESSION_ORDER.reduce((best, s) =>
    sessionStats[s].pnl > (sessionStats[best]?.pnl ?? -Infinity) ? s : best, SESSION_ORDER[0])

  if (loading) return (
    <PageWrapper>
      <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}</div>
    </PageWrapper>
  )

  return (
    <PageWrapper onSync={account && !isManualAccount ? syncTrades : undefined} syncing={syncing}>
      <div className="space-y-6">

        {/* Header */}
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Session Performance</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Breakdown by trading session — Asian, London &amp; New York
          </p>
        </div>

        {/* Session time bar */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe size={14} style={{ color: 'var(--accent-purple)' }} />
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Session hours in your timezone
              <span className="ml-2 px-2 py-0.5 rounded-md text-[10px] font-medium"
                    style={{ background: 'rgba(139,92,246,0.12)', color: 'var(--accent-purple-light)' }}>
                {timezone}
              </span>
            </p>
          </div>

          {/* Visual time bar */}
          <div className="relative mb-3">
            <div className="flex h-8 rounded-lg overflow-hidden">
              {/* Asian spans 22:00-08:00 = 10 hrs, London 08:00-13:00 = 5 hrs, NY 13:00-22:00 = 9 hrs */}
              {[
                { name: 'Asian',     flex: 10, color: '#854D0E', textColor: '#FDE68A', label: 'ASIAN' },
                { name: 'London',    flex: 5,  color: '#1E3A5F', textColor: '#93C5FD', label: 'LONDON' },
                { name: 'New York',  flex: 9,  color: '#064E3B', textColor: '#6EE7B7', label: 'NEW YORK' },
                { name: 'tail',      flex: 2,  color: '#854D0E', textColor: '#FDE68A', label: '' },
              ].map(seg => (
                <div key={seg.name} className="flex items-center justify-center text-[10px] font-bold tracking-wider"
                     style={{ flex: seg.flex, background: seg.color, color: seg.textColor }}>
                  {seg.label}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1">
              {['00:00','08:00','13:00','22:00'].map(t => (
                <span key={t} className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t}</span>
              ))}
            </div>
          </div>

          {/* Session time display in user timezone */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            {SESSION_ORDER.map(s => (
              <div key={s} className="flex items-center gap-2 py-2 px-3 rounded-xl"
                   style={{ background: SESSION_UTC[s]?.bg, border: `1px solid ${SESSION_UTC[s]?.color}30` }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: SESSION_UTC[s]?.color }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: SESSION_UTC[s]?.color }}>{s}</p>
                  <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{sessionTimes[s]}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* No trades state */}
        {totalTrades === 0 && (
          <div className="glass-card p-10 text-center">
            <BarChart2 size={36} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--text-muted)' }} />
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>No trades yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Add trades to see which session performs best for you
            </p>
          </div>
        )}

        {/* Session cards */}
        {totalTrades > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SESSION_ORDER.map(s => {
              const st       = sessionStats[s]
              const cfg      = SESSION_UTC[s]
              const winRate  = st.trades > 0 ? (st.wins / st.trades) * 100 : 0
              const avgTrade = st.trades > 0 ? st.pnl / st.trades : 0
              const volPct   = totalTrades > 0 ? (st.trades / totalTrades) * 100 : 0
              const barWidth = maxPnl > 0 ? Math.abs(st.pnl) / maxPnl * 100 : 0
              const isBest   = s === bestSession && st.trades > 0

              return (
                <div key={s} className="glass-card p-5 relative overflow-hidden"
                     style={{ border: isBest ? `1px solid ${cfg.color}50` : undefined }}>
                  {isBest && (
                    <div className="absolute top-3 right-3">
                      <Award size={14} style={{ color: cfg.color }} />
                    </div>
                  )}

                  {/* Session header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                         style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
                      {SESSION_ICONS[s]?.icon}
                    </div>
                    <div>
                      <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{s}</p>
                      <p className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                        {sessionTimes[s]}
                      </p>
                    </div>
                  </div>

                  {/* P&L with bar */}
                  <div className="mb-4">
                    <p className="text-2xl font-bold mb-1.5" style={{ color: st.pnl >= 0 ? cfg.color : 'var(--negative-red)' }}>
                      {fmtK(st.pnl)}
                    </p>
                    <div className="h-1.5 rounded-full overflow-hidden"
                         style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div className="h-full rounded-full transition-all"
                           style={{ width: `${barWidth}%`, background: st.pnl >= 0 ? cfg.color : '#EF4444' }} />
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-y-3">
                    {[
                      ['TRADES',    st.trades > 0 ? st.trades : '—'],
                      ['WIN RATE',  st.trades > 0 ? `${winRate.toFixed(1)}%` : '—', winRate >= 50 ? 'var(--positive-green)' : 'var(--text-primary)'],
                      ['AVG TRADE', st.trades > 0 ? fmtK(avgTrade) : '—', avgTrade >= 0 ? 'var(--positive-green)' : 'var(--negative-red)'],
                      ['VOLUME',    st.trades > 0 ? `${volPct.toFixed(0)}%` : '—'],
                    ].map(([label, val, color]) => (
                      <div key={label}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
                        <p className="text-sm font-bold" style={{ color: color || 'var(--text-primary)' }}>{val}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Best session callout */}
        {totalTrades > 0 && sessionStats[bestSession]?.trades > 0 && (
          <div className="glass-card p-4 flex items-center gap-3"
               style={{ border: `1px solid ${SESSION_UTC[bestSession]?.color}40`, background: SESSION_UTC[bestSession]?.bg }}>
            <Award size={20} style={{ color: SESSION_UTC[bestSession]?.color, flexShrink: 0 }} />
            <div>
              <p className="text-sm font-bold" style={{ color: SESSION_UTC[bestSession]?.color }}>
                {SESSION_ICONS[bestSession]?.icon} {bestSession} is your best session
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {sessionStats[bestSession].wins} wins · {fmtK(sessionStats[bestSession].pnl)} total P&L ·{' '}
                {((sessionStats[bestSession].wins / sessionStats[bestSession].trades) * 100).toFixed(0)}% win rate
              </p>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  )
}