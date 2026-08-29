import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, Bell, Sun, Moon, Clock, ChevronDown, User, Settings, LogOut, RefreshCw, Plus, Wallet, Check, Menu, X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { useAccounts } from '../../hooks/useAccounts'
import { useNotifications } from '../../hooks/useNotifications'
import { RULE_META, SEVERITY_COLOR, timeAgo } from '../../lib/alertMeta'
import CommandPalette from './CommandPalette'
import QuickActionsMenu from './QuickActionsMenu'
import DropdownPortal from './DropdownPortal'

// Route → page title shown on the left of the topbar. Falls back to a
// prettified version of the last path segment for anything not listed here.
const TITLES = {
  '/dashboard':                 'Dashboard',
  '/analytics/performance':     'Performance',
  '/analytics/reports':         'Reports',
  '/analytics/advanced-reports':'Advanced Reports',
  '/analytics/day-view':        'Day View',
  '/analytics/sessions':        'Sessions',
  '/analytics/trade-replay':    'Trade Replay',
  '/trades':                    'Trades',
  '/journal':                   'Journal',
  '/trado-ai':                  'Trado AI',
  '/trado-ai-2':                'Trado AI 2.0',
  '/progress':                  'Progress Tracker',
  '/tools':                     'Trading Tools',
  '/tools/position-size-calculator': 'Position Size Calculator',
  '/share-cards':                'Share Cards',
  '/accounts':                  'Broker Hub',
  '/settings':                  'Settings',
  '/pricing':                   'Pricing',
  '/leaderboard':                'Leaderboard',
}

