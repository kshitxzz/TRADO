import { createPortal } from 'react-dom'
import { useLayoutEffect, useState, useRef, useEffect } from 'react'

// z-index alone only wins against *siblings within the same stacking
// context*. The topbar's <header> is position:static with no z-index of
// its own, so any descendant page content that creates its own stacking
// context (Framer Motion sets a `transform` on animated elements, which
// does this) can still paint over a topbar dropdown regardless of how high
// its z-index is set. Portaling straight to <body> sidesteps the whole
// problem — the panel is no longer inside the header's stacking context at
// all — and position is computed from the trigger's own bounding rect so it
// still visually anchors to the button that opened it.
//
// `animated`: pass true when children manage their own exit transition
// (e.g. wrapping an <AnimatePresence>/motion.div, like QuickActionsMenu).
// In that mode the portal stays mounted after `open` goes false — once the
// child's exit animation finishes it unmounts itself and renders nothing,
// leaving an empty (harmless) positioned div behind. Non-animated callers
// (the default) unmount immediately on close, same as a plain conditional.
export default function DropdownPortal({ open, anchorRef, onClose, children, width = 320, align = 'right', gap = 8, animated = false }) {
  const [rect, setRect] = useState(null)
  const panelRef = useRef(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    function update() { setRect(anchorRef.current.getBoundingClientRect()) }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef])

  // Optional — click-outside-to-close, checked against both the portaled
  // panel and the trigger button (which live in different DOM subtrees
  // once portaled, so a single wrapping ref can't cover both anymore).
  useEffect(() => {
    if (!open || !onClose) return
    function onDown(e) {
      if (panelRef.current?.contains(e.target)) return
      if (anchorRef.current?.contains(e.target)) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onClose, anchorRef])

  if (!rect) return null
  if (!animated && !open) return null

  const style = {
    position: 'fixed',
    top: rect.bottom + gap,
    zIndex: 9999,
    width,
    maxWidth: 'calc(100vw - 24px)',
    ...(align === 'right'
      ? { right: Math.max(12, window.innerWidth - rect.right) }
      : { left: Math.max(12, rect.left) }),
  }

  return createPortal(<div ref={panelRef} style={style}>{children}</div>, document.body)
}