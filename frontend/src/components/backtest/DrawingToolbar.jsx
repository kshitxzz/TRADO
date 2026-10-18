import { useEffect, useRef, useState } from 'react'
import {
  MousePointer2, TrendingUp, TrendingDown, Slash, Minus, MoveUpRight, ArrowRight, SeparatorVertical, Crosshair, Info,
  Spline, AlignJustify, Square, Circle, Triangle, Type, Smile, Brush, Ruler, ZoomIn, Magnet, Pencil,
  Lock, Unlock, Eye, EyeOff, Trash2, MoveHorizontal, MoveVertical, ChevronRight,
} from 'lucide-react'
import { TOOLS, TOOL_MENUS, EMOJIS } from '../../lib/backtest/drawings'

const ICONS = {
  trendline: TrendingUp, ray: MoveUpRight, info: Info, extended: Slash, hline: Minus, hray: ArrowRight, vline: SeparatorVertical,
  cross: Crosshair, channel: Spline, fib: AlignJustify, rect: Square, ellipse: Circle, triangle: Triangle,
  long: TrendingUp, short: TrendingDown, priceRange: MoveVertical, dateRange: MoveHorizontal, measure: Ruler,
  brush: Brush, text: Type, emoji: Smile, zoom: ZoomIn,
}
const MENU_ICON = { lines: TrendingUp, fib: AlignJustify, shapes: Square, forecast: TrendingUp }

const accent = 'var(--accent-purple-light)'

function RailButton({ active, title, onClick, children, caret, onCaret, on }) {
  return (
    <div className="relative group">
      <button onClick={onClick} title={title}
              className="w-9 h-9 flex items-center justify-center rounded-md transition-colors"
              style={{
                color: active || on ? accent : 'var(--text-secondary)',
                background: active ? 'rgba(139,92,246,0.16)' : on ? 'rgba(139,92,246,0.08)' : 'transparent',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = on ? 'rgba(139,92,246,0.08)' : 'transparent' }}>
        {children}
      </button>
      {caret && (
        <button onClick={onCaret} className="absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-6 flex items-center justify-center rounded opacity-60 hover:opacity-100"
                style={{ color: 'var(--text-muted)' }} title="More tools">
          <ChevronRight size={10} />
        </button>
      )}
    </div>
  )
}

const Divider = () => <div className="my-1.5 mx-2 h-px" style={{ background: 'var(--border-subtle)' }} />

export default function DrawingToolbar({
  tool, onTool, magnet, onMagnet, stay, onStay, lockAll, onLock, hideAll, onHide, onClear, emoji, onEmoji, hasDrawings,
}) {
  const [open, setOpen] = useState(null)             // flyout id
  const [lastTool, setLastTool] = useState({ lines: 'trendline', fib: 'fib', shapes: 'rect', forecast: 'long' })
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null) }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [])

  const pick = (menuId, t) => {
    setLastTool(s => ({ ...s, [menuId]: t }))
    onTool(t)
    setOpen(null)
  }

  const Menu = ({ m }) => (
    <div className="absolute left-full top-0 ml-1.5 z-50 rounded-lg py-1.5 min-w-[230px] max-h-[70vh] overflow-y-auto"
         style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 12px 40px rgba(0,0,0,0.45)' }}>
      {m.sections.map(sec => (
        <div key={sec.title}>
          <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>{sec.title}</p>
          {sec.tools.map(t => {
            const Icon = ICONS[t]
            return (
              <button key={t} onClick={() => pick(m.id, t)}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-white/5"
                      style={{ color: tool === t ? accent : 'var(--text-primary)' }}>
                <Icon size={15} style={{ color: 'var(--text-secondary)' }} />
                <span className="flex-1">{TOOLS[t].label}</span>
                {TOOLS[t].key && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Alt+{TOOLS[t].key}</span>}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )

  return (
    <div ref={ref} className="flex flex-col items-center py-2 gap-0.5 h-full overflow-visible"
         style={{ width: 46, background: 'var(--bg-card)', borderRight: '1px solid var(--border-subtle)' }}>
      <RailButton active={tool === 'cursor' || !tool} title="Cursor" onClick={() => onTool('cursor')}><MousePointer2 size={17} /></RailButton>
      <Divider />

      {TOOL_MENUS.map(m => {
        const Icon = ICONS[lastTool[m.id]] || MENU_ICON[m.id]
        const active = m.sections.some(s => s.tools.includes(tool))
        return (
          <div key={m.id} className="relative">
            <RailButton active={active} title={`${m.label} (${TOOLS[lastTool[m.id]].label})`} caret
                        onClick={() => onTool(lastTool[m.id])} onCaret={() => setOpen(o => (o === m.id ? null : m.id))}>
              <Icon size={17} />
            </RailButton>
            {open === m.id && <Menu m={m} />}
          </div>
        )
      })}

      <RailButton active={tool === 'brush'} title="Brush" onClick={() => onTool('brush')}><Brush size={17} /></RailButton>
      <RailButton active={tool === 'text'} title="Text" onClick={() => onTool('text')}><Type size={17} /></RailButton>

      <div className="relative">
        <RailButton active={tool === 'emoji'} title={`Emoji ${emoji}`} caret onClick={() => onTool('emoji')} onCaret={() => setOpen(o => (o === 'emoji' ? null : 'emoji'))}>
          <span className="text-[16px] leading-none">{emoji}</span>
        </RailButton>
        {open === 'emoji' && (
          <div className="absolute left-full top-0 ml-1.5 z-50 rounded-lg p-2 grid grid-cols-4 gap-1"
               style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 12px 40px rgba(0,0,0,0.45)' }}>
            {EMOJIS.map(e => (
              <button key={e} className="w-8 h-8 rounded-md text-lg hover:bg-white/10" onClick={() => { onEmoji(e); onTool('emoji'); setOpen(null) }}>{e}</button>
            ))}
          </div>
        )}
      </div>

      <RailButton active={tool === 'measure'} title="Measure (Alt+M)" onClick={() => onTool('measure')}><Ruler size={17} /></RailButton>
      <RailButton active={tool === 'zoom'} title="Zoom in — drag a box" onClick={() => onTool('zoom')}><ZoomIn size={17} /></RailButton>

      <div className="flex-1" />

      <RailButton on={magnet} title={`Magnet — snap to candle highs/lows/open/close: ${magnet ? 'on' : 'off'}`} onClick={onMagnet}><Magnet size={17} /></RailButton>
      <RailButton on={stay} title={`Stay in drawing mode: ${stay ? 'on' : 'off'}`} onClick={onStay}><Pencil size={17} /></RailButton>
      <RailButton on={lockAll} title={`Lock all drawings: ${lockAll ? 'locked' : 'unlocked'}`} onClick={onLock}>{lockAll ? <Lock size={17} /> : <Unlock size={17} />}</RailButton>
      <RailButton on={hideAll} title={`${hideAll ? 'Show' : 'Hide'} all drawings`} onClick={onHide}>{hideAll ? <EyeOff size={17} /> : <Eye size={17} />}</RailButton>
      <RailButton title="Remove all drawings" onClick={onClear}>
        <Trash2 size={17} style={{ color: hasDrawings ? 'var(--negative-red)' : undefined, opacity: hasDrawings ? 1 : 0.5 }} />
      </RailButton>
    </div>
  )
}