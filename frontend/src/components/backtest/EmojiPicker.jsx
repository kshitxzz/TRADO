import { useState } from 'react'
import { Clock } from 'lucide-react'
import { EMOJI_CATEGORIES, EMOJI_FONT } from '../../lib/backtest/emojiData'

/**
 * Emoji chooser for the stamp tool: Recent + category tabs, a fixed 9-column grid
 * and its own scroll area, so it can never collapse or overlap.
 */
export default function EmojiPicker({ recent, onPick }) {
  const [tab, setTab] = useState(recent.length ? 'recent' : 'trading')
  const cat = EMOJI_CATEGORIES.find(c => c.id === tab)
  const items = tab === 'recent' ? recent : cat?.items || []
  const title = tab === 'recent' ? 'Recently used' : cat?.name

  return (
    <div style={{ width: 340 }}>
      <div className="flex items-center px-2 pt-2 gap-0.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {[{ id: 'recent', icon: null }, ...EMOJI_CATEGORIES].map(c => (
          <button key={c.id} onClick={() => setTab(c.id)} title={c.id === 'recent' ? 'Recently used' : c.name}
                  className="flex-1 h-9 flex items-center justify-center rounded-t-md hover:bg-white/5 -mb-px"
                  style={{ borderBottom: `2px solid ${tab === c.id ? 'var(--accent-purple)' : 'transparent'}`, opacity: tab === c.id ? 1 : 0.65 }}>
            {c.id === 'recent' ? <Clock size={16} style={{ color: 'var(--text-secondary)' }} /> : <span style={{ fontSize: 17, fontFamily: EMOJI_FONT, lineHeight: 1 }}>{c.icon}</span>}
          </button>
        ))}
      </div>
      <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>{title}</p>
      <div className="px-2 pb-2 overflow-y-auto" style={{ height: 292 }}>
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>Emoji you use will show up here.</p>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(9, 1fr)' }}>
            {items.map((e, i) => (
              <button key={e + i} onClick={() => onPick(e)} className="h-[34px] flex items-center justify-center rounded-md hover:bg-white/10 transition-colors"
                      style={{ fontSize: 21, fontFamily: EMOJI_FONT, lineHeight: 1 }}>{e}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}