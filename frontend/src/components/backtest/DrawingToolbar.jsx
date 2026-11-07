import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus, Eraser, Ruler, ZoomIn, Magnet, PenLine, Lock, Unlock, Eye, EyeOff, Trash2, Square, Circle, Triangle, Type, Brush, Highlighter, ArrowBigUp, ArrowBigDown, Smile,
} from 'lucide-react'
import Popover from './Popover'
import EmojiPicker from './EmojiPicker'
import { TOOLS, TOOL_MENUS } from '../../lib/backtest/drawings'
import { EMOJI_FONT } from '../../lib/backtest/emojiData'

// ── icons: thin 1.5px strokes with round node dots, like TradingView's ─────
const S = ({ children, size = 22, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...p}>{children}</svg>
)
const node = (x, y) => <circle cx={x} cy={y} r={2.2} />
const L = (p) => <Plus strokeWidth={1.5} {...p} />

export const TOOL_ICONS = {
  cursor: (p) => <L {...p} />,
  eraser: (p) => <Eraser strokeWidth={1.5} {...p} />,
  trendline: (p) => <S {...p}><path d="M7.4 16.6 16.6 7.4" />{node(5.5, 18.5)}{node(18.5, 5.5)}</S>,
  ray: (p) => <S {...p}><path d="M7.4 16.6 21 3" />{node(5.5, 18.5)}</S>,
  info: (p) => <S {...p}><path d="M7.4 16.6 16.6 7.4" />{node(5.5, 18.5)}{node(18.5, 5.5)}<path d="M4 4h6M4 7h4" /></S>,
  extended: (p) => <S {...p}><path d="M3 21 21 3" />{node(9, 15)}{node(15, 9)}</S>,
  arrow: (p) => <S {...p}><path d="M5 19 18 6M10 6h8v8" /></S>,
  hline: (p) => <S {...p}><path d="M3 12h4.5M16.5 12H21" />{node(12, 12)}</S>,
  hray: (p) => <S {...p}><path d="M7 12h14" />{node(5, 12)}</S>,
  vline: (p) => <S {...p}><path d="M12 3v4.5M12 16.5V21" />{node(12, 12)}</S>,
  cross: (p) => <S {...p}><path d="M3 12h18M12 3v18" />{node(12, 12)}</S>,
  channel: (p) => <S {...p}><path d="M4 15 19 6M4 21 19 12" />{node(4, 15)}{node(19, 6)}</S>,
  fib: (p) => <S {...p}><path d="M4 6h16M4 12h16M4 18h16" />{node(4, 6)}{node(20, 18)}</S>,
  long: (p) => <S {...p}><path d="M3 7h12M3 17h12M3 12h18" /><text x="8" y="11" fontSize="5.5" fill="currentColor" stroke="none">L</text></S>,
  short: (p) => <S {...p}><path d="M3 7h12M3 17h12M3 12h18" /><text x="8" y="11" fontSize="5.5" fill="currentColor" stroke="none">S</text></S>,
  priceRange: (p) => <S {...p}><path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4" /></S>,
  dateRange: (p) => <S {...p}><path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" /></S>,
  measure: (p) => <S {...p}><rect x="5" y="5" width="14" height="14" /><path d="M12 8v8M8 12h8" /></S>,
  brush: (p) => <Brush strokeWidth={1.5} {...p} />,
  highlighter: (p) => <Highlighter strokeWidth={1.5} {...p} />,
  arrowUp: (p) => <ArrowBigUp strokeWidth={1.5} {...p} />,
  arrowDown: (p) => <ArrowBigDown strokeWidth={1.5} {...p} />,
  rect: (p) => <Square strokeWidth={1.5} {...p} />,
  path: (p) => <S {...p}><path d="M4 17 9 8l5 7 6-9" />{node(4, 17)}{node(9, 8)}{node(14, 15)}</S>,
  circle: (p) => <Circle strokeWidth={1.5} {...p} />,
  ellipse: (p) => <S {...p}><ellipse cx="12" cy="12" rx="9" ry="6" /></S>,
  polyline: (p) => <S {...p}><path d="M5 18 4 9l8-5 8 7-4 8Z" /></S>,
  triangle: (p) => <Triangle strokeWidth={1.5} {...p} />,
  text: (p) => <Type strokeWidth={1.5} {...p} />,
  emoji: (p) => <Smile strokeWidth={1.5} {...p} />,
  ruler: (p) => <Ruler strokeWidth={1.5} {...p} />,
  zoom: (p) => <ZoomIn strokeWidth={1.5} {...p} />,
}
const Ico = ({ id, size = 22 }) => { const C = TOOL_ICONS[id]; return C ? <C width={size} height={size} /> : null }

