import { useState } from 'react'
import { Info } from 'lucide-react'

// Small "ⓘ" hint used next to advanced metric labels (Sharpe, Sortino,
// Kelly, Drawdown, etc.) — hover/tap reveals a short plain-English
// explanation without cluttering the card itself.
export default function InfoTip({ text, align = 'center' }) {
  const [open, setOpen] = useState(false)

  const alignStyle = align === 'right'
    ? { right: 0, left: 'auto', transform: 'none' }
    : align === 'left'
      ? { left: 0, right: 'auto', transform: 'none' }
      : { left: '50%', transform: 'translateX(-50%)' }

  return (
    <span
      className="relative inline-flex items-center flex-shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
    >
      <Info size={13} style={{ color: 'var(--text-muted)', cursor: 'help' }} />
      {open && (
        <div
          className="absolute z-50 text-xs leading-relaxed"
          style={{
            bottom: '135%', width: 216, padding: '10px 12px',
            background: '#181722', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, color: 'var(--text-secondary)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
            ...alignStyle,
          }}
        >
          {text}
        </div>
      )}
    </span>
  )
}