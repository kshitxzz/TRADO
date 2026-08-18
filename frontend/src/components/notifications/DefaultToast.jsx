import { resolveValue } from 'react-hot-toast'
import NotificationToast from './NotificationToast'

// Every generic toast.success()/toast.error()/toast.loading() call in the
// app (79 call sites, wired in once via <Toaster> in App.jsx) renders
// through here — which just adapts react-hot-toast's plain string message
// into the same NotificationToast used for AI Alerts, so there is exactly
// one toast design in the whole app, not two.
//
// Call sites like Journal.jsx already format messages as
// "Journal saved — EURUSD updated" — split on the em dash into a bold
// title + muted subtitle when present; a plain one-liner ("Trade added")
// just renders as the title with no subtitle line.
function splitMessage(raw) {
  const idx = raw.indexOf(' — ')
  if (idx === -1) return { title: raw, subtitle: null }
  return { title: raw.slice(0, idx), subtitle: raw.slice(idx + 3) }
}

const TYPE_SEVERITY = { success: 'success', error: 'critical' }

export default function DefaultToast({ t }) {
  const message = resolveValue(t.message, t)

  // toast.custom() toasts (the AI Alert notification) already render their
  // own complete NotificationToast — nothing to adapt, render as-is.
  if (t.type === 'custom') return message

  if (t.type === 'loading') {
    return <NotificationToast t={t} title={String(message)} loading />
  }

  const { title, subtitle } = splitMessage(String(message))
  return (
    <NotificationToast
      t={t}
      title={title}
      message={subtitle}
      severity={TYPE_SEVERITY[t.type] || 'info'}
      duration={t.duration || 3000}
    />
  )
}