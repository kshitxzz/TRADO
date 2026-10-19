import { useRef, useState } from 'react'
import Popover from './Popover'
import { Play, Pause, SkipForward, SkipBack, CalendarClock } from 'lucide-react'
import { formatShortDateTime } from '../../hooks/useTimeFormat'

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8]

const IconBtn = ({ title, onClick, active, disabled, children }) => (
  <button title={title} onClick={onClick} disabled={disabled}
          className="h-8 min-w-8 px-2 flex items-center justify-center gap-1.5 rounded-md text-[12px] font-medium transition-colors disabled:opacity-40 hover:bg-white/10"
          style={{ color: active ? 'var(--accent-purple-light)' : 'var(--text-secondary)', background: active ? 'rgba(139,92,246,0.16)' : undefined }}>
    {children}
  </button>
)

export default function ReplayBar({
  clock, playing, onPlay, onPause, onNext, speed, onSpeed, selecting, onSelectBar,
  onJump, progress, atEnd, minDate, maxDate,
}) {
  const [jumpOpen, setJumpOpen] = useState(false)
  const [val, setVal] = useState('')
  const jumpRef = useRef(null)

  return (
    <div className="flex-shrink-0" style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border-subtle)' }}>
      <div className="h-[3px] w-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div className="h-full transition-[width] duration-200" style={{ width: `${Math.min(100, progress * 100)}%`, background: 'var(--gradient-primary)' }} />
      </div>
      <div className="flex items-center gap-1 px-3 h-10">
        <IconBtn title="Select bar — click the chart to jump forward to that candle" active={selecting} onClick={onSelectBar} disabled={atEnd}>
          <SkipBack size={14} /> <span className="hidden sm:inline">Select bar</span>
        </IconBtn>

        <IconBtn title={playing ? 'Pause (Shift+↓)' : 'Play (Shift+↓)'} onClick={playing ? onPause : onPlay} disabled={atEnd}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </IconBtn>
        <IconBtn title="Next bar (Shift+→)" onClick={onNext} disabled={atEnd}><SkipForward size={15} /></IconBtn>

        <div ref={jumpRef}>
          <IconBtn title="Jump to a date" onClick={() => setJumpOpen(o => !o)} active={jumpOpen} disabled={atEnd}><CalendarClock size={15} /></IconBtn>
        </div>
        <Popover anchorRef={jumpRef} open={jumpOpen} onClose={() => setJumpOpen(false)} placement="top">
          <div className="p-2.5 flex items-center gap-2">
            <input type="datetime-local" value={val} min={minDate} max={maxDate} onChange={(e) => setVal(e.target.value)}
                   className="rounded-md px-2 py-1.5 text-[12.5px] outline-none" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            <button onClick={() => { if (val) { onJump(val); setJumpOpen(false) } }} disabled={!val}
                    className="btn-primary px-3 py-1.5 rounded-md text-[12px] font-semibold text-white disabled:opacity-40">Go</button>
          </div>
        </Popover>

        <div className="flex-1 text-center">
          <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{clock || '—'}</span>
          {atEnd && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>End of range</span>}
        </div>

        <div className="flex items-center gap-0.5">
          {SPEEDS.map(s => (
            <button key={s} onClick={() => onSpeed(s)} className="h-7 px-2 rounded-md text-[11.5px] font-semibold tabular-nums transition-colors"
                    style={{ color: speed === s ? '#fff' : 'var(--text-muted)', background: speed === s ? 'var(--accent-purple)' : 'transparent' }}>{s}x</button>
          ))}
        </div>
      </div>
    </div>
  )
}