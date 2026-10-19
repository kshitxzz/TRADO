import { useRef, useState } from 'react'
import {
  MousePointer2, TrendingUp, TrendingDown, Slash, Minus, MoveUpRight, ArrowRight, SeparatorVertical, Crosshair, Info,
  Spline, AlignJustify, Square, Circle, Triangle, Type, Brush, Ruler, ZoomIn, Magnet, Pencil,
  Lock, Unlock, Eye, EyeOff, Trash2, MoveHorizontal, MoveVertical, ChevronRight,
} from 'lucide-react'
import Popover from './Popover'
import EmojiPicker from './EmojiPicker'
import { TOOLS, TOOL_MENUS } from '../../lib/backtest/drawings'
import { EMOJI_FONT } from '../../lib/backtest/emojiData'

const ICONS = {
  trendline: TrendingUp, ray: MoveUpRight, info: Info, extended: Slash, hline: Minus, hray: ArrowRight, vline: SeparatorVertical,
  cross: Crosshair, channel: Spline, fib: AlignJustify, rect: Square, ellipse: Circle, triangle: Triangle,
  long: TrendingUp, short: TrendingDown, priceRange: MoveVertical, dateRange: MoveHorizontal, measure: Ruler,
  brush: Brush, text: Type, zoom: ZoomIn,
}
const MENU_ICON = { lines: TrendingUp, fib: AlignJustify, shapes: Square, forecast: TrendingUp }
const accent = 'var(--accent-purple-light)'

function RailButton({ active, title, onClick, children, on }) {
  return (
    <button onClick={onClick} title={title} className="w-9 h-9 flex items-center justify-center rounded-md transition-colors hover:bg-white/5"
            style={{ color: active || on ? accent : 'var(--text-secondary)', background: active ? 'rgba(139,92,246,0.16)' : on ? 'rgba(139,92,246,0.08)' : undefined }}>
      {children}
    </button>
  )
}

/** A rail button with a small caret that opens a fly-out beside it. */
function FlyoutGroup({ active, title, onMain, icon, children }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef(null)
  return (
    <div ref={anchor} className="relative">
      <RailButton active={active} title={title} onClick={() => { setOpen(false); onMain() }}>{icon}</RailButton>
      <button onClick={() => setOpen(o => !o)} className="absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-6 flex items-center justify-center rounded opacity-60 hover:opacity-100"
              style={{ color: 'var(--text-muted)' }} title="More tools"><ChevronRight size={10} /></button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} placement="right" offset={10}>
        {children(() => setOpen(false))}
      </Popover>
    </div>
  )
}

const Divider = () => <div className="my-1.5 mx-2 h-px" style={{ background: 'var(--border-subtle)' }} />

export default function DrawingToolbar({
  tool, onTool, magnet, onMagnet, stay, onStay, lockAll, onLock, hideAll, onHide, onClear,
  emoji, onEmoji, recentEmoji, hasDrawings,
}) {
  const [lastTool, setLastTool] = useState({ lines: 'trendline', fib: 'fib', shapes: 'rect', forecast: 'long' })
  const pick = (menuId, t, close) => { setLastTool(s => ({ ...s, [menuId]: t })); onTool(t); close() }

  return (
    <div className="flex flex-col items-center py-2 gap-0.5 h-full" style={{ width: 46, background: 'var(--bg-card)', borderRight: '1px solid var(--border-subtle)' }}>
      <RailButton active={tool === 'cursor' || !tool} title="Cursor" onClick={() => onTool('cursor')}><MousePointer2 size={17} /></RailButton>
      <Divider />

      {TOOL_MENUS.map(m => {
        const Icon = ICONS[lastTool[m.id]] || MENU_ICON[m.id]
        const active = m.sections.some(s => s.tools.includes(tool))
        return (
          <FlyoutGroup key={m.id} active={active} title={`${m.label} (${TOOLS[lastTool[m.id]].label})`} icon={<Icon size={17} />} onMain={() => onTool(lastTool[m.id])}>
            {(close) => (
              <div className="py-1.5 min-w-[236px]">
                {m.sections.map(sec => (
                  <div key={sec.title}>
                    <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>{sec.title}</p>
                    {sec.tools.map(t => {
                      const I = ICONS[t]
                      return (
                        <button key={t} onClick={() => pick(m.id, t, close)} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-white/5"
                                style={{ color: tool === t ? accent : 'var(--text-primary)' }}>
                          <I size={15} style={{ color: 'var(--text-secondary)' }} />
                          <span className="flex-1">{TOOLS[t].label}</span>
                          {TOOLS[t].key && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Alt+{TOOLS[t].key}</span>}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </FlyoutGroup>
        )
      })}

      <RailButton active={tool === 'brush'} title="Brush" onClick={() => onTool('brush')}><Brush size={17} /></RailButton>
      <RailButton active={tool === 'text'} title="Text" onClick={() => onTool('text')}><Type size={17} /></RailButton>

      <FlyoutGroup active={tool === 'emoji'} title={`Emoji ${emoji} — click to stamp, caret to choose`} onMain={() => onTool('emoji')}
                   icon={<span style={{ fontSize: 17, lineHeight: 1, fontFamily: EMOJI_FONT }}>{emoji}</span>}>
        {(close) => <EmojiPicker recent={recentEmoji} onPick={(e) => { onEmoji(e); onTool('emoji'); close() }} />}
      </FlyoutGroup>

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