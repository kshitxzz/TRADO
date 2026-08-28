import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { api } from '../lib/api'
import { computeSmartReportFacts, periodLabel } from '../lib/analytics'

// Loads a user's past Smart Insights reports and generates new ones.
// Every number in a report is computed on the frontend by
// computeSmartReportFacts (never by Gemini) — generateReport() sends that
// facts bundle to the backend for narration only, then saves the merged
// result (real numbers + AI copy) as one immutable snapshot row so past
// reports keep reading exactly as they did the day they were generated,
// even if trades are edited/deleted afterwards.
export function useSmartReports(userId) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)

  const fetchReports = useCallback(async () => {
    if (!userId) { setReports([]); setLoading(false); return }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('smart_reports')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (!err) setReports(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetchReports() }, [fetchReports])

  const generateReport = useCallback(async ({ trades, accountBalance, accountId, period, custom }) => {
    if (!userId) return { ok: false, message: 'Not signed in.' }
    setGenerating(true)
    setError(null)
    try {
      const facts = computeSmartReportFacts(trades, accountBalance)
      if (!facts.ready) {
        const msg = `Log ${facts.needed} more closed trade${facts.needed === 1 ? '' : 's'} to unlock a Smart Insights report.`
        setError(msg)
        return { ok: false, message: msg }
      }

      const ai = await api.post('/ai/smart-report', { context: facts })
      if (!ai.aiAvailable) {
        setError(ai.message || 'AI report generation is unavailable right now.')
        return { ok: false, message: ai.message }
      }

      const reportData = {
        stats: facts.stats,
        bestPair: facts.bestPair,
        worstPair: facts.worstPair,
        topSession: facts.topSession,
        sessionDominancePct: facts.sessionDominancePct,
        riskSizing: facts.riskSizing,
        avgHoldSec: facts.avgHoldSec,
        minSize: facts.minSize,
        maxSize: facts.maxSize,
        sizeVariance: facts.sizeVariance,
        trend: facts.trend,
        blindspotCandidates: facts.blindspotCandidates,
        patternCandidates: facts.patternCandidates,
        narrative: ai.narrative,
        blindspots: ai.blindspots,
        recurringPatterns: ai.recurringPatterns,
        actionPlan: ai.actionPlan,
      }

      const row = {
        user_id: userId,
        account_id: accountId || null,
        period: periodLabel(period, custom),
        title: ai.title || 'Trading Performance Report',
        report_label: ai.reportLabel || (facts.verdict?.positive ? 'PROFITABLE PERIOD' : 'NOT YET PROFITABLE'),
        positive: !!facts.verdict?.positive,
        net_pnl: facts.stats.totalPnl,
        trade_count: facts.stats.tradeCount,
        win_rate: facts.stats.winRate,
        report_data: reportData,
      }

      const { data, error: insertErr } = await supabase.from('smart_reports').insert(row).select().single()
      if (insertErr) {
        setError('Report generated but could not be saved: ' + insertErr.message)
        return { ok: false, message: insertErr.message }
      }

      setReports(prev => [data, ...prev])
      return { ok: true, report: data }
    } catch (err) {
      const msg = err.message || 'Failed to generate report.'
      setError(msg)
      return { ok: false, message: msg }
    } finally {
      setGenerating(false)
    }
  }, [userId])

  const deleteReport = useCallback(async (id) => {
    setReports(prev => prev.filter(r => r.id !== id))
    await supabase.from('smart_reports').delete().eq('id', id)
  }, [])

  return { reports, loading, generating, error, generateReport, deleteReport, refetch: fetchReports }
}