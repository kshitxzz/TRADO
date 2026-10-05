import { useEffect, useMemo, useState } from 'react'
import { useTimezone, TIMEZONES } from '../../hooks/useTimezone'
import { useTimeFormat } from '../../hooks/useTimeFormat'
import {
  SESSIONS, sessionStatus, activeSessionIds, overlapNote, formatCountdown, dayTimeline,
} from '../../lib/marketSessions'

export default function MarketHoursTab() {
  const { timezone } = useTimezone()
  const { fmtTime, fmtClock, fmtHourShort } = useTimeFormat()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const tzLabel = TIMEZONES.find(t => t.value === timezone)?.label.split(' — ')[0] || timezone
  const statuses = useMemo(() => SESSIONS.map(s => ({ session: s, st: sessionStatus(s, now) })), [now])
  const activeIds = useMemo(() => activeSessionIds(now), [now])
  const note = overlapNote(activeIds)
  const timeline = useMemo(() => dayTimeline(timezone, now), [timezone, now])

  return (
    <div className="space-y-5">
      {/* Right now */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full" style={{ background: activeIds.length ? 'var(--positive-green)' : 'var(--text-muted)' }} />
          <p className="text-[11px] font-semibold tracking-widest" style={{ color: 'var(--text-muted)' }}>RIGHT NOW</p>
        </div>
        {activeIds.length ? (
          <>
            <div className="flex flex-wrap gap-2 mb-2">
              {statuses.filter(x => x.st.open).map(({ session }) => (
                <span key={session.id} className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                      style={{ color: session.color, background: `${session.color}1f`, border: `1px solid ${session.color}40` }}>
                  {session.name} open
                </span>
              ))}
            </div>
            {note && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{note}</p>}
          </>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            All four major sessions are closed (weekend or between sessions). Crypto still trades 24/7.
          </p>
        )}
      </div>

      {/* Session cards */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statuses.map(({ session, st }) => (
          <div key={session.id} className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: session.color }} />
                <h3 className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{session.name}</h3>
              </div>
              <span className="text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-md flex-shrink-0"
                    style={st.open
                      ? { color: 'var(--positive-green)', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }
                      : { color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)' }}>
                {st.open ? 'OPEN' : 'CLOSED'}
              </span>
            </div>

            {st.win && (
              <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {fmtTime(st.win.open, { timeZone: timezone })} – {fmtTime(st.win.close, { timeZone: timezone })}
              </p>
            )}
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {tzLabel} · {fmtClock(session.open, 0)} – {fmtClock(session.close, 0)} {session.name} time
            </p>

            <p className="text-xs mt-3 font-medium" style={{ color: st.open ? 'var(--positive-green)' : 'var(--text-secondary)' }}>
              {st.open && st.closesAt && `Closes in ${formatCountdown(st.closesAt - now)}`}
              {!st.open && st.opensAt && `Opens in ${formatCountdown(st.opensAt - now)}`}
            </p>
          </div>
        ))}
      </div>

      {/* Today timeline */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Today in {tzLabel}</h3>
          <div className="flex items-center gap-3 flex-wrap">
            {SESSIONS.map(s => (
              <span key={s.id} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />{s.name}
              </span>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="space-y-2.5">
            {timeline.rows.map(({ session, segs }) => (
              <div key={session.id} className="flex items-center gap-3">
                <span className="w-9 text-[11px] font-semibold flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{session.id}</span>
                <div className="relative flex-1 h-6 rounded-md overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  {segs.map((g, i) => (
                    <div key={i} className="absolute top-0 bottom-0 rounded-sm"
                         style={{ left: `${g.left}%`, width: `${g.width}%`, background: `${session.color}59`, border: `1px solid ${session.color}80` }} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* "Now" marker — sits over the bar tracks (offset by the 36px label column + 12px gap) */}
          <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: 48, right: 0 }}>
            <div className="absolute top-0 bottom-0 w-px"
                 style={{ left: `${Math.min(100, Math.max(0, timeline.nowPct))}%`, background: 'var(--accent-purple-light)', boxShadow: '0 0 8px var(--accent-purple)' }} />
          </div>
        </div>

        <div className="flex mt-2" style={{ paddingLeft: 48 }}>
          <div className="relative flex-1 h-4">
            {[0, 3, 6, 9, 12, 15, 18, 21].map(h => (
              <span key={h} className="absolute text-[10px]" style={{ left: `${(h / 24) * 100}%`, color: 'var(--text-muted)' }}>
                {fmtHourShort(h)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] px-1" style={{ color: 'var(--text-muted)' }}>
        Times are shown in your selected timezone ({tzLabel}). Sessions use standard local business hours, Monday–Friday, and adjust automatically for daylight saving.
        Public holidays and individual broker hours aren't included.
      </p>
    </div>
  )
}