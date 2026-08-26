import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'
import PostTradeChecklistModal from '../components/ui/PostTradeChecklistModal'

const PostTradeChecklistContext = createContext(null)

// Mounted once, at the app root (App.jsx) — above <BrowserRouter>, alongside
// NotificationsProvider — so it survives every route change and keeps a
// single, uninterrupted Supabase Realtime subscription for the whole
// session. A per-page hook (like useTrades) would resubscribe on every
// navigation, which is both wasteful and risks a missed event in the gap
// between unmount and remount.
//
// Flow: Trade Running -> Trade Closed -> this fires the popup.
// "Trade Closed" specifically means a live close pushed by the TradoSync EA
// (source: 'ea_sync') — never a CSV/HTML import or a manual add, so bulk
// historical imports (or editing a manual trade) never spam this popup.
//
// IMPORTANT: on Save, this writes into trades.execution_checklist +
// journaled_at — the SAME fields Journal.jsx's manual journal editor uses.
// That's deliberate: those two columns are what already feed
// computeTradeQualityScore, computeJournalStats, computeRiskBreakdown,
// computeTradeQualityAggregate ("Common Issues"), and the Gemini prompts in
// backend/routes/ai.js (both the per-trade autopsy and the weekly report).
// So every trade answered here automatically becomes real input to Trado
// AI and every analytics screen — no separate storage, no extra plumbing.
// On Skip, neither field is touched, so a skipped trade correctly stays
// "not journaled" instead of polluting those stats with an empty checklist.
export function PostTradeChecklistProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id

  const [queue, setQueue] = useState([])       // trades waiting to be reviewed
  const [current, setCurrent] = useState(null) // trade shown in the modal right now
  const [saving, setSaving] = useState(false)

  // id -> last known status. Lets us tell "just flipped open -> closed" (pop
  // the checklist) apart from "already was closed" (e.g. a P&L tweak on an
  // already-reviewed trade, which must NOT re-trigger the popup) — without
  // needing REPLICA IDENTITY FULL on the trades table just to read
  // payload.old.
  const knownStatusRef = useRef(new Map())

  const enqueue = useCallback((row) => {
    setQueue(q => (q.some(t => t.id === row.id) ? q : [...q, row]))
  }, [])

  useEffect(() => {
    knownStatusRef.current = new Map()
    setQueue([])
    setCurrent(null)
    if (!userId) return

    let cancelled = false
    let seeded = false

    function evaluate(row, prevStatus) {
      if (row.status !== 'closed') return
      if (row.source !== 'ea_sync') return           // only genuine live EA closes
      if (row.checklist_responded_at) return         // already answered/skipped this popup (e.g. another tab)
      if (row.journaled_at) return                    // already journaled by hand — don't bug them again
      if (prevStatus === 'closed') return              // wasn't a fresh open -> closed transition
      enqueue(row)
    }

    // Unique per effect run (not just userId) so React 18 StrictMode's
    // double-invoke in dev never collides with a channel name that's still
    // registered — same fix already used in useTrades.js / useNotifications.
    const topic = `post-trade-checklist-${userId}-${Math.random().toString(36).slice(2)}`

    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            knownStatusRef.current.delete(payload.old.id)
            return
          }
          const row = payload.new
          if (!row) return
          const prevStatus = knownStatusRef.current.get(row.id)
          knownStatusRef.current.set(row.id, row.status)

          // Ignore the brief window before the initial seed below finishes —
          // without a baseline we can't tell "just closed" from "loaded
          // already closed", and the seed only takes one fast query.
          if (!seeded) return
          evaluate(row, prevStatus)
        }
      )
      .subscribe()

    // Seed the baseline so trades that were already closed before this tab
    // opened never trigger the popup — only a live transition does.
    supabase
      .from('trades')
      .select('id,status')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (cancelled) return
        for (const t of (data || [])) {
          if (!knownStatusRef.current.has(t.id)) knownStatusRef.current.set(t.id, t.status)
        }
        seeded = true
      })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [userId, enqueue])

  // Show one trade at a time — pull the next off the queue once nothing is
  // currently on screen.
  useEffect(() => {
    if (!current && queue.length > 0) {
      setCurrent(queue[0])
      setQueue(q => q.slice(1))
    }
  }, [current, queue])

  // checklist = the canonical [{id,label,checked}] array built by the modal.
  async function handleSave(checklist) {
    if (!current) return
    setSaving(true)
    const { error } = await supabase.from('trades').update({
      execution_checklist:    checklist,
      journaled_at:            current.journaled_at || new Date().toISOString(),
      checklist_skipped:      false,
      checklist_responded_at: new Date().toISOString(),
    }).eq('id', current.id)
    setSaving(false)
    setCurrent(null)
    if (error) toast.error('Failed to save checklist: ' + error.message)
    else toast.success(`Checklist saved — ${current.symbol} journaled`)
  }

  function handleSkip() {
    if (!current) return
    const id = current.id
    setCurrent(null)
    // Fire-and-forget — no need to block the UI on a skip. Deliberately
    // does NOT touch execution_checklist/journaled_at (see comment above).
    supabase.from('trades').update({
      checklist_skipped:      true,
      checklist_responded_at: new Date().toISOString(),
    }).eq('id', id)
  }

  return (
    <PostTradeChecklistContext.Provider value={{ pending: queue.length }}>
      {children}
      <PostTradeChecklistModal
        trade={current}
        saving={saving}
        onSave={handleSave}
        onSkip={handleSkip}
      />
    </PostTradeChecklistContext.Provider>
  )
}

export function usePostTradeChecklist() {
  return useContext(PostTradeChecklistContext)
}