function pageTitle(pathname) {
  if (TITLES[pathname]) return TITLES[pathname]
  const seg = pathname.split('/').filter(Boolean).pop() || 'trado'
  return seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function Topbar({ onSync, syncing, onMobileMenuClick }) {
  const [userOpen,  setUserOpen]  = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickOpen, setQuickOpen]     = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [now, setNow] = useState(new Date())
  const { user, profile, signOut } = useAuth()
  const { isDark, toggle }        = useTheme()
  const { accounts, activeAccount, switchAccount } = useAccounts()
  const { alerts, unreadCount, markAllRead, dismissAlert } = useNotifications()
  const navigate = useNavigate()
  const location = useLocation()
  const searchRef = useRef(null)
  const quickBtnRef    = useRef(null)
  const notifBtnRef    = useRef(null)
  const userBtnRef     = useRef(null)
  const switcherBtnRef = useRef(null)

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Trader'
  const initial     = displayName[0]?.toUpperCase() || 'T'

  // Live clock — ticks every second.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Ctrl+K / Cmd+K opens the command palette, like the reference.
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Hand focus off to the palette's own input once it opens, so this
  // read-only trigger field doesn't sit there visually focused underneath.
  useEffect(() => {
    if (paletteOpen) searchRef.current?.blur()
  }, [paletteOpen])

  async function handleLogout() {
    setUserOpen(false)
    await signOut()
    navigate('/login')
  }

  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const timeLabel = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <>
    <header className="flex items-center gap-2 sm:gap-3 lg:gap-4 px-3 sm:px-4 lg:px-6"
            style={{
              background:    'var(--bg-topbar)',
              backdropFilter:'blur(12px)',
              borderBottom:  '1px solid var(--border-subtle)',
              minHeight:     72,
            }}>
      {/* Hamburger — mobile/tablet only, opens the Sidebar drawer */}
      <button onClick={onMobileMenuClick}
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-full transition-colors flex-shrink-0"
              style={{ background: 'var(--bg-hover, rgba(255,255,255,0.04))', color: 'var(--text-secondary)' }}
              title="Open menu">
        <Menu size={18} />
      </button>

      {/* Left — page title + today's date. min-w-0 (with NO flex-shrink-0)
          lets this shrink below its natural text width so `truncate` on the
          h1 can actually engage — long titles like "Position Size
          Calculator" were previously forcing flex-shrink-0's full natural
          width, pushing the whole header (and page) into horizontal
          overflow on narrow screens. */}
      <div className="min-w-0">
        <h1 className="text-base sm:text-lg font-bold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
          {pageTitle(location.pathname)}
        </h1>
        <p className="text-xs leading-tight hidden sm:block truncate" style={{ color: 'var(--text-muted)' }}>{dateLabel}</p>
      </div>

      {/* Center — search (full box on tablet+, icon-only trigger on phones) */}
      <div className="flex-1 max-w-xl mx-auto hidden sm:block">
        <div onClick={() => setPaletteOpen(true)} className="relative w-full cursor-text">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-muted)' }} />
          <input
            ref={searchRef}
            type="text"
            readOnly
            value=""
            placeholder="Search..."
            onFocus={() => setPaletteOpen(true)}
            className="w-full pl-10 pr-14 py-2.5 rounded-xl text-sm outline-none transition-colors cursor-text"
            style={{
              background: 'var(--bg-hover, rgba(255,255,255,0.03))',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
            Ctrl+K
          </span>
        </div>
      </div>
      <button onClick={() => setPaletteOpen(true)}
              className="sm:hidden ml-auto w-9 h-9 flex items-center justify-center rounded-full transition-colors flex-shrink-0"
              style={{ background: 'var(--bg-hover, rgba(255,255,255,0.04))', color: 'var(--text-secondary)' }}
              title="Search">
        <Search size={16} />
      </button>

      {/* Right controls */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">

        {/* Account switcher — only shown once there's more than one
            connected account; picking one here scopes Dashboard, Journal,
            Trades and Analytics to just that account. */}
        {accounts.length > 1 && (
          <div className="relative">
            <button ref={switcherBtnRef}
                    onClick={() => { setSwitcherOpen(o => !o); setUserOpen(false); setNotifOpen(false) }}
                    className="hidden sm:flex items-center gap-1.5 pl-2.5 pr-2 py-2 rounded-full text-xs font-medium transition-colors max-w-[170px]"
                    style={{ background: 'var(--bg-hover, rgba(255,255,255,0.04))', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                    title="Switch account">
              <Wallet size={13} style={{ color: 'var(--accent-purple-light)', flexShrink: 0 }} />
              <span className="truncate">
                {activeAccount?.account_name || activeAccount?.broker_name || `#${activeAccount?.account_number}` || 'Account'}
              </span>
              <ChevronDown size={13} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
            </button>

            <DropdownPortal open={switcherOpen} anchorRef={switcherBtnRef} onClose={() => setSwitcherOpen(false)} width={256}>
              <div className="rounded-xl overflow-hidden shadow-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    Viewing account
                  </p>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {accounts.map(acc => (
                    <button key={acc.id}
                            onClick={() => { switchAccount(acc.id); setSwitcherOpen(false) }}
                            className="flex items-center justify-between gap-2 w-full px-4 py-2.5 text-sm hover:bg-black/5 transition-colors text-left">
                      <span className="min-w-0">
                        <span className="block font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {acc.account_name || acc.broker_name || 'Account'}
                        </span>
                        <span className="block text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                          {acc.account_number ? `#${acc.account_number}` : acc.account_type}
                        </span>
                      </span>
                      {activeAccount?.id === acc.id && (
                        <Check size={14} style={{ color: 'var(--accent-purple-light)', flexShrink: 0 }} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </DropdownPortal>
          </div>
        )}

        {/* Sync button — only shown when a broker account is connected */}
        {onSync && (
          <button onClick={onSync} disabled={syncing}
                  className="btn-primary text-xs px-2.5 sm:px-3 py-2 gap-1.5 disabled:opacity-60">
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{syncing ? 'Syncing…' : 'Sync'}</span>
          </button>
        )}

        {/* Dark / Light toggle */}
        <button onClick={toggle}
                className="w-10 h-10 flex items-center justify-center rounded-full transition-colors"
                style={{ background: 'var(--bg-hover, rgba(255,255,255,0.04))', color: 'var(--accent-purple-light)' }}
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
          {isDark ? <Moon size={17} /> : <Sun size={17} />}
        </button>

        {/* Quick actions — same 4 actions whether the account is manual or MT5 */}
        <div className="relative">
          <button ref={quickBtnRef}
                  onClick={() => { setQuickOpen(o => !o); setUserOpen(false); setNotifOpen(false); setSwitcherOpen(false) }}
                  className="w-10 h-10 flex items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
                  style={{ background: 'var(--gradient-primary)', color: '#fff' }}
                  title="Quick actions">
            <Plus size={18} />
          </button>
          <QuickActionsMenu open={quickOpen} onClose={() => setQuickOpen(false)} anchorRef={quickBtnRef} />
        </div>

        {/* Live clock */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium tabular-nums"
             style={{ background: 'var(--bg-hover, rgba(255,255,255,0.04))', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
          <Clock size={13} style={{ color: 'var(--text-muted)' }} />
          {timeLabel}
        </div>

        {/* Notifications */}
        <div className="relative hidden sm:block">
          <button ref={notifBtnRef}
                  onClick={() => { setNotifOpen(o => !o); setUserOpen(false); setSwitcherOpen(false); if (!notifOpen) markAllRead() }}
                  className="relative w-10 h-10 flex items-center justify-center rounded-full transition-colors"
                  style={{ background: 'var(--bg-hover, rgba(255,255,255,0.04))', color: 'var(--text-secondary)' }}>
            <Bell size={17} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{ background: 'var(--negative-red)', color: '#fff' }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <DropdownPortal open={notifOpen} anchorRef={notifBtnRef} onClose={() => setNotifOpen(false)} width={320}>
            <div className="rounded-xl shadow-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Notifications</p>
                {alerts.length > 0 && (
                  <button onClick={markAllRead} className="text-[11px] font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--accent-purple-light)' }}>
                    Mark all read
                  </button>
                )}
              </div>

              {alerts.length === 0 ? (
                <p className="text-xs px-4 py-6 text-center" style={{ color: 'var(--text-muted)' }}>No notifications yet</p>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  {alerts.map(a => {
                    const meta  = RULE_META[a.rule_type] || RULE_META.daily_loss
                    const color = SEVERITY_COLOR[a.severity] || 'var(--text-muted)'
                    return (
                      <div key={a.id} onClick={() => { setNotifOpen(false); navigate('/trado-ai-2') }}
                           className="group flex items-start gap-2.5 px-4 py-3 cursor-pointer transition-colors hover:bg-white/[0.03]"
                           style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <meta.icon size={12} style={{ color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{a.title}</p>
                          <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{a.message}</p>
                          <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{timeAgo(a.created_at)}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); dismissAlert(a.id) }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 w-5 h-5 rounded flex items-center justify-center"
                                style={{ color: 'var(--text-muted)' }}>
                          <X size={12} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              <button onClick={() => { setNotifOpen(false); navigate('/trado-ai-2') }}
                      className="w-full text-center py-2.5 text-[11px] font-medium hover:opacity-80 transition-opacity"
                      style={{ color: 'var(--accent-purple-light)', borderTop: alerts.length ? '1px solid var(--border-subtle)' : 'none' }}>
                View all in AI Alerts
              </button>
            </div>
          </DropdownPortal>
        </div>

        {/* User menu */}
        <div className="relative">
          <button ref={userBtnRef}
                  onClick={() => { setUserOpen(o => !o); setNotifOpen(false); setSwitcherOpen(false) }}
                  className="flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 rounded-full transition-colors hover:opacity-90">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
                 style={{ background: 'var(--gradient-primary)' }}>{initial}</div>
            <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
          </button>

          <DropdownPortal open={userOpen} anchorRef={userBtnRef} onClose={() => setUserOpen(false)} width={192}>
            <div className="rounded-xl overflow-hidden shadow-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{displayName}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Trader</p>
              </div>
              {[
                { icon: User,     label: 'Profile',  action: () => navigate('/settings') },
                { icon: Settings, label: 'Settings', action: () => navigate('/settings') },
                { icon: LogOut,   label: 'Logout',   action: handleLogout, danger: true },
              ].map(({ icon: Icon, label, action, danger }) => (
                <button key={label} onClick={() => { setUserOpen(false); action() }}
                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-black/5 transition-colors"
                        style={{ color: danger ? 'var(--negative-red)' : 'var(--text-secondary)' }}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </DropdownPortal>
        </div>
      </div>
    </header>
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  )
}