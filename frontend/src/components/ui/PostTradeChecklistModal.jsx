import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, ClipboardCheck, TrendingUp, TrendingDown } from 'lucide-react'
import PairIcon from './PairIcon'
import { DEFAULT_EXECUTION_CHECKLIST } from '../../data/executionChecklist'

// ── Motion choreography ───────────────────────────────────────────────────────
// The reference behaviour: the instant a trade closes, the backdrop blurs in
// and the card scales/fades in almost immediately (~150ms) — no lag between
// "trade closed" and "checklist visible". Exit is even quicker, so the next
// queued trade (if any) can appear right after without feeling sluggish.
const backdropVariants = {
  hidden:  { opacity: 0, backdropFilter: 'blur(0px)' },
  visible: { opacity: 1, backdropFilter: 'blur(6px)', transition: { duration: 0.15, ease: 'easeOut' } },
  exit:    { opacity: 0, backdropFilter: 'blur(0px)', transition: { duration: 0.12, ease: 'easeIn' } },
}

const cardVariants = {
  hidden:  { opacity: 0, scale: 0.94, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 26, stiffness: 380 } },
  exit:    { opacity: 0, scale: 0.96, y: 6, transition: { duration: 0.12, ease: 'easeIn' } },
}

export default function PostTradeChecklistModal({ trade, saving, onSave, onSkip }) {
  // Keyed by item id -> bool. Simpler to toggle than mutating an array, and
  // gets rebuilt into the canonical [{id,label,checked}] shape on Save.
  const [checkedMap, setCheckedMap] = useState({})

  // Fresh checklist for every new trade — including when the next one in
  // the queue takes over immediately after this one is answered/skipped.
  useEffect(() => { setCheckedMap({}) }, [trade?.id])

  function toggle(id) {
    setCheckedMap(m => ({ ...m, [id]: !m[id] }))
  }

  function handleSave() {
    const checklist = DEFAULT_EXECUTION_CHECKLIST.map(item => ({
      ...item,
      checked: !!checkedMap[item.id],
    }))
    onSave(checklist)
  }

  const checkedCount = Object.values(checkedMap).filter(Boolean).length
  const isLong = trade?.side === 'BUY' || trade?.side === 'long'
  const pnl = trade?.pnl ?? 0

  return (
    <AnimatePresence>
      {trade && (
        <motion.div
          variants={backdropVariants} initial="hidden" animate="visible" exit="exit"
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
        >
          <motion.div
            variants={cardVariants} initial="hidden" animate="visible" exit="exit"
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* ── Header ── */}
            <div className="flex items-start justify-between px-5 pt-5 pb-4">
              <div className="flex items-center gap-2.5">
                <PairIcon symbol={trade.symbol} size={34} />
                <div>
                  <div className="font-bold text-[15px] leading-tight" style={{ color: 'var(--text-primary)' }}>
                    {trade.symbol}
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide"
                        style={{ color: isLong ? '#3B82F6' : '#EF4444' }}>
                    {isLong ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {isLong ? 'Long' : 'Short'}
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="font-bold text-[15px] pt-1" style={{ color: pnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }}>
                  {pnl >= 0 ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
                </span>
                <button onClick={onSkip} className="p-1 rounded-lg hover:bg-white/5 transition-colors"
                        style={{ color: 'var(--text-muted)' }} aria-label="Dismiss">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* ── Title ── */}
            <div className="px-5 pb-3">
              <div className="flex items-center gap-1.5 mb-1">
                <ClipboardCheck size={15} style={{ color: 'var(--accent-purple)' }} />
                <h3 className="font-bold text-[15px]" style={{ color: 'var(--text-primary)' }}>
                  Pre-Trade Checklist
                </h3>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Did you follow your trading rules?
              </p>
            </div>

            {/* ── Checklist items ── */}
            <div className="px-5 pb-2 space-y-2">
              {DEFAULT_EXECUTION_CHECKLIST.map(item => {
                const isChecked = !!checkedMap[item.id]
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item.id)}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-colors"
                    style={{
                      background: isChecked ? 'rgba(34,197,94,0.08)' : 'transparent',
                      border: `1px solid ${isChecked ? 'rgba(34,197,94,0.35)' : 'var(--border-subtle)'}`,
                    }}
                  >
                    <span
                      className="w-[18px] h-[18px] rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{
                        background: isChecked ? 'var(--positive-green)' : 'transparent',
                        border: `1.5px solid ${isChecked ? 'var(--positive-green)' : 'var(--border-subtle)'}`,
                      }}
                    >
                      {isChecked && <Check size={12} strokeWidth={3} color="#fff" />}
                    </span>
                    <span className="text-sm" style={{ color: isChecked ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {item.label}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* ── Footer ── */}
            <div className="flex items-center justify-between px-5 pt-3 pb-5">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {checkedCount}/{DEFAULT_EXECUTION_CHECKLIST.length} checked
              </span>
              <div className="flex items-center gap-4">
                <button onClick={onSkip} disabled={saving}
                        className="text-sm font-medium disabled:opacity-50"
                        style={{ color: 'var(--text-muted)' }}>
                  Skip
                </button>
                <button onClick={handleSave} disabled={saving}
                        className="btn-primary py-2 px-5 text-sm disabled:opacity-60">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}