import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, TrendingUp, BookOpen, Sparkles, Target,
  Trophy, Share2, Wallet, Settings, LogOut, ChevronLeft,
  ChevronRight, BarChart2, ChevronDown, ChevronUp, X,
  BarChart3, Download, FileText, CalendarDays, Clock, Play, Brain, Wrench,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import Logo from '../ui/Logo'

const NAV_MAIN = [
  { label: 'Dashboard',        icon: LayoutDashboard, path: '/dashboard' },
  {
    label: 'Analytics', icon: BarChart2, path: '/analytics',
    children: [
      { label: 'Performance',      path: '/analytics/performance',      icon: BarChart3 },
      { label: 'Reports',          path: '/analytics/reports',          icon: Download },
      { label: 'Advanced Reports', path: '/analytics/advanced-reports', icon: FileText },
      { label: 'Day View',         path: '/analytics/day-view',         icon: CalendarDays },
      { label: 'Sessions',         path: '/analytics/sessions',         icon: Clock },
      { label: 'Trade Replay',     path: '/analytics/trade-replay',     icon: Play },
    ]
  },
  { label: 'Trades',           icon: TrendingUp,  path: '/trades' },
  { label: 'Journal',          icon: BookOpen,    path: '/journal' },
  { label: 'AI Analysis',      icon: Sparkles,    path: '/trado-ai' },
  { label: 'Trado AI 2.0',     icon: Brain,       path: '/trado-ai-2', badge: 'NEW' },
  { label: 'Growth Roadmap',   icon: Target,      path: '/progress' },
  { label: 'Tools',            icon: Wrench,      path: '/tools' },
  { label: 'Share Cards',      icon: Share2,      path: '/share-cards' },
]

const NAV_BOTTOM = [
  { label: 'Broker Hub', icon: Wallet,   path: '/accounts' },
  { label: 'Settings', icon: Settings, path: '/settings' },
]

const SIDEBAR_TRANSITION = { duration: 0.22, ease: [0.4, 0, 0.2, 1] }

// Matches Tailwind's default `lg` breakpoint (1024px) — below this, the
// sidebar switches from a permanent column to an off-canvas drawer.
const MOBILE_QUERY = '(max-width: 1023px)'

// A label that fades + collapses its own width in step with the sidebar's
// width animation, instead of vanishing/appearing in a single instant frame
// while the container is still mid-animation. That mismatch — content
// snapping instantly against a container that takes 300ms to catch up — is
// what made the old collapse feel laggy and made icons/logo look like they
// were being "compressed."
function Label({ show, children, className = '' }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: 'auto' }}
          exit={{ opacity: 0, width: 0 }}
          transition={SIDEBAR_TRANSITION}
          className={`overflow-hidden whitespace-nowrap ${className}`}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

