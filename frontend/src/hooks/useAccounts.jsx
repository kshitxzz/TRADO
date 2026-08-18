import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

const AccountsContext = createContext(null)

function storageKey(userId) { return `trado_active_account_${userId}` }

// Wraps the app so any page can read "which account is active right now"
// (for the Topbar switcher) and the full account list (for the Accounts
// page) without every page having to fetch and pass it down itself.
export function AccountsProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id

  const [accounts, setAccounts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [activeAccountId, setActiveAccountIdState] = useState(null)

  // Right after connecting an account, several fetches can fire in quick
  // succession — the initial mount fetch, the explicit refetch that
  // setupEA() triggers, and the realtime-triggered refetch from the INSERT
  // event itself. Without sequencing, a slower/older one can resolve last
  // and overwrite the correct result with a stale (possibly empty) one.
  // This ref-based counter makes fetchAccounts only apply its own result if
  // no newer fetch has started since.
  const fetchSeq = useRef(0)

  const fetchAccounts = useCallback(async () => {
    const seq = ++fetchSeq.current
    if (!userId) { setAccounts([]); setLoading(false); return }
    const { data, error } = await supabase
      .from('broker_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    if (seq !== fetchSeq.current) return // a newer fetch already started — drop this stale result
    if (error) {
      // Keep whatever we last successfully loaded rather than silently
      // wiping the list to empty on a transient error — that's what made
      // a genuinely-connected account (still syncing fine in MT5) briefly
      // vanish from the Accounts page/Topbar switcher.
      console.error('[useAccounts] failed to load broker_accounts:', error.message)
      setLoading(false)
      return
    }
    setAccounts(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  // Realtime — so the switcher (and every card on the Accounts page)
  // updates the moment an account is added, renamed, or disconnected,
  // instead of needing a manual refetch wired into every call site.
  useEffect(() => {
    if (!userId) return
    const topic = `broker-accounts-live-${userId}-${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'broker_accounts', filter: `user_id=eq.${userId}` },
        () => fetchAccounts()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, fetchAccounts])

  // Polling fallback for balance/equity — the EA can push a pure heartbeat
  // (balance/equity only, no trades) when an account has no activity yet.
  // That never touches the `trades` table, so it can't ride along on any
  // trades-realtime channel, and depends entirely on `broker_accounts`
  // being added to Supabase's realtime publication — easy to miss since
  // this table was never subscribed to before multi-account support. This
  // guarantees balance/equity go stale for at most 20s either way.
  useEffect(() => {
    if (!userId) return
    const id = setInterval(fetchAccounts, 20000)
    return () => clearInterval(id)
  }, [userId, fetchAccounts])

  // Restore the last-viewed account (per user, via localStorage) once the
  // list loads, and keep the selection valid as accounts are added/removed —
  // falls back to the first account if the saved one was disconnected.
  useEffect(() => {
    if (loading) return
    setActiveAccountIdState(prev => {
      const saved = prev || (userId ? localStorage.getItem(storageKey(userId)) : null)
      if (saved && accounts.some(a => a.id === saved)) return saved
      return accounts[0]?.id || null
    })
  }, [accounts, loading, userId])

  function switchAccount(id) {
    setActiveAccountIdState(id)
    if (userId) localStorage.setItem(storageKey(userId), id)
  }

  const activeAccount = accounts.find(a => a.id === activeAccountId) || accounts[0] || null

  const value = {
    accounts,
    loading,
    activeAccount,
    activeAccountId: activeAccount?.id || null,
    switchAccount,
    refetchAccounts: fetchAccounts,
  }

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>
}

export function useAccounts() {
  const ctx = useContext(AccountsContext)
  if (!ctx) throw new Error('useAccounts must be used within an AccountsProvider')
  return ctx
}