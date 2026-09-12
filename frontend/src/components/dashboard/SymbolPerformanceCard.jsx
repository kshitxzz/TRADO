import { Target, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie,
} from 'recharts'
import { formatPnl } from '../../lib/utils'

const PALETTE = ['#22C55E', '#3B82F6', '#A78BFA', '#EF4444', '#F97316', '#2DD4BF', '#F59E0B', '#EC4899']

function BarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glow)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{d.symbol}</p>
      <p style={{ color: d.pnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)', fontWeight: 700 }}>{formatPnl(d.pnl)}</p>
    </div>
  )
}

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glow)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <p style={{ color: d.fill, fontWeight: 700 }}>{d.symbol}</p>
      <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{d.count} trades ({d.sharePct.toFixed(0)}%)</p>
    </div>
  )
}

export default function SymbolPerformanceCard({ bySymbol = [] }) {
  const totalCount = bySymbol.reduce((s, x) => s + x.count, 0) || 1
  const withColor = bySymbol.map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length], sharePct: (s.count / totalCount) * 100 }))

  const best = withColor.length ? withColor[0] : null // computeSymbolBreakdown is already pnl-desc
  const worst = withColor.length ? withColor[withColor.length - 1] : null
  const mostTraded = withColor.length ? withColor.reduce((a, b) => (b.count > a.count ? b : a)) : null

  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target size={16} style={{ color: '#8B5CF6' }} />
          <div>
            <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Symbol Performance</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>P&L breakdown by symbol</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Symbols Traded</p>
          <p className="text-2xl font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{bySymbol.length}</p>
        </div>
      </div>

      {withColor.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: 200 }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No trade data yet</p>
        </div>
      ) : (
        <>
          {/* Chips */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-xl p-3" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp size={11} style={{ color: 'var(--positive-green)' }} />
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Best</span>
              </div>
              <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{best.symbol}</p>
              <p className="text-xs font-semibold" style={{ color: 'var(--positive-green)' }}>{formatPnl(best.pnl)}</p>
            </div>
            <div className="rounded-xl p-3 stat-tile">
              <div className="flex items-center gap-1.5 mb-1">
                <DollarSign size={11} style={{ color: 'var(--text-muted)' }} />
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Most Traded</span>
              </div>
              <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{mostTraded.symbol}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{mostTraded.count} trades</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingDown size={11} style={{ color: 'var(--negative-red)' }} />
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Worst</span>
              </div>
              <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{worst.symbol}</p>
              <p className="text-xs font-semibold" style={{ color: 'var(--negative-red)' }}>{formatPnl(worst.pnl)}</p>
            </div>
          </div>

          {/* P&L by Symbol + Trade Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>P&L by Symbol</p>
              <div style={{ height: Math.max(140, withColor.length * 38) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={withColor} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}
                           tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="symbol" width={56}
                           tick={{ fill: 'var(--text-muted)', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="pnl" radius={[3, 3, 3, 3]} maxBarSize={22}>
                      {withColor.map((s, i) => <Cell key={i} fill={s.pnl >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.85} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Trade Distribution</p>
              <div style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={withColor} dataKey="count" nameKey="symbol" innerRadius={0} outerRadius="90%"
                         isAnimationActive animationDuration={900}>
                      {withColor.map((s, i) => <Cell key={i} fill={s.color} stroke="var(--bg-card)" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center mt-1">
                {withColor.map(s => (
                  <div key={s.symbol} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{s.symbol} ({s.sharePct.toFixed(0)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* All Symbols */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>All Symbols</p>
            <div>
              {withColor.map((s, i) => (
                <div key={s.symbol} className="flex items-center justify-between py-2.5"
                     style={i !== withColor.length - 1 ? { borderBottom: '1px solid var(--border-subtle)' } : undefined}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                         style={{ background: `${s.color}22`, color: s.color }}>
                      {s.symbol.slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{s.symbol}</p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {s.wins}W / {s.count - s.wins}L • {s.winRate.toFixed(0)}% WR
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-sm font-bold" style={{ color: s.pnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }}>{formatPnl(s.pnl)}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{s.count} trades</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}