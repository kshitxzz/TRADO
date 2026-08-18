import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, LayoutDashboard, TrendingUp, BookOpen, Wallet, BarChart3, Download,
  FileText, CalendarDays, Clock, Play, Sparkles, Brain, Target, Share2,
  Settings, CreditCard, ArrowRight, Plus, PenLine, RefreshCw, ArrowUp, ArrowDown, CornerDownLeft,
  Wrench, Calculator,
} from 'lucide-react'

// ── Command list ──────────────────────────────────────────────────────────────
// Static, data-free by design: every entry is either a page to jump to or a
// quick action to run, so this never needs to fetch trades/journal data just
// to render. Mirrors the grouping style from the reference recording (MAIN /
// ANALYTICS / SETTINGS-style sections), adapted to Trado's own pages.
function useCommandGroups(navigate, onClose) {
  return useMemo(() => {
    const go = (path, state) => () => { navigate(path, state ? { state } : undefined); onClose() }

    return [
      {
        section: 'Quick Actions',
        items: [
          { id: 'add-trade',   label: 'Add Manual Trade', desc: 'Log a new trade to your journal',        icon: Plus,      run: go('/trades', { openAdd: true }) },
          { id: 'new-journal', label: 'New Journal Entry', desc: 'Write up a pending trade',                icon: PenLine,   run: go('/journal', { tab: 'pending' }) },
          { id: 'sync-mt5',    label: 'Sync MT5 Account',  desc: 'Pull in the latest trades from your broker', icon: RefreshCw, run: go('/accounts', { triggerSync: true }) },
          { id: 'view-analytics', label: 'View Analytics', desc: 'Jump to your performance breakdown',      icon: BarChart3, run: go('/analytics/performance') },
        ],
      },
      {
        section: 'Main',
        items: [
          { id: 'dashboard', label: 'Dashboard', desc: 'View your trading overview and stats',  icon: LayoutDashboard, run: go('/dashboard') },
          { id: 'trades',    label: 'Trades',    desc: 'View and manage all your trades',        icon: TrendingUp,      run: go('/trades') },
          { id: 'journal',   label: 'Journal',   desc: 'Write and review your trade journal entries', icon: BookOpen,    run: go('/journal') },
          { id: 'accounts',  label: 'Broker Hub',  desc: 'Manage broker connections and account settings', icon: Wallet,   run: go('/accounts') },
        ],
      },
      {
        section: 'Analytics',
        items: [
          { id: 'performance',       label: 'Performance Analysis', desc: 'Analyze your trading performance metrics', icon: BarChart3,   run: go('/analytics/performance') },
          { id: 'reports',           label: 'Reports',              desc: 'Download and review trade reports',        icon: Download,    run: go('/analytics/reports') },
          { id: 'advanced-reports',  label: 'Advanced Reports',     desc: 'Deep dive into detailed analytics breakdowns', icon: FileText, run: go('/analytics/advanced-reports') },
          { id: 'day-view',          label: 'Day View',             desc: 'See your trades laid out by day',           icon: CalendarDays, run: go('/analytics/day-view') },
          { id: 'sessions',          label: 'Sessions',             desc: 'Analyze performance by trading session',    icon: Clock,       run: go('/analytics/sessions') },
          { id: 'trade-replay',      label: 'Trade Replay',         desc: 'Replay past trades step by step',           icon: Play,        run: go('/analytics/trade-replay') },
          { id: 'ai-analysis',       label: 'AI Analysis',          desc: 'Get AI-powered insight on your trading',    icon: Sparkles,    run: go('/trado-ai') },
          { id: 'trado-ai-2',        label: 'Trado AI 2.0',         desc: 'Chat with your AI trading coach',           icon: Brain,       run: go('/trado-ai-2') },
        ],
      },
      {
        section: 'Growth',
        items: [
          { id: 'growth-roadmap', label: 'Growth Roadmap', desc: 'Track XP, milestones, and rank progress', icon: Target,  run: go('/progress') },
          { id: 'share-cards',    label: 'Share Cards',    desc: 'Create shareable trade performance cards', icon: Share2, run: go('/share-cards') },
        ],
      },
      {
        section: 'Tools',
        items: [
          { id: 'tools',                     label: 'Trading Tools',           desc: 'Browse calculators and trading utilities', icon: Wrench,     run: go('/tools') },
          { id: 'position-size-calculator',  label: 'Position Size Calculator', desc: 'Calculate optimal lot size based on risk', icon: Calculator, run: go('/tools/position-size-calculator') },
        ],
      },
      {
        section: 'Settings',
        items: [
          { id: 'settings', label: 'Settings', desc: 'Configure app settings and connections', icon: Settings,    run: go('/settings') },
          { id: 'pricing',  label: 'Pricing',   desc: 'Manage your subscription plan',          icon: CreditCard,  run: go('/pricing') },
        ],
      },
    ]
  }, [navigate, onClose])
}

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const [query, setQuery]           = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef  = useRef(null)
  const listRef   = useRef(null)
  const itemRefs  = useRef([])

  const groups = useCommandGroups(navigate, onClose)

  // Reset + autofocus every time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      const id = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(id)
    }
  }, [open])

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map(g => ({
        ...g,
        items: g.items.filter(it =>
          it.label.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.items.length > 0)
  }, [groups, query])

  const flatItems = useMemo(() => filteredGroups.flatMap(g => g.items), [filteredGroups])

  // Keep the active index in range whenever the filtered list changes.
  useEffect(() => { setActiveIndex(0) }, [query])

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(i => (flatItems.length ? (i + 1) % flatItems.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex(i => (flatItems.length ? (i - 1 + flatItems.length) % flatItems.length : 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        flatItems[activeIndex]?.run()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, flatItems, activeIndex, onClose])

  if (!open) return null

  let runningIndex = -1

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-start justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', paddingTop: '10vh' }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -10 }}
          transition={{ type: 'spring', damping: 30, stiffness: 360 }}
          className="w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', maxHeight: '70vh' }}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)', height: 58 }}>
            <Search size={17} style={{ color: 'var(--text-muted)' }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search pages, trades, or symbols…"
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--text-primary)' }}
            />
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0"
                  style={{ background: 'var(--bg-hover, rgba(255,255,255,0.04))', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              ESC
            </span>
          </div>

          {/* Results */}
          <div ref={listRef} className="overflow-y-auto flex-1 px-2 py-2">
            {flatItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                <Search size={30} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  No results found for &ldquo;{query}&rdquo;
                </p>
              </div>
            ) : (
              filteredGroups.map(group => (
                <div key={group.section} className="mb-1.5 last:mb-0">
                  <p className="px-2.5 pt-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    {group.section}
                  </p>
                  {group.items.map(item => {
                    runningIndex += 1
                    const idx = runningIndex
                    const isActive = idx === activeIndex
                    const Icon = item.icon
                    return (
                      <button
                        key={item.id}
                        ref={el => (itemRefs.current[idx] = el)}
                        onClick={item.run}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-left transition-colors"
                        style={isActive
                          ? { background: 'rgba(139,92,246,0.14)', border: '1px solid rgba(139,92,246,0.5)' }
                          : { background: 'transparent', border: '1px solid transparent' }}
                      >
                        <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                              style={isActive
                                ? { background: 'var(--gradient-primary)', color: '#fff' }
                                : { background: 'var(--bg-hover, rgba(255,255,255,0.04))', color: 'var(--text-secondary)' }}>
                          <Icon size={16} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{item.label}</span>
                          <span className="block text-xs truncate" style={{ color: 'var(--text-muted)' }}>{item.desc}</span>
                        </span>
                        <ArrowRight size={14} className="flex-shrink-0 transition-opacity"
                                    style={{ color: 'var(--accent-purple-light)', opacity: isActive ? 1 : 0 }} />
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer hints */}
          <div className="flex items-center gap-3 px-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border-subtle)', height: 42, background: 'var(--bg-hover, rgba(255,255,255,0.02))' }}>
            <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
              <Kbd><ArrowUp size={10} /></Kbd><Kbd><ArrowDown size={10} /></Kbd> Navigate
            </span>
            <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
              <Kbd><CornerDownLeft size={10} /></Kbd> Select
            </span>
            <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
              <Kbd>Esc</Kbd> Close
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function Kbd({ children }) {
  return (
    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', minWidth: 18 }}>
      {children}
    </span>
  )
}