import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Clock, Star } from 'lucide-react'
import { AU, JP, GB, US } from 'country-flag-icons/react/1x1'
import PageWrapper from '../../components/layout/PageWrapper'
import { useTimezone } from '../../hooks/useTimezone'
import { useTimeFormat } from '../../hooks/useTimeFormat'
import {
  CITIES, DAY_MS, HOUR_MS, trackOrigin, barSegments, axisHours, nightStartPos,
  volumeCurve, snapshotAt, bestTimes, clockText,
} from '../../lib/forexHours'

const FLAGS = { AU, JP, GB, US }
const SNAP_MS = 260           // release → glide back to "now"
const GREEN = '#2FDB5F'
const ORANGE = '#F59E0B'

// ── Trusted clock ─────────────────────────────────────────────────────────
// A wrong device clock would make every time on this page wrong, so we read
// the server's HTTP Date header once and correct for any drift. Falls back to
// the device clock if the request fails (offline, blocked, etc.).
function useClockOffset() {
  const offset = useRef(0)
  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const t0 = Date.now()
        const res = await fetch(`${window.location.origin}/?_t=${t0}`, { method: 'HEAD', cache: 'no-store' })
        const t1 = Date.now()
        const header = res.headers.get('date')
        if (!header || dead) return
        const server = new Date(header).getTime()
        if (isNaN(server)) return
        const drift = server - (t0 + (t1 - t0) / 2)
        // Header has 1s resolution — only correct genuine drift.
        if (Math.abs(drift) > 2500 && Math.abs(drift) < DAY_MS) offset.current = drift
      } catch (_) { /* keep device clock */ }
    })()
    return () => { dead = true }
  }, [])
  return offset
}

