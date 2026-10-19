import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MARGIN = 8

/**
 * A dropdown that is rendered into <body> with position: fixed, so no parent's
 * overflow (the scrolling top bar, the narrow toolbar rail, a clipped panel) can
 * ever cut it off or add a scrollbar to it.
 *
 *   anchorRef   the element it hangs from
 *   placement   'bottom' (below the anchor) | 'top' | 'right' (beside it)
 *   align       'left' | 'right' — which anchor edge the popover lines up with (bottom/top)
 */
export default function Popover({
  anchorRef, open, onClose, children, placement = 'bottom', align = 'left', offset = 6, className = '', style,
}) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect()
      const el = ref.current
      if (!a || !el) return
      const w = el.offsetWidth, h = el.offsetHeight
      const vw = window.innerWidth, vh = window.innerHeight
      const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi))
      let left, top, maxH

      if (placement === 'right') {
        left = a.right + offset
        if (left + w > vw - MARGIN) left = Math.max(MARGIN, a.left - w - offset)      // no room → open to the left
        top = clamp(a.top, MARGIN, Math.max(MARGIN, vh - h - MARGIN))
        maxH = vh - top - MARGIN
      } else {
        left = align === 'right' ? a.right - w : a.left
        left = clamp(left, MARGIN, Math.max(MARGIN, vw - w - MARGIN))
        const below = vh - a.bottom - offset - MARGIN
        const above = a.top - offset - MARGIN
        const goUp = placement === 'top' ? !(h > above && below > above) : (h > below && above > below)
        if (goUp) { maxH = above; top = Math.max(MARGIN, a.top - offset - Math.min(h, above)) }
        else { maxH = below; top = a.bottom + offset }
      }
      setPos(p => (p && p.left === left && p.top === top && p.maxH === maxH ? p : { left, top, maxH }))
    }
    place()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null
    if (ro && ref.current) ro.observe(ref.current)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { ro?.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, placement, align, offset, anchorRef])

  useEffect(() => {
    if (!open) return
    const down = (e) => {
      if (ref.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return
      onClose?.()
    }
    const key = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('pointerdown', down)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key) }
  }, [open, onClose, anchorRef])

  if (!open) return null
  return createPortal(
    <div ref={ref} className={className}
         style={{
           position: 'fixed', zIndex: 120, left: pos?.left ?? -9999, top: pos?.top ?? -9999,
           maxHeight: pos?.maxH, overflowY: 'auto', visibility: pos ? 'visible' : 'hidden',
           background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 12,
           boxShadow: '0 16px 50px rgba(0,0,0,0.55)', ...style,
         }}>
      {children}
    </div>,
    document.body,
  )
}