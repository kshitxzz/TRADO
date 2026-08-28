import { useState } from 'react'
import { Sparkles, Loader2, ChevronRight, Trash2, Search } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useSmartReports } from '../../hooks/useSmartReports'
import { formatPnl, pnlColor } from './shared'
import SmartReportView from './SmartReportView'

export default function SmartReportsHub({ trades = [], accountBalance = null, accountId, period, custom }) {
  const { user } = useAuth()
  const { reports, loading, generating, error, generateReport, deleteReport } = useSmartReports(user?.id)
  const [openReportId, setOpenReportId] = useState(null)

  const closedCount = trades.filter(t => t.status === 'closed').length
  const openReport = reports.find(r => r.id === openReportId)

  async function handleGenerate() {
    const res = await generateReport({ trades, accountBalance, accountId, period, custom })
    if (res.ok) setOpenReportId(res.report.id)
  }

  if (openReport) {
    return <SmartReportView report={openReport} onBack={() => setOpenReportId(null)} />
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
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Smart Insights</h3>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: 'var(--accent-purple-light)', background: 'rgba(139,92,246,0.14)' }}>BETA</span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Decode your trading patterns, spot hidden mistakes, and get a personalized action plan.</p>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating || closedCount < 3}
          className="btn-primary text-xs px-4 py-2.5 flex items-center gap-2 flex-shrink-0"
          style={{ opacity: generating || closedCount < 3 ? 0.6 : 1 }}
        >
          {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {generating ? 'Generating…' : 'Generate Report'}
        </button>
      </div>

      {closedCount < 3 && (
        <div className="glass-card p-6 text-center">
          <Search size={22} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Not Enough Data</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Log {3 - closedCount} more closed trade{3 - closedCount === 1 ? '' : 's'} in this period to unlock a Smart Insights report.</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.25)' }}>
          <p className="text-xs" style={{ color: 'var(--negative-red)' }}>{error}</p>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Past Reports</p>
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
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No reports yet — generate your first Smart Insights report above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map(r => (
              <div key={r.id} className="glass-card p-4 flex items-center justify-between gap-3 cursor-pointer table-row-hover" onClick={() => setOpenReportId(r.id)}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{r.title}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {r.period} · {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
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