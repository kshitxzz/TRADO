import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, FlaskConical, Award } from 'lucide-react'

const STEPS = [
  {
    icon: Link2,
    title: 'Connect Your Broker',
    desc: 'Link your MT5 account in seconds. Trades auto-sync via the Trado EA — no manual entry, no CSV uploads, no hassle.',
  },
  {
    icon: FlaskConical,
    title: 'AI Analyzes Everything',
    desc: 'Gemini scans every trade for patterns, emotional biases, risk issues, and strategy effectiveness — automatically.',
  },
  {
    icon: Award,
    title: 'Get Your Edge',
    desc: 'Weekly graded summaries, behavioral scores, and coaching that references your actual trades — not generic advice.',
  },
]

// ─── The right-side visual panel — its content swaps to match whichever
// step is active, crossfading in/out. All figures here are illustrative
// sample data for the marketing page, not live user data. ───────────────
function StepVisual({ active }) {
  return (
    <div className="stat-tile p-6 h-full min-h-[280px] flex items-center justify-center relative overflow-hidden">
      <AnimatePresence mode="wait">
        {active === 0 && (
          <motion.div key="connect" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.35 }} className="text-center">
            <motion.div
              className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'var(--gradient-primary)' }}
              animate={{ boxShadow: ['0 0 0 0 rgba(139,92,246,0.4)', '0 0 0 14px rgba(139,92,246,0)'] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            >
              <Link2 size={26} color="#fff" />
            </motion.div>
            <p className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Connecting to MT5…</p>
            <div className="flex items-center justify-center gap-2">
              {['EURUSD', 'GBPJPY'].map(s => (
                <span key={s} className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--accent-purple-light)' }}>{s}</span>
              ))}
            </div>
          </motion.div>
        )}
        {active === 1 && (
          <motion.div key="analyze" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.35 }} className="text-center w-full px-6">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(45,212,191,0.12)', border: '1px solid rgba(45,212,191,0.3)' }}>
              <FlaskConical size={26} style={{ color: 'var(--accent-teal, #2DD4BF)' }} />
            </div>
            <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Analyzing 47 trades…</p>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Discipline · Risk · Consistency · Timing</p>
            <div className="progress-bar-track">
              <motion.div className="progress-bar-fill" style={{ background: 'linear-gradient(90deg,#2DD4BF,#8B5CF6)' }}
                          initial={{ width: '10%' }} animate={{ width: '82%' }} transition={{ duration: 1.6, ease: 'easeOut' }} />
            </div>
          </motion.div>
        )}
        {active === 2 && (
          <motion.div key="edge" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.35 }} className="text-center w-full px-4">
            <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center font-black text-xl"
                 style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: 'var(--positive-green)' }}>
              A+
            </div>
            <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Weekly Performance Grade</p>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Based on 47 trades analyzed</p>
            <div className="grid grid-cols-3 gap-2">
              {[['+12%', 'Discipline'], ['+8%', 'Consistency'], ['+15%', 'Risk Mgmt']].map(([v, l]) => (
                <div key={l} className="rounded-lg py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                  <p className="text-sm font-bold" style={{ color: 'var(--positive-green)' }}>{v}</p>
                  <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{l}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function HowItWorks() {
  const [active, setActive] = useState(0)

  // Auto-advance every 3.6s; clicking a step resets the cycle from there.
  useEffect(() => {
    const id = setInterval(() => setActive(a => (a + 1) % STEPS.length), 3600)
    return () => clearInterval(id)
  }, [])

  return (
    <section className="py-20 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div
          className="text-center mb-12"
          initial="hidden" whileInView="show" viewport={{ once: true, margin: '-100px' }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
        >
          <motion.div variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }} className="stat-chip inline-flex items-center gap-2 mb-4">
            HOW IT WORKS
          </motion.div>
          <motion.h2 variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }} className="text-4xl font-black mb-4" style={{ color: 'var(--text-primary)' }}>
            Three steps to <span className="gradient-text-teal">better trading</span>
          </motion.h2>
          <motion.p variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }} className="text-base max-w-lg mx-auto" style={{ color: 'var(--text-muted)' }}>
            From broker connection to actionable AI insights in minutes.
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          <div className="flex flex-col gap-4">
            {STEPS.map((s, i) => {
              const isActive = i === active
              return (
                <motion.button
                  key={s.title}
                  onClick={() => setActive(i)}
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: i * 0.1 }}
                  className="text-left rounded-2xl p-5 transition-colors"
                  style={{
                    background: isActive ? 'rgba(139,92,246,0.08)' : 'var(--bg-card)',
                    border: `1px solid ${isActive ? 'var(--border-glow)' : 'var(--border-subtle)'}`,
                    borderLeft: `3px solid ${isActive ? 'var(--accent-purple)' : 'transparent'}`,
                  }}
                >
                  <div className="flex items-center gap-3 mb-1.5">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                         style={{ background: isActive ? 'var(--gradient-primary)' : 'rgba(255,255,255,0.05)' }}>
                      <s.icon size={16} color={isActive ? '#fff' : 'var(--text-muted)'} />
                    </div>
                    <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>0{i + 1}</span>
                    <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{s.title}</p>
                  </div>
                  <p className="text-sm leading-relaxed pl-12" style={{ color: 'var(--text-muted)' }}>{s.desc}</p>
                </motion.button>
              )
            })}
          </div>

          <motion.div initial={{ opacity: 0, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <StepVisual active={active} />
          </motion.div>
        </div>
      </div>
    </section>
  )
}