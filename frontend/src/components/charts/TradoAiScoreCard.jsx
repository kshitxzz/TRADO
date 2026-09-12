import { useState, useEffect } from 'react'
import { Sparkles, TrendingUp, TrendingDown, Target, Zap, Wallet, Heart, HelpCircle, Lightbulb, CheckCircle2 } from 'lucide-react'
import TradeScoreRadar from './TradeScoreRadar'

const AXIS_ICONS = {
  trendingUp: TrendingUp,
  trendingDown: TrendingDown,
  target: Target,
  zap: Zap,
  wallet: Wallet,
  heart: Heart,
}

// Deterministic fallback tips — used the instant the card renders, and kept
// on screen permanently if the AI call fails, so the card never depends on
// the network to be useful. Built from the exact same computed axes the AI
// is handed, just narrated with a template instead of Gemini's phrasing.
function fallbackTips(score) {
  if (!score.axes.length || score.overall === 0) return []
  const sorted = [...score.axes].sort((a, b) => a.value - b.value)
  const weakest = sorted[0]
  const secondWeakest = sorted[1]
  const strongest = sorted[sorted.length - 1]
  return [
    `Reduce risk per trade or tighten your process to lift ${weakest.dimension} (${weakest.value}/100).`,
    `${secondWeakest.dimension} is your next opportunity at ${secondWeakest.value}/100 — small, steady gains here compound fast.`,
    `Solid work on ${strongest.dimension} (${strongest.value}/100) — keep leaning on what's already working.`,
  ]
}

const TIP_ICONS = [Lightbulb, TrendingDown, CheckCircle2]
const TIP_COLORS = ['#FBBF24', '#F87171', '#4ADE80']

export default function TradoAiScoreCard({ score, trades = [], backendUrl }) {
  const [tips, setTips] = useState([])
  const [tipsLoading, setTipsLoading] = useState(false)
  const [aiPowered, setAiPowered] = useState(false)

  useEffect(() => {
    if (score.overall === 0) { setTips([]); return }
    // Show deterministic tips immediately — never block on the network.
    setTips(fallbackTips(score))
    setAiPowered(false)

    let cancelled = false
    setTipsLoading(true)
    const axesMap = Object.fromEntries(score.axes.map(a => [a.dimension, a.value]))

    fetch(`${backendUrl}/api/ai/insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'trado_ai_tips',
        trades: trades.slice(0, 20),
        axes: axesMap,
        overall: score.overall,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        if (data.aiAvailable && Array.isArray(data.tips) && data.tips.length) {
          setTips(data.tips)
          setAiPowered(true)
        }
        // else: keep the fallback tips already on screen
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTipsLoading(false) })

    return () => { cancelled = true }
  }, [score.overall, trades.length, backendUrl])

  return (
    <div className="glass-card p-6 relative overflow-hidden">
      {/* subtle attraction glow behind the header */}
      <div
        className="absolute -top-24 -right-24 pointer-events-none"
        style={{
          width: 320, height: 320, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, rgba(139,92,246,0.08) 45%, transparent 70%)',
        }}
      />

      {/* Header */}
      <div className="flex items-start justify-between relative">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', boxShadow: '0 4px 16px rgba(99,102,241,0.4)' }}
          >
            <Sparkles size={20} color="#fff" />
          </div>
          <div>
            <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Trado AI</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>AI-Powered Performance Rating</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-5xl font-bold leading-none" style={{ color: score.levelColor }}>{score.overall}</p>
          <p className="text-sm font-semibold mt-1.5" style={{ color: score.levelColor }}>{score.level}</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>out of 100</p>
        </div>
      </div>

      {/* Radar + Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4 items-center relative">
        <TradeScoreRadar axes={score.axes} height={320} />

        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#8B5CF6' }} />
            </div>
            <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Score Breakdown</h3>
          </div>

          <div className="space-y-4">
            {score.axes.map(axis => {
              const Icon = AXIS_ICONS[axis.icon] || Target
              return (
                <div key={axis.dimension}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Icon size={13} style={{ color: axis.color }} />
                      <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{axis.dimension}</span>
                      <HelpCircle
                        size={11}
                        style={{ color: 'var(--text-muted)', cursor: 'help' }}
                        title={axis.help}
                      />
                    </div>
                    <span className="text-xs font-bold" style={{ color: axis.color }}>{axis.value}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-subtle)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${Math.max(2, axis.value)}%`, background: axis.color, boxShadow: `0 0 8px ${axis.color}66` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* AI Improvement Tips */}
      {tips.length > 0 && (
        <div className="mt-6 rounded-xl p-4 relative" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.18)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} style={{ color: '#A78BFA' }} />
            <h4 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>AI Improvement Tips</h4>
            {tipsLoading && (
              <span className="text-[10px] animate-pulse ml-auto" style={{ color: 'var(--text-muted)' }}>thinking…</span>
            )}
            {!tipsLoading && aiPowered && (
              <span className="text-[10px] ml-auto" style={{ color: 'var(--text-muted)' }}>Generated by Gemini</span>
            )}
          </div>
          <ul className="space-y-2">
            {tips.slice(0, 3).map((tip, i) => {
              const TipIcon = TIP_ICONS[i] || Lightbulb
              return (
                <li key={i} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--text-secondary, var(--text-muted))' }}>
                  <TipIcon size={13} className="flex-shrink-0 mt-0.5" style={{ color: TIP_COLORS[i] || TIP_COLORS[0] }} />
                  <span>{tip}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}