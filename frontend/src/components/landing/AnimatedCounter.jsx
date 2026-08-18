import { useEffect, useRef, useState } from 'react'
import { useInView, animate } from 'framer-motion'

// ─── AnimatedCounter ────────────────────────────────────────────────────────
// Counts up from 0 to `value` the moment it scrolls into view (once).
// Purely presentational — no live data, this is marketing-page decoration.
export default function AnimatedCounter({ value, prefix = '', suffix = '', decimals = 0, duration = 1.4, className, style }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!inView) return
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    })
    return () => controls.stop()
  }, [inView, value, duration])

  return (
    <span ref={ref} className={className} style={style}>
      {prefix}{display.toFixed(decimals)}{suffix}
    </span>
  )
}