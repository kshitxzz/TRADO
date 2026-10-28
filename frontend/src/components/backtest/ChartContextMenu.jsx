import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'

/**
 * Right-click menu. `items`: { type:'sep' } | { label, shortcut?, icon?, onClick?, disabled?, danger?, children?: items[] }
 * Opens at the pointer, flips to stay on screen, closes on outside click / Esc / scroll / resize.
 */
export default function ChartContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [sub, setSub] = useState(null)               // index of the open submenu

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth, h = el.offsetHeight
    setPos({ left: Math.max(8, Math.min(x, window.innerWidth - w - 8)), top: Math.max(8, Math.min(y, window.innerHeight - h - 8)) })
  }, [x, y, items.length])

  useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest?.('[data-ctx-sub]')) onClose() }
    const key = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key); window.removeEventListener('resize', onClose); window.removeEventListener('blur', onClose) }
  }, [onClose])

  const row = (it, i, nested) => {
    if (it.type === 'sep') return <div key={`s${i}`} className="my-1 h-px" style={{ background: 'var(--border-subtle)' }} />
    const Icon = it.icon
    return (
      <div key={i} className="relative" onMouseEnter={() => !nested && setSub(it.children ? i : null)}>
        <button type="button" disabled={it.disabled}
                onClick={() => { if (it.children) return; it.onClick?.(); onClose() }}
                className="w-full flex items-center gap-3 pl-2.5 pr-3 h-[34px] text-left text-[13px] disabled:opacity-40 hover:bg-white/[0.07] transition-colors"
                style={{ color: it.danger ? 'var(--negative-red)' : 'var(--text-primary)' }}>
          <span className="w-5 flex items-center justify-center flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{Icon && <Icon size={15} />}</span>
          <span className="flex-1 truncate">{it.label}</span>
          {it.shortcut && <span className="text-[11px] ml-5 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{it.shortcut}</span>}
          {it.children && <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />}
        </button>
        {it.children && sub === i && (
          <div data-ctx-sub className="absolute top-0 rounded-xl py-1.5 min-w-[230px] max-h-[300px] overflow-y-auto"
               style={{ left: pos.left + 280 + 230 > window.innerWidth ? undefined : '100%', right: pos.left + 280 + 230 > window.innerWidth ? '100%' : undefined, marginLeft: 4, marginRight: 4, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 16px 50px rgba(0,0,0,0.55)' }}>
            {it.children.length ? it.children.map((c, j) => row(c, j, true)) : <p className="px-3 py-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>Nothing here yet</p>}
          </div>
        )}
      </div>
    )
  }

  return createPortal(
    <div ref={ref} onContextMenu={(e) => e.preventDefault()} className="rounded-xl py-1.5"
         style={{ position: 'fixed', zIndex: 130, left: pos.left, top: pos.top, minWidth: 280, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
      {items.map((it, i) => row(it, i, false))}
    </div>,
    document.body,
  )
}