const accent = 'var(--accent-purple-light)'
const ACTIVE_BG = 'rgba(139,92,246,0.18)'

// ── tooltip (rendered in <body> so the rail can never clip it) ─────────────
function Tip({ text, children }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  const timer = useRef(0)
  const show = () => { timer.current = window.setTimeout(() => { const r = ref.current?.getBoundingClientRect(); if (r) setPos({ x: r.right + 12, y: r.top + r.height / 2 }) }, 280) }
  const hide = () => { window.clearTimeout(timer.current); setPos(null) }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <div ref={ref} onPointerEnter={show} onPointerLeave={hide} onPointerDown={hide} className="relative flex">
      {children}
      {pos && createPortal(
        <div className="fixed z-[200] pointer-events-none px-2.5 py-1.5 rounded-md text-[12px] whitespace-nowrap"
             style={{ left: pos.x, top: pos.y, transform: 'translateY(-50%)', background: '#2A2E39', color: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,0.5)' }}>{text}</div>,
        document.body,
      )}
    </div>
  )
}

function RailButton({ active, on, title, onClick, children, danger }) {
  return (
    <Tip text={title}>
      <button type="button" onClick={onClick} aria-label={title}
              className="w-10 h-10 flex items-center justify-center rounded-md transition-colors hover:bg-white/[0.07]"
              style={{ color: active ? accent : on ? accent : danger ? 'var(--negative-red)' : 'var(--text-secondary)', background: active ? ACTIVE_BG : on ? 'rgba(139,92,246,0.09)' : undefined }}>
        {children}
      </button>
    </Tip>
  )
}

/** A rail button with a small tab on its right edge that opens the fly-out of related tools. */
function FlyoutGroup({ active, title, onMain, icon, children }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef(null)
  return (
    <div ref={anchor} className="relative group/fly">
      <RailButton active={active} title={title} onClick={() => { setOpen(false); onMain() }}>{icon}</RailButton>
      <button type="button" onClick={() => setOpen(o => !o)} aria-label={`${title} — more tools`}
              className="absolute top-1/2 -translate-y-1/2 -right-[5px] w-[14px] h-[22px] rounded flex items-center justify-center opacity-0 group-hover/fly:opacity-100 focus:opacity-100 transition-opacity"
              style={{ background: open ? '#363A45' : '#262A35', color: '#D1D4DC', zIndex: 2, opacity: open ? 1 : undefined }}>
        <svg width="7" height="9" viewBox="0 0 7 9"><path d="M1.5 1.2 5 4.5 1.5 7.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} placement="right" offset={12} style={{ borderRadius: 8 }}>
        {children(() => setOpen(false))}
      </Popover>
    </div>
  )
}

const Divider = () => <div className="my-1.5 mx-[10px] h-px" style={{ background: 'var(--border-subtle)' }} />

function MenuItem({ id, label, hint, on, onClick }) {
  return (
    <button type="button" role="menuitem" onClick={onClick}
            className="w-full flex items-center gap-3 pl-3 pr-4 h-[34px] text-left text-[13px] transition-colors hover:bg-white/[0.06]"
            style={{ color: on ? accent : 'var(--text-primary)', background: on ? ACTIVE_BG : undefined }}>
      <span className="w-[22px] flex-shrink-0 flex" style={{ color: on ? accent : 'var(--text-secondary)' }}><Ico id={id} size={20} /></span>
      <span className="flex-1 whitespace-nowrap">{label}</span>
      {hint && <span className="text-[11px] pl-4" style={{ color: 'var(--text-muted)' }}>{hint}</span>}
    </button>
  )
}
const SectionTitle = ({ children }) => <p className="px-3 pt-2.5 pb-1 text-[10.5px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>{children}</p>

