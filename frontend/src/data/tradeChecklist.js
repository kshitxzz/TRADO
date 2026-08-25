// Shared "did you follow your rules" checklist. Used in two places:
//  1. AddTradeModal — optional, filled in manually when adding a trade.
//  2. PostTradeChecklistModal — auto-popped after a live MT5 (EA) close,
//     see hooks/usePostTradeChecklist.jsx.
// Kept as one source of truth so both stay in sync.
export const TRADE_CHECKLIST_ITEMS = [
  'Trend identified',
  'Key level respected',
  'Risk/Reward ≥ 1:2',
  'Entry confirmed by structure',
  'Stop loss placed',
  'No FOMO — waited for confirmation',
]