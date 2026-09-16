import { useState } from 'react'
import { Sparkles, Loader2, ChevronRight, Trash2, Search, HelpCircle } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { useWeeklyReports } from '../../../hooks/useWeeklyReports'
import { formatPnl, pnlColor } from '../../ai-analysis/shared'
import { gradeColor } from '../../../lib/analytics'
import WeeklyReportView from './WeeklyReportView'

// The "AI Weekly Analysis" card at the bottom of the Weekly Summary tab —
// same Generate → save → browse-history pattern as Smart Insights, scoped
// to one week at a time. weekTradeCount gates the button so it's never
// enabled on a week too thin to say anything real about.
export default function WeeklyReportsHub({ trades = [], accountBalance = null, accountId, weekOffset = 0, weekTradeCount = 0, rangeLabel }) {
  const { user } = useAuth()
  const { reports, loading, generating, error, generateReport, deleteReport } = useWeeklyReports(user?.id)
  const [openReportId, setOpenReportId] = useState(null)
  const [showInfo, setShowInfo] = useState(false)

  const openReport = reports.find(r => r.id === openReportId)

  async function handleGenerate() {
    const res = await generateReport({ trades, accountBalance, accountId, weekOffset })
    if (res.ok) setOpenReportId(res.report.id)
  }

  if (openReport) {
    return <WeeklyReportView report={openReport} onBack={() => setOpenReportId(null)} />
  }

  return (
    <div className="space-y-5">
      <div className="glass-card p-5 flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--gradient-primary)' }}>
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>AI Weekly Analysis</h3>
              <button
                type="button"
                onClick={() => setShowInfo(v => !v)}
                className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}
                title="What is this?"
              >
                <HelpCircle size={11} />
              </button>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {weekTradeCount < 1
                ? 'Log a closed trade this week to unlock this.'
                : 'Personalized insights for this week.'}
            </p>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating || weekTradeCount < 1}
          title={weekTradeCount < 1 ? 'Log a closed trade this week to unlock the AI Weekly Analysis' : undefined}
          className="btn-primary text-xs px-4 py-2.5 flex items-center gap-2 flex-shrink-0"
          style={{
            opacity: generating || weekTradeCount < 1 ? 0.4 : 1,
            cursor: generating || weekTradeCount < 1 ? 'not-allowed' : 'pointer',
            filter: weekTradeCount < 1 && !generating ? 'grayscale(0.5)' : 'none',
          }}
        >
          {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {generating ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {showInfo && (
        <div className="rounded-lg px-4 py-3 text-xs leading-relaxed" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: 'var(--text-secondary)' }}>
          Generates a deep-dive report for {rangeLabel}: a process grade, a risk &amp; discipline breakdown, your best/worst symbol and session, any blindspots or recurring patterns worth knowing about, and a concrete 3-step plan for next week — all grounded in this week's real trade data and narrated by Trado AI. Every report is saved so you can look back on any past week.
        </div>
      )}

      {weekTradeCount < 1 && (
        <div className="glass-card p-6 text-center">
          <Search size={22} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>No Trades This Week</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Log a closed trade this week to unlock the AI Weekly Analysis.</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.25)' }}>
          <p className="text-xs" style={{ color: 'var(--negative-red)' }}>{error}</p>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Past Weekly Reports</p>
          {reports.length > 0 && (
            <span className="text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
              {reports.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="grid gap-3">{[0, 1].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
        ) : reports.length === 0 ? (
          <div className="glass-card p-6 text-center">
            <Sparkles size={20} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No weekly reports yet — generate your first one above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map(r => (
              <div key={r.id} className="glass-card p-4 flex items-center justify-between gap-3 cursor-pointer table-row-hover" onClick={() => setOpenReportId(r.id)}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{r.title}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {r.range_label} · {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                {r.grade && (
                  <span className="text-xs font-bold px-2 py-1 rounded-md flex-shrink-0" style={{ color: gradeColor(r.grade), background: `${gradeColor(r.grade)}18` }}>{r.grade}</span>
                )}
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold" style={{ color: pnlColor(r.net_pnl) }}>{formatPnl(r.net_pnl)}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{(r.win_rate || 0).toFixed(0)}% win · {r.trade_count} trades</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteReport(r.id) }}
                  className="p-1.5 rounded-lg flex-shrink-0 transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  title="Delete report"
                >
                  <Trash2 size={13} />
                </button>
                <ChevronRight size={15} style={{ color: 'var(--text-muted)' }} className="flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}