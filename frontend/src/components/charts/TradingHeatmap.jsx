import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const MON_LABEL = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DOW_LABEL = ['M','','W','','F','','']   // Mon=0 … Sun=6 — only Mon/Wed/Fri shown

// ── 5-step intensity ramps — vivid enough for light + dark mode ───────────────
const GREEN_SHADES = ['#0f3d22','#15803d','#16a34a','#22c55e','#4ade80']
const RED_SHADES   = ['#4c1018','#9f1239','#dc2626','#ef4444','#f87171']

function pad(n) { return String(n).padStart(2,'0') }
function toKey(d) { return d ? `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` : null }

export function pickHeatmapYear(trades=[]) {
  const closed = trades.filter(t => t.status==='closed' && t.closed_at)
  if (!closed.length) return new Date().getFullYear()
  return Math.max(...closed.map(t => new Date(t.closed_at).getFullYear()))
}

function fmtDate(key) {
  if (!key) return ''
  const d = new Date(key+'T00:00:00')
  return d.toLocaleDateString('en-US',{ month:'short', day:'numeric' })
}
function fmtPnl(pnl) {
  return `${pnl>=0?'+':'-'}$${Math.abs(pnl).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}`
}

// ── Small centered stat cell used in the footer stats grid ────────────────────
function StatCell({ value, label, color }) {
  return (
    <div className="text-center">
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  )
}

