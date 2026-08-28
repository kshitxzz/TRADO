import { useState } from 'react'
import { Clock, Link2, Sparkles, Sunrise, Sun, Moon } from 'lucide-react'
import { AICard, formatPnl, pnlColor } from './shared'
import SmartReportsHub from './SmartReportsHub'

const SESSION_ICON = { Asian: Sunrise, London: Sun, 'New York': Moon }
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function PatternsTimingTab({ computed, ai, trades, accountBalance, accountId, period, custom }) {
  const [sub, setSub] = useState('time')
  const tabs = [
    { key: 'time', label: 'Time Insights', icon: Clock },
    { key: 'correlations', label: 'Correlations', icon: Link2 },
    { key: 'smart', label: 'Smart Insights', icon: Sparkles },
  ]

  return (
    <div>
      <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setSub(t.key)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium flex-shrink-0 transition-colors"
            style={{
              background: sub === t.key ? 'rgba(139,92,246,0.14)' : 'transparent',
              color: sub === t.key ? 'var(--accent-purple-light)' : 'var(--text-muted)',
              border: `1px solid ${sub === t.key ? 'rgba(139,92,246,0.3)' : 'transparent'}`,
            }}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>
      {sub === 'time' && <TimeInsightsSection computed={computed} ai={ai} />}
      {sub === 'correlations' && <CorrelationsSection computed={computed} ai={ai} />}
      {sub === 'smart' && <SmartReportsHub trades={trades} accountBalance={accountBalance} accountId={accountId} period={period} custom={custom} />}
    </div>
  )
}

// ─── Time Insights ───────────────────────────────────────────────────────
function TimeInsightsSection({ computed, ai }) {
  const t = computed.timeInsights
  const text = ai?.timeInsight || (t.trueEdge ? t.trueEdge.text : 'Log more trades across different sessions and hours to surface your strongest trading window.')

  const heatCells = t.heatmap
  const maxAbsPnl = Math.max(1, ...heatCells.map(c => Math.abs(c.pnl)))
  const cellMap = Object.fromEntries(heatCells.map(c => [`${c.day}|${c.hour}`, c]))

  return (
    <div className="space-y-5">
      <div>
        <h4 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>Session Performance</h4>
        {t.sessions.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No session data yet.</p>
        ) : (
          <div className="grid sm:grid-cols-3 gap-3">
            {t.sessions.map(s => {
              const Icon = SESSION_ICON[s.session] || Clock
              return (
                <div key={s.session} className="glass-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Icon size={14} style={{ color: 'var(--accent-purple-light)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{s.session}</span>
                  </div>
                  <div className="space-y-1.5">
                    <Row label="Trades" value={s.count} />
                    <Row label="Win Rate" value={`${s.winRate.toFixed(0)}%`} color={s.winRate >= 50 ? 'var(--positive-green)' : 'var(--negative-red)'} />
                    <Row label="P&L" value={formatPnl(s.pnl)} color={pnlColor(s.pnl)} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="glass-card p-5">
        <h4 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>Performance Heatmap</h4>
        <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>Win/loss intensity by day of week and hour (UTC)</p>
        {heatCells.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Not enough data to build a heatmap yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: 620 }}>
              {WEEKDAYS_SHORT.map(day => (
                <div key={day} className="flex items-center gap-1 mb-1">
                  <span className="text-[9px] w-8 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{day}</span>
                  {Array.from({ length: 24 }, (_, hour) => {
                    const cell = cellMap[`${day === 'Sun' ? 'Sunday' : day === 'Mon' ? 'Monday' : day === 'Tue' ? 'Tuesday' : day === 'Wed' ? 'Wednesday' : day === 'Thu' ? 'Thursday' : day === 'Fri' ? 'Friday' : 'Saturday'}|${hour}`]
                    const intensity = cell ? Math.min(1, Math.abs(cell.pnl) / maxAbsPnl) : 0
                    const bg = !cell ? 'rgba(255,255,255,0.03)' : cell.pnl >= 0
                      ? `rgba(34,197,94,${0.15 + intensity * 0.7})`
                      : `rgba(244,63,94,${0.15 + intensity * 0.7})`
                    return <div key={hour} title={cell ? `${day} ${hour}:00 — ${cell.count} trades, ${formatPnl(cell.pnl)}` : `${day} ${hour}:00 — no trades`}
                      className="flex-1 rounded-sm" style={{ height: 12, background: bg, minWidth: 12 }} />
                  })}
                </div>
              ))}
              <div className="flex gap-1 pl-9 mt-1">
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h} className="flex-1 text-center text-[8px]" style={{ color: 'var(--text-muted)', minWidth: 12 }}>{h % 3 === 0 ? h : ''}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <AICard type="TIME EDGE" title="True Edge" text={text} severity="info" />
    </div>
  )
}

function Row({ label, value, color }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-xs font-semibold" style={{ color: color || 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

// ─── Correlations ────────────────────────────────────────────────────────
function CorrelationsSection({ computed, ai }) {
  const c = computed.correlations
  const text = ai?.correlationInsight || (c.insight ? c.insight.text : 'Log more trades across different symbols to unlock correlation insights.')

  return (
    <div className="space-y-5">
      <div className="glass-card p-5 overflow-x-auto">
        <h4 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Symbol Performance</h4>
        {c.symbols.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No closed trades yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th className="text-left font-medium pb-2">Symbol</th>
                <th className="text-right font-medium pb-2">Trades</th>
                <th className="text-right font-medium pb-2">Win Rate</th>
                <th className="text-right font-medium pb-2">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {c.symbols.map(s => (
                <tr key={s.symbol} className="table-row-hover" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td className="py-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{s.symbol}</td>
                  <td className="py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{s.count}</td>
                  <td className="py-2 text-right" style={{ color: s.winRate >= 50 ? 'var(--positive-green)' : 'var(--negative-red)' }}>{s.winRate.toFixed(0)}%</td>
                  <td className="py-2 text-right font-medium" style={{ color: pnlColor(s.pnl) }}>{formatPnl(s.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AICard type="CORRELATION INSIGHTS" title={c.insight ? `Best Symbol: ${c.insight.symbol}` : 'Not Enough Data'} text={text} severity="info" />
    </div>
  )
}