// Smooth closed path through the sampled curve.
function curvePath(values, w, h) {
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, 12 + (1 - v) * (h - 40)])
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`
  }
  return { line: d, area: `${d} L ${w} ${h} L 0 ${h} Z`, pts }
}

const LEVELS = {
  high:   { pill: 'High',   word: 'high',     color: GREEN },
  medium: { pill: 'Medium', word: 'moderate', color: ORANGE },
  low:    { pill: 'Low',    word: 'low',      color: '#8b8b92' },
  closed: { pill: 'Closed', word: 'closed',   color: '#8b8b92' },
}

export default function ForexMarketHours() {
  const { timezone } = useTimezone()
  const { is24h, setTimeFormat } = useTimeFormat()
  const clockOffset = useClockOffset()

  const nowMs = useCallback(() => Date.now() + clockOffset.current, [clockOffset])
  const [now, setNow] = useState(() => nowMs())
  const [scrub, setScrub] = useState(null)        // ms while dragging / gliding back
  const [dragging, setDragging] = useState(false)
  const trackRef = useRef(null)
  const rafRef = useRef(0)

  // Live tick (aligned to the second) + refresh when the tab returns to focus.
  useEffect(() => {
    const tick = () => setNow(nowMs())
    const id = setInterval(tick, 1000)
    const vis = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('focus', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); window.removeEventListener('focus', tick) }
  }, [nowMs])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // The track is anchored to the live moment, so it only re-bases at 05:30.
  const origin = useMemo(() => trackOrigin(now, timezone), [now, timezone])
  const originKey = origin

  const shown = scrub ?? now
  const pos = Math.min(1, Math.max(0, (shown - origin) / DAY_MS))

  const snap = useMemo(() => snapshotAt(shown, timezone, is24h), [Math.floor(shown / 60000), timezone, is24h]) // eslint-disable-line react-hooks/exhaustive-deps
  const segments = useMemo(() => CITIES.map(c => barSegments(c, origin)), [originKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const hours = useMemo(() => axisHours(origin, timezone, is24h), [originKey, timezone, is24h]) // eslint-disable-line react-hooks/exhaustive-deps
  const nightPos = useMemo(() => nightStartPos(origin, timezone), [originKey, timezone]) // eslint-disable-line react-hooks/exhaustive-deps
  const curve = useMemo(() => volumeCurve(origin), [originKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const best = useMemo(() => bestTimes(origin), [originKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const CW = 1000, CH = 96
  const path = useMemo(() => curvePath(curve, CW, CH), [curve])
  // y of the curve at the marker, interpolated between samples
  const markerY = useMemo(() => {
    const f = pos * (path.pts.length - 1)
    const i = Math.min(path.pts.length - 2, Math.floor(f))
    return path.pts[i][1] + (path.pts[i + 1][1] - path.pts[i][1]) * (f - i)
  }, [pos, path])

  // ── Drag to scrub ───────────────────────────────────────────────────────
  const tsFromEvent = (e) => {
    const r = trackRef.current.getBoundingClientRect()
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    return origin + Math.min(p * DAY_MS, DAY_MS - 60000)      // last minute of the track is 05:29
  }
  const onDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return
    cancelAnimationFrame(rafRef.current)
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragging(true)
    setScrub(tsFromEvent(e))
  }
  const onMove = (e) => { if (dragging) setScrub(tsFromEvent(e)) }
  const onUp = () => {
    if (!dragging) return
    setDragging(false)
    // Glide back to the live moment.
    const from = scrub ?? now
    const t0 = performance.now()
    const step = (t) => {
      const k = Math.min(1, (t - t0) / SNAP_MS)
      const eased = 1 - Math.pow(1 - k, 3)
      const target = nowMs()
      if (k >= 1) { setScrub(null); return }
      setScrub(from + (target - from) * eased)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
  }

  const lvl = LEVELS[snap.level]
  // Blue while the pointer is down; green the instant it's released (even mid-glide).
  const lineColor = dragging ? '#0A63F7' : '#17C246'
  const chipColor = dragging ? '#0A63F7' : GREEN

  const pill = snap.openCount >= 2
    ? { text: `${snap.openCount} Sessions Open`, c: GREEN, bg: 'rgba(34,197,94,0.10)', bd: 'rgba(34,197,94,0.28)' }
    : snap.openCount === 1
      ? { text: `${snap.onlyOpen} Active`, c: ORANGE, bg: 'rgba(245,158,11,0.10)', bd: 'rgba(245,158,11,0.30)' }
      : { text: 'Market Closed', c: '#8b8b92', bg: 'rgba(255,255,255,0.04)', bd: 'rgba(255,255,255,0.12)' }

  const range = (w) => w ? `${clockText(w.start, timezone, is24h)} - ${clockText(w.end, timezone, is24h)}` : '—'
  const peak = best.overlap && best.overlap.end - best.overlap.start > 2 * HOUR_MS
    ? `${clockText(best.overlap.start + HOUR_MS, timezone, is24h)}–${clockText(best.overlap.end - HOUR_MS, timezone, is24h)}`
    : null

  return (
    <PageWrapper>
      <style>{CSS}</style>

      <Link to="/tools" className="fmh-back">
        <ArrowLeft size={15} /> Back to Tools
      </Link>

      {/* Header */}
      <div className="fmh-head">
        <div className="fmh-title">
          <div className="fmh-icon"><Clock size={20} /></div>
          <div>
            <h1>Forex Market Hours</h1>
            <p>Track trading sessions across the globe in real-time</p>
          </div>
        </div>

        <div className="fmh-head-right">
          <div className="fmh-toggle-wrap">
            <span className={`fmh-tl ${!is24h ? 'on' : ''}`}>12h</span>
            <button
              type="button" role="switch" aria-checked={is24h} aria-label="24-hour clock"
              className={`fmh-toggle ${is24h ? 'on' : ''}`}
              onClick={() => setTimeFormat(is24h ? '12h' : '24h')}
            ><span /></button>
            <span className={`fmh-tl ${is24h ? 'on' : ''}`}>24h</span>
          </div>

          <div className="fmh-clock" title={timezone.replace(/_/g, ' ')}>
            <div className="fmh-clock-ic"><Clock size={20} /></div>
            <div>
              <div className="fmh-clock-time">{snap.clock}</div>
              <div className="fmh-clock-day">{snap.day}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline card */}
      <div
        className={`fmh-card fmh-plot ${dragging ? 'grabbing' : ''}`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{ '--p': pos, '--line': lineColor }}
      >
        {/* axis row */}
        <div className="fmh-row fmh-axis-row">
          <div className="fmh-left">
            <span className="fmh-pill" style={{ color: pill.c, background: pill.bg, borderColor: pill.bd }}>
              <i style={{ background: pill.c }} />{pill.text}
            </span>
          </div>
          <div className="fmh-right" ref={trackRef}>
            <div className="fmh-band">
              <div className="fmh-night" style={{ left: `${nightPos * 100}%` }} />
              <span className="fmh-sun" style={{ left: '2%' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5A524" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" fill="#F5A524" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              </span>
              <span className="fmh-moon" style={{ left: `${nightPos * 100 + 0.8}%` }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#7C6CF0"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
              </span>
            </div>
            <div className="fmh-hours">
              {hours.map((h, i) => (
                <span key={i} className={`fmh-h ${h.noon ? 'noon' : ''}`} style={{ left: `${h.pos * 100}%` }}>
                  {h.num}{h.suffix && <small>{h.suffix}</small>}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* city rows */}
        {snap.cities.map((c, i) => {
          const Flag = FLAGS[c.flag]
          return (
            <div className="fmh-row fmh-city" key={c.id}>
              <div className="fmh-left">
                <span className="fmh-flag"><Flag /></span>
                <div className="fmh-cinfo">
                  <div className="fmh-cname">{c.name}</div>
                  <div className="fmh-ctime">{c.time}</div>
                  <div className="fmh-csub">{c.sub}</div>
                </div>
              </div>
              <div className="fmh-right">
                <div className="fmh-status" style={{ color: c.open ? GREEN : undefined }}>
                  {c.name.toUpperCase()} SESSION {c.open ? 'OPEN' : 'CLOSED'}
                </div>
                <div className="fmh-track">
                  {segments[i].map((s, k) => (
                    <div
                      key={k}
                      className={`fmh-bar ${c.open ? 'open' : ''}`}
                      style={{ left: `${s.start * 100}%`, width: `${(s.end - s.start) * 100}%`, background: c.barColor }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )
        })}

        {/* volume row */}
        <div className="fmh-row fmh-vol">
          <div className="fmh-left fmh-vol-left">
            <div className="fmh-vol-text">
              {snap.level === 'closed' ? (
                <>Forex market is<br /><b style={{ color: lvl.color }}>closed right now.</b></>
              ) : (
                <>Trading Volume is usually<br /><b style={{ color: lvl.color }}>{lvl.word} at this time.</b></>
              )}
            </div>
            <span className="fmh-lvl"><i style={{ background: lvl.color }} />{lvl.pill}</span>
          </div>
          <div className="fmh-right fmh-chart">
            <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" className="fmh-svg">
              <defs>
                <linearGradient id="fmhFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity="0.30" />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={path.area} fill="url(#fmhFill)" />
              <path d={path.line} fill="none" stroke="#1D63F2" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
            <span className="fmh-cdot" style={{ left: `${pos * 100}%`, top: `${(markerY / CH) * 100}%`, background: lineColor }} />
            <span className="fmh-ring" style={{ left: `${pos * 100}%`, background: lineColor }} />
            <span
              className="fmh-chip"
              style={{ left: `${pos * 100}%`, background: chipColor, boxShadow: `0 0 14px ${chipColor}66` }}
            >{clockText(shown, timezone, is24h)}</span>
          </div>
        </div>

        {/* the line */}
        <div className="fmh-lines" aria-hidden="true">
          <div className="fmh-line" style={{ background: lineColor, boxShadow: `0 0 8px ${lineColor}66` }} />
        </div>
      </div>

      {/* Best times */}
      <div className="fmh-best-title"><Star size={18} /> Best Times to Trade</div>
      <div className="fmh-best">
        <div className="fmh-bcard">
          <div className="fmh-btop">
            <span className="fmh-tag" style={{ color: GREEN, background: 'rgba(34,197,94,0.13)' }}>HIGHEST VOLUME</span>
            <span className="fmh-bsub">London + New York Overlap</span>
          </div>
          <div className="fmh-btime">{range(best.overlap)}</div>
          <p>Maximum liquidity, tightest spreads.{peak ? ` Peak at ${peak}.` : ''} Best for EUR/USD, GBP/USD, USD/JPY.</p>
        </div>
        <div className="fmh-bcard">
          <div className="fmh-btop">
            <span className="fmh-tag" style={{ color: '#5B8DEF', background: 'rgba(59,130,246,0.14)' }}>LONDON OPEN</span>
            <span className="fmh-bsub">High Volatility Window</span>
          </div>
          <div className="fmh-btime">{range(best.londonOpen)}</div>
          <p>Day's first major expansion in volatility. Sets directional bias for EUR/GBP crosses.</p>
        </div>
        <div className="fmh-bcard">
          <div className="fmh-btop">
            <span className="fmh-tag" style={{ color: ORANGE, background: 'rgba(245,158,11,0.13)' }}>TOKYO OPEN</span>
            <span className="fmh-bsub">Best Asia Window</span>
          </div>
          <div className="fmh-btime">{range(best.tokyoOpen)}</div>
          <p>Strongest Asian session activity. Best for USD/JPY, EUR/JPY, AUD/USD, NZD/USD pairs.</p>
        </div>
      </div>
    </PageWrapper>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────
// Local tokens so the page keeps the reference's neutral look in dark mode and
// still has sensible light-mode values.
const CSS = `
.fmh-back, .fmh-head, .fmh-card, .fmh-best-title, .fmh-best {
  --fmh-card: #0F0F0F; --fmh-track: #171717; --fmh-border: #1f1f1f; --fmh-row-hover: #131313;
  --fmh-text: #fff; --fmh-muted: #8b8b92; --fmh-dim: #5d5d63; --fmh-sub: #6b6b72;
  --fmh-night: #17152B; --fmh-chip-bg: #191919; --fmh-toggle: #262626;
}
html.light .fmh-back, html.light .fmh-head, html.light .fmh-card, html.light .fmh-best-title, html.light .fmh-best {
  --fmh-card: #ffffff; --fmh-track: #efeff2; --fmh-border: #e4e4e8; --fmh-row-hover: #f6f6f8;
  --fmh-text: #0b0b0f; --fmh-muted: #6b6b75; --fmh-dim: #9a9aa3; --fmh-sub: #8a8a93;
  --fmh-night: #e9e7fa; --fmh-chip-bg: #f1f1f4; --fmh-toggle: #d7d7dd;
}

.fmh-back {
  display: inline-flex; align-items: center; gap: 8px; margin-bottom: 18px; padding: 8px 14px;
  font-size: 13px; color: var(--fmh-muted); border: 1px solid var(--fmh-border); border-radius: 10px;
  transition: color 150ms ease, border-color 150ms ease, background 150ms ease;
}
.fmh-back:hover { color: var(--fmh-text); border-color: rgba(37,99,235,0.45); background: rgba(37,99,235,0.06); }

.fmh-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 22px; }
.fmh-title { display: flex; align-items: center; gap: 16px; min-width: 0; }
.fmh-icon {
  width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  color: #2f6df6; background: rgba(37,99,235,0.12); border: 1px solid rgba(37,99,235,0.28);
}
.fmh-title h1 { font-size: 26px; font-weight: 700; line-height: 1.15; color: var(--fmh-text); letter-spacing: -0.01em; }
.fmh-title p { font-size: 14px; color: var(--fmh-muted); margin-top: 4px; }

.fmh-head-right { display: flex; align-items: center; gap: 26px; }
.fmh-toggle-wrap { display: flex; align-items: center; gap: 10px; }
.fmh-tl { font-size: 14px; font-weight: 500; color: var(--fmh-dim); transition: color 200ms ease; }
.fmh-tl.on { color: var(--fmh-text); font-weight: 700; }
.fmh-toggle {
  position: relative; width: 48px; height: 26px; border-radius: 999px; background: var(--fmh-toggle);
  border: none; cursor: pointer; padding: 0; transition: background 200ms ease;
}
.fmh-toggle span {
  position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #8d8d92;
  transition: transform 220ms cubic-bezier(.4,0,.2,1), background 220ms ease;
}
.fmh-toggle.on span { transform: translateX(22px); background: #fff; }

.fmh-clock {
  display: flex; align-items: center; gap: 14px; padding: 14px 22px 14px 14px; border-radius: 20px; color: #fff;
  background: linear-gradient(135deg, #1568FA 0%, #2B7EE9 100%); box-shadow: 0 8px 28px rgba(21,104,250,0.25);
}
.fmh-clock-ic { width: 46px; height: 46px; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; }
.fmh-clock-time { font-size: 26px; font-weight: 700; line-height: 1.1; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.fmh-clock-day { font-size: 14px; opacity: 0.85; margin-top: 2px; }

/* card */
.fmh-card {
  --lw: 250px;
  position: relative; background: var(--fmh-card); border: 1px solid var(--fmh-border); border-radius: 24px;
  padding: 26px 30px 22px; cursor: ew-resize; user-select: none; -webkit-user-select: none; touch-action: pan-y;
}
.fmh-card.grabbing { cursor: grabbing; }
.fmh-row { display: grid; grid-template-columns: var(--lw) minmax(0, 1fr); }
.fmh-left { display: flex; align-items: center; gap: 14px; min-width: 0; padding-right: 16px; }
.fmh-right { position: relative; min-width: 0; }

.fmh-axis-row { margin-bottom: 14px; }
.fmh-pill {
  display: inline-flex; align-items: center; gap: 10px; padding: 8px 18px; border-radius: 999px; border: 1px solid;
  font-size: 13px; font-weight: 600; white-space: nowrap; transition: color 250ms, background 250ms, border-color 250ms;
}
.fmh-pill i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.fmh-axis-row .fmh-left { align-items: flex-start; }

.fmh-band { position: relative; height: 26px; border-radius: 8px; overflow: hidden; background: transparent; }
.fmh-night { position: absolute; top: 0; right: 0; bottom: 0; background: var(--fmh-night); border-radius: 0 8px 8px 0; }
.fmh-sun, .fmh-moon { position: absolute; top: 6px; transform: translateX(-50%); display: flex; }
.fmh-moon { transform: none; }
.fmh-hours { position: relative; height: 22px; margin-top: 8px; }
.fmh-h { position: absolute; top: 0; transform: translateX(-50%); font-size: 12px; font-weight: 600; color: var(--fmh-dim); white-space: nowrap; }
.fmh-h small { font-size: 9.5px; font-weight: 500; margin-left: 1px; }
.fmh-h.noon { color: var(--fmh-text); font-weight: 700; opacity: 0.85; }

/* city rows */
.fmh-city { padding: 12px 0; border-radius: 16px; transition: background 180ms ease; margin: 0 -14px; padding-left: 14px; padding-right: 14px; }
.fmh-city:hover { background: var(--fmh-row-hover); }
.fmh-city .fmh-left { align-items: center; }
.fmh-flag { width: 28px; height: 28px; border-radius: 50%; overflow: hidden; flex-shrink: 0; display: block; box-shadow: 0 0 0 1px rgba(255,255,255,0.06); }
.fmh-flag svg { width: 100%; height: 100%; display: block; }
.fmh-cname { font-size: 17px; font-weight: 600; color: var(--fmh-text); line-height: 1.2; }
.fmh-ctime { font-size: 16px; color: var(--fmh-muted); margin-top: 4px; font-variant-numeric: tabular-nums; }
.fmh-csub { font-size: 11.5px; color: var(--fmh-sub); margin-top: 4px; white-space: nowrap; }
.fmh-status { font-size: 10.5px; font-weight: 800; letter-spacing: 0.05em; color: var(--fmh-dim); margin: 6px 0 8px 4px; transition: color 200ms ease; }
.fmh-track { position: relative; height: 36px; border-radius: 10px; background: var(--fmh-track); }
.fmh-bar { position: absolute; top: 0; bottom: 0; border-radius: 8px; opacity: 0.85; transition: opacity 200ms ease; }
.fmh-bar.open { opacity: 1; animation: fmhPulse 2.1s ease-in-out infinite; }
@keyframes fmhPulse { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.155); } }

/* volume */
.fmh-vol { margin-top: 12px; padding-top: 14px; border-top: 1px solid var(--fmh-border); }
.fmh-vol-left { flex-direction: column; align-items: flex-start; justify-content: center; gap: 14px; }
.fmh-vol-text { font-size: 13px; color: var(--fmh-muted); line-height: 1.5; }
.fmh-vol-text b { font-weight: 700; transition: color 250ms ease; }
.fmh-lvl {
  display: inline-flex; align-items: center; gap: 9px; padding: 7px 16px; border-radius: 999px; font-size: 13px; font-weight: 500;
  color: var(--fmh-muted); background: var(--fmh-chip-bg); border: 1px solid var(--fmh-border);
}
.fmh-lvl i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; transition: background 250ms ease; }
.fmh-chart { height: 112px; }
.fmh-svg { position: absolute; inset: 0 0 auto 0; width: 100%; height: 96px; display: block; overflow: visible; }
.fmh-cdot { position: absolute; width: 8px; height: 8px; border-radius: 50%; transform: translate(-50%, -50%); }
.fmh-ring { position: absolute; top: 76px; width: 14px; height: 14px; border-radius: 50%; transform: translate(-50%, -50%); border: 2.5px solid #050505; box-sizing: content-box; }
.fmh-chip {
  position: absolute; top: 88px; transform: translateX(-50%); padding: 5px 12px; border-radius: 8px; color: #fff;
  font-size: 12px; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums;
}

/* vertical line: spans axis → chart ring, positioned over the track column */
.fmh-lines { position: absolute; top: 26px; bottom: 56px; left: calc(30px + var(--lw)); right: 30px; pointer-events: none; }
.fmh-line { position: absolute; top: 0; bottom: 0; width: 2px; left: calc(var(--p) * 100%); transform: translateX(-50%); border-radius: 2px; }

/* best times */
.fmh-best-title { display: flex; align-items: center; gap: 10px; margin: 30px 0 14px; font-size: 17px; font-weight: 700; color: var(--fmh-text); }
.fmh-best-title svg { color: #F59E0B; }
.fmh-best { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
.fmh-bcard {
  background: var(--fmh-card); border: 1px solid var(--fmh-border); border-radius: 18px; padding: 22px 26px;
  transition: border-color 200ms ease, transform 200ms ease;
}
.fmh-bcard:hover { border-color: rgba(37,99,235,0.42); }
.fmh-btop { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 18px; }
.fmh-tag { font-size: 11px; font-weight: 800; letter-spacing: 0.04em; padding: 6px 12px; border-radius: 7px; white-space: nowrap; }
.fmh-bsub { font-size: 12.5px; color: var(--fmh-dim); text-align: right; }
.fmh-btime { font-size: 23px; font-weight: 700; color: var(--fmh-text); letter-spacing: -0.01em; margin-bottom: 10px; font-variant-numeric: tabular-nums; }
.fmh-bcard p { font-size: 14px; line-height: 1.65; color: var(--fmh-muted); }

/* responsive */
@media (max-width: 1100px) { .fmh-card { --lw: 200px; } .fmh-best { gap: 14px; } .fmh-bcard { padding: 18px; } }
@media (max-width: 860px) {
  .fmh-best { grid-template-columns: 1fr; }
  .fmh-head-right { width: 100%; justify-content: space-between; }
}
@media (max-width: 640px) {
  .fmh-card { --lw: 124px; padding: 18px 14px 16px; border-radius: 20px; }
  .fmh-lines { left: calc(14px + var(--lw)); right: 14px; top: 18px; bottom: 50px; }
  .fmh-city { margin: 0 -6px; padding-left: 6px; padding-right: 6px; }
  .fmh-left { gap: 8px; padding-right: 8px; }
  .fmh-flag { width: 22px; height: 22px; }
  .fmh-cname { font-size: 14px; } .fmh-ctime { font-size: 13px; }
  .fmh-csub { font-size: 9px; white-space: normal; }
  .fmh-pill { font-size: 10px; padding: 5px 9px; gap: 5px; } .fmh-pill i { width: 6px; height: 6px; }
  .fmh-h { font-size: 8px; } .fmh-h small { display: none; }
  .fmh-status { font-size: 8.5px; } .fmh-track { height: 30px; }
  .fmh-vol-text { font-size: 11px; } .fmh-lvl { font-size: 11px; padding: 5px 10px; }
  .fmh-title h1 { font-size: 21px; } .fmh-clock-time { font-size: 22px; }
}
@media (prefers-reduced-motion: reduce) { .fmh-bar.open { animation: none; } }
`