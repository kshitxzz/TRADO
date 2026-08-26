import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import { generateTrades, generateSyncTrades } from '../lib/tradeSeeder'
import { useAccounts } from './useAccounts'
import toast from 'react-hot-toast'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

export function useTrades(userId) {
  const { accounts, loading: accountsLoading, activeAccount, switchAccount, refetchAccounts } = useAccounts()
  const [allTrades, setAllTrades] = useState([])
  const [tradesLoading, setTradesLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  // Kept as `account` throughout this hook (and every page that consumes
  // it) for backward compatibility — it's just "whichever account is
  // currently selected in the Topbar switcher" now, instead of "the one
  // account the user has".
  const account = activeAccount
  const loading = tradesLoading || accountsLoading

  const fetchTrades = useCallback(async () => {
    if (!userId) { setTradesLoading(false); return }

    const { data: tr } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('closed_at', { ascending: false })

    setAllTrades(tr || [])
    setTradesLoading(false)
  }, [userId])

  // fetchAll = refresh both the account list and this user's trades — kept
  // under its old name since every connect/disconnect/import call site below
  // already calls it.
  const fetchAll = useCallback(async () => {
    await Promise.all([refetchAccounts(), fetchTrades()])
  }, [refetchAccounts, fetchTrades])

  useEffect(() => { fetchTrades() }, [fetchTrades])

  // Scope trades to whichever account is active in the switcher. With zero
  // connected accounts, show nothing at all — this is the guard that used
  // to live in fetchAll() (skipped fetching entirely when !account) to keep
  // orphaned/leftover trades from ever surfacing before a user connects
  // anything. With exactly one account, no filtering is needed. Filtering
  // by account only kicks in once there's more than one to disambiguate.
  const trades = useMemo(() => {
    if (accounts.length === 0) return []
    if (accounts.length === 1 || !account) return allTrades
    return allTrades.filter(t => t.broker_account_id === account.id)
  }, [allTrades, accounts.length, account])

  // ── Realtime sync ───────────────────────────────────────────────────────────
  // The MT5 EA pushes fresh open-position P&L into `trades` every ~30s (and
  // instantly on every fill, via OnTradeTransaction). Instead of the UI only
  // seeing that on the next manual refresh, we subscribe to Postgres changes
  // on this user's rows and merge them straight into local state — this is
  // what makes Open Trades / the dashboard's Today card feel live.
  //
  // Mobile-only gap this closes: when a phone's screen locks or the browser
  // tab is backgrounded, iOS Safari / Android Chrome suspend JS execution
  // and drop the underlying WebSocket to save battery. Supabase's realtime
  // client reconnects the socket on its own, but it does NOT backfill
  // whatever Postgres changes happened while it was disconnected — so a
  // trade that closed while the phone was locked silently never arrives,
  // and the P&L on screen stays frozen at its last value even though the
  // connection "looks" fine again. Desktop tabs rarely get suspended this
  // aggressively, which is exactly why this only shows up on mobile.
  // `reconnectTick` forces a full teardown + fresh channel (rather than
  // trusting the client's own reconnect state, which can end up in a
  // stuck "connected" state after a long suspension), and the effect below
  // pairs it with an immediate refetch to catch up on anything missed.
  const [reconnectTick, setReconnectTick] = useState(0)

  useEffect(() => {
    if (!userId) return

    // Unique per effect run — NOT just `userId` — on purpose. React 18
    // StrictMode double-invokes this effect in dev (mount → cleanup →
    // mount). supabase.channel(name) reuses an existing channel object for
    // a name that's still registered; calling .on() on one that's already
    // `subscribe()`-d throws ("cannot add postgres_changes callbacks...
    // after subscribe()"). A unique name per mount means there's never a
    // stale channel to collide with, regardless of cleanup timing.
    const topic = `trades-live-${userId}-${Math.random().toString(36).slice(2)}`

    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${userId}` },
        (payload) => {
          setAllTrades(prev => {
            if (payload.eventType === 'INSERT') {
              if (prev.some(t => t.id === payload.new.id)) return prev
              return [payload.new, ...prev]
            }
            if (payload.eventType === 'UPDATE') {
              return prev.map(t => (t.id === payload.new.id ? { ...t, ...payload.new } : t))
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter(t => t.id !== payload.old.id)
            }
            return prev
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, reconnectTick])

  // Fires when the tab/app comes back to the foreground — screen unlock,
  // app switch back, browser tab refocus. Refetches immediately (so any
  // trade that closed while backgrounded shows up right away) and bumps
  // reconnectTick to force the realtime channel above to reconnect fresh
  // instead of relying on a possibly-stuck existing connection.
  useEffect(() => {
    function handleForeground() {
      if (document.visibilityState !== 'visible') return
      fetchTrades()
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
  }, [fetchTrades])

  // ── Derived flags ──────────────────────────────────────────────────────────
  const isManualAccount = account?.account_type === 'prop_firm' || account?.account_type === 'live'
  const isMt5Account    = account?.account_type === 'mt5' || (!account?.account_type && !!account?.meta_api_id)

  // ── connectAccount (MT5) ───────────────────────────────────────────────────
  async function connectAccount(info) {
    if (!userId) return { error: 'Not logged in' }

    const connectRes = await fetch(`${BACKEND}/api/broker/connect`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        userId, metaApiId: info.metaApiId, accountNumber: info.accountNumber,
        server: info.server, broker: info.broker, balance: info.balance,
        currency: info.currency, accountName: info.accountName,
      }),
    })

    if (!connectRes.ok) {
      const err = await connectRes.json()
      toast.error('Failed to save account: ' + err.error)
      return { error: err.error }
    }

    const savedAccount = await connectRes.json()

    if (info.metaApiId) {
      toast.loading('Syncing your MT5 trades…', { id: 'sync' })
      try {
        const syncRes  = await fetch(`${BACKEND}/api/broker/sync-trades`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ metaApiId: info.metaApiId, userId, brokerAccountId: savedAccount.id }),
        })
        const syncData = await syncRes.json()
        toast.success(syncData.message || 'Trades synced!', { id: 'sync' })
      } catch (e) {
        toast.error('Sync failed: ' + e.message, { id: 'sync' })
      }
    } else if (info.seedDemoTrades) {
      // Explicit opt-in only — never fires as a silent fallback. Kept for a
      // future "try a demo account" feature; real EA/import accounts must
      // never have fake trades inserted into them.
      const seeded = generateTrades(userId, savedAccount.id, 40, info.accountNumber)
      await supabase.from('trades').delete().eq('user_id', userId)
      await supabase.from('trades').insert(seeded)
      toast.success(`Connected! ${seeded.length} demo trades loaded.`)
    }

    await fetchAll()
    return { data: savedAccount }
  }

  // ── connectManualAccount ───────────────────────────────────────────────────
  async function connectManualAccount({ accountType, accountName, settings }) {
    if (!userId) return { error: 'Not logged in' }

    try {
      const res = await fetch(`${BACKEND}/api/broker/connect-manual`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId, accountType, accountName, settings }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error('Failed to create account: ' + err.error)
        return { error: err.error }
      }
      const saved = await res.json()
      toast.success('Account created! Start adding your trades.')
      await fetchAll()
      return { data: saved }
    } catch (err) {
      toast.error('Failed to create account')
      return { error: err.message }
    }
  }

  // ── addTrade (manual) ──────────────────────────────────────────────────────
  async function addTrade(tradeData) {
    if (!userId) return { error: 'Not logged in' }
    try {
      const { data, error } = await supabase
        .from('trades')
        .insert({ ...tradeData, source: 'manual' })
        .select().single()
      if (error) throw error
      setAllTrades(prev => [data, ...prev])
      toast.success('Trade added!')
      return { data }
    } catch (err) {
      toast.error('Failed to add trade: ' + err.message)
      return { error: err.message }
    }
  }

  // ── updateTrade ────────────────────────────────────────────────────────────
  async function updateTrade(tradeId, updates, options = {}) {
    if (!userId) return { error: 'Not logged in' }
    try {
      const { data, error } = await supabase
        .from('trades')
        .update({ ...updates })
        .eq('id', tradeId)
        .select().single()
      if (error) throw error
      setAllTrades(prev => prev.map(t => t.id === tradeId ? { ...t, ...data } : t))
      if (!options.silent) toast.success(options.successMessage || 'Trade updated!')
      return { data }
    } catch (err) {
      toast.error('Failed to update trade: ' + err.message)
      return { error: err.message }
    }
  }

  // ── deleteTrade ────────────────────────────────────────────────────────────
  async function deleteTrade(tradeId) {
    try {
      const { error } = await supabase.from('trades').delete().eq('id', tradeId)
      if (error) throw error
      setAllTrades(prev => prev.filter(t => t.id !== tradeId))
      toast.success('Trade deleted')
    } catch (err) {
      toast.error('Failed to delete trade')
    }
  }

  // ── clearAllTrades ─────────────────────────────────────────────────────────
  async function clearAllTrades() {
    if (!userId) return
    try {
      const { error } = await supabase.from('trades').delete().eq('user_id', userId)
      if (error) throw error
      setAllTrades([])
      toast.success('All trades cleared')
    } catch (err) {
      toast.error('Failed to clear trades')
    }
  }

  // ── syncTrades (MT5 only — never runs for manual accounts) ─────────────────
  // Optionally takes a specific account to sync — used by a per-account card
  // on the Accounts page, so syncing account #2 works correctly even while
  // the Topbar switcher has account #1 selected. Defaults to the active
  // (switcher-selected) account for the Topbar/Quick Actions "Sync" button.
  async function syncTrades(targetAccount) {
    const acc = targetAccount || account
    if (!acc || !userId) { toast.error('No account connected'); return }
    if (acc.account_type === 'prop_firm' || acc.account_type === 'live') {
      toast.error("Manual accounts don't sync — add trades directly instead.")
      return
    }
    if (acc.sync_method === 'ea') {
      toast.error('This account syncs automatically via the EA — no manual sync needed.')
      return
    }
    if (acc.sync_method === 'import') {
      toast.error('Use "Import More Trades" on the Accounts page to add trades from a new report.')
      return
    }
    if (!acc.meta_api_id) {
      toast.error('This account has no sync method configured yet — connect via EA or CSV/HTML import on the Accounts page.')
      return
    }

    setSyncing(true)
    try {
      const res  = await fetch(`${BACKEND}/api/broker/sync-trades`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          metaApiId:       acc.meta_api_id,
          userId,
          brokerAccountId: acc.id,
          fromDate:        acc.last_synced_at || null,
        }),
      })
      const data = await res.json()
      if (data.error) toast.error(data.error)
      else toast.success(data.message || `${data.synced} trades synced`)
    } catch (e) {
      toast.error('Sync failed — is the backend running?')
    }

    setSyncing(false)
    await fetchAll()
  }

  // ── setupEA (real-time MT5 sync via Expert Advisor) ────────────────────────
  async function setupEA({ accountNumber, server, broker }) {
    if (!userId) return { error: 'Not logged in' }
    try {
      const res = await fetch(`${BACKEND}/api/broker/ea/setup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, accountNumber, server, broker }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to set up sync'); return { error: data.error } }
      await fetchAll()
      return { data }
    } catch (err) {
      toast.error('Failed to set up sync: ' + err.message)
      return { error: err.message }
    }
  }

  // ── getEAStatus ─────────────────────────────────────────────────────────────
  async function getEAStatus(brokerAccountId) {
    try {
      const res = await fetch(`${BACKEND}/api/broker/ea/status/${brokerAccountId}`)
      if (!res.ok) return null
      return await res.json()
    } catch (_) {
      return null
    }
  }

  // ── parseImportFile (CSV/HTML preview — nothing saved yet) ─────────────────
  async function parseImportFile(file, format, timezoneOffsetMinutes) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('format', format)
    fd.append('timezoneOffsetMinutes', String(timezoneOffsetMinutes))
    try {
      const res = await fetch(`${BACKEND}/api/broker/import/parse`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to parse file'); return { error: data.error } }
      return { data }
    } catch (err) {
      toast.error('Failed to parse file: ' + err.message)
      return { error: err.message }
    }
  }

  // ── confirmImport (actually saves the parsed trades) ───────────────────────
  async function confirmImport(brokerAccountId, trades) {
    if (!userId) return { error: 'Not logged in' }
    try {
      const res = await fetch(`${BACKEND}/api/broker/import/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, brokerAccountId, trades }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Import failed'); return { error: data.error } }
      toast.success(data.message || `${data.imported} trades imported`)
      await fetchAll()
      return { data }
    } catch (err) {
      toast.error('Import failed: ' + err.message)
      return { error: err.message }
    }
  }

  // ── connectImportAccount (creates the account for a fresh CSV/HTML import) ─
  async function connectImportAccount(info) {
    if (!userId) return { error: 'Not logged in' }
    try {
      const res = await fetch(`${BACKEND}/api/broker/connect-import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...info }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to create account'); return { error: data.error } }
      await fetchAll()
      return { data }
    } catch (err) {
      toast.error('Failed to create account: ' + err.message)
      return { error: err.message }
    }
  }

  // ── disconnectAccount ──────────────────────────────────────────────────────
  async function disconnectAccount(accountId) {
    const id = accountId || account?.id
    if (!id) return
    try {
      const res = await fetch(`${BACKEND}/api/broker/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
    } catch (_) {
      await supabase.from('trades').delete().eq('broker_account_id', id)
      await supabase.from('broker_accounts').delete().eq('id', id)
    }
    await fetchAll()
    toast.success('Account disconnected')
  }

  return {
    trades, account, loading, syncing,
    isManualAccount, isMt5Account,
    // Multi-account switcher — accounts is the full connected list,
    // switchAccount(id) changes which one `account`/`trades` reflect.
    accounts, switchAccount,
    connectAccount, connectManualAccount,
    addTrade, updateTrade, deleteTrade, clearAllTrades,
    syncTrades, disconnectAccount,
    setupEA, getEAStatus,
    parseImportFile, confirmImport, connectImportAccount,
    refetch: fetchAll,
    broker:        account,
    goldVolume:    account?.gold_volume || 0,
    connectBroker: connectAccount,
  }
}