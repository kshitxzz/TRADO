import { useState, useEffect, useRef } from 'react'
import { Loader2, TrendingUp, Droplet, BatteryLow, Clock, Ghost, ArrowRight, Radar } from 'lucide-react'
import { detectAdvancedPatterns } from '../../lib/analytics'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

const CATEGORY_META = {
  edge:     { icon: TrendingUp, color: 'var(--positive-green)', bg: 'rgba(34,197,94,0.08)',  label: 'Your Edge' },
  bleed:    { icon: Droplet,    color: 'var(--negative-red)',   bg: 'rgba(244,63,94,0.08)',   label: 'Bleeding Zone' },
  fatigue:  { icon: BatteryLow, color: 'var(--warning-orange)', bg: 'rgba(245,158,11,0.08)',  label: 'Fatigue Curve' },
  holdtime: { icon: Clock,      color: 'var(--accent-teal)',    bg: 'rgba(45,212,191,0.08)',  label: 'Hold-Time Edge' },
  eerie:    { icon: Ghost,      color: 'var(--accent-purple)',  bg: 'rgba(139,92,246,0.08)',  label: 'Eerie Pattern' },
}

function fallbackHeadline(p) {
  const f = p.facts || {}
  switch (p.id) {
    case 'your_edge':      return `${f.symbol} ${f.side} in ${f.session}: ${f.winRate.toFixed(0)}% WR · ${f.pnl >= 0 ? '+' : '-'}$${Math.abs(f.pnl).toFixed(0)} over your history.`
    case 'bleeding_zone':  return `${f.symbol} ${f.side} in ${f.session}: ${f.winRate.toFixed(0)}% WR · -$${Math.abs(f.pnl).toFixed(0)} over your history.`
    case 'fatigue_curve':  return `Your win rate drops from ${f.earlyWinRate.toFixed(0)}% to ${f.laterWinRate.toFixed(0)}% after trade #${f.afterNth}.`
    case 'hold_time_edge': return `Trades under ${f.thresholdMin}m win ${f.underWinRate.toFixed(0)}% vs ${f.overWinRate.toFixed(0)}% held longer.`
    case 'eerie_pattern':  return `${f.day}s around ${f.hour}:00 UTC: ${f.redCount}/${f.count} trades red, net -$${Math.abs(f.pnl).toFixed(0)}.`
    default: return ''
  }
}

export default function PatternsTab({ trades }) {
  const [patterns, setPatterns] = useState(null)
  const [loading, setLoading]   = useState(true)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    const detected = detectAdvancedPatterns(trades)
    if (detected.length === 0) { setPatterns([]); setLoading(false); return }

    fetch(`${BACKEND}/api/ai/patterns-narrate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patterns: detected }),
    })
      .then(r => r.json())
      .then(data => {
        const narrated = data.aiAvailable ? data.patterns : []
        const merged = detected.map(p => {
          const n = narrated.find(x => x.id === p.id)
          return { ...p, headline: n?.headline || fallbackHeadline(p), action: n?.action || null }
        })
        setPatterns(merged)
      })
      .catch(() => setPatterns(detected.map(p => ({ ...p, headline: fallbackHeadline(p), action: null }))))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closedCount = trades.filter(t => t.status === 'closed').length

  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Patterns We Found In Your Trades</p>
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>last 90 days · {closedCount} trades</p>
      </div>

      {loading && (
        <div className="glass-card p-8 flex items-center gap-2.5 justify-center" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={15} className="animate-spin" /> <span className="text-sm">Scanning your trades for patterns…</span>
        </div>
      )}

      {!loading && patterns?.length === 0 && (
        <div className="glass-card p-8 text-center">
          <Radar size={22} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Not enough data yet</p>
          <p className="text-xs max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>
            Trado AI needs a larger sample of closed, journaled trades (with session and symbol data) before it can reliably surface patterns. Keep logging trades.
          </p>
        </div>
      )}

      {!loading && patterns?.length > 0 && (
        <div className="space-y-2.5">
          {patterns.map(p => {
            const meta = CATEGORY_META[p.category] || CATEGORY_META.edge
            return (
              <div key={p.id} className="rounded-xl p-4 flex items-center gap-4"
                   style={{ background: meta.bg, border: `1px solid ${meta.color}30` }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${meta.color}22` }}>
                  <meta.icon size={16} style={{ color: meta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: meta.color }}>{meta.label}</p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>{p.headline}</p>
                </div>
                {p.action && (
                  <div className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold whitespace-nowrap" style={{ color: meta.color }}>
                    <ArrowRight size={12} /> {p.action}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}