export default function Sidebar({ mobileOpen = false, onCloseMobile }) {
  const [collapsed, setCollapsed]         = useState(false)
  const location  = useLocation()
  const navigate  = useNavigate()
  const { signOut, profile, user } = useAuth()

  // Below `lg`, the sidebar becomes a fixed-position drawer that slides in
  // over the page instead of a permanent column — a 268px-wide column
  // eating most of a 375px phone screen on every page was the single
  // biggest thing making Trado unusable on mobile.
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false
  )
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    setIsMobile(mq.matches)
    const handler = (e) => {
      setIsMobile(e.matches)
      if (!e.matches) onCloseMobile?.()
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [onCloseMobile])

  // The desktop "collapsed" icon-only mode doesn't apply on mobile — a
  // drawer is either fully open or fully off-screen, never icon-only.
  const effectiveCollapsed = collapsed && !isMobile

  const isAnalyticsActive = location.pathname.startsWith('/analytics')
  // Starts open if we're already on an Analytics sub-page (handles a hard
  // refresh / direct link), and re-opens on every navigation into /analytics/*.
  // Sidebar is remounted fresh on each route change (PageWrapper is used
  // per-page, not as a single persistent layout), so local state alone can't
  // survive navigation — deriving it from the route on every change is what
  // keeps the submenu open after picking an item instead of collapsing.
  const [analyticsOpen, setAnalyticsOpen] = useState(isAnalyticsActive)
  useEffect(() => {
    if (isAnalyticsActive) setAnalyticsOpen(true)
  }, [isAnalyticsActive])
  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Trader'
  const initial     = displayName[0]?.toUpperCase() || 'T'

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  // Tapping any actual navigation link on mobile should close the drawer —
  // otherwise it just sits open over the new page until manually dismissed.
  function handleNavClick() {
    if (isMobile) onCloseMobile?.()
  }

  return (
    <>
      {/* Backdrop — mobile only, shown while the drawer is open */}
      <AnimatePresence>
        {isMobile && mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCloseMobile}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.5)' }}
          />
        )}
      </AnimatePresence>

      <motion.aside
        animate={{
          width: isMobile ? 280 : (collapsed ? 104 : 268),
          x:     isMobile ? (mobileOpen ? 0 : -300) : 0,
        }}
        transition={SIDEBAR_TRANSITION}
        className={`flex flex-col h-full flex-shrink-0 overflow-hidden ${isMobile ? 'fixed inset-y-0 left-0 z-50' : 'relative'}`}
        style={{
          background: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--border-subtle)',
        }}
      >
        {/* Logo — the icon and the collapse button both have a guaranteed,
            fixed amount of space (flex-shrink-0) and are never touched by
            animation. The wordmark is always rendered at full size in normal
            flow; it's the middle flex-1 wrapper around it that shrinks (in
            step with the sidebar) and clips via overflow-hidden. That means
            the text doesn't animate or resize at all — it just gets physically
            covered by the sidebar's own edge as the sidebar narrows, exactly
            like a panel sliding over it. */}
        <div className="flex items-center px-4 py-4 border-b" style={{ borderColor: 'var(--border-subtle)', minHeight: 72 }}>
          <Logo variant="icon" height={36} className="flex-shrink-0" />
          <div className="flex-1 min-w-0 overflow-hidden">
            <span className="whitespace-nowrap inline-block pl-2.5"
                  style={{ fontSize: 22, lineHeight: 1, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
              trado
            </span>
          </div>
          {isMobile ? (
            <button onClick={onCloseMobile}
                    className="p-1.5 rounded-md hover:bg-black/5 transition-colors flex-shrink-0"
                    style={{ color: 'var(--text-muted)' }}>
              <X size={18} />
            </button>
          ) : (
            <button onClick={() => setCollapsed(c => !c)}
                    className="p-1.5 rounded-md hover:bg-black/5 transition-colors flex-shrink-0"
                    style={{ color: 'var(--text-muted)' }}>
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          )}
        </div>

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2.5 space-y-1">
          {NAV_MAIN.map(item => {
            if (item.children) {
              return (
                <div key={item.label}>
                  <button
                    onClick={() => !effectiveCollapsed && setAnalyticsOpen(o => !o)}
                    title={effectiveCollapsed ? item.label : undefined}
                    className={`nav-item w-full justify-between ${isAnalyticsActive ? 'active' : ''}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <item.icon size={18} className="flex-shrink-0" />
                      <Label show={!effectiveCollapsed}>{item.label}</Label>
                    </div>
                    <Label show={!effectiveCollapsed}>
                      {analyticsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </Label>
                  </button>
                  <AnimatePresence initial={false}>
                    {!effectiveCollapsed && analyticsOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={SIDEBAR_TRANSITION}
                        className="ml-6 mt-0.5 space-y-0.5 overflow-hidden"
                      >
                        {item.children.map(c => (
                          <NavLink key={c.path} to={c.path} onClick={handleNavClick}
                                   className={({ isActive }) => `nav-item text-xs py-2 ${isActive ? 'active' : ''}`}>
                            <c.icon size={13} className="flex-shrink-0 opacity-70" />
                            {c.label}
                          </NavLink>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            }

            return (
              <NavLink key={item.path} to={item.path} title={effectiveCollapsed ? item.label : undefined}
                       onClick={handleNavClick}
                       className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <item.icon size={18} className="flex-shrink-0" />
                <Label show={!effectiveCollapsed} className="flex-1">{item.label}</Label>
                {!effectiveCollapsed && item.badge && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white flex-shrink-0"
                        style={{ background: 'var(--accent-purple)' }}>{item.badge}</span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Bottom nav */}
        <div className="border-t px-2.5 py-3 space-y-1" style={{ borderColor: 'var(--border-subtle)' }}>
          {NAV_BOTTOM.map(item => (
            <NavLink key={item.path} to={item.path} title={effectiveCollapsed ? item.label : undefined}
                     onClick={handleNavClick}
                     className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <item.icon size={18} className="flex-shrink-0" />
              <Label show={!effectiveCollapsed}>{item.label}</Label>
            </NavLink>
          ))}

          {/* User row */}
          <div className="flex items-center gap-2.5 px-3 py-2 mt-1 rounded-lg hover:bg-black/5 transition-colors">
            <NavLink to="/settings" title={effectiveCollapsed ? 'Profile' : undefined} onClick={handleNavClick}
                     className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                   style={{ background: 'var(--gradient-primary)' }}>{initial}</div>
              <Label show={!effectiveCollapsed} className="flex-1 min-w-0">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{displayName}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Trader</p>
                </div>
              </Label>
            </NavLink>
            {!effectiveCollapsed && (
              <button onClick={handleLogout} title="Logout"
                      className="p-1 rounded hover:bg-black/10 transition-colors flex-shrink-0">
                <LogOut size={13} style={{ color: 'var(--text-muted)' }} />
              </button>
            )}
          </div>
        </div>
      </motion.aside>
    </>
  )
}