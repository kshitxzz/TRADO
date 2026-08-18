import { Link } from 'react-router-dom'
import {
  Wrench, Calculator, Clock, Scale, Ruler, Banknote, CalendarClock,
  ArrowRight, Loader2,
} from 'lucide-react'
import PageWrapper from '../components/layout/PageWrapper'

// Only Position Size Calculator is actually built right now — everything
// else is a placeholder so the grid communicates the roadmap without
// shipping half-finished tools. Flip `available: true` and add a `path`
// once a tool is ready.
const TOOLS = [
  {
    id: 'position-size-calculator',
    title: 'Position Size Calculator',
    description: 'Calculate optimal lot size based on your risk tolerance and stop-loss distance',
    icon: Calculator,
    badge: 'POPULAR',
    path: '/tools/position-size-calculator',
    available: true,
  },
  {
    id: 'market-hours',
    title: 'Forex Market Hours',
    description: 'Track real-time trading sessions and find the best times to trade forex pairs',
    icon: Clock,
    available: false,
  },
  {
    id: 'risk-reward-calculator',
    title: 'Risk/Reward Calculator',
    description: "Work out risk-to-reward ratios for a setup before you ever enter the trade",
    icon: Scale,
    available: false,
  },
  {
    id: 'pip-value-calculator',
    title: 'Pip Value Calculator',
    description: 'Calculate pip values across currency pairs, lot sizes, and account currencies',
    icon: Ruler,
    available: false,
  },
  {
    id: 'margin-calculator',
    title: 'Margin Calculator',
    description: "Determine the margin required to open a position at your broker's leverage",
    icon: Banknote,
    available: false,
  },
  {
    id: 'economic-calendar',
    title: 'Economic Calendar',
    description: 'Stay ahead of high-impact news events that tend to move the markets',
    icon: CalendarClock,
    available: false,
  },
]

export default function Tools() {
  const availableCount  = TOOLS.filter(t => t.available).length
  const comingSoonCount = TOOLS.length - availableCount

  return (
    <PageWrapper>
      <style>{`
        .tool-card { transition: border-color 220ms ease, box-shadow 220ms ease, transform 220ms ease; }
        .tool-card:hover {
          border-color: var(--accent-purple);
          box-shadow: 0 0 0 1px var(--accent-purple), 0 12px 32px rgba(139,92,246,0.22);
          transform: translateY(-2px);
        }
        .tool-card:hover .tool-card-title { color: var(--accent-purple-light); }
        .tool-card:hover .tool-card-icon-wrap { background: rgba(139,92,246,0.22) !important; }
      `}</style>

      <div className="glass-card p-5 mb-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--gradient-primary)' }}>
            <Wrench size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Trading Tools</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Professional calculators and utilities to enhance your trading workflow</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="rounded-xl px-4 py-2.5 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-lg font-bold leading-tight" style={{ color: 'var(--accent-purple-light)' }}>{availableCount}</p>
            <p className="text-[10px] font-medium tracking-wide" style={{ color: 'var(--text-muted)' }}>AVAILABLE</p>
          </div>
          <div className="rounded-xl px-4 py-2.5 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-lg font-bold leading-tight" style={{ color: 'var(--text-secondary)' }}>{comingSoonCount}</p>
            <p className="text-[10px] font-medium tracking-wide" style={{ color: 'var(--text-muted)' }}>COMING SOON</p>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {TOOLS.map(tool => {
          const Icon = tool.icon
          if (tool.available) {
            return (
              <Link key={tool.id} to={tool.path}
                    className="tool-card glass-card p-5 flex flex-col group">
                <div className="flex items-start justify-between mb-4">
                  <div className="tool-card-icon-wrap w-11 h-11 rounded-xl flex items-center justify-center transition-colors"
                       style={{ background: 'rgba(139,92,246,0.14)' }}>
                    <Icon size={20} style={{ color: 'var(--accent-purple-light)' }} />
                  </div>
                  {tool.badge && (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full tracking-wide"
                          style={{ background: 'rgba(139,92,246,0.14)', border: '1px solid rgba(139,92,246,0.3)', color: 'var(--accent-purple-light)' }}>
                      {tool.badge}
                    </span>
                  )}
                </div>
                <h3 className="tool-card-title font-semibold text-base mb-1.5 transition-colors" style={{ color: 'var(--text-primary)' }}>
                  {tool.title}
                </h3>
                <p className="text-xs leading-relaxed flex-1" style={{ color: 'var(--text-muted)' }}>
                  {tool.description}
                </p>
                <div className="mt-4 pt-4 flex items-center gap-1.5 text-sm font-semibold" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--accent-purple-light)' }}>
                  Open Tool <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            )
          }
          return (
            <div key={tool.id} className="glass-card p-5 flex flex-col opacity-50">
              <div className="flex items-start justify-between mb-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <Icon size={20} style={{ color: 'var(--text-muted)' }} />
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full tracking-wide"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  COMING SOON
                </span>
              </div>
              <h3 className="font-semibold text-base mb-1.5" style={{ color: 'var(--text-secondary)' }}>{tool.title}</h3>
              <p className="text-xs leading-relaxed flex-1" style={{ color: 'var(--text-muted)' }}>{tool.description}</p>
              <div className="mt-4 pt-4 flex items-center gap-1.5 text-xs font-medium" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-muted)' }} /> In Development
              </div>
            </div>
          )
        })}
      </div>

      <div className="glass-card p-5 mt-5 flex items-center gap-3">
        <Loader2 size={18} className="animate-spin-slow flex-shrink-0" style={{ color: 'var(--accent-purple-light)' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>More Tools Coming</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>We're building more powerful trading utilities — check back soon for updates.</p>
        </div>
      </div>
    </PageWrapper>
  )
}