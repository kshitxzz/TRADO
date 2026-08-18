import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Sparkles, Dna, RotateCcw, CheckCircle2, ArrowRight } from 'lucide-react'

const ROWS = [
  {
    badge: 'JOURNAL', badgeColor: '#8B5CF6',
    icon: BookOpen,
    title: 'Rich Trade Journaling',
    desc: 'Every trade gets a real journal entry — pre-trade thesis, post-trade review, emotions, and lessons learned — not just a P&L number.',
    bullets: ['Pre-trade analysis & post-trade review', 'Tag emotions on every entry', 'Printable trade reports'],
    cta: 'Explore Journal', to: '/journal',
    mock: (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>XAUUSD</span>
          <span className="pill-buy">BUY</span>
          <span className="ml-auto text-xs font-bold" style={{ color: 'var(--positive-green)' }}>+$418.00</span>
        </div>
        {[['Pre-Trade Analysis', 'London breakout, waited for retest of key level…'], ['Emotions', 'Confident · Patient'], ['Lessons Learned', 'Sized correctly, let winners run.']].map(([l, v]) => (
          <div key={l} className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-[9px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>{l}</p>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{v}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    badge: 'TRADO AI', badgeColor: '#2DD4BF',
    icon: Sparkles,
    title: 'AI-Powered Insights',
    desc: 'Behavioral scoring across 6 dimensions. An AI coach that references your actual trades, with weekly graded summaries and actionable coaching.',
    bullets: ['6-dimension behavioral scoring', 'Weekly graded performance summaries', 'Coaching grounded in your real trades'],
    cta: 'Explore Trado AI', to: '/trado-ai-2',
    mock: (
      <div className="p-4 space-y-2.5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
            <Sparkles size={11} color="#fff" />
          </div>
          <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>Trado AI Coach</span>
        </div>
        <div className="rounded-lg rounded-tl-none p-3" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Your best window is London around 09:00 UTC — 71% win rate. Tuesday afternoons are your weakest — 3 revenge trades this month cost you $340.
          </p>
        </div>
        <div className="flex gap-2">
          <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--positive-green)' }}>Strong: London AM</span>
          <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'rgba(244,63,94,0.1)', color: 'var(--negative-red)' }}>Watch: Revenge trades</span>
        </div>
      </div>
    ),
  },
  {
    badge: 'TRADE DNA', badgeColor: '#F59E0B',
    icon: Dna,
    title: 'Find Your Trading Archetype',
    desc: 'AI identifies your exact pattern — your best session, your best symbols, your edge — and flags the recurring mistakes quietly costing you money.',
    bullets: ['Your personal trading archetype', 'Best symbols & sessions, ranked', 'Recurring-mistake detection'],
    cta: 'Explore Trade DNA', to: '/trade-dna',
    mock: (
      <div className="p-4">
        <div className="rounded-lg p-3 mb-3 text-center" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(45,212,191,0.08))', border: '1px solid rgba(139,92,246,0.2)' }}>
          <p className="text-[9px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Your Archetype</p>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>The London Breakout Sniper</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[['Best Symbol', 'XAUUSD'], ['Best Session', 'London'], ['Win Rate', '71%'], ['Edge Score', '84/100']].map(([l, v]) => (
            <div key={l} className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{v}</p>
              <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{l}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    badge: 'TRADE REPLAY', badgeColor: '#818CF8',
    icon: RotateCcw,
    title: 'Replay Every Trade, Candle by Candle',
    desc: 'Step back through the market exactly as it played out. See what you saw, question what you did, and learn without hindsight bias.',
    bullets: ['Candle-by-candle market replay', 'See entry/exit exactly as it happened', 'Learn from wins and losses alike'],
    cta: 'Explore Trade Replay', to: '/analytics/trade-replay',
    mock: (
      <div className="p-4">
        <svg viewBox="0 0 220 90" className="w-full mb-2" style={{ height: 80 }}>
          {[...Array(16)].map((_, i) => {
            const up = Math.sin(i * 1.3) > -0.2
            const x = 6 + i * 13.5
            const h = 12 + Math.abs(Math.sin(i * 0.9)) * 30
            const y = 45 - h / 2
            return <rect key={i} x={x} y={y} width="6" height={h} rx="1" fill={up ? '#22C55E' : '#F43F5E'} opacity="0.85" />
          })}
        </svg>
        <div className="progress-bar-track mb-1">
          <div className="progress-bar-fill" style={{ width: '58%', background: 'var(--gradient-primary)' }} />
        </div>
        <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>Feb 17, 2026 · 08:30 AM</p>
      </div>
    ),
  },
]

function MockPanel({ url, children }) {
  return (
    <div className="rounded-2xl overflow-hidden border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-subtle)', boxShadow: '0 30px 80px rgba(0,0,0,0.3)' }}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ background: 'rgba(0,0,0,0.25)', borderColor: 'var(--border-subtle)' }}>
        <div className="flex gap-1.5">
          {['#F43F5E', '#F59E0B', '#22C55E'].map(c => <div key={c} className="w-2 h-2 rounded-full" style={{ background: c }} />)}
        </div>
        <div className="flex-1 mx-2 rounded-md px-3 py-0.5 text-[10px] text-center" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
          trado.app{url}
        </div>
      </div>
      {children}
    </div>
  )
}

export default function FeatureRows() {
  const navigate = useNavigate()
  return (
    <section className="py-20 px-4">
      <div className="max-w-5xl mx-auto space-y-24">
        {ROWS.map((r, i) => {
          const reverse = i % 2 === 1
          return (
            <div key={r.title} className={`grid grid-cols-1 lg:grid-cols-2 gap-10 items-center ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
              <motion.div
                initial={{ opacity: 0, x: reverse ? 30 : -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-full mb-4"
                     style={{ background: `${r.badgeColor}1A`, color: r.badgeColor }}>
                  <r.icon size={11} /> {r.badge}
                </div>
                <h3 className="text-3xl font-black mb-3" style={{ color: 'var(--text-primary)' }}>{r.title}</h3>
                <p className="text-base leading-relaxed mb-5" style={{ color: 'var(--text-muted)' }}>{r.desc}</p>
                <ul className="space-y-2 mb-6">
                  {r.bullets.map(b => (
                    <li key={b} className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <CheckCircle2 size={15} style={{ color: r.badgeColor, flexShrink: 0 }} /> {b}
                    </li>
                  ))}
                </ul>
                <button onClick={() => navigate(r.to)} className="inline-flex items-center gap-1.5 text-sm font-semibold hover:gap-2.5 transition-all"
                        style={{ color: r.badgeColor }}>
                  {r.cta} <ArrowRight size={14} />
                </button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: reverse ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
              >
                <MockPanel url={`/${r.to.replace('/', '')}`}>{r.mock}</MockPanel>
              </motion.div>
            </div>
          )
        })}
      </div>
    </section>
  )
}