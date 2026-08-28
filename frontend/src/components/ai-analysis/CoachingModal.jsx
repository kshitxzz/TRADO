import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Brain, Repeat, ClipboardCheck, Rocket, TrendingUp, CheckCircle2 } from 'lucide-react'
import { formatPnl } from '../../lib/utils'

// Content is static coaching copy (not AI-generated) — same philosophy as
// the rest of Trado AI: the modal's dynamic bits (counts, P&L impact) come
// straight from the already-computed flag/verdict object, never invented.
const TOPICS = {
  impulsive_reentry: {
    icon: Brain, color: 'var(--warning-orange)', title: 'Fix Your Psychology',
    intro: (ctx) => `You re-entered a new trade within 10 minutes of a loss ${ctx.occurredCount} time${ctx.occurredCount === 1 ? '' : 's'} recently, netting ${formatPnl(ctx.impact)} on those re-entries. That's usually the "get it back" instinct talking, not your setup.`,
    steps: [
      { title: 'Enforce a cooldown', text: 'After any losing trade, physically step away for at least 15–30 minutes before the platform is even open again. No exceptions.' },
      { title: 'Write one sentence first', text: "Before re-entering, write down the specific setup you're seeing. If the only reason you can write is \"get it back,\" don't take the trade." },
      { title: 'Review the pattern weekly', text: 'Once a week, pull up every re-entry from your journal and check whether it met your entry checklist or was emotional.' },
    ],
  },
  overtrading: {
    icon: Repeat, color: '#F97316', title: 'Fix Your Overtrading',
    intro: (ctx) => `You've had ${ctx.occurredCount} day${ctx.occurredCount === 1 ? '' : 's'} with a spike in trade count and more losers than winners, netting ${formatPnl(ctx.impact)} on those days combined.`,
    steps: [
      { title: 'Set a hard daily cap', text: 'Pick a maximum number of trades per day based on your normal pace, and stop the moment you hit it — win or lose.' },
      { title: 'Build a walk-away trigger', text: 'After 2 consecutive losers in a session, close the platform for the rest of the day. Make it a rule, not a feeling.' },
      { title: 'Track cap vs. actual', text: "Log your trade count against your cap in your journal this week and see how often you're breaking your own limit." },
    ],
  },
  no_journaling: {
    icon: ClipboardCheck, color: 'var(--accent-purple-light)', title: 'Start Journaling',
    intro: (ctx) => `None of your ${ctx.occurredCount} closed trades have a completed execution checklist yet. Journaling is the fastest way to turn raw P&L into a repeatable process.`,
    steps: [
      { title: 'Use the post-trade checklist', text: "Trado's checklist now pops up automatically after every EA-synced trade close — no extra app, just fill it in when it appears." },
      { title: 'Journal within 5 minutes', text: 'Do it while the trade is fresh — your reasoning (and honesty about it) fades fast after that.' },
      { title: 'Review weekly', text: 'Once a week, read your last 10 journaled trades and pull out one pattern you keep repeating.' },
    ],
  },
  scaling_guide: {
    icon: Rocket, color: 'var(--positive-green)', title: 'Scaling Guide',
    intro: (ctx) => `Your edge is proven — ${formatPnl(ctx.totalPnl)} total P&L at a ${ctx.winRate.toFixed(1)}% win rate. Here's how to scale it up without breaking it.`,
    steps: [
      { title: 'Prove it holds first', text: "Before adding a second account, let this edge run for another 20+ trades — don't scale off a hot streak." },
      { title: 'Scale one variable at a time', text: "Keep position sizing identical across accounts at first. Don't increase size and account count in the same month." },
      { title: 'Set a pause rule', text: 'Pick a max drawdown from peak (e.g. 10%) that automatically pauses new trades until you review what changed.' },
    ],
  },
  improvement_guide: {
    icon: TrendingUp, color: 'var(--warning-orange)', title: 'Improvement Guide',
    intro: (ctx) => `${formatPnl(ctx.totalPnl)} across ${ctx.tradeCount} trades at a ${ctx.winRate.toFixed(1)}% win rate — not yet profitable. Focus on process before position size.`,
    steps: [
      { title: 'Tighten entry criteria', text: 'Only take trades that meet every item on your entry checklist — no partial setups, no "close enough."' },
      { title: 'Cut size in half', text: 'Reduce position size until both win rate and reward:risk improve for 15+ trades in a row.' },
      { title: 'Fix one mistake at a time', text: 'Review your last 10 losing trades, find the single most common mistake, and drill only that until it stops.' },
    ],
  },
}

export default function CoachingModal({ topic, onClose }) {
  useEffect(() => {
    if (!topic) return
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [topic, onClose])

  if (!topic) return null
  const cfg = TOPICS[topic.key]
  if (!cfg) return null
  const Icon = cfg.icon

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5" style={{ background: `${cfg.color}0D`, borderBottom: `1px solid ${cfg.color}30` }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${cfg.color}20` }}>
                <Icon size={18} style={{ color: cfg.color }} />
              </div>
              <h3 className="font-bold text-base" style={{ color: cfg.color }}>{cfg.title}</h3>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-5">
          <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-secondary)' }}>{cfg.intro(topic.context || {})}</p>
          <div className="space-y-3">
            {cfg.steps.map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] flex-shrink-0 mt-0.5" style={{ background: `${cfg.color}18`, color: cfg.color }}>
                  {i + 1}
                </div>
                <div>
                  <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>{s.title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{s.text}</p>
                </div>
              </div>
            ))}
          </div>
          <button onClick={onClose} className="btn-primary w-full text-sm py-2.5 mt-6 flex items-center justify-center gap-2">
            <CheckCircle2 size={15} /> Got It
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}