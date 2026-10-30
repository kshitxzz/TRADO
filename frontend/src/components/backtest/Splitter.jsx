import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const GREEN = '#1ECE80'

/**
 * Drag handle between two panes. `orientation="vertical"` is the bar between side-by-side panes (drags left / right);
 * "horizontal" is the bar between stacked panes (drags up / down). While hovering or dragging the bar turns into a 4px
 * green line. Double-click resets. `onToggle` adds a small chevron that collapses / expands the pane next to it.
 *
 * onDrag receives the distance (px) dragged since the pointer went down; the parent adds it to the size it had then.
 */
export default function Splitter({ orientation = 'vertical', onDragStart, onDrag, onDragEnd, onReset, onToggle, collapsed = false, title }) {
  const vertical = orientation === 'vertical'
  const [hot, setHot] = useState(false)
  const [dragging, setDragging] = useState(false)
  const from = useRef(null)
  const lit = (hot || dragging) && !collapsed

  const down = (e) => {
    if (e.button !== 0 || collapsed || e.target.closest('[data-splitter-toggle]')) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    from.current = vertical ? e.clientX : e.clientY
    setDragging(true)
    document.body.style.cursor = vertical ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    onDragStart?.()
  }
  const move = (e) => {
    if (from.current == null) return
    onDrag?.((vertical ? e.clientX : e.clientY) - from.current)
  }
  const up = () => {
    if (from.current == null) return
    from.current = null
    setDragging(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    onDragEnd?.()
  }

  const Chev = collapsed ? ChevronLeft : ChevronRight
  return (
    <div className="relative flex-shrink-0" style={vertical ? { width: 6 } : { height: 6 }}>
      <div role="separator" aria-orientation={vertical ? 'vertical' : 'horizontal'} title={title}
           onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={() => !collapsed && onReset?.()}
           onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)}
           className="absolute z-30 touch-none"
           style={{ ...(vertical ? { top: 0, bottom: 0, left: -3, right: -3, cursor: collapsed ? 'default' : 'col-resize' } : { left: 0, right: 0, top: -3, bottom: -3, cursor: 'row-resize' }) }}>
        <div className="absolute transition-colors"
             style={vertical
               ? { top: 0, bottom: 0, left: '50%', width: lit ? 4 : 1, transform: 'translateX(-50%)', background: lit ? GREEN : 'var(--border-subtle)' }
               : { left: 0, right: 0, top: '50%', height: lit ? 4 : 1, transform: 'translateY(-50%)', background: lit ? GREEN : 'var(--border-subtle)' }} />
        {onToggle && vertical && (
          <button type="button" data-splitter-toggle onClick={onToggle} title={collapsed ? 'Show order panel' : 'Hide order panel'}
                  className="absolute flex items-center justify-center rounded-md hover:bg-white/10"
                  style={{ top: 10, left: collapsed ? -16 : '50%', transform: collapsed ? undefined : 'translateX(-50%)', width: 20, height: 26, color: 'var(--text-secondary)', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <Chev size={14} />
          </button>
        )}
      </div>
    </div>
  )
}