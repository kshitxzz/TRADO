import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, PenLine, RefreshCw, BarChart3 } from 'lucide-react'
import DropdownPortal from './DropdownPortal'

// Same four actions regardless of whether the connected account is manual or
// MT5 — each one just routes to the page that already knows how to handle it
// (Trades/Journal/Accounts), passing a bit of navigation state to trigger the
// right behaviour on arrival. That keeps this menu decoupled from any one
// page's trade/account data, so it renders identically everywhere the topbar
// does.
const ACTIONS = [
  { id: 'add-trade',   label: 'Add Manual Trade', icon: Plus,      path: '/trades',              state: { openAdd: true } },
  { id: 'new-journal', label: 'New Journal Entry', icon: PenLine,   path: '/journal',              state: { tab: 'pending' } },
  { id: 'sync-mt5',    label: 'Sync MT5 Account',  icon: RefreshCw, path: '/accounts',             state: { triggerSync: true } },
  { id: 'analytics',   label: 'View Analytics',    icon: BarChart3, path: '/analytics/performance' },
]

export default function QuickActionsMenu({ open, onClose, anchorRef }) {
  const navigate = useNavigate()
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (ref.current?.contains(e.target)) return
      if (anchorRef?.current?.contains(e.target)) return
      onClose()
    }
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchorRef])

  return (
    <DropdownPortal open={open} anchorRef={anchorRef} width={256} animated>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={ref}
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ duration: 0.15 }}
            className="rounded-xl overflow-hidden shadow-2xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Quick Actions</p>
            </div>
            <div className="p-1.5">
              {ACTIONS.map(({ id, label, icon: Icon, path, state }) => (
                <button
                  key={id}
                  onClick={() => { onClose(); navigate(path, state ? { state } : undefined) }}
                  className="quick-action-row w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-left transition-colors"
                >
                  <span className="quick-action-icon w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                        style={{ background: 'var(--bg-hover, rgba(255,255,255,0.04))', color: 'var(--text-secondary)' }}>
                    <Icon size={15} />
                  </span>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
                </button>
              ))}
            </div>
            <style>{`
              .quick-action-row { background: transparent; }
              .quick-action-row:hover { background: rgba(139,92,246,0.10); }
              .quick-action-row:hover .quick-action-icon {
                background: var(--gradient-primary);
                color: #fff;
              }
            `}</style>
          </motion.div>
        )}
      </AnimatePresence>
    </DropdownPortal>
  )
}