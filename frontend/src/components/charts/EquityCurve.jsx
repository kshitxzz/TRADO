import { useRef, useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glow)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
      <p style={{ color: val >= 0 ? 'var(--positive-green)' : 'var(--negative-red)', fontWeight: 600 }}>
        {val >= 0 ? '+' : ''}${val?.toFixed(2)}
      </p>
    </div>
  )
}

export default function EquityCurve({ data = [], height = 200 }) {
  const ref   = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true) }, { threshold: 0.3 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])

  if (!data.length) {
    return <div ref={ref} style={{ height }} className="flex items-center justify-center" >
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No trade data yet</p>
    </div>
  }

  return (
    <div ref={ref} style={{ height, opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" hide tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
          <Line
            type="monotone"
            dataKey="pnl"
            stroke="url(#purpleGradient)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#8B5CF6', strokeWidth: 0 }}
            isAnimationActive={visible}
            animationDuration={1200}
          />
          <defs>
            <linearGradient id="purpleGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#6D28D9" />
            </linearGradient>
          </defs>
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
