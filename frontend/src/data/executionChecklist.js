// Canonical "did you follow your rules" checklist.
//
// This is the SAME list, in the SAME {id, label, checked} shape, used by:
//   - Journal.jsx           — the full manual journal editor
//   - PostTradeChecklistModal — the auto-popup after a live MT5 (EA) close
//
// Both write into the same trades.execution_checklist column (+ journaled_at),
// which is what already feeds:
//   - computeTradeQualityScore()      — Execution component, 40/100 pts
//   - computeJournalStats()           — journaledRate, avgChecklistCompletion
//   - computeRiskBreakdown()          — Discipline / Emotional scores
//   - computeTradeQualityAggregate()  — "Common Issues" (most-missed items)
//   - backend/routes/ai.js            — quoted directly into the Gemini
//                                        prompts for both the per-trade
//                                        autopsy and the weekly/overall report
//
// Keeping one shared list means every trade — whether journaled by hand or
// via the auto-popup — feeds the exact same analysis and AI narration.
export const DEFAULT_EXECUTION_CHECKLIST = [
  { id: 'higher_tf',     label: 'Checked higher timeframe',    checked: false },
  { id: 'risk_limits',   label: 'Risk within limits',           checked: false },
  { id: 'trading_plan',  label: 'Fits my trading plan',         checked: false },
  { id: 'key_levels',    label: 'Key levels identified',        checked: false },
  { id: 'econ_calendar', label: 'Economic calendar checked',    checked: false },
]