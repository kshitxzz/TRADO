import { Activity, TrendingUp, TrendingDown } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip, ResponsiveContainer,
} from 'recharts'

function fmtCompact(v) {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function BalanceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const v = payload[0].value
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glow)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
      <p style={{ color: '#22C55E', fontWeight: 700 }}>
        ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  )
}

export default function EquityCurveCard({ equity }) {
  const chartData = equity.points.map(pt => ({
    ...pt,
    label: pt.date ? new Date(pt.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
  }))

  const positive = equity.totalReturnPct >= 0

  return (
    <div className="glass-card p-5 md:p-6">
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2">
          <Activity size={16} style={{ color: '#8B5CF6' }} />
          <div>
            <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Equity Curve</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Account balance over time</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold leading-none" style={{ color: positive ? 'var(--positive-green)' : 'var(--negative-red)' }}>
            {positive ? '+' : ''}{equity.totalReturnPct.toFixed(2)}%
          </p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Total Return</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 my-5">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={12} style={{ color: 'var(--positive-green)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Peak</span>
          </div>
          <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{fmtCompact(equity.peak)}</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown size={12} style={{ color: '#F97316' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Max DD</span>
          </div>
          <p className="text-lg font-bold" style={{ color: '#F97316' }}>{equity.maxDrawdownPct.toFixed(1)}%</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Activity size={12} style={{ color: '#8B5CF6' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Current</span>
          </div>
          <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{fmtCompact(equity.current)}</p>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: 260 }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No trade data yet</p>
        </div>
      ) : (
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="eqBalanceArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity={0.02} />
                </linearGradient>
                <filter id="eqBalanceGlow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />

              <ReferenceLine
                y={equity.initialBalance}
                stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4"
                label={{ value: 'Initial', position: 'center', fill: 'var(--text-muted)', fontSize: 10 }}
              />

              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                     axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={48} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={64}
                     tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} domain={['dataMin', 'dataMax']} />

              <Tooltip content={<BalanceTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.25)', strokeDasharray: '4 4' }} />

              <Area
                type="monotone" dataKey="balance"
                stroke="#22C55E" strokeWidth={2} fill="url(#eqBalanceArea)"
                isAnimationActive animationDuration={1400} animationEasing="ease-out"
                dot={false}
                activeDot={(p) => {
                  const { cx, cy } = p
                  return (
                    <g key={`adot-${cx}-${cy}`}>
                      <circle cx={cx} cy={cy} r={13} fill="rgba(34,197,94,0.08)" stroke="none" />
                      <circle cx={cx} cy={cy} r={8} fill="rgba(34,197,94,0.15)" stroke="none" />
                      <circle cx={cx} cy={cy} r={4} fill="#22C55E" stroke="var(--bg-card)" strokeWidth={2}
                              filter="url(#eqBalanceGlow)" />
                    </g>
                  )
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}