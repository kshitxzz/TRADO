import { Rocket, TrendingUp, Compass, Star, Clock, ArrowUp } from 'lucide-react'
import { RiskBadge } from './shared'

const ICONS = { TrendingUp, Compass, Star, Clock }

export default function GrowthPathTab({ opportunities, closedCount }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.14)' }}>
          <Rocket size={16} style={{ color: 'var(--positive-green)' }} />
        </div>
        <div>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Scale-Up Opportunities</h3>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Ways to grow your trading</p>
        </div>
      </div>

      {closedCount < 10 ? (
        <div className="glass-card p-10 text-center">
          <Rocket size={26} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Not Enough Data Yet</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Log {10 - closedCount} more closed trade{10 - closedCount === 1 ? '' : 's'} to unlock growth opportunities.</p>
        </div>
      ) : opportunities.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <Rocket size={26} className="mx-auto mb-3" style={{ color: 'var(--positive-green)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No standout scale-up opportunities right now — keep building your track record.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {opportunities.map(o => {
            const Icon = ICONS[o.icon] || Rocket
            return (
              <div key={o.id} className="glass-card p-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.14)' }}>
                    <Icon size={16} style={{ color: 'var(--accent-purple-light)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{o.title}</h4>
                      <RiskBadge risk={o.risk} />
                    </div>
                    <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>{o.description}</p>
                    <div className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--positive-green)' }}>
                      <ArrowUp size={14} /> +${o.potentialPerDay}/day potential
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}