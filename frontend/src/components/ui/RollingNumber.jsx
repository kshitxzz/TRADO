import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

// ─── RollingNumber ──────────────────────────────────────────────────────────
// Renders a formatted number where each digit rolls vertically to its new
// value on change — the "odometer" tick effect used for live P&L/balance
// updates (Today, Total P&L, Current Balance). Non-digit characters ($, +,
// -, commas, decimal point) swap instantly with no roll.
//
// `value`  — the raw number driving the display (e.g. 394883.27)
// `format` — (number) => string, produces the full display string
//            (e.g. formatPnl, or a custom currency formatter)
//
// Direction is derived from whether `value` increased or decreased since
// the last render, so a jump up rolls digits upward and a drop rolls them
// down — matching how a real counter/odometer behaves in either direction.
export default function RollingNumber({ value, format, className, style }) {
  const prevValueRef = useRef(value)
  const [dir, setDir] = useState(1) // 1 = counting up, -1 = counting down

  useEffect(() => {
    const prev = prevValueRef.current
    if (typeof value === 'number' && typeof prev === 'number' && value !== prev) {
      setDir(value > prev ? 1 : -1)
    }
    prevValueRef.current = value
  }, [value])

  const display = format(value)
  const chars = useMemo(() => display.split(''), [display])

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', fontVariantNumeric: 'tabular-nums', ...style }}
    >
      {chars.map((ch, i) => {
        if (!/[0-9]/.test(ch)) {
          return (
            <span key={`s-${i}`} style={{ display: 'inline-block' }}>
              {ch}
            </span>
          )
        }
        return (
          <span
            key={`d-${i}`}
            style={{
              display: 'inline-block',
              overflow: 'hidden',
              position: 'relative',
              height: '1.15em',
              lineHeight: '1.15em',
              verticalAlign: 'bottom',
            }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={ch}
                initial={{ y: `${dir * 100}%`, opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                exit={{ y: `${-dir * 100}%`, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                style={{ display: 'inline-block', width: '100%', textAlign: 'center' }}
              >
                {ch}
              </motion.span>
            </AnimatePresence>
          </span>
        )
      })}
    </span>
  )
}