export default function DrawingToolbar({
  tool, onTool, magnet, onMagnet, stay, onStay, lockAll, onLock, hideAll, onHide, onClear,
  emoji, onEmoji, recentEmoji, hasDrawings,
}) {
  const [last, setLast] = useState({ lines: 'trendline', fib: 'fib', forecast: 'long', shapes: 'rect', cursors: 'cursor' })
  const pick = (menuId, t, close) => { setLast(s => ({ ...s, [menuId]: t })); onTool(t); close() }
  const cursorActive = tool === 'cursor' || tool === 'eraser' || !tool

  return (
    <div className="flex flex-col items-center py-2 gap-0.5 h-full flex-shrink-0 overflow-y-auto overflow-x-hidden" style={{ width: 52, scrollbarWidth: 'none', background: 'var(--bg-card)', borderRight: '1px solid var(--border-subtle)' }}>
      {/* cursors */}
      <FlyoutGroup active={cursorActive} title={last.cursors === 'eraser' ? 'Eraser' : 'Cross'} icon={<Ico id={last.cursors} />}
                   onMain={() => onTool(last.cursors)}>
        {(close) => (
          <div className="py-1.5 min-w-[200px]">
            <MenuItem id="cursor" label="Cross" on={tool === 'cursor'} onClick={() => pick('cursors', 'cursor', close)} />
            <MenuItem id="eraser" label="Eraser" on={tool === 'eraser'} onClick={() => pick('cursors', 'eraser', close)} />
          </div>
        )}
      </FlyoutGroup>
      <Divider />

      {TOOL_MENUS.map(m => {
        const cur = last[m.id]
        const active = m.sections.some(s => s.tools.includes(tool))
        return (
          <FlyoutGroup key={m.id} active={active} title={`${m.label} — ${TOOLS[cur].label}`} icon={<Ico id={cur} />} onMain={() => onTool(cur)}>
            {(close) => (
              <div className="py-1.5 min-w-[250px]">
                {m.sections.map((sec, i) => (
                  <div key={sec.title}>
                    {i > 0 && <div className="my-1 h-px" style={{ background: 'var(--border-subtle)' }} />}
                    <SectionTitle>{sec.title}</SectionTitle>
                    {sec.tools.map(t => <MenuItem key={t} id={t} label={TOOLS[t].label} hint={TOOLS[t].key ? `Alt+${TOOLS[t].key}` : null} on={tool === t} onClick={() => pick(m.id, t, close)} />)}
                  </div>
                ))}
              </div>
            )}
          </FlyoutGroup>
        )
      })}

      <RailButton active={tool === 'text'} title="Text" onClick={() => onTool('text')}><Ico id="text" /></RailButton>

      <FlyoutGroup active={tool === 'emoji'} title={`Emojis — ${emoji} click to stamp, tab to choose`} onMain={() => onTool('emoji')}
                   icon={<span style={{ fontSize: 20, lineHeight: 1, fontFamily: EMOJI_FONT }}>{emoji}</span>}>
        {(close) => <EmojiPicker recent={recentEmoji} onPick={(e) => { onEmoji(e); onTool('emoji'); close() }} />}
      </FlyoutGroup>

      <Divider />
      <RailButton active={tool === 'measure'} title="Measure (Alt+M)" onClick={() => onTool('measure')}><Ico id="ruler" /></RailButton>
      <RailButton active={tool === 'zoom'} title="Zoom in — drag a box" onClick={() => onTool('zoom')}><Ico id="zoom" /></RailButton>

      <div className="flex-1 min-h-2" />

      <Divider />
      <RailButton on={magnet} title={`Magnet mode — snap to candle highs / lows / open / close: ${magnet ? 'on' : 'off'}`} onClick={onMagnet}><Magnet size={22} strokeWidth={1.5} /></RailButton>
      <RailButton on={stay} title={`Stay in drawing mode: ${stay ? 'on' : 'off'}`} onClick={onStay}><PenLine size={22} strokeWidth={1.5} /></RailButton>
      <RailButton on={lockAll} title={lockAll ? 'Unlock all drawings' : 'Lock all drawings'} onClick={onLock}>{lockAll ? <Lock size={22} strokeWidth={1.5} /> : <Unlock size={22} strokeWidth={1.5} />}</RailButton>
      <RailButton on={hideAll} title={hideAll ? 'Show all drawings' : 'Hide all drawings'} onClick={onHide}>{hideAll ? <EyeOff size={22} strokeWidth={1.5} /> : <Eye size={22} strokeWidth={1.5} />}</RailButton>
      <Divider />
      <RailButton title="Remove all drawings" danger={hasDrawings} onClick={onClear}>
        <span style={{ opacity: hasDrawings ? 1 : 0.5, display: 'flex' }}><Trash2 size={22} strokeWidth={1.5} /></span>
      </RailButton>
    </div>
  )
}