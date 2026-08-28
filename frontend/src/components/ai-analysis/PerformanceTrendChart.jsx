import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {p.dataKey === 'winRate' ? `${p.value.toFixed(0)}%` : `${p.value.toFixed(2)}${p.dataKey === 'rr' ? ':1' : 'x'}`}
        </p>
      ))}
    </div>
  )
}

// `data` items: { date, winRate (0-100), profitFactor (0-10 capped), rr (0-10 capped) }
export default function PerformanceTrendChart({ data = [], height = 220 }) {
  if (data.length < 2) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Not enough days in this period to chart a trend yet.</p>
      </div>
    )
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}
            tickFormatter={d => new Date(d).toLocaleDateString(undefined, { weekday: 'short' })} />
          <YAxis yAxisId="pct" domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}
            tickFormatter={v => `${v}%`} width={38} />
          <YAxis yAxisId="ratio" orientation="right" domain={[0, 10]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={v => <span style={{ color: 'var(--text-secondary)' }}>{v}</span>} />
          <Line yAxisId="pct" type="monotone" dataKey="winRate" name="Win Rate" stroke="var(--positive-green)" strokeWidth={2} dot={false} />
          <Line yAxisId="ratio" type="monotone" dataKey="profitFactor" name="Profit Factor" stroke="#3B82F6" strokeWidth={2} dot={false} />
          <Line yAxisId="ratio" type="monotone" dataKey="rr" name="Risk:Reward" stroke="var(--warning-orange)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}