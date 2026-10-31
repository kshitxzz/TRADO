// Visual cards shown inside AI Coach replies. Palette + layout were pixel-sampled
// from the reference screenshots (teal #069591, red #cf304a, amber #e9a845,
// label purple #6563f0, glowing orange line #e19824 with ring dots).
import { useEffect, useState } from 'react'
import {
  ComposedChart, BarChart, Bar, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell, CartesianGrid,
} from 'recharts'

const TEAL = '#069591', RED = '#cf304a', AMBER = '#e9a845', ORANGE = '#e19824', LABEL_PURPLE = '#6563f0'
const TEAL_MUTED = '#084f4d', RED_MUTED = '#6d1d2a'
const TONE = { pos: 'var(--positive-green)', neg: 'var(--negative-red)', neutral: 'var(--text-primary)' }
const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 10 }
const zeroInclusive = [(min) => Math.min(0, min), (max) => Math.max(0, max)]

const money = (v) => {
  const n = Number(v) || 0
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n >= 0 ? `+$${s}` : `-$${s}`
}

function TooltipBox({ title, rows }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '8px 12px', fontSize: 11, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{title}</p>
      {rows.map(r => (
        <p key={r.label} style={{ color: r.color || 'var(--text-primary)', fontWeight: 600, lineHeight: 1.5 }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{r.label}: </span>{r.value}
        </p>
      ))}
    </div>
  )
}

function LegendDot({ color, label }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
      <span className="w-2 h-2 rounded-full" style={{ background: color }} /> {label}
    </span>
  )
}

function Card({ title, subtitle, legend, chips = [], children }) {
  return (
    <div className="rounded-xl p-4 sm:p-5 w-full" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <div className="min-w-0">
          <h4 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h4>
          {subtitle && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
        </div>
        {legend && <div className="flex items-center gap-3 flex-wrap">{legend}</div>}
      </div>
      {chips.filter(Boolean).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2 mb-1">
          {chips.filter(Boolean).map(c => (
            <span key={c} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-hover, rgba(255,255,255,0.04))', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>{c}</span>
          ))}
        </div>
      )}
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Tiles({ tiles = [] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
      {tiles.map(t => (
        <div key={t.label} className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-hover, rgba(255,255,255,0.03))', border: '1px solid var(--border-subtle)' }}>
          <p className="text-sm font-extrabold truncate" style={{ color: TONE[t.tone] || TONE.neutral }}>{t.value}</p>
          <p className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.label}</p>
        </div>
      ))}
    </div>
  )
}

// Glowing orange line with ring dots — matches the combo-chart reference.
function RingDot({ cx, cy, value }) {
  if (cx == null || cy == null || value == null) return null
  return <circle cx={cx} cy={cy} r={5} fill="#18120b" stroke={ORANGE} strokeWidth={2.5} />
}
const glow = { filter: 'drop-shadow(0 0 6px rgba(225,152,36,0.55))' }

