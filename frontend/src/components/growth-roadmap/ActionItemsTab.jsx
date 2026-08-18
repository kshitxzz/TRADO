import { Target, Trophy, AlertCircle } from 'lucide-react'

export default function ActionItemsTab({ items }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.14)' }}>
          <Target size={16} style={{ color: 'var(--accent-purple-light)' }} />
        </div>
        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Action Items</h3>
      </div>

      <div className="glass-card p-6">
        {items.length === 0 ? (
          <div className="text-center py-10">
            <Trophy size={32} className="mx-auto mb-4" style={{ color: 'var(--positive-green)' }} />
            <p className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>You're doing great!</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Keep up the consistent performance.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg p-4"
                style={{ background: item.priority === 'high' ? 'rgba(244,63,94,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${item.priority === 'high' ? 'rgba(244,63,94,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: item.priority === 'high' ? 'var(--negative-red)' : 'var(--warning-orange)' }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: item.priority === 'high' ? 'var(--negative-red)' : 'var(--warning-orange)' }}>{item.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}