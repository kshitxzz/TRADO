import { useRef, useEffect, useState } from 'react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts'

// ─── Compute a 6-axis Trade Score from real trade data ─────────────────────────
// All axes are 0–100. Formulas are intentionally simple, defensible proxies
// built only from data we actually capture (pnl, size, dates) — no invented
// fields like "stop-loss adherence" that the schema doesn't track.
export function computeTradeScore(trades = [], curve = []) {
  const closed = trades.filter(t => t.status === 'closed' && t.pnl != null)

  if (closed.length === 0) {
    return {
      overall: 0, label: 'No Data', labelColor: 'var(--text-muted)',
      axes: [
        { dimension: 'Win Rate',     value: 0 },
        { dimension: 'Risk/Reward',  value: 0 },
        { dimension: 'Consistency',  value: 0 },
        { dimension: 'Discipline',   value: 0 },
        { dimension: 'Profitability',value: 0 },
        { dimension: 'Recovery',     value: 0 },
      ],
    }
  }

  const wins   = closed.filter(t => t.pnl > 0)
  const losses = closed.filter(t => t.pnl < 0)
  const winRate = (wins.length / closed.length) * 100

  const avgWin  = wins.length   ? wins.reduce((s,t) => s+t.pnl, 0) / wins.length   : 0
  const avgLoss = losses.length ? losses.reduce((s,t) => s+t.pnl, 0) / losses.length : 0
  const grossProfit = wins.reduce((s,t) => s+t.pnl, 0)
  const grossLoss   = Math.abs(losses.reduce((s,t) => s+t.pnl, 0))
  const profitFactor = grossLoss > 0 ? grossProfit/grossLoss : (grossProfit > 0 ? 3 : 0)

  const clamp = (v, lo=0, hi=100) => Math.max(lo, Math.min(hi, v))

  // Risk/Reward — 3:1 avgWin:avgLoss ratio maps to a perfect 100
  const riskReward = clamp((avgWin / (Math.abs(avgLoss) || 1)) / 3 * 100)

  // Profitability — profit factor of 3 maps to a perfect 100
  const profitability = clamp(profitFactor / 3 * 100)

  // Consistency — coefficient of variation of trade P&L (lower = steadier results)
  const pnls = closed.map(t => t.pnl)
  const meanAbsPnl = pnls.reduce((s,v) => s+Math.abs(v), 0) / pnls.length || 1
  const variance = pnls.reduce((s,v) => s + Math.pow(v - (pnls.reduce((a,b)=>a+b,0)/pnls.length), 2), 0) / pnls.length
  const stdDev = Math.sqrt(variance)
  const pnlCoV = stdDev / meanAbsPnl
  const consistency = clamp(100 - pnlCoV * 25)

  // Discipline — coefficient of variation of position size (steadier lot sizing = more disciplined)
  const sizes = closed.map(t => t.size || 0).filter(s => s > 0)
  let discipline = 50
  if (sizes.length > 1) {
    const meanSize = sizes.reduce((a,b)=>a+b,0) / sizes.length
    const sizeVar  = sizes.reduce((s,v) => s + Math.pow(v-meanSize, 2), 0) / sizes.length
    const sizeCoV  = Math.sqrt(sizeVar) / (meanSize || 1)
    discipline = clamp(100 - sizeCoV * 50)
  }

  // Recovery — inverse of max drawdown % from the equity curve
  let recovery = 100
  if (curve.length > 1) {
    let peak = -Infinity, maxDD = 0
    curve.forEach(pt => {
      if (pt.pnl > peak) peak = pt.pnl
      const dd = peak - pt.pnl
      if (dd > maxDD) maxDD = dd
    })
    const maxDDPct = peak > 0 ? (maxDD / peak) * 100 : (maxDD > 0 ? 100 : 0)
    recovery = clamp(100 - maxDDPct)
  }

  const axes = [
    { dimension: 'Win Rate',      value: Math.round(clamp(winRate)) },
    { dimension: 'Risk/Reward',   value: Math.round(riskReward) },
    { dimension: 'Consistency',   value: Math.round(consistency) },
    { dimension: 'Discipline',    value: Math.round(discipline) },
    { dimension: 'Profitability', value: Math.round(profitability) },
    { dimension: 'Recovery',      value: Math.round(recovery) },
  ]

  const overall = Math.round(axes.reduce((s,a) => s+a.value, 0) / axes.length)

  let label, labelColor
  if (overall >= 80)      { label = 'Excellent';  labelColor = '#22C55E' }
  else if (overall >= 60) { label = 'Improving';  labelColor = '#F59E0B' }
  else if (overall >= 40) { label = 'Developing'; labelColor = '#3B82F6' }
  else                    { label = 'Needs Work'; labelColor = '#EF4444' }

  return { overall, label, labelColor, axes }
}

function ScoreTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid rgba(139,92,246,0.3)',
      borderRadius: 8, padding: '6px 10px', fontSize: 12,
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
    }}>
      <p style={{ color: 'var(--text-muted)' }}>{payload[0].payload.dimension}</p>
      <p style={{ color: '#C4B5FD', fontWeight: 700 }}>{payload[0].value}%</p>
    </div>
  )
}

// ─── Number rating color scale — mirrors the qualitative overall-score bands ──
function scoreColor(v) {
  if (v >= 80) return '#22C55E'   // strong
  if (v >= 60) return '#F59E0B'   // decent
  if (v >= 40) return '#FB923C'   // weak
  return '#EF4444'                // needs work
}

// ─── Numeric breakdown grid — one tile per axis, shown under the radar ────────
export function TradeScoreGrid({ axes = [] }) {
  return (
    <div className="grid grid-cols-3 gap-y-4 mt-1 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      {axes.map(a => (
        <div key={a.dimension} className="text-center">
          <p className="text-xl font-bold" style={{ color: scoreColor(a.value) }}>{a.value}</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{a.dimension}</p>
        </div>
      ))}
    </div>
  )
}

export default function TradeScoreRadar({ axes = [], height = 280 }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true) }, { threshold: 0.3 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])

  return (
    <div ref={ref} style={{ height, opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease' }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={axes} margin={{ top: 16, right: 28, bottom: 16, left: 28 }}>
          <PolarGrid stroke="var(--border-subtle)" />
          <PolarAngleAxis dataKey="dimension"
                           tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'Poppins, sans-serif' }} />
          <Tooltip content={<ScoreTooltip />} />
          <Radar
            dataKey="value" stroke="#8B5CF6" strokeWidth={2}
            fill="#8B5CF6" fillOpacity={0.28}
            isAnimationActive={visible} animationDuration={1100}
            dot={{ r: 3, fill: '#8B5CF6', stroke: 'var(--bg-card)', strokeWidth: 1.5 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}