function PnlTimeline({ v }) {
  const showDots = v.points.length <= 14
  return (
    <Card title={v.title} subtitle={v.subtitle} chips={[v.periodLabel, v.range, v.filterText]}
          legend={<><LegendDot color={TEAL} label="P&L" /><LegendDot color={ORANGE} label="Cumulative" /></>}>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={v.points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
            <YAxis yAxisId="pnl" hide domain={zeroInclusive} />
            <YAxis yAxisId="cum" hide orientation="right" domain={['auto', 'auto']} />
            <ReferenceLine yAxisId="pnl" y={0} stroke="rgba(255,255,255,0.1)" />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload
              return <TooltipBox title={p.label} rows={[
                { label: 'P&L', value: money(p.pnl), color: p.pnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' },
                { label: 'Cumulative', value: money(p.cum) }, { label: 'Trades', value: p.trades },
              ]} />
            }} />
            <Bar yAxisId="pnl" dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {v.points.map((p, i) => <Cell key={i} fill={p.pnl >= 0 ? TEAL_MUTED : RED_MUTED} />)}
            </Bar>
            <Line yAxisId="cum" type="monotone" dataKey="cum" stroke={ORANGE} strokeWidth={2.5} style={glow}
                  dot={showDots ? <RingDot /> : false} activeDot={{ r: 5, fill: '#18120b', stroke: ORANGE, strokeWidth: 2.5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Tiles tiles={v.tiles} />
    </Card>
  )
}

function Equity({ v }) {
  const color = v.positive ? TEAL : RED
  return (
    <Card title={v.title} subtitle={v.subtitle} chips={[v.periodLabel, v.range, v.filterText]}
          legend={<LegendDot color={color} label="Equity" />}>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={v.points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="coachEq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={40} />
            <YAxis hide domain={zeroInclusive} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload
              return <TooltipBox title={`Trade ${p.n} · ${p.label}`} rows={[
                { label: 'Equity', value: money(p.equity), color: p.equity >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' },
                { label: 'Drawdown', value: money(p.drawdown) },
              ]} />
            }} />
            <Area type="monotone" dataKey="equity" stroke={color} strokeWidth={2.5} fill="url(#coachEq)" dot={false}
                  activeDot={{ r: 5, fill: '#18120b', stroke: color, strokeWidth: 2.5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Tiles tiles={v.tiles} />
    </Card>
  )
}

function Breakdown({ v }) {
  return (
    <Card title={v.title} subtitle={v.subtitle} chips={[v.periodLabel, v.range, v.filterText]}
          legend={<><LegendDot color={TEAL} label="P&L" /><LegendDot color={ORANGE} label={v.metricName} /></>}>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={v.points} margin={{ top: 10, right: 12, bottom: 0, left: 12 }}>
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
            <YAxis yAxisId="pnl" hide domain={zeroInclusive} />
            <YAxis yAxisId="line" hide orientation="right" domain={v.metric === 'win_rate' ? [0, 100] : [0, 'auto']} />
            <ReferenceLine yAxisId="pnl" y={0} stroke="rgba(255,255,255,0.1)" />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload
              return <TooltipBox title={p.label} rows={[
                { label: 'P&L', value: money(p.pnl), color: p.pnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' },
                { label: 'Profit factor', value: p.pfText }, { label: 'Win rate', value: `${p.winRate.toFixed(0)}%` }, { label: 'Trades', value: p.trades },
              ]} />
            }} />
            <Bar yAxisId="pnl" dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={36}>
              {v.points.map((p, i) => <Cell key={i} fill={p.pnl >= 0 ? TEAL_MUTED : RED_MUTED} />)}
            </Bar>
            <Line yAxisId="line" type="linear" dataKey="line" stroke={ORANGE} strokeWidth={2.5} style={glow}
                  dot={<RingDot />} activeDot={{ r: 6, fill: '#18120b', stroke: ORANGE, strokeWidth: 2.5 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {v.callouts?.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
          {v.callouts.map(c => (
            <p key={c.label} className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {c.label}: <span className="font-bold" style={{ color: TONE[c.tone] }}>{c.value}</span>
            </p>
          ))}
        </div>
      )}
    </Card>
  )
}

// Horizontal Actual-vs-Projected pair, like the "Return $ / Profit Factor" bars in the reference.
function CompareBars({ title, actual, projected, actualText, projectedText }) {
  const [on, setOn] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id) }, [])
  const max = Math.max(Math.abs(actual || 0), Math.abs(projected || 0), 0.0001)
  const w = (x) => `${on ? Math.max(2, (Math.abs(x || 0) / max) * 100) : 0}%`
  const Row = ({ val, color, text }) => (
    <div className="flex items-center gap-2 mb-1.5">
      <div className="flex-1 h-[10px] rounded-sm overflow-hidden" style={{ background: 'var(--bg-hover, rgba(255,255,255,0.04))' }}>
        <div className="h-full rounded-sm" style={{ width: w(val), background: color, transition: 'width .7s cubic-bezier(.2,.8,.2,1)' }} />
      </div>
      <span className="text-[10px] font-semibold w-16 text-right flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{text}</span>
    </div>
  )
  return (
    <div className="flex-1 min-w-[180px]">
      <p className="text-[13px] font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{title}</p>
      <Row val={actual} color={RED} text={actualText} />
      <Row val={projected} color={TEAL} text={projectedText} />
    </div>
  )
}

function SkippableTick({ x, y, payload, points }) {
  const skipped = points.find(p => p.label === payload.value)?.skipped
  return <text x={x} y={y + 12} textAnchor="middle" fontSize={10} fill="var(--text-muted)" textDecoration={skipped ? 'line-through' : undefined}>{payload.value}</text>
}

function WhatIf({ v }) {
  const s = v.summary
  return (
    <Card title={v.title} subtitle={v.subtitle} chips={[v.periodLabel, v.range, v.filterText]}
          legend={<><LegendDot color={RED} label="Actual" /><LegendDot color={TEAL} label="Projected" /></>}>
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={v.points} margin={{ top: 8, right: 12, bottom: 0, left: 12 }} barGap={3}>
            <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0} tick={<SkippableTick points={v.points} />} />
            <YAxis hide domain={zeroInclusive} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload
              return <TooltipBox title={`${p.label}${p.skipped ? ' (skipped by rule)' : ''}`} rows={[
                { label: 'Actual', value: money(p.actual), color: RED }, { label: 'Projected', value: money(p.projected), color: TEAL },
              ]} />
            }} />
            <Bar dataKey="actual" fill={RED} radius={[3, 3, 0, 0]} maxBarSize={18} />
            <Bar dataKey="projected" fill={TEAL} radius={[3, 3, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-6 flex-wrap mt-5">
        <CompareBars title="Return $" actual={s.returnUsd.actual} projected={s.returnUsd.projected}
                     actualText={money(s.returnUsd.actual)} projectedText={money(s.returnUsd.projected)} />
        <CompareBars title="Profit Factor" actual={s.profitFactor.actual} projected={s.profitFactor.projected}
                     actualText={s.profitFactor.actualText} projectedText={s.profitFactor.projectedText} />
      </div>
      <p className="text-[10px] mt-3" style={{ color: 'var(--text-muted)' }}>{v.footnote}</p>
    </Card>
  )
}

