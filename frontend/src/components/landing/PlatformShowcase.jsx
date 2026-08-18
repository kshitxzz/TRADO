import { motion } from 'framer-motion'
import { Activity, RefreshCw, TrendingUp } from 'lucide-react'

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
}

// Sample equity curve — purely illustrative, same shape language as the
// real Dashboard equity curve (purple line, dollar-labeled y-axis).
const EQUITY_POINTS = 'M0,72 C20,68 35,60 55,58 C75,56 90,44 110,42 C130,40 145,26 165,24 C185,22 200,10 220,8'

function EquityCurveCard() {
  return (
    <motion.div variants={fadeUp} className="stat-tile p-6 flex-1">
      <div className="flex items-center gap-2 mb-1">
        <Activity size={14} style={{ color: 'var(--accent-purple)' }} />
        <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--text-primary)' }}>EQUITY CURVE</span>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Live-updating equity that reveals your true edge over time.</p>
      <svg viewBox="0 0 220 80" className="w-full" style={{ height: 90 }}>
        <defs>
          <linearGradient id="pw-equity" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#4F46E5" />
          </linearGradient>
        </defs>
        <motion.path
          d={EQUITY_POINTS}
          fill="none" stroke="url(#pw-equity)" strokeWidth="2.5" strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
        />
      </svg>
      <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
        <span>Jan</span><span>Mar</span><span>May</span>
      </div>
    </motion.div>
  )
}

function TradeScoreCard() {
  // Simplified decorative hexagon radar — same 6 axes the real Trade Score
  // uses, drawn as a static illustrative shape (no live data on a landing page).
  const pts = [
    [110, 20], [175, 58], [175, 122], [110, 160], [45, 122], [45, 58],
  ]
  const poly = pts.map(p => p.join(',')).join(' ')
  const inner = [
    [110, 40], [155, 65], [150, 110], [110, 140], [70, 110], [65, 65],
  ].map(p => p.join(',')).join(' ')

  return (
    <motion.div variants={fadeUp} className="stat-tile p-6 flex-1 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--accent-teal, #2DD4BF)' }}>BEHAVIORAL SCORE</span>
      </div>
      <svg viewBox="0 0 220 180" className="w-full mb-3" style={{ height: 130 }}>
        <polygon points={poly} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <motion.polygon
          points={inner} fill="rgba(139,92,246,0.15)" stroke="#2DD4BF" strokeWidth="2"
          initial={{ opacity: 0, scale: 0.7 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ transformOrigin: '110px 100px' }}
        />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill="#8B5CF6" />
        ))}
      </svg>
      <div className="grid grid-cols-2 gap-2 mt-auto">
        {[
          ['Win Rate', '67%'], ['Risk/Reward', '1:2.1'],
          ['Consistency', '74'], ['Discipline', '81'],
        ].map(([l, v]) => (
          <div key={l} className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{v}</p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{l}</p>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

function SessionBreakdownCard() {
  const sessions = [
    { l: 'London', pct: 45, c: '#8B5CF6' },
    { l: 'New York', pct: 32, c: '#2DD4BF' },
    { l: 'Asian', pct: 23, c: '#F59E0B' },
  ]
  return (
    <motion.div variants={fadeUp} className="stat-tile p-6 flex-1">
      <p className="text-xs font-bold tracking-wide mb-1" style={{ color: 'var(--text-primary)' }}>TRADES BY SESSION</p>
      <p className="text-3xl font-black mb-4" style={{ color: 'var(--text-primary)' }}>50+ <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>metrics tracked per trade</span></p>
      <div className="space-y-3">
        {sessions.map((s, i) => (
          <div key={s.l}>
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--text-secondary)' }}>{s.l}</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.pct}%</span>
            </div>
            <div className="progress-bar-track">
              <motion.div
                className="progress-bar-fill" style={{ background: s.c }}
                initial={{ width: 0 }}
                whileInView={{ width: `${s.pct}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, delay: i * 0.15, ease: 'easeOut' }}
              />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

function AutoSyncCard() {
  return (
    <motion.div variants={fadeUp} className="stat-tile p-6 flex-1 flex flex-col items-center justify-center text-center">
      <motion.div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)' }}
      >
        <RefreshCw size={22} className="animate-spin-slow" style={{ color: 'var(--accent-purple)' }} />
      </motion.div>
      <p className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Auto-Sync</p>
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--positive-green)' }} />
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>MT5 broker connected</p>
      </div>
    </motion.div>
  )
}

export default function PlatformShowcase() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div
          className="text-center mb-12"
          initial="hidden" whileInView="show" viewport={{ once: true, margin: '-100px' }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}
        >
          <motion.div variants={fadeUp} className="stat-chip inline-flex items-center gap-2 mb-4">
            <TrendingUp size={12} style={{ color: 'var(--accent-purple)' }} /> PLATFORM
          </motion.div>
          <motion.h2 variants={fadeUp} className="text-4xl font-black mb-4" style={{ color: 'var(--text-primary)' }}>
            Built for <span className="gradient-text-teal">serious traders</span>
          </motion.h2>
          <motion.p variants={fadeUp} className="text-base max-w-lg mx-auto" style={{ color: 'var(--text-muted)' }}>
            Everything you need to journal, analyze, and improve — powered by AI that actually understands your trading.
          </motion.p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
          initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}
        >
          <EquityCurveCard />
          <TradeScoreCard />
          <SessionBreakdownCard />
          <AutoSyncCard />
        </motion.div>
      </div>
    </section>
  )
}