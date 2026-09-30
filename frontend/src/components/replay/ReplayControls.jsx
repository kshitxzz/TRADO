import { Clock, Pause, Play, RotateCcw } from 'lucide-react'
import { SPEEDS, TIMEFRAMES } from '../../lib/replayUtils'

export const PURPLE_SOLID = '#6B3AE6'

/**
 * Layout mirrors the reference: timeframe pills on the left, speed / reset /
 * play on the right. While a replay is active a "Sep 3 at 09:20 PM · 36/62"
 * label appears, which is what makes the right group wrap onto a second row.
 */
export default function ReplayControls({
  timeframe, onTimeframe,
  speed, onSpeed,
  playing, canPlay,
  onTogglePlay, onReset,
  progressLabel,   // '' when idle
  counter,         // '57/57'
}) {
  return (
    <div className="glass-card px-[18px] py-[12px] flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      {/* Timeframes */}
      <div className="flex items-center gap-1.5">
        <Clock size={15} className="mr-2 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
        {TIMEFRAMES.map(tf => {
          const active = tf.key === timeframe
          return (
            <button
              key={tf.key}
              onClick={() => onTimeframe(tf.key)}
              className="h-[30px] min-w-[32px] px-3 rounded-lg text-[13px] font-medium transition-colors"
              style={active
                ? { background: PURPLE_SOLID, color: '#fff' }
                : { color: 'var(--text-muted)' }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              {tf.label}
            </button>
          )
        })}
      </div>

      {/* Speed · reset · play · progress */}
      <div className={`flex items-center gap-3 ${progressLabel ? 'w-full' : ''}`}>
        <div className="flex items-center gap-1">
          {SPEEDS.map(s => {
            const active = s === speed
            return (
              <button
                key={s}
                onClick={() => onSpeed(s)}
                className="h-7 px-2.5 rounded-md text-xs font-mono transition-colors"
                style={active
                  ? { background: 'rgba(139,92,246,0.16)', border: '1px solid rgba(139,92,246,0.45)', color: 'var(--accent-purple-light)' }
                  : { border: '1px solid transparent', color: 'var(--text-muted)' }}
              >
                {s}x
              </button>
            )
          })}
        </div>

        <button
          onClick={onReset}
          disabled={!canPlay}
          title="Reset"
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/[0.06] disabled:opacity-40"
          style={{ color: 'var(--text-secondary)' }}
        >
          <RotateCcw size={15} />
        </button>

        <button
          onClick={onTogglePlay}
          disabled={!canPlay}
          className="h-10 px-5 rounded-xl flex items-center gap-2 text-[15px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed"
          style={{ background: PURPLE_SOLID }}
        >
          {playing
            ? <><Pause size={15} fill="currentColor" /> Pause</>
            : <><Play size={15} /> Play</>}
        </button>

        <span className="text-xs font-mono whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
          {progressLabel ? `${progressLabel} · ${counter}` : counter}
        </span>
      </div>
    </div>
  )
}