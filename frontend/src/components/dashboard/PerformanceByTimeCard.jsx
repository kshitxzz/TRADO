import { Clock, TrendingUp, TrendingDown, Zap, AlertTriangle } from 'lucide-react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip, ResponsiveContainer,
} from 'recharts'
import { formatPnl } from '../../lib/utils'

function HourTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  if (!d.count) return null
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glow)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{d.hourLabel}</p>
      <p style={{ color: d.pnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)', fontWeight: 700 }}>P&L: {formatPnl(d.pnl)}</p>
      <p style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>{d.count} trade{d.count !== 1 ? 's' : ''} · avg {formatPnl(d.avgPnl || 0)}</p>
    </div>
  )
}

export default function PerformanceByTimeCard({ hourly }) {
  const { buckets, bestHour, worstHour, mostActiveHour, insight } = hourly
  const hasData = buckets.some(b => b.count > 0)

  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={16} style={{ color: '#8B5CF6' }} />
        <div>
          <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Performance by Time</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>P&L by hour of day</p>
        </div>
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center" style={{ height: 200 }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No trade data yet</p>
        </div>
      ) : (
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <ReferenceLine y={0} stroke="var(--border-subtle)" />
              <XAxis dataKey="hourLabel" tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                     axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={22} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={54}
                     tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<HourTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="pnl" radius={[3, 3, 3, 3]} maxBarSize={22}>
                {buckets.map((b, i) => (
                  <Cell key={i} fill={b.pnl >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={b.count ? 0.85 : 0} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="stat-tile p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp size={11} style={{ color: 'var(--positive-green)' }} />
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Best Hour</span>
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--positive-green)' }}>{bestHour ? bestHour.hourLabel : '—'}</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{bestHour ? `${formatPnl(bestHour.avgPnl)} avg` : 'No data'}</p>
        </div>
        <div className="stat-tile p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingDown size={11} style={{ color: 'var(--negative-red)' }} />
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Worst Hour</span>
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--negative-red)' }}>{worstHour ? worstHour.hourLabel : '—'}</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{worstHour ? `${formatPnl(worstHour.avgPnl)} avg` : 'No data'}</p>
        </div>
        <div className="stat-tile p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Zap size={11} style={{ color: '#8B5CF6' }} />
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Most Active</span>
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{mostActiveHour ? mostActiveHour.hourLabel : '—'}</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{mostActiveHour ? `${mostActiveHour.count} trades` : 'No data'}</p>
        </div>
      </div>

      {insight && (
        <div
          className="flex items-start gap-2.5 mt-4 p-3.5 rounded-xl"
          style={{
            background: insight.tone === 'warning' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
            border: `1px solid ${insight.tone === 'warning' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
          }}
        >
          {insight.tone === 'warning'
            ? <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--negative-red)' }} />
            : <TrendingUp size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--positive-green)' }} />}
          <div>
            <p className="text-xs font-bold" style={{ color: insight.tone === 'warning' ? 'var(--negative-red)' : 'var(--positive-green)' }}>
              {insight.title}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{insight.detail}</p>
          </div>
        </div>
      )}
    </div>
  )
}