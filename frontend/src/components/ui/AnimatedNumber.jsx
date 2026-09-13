import { useEffect, useRef, useState } from 'react'

// Ease-out cubic count-up. Animates from whatever it last displayed (0 on
// first mount) to `value` over `duration`ms — used across the Performance
// page's stat cards so numbers visibly tick upward on load / data change,
// matching the reference recording. Purely presentational: it never
// touches the underlying number, just how it's revealed.
export default function AnimatedNumber({ value, duration = 1100, formatter, decimals = 0, prefix = '', suffix = '' }) {
  const [display, setDisplay] = useState(0)
  const fromRef  = useRef(0)
  const rafRef   = useRef(null)
  const startRef = useRef(null)

  useEffect(() => {
    const from = fromRef.current
    const to = Number.isFinite(value) ? value : 0
    startRef.current = null
    cancelAnimationFrame(rafRef.current)

    function tick(ts) {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const t = Math.min(1, duration <= 0 ? 1 : elapsed / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const current = from + (to - from) * eased
      setDisplay(current)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
        setDisplay(to)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  if (formatter) return <>{formatter(display)}</>
  return <>{prefix}{display.toFixed(decimals)}{suffix}</>
}