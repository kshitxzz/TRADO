import { useMemo, useState } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { BLUE } from './shared'
import {
  fmtMoney, fmtMoneyPrecise, MONTHS_FULL, MONTHS_SHORT, DOW_SHORT, DOW_MIN,
  buildMonthCalendar, buildMiniMonth, toDateKey,
} from '../../lib/advancedReportsHelpers'

function MiniMonth({ year, monthIndex, isSelected, isCurrentMonth, todayKey, onSelect }) {
  const cells = buildMiniMonth(year, monthIndex)
  return (
    <button onClick={() => onSelect(monthIndex)}
            className="rounded-xl p-3 text-left transition-colors"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: isSelected ? `1.5px solid ${BLUE}` : '1px solid rgba(255,255,255,0.06)',
            }}>
      <p className="text-sm font-bold mb-2" style={{ color: isSelected ? BLUE : 'var(--text-primary)' }}>
        {MONTHS_SHORT[monthIndex]}
      </p>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {DOW_MIN.map((d, i) => (
          <span key={i} className="text-[9px] font-semibold" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>{d}</span>
        ))}
        {cells.map((day, i) => {
          const key = day ? `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null
          const isToday = key === todayKey
          return (
            <span key={i} className="text-[10px] flex items-center justify-center" style={{ height: 16 }}>
              {day && (
                <span className="flex items-center justify-center rounded-full"
                      style={{
                        width: 16, height: 16,
                        background: isToday ? '#22C55E' : 'transparent',
                        color: isToday ? '#0A0A0F' : 'var(--text-secondary)',
                        fontWeight: isToday ? 700 : 400,
                      }}>
                  {day}
                </span>
              )}
            </span>
          )
        })}
      </div>
    </button>
  )
}

function DayCell({ cell, todayKey }) {
  if (!cell) return <div />
  const isToday = cell.dateKey === todayKey
  const isPos = cell.pnl > 0
  const isNeg = cell.pnl < 0
  const bg = isPos ? 'rgba(34,197,94,0.10)' : isNeg ? 'rgba(239,68,68,0.10)' : 'rgba(255,255,255,0.02)'
  const border = isToday
    ? `1.5px solid ${isPos ? '#22C55E' : isNeg ? '#EF4444' : BLUE}`
    : isPos ? '1px solid rgba(34,197,94,0.2)' : isNeg ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.05)'
  return (
    <div className="rounded-lg p-2.5 flex flex-col" style={{ background: bg, border, minHeight: 78 }}>
      <span className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>{cell.date}</span>
      <span className="text-sm font-bold" style={{ color: isPos ? 'var(--positive-green)' : isNeg ? 'var(--negative-red)' : 'var(--text-muted)' }}>
        {fmtMoney(cell.pnl, { sign: true })}
      </span>
      <span className="text-[11px] mt-auto" style={{ color: 'var(--text-muted)' }}>
        {cell.count} trade{cell.count === 1 ? '' : 's'}
      </span>
    </div>
  )
}

function WeekRow({ week }) {
  const isPos = week.pnl > 0
  const isNeg = week.pnl < 0
  const Icon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus
  const color = isPos ? 'var(--positive-green)' : isNeg ? 'var(--negative-red)' : 'var(--text-muted)'
  const bg = isPos ? 'rgba(34,197,94,0.08)' : isNeg ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.02)'
  const border = isPos ? '1px solid rgba(34,197,94,0.25)' : isNeg ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(255,255,255,0.06)'
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ background: bg, border }}>
      <div className="flex items-center gap-2">
        <Icon size={14} style={{ color }} />
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Week {week.index}</span>
      </div>
      <span className="text-sm font-bold" style={{ color }}>{fmtMoneyPrecise(week.pnl, { sign: true })}</span>
    </div>
  )
}

export default function CalendarTab({ closed }) {
  const today = new Date()
  const todayKey = toDateKey(today)

  const [year, setYear] = useState(today.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth())

  const monthData = useMemo(() => buildMonthCalendar(closed, year, selectedMonth), [closed, year, selectedMonth])

  function changeYear(delta) {
    setYear(y => y + delta)
  }

  return (
    <div className="space-y-6">
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)' }}>
              <CalendarIcon size={16} style={{ color: BLUE }} />
            </div>
            <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Year Overview</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => changeYear(-1)} className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.06)' }}>
              <ChevronLeft size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
            <span className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{year}</span>
            <button onClick={() => changeYear(1)} className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.06)' }}>
              <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {MONTHS_FULL.map((_, i) => (
            <MiniMonth key={i} year={year} monthIndex={i}
                       isSelected={i === selectedMonth}
                       isCurrentMonth={year === today.getFullYear() && i === today.getMonth()}
                       todayKey={todayKey}
                       onSelect={setSelectedMonth} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        <div className="glass-card p-5">
          <p className="text-center text-base font-bold mb-5" style={{ color: 'var(--text-primary)' }}>
            {MONTHS_FULL[selectedMonth]} {year}
          </p>
          <div className="grid grid-cols-7 gap-2 mb-2">
            {DOW_SHORT.map(d => (
              <div key={d} className="text-center py-2 rounded-lg text-xs font-bold"
                   style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {monthData.cells.map((cell, i) => <DayCell key={i} cell={cell} todayKey={todayKey} />)}
          </div>
        </div>

        <div className="glass-card p-5">
          <p className="text-sm font-bold mb-4 text-center" style={{ color: 'var(--text-primary)' }}>P&L Per Week</p>
          <div className="space-y-2.5">
            {monthData.weeks.map(w => <WeekRow key={w.index} week={w} />)}
          </div>
        </div>
      </div>
    </div>
  )
}