const TONE_COLOR = { good: TEAL, warn: AMBER, bad: RED }

function Adherence({ v }) {
  const [on, setOn] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id) }, [])
  return (
    <>
      <Card title={v.title} subtitle={v.subtitle} chips={[v.periodLabel, v.range, v.filterText]}>
        <div className="space-y-4">
          {v.rows.map(r => (
            <div key={r.id}>
              <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>{r.label}</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-[7px] rounded-full overflow-hidden" style={{ background: 'var(--bg-hover, rgba(255,255,255,0.05))' }}>
                  <div className="h-full rounded-full" style={{ width: on ? `${Math.max(2, r.pct)}%` : '0%', background: TONE_COLOR[r.tone], transition: 'width .8s cubic-bezier(.2,.8,.2,1)' }} />
                </div>
                <span className="text-[10px] font-semibold w-12 text-right flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{r.value}/{r.total}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
      {v.findings?.length > 0 && (
        <div className="mt-3 px-1">
          <p className="text-xs font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>Findings:</p>
          <ol className="text-[13px] space-y-1" style={{ color: 'var(--text-primary)', lineHeight: 1.6 }}>
            {v.findings.map((f, i) => (
              <li key={f.label}>{i + 1}. <span style={{ color: LABEL_PURPLE }}>{f.label}</span>: {f.text}</li>
            ))}
          </ol>
        </div>
      )}
    </>
  )
}

export default function CoachVisual({ visual }) {
  if (!visual) return null
  switch (visual.kind) {
    case 'pnl_timeline': return <PnlTimeline v={visual} />
    case 'equity': return <Equity v={visual} />
    case 'breakdown': return <Breakdown v={visual} />
    case 'whatif': return <WhatIf v={visual} />
    case 'adherence': return <Adherence v={visual} />
    default: return null
  }
}

// Renders coach text: **Label** → purple callout (like "What-If:" in the reference), line breaks preserved.
export function CoachText({ text = '' }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) => /^\*\*[^*]+\*\*$/.test(p)
        ? <span key={i} style={{ color: LABEL_PURPLE, fontWeight: 600 }}>{p.slice(2, -2)}</span>
        : <span key={i}>{p}</span>)}
    </>
  )
}