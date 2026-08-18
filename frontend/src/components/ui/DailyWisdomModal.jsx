import { motion, AnimatePresence } from 'framer-motion'

// ── Motion choreography ───────────────────────────────────────────────────────
// Backdrop fades + blurs in, then the card pops in with a springy overshoot,
// and its contents (icon → pill → quote → button) stagger in right after.
const backdropVariants = {
  hidden:  { opacity: 0, backdropFilter: 'blur(0px)' },
  visible: { opacity: 1, backdropFilter: 'blur(10px)', transition: { duration: 0.28, ease: 'easeOut' } },
  exit:    { opacity: 0, backdropFilter: 'blur(0px)', transition: { duration: 0.2, ease: 'easeIn' } },
}

const cardVariants = {
  hidden:  { opacity: 0, scale: 0.8, y: 28 },
  visible: {
    opacity: 1, scale: 1, y: 0,
    transition: { type: 'spring', damping: 16, stiffness: 260, mass: 0.9, delayChildren: 0.08, staggerChildren: 0.07 },
  },
  exit: { opacity: 0, scale: 0.92, y: 12, transition: { duration: 0.16, ease: 'easeIn' } },
}

const itemVariants = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] } },
}

const iconVariants = {
  hidden:  { opacity: 0, scale: 0.4, rotate: -14 },
  visible: { opacity: 1, scale: 1, rotate: 0, transition: { type: 'spring', damping: 11, stiffness: 260, delay: 0.03 } },
}

// ── Daily Wisdom popup ────────────────────────────────────────────────────────
// Shown once per day, app-wide, over whichever screen the user lands on first
// (see hooks/useDailyWisdom.js). Only dismissable via the CTA button —
// intentionally no backdrop-click or ESC close, since this is meant to be
// read, not skipped, before the trading day starts.
export default function DailyWisdomModal({ open, quote, onStart }) {
  if (!quote) return null
  const Icon = quote.icon

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          variants={backdropVariants} initial="hidden" animate="visible" exit="exit"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.8)' }}
        >
          <motion.div
            variants={cardVariants} initial="hidden" animate="visible" exit="exit"
            className="w-full max-w-lg text-center relative overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, #131018 0%, #0F0D13 100%)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '28px',
              padding: '44px 40px 36px',
              boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
            }}
          >
            {/* Ambient glow */}
            <div aria-hidden style={{
              position: 'absolute', top: '-60px', left: '50%', transform: 'translateX(-50%)',
              width: '220px', height: '220px', borderRadius: '9999px',
              background: 'radial-gradient(circle, rgba(139,92,246,0.30), transparent 70%)',
              filter: 'blur(10px)', pointerEvents: 'none',
            }} />

            {/* Icon */}
            <motion.div variants={iconVariants} className="relative mx-auto mb-5" style={{ width: 84, height: 84 }}>
              <div aria-hidden style={{
                position: 'absolute', inset: '-14px', borderRadius: '9999px',
                background: 'radial-gradient(circle, rgba(139,92,246,0.35), transparent 72%)',
                filter: 'blur(6px)',
              }} />
              <div className="relative w-full h-full rounded-full flex items-center justify-center"
                   style={{
                     background: 'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(79,70,229,0.14))',
                     border: '1px solid rgba(255,255,255,0.10)',
                   }}>
                <span style={{ fontSize: 40, lineHeight: 1 }}>🚀</span>
              </div>
            </motion.div>

            {/* Category pill */}
            <motion.div variants={itemVariants} className="inline-flex items-center gap-2 mb-7"
                 style={{
                   background: 'rgba(255,255,255,0.05)',
                   border: '1px solid rgba(255,255,255,0.07)',
                   borderRadius: '999px',
                   padding: '8px 18px',
                 }}>
              {Icon && <Icon size={14} style={{ color: 'var(--warning-orange, #F59E0B)' }} />}
              <span className="text-[11px] font-bold uppercase"
                    style={{ color: 'var(--text-secondary)', letterSpacing: '0.14em' }}>
                On {quote.category}
              </span>
            </motion.div>

            {/* Quote */}
            <motion.p variants={itemVariants} className="font-semibold mb-8"
               style={{
                 color: 'var(--text-primary)',
                 fontSize: '22px',
                 lineHeight: 1.5,
                 letterSpacing: '-0.01em',
               }}>
              &ldquo;{quote.quote}&rdquo;
            </motion.p>

            {/* CTA */}
            <motion.button
              variants={itemVariants}
              onClick={onStart}
              whileHover={{ y: -2, filter: 'brightness(1.1)' }}
              whileTap={{ y: 0, scale: 0.98 }}
              className="w-full font-bold text-[15px]"
              style={{
                background: 'var(--gradient-primary)',
                color: '#fff',
                borderRadius: '999px',
                padding: '15px 24px',
                boxShadow: '0 8px 24px rgba(139,92,246,0.4)',
              }}
            >
              Start My Trading Day
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}