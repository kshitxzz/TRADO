import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'
import { showAlertToast } from '../lib/showAlertToast'

const NotificationsContext = createContext(null)
const SEEN_KEY_PREFIX = 'trado_alerts_seen_'

// Mounted once, at the app root (App.jsx), so it survives route changes —
// unlike AIAlertsTab's own alert-checking effect, this never re-runs the
// coach rules itself. It only listens for whatever ai_alerts rows get
// created elsewhere (Dashboard's check, AI Alerts tab's check, etc.) via
// Supabase Realtime, so a breach notifies the user no matter which page
// they're on when it fires.
export function NotificationsProvider({ children }) {
  const { user, profile } = useAuth()
  const [alerts, setAlerts] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const pushEnabledRef = useRef(false)

  // Read via a ref (not a dependency the subscription effect below reacts
  // to) so flipping the Settings toggle takes effect on the next alert
  // immediately, without tearing down and recreating the realtime channel.
  useEffect(() => {
    pushEnabledRef.current = !!profile?.notification_settings?.push
  }, [profile?.notification_settings?.push])

  const seenKey = user?.id ? `${SEEN_KEY_PREFIX}${user.id}` : null

  const recomputeUnread = useCallback((list) => {
    if (!seenKey) { setUnreadCount(0); return }
    const seenAt = localStorage.getItem(seenKey)
    const seenTime = seenAt ? new Date(seenAt).getTime() : 0
    setUnreadCount(list.filter(a => new Date(a.created_at).getTime() > seenTime).length)
  }, [seenKey])

  useEffect(() => {
    if (!user?.id) { setAlerts([]); setUnreadCount(0); setLoading(false); return }

    let cancelled = false
    setLoading(true)

    supabase.from('ai_alerts').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => {
        if (cancelled) return
        setAlerts(data || [])
        recomputeUnread(data || [])
        setLoading(false)
      })

    const channel = supabase
      .channel(`ai_alerts_${user.id}_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ai_alerts', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new
          setAlerts(prev => {
            const next = [row, ...prev].slice(0, 30)
            recomputeUnread(next)
            return next
          })

          if (!pushEnabledRef.current) return
          showAlertToast(row)
          // Only fire the OS-level notification when the tab is backgrounded
          // — the in-app toast already covers the foreground case, and this
          // avoids a redundant native popup stacking on top of it.
          if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try { new Notification(row.title, { body: row.message, icon: '/favicon.ico' }) } catch { /* noop */ }
          }
        })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const markAllRead = useCallback(() => {
    if (!seenKey) return
    localStorage.setItem(seenKey, new Date().toISOString())
    setUnreadCount(0)
  }, [seenKey])

  const dismissAlert = useCallback((id) => {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }, [])

  return (
    <NotificationsContext.Provider value={{ alerts, unreadCount, loading, markAllRead, dismissAlert }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider')
  return ctx
}