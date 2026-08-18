import toast from 'react-hot-toast'
import NotificationToast from '../components/notifications/NotificationToast'

// Renders through the app's single existing <Toaster/> (mounted once in
// App.jsx) rather than a second toast system — `duration: Infinity` here
// hands dismiss-timing entirely to NotificationToast itself, so hovering
// can pause it.
export function showAlertToast(alert, duration = 6000) {
  toast.custom(
    (t) => (
      <NotificationToast
        t={t}
        title={alert.title}
        message={alert.message}
        severity={alert.severity}
        duration={duration}
      />
    ),
    { duration: Infinity, id: alert.id, position: 'top-right' }
  )
}