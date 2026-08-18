import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuth } from './hooks/useAuth'
import { ThemeProvider } from './hooks/useTheme'
import { AccountsProvider } from './hooks/useAccounts'
import { NotificationsProvider } from './hooks/useNotifications'
import { useDailyWisdom } from './hooks/useDailyWisdom'
import DailyWisdomModal from './components/ui/DailyWisdomModal'
import DefaultToast from './components/notifications/DefaultToast'
import Logo from './components/ui/Logo'

import Landing       from './pages/Landing'
import Login         from './pages/Login'
import Signup        from './pages/Signup'
import ResetPassword from './pages/ResetPassword'
import Dashboard     from './pages/Dashboard'
import Trades        from './pages/Trades'
import Journal       from './pages/Journal'
import TradoAI       from './pages/TradoAI'
import TradoAI2      from './pages/TradoAI2'
import TradeDNA       from './pages/TradeDNA'
import Progress      from './pages/Progress'
import ShareCards    from './pages/ShareCards'
import Accounts      from './pages/Accounts'
import Settings      from './pages/Settings'
import Pricing       from './pages/Pricing'
import Tools         from './pages/Tools'
import PositionSizeCalculator from './pages/tools/PositionSizeCalculator'
import Performance   from './pages/analytics/Performance'
import Reports       from './pages/analytics/Reports'
import AdvancedReports from './pages/analytics/AdvancedReports'
import DayView       from './pages/analytics/DayView'
import Sessions      from './pages/analytics/Sessions'
import TradeReplay   from './pages/analytics/TradeReplay'
import NotFound      from './pages/NotFound'
import TermsOfService from './pages/legal/TermsOfService'
import PrivacyPolicy  from './pages/legal/PrivacyPolicy'
import RefundPolicy   from './pages/legal/RefundPolicy'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  const { quote: wisdomQuote, visible: wisdomVisible, dismiss: dismissWisdom } = useDailyWisdom()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex flex-col items-center gap-3">
        <Logo variant="icon" height={60} />
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
             style={{ borderColor: 'var(--accent-purple)', borderTopColor: 'transparent' }} />
      </div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return (
    <>
      {children}
      <DailyWisdomModal open={wisdomVisible} quote={wisdomQuote} onStart={dismissWisdom} />
    </>
  )
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? <Navigate to="/dashboard" replace /> : children
}

export default function App() {
  return (
    <ThemeProvider>
    <AccountsProvider>
    <NotificationsProvider>
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{ duration: 3000 }}
      >
        {(t) => <DefaultToast t={t} />}
      </Toaster>
      <Routes>
        {/* Public */}
        <Route path="/"        element={<Landing />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/terms"         element={<TermsOfService />} />
        <Route path="/privacy"       element={<PrivacyPolicy />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/login"   element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/signup"  element={<PublicRoute><Signup /></PublicRoute>} />
        {/* Standalone — reached via the emailed recovery link, which establishes
            its own temporary session. Wrapping this in PublicRoute would bounce
            the user straight to /dashboard before they can set a new password. */}
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Protected */}
        <Route path="/dashboard"  element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/trades"     element={<PrivateRoute><Trades /></PrivateRoute>} />
        <Route path="/journal"    element={<PrivateRoute><Journal /></PrivateRoute>} />
        <Route path="/trado-ai"   element={<PrivateRoute><TradoAI /></PrivateRoute>} />
        <Route path="/trado-ai-2" element={<PrivateRoute><TradoAI2 /></PrivateRoute>} />
        <Route path="/trade-dna"  element={<PrivateRoute><TradeDNA /></PrivateRoute>} />
        <Route path="/progress"   element={<PrivateRoute><Progress /></PrivateRoute>} />
        <Route path="/leaderboard" element={<Navigate to="/progress" replace />} />
        <Route path="/share-cards"element={<PrivateRoute><ShareCards /></PrivateRoute>} />
        <Route path="/accounts"   element={<PrivateRoute><Accounts /></PrivateRoute>} />
        <Route path="/broker-hub" element={<Navigate to="/accounts" replace />} />
        <Route path="/settings"   element={<PrivateRoute><Settings /></PrivateRoute>} />
        <Route path="/tools"      element={<PrivateRoute><Tools /></PrivateRoute>} />
        <Route path="/tools/position-size-calculator" element={<PrivateRoute><PositionSizeCalculator /></PrivateRoute>} />

        {/* Analytics */}
        <Route path="/analytics/performance"      element={<PrivateRoute><Performance /></PrivateRoute>} />
        <Route path="/analytics/reports"          element={<PrivateRoute><Reports /></PrivateRoute>} />
        <Route path="/analytics/advanced-reports" element={<PrivateRoute><AdvancedReports /></PrivateRoute>} />
        <Route path="/analytics/day-view"         element={<PrivateRoute><DayView /></PrivateRoute>} />
        <Route path="/analytics/sessions"       element={<PrivateRoute><Sessions /></PrivateRoute>} />
        <Route path="/analytics/trade-replay"     element={<PrivateRoute><TradeReplay /></PrivateRoute>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
    </NotificationsProvider>
    </AccountsProvider>
    </ThemeProvider>
  )
}