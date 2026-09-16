import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { api } from '../lib/api'
import { computeWeeklyReportContext, getWeekRange } from '../lib/analytics'

// Loads a user's past AI Weekly Analysis reports and generates new ones.
// Every number in a report is computed on the frontend by
// computeWeeklyReportContext (never by Gemini) — generateReport() sends
// that facts bundle to the backend for narration only, then saves the
// merged result (real numbers + AI copy) as one immutable snapshot row so
// past weeks keep reading exactly as they did the day they were
// generated, even if trades are later edited or deleted.
export function useWeeklyReports(userId) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)

  const fetchReports = useCallback(async () => {
    if (!userId) { setReports([]); setLoading(false); return }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('weekly_reports')
      .select('*')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(26)
    if (!err) setReports(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetchReports() }, [fetchReports])

  const generateReport = useCallback(async ({ trades, accountBalance, accountId, weekOffset = 0 }) => {
    if (!userId) return { ok: false, message: 'Not signed in.' }
    setGenerating(true)
    setError(null)
    try {
      const context = computeWeeklyReportContext(trades, accountBalance, weekOffset)
      if (!context.ready) {
        const msg = `Log ${context.needed} more closed trade${context.needed === 1 ? '' : 's'} this week to unlock the AI Weekly Analysis.`
        setError(msg)
        return { ok: false, message: msg }
      }

      const ai = await api.post('/ai/weekly-report', { context })
      if (!ai.aiAvailable) {
        setError(ai.message || 'AI report generation is unavailable right now.')
        return { ok: false, message: ai.message }
      }

      const reportData = {
        rangeLabel: context.rangeLabel,
        overall: context.overall,
        tradeScore: context.tradeScore,
        week: context.week,
        prevWeek: context.prevWeek,
        hasPrev: context.hasPrev,
        delta: context.delta,
        risk: context.risk,
        journal: context.journal,
        revenge: context.revenge,
        bestPair: context.bestPair,
        worstPair: context.worstPair,
        topSession: context.topSession,
        sessionDominancePct: context.sessionDominancePct,
        blindspotCandidates: context.blindspotCandidates,
        patternCandidates: context.patternCandidates,
        narrative: ai.narrative,
        comparedToLastWeek: ai.comparedToLastWeek,
        riskNarrative: ai.riskNarrative,
        blindspots: ai.blindspots,
        recurringPatterns: ai.recurringPatterns,
        planForNextWeek: ai.planForNextWeek,
      }

      const row = {
        user_id: userId,
        account_id: accountId || null,
        week_start: getWeekRange(weekOffset).start.toISOString().slice(0, 10),
        range_label: context.rangeLabel,
        title: ai.title || 'Weekly Trading Report',
        report_label: ai.reportLabel || (context.week.totalPnl >= 0 ? 'PROFITABLE WEEK' : 'CHALLENGING WEEK'),
        positive: context.week.totalPnl >= 0,
        net_pnl: context.week.totalPnl,
        trade_count: context.week.tradeCount,
        win_rate: context.week.winRate,
        grade: context.week.grade,
        report_data: reportData,
      }

      const { data, error: insertErr } = await supabase.from('weekly_reports').insert(row).select().single()
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
    await supabase.from('weekly_reports').delete().eq('id', id)
  }, [])

  return { reports, loading, generating, error, generateReport, deleteReport, refetch: fetchReports }
}