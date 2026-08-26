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

  // Forces the effect below to tear down and rebuild the realtime channel
  // + do a fresh catch-up fetch. Bumped on visibilitychange/focus — see the
  // effect further down for why that matters on mobile.
  const [reconnectTick, setReconnectTick] = useState(0)

  // id -> last known status. Lets us tell "just flipped open -> closed" (pop
  // the checklist) apart from "already was closed" (e.g. a P&L tweak on an
  // already-reviewed trade, which must NOT re-trigger the popup) — without
  // needing REPLICA IDENTITY FULL on the trades table just to read
  // payload.old. Deliberately NOT reset on every effect run — only when the
  // user changes — so a reconnect (see below) compares against real history
  // instead of a wiped-clean map.
  const knownStatusRef = useRef(new Map())
  const seededForUserRef = useRef(null)

  const enqueue = useCallback((row) => {
    setQueue(q => (q.some(t => t.id === row.id) ? q : [...q, row]))
  }, [])

  useEffect(() => {
    if (!userId) {
      knownStatusRef.current = new Map()
      seededForUserRef.current = null
      setQueue([])
      setCurrent(null)
      return
    }

    let cancelled = false
    // True if we already built a baseline for this exact user in a
    // previous run of this effect — i.e. this run is a reconnect (mobile
    // tab regaining focus), not the first-ever mount for this user.
    let seeded = seededForUserRef.current === userId

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

          // Ignore the brief window before the catch-up fetch below
          // finishes — without a baseline we can't tell "just closed" from
          // "loaded already closed", and it only takes one fast query.
          if (!seeded) return
          evaluate(row, prevStatus)
        }
      )
      .subscribe()

    // Catch-up fetch. On the very first mount for this user this just
    // seeds the baseline map (no evaluate() calls yet — matches the
    // original behaviour of never popping for trades that were already
    // closed before this tab opened). On a RECONNECT — phone unlocked,
    // tab refocused after being backgrounded — `seeded` is already true
    // from the prior run, so every closed trade here gets compared
    // against the map built up earlier in the session. Any trade that
    // flipped open -> closed while the phone was locked (and whose
    // realtime event never arrived, because mobile Safari/Chrome silently
    // drop the WebSocket when backgrounded) is caught here instead of
    // being missed forever.
    supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'closed')
      .then(({ data }) => {
        if (cancelled || !data) return
        for (const row of data) {
          const prevStatus = knownStatusRef.current.get(row.id)
          knownStatusRef.current.set(row.id, row.status)
          if (seeded) evaluate(row, prevStatus)
        }
        seeded = true
        seededForUserRef.current = userId
      })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [userId, reconnectTick, enqueue])

  // Mobile fix: force a reconnect + catch-up the moment the tab/app comes
  // back to the foreground, instead of leaving a possibly-dead connection
  // sitting there until the person happens to reload the page.
  useEffect(() => {
    function handleForeground() {
      if (document.visibilityState !== 'visible') return
      setReconnectTick(t => t + 1)
    }
    document.addEventListener('visibilitychange', handleForeground)
    window.addEventListener('focus', handleForeground)
    window.addEventListener('pageshow', handleForeground)
    return () => {
      document.removeEventListener('visibilitychange', handleForeground)
      window.removeEventListener('focus', handleForeground)
      window.removeEventListener('pageshow', handleForeground)
    }
  }, [])

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