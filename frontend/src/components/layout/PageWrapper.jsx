import { useState } from 'react'
import { motion } from 'framer-motion'
import Sidebar from './Sidebar'
import Topbar  from './Topbar'

export default function PageWrapper({ children, onSync, syncing, bgColor }) {
  // Sidebar and Topbar are siblings, not parent/child, so the "is the mobile
  // nav drawer open" state has to live here and get passed to both — Topbar
  // owns the hamburger button that opens it, Sidebar owns the drawer itself.
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: bgColor || 'var(--bg-primary)' }}>
      <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <main className="flex-1 overflow-y-auto">
          <Topbar onSync={onSync} syncing={syncing} onMobileMenuClick={() => setMobileNavOpen(true)} />
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="p-3 sm:p-4 md:p-6"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  )
}