export default function TradingHeatmap({ trades=[], year, compact=false }) {
  const displayYear = year ?? pickHeatmapYear(trades)
  const [tooltip, setTooltip] = useState(null)  // { key, x, y, data, label }

  // ── Aggregate by date ─────────────────────────────────────────────────────
  const byDate = useMemo(() => {
    const map = {}
    trades
      .filter(t => t.status==='closed' && t.closed_at)
      .forEach(t => {
        const d = new Date(t.closed_at)
        if (d.getFullYear() !== displayYear) return
        const key = toKey(d)
        if (!map[key]) map[key] = { pnl:0, count:0, trades:[] }
        map[key].pnl   += t.pnl||0
        map[key].count += 1
        map[key].trades.push(t)
      })
    return map
  }, [trades, displayYear])

  const maxAbs = useMemo(() => {
    const vals = Object.values(byDate).map(d=>Math.abs(d.pnl))
    return vals.length ? Math.max(...vals) : 1
  }, [byDate])

  // ── Build a per-month calendar grid — fully dynamic, so it automatically
  //    re-syncs to the real calendar every year (correct start weekday,
  //    correct number of weeks/columns per month, no manual adjustment). ────
  const months = useMemo(() => {
    return MON_LABEL.map((label, m) => {
      const daysInMonth = new Date(displayYear, m+1, 0).getDate()
      // JS getDay(): Sun=0…Sat=6 → rotate so Mon=0…Sun=6 (matches row labels)
      const startOffset = (new Date(displayYear, m, 1).getDay() + 6) % 7
      const weekCount    = Math.ceil((startOffset + daysInMonth) / 7)

      const weeks = []
      for (let w = 0; w < weekCount; w++) {
        const col = []
        for (let r = 0; r < 7; r++) {
          const dayNum = w*7 + r - startOffset + 1
          col.push(dayNum >= 1 && dayNum <= daysInMonth ? new Date(displayYear, m, dayNum) : null)
        }
        weeks.push(col)
      }
      return { label, weeks }
    })
  }, [displayYear])

  // ── Cell appearance ─────────────────────────────────────────────────────
  // Every real day of the month gets a faint background tile (so the grid
  // itself is always visible), and days with trade data get colored on top.
  // Only padding cells outside the month (d === null) stay fully invisible.
  function cellColor(d) {
    if (!d) return null
    const data = byDate[toKey(d)]
    if (!data || data.count===0) return 'var(--hm-empty)'
    const intensity = Math.min(1, Math.abs(data.pnl)/(maxAbs||1))
    const idx = Math.min(4, Math.max(0, Math.floor(intensity*5)))
    return data.pnl >= 0 ? GREEN_SHADES[idx] : RED_SHADES[idx]
  }

  function hasTradeData(d) {
    if (!d) return false
    const data = byDate[toKey(d)]
    return !!data && data.count > 0
  }

  function handleMouseEnter(e, d) {
    if (!d) return
    const key  = toKey(d)
    const data = byDate[key]
    const rect = e.currentTarget.getBoundingClientRect()
    const cont = e.currentTarget.closest('.hm-container')?.getBoundingClientRect() || rect
    setTooltip({
      key, data: data||null,
      x: rect.left - cont.left + rect.width/2,
      y: rect.top  - cont.top,
      label: fmtDate(key),
    })
  }

  // ── Footer stats — days traded, green/red split, streaks, P&L, win rate ───
  const stats = useMemo(() => {
    const dateKeys = Object.keys(byDate).sort()
    const totalPnl = Object.values(byDate).reduce((s,d)=>s+d.pnl, 0)
    const tradingDays = dateKeys.length
    const greenDays = dateKeys.filter(k => byDate[k].pnl >= 0).length
    const redDays   = tradingDays - greenDays

    // Streaks are measured across consecutive GREEN trading days
    let longestStreak = 0, run = 0
    dateKeys.forEach(k => {
      if (byDate[k].pnl >= 0) { run++; longestStreak = Math.max(longestStreak, run) }
      else run = 0
    })
    let currentStreak = 0
    for (let i = dateKeys.length-1; i >= 0; i--) {
      if (byDate[dateKeys[i]].pnl >= 0) currentStreak++
      else break
    }

    let bestDay = null, worstDay = null
    dateKeys.forEach(k => {
      const d = byDate[k]
      if (!bestDay  || d.pnl > bestDay.pnl)  bestDay  = { key:k, ...d }
      if (!worstDay || d.pnl < worstDay.pnl) worstDay = { key:k, ...d }
    })

    const winRate   = tradingDays ? (greenDays/tradingDays)*100 : 0
    const avgPnlDay = tradingDays ? totalPnl/tradingDays : 0

    return { tradingDays, greenDays, redDays, longestStreak, currentStreak, totalPnl, bestDay, worstDay, winRate, avgPnlDay }
  }, [byDate])

  // ── Sizing — compact (dashboard) gets noticeably bigger dots/gaps than the
  //    old cramped version, each month gets a fixed width instead of shrinking
  //    to fit, and a clear margin separates one month from the next so the
  //    calendar reads cleanly while horizontally scrolling. ─────────────────
  const DOT       = compact ? 10 : 7
  const GAP       = compact ? 3  : 2
  const MONTH_GAP = compact ? 10 : 14

  return (
    <div className="relative hm-container">

      {/* Tooltip — follows mouse on hover */}
      <AnimatePresence>
        {tooltip && (
          <motion.div
            key={tooltip.key}
            initial={{ opacity:0, y:4, scale:0.96 }}
            animate={{ opacity:1, y:0, scale:1 }}
            exit={{ opacity:0, y:4, scale:0.96 }}
            transition={{ duration:0.1 }}
            className="pointer-events-none absolute z-50"
            style={{
              left: tooltip.x,
              top:  tooltip.y - 52,
              transform: 'translateX(-50%)',
            }}>
            <div style={{
              background: 'rgba(15,12,28,0.92)',
              border: '1px solid rgba(139,92,246,0.25)',
              borderRadius: 8,
              padding: '5px 10px',
              backdropFilter: 'blur(8px)',
              whiteSpace: 'nowrap',
            }}>
              {tooltip.data?.count > 0 ? (
                <div className="flex items-center gap-2">
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>{tooltip.label}</span>
                  <span style={{
                    fontSize:11, fontWeight:700,
                    color: tooltip.data.pnl>=0 ? '#4ade80' : '#f87171',
                  }}>
                    {fmtPnl(tooltip.data.pnl)}
                  </span>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,0.35)' }}>
                    {tooltip.data.count} trade{tooltip.data.count!==1?'s':''}
                  </span>
                </div>
              ) : (
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>
                  {tooltip.label}: No trades
                </span>
              )}
              {/* Arrow */}
              <div style={{
                position:'absolute', bottom:-5, left:'50%', transform:'translateX(-50%)',
                width:0, height:0,
                borderLeft:'5px solid transparent',
                borderRight:'5px solid transparent',
                borderTop:'5px solid rgba(139,92,246,0.25)',
              }}/>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calendar — each month keeps a fixed, readable width and the row
          scrolls horizontally past the visible card edge, instead of every
          month shrinking to squeeze all 12 into the container. ─────────── */}
      <div
        className="overflow-x-auto pb-2"
        style={{ scrollbarWidth:'thin', scrollbarColor:'rgba(139,92,246,0.35) transparent' }}
        onMouseLeave={() => setTooltip(null)}>
        <style>{`
          .hm-container ::-webkit-scrollbar { height: 6px; }
          .hm-container ::-webkit-scrollbar-track { background: transparent; }
          .hm-container ::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.35); border-radius:4px; }
          .hm-container ::-webkit-scrollbar-thumb:hover { background: rgba(139,92,246,0.6); }
          :root { --hm-empty: rgba(255,255,255,0.07); }
          html.light { --hm-empty: rgba(0,0,0,0.08); }
        `}</style>

        <div className="flex">
          {/* Day-of-week labels: M / W / F only, pinned so they don't scroll away */}
          <div className="flex flex-col flex-shrink-0 sticky left-0 z-10"
               style={{ gap:GAP, width:16, marginTop:19, background:'var(--bg-card)' }}>
            {DOW_LABEL.map((label,i) => (
              <div key={i} style={{
                height:DOT, lineHeight:`${DOT}px`, fontSize: compact?10:9,
                color:'var(--text-muted)', opacity:0.7,
              }}>
                {label}
              </div>
            ))}
          </div>

          {/* 12 month blocks — each box hugs its own real content width
              (left-aligned label sits directly above that month's own dots,
              matching a standard GitHub-style contribution calendar), then
              gets a fixed MONTH_GAP margin. This is what makes the visible
              gap between one month's last dot-column and the next month's
              first dot-column mathematically constant — a fixed uniform box
              width with left-aligned content left dead space trailing
              inside shorter months, which is what made gaps look uneven. */}
          <div className="flex">
            {months.map((month, mi) => (
              <div key={mi} className="flex flex-col flex-shrink-0"
                   style={{ marginRight: mi < 11 ? MONTH_GAP : 0 }}>
                <div style={{
                  fontSize: compact?12:10, fontWeight: compact?600:400,
                  color:'var(--text-muted)', opacity:0.85,
                  marginBottom:6, height:15, whiteSpace:'nowrap',
                }}>
                  {month.label}
                </div>
                <div className="flex" style={{ gap:GAP }}>
                  {month.weeks.map((col,ci) => (
                    <div key={ci} className="flex flex-col" style={{ gap:GAP }}>
                      {col.map((d,ri) => {
                        const color   = cellColor(d)      // tile bg OR intensity color OR null (padding)
                        const hasData = hasTradeData(d)
                        return (
                          <div
                            key={ri}
                            onMouseEnter={e => handleMouseEnter(e, d)}
                            onMouseLeave={() => setTooltip(null)}
                            style={{
                              width:DOT, height:DOT, borderRadius:'50%', flexShrink:0,
                              background: color || 'transparent',
                              cursor: hasData ? 'pointer' : 'default',
                            }}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stat grid — Days Traded / Green / Red, Streaks, Total P&L. Longest
          Streak is colored green rather than purple: it's an achievement
          stat, not just a neutral count like Days Traded / Current Streak. */}
      <div className="grid grid-cols-3 gap-y-3 mt-4 pt-4" style={{ borderTop:'1px solid var(--border-subtle)' }}>
        <StatCell value={stats.tradingDays}   label="Days Traded"    color="var(--accent-purple-light)" />
        <StatCell value={stats.greenDays}     label="Green Days"     color="var(--positive-green)" />
        <StatCell value={stats.redDays}       label="Red Days"       color="var(--negative-red)" />
        <StatCell value={stats.currentStreak} label="Current Streak" color="var(--accent-purple-light)" />
        <StatCell value={stats.longestStreak} label="Longest Streak" color="var(--positive-green)" />
        <StatCell
          value={fmtPnl(stats.totalPnl)} label="Total P&L"
          color={stats.totalPnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)'}
        />
      </div>

      {/* Daily Win Rate bar ──────────────────────────────────────────────── */}
      <div className="mt-4 pt-4" style={{ borderTop:'1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs" style={{ color:'var(--text-muted)' }}>Daily Win Rate</span>
          <span className="text-sm font-bold" style={{ color:'var(--positive-green)' }}>
            {stats.winRate.toFixed(1)}%
          </span>
        </div>
        <div className="flex h-1.5 rounded-full overflow-hidden" style={{ background:'var(--border-subtle)' }}>
          <div style={{ width:`${stats.winRate}%`,     background:'linear-gradient(90deg,#16a34a,#4ade80)' }} />
          <div style={{ width:`${100-stats.winRate}%`, background:'linear-gradient(90deg,#dc2626,#f87171)' }} />
        </div>
        <div className="relative mt-1.5" style={{ height:12 }}>
          <span className="absolute left-0 text-[10px] font-semibold" style={{ color:'var(--positive-green)' }}>
            {stats.greenDays}W
          </span>
          <span className="absolute left-1/2 text-[10px]" style={{ color:'var(--text-muted)', opacity:0.45, transform:'translateX(-50%)' }}>
            50%
          </span>
          <span className="absolute right-0 text-[10px] font-semibold" style={{ color:'var(--negative-red)' }}>
            {stats.redDays}L
          </span>
        </div>
      </div>

      {/* Best Day / Worst Day ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5 mt-4">
        <div className="rounded-lg p-3" style={{ background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.18)' }}>
          <p className="text-[9px] font-bold tracking-wide uppercase" style={{ color:'var(--positive-green)' }}>Best Day</p>
          <p className="text-lg font-bold mt-0.5" style={{ color:'var(--positive-green)' }}>
            {stats.bestDay ? fmtPnl(stats.bestDay.pnl) : '—'}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color:'var(--text-muted)' }}>
            {stats.bestDay ? `${fmtDate(stats.bestDay.key)} · ${stats.bestDay.count} trade${stats.bestDay.count!==1?'s':''}` : 'No trades yet'}
          </p>
        </div>
        <div className="rounded-lg p-3" style={{ background:'rgba(244,63,94,0.08)', border:'1px solid rgba(244,63,94,0.18)' }}>
          <p className="text-[9px] font-bold tracking-wide uppercase" style={{ color:'var(--negative-red)' }}>Worst Day</p>
          <p className="text-lg font-bold mt-0.5" style={{ color:'var(--negative-red)' }}>
            {stats.worstDay ? fmtPnl(stats.worstDay.pnl) : '—'}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color:'var(--text-muted)' }}>
            {stats.worstDay ? `${fmtDate(stats.worstDay.key)} · ${stats.worstDay.count} trade${stats.worstDay.count!==1?'s':''}` : 'No trades yet'}
          </p>
        </div>
      </div>

      {/* Avg P&L / Day ─────────────────────────────────────────────────────── */}
      <div className="text-center mt-3">
        <span className="text-xs" style={{ color:'var(--text-muted)' }}>Avg P&L / Day: </span>
        <span className="text-xs font-bold" style={{ color: stats.avgPnlDay >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }}>
          {fmtPnl(stats.avgPnlDay)}
        </span>
      </div>

    